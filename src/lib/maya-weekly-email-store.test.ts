import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { dueWeeklyEmails } from "@/lib/maya-weekly-email";
import { parentUnsubscribed, unsubscribe, unsubscribeState } from "@/lib/reminder-store";
import { hashToken } from "@/lib/sign-in-link";
import { mayaWeeklyStore } from "@/lib/maya-weekly-email-store";

vi.mock("server-only", () => ({}));

// The weekly Maya email's Supabase store (#332, review of PR #421): PostgREST answers at most 1,000 rows per request
// (max-rows), so every read the run needs must page. The fake below keeps the tables in memory, applies the filters,
// the order and the range of each request, and never answers more than MAX_ROWS rows.
const MAX_ROWS = 1000;
type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>, afterPage?: (table: string, page: Row[], url: URL) => void) {
  tables.maya_calls ??= (tables.maya_call_notes ?? []).map((n) => ({ id: n.call_id, parent_id: n.parent_id, child_id: n.child_id, ended_at: n.call_ended_at, status: "ended", note_pending: null, kind: "family" }));
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop()!;
    if (init?.method === "POST") {
      const row = JSON.parse(String(init.body));
      const rows = tables[table] ??= [];
      if (rows.some((r) => r.parent_id === row.parent_id && r.kind === row.kind)) return Response.json({ code: "23505", message: "duplicate" }, { status: 409 });
      rows.push({ id: `inserted-${rows.length}`, ...row });
      return new Response(null, { status: 201 });
    }
    let rows = [...(tables[table] ?? [])];
    for (const [key, raw] of url.searchParams) {
      if (["select", "order", "offset", "limit"].includes(key)) continue;
      if (key === "or") {
        const match = /^\((\w+)\.gt\.([^,]+),and\(\1\.eq\.([^,]+),(\w+)\.gt\.([^)]+)\)\)$/.exec(raw);
        if (!match) throw new Error(`fake db: unsupported or ${raw}`);
        const [, time, after, equal, id, lastId] = match;
        rows = rows.filter((r) => String(r[time]) > after || (String(r[time]) === equal && String(r[id]) > lastId));
        continue;
      }
      const dot = raw.indexOf(".");
      const op = raw.slice(0, dot);
      const value = raw.slice(dot + 1);
      if (op === "eq") rows = rows.filter((r) => String(r[key]) === value);
      else if (op === "gt") rows = rows.filter((r) => r[key] != null && String(r[key]) > value);
      else if (op === "gte") rows = rows.filter((r) => r[key] != null && String(r[key]) >= value);
      else if (op === "ov") {
        const ids = value.slice(1, -1).split(",");
        rows = rows.filter((r) => Array.isArray(r[key]) && (r[key] as string[]).some((id) => ids.includes(id)));
      }
      else if (op === "in") {
        const set = new Set(value.slice(1, -1).split(",").map((v) => v.replace(/^"|"$/g, "")));
        rows = rows.filter((r) => set.has(String(r[key])));
      } else throw new Error(`fake db: no ${op} filter`);
    }
    const order = url.searchParams.get("order");
    if (order) {
      const keys = order.split(",").map((k) => k.split(".")[0]);
      rows.sort((a, b) => {
        for (const k of keys) {
          const c = String(a[k]).localeCompare(String(b[k]));
          if (c) return c;
        }
        return 0;
      });
    }
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? MAX_ROWS), MAX_ROWS);
    const page = rows.slice(offset, offset + limit);
    afterPage?.(table, page, url);
    return new Response(init?.method === "HEAD" ? null : JSON.stringify(page), { headers: { "content-type": "application/json", "content-range": `${offset}-${offset + page.length - 1}/${rows.length}` } });
  };
  return createClient<Database>("https://fixture.invalid", "synthetic-key", { global: { fetch }, auth: { persistSession: false } });
}

