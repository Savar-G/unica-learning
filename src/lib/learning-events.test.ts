import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { learningEvents, type NewLearningEvent } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { backfillAssessment } from "@/lib/learning-events-assessment-store";
import { learningEventStore } from "@/lib/learning-events-store";

vi.mock("server-only", () => ({}));

// The learning events (#302, spec #295) through the module's interface, over both stores: an append is kept as written
// and read back by child and time range; a retry of the same event stores one event. The Supabase adapter talks to a
// fake PostgREST that keeps the rows and applies each request's filters, its order and its range.

const PARENT = "00000000-0000-4000-8000-0000000000a1";
const CHILD = "00000000-0000-4000-8000-0000000000c1";
const WORKBOOK = "00000000-0000-4000-8000-0000000000b1";
const OTHER_CHILD = "00000000-0000-4000-8000-0000000000c2";
const TEST = "00000000-0000-4000-8000-0000000000e1";
const FENCED_PARENT = "00000000-0000-4000-8000-0000000000a2";
const FENCED_CHILD = "00000000-0000-4000-8000-0000000000c3";
const DAY = { from: "2026-10-29T00:00:00.000Z", to: "2026-10-30T00:00:00.000Z" };

/** A call on page 3, question 2 of a workbook: right after one hint. */
const callEvent = (over: Partial<NewLearningEvent> = {}): NewLearningEvent => ({
  key: "call:1:p3q2",
  parentId: PARENT,
  childId: CHILD,
  source: "call",
  question: { source: "workbook", workbookId: WORKBOOK, page: 3, question: 2 },
  skill: { standard: "2.4", skills: [] },
  result: "right_with_help",
  stuckStep: "tens",
  mistake: null,
  hints: 1,
  timeMs: 95_000,
  occurredAt: "2026-10-29T16:05:00.000Z",
  evidence: { kind: "call", id: "call-1" },
  ...over,
});

/** The families both stores know: a child under its parent, and a family whose deletion is requested. */
const FAMILIES = {
  children: [{ id: CHILD, parentId: PARENT }, { id: OTHER_CHILD, parentId: PARENT }, { id: FENCED_CHILD, parentId: FENCED_PARENT }],
  tests: [{ id: TEST, childId: CHILD }],
  deleting: [FENCED_PARENT],
};
const UUID_COLUMNS = ["parent_id", "child_id", "workbook_id", "assessment_id"];

/**
 * A fake PostgREST with one table, public.learning_events, that keeps the database's rules: a stored idempotency key
 * refuses an insert (409, code 23505, the unique constraint), a child that is not under the parent refuses it (409,
 * 23503, the foreign key), and so does a family being deleted (400, 55000, the family write fence). Reads apply eq, gte
 * and lt filters, the order and the offset and limit. Ids and times come back as Postgres writes them (lower case,
 * "+00:00"), not as they were sent; uuid filters ignore case, as a uuid column does. Other tables are read only.
 */