/** 2026-11-02 at hh:mm in Vancouver (permanent PDT, UTC-7). */
const pdt = (day: number, hh: number, mm = 0, ss = 0) => Date.UTC(2026, 10, day, hh + 7, mm, ss);
const NOW = pdt(9, 8);

function noteRow(callId: string, parentId: string, childId: string, endedAt: number): Row {
  return {
    call_id: callId, parent_id: parentId, child_id: childId, note_version: 1,
    call_ended_at: new Date(endedAt).toISOString(), created_at: new Date(endedAt + 1000).toISOString(),
    facts: {}, sentences: ["{child} called Maya."], warm: null, writer: "code", model: null, prompt_version: null, transcript: [],
  };
}

const parent = (id: string) => ({ id, name: `Parent ${id}`, email: `${id}@family.ca`, postal: "V3S 1A1" });
const child = (id: string, parentId: string) => ({ id, parent_id: parentId, first_name: `Child ${id}` });
const dayBefore = (n: number) => new Date(Date.UTC(2026, 9, 31) - n * 24 * 60 * 60_000).toISOString().slice(0, 10);

describe("the weekly Maya email store under the 1,000-row limit", () => {
  it("reads only recent call coverage, the current slot and unsubscribe state, while keeping audit rows", async () => {
    const log: Row[] = Array.from({ length: 1200 }, (_, i) => ({ id: `old-${i}`, parent_id: "p1", kind: "maya_weekly", week_start: dayBefore(i), status: "sent", attempts: 1, call_ids: [`old-call-${i}`] }));
    log.push(
      { id: "coverage", parent_id: "p1", kind: "maya_weekly", week_start: "2020-01-06", status: "claimed", attempts: 1, call_ids: ["call-1", "call-99"] },
      { id: "slot", parent_id: "p1", kind: "maya_weekly", week_start: "2026-11-02", status: "failed", attempts: 2, call_ids: ["old-call"] },
      { id: "refused", parent_id: "p1", kind: "maya_weekly", week_start: "2020-01-13", status: "failed", attempts: 1, call_ids: ["call-2"] },
      { id: "unsubscribe", parent_id: "p1", kind: "maya_unsubscribe", week_start: null, status: null, attempts: 0 },
    );
    const returned: string[] = [];
    const notes = Array.from({ length: 101 }, (_, i) => noteRow(`call-${i + 1}`, "p1", "c1", pdt(2, 15)));
    const db = fakeDb({ maya_call_notes: notes, parents: [parent("p1")], children: [child("c1", "p1")], email_log: log }, (table, page) => {
      if (table === "email_log") returned.push(...page.map((r) => String(r.id)));
    });
    const state = await mayaWeeklyStore(db).load(NOW);
    expect(state.log.map((r) => r.id).sort()).toEqual(["coverage", "slot", "unsubscribe"]);
    expect(returned.every((id) => ["coverage", "slot", "unsubscribe"].includes(id))).toBe(true);
    expect(returned.filter((id) => id === "coverage")).toHaveLength(2);
    expect(log).toHaveLength(1204);
  });

  it("keeps sent and unknown coverage across slot changes and retries only uncovered refused calls", async () => {
    const db = fakeDb({
      maya_call_notes: ["sent", "unknown", "refused"].map((id) => noteRow(id, "p1", "c1", pdt(2, 15))),
      parents: [parent("p1")], children: [child("c1", "p1")],
      email_log: [
        { id: "sent", parent_id: "p1", kind: "maya_weekly", week_start: "2026-10-19", status: "sent", attempts: 1, call_ids: ["sent"] },
        { id: "unknown", parent_id: "p1", kind: "maya_weekly", week_start: "2026-10-26", status: "claimed", attempts: 1, call_ids: ["unknown"] },
        { id: "refused", parent_id: "p1", kind: "maya_weekly", week_start: "2026-10-12", status: "failed", attempts: 1, call_ids: ["refused"] },
      ],
    });
    expect(dueWeeklyEmails(await mayaWeeklyStore(db).load(NOW), NOW)).toMatchObject([{ callIds: ["refused"], retry: null }]);
  });

  it.each([1, 3])("keeps the current slot's failed attempt count without overlapping calls: %s", async (attempts) => {
    const db = fakeDb({
      maya_call_notes: [noteRow("recent", "p1", "c1", pdt(2, 15))], parents: [parent("p1")], children: [child("c1", "p1")],
      email_log: [{ id: "retry", parent_id: "p1", kind: "maya_weekly", week_start: "2026-11-02", status: "failed", attempts, call_ids: ["old-call"] }],
    });
    const due = dueWeeklyEmails(await mayaWeeklyStore(db).load(NOW), NOW);
    if (attempts === 3) expect(due).toEqual([]);
    else expect(due).toMatchObject([{ callIds: ["recent"], retry: { logId: "retry", attempts } }]);
  });
  it("sees a parent's Maya unsubscribe after more than 1,000 earlier email log rows", async () => {
    const log: Row[] = Array.from({ length: 1200 }, (_, i) => ({ id: `log-${String(i).padStart(5, "0")}`, kind: "maya_weekly", parent_id: "p1", week_start: dayBefore(i), status: "sent", attempts: 1 }));
    log.push({ id: "log-unsub", kind: "maya_unsubscribe", parent_id: "p1", week_start: null, status: null, attempts: 0 });
    const db = fakeDb({ maya_call_notes: [noteRow("call-1", "p1", "c1", pdt(2, 15))], parents: [parent("p1")], children: [child("c1", "p1")], email_log: log });
    const state = await mayaWeeklyStore(db).load(NOW);
    expect(state.log.filter((e) => e.kind === "maya_unsubscribe").map((e) => e.parentId)).toEqual(["p1"]);
    expect(dueWeeklyEmails(state, NOW)).toEqual([]);
  });

  it("reads every note of a parent's week when more than 1,000 notes are in the window", async () => {
    const notes: Row[] = [noteRow("call-a", "p1", "c1", pdt(2, 8))];
    for (let i = 0; i < 999; i++) notes.push(noteRow(`call-q${String(i).padStart(4, "0")}`, "p2", "c2", pdt(2, 9, Math.floor(i / 60), i % 60)));
    notes.push(noteRow("call-b", "p1", "c1", pdt(2, 20)));
    const db = fakeDb({ maya_call_notes: notes, parents: [parent("p1"), parent("p2")], children: [child("c1", "p1"), child("c2", "p2")], email_log: [] });
    const state = await mayaWeeklyStore(db).load(NOW);
    expect(state.notes).toHaveLength(1001);
    const due = dueWeeklyEmails(state, NOW).find((d) => d.parentId === "p1");
    expect(due?.callIds).toEqual(["call-b", "call-a"]);
  });

  it("reads a parent's weekly claim for a week in the window, so the week is not emailed twice", async () => {
    const db = fakeDb({
      maya_call_notes: [noteRow("call-1", "p1", "c1", pdt(2, 15))], parents: [parent("p1")], children: [child("c1", "p1")],
      email_log: [{ id: "log-1", kind: "maya_weekly", parent_id: "p1", week_start: "2026-11-02", status: "sent", attempts: 1 }],
    });
    expect(dueWeeklyEmails(await mayaWeeklyStore(db).load(NOW), NOW)).toEqual([]);
  });
});