function fakeDb(tables: Record<string, Record<string, unknown>[]> = {}, { beforeRead }: { beforeRead?: (read: number) => Promise<void> } = {}) {
  const rows: Record<string, unknown>[] = [];
  let reads = 0;
  let next = 0;
  const pg = (iso: unknown) => (typeof iso === "string" ? new Date(iso).toISOString().replace(".000Z", "+00:00").replace("Z", "+00:00") : iso);
  const db = createClient("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.replace("/rest/v1/", "");
    if (table !== "learning_events" && !(table in tables && init?.method === "GET")) throw new Error(`unexpected request ${url.pathname}`);
    const accept = new Headers(init?.headers).get("Accept") === "application/vnd.pgrst.object+json";
    const answer = (found: Record<string, unknown>[]) => (accept ? Response.json(found[0]) : Response.json(found));
    if (init?.method === "POST") {
      const row = JSON.parse(String(init.body));
      for (const column of UUID_COLUMNS) if (typeof row[column] === "string") row[column] = row[column].toLowerCase();
      if (FAMILIES.deleting.includes(row.parent_id)) return Response.json({ code: "55000", message: "family_unavailable" }, { status: 400 });
      if (!FAMILIES.children.some((c) => c.id === row.child_id && c.parentId === row.parent_id)) {
        return Response.json({ code: "23503", message: "insert or update on table \"learning_events\" violates foreign key constraint" }, { status: 409 });
      }
      if (row.assessment_id !== null && !FAMILIES.tests.some((t) => t.id === row.assessment_id && t.childId === row.child_id)) {
        return Response.json({ code: "23503", message: "insert or update on table \"learning_events\" violates foreign key constraint" }, { status: 409 });
      }
      if (rows.some((r) => r.idempotency_key === row.idempotency_key)) {
        return Response.json({ code: "23505", message: "duplicate key value violates unique constraint" }, { status: 409 });
      }
      const stored = { ...row, id: `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`, occurred_at: pg(row.occurred_at), created_at: pg(new Date().toISOString()) };
      rows.push(stored);
      return answer([stored]);
    }
    if (init?.method === "GET") {
      if (table === "learning_events" && beforeRead) await beforeRead(++reads);
      let found = table === "learning_events" ? [...rows] : [...tables[table]];
      for (const [column, test] of url.searchParams) {
        if (["select", "order", "offset", "limit"].includes(column)) continue;
        const [op, ...rest] = test.split(".");
        const value = rest.join(".");
        const at = (r: Record<string, unknown>) => Date.parse(String(r[column]));
        const same = (r: Record<string, unknown>) => (UUID_COLUMNS.includes(column) ? String(r[column]).toLowerCase() === value.toLowerCase() : String(r[column]) === value);
        if (op === "eq") found = found.filter(same);
        else if (op === "gte") found = found.filter((r) => at(r) >= Date.parse(value));
        else if (op === "lt") found = found.filter((r) => at(r) < Date.parse(value));
        else throw new Error(`unexpected filter ${column}=${test}`);
      }
      const order = url.searchParams.get("order");
      if (table !== "learning_events") return answer(found);
      if (order !== null && order !== "occurred_at.asc,id.asc") throw new Error(`unexpected order ${url.search}`);
      found.sort((a, b) => Date.parse(String(a.occurred_at)) - Date.parse(String(b.occurred_at)) || String(a.id).localeCompare(String(b.id)));
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? Infinity);
      return answer(found.slice(offset, offset + limit));
    }
    throw new Error(`unexpected ${init?.method} ${url.search}`);
  } } });
  return db;
}

const fakePostgrest = (pageSize: number) => learningEvents(learningEventStore(fakeDb(), { pageSize }));

describe("a range read in the Supabase store while events are added", () => {
  it("still gives the events in time order", async () => {
    let addDuringRead: () => Promise<void> = async () => {};
    const db = fakeDb({}, { beforeRead: async (read) => { if (read === 2) await addDuringRead(); } });
    const events = learningEvents(learningEventStore(db, { pageSize: 2 }));
    const at = (second: number) => `2026-10-29T16:05:${String(second).padStart(2, "0")}.000Z`;
    for (const second of [20, 40, 50]) await events.append(callEvent({ key: `call:${second}`, occurredAt: at(second) }));
    addDuringRead = async () => {
      addDuringRead = async () => {};
      for (const second of [10, 30]) await events.append(callEvent({ key: `call:${second}`, occurredAt: at(second) }));
    };
    const read = await events.read(CHILD, DAY);
    const times = read.map((e) => e.occurredAt);
    expect(times).toEqual([...times].sort());
    expect(times).toEqual(expect.arrayContaining([at(20), at(40), at(50)]));
  });
});

function memory() {
  return learningEvents(memoryLearningEventStore(FAMILIES));
}