describe("weekly store completeness and concurrent deletion", () => {
  it("R421W-1: defers when a completed call has a pending note, then includes the saved note", async () => {
    const notes = [noteRow("saved", "p1", "c1", pdt(2, 15))];
    const calls = [
      { id: "saved", parent_id: "p1", child_id: "c1", status: "ended", kind: "family", ended_at: new Date(pdt(2, 15)).toISOString(), note_pending: null },
      { id: "late", parent_id: "p1", child_id: "c2", status: "ended", kind: "family", ended_at: new Date(pdt(3, 15)).toISOString(), note_pending: {} },
    ];
    const db = fakeDb({ maya_call_notes: notes, maya_calls: calls, parents: [parent("p1")], children: [child("c1", "p1"), child("c2", "p1")], email_log: [] });
    expect(dueWeeklyEmails(await mayaWeeklyStore(db).load(NOW), NOW)).toEqual([]);
    notes.push(noteRow("late", "p1", "c2", pdt(3, 15)));
    calls[1].note_pending = null;
    expect(dueWeeklyEmails(await mayaWeeklyStore(db).load(NOW), NOW)[0].callIds).toEqual(["late", "saved"]);
  });

  it("R421W-1: loads a family whose completed calls have no saved notes", async () => {
    const db = fakeDb({ maya_call_notes: [], maya_calls: [
      { id: "late", parent_id: "p1", child_id: "c1", status: "ended", kind: "family", ended_at: new Date(pdt(3, 15)).toISOString(), note_pending: {} },
    ], parents: [parent("p1")], children: [child("c1", "p1")], email_log: [] });
    const finalDay = pdt(15, 8);
    expect(dueWeeklyEmails(await mayaWeeklyStore(db).load(finalDay), finalDay)).toHaveLength(1);
  });

  it("R421W-5: leaves admin test calls and test families out of the load's due weeks", async () => {
    const at = new Date(pdt(3, 15)).toISOString();
    const db = fakeDb({ maya_call_notes: [], maya_calls: [
      { id: "admin", parent_id: "p1", child_id: "c1", status: "ended", kind: "admin_test", ended_at: at, note_pending: null },
      { id: "tested", parent_id: "p2", child_id: "c2", status: "ended", kind: "family", ended_at: at, note_pending: null },
    ], parents: [parent("p1"), parent("p2")], children: [child("c1", "p1"), child("c2", "p2")], test_accounts: [{ parent_id: "p2" }], email_log: [] });
    const finalDay = pdt(15, 8);
    expect(dueWeeklyEmails(await mayaWeeklyStore(db).load(finalDay), finalDay)).toEqual([]);
  });

  it.each([false, true])("R421W-2: keeps the last note after deletion from page one, same timestamp=%s", async (sameTime) => {
    const notes = Array.from({ length: 1001 }, (_, i) => noteRow(`call-${String(i).padStart(4, "0")}`, "p1", "c1", sameTime ? pdt(2, 15) : pdt(2, 15) + i * 1000));
    let deleted = false;
    const db = fakeDb({ maya_call_notes: notes, parents: [parent("p1")], children: [child("c1", "p1")], email_log: [] }, (table, page) => {
      if (table === "maya_call_notes" && page.length === 1000 && !deleted) { deleted = true; notes.splice(0, 1); }
    });
    const state = await mayaWeeklyStore(db).load(NOW);
    expect(state.notes.some((n) => n.callId === "call-1000")).toBe(true);
    expect(new Set(state.notes.map((n) => n.callId)).size).toBe(1001);
  });

  it.each(["maya_unsubscribe", "maya_weekly"] as const)("R421W-2: retains %s rows after deletion from page one", async (kind) => {
    const log = Array.from({ length: 1001 }, (_, i) => ({ id: `log-${String(i).padStart(4, "0")}`, parent_id: "p1", kind, week_start: kind === "maya_weekly" ? "2026-11-02" : null, status: "sent", attempts: 1 }));
    let deleted = false;
    const db = fakeDb({ maya_call_notes: [noteRow("saved", "p1", "c1", pdt(2, 15))], parents: [parent("p1")], children: [child("c1", "p1")], email_log: log }, (table, page) => {
      if (table === "email_log" && page.length === 1000 && !deleted) { deleted = true; log.splice(0, 1); }
    });
    const state = await mayaWeeklyStore(db).load(NOW);
    expect(state.log.some((r) => r.id === "log-1000")).toBe(true);
  });
});

describe("Maya and reminder unsubscribe scopes", () => {
  const mayaToken = "m".repeat(43);
  const reminderToken = "r".repeat(43);
  function scopedDb(mayaKind: "maya_weekly" | "maya_daily" = "maya_weekly") {
    return fakeDb({
      maya_call_notes: [noteRow("call-1", "p1", "c1", pdt(2, 15))], parents: [parent("p1")], children: [child("c1", "p1")],
      email_log: [
        { id: "old-maya", kind: mayaKind, parent_id: "p1", unsubscribe_hash: hashToken(mayaToken), week_start: "2026-10-26", status: "sent", attempts: 1 },
        { id: "reminder", kind: "start", parent_id: "p1", unsubscribe_hash: hashToken(reminderToken), status: "sent", attempts: 1 },
      ],
    });
  }
  it("a reminder unsubscribe still permits the weekly Maya recap", async () => {
    const db = scopedDb();
    expect(await unsubscribe(db, reminderToken)).toBe("unsubscribed");
    expect(await parentUnsubscribed(db, "p1")).toBe(true);
    expect(await unsubscribeState(db, mayaToken)).toEqual({ state: "subscribed", scope: "maya" });
    expect(dueWeeklyEmails(await mayaWeeklyStore(db).load(NOW), NOW)).toHaveLength(1);
  });
  it.each(["maya_weekly", "maya_daily"] as const)("a %s token stops Maya emails and leaves reminders on", async (kind) => {
    const db = scopedDb(kind);
    expect(await unsubscribe(db, mayaToken)).toBe("unsubscribed");
    expect(await unsubscribe(db, mayaToken)).toBe("unsubscribed");
    expect(await unsubscribeState(db, mayaToken)).toEqual({ state: "unsubscribed", scope: "maya" });
    expect(await parentUnsubscribed(db, "p1")).toBe(false);
    expect(await unsubscribeState(db, reminderToken)).toEqual({ state: "subscribed", scope: "reminders" });
    expect(dueWeeklyEmails(await mayaWeeklyStore(db).load(NOW), NOW)).toEqual([]);
  });
});