describe.each([["Supabase", () => fakePostgrest(2)], ["in-memory", memory]] as const)("learning events in the %s store", (_, open) => {
  it("reads back an appended event, as written, by child and time range", async () => {
    const events = open();
    const appended = await events.append(callEvent());
    expect(appended).toEqual({ ok: true, created: true, event: { ...callEvent(), id: expect.any(String) } });

    const read = await events.read(CHILD, { from: "2026-10-29T00:00:00.000Z", to: "2026-10-30T00:00:00.000Z" });
    expect(read).toEqual([{ ...callEvent(), id: appended.ok && appended.event.id }]);
  });

  it("stores one event for a retry with the same idempotency key, and gives back the stored one", async () => {
    const events = open();
    const first = await events.append(callEvent());
    const retry = await events.append(callEvent());
    expect(retry).toEqual({ ok: true, created: false, event: first.ok && first.event });
    expect(await events.read(CHILD, DAY)).toHaveLength(1);
  });

  it("refuses a key reused for a different event, and keeps the first", async () => {
    const events = open();
    const first = await events.append(callEvent());
    const other = await events.append(callEvent({ result: "wrong", mistake: "O3", stuckStep: null }));
    expect(other).toEqual({ ok: false, error: "key_conflict", event: first.ok && first.event });
    expect(await events.read(CHILD, DAY)).toEqual([first.ok && first.event]);
  });

  it("reads one child's events from the range start up to its end, oldest first, past a page of rows", async () => {
    const events = open();
    const at = ["2026-10-29T09:00:00.000Z", "2026-10-28T23:59:59.999Z", "2026-10-29T00:00:00.000Z", "2026-10-30T00:00:00.000Z", "2026-10-29T12:30:00.000Z", "2026-10-29T23:59:59.999Z"];
    for (const [i, occurredAt] of at.entries()) await events.append(callEvent({ key: `call:${i}`, occurredAt }));
    await events.append(callEvent({ key: "other-child", childId: OTHER_CHILD, occurredAt: "2026-10-29T10:00:00.000Z" }));

    const read = await events.read(CHILD, DAY);
    expect(read.map((e) => e.occurredAt)).toEqual(["2026-10-29T00:00:00.000Z", "2026-10-29T09:00:00.000Z", "2026-10-29T12:30:00.000Z", "2026-10-29T23:59:59.999Z"]);
    expect(await events.read(OTHER_CHILD, DAY)).toEqual([expect.objectContaining({ key: "other-child" })]);
  });

  it("keeps a time written with an offset in UTC, so a retry written either way is the same event", async () => {
    const events = open();
    const first = await events.append(callEvent({ occurredAt: "2026-10-29T18:05:00+02:00" }));
    expect(first).toEqual({ ok: true, created: true, event: expect.objectContaining({ occurredAt: "2026-10-29T16:05:00.000Z" }) });
    expect(await events.append(callEvent({ occurredAt: "2026-10-29T16:05:00Z" }))).toEqual({ ok: true, created: false, event: first.ok && first.event });
  });

  it.each<[string, Partial<NewLearningEvent>]>([
    ["an empty key", { key: "" }],
    ["a child id that is not an id", { childId: "child-1" }],
    ["an unknown source", { source: "scan" as NewLearningEvent["source"] }],
    ["an unknown result", { result: "half" as NewLearningEvent["result"] }],
    ["an assessment event on a workbook question", { source: "assessment" }],
    ["page 0", { question: { source: "workbook", workbookId: WORKBOOK, page: 0, question: 1 } }],
    ["a question number that is not whole", { question: { source: "workbook", workbookId: WORKBOOK, page: 1, question: 1.5 } }],
    ["an assessment question with no question id", { question: { source: "assessment", assessmentId: WORKBOOK, questionId: "" } }],
    ["a standard the BC map does not have", { skill: { standard: "2.99", skills: [] } }],
    ["a skill the BC map does not have", { skill: { standard: "2.4", skills: ["2.4-no-such-skill"] } }],
    ["a mistake on a right answer", { result: "right", stuckStep: null, mistake: "O3" }],
    ["a stuck step on a right answer with no help", { result: "right", stuckStep: "tens" }],
    ["negative hints", { hints: -1 }],
    ["a time spent longer than a day", { timeMs: 86_400_001 }],
    ["a time with no time zone", { occurredAt: "2026-10-29T16:05:00" }],
    ["a time that is not a date", { occurredAt: "yesterday" }],
    ["evidence with no id", { evidence: { kind: "call", id: "" } }],
  ])("refuses %s and stores nothing", async (_, over) => {
    const events = open();
    expect(await events.append(callEvent(over))).toEqual({ ok: false, error: "invalid", reason: expect.any(String) });
    expect(await events.read(over.childId ?? CHILD, DAY)).toEqual([]);
  });

  it("keeps a wrong answer's mistake and a blank's stuck step", async () => {
    const events = open();
    const wrong = callEvent({ key: "marking:1", source: "marking", result: "wrong", mistake: "O3", stuckStep: "tens", hints: 0, timeMs: null, evidence: { kind: "scan", id: "scan-1" } });
    const blank = callEvent({ key: "call:2", result: "blank", stuckStep: "ones", hints: 2 });
    expect(await events.append(wrong)).toEqual({ ok: true, created: true, event: { ...wrong, id: expect.any(String) } });
    expect(await events.append(blank)).toEqual({ ok: true, created: true, event: { ...blank, id: expect.any(String) } });
  });

  it("keeps ids in lower case, so a retry or a read with upper-case ids finds the same event", async () => {
    const events = open();
    const upper = callEvent({ parentId: PARENT.toUpperCase(), childId: CHILD.toUpperCase(), question: { source: "workbook", workbookId: WORKBOOK.toUpperCase(), page: 3, question: 2 } });
    const first = await events.append(upper);
    expect(first).toEqual({ ok: true, created: true, event: { ...callEvent(), id: expect.any(String) } });
    expect(await events.append(upper)).toEqual({ ok: true, created: false, event: first.ok && first.event });
    expect(await events.read(CHILD.toUpperCase(), DAY)).toEqual([first.ok && first.event]);
  });

  it("refuses an event for a child of another parent, on another child's test, and for a family being deleted", async () => {
    const events = open();
    expect(await events.append(callEvent({ childId: FENCED_CHILD }))).toEqual({ ok: false, error: "family_refused", reason: expect.any(String) });
    expect(await events.append(callEvent({ key: "fenced", parentId: FENCED_PARENT, childId: FENCED_CHILD }))).toEqual({ ok: false, error: "family_refused", reason: expect.any(String) });
    const otherChildsTest = callEvent({ key: "other-test", childId: OTHER_CHILD, source: "assessment", question: { source: "assessment", assessmentId: TEST, questionId: "s1-1" }, stuckStep: null, result: "right" });
    expect(await events.append(otherChildsTest)).toEqual({ ok: false, error: "family_refused", reason: expect.any(String) });
    expect(await events.read(FENCED_CHILD, DAY)).toEqual([]);
    expect(await events.read(OTHER_CHILD, DAY)).toEqual([]);
  });

  it("refuses a range that does not end after it starts", async () => {
    const events = open();
    await expect(events.read(CHILD, { from: DAY.to, to: DAY.from })).rejects.toThrow(RangeError);
    await expect(events.read(CHILD, { from: "never", to: DAY.to })).rejects.toThrow(RangeError);
  });
});

describe("the backfill of one test from the database", () => {
  const test = (status: string) => ({ id: TEST, parent_id: PARENT, child_id: CHILD, status });
  const answers = [
    { id: "00000000-0000-4000-8000-000000000101", assessment_id: TEST, position: 1, question_id: "s1-1", template_id: "2-add-2-digit", response: "85", correct: true, misconception: null, time_ms: 21_000, answered_at: "2026-10-29T15:00:21+00:00", created_at: "2026-10-29T15:00:22+00:00" },
    { id: "00000000-0000-4000-8000-000000000102", assessment_id: TEST, position: 2, question_id: "s1-2", template_id: "2-subtract-2-digit", response: "43", correct: false, misconception: "O1", time_ms: 30_000, answered_at: null, created_at: "2026-10-29T15:01:00+00:00" },
  ];

  it("writes the events of a finished test's answers, and none on a second run", async () => {
    const db = fakeDb({ assessments: [test("completed")], answers });
    expect(await backfillAssessment(db, TEST)).toEqual({ appended: 2, alreadyStored: 0, skipped: [] });
    expect(await backfillAssessment(db, TEST)).toEqual({ appended: 0, alreadyStored: 2, skipped: [] });
    const read = await learningEvents(learningEventStore(db)).read(CHILD, DAY);
    expect(read.map((e) => [e.key, e.result, e.mistake, e.occurredAt])).toEqual([
      ["assessment-answer:00000000-0000-4000-8000-000000000101", "right", null, "2026-10-29T15:00:21.000Z"],
      ["assessment-answer:00000000-0000-4000-8000-000000000102", "wrong", "O1", "2026-10-29T15:01:00.000Z"],
    ]);
  });

  it("writes nothing for a test that is not finished", async () => {
    const db = fakeDb({ assessments: [test("in_progress")], answers });
    expect(await backfillAssessment(db, TEST)).toBeNull();
    expect(await learningEvents(learningEventStore(db)).read(CHILD, DAY)).toEqual([]);
  });
});