it("loads the browser zone and child's province for the shared rule", async () => {
  const db = fakeDb({
    maya_call_notes: [noteRow("call-zone", "p1", "c1", Date.parse("2026-11-08T20:00:00Z"))],
    parents: [{ ...parent("p1"), time_zone: "America/Toronto" }],
    children: [{ ...child("c1", "p1"), province: "AB" }],
  }, (table, _, url) => {
    if (table === "parents") expect(url.searchParams.get("select")).toContain("time_zone");
    if (table === "children") expect(url.searchParams.get("select")).toContain("province");
  });
  const now = Date.parse("2026-11-09T12:00:00Z");
  const state = await mayaWeeklyStore(db).load(now);
  expect(state.parents[0].timeZone).toBe("America/Toronto");
  expect(state.children[0].province).toBe("AB");
  expect(dueWeeklyEmails(state, now)).toHaveLength(1);
  expect(dueWeeklyEmails(state, now - 1)).toHaveLength(0);
});

describe("R425M-3 family fallback", () => {
  it.each([false, true])("uses the oldest child even without their calls, reverse=%s", async (reverse) => {
    const children = [
      { ...child("c-old", "p1"), created_at: "2020-01-01T00:00:00Z", province: "ON" },
      { ...child("c-new", "p1"), created_at: "2021-01-01T00:00:00Z", province: "BC" },
    ];
    if (reverse) children.reverse();
    const db = fakeDb({
      parents: [{ ...parent("p1"), postal: null }], children,
      maya_call_notes: [noteRow("only-new-child-called", "p1", "c-new", pdt(4, 12))], email_log: [],
    });
    const at = Date.parse("2026-11-09T12:00:00Z");
    const state = await mayaWeeklyStore(db).load(at);
    expect(dueWeeklyEmails(state, at)).toMatchObject([{ zone: "America/Toronto", callIds: ["only-new-child-called"] }]);
  });
});
