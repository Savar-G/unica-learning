import { expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { readSchedule, readScheduleTopics, type ScheduleReceipt } from "@/lib/parent-schedule";
import { memoryScheduleStore, type ScheduleMemory } from "@/lib/parent-schedule-memory";
import { savedScheduleV1 } from "@/lib/parent-schedule-v1";
import { workbookTemplate } from "@/lib/workbook-template";
import { scheduleFixture as fixture } from "@/lib/parent-schedule.test-fixture";

const read = (data: ScheduleMemory, request = {}) => readSchedule(memoryScheduleStore(data), "p1", request);
const draftOf = (data: ScheduleMemory) => data.revisions[0].source.draft;

it("binds to the approved revision, preserves printed row order and exposes only safe fields", async () => {
  const data = fixture();
  const newer = structuredClone(data.revisions[0]);
  newer.revision = 2;
  const plan = newer.source.draft.pages[0].content;
  if (plan?.kind === "how-plan") plan.rows[0].topic = "UNAPPROVED";
  data.revisions.push(newer);
  const view = await read(data);
  expect(view.kind).toBe("ready");
  if (view.kind !== "ready") return;
  expect(view.rows.map(r => [r.day, r.topic, r.second, r.pages, r.requiredMinutes])).toEqual([
    [2, "Second printed row first", "Subtraction", [4, 4], 20], [1, "Addition", "Number facts", [3, 3], 18],
  ]);
  expect(JSON.stringify(view)).not.toMatch(/UNAPPROVED|private\.pdf|private\.png|package|operation|pdfSha256|rendering/);
});

it("scopes both children and books and resolves the plain email deterministically", async () => {
  const data = fixture();
  const other = fixture("c2", "p1", "b2"), foreign = fixture("c3", "p2", "b3");
  for (const key of ["children", "books", "approvals", "revisions", "pages", "receipts"] as const) (data[key] as unknown[]).push(...other[key], ...foreign[key]);
  expect(await read(data)).toMatchObject({ kind: "ready", child: { id: "c1" }, book: { id: "b1" } });
  expect(await read(data, { remembered: "c2" })).toMatchObject({ kind: "ready", child: { id: "c2" }, book: { id: "b2" } });
  expect(await read(data, { remembered: "c3" })).toMatchObject({ kind: "ready", child: { id: "c1" } });
  for (const request of [{ child: "c3" }, { child: "" }, { child: "c1", book: "" }, { child: "c1", book: "b2" }, { child: "c1", book: "b3" }]) expect(await read(data, request)).toEqual({ kind: "not-found" });
});

it.each(["draft", "approved"])("waits for print rather than promoting a %s", async status => {
  const data = fixture(); data.books[0].status = status;
  expect(await read(data)).toMatchObject({ kind: "waiting" });
  data.children = []; expect(await read(data)).toEqual({ kind: "waiting", child: null });
});

it.each(["audit", "revision", "pdf", "content", "contract", "manifest", "manifest-identity", "geometry", "token", "identity", "missing"])("refuses a stale or missing %s binding", async fault => {
  const data = fixture();
  if (fault === "audit") data.approvals[0].printedRevision = "other";
  if (fault === "revision") data.approvals[0].revision = 2;
  if (fault === "pdf") data.books[0].pdfSha256 = "f".repeat(64);
  if (fault === "content") draftOf(data).pages[0].content = { kind: "blank", id: "changed", level: 10 };
  if (fault === "contract") data.pages[0].page.contract = { ...data.pages[0].page.contract!, workbookId: "other" };
  if (fault === "manifest") data.books[0].manifest!.days[0].pages = [5];
  if (fault === "manifest-identity") data.books[0].manifest!.curriculum.version = "other-print";
  if (fault === "geometry") data.pages[1].page.questions = data.pages[1].page.questions.map(q => ({ ...q, box: { x: 99 } }));
  if (fault === "token") data.pages[0].page.qrToken = "other-print";
  if (fault === "identity") data.revisions[0].source.draft.childId = "other";
  if (fault === "missing") data.books[0].printedRevision = null;
  data.books[0].status = "shipped";
  expect(await readScheduleTopics(memoryScheduleStore(data), "p1", "c1", "b1")).toBeNull();
  expect(await read(data)).toMatchObject({ kind: "unavailable" });
});

it("accepts equivalent JSONB key order but refuses ambiguous approved revisions", async () => {
  const data = fixture();
  for (const row of data.pages) row.page.contract = Object.fromEntries(Object.entries(row.page.contract!).reverse()) as typeof row.page.contract;
  expect(await read(data)).toMatchObject({ kind: "ready" });
  data.approvals.push({ ...data.approvals[0], revision: 2 });
  expect(await read(data)).toMatchObject({ kind: "unavailable" });
});

it("counts immutable receipts once through later rechecks, expiry and image cleanup", async () => {
  const data = fixture();
  const revision = data.books[0].printedRevision!;
  const receipt: ScheduleReceipt = { parentId: "p1", childId: "c1", workbookId: "b1", pageId: "page-b1-3", revision, status: "accepted" };
  data.receipts = [receipt, { ...receipt }, { ...receipt, pageId: "page-b1-5" }];
  // No photo or calibration read is available. A later recheck cannot remove this fact.
  const store = memoryScheduleStore(data);
  const first = await readSchedule(store, "p1");
  expect(first).toMatchObject({ rows: [{ scan: { kind: "unknown" } }, { scan: { accepted: 1, required: 1 } }] });
  for (const refused of [{ ...receipt, parentId: "foreign" }, { ...receipt, childId: "foreign" }, { ...receipt, workbookId: "foreign" },
    { ...receipt, revision: "old" }, { ...receipt, status: "refused" }, { ...receipt, pageId: "unknown" }]) {
    data.receipts = [refused];
    expect(await read(data)).toMatchObject({ rows: [{ scan: { kind: "unknown" } }, { scan: { kind: "unknown" } }] });
  }
  data.receipts = [];
  // The receipt epoch has no historical backfill. Empty history is unknown, never zero scans.
  expect(await read(data)).toMatchObject({ scansUnknown: false, rows: [{ scan: { kind: "unknown" } }, { scan: { kind: "unknown" } }] });
  // A failed read is told apart from an empty history: the page must not call every day To scan for it.
  data.fail = "receipts";
  expect(await read(data)).toMatchObject({ kind: "ready", scansUnknown: true, rows: [{ scan: { kind: "unknown" } }, { scan: { kind: "unknown" } }] });
  data.fail = "pages"; expect(await read(data)).toMatchObject({ kind: "unavailable" });
});

it.each(["override", "extra", "calculated", "global"])("matches actual page-2 HTML for %s required-time rules without a print engine", mode => {
  const draft = draftOf(fixture());
  const plan = draft.pages[0].content;
  if (plan?.kind !== "how-plan") throw new Error("Fixture plan missing");
  if (mode === "global") plan.rows.forEach(r => { delete r.requiredMinutes; });
  const day = draft.pages[1].content;
  if (day?.kind !== "day") throw new Error("Fixture day missing");
  if (mode === "calculated") day.requiredTimeTarget = 12;
  if (mode === "extra") { day.blocks[0].extra = true; day.blocks.push({ slot: "worked-example", items: [] }); }
  const printInput = { ...draft, pages: draft.pages.map(p => ({ ...p, questions: p.questions.flatMap(q => q.package ? [{ ...q, package: q.package }] : []) })) };
  const html = workbookTemplate().page(printInput.pages[0], { qr: "", qrUrl: "" }, printInput)!;
  const root = new Window().document.createElement("div"); root.innerHTML = html;
  const projection = savedScheduleV1(draft)!;
  expect(projection.rows.map(r => [r.day, r.topic, r.second, `${r.pages[0]}–${r.pages[1]}`, r.requiredMinutes === null ? null : `${r.requiredMinutes} min`])).toEqual(
    [...root.querySelectorAll("tbody tr")].map(row => {
      const cells = row.querySelectorAll("td");
      return [Number(cells[0].textContent!.replace("Day ", "")), cells[1].querySelector("b")!.textContent, cells[1].querySelector(".t2")!.textContent,
        cells[2].firstChild!.textContent, cells[2].querySelector(".plan-time")?.textContent ?? null];
    }));
  // Page 2 says the same time as the schedule page, in its own words (Savar, 2026-11-09): "About 20 minutes a day, plus
  // Extra if there's time." for the saved "about 20 minutes, plus Extra if there's time".
  const line = root.querySelector('[data-measure="slot-how-0"]')!.textContent!.toLowerCase();
  expect(line.startsWith("do the days in order, 5 days a week. ")).toBe(true);
  expect(line.slice("do the days in order, 5 days a week. ".length).replace(" minutes a day", " minutes").replace(/\.$/, "")).toBe(projection.dailyTime.toLowerCase());
});

// #475: marks are read from the effective marking projection, never from receipts. A scan is not a mark.
function scheduleMark(data: ScheduleMemory, page: number, kind: "right" | "checking" | "unread", over: { workbookId?: string; printedRevision?: string } = {}): NonNullable<ScheduleMemory["marks"]>[number] {
  const row = data.pages.find(p => p.page.number === page)!;
  const identity = { workbookId: over.workbookId ?? row.book, printedRevision: over.printedRevision ?? data.books[0].printedRevision!, pageId: row.page.id, itemId: row.page.questions[0].package.id };
  const result = kind === "right" ? "right" as const : null;
  return { parent: row.parent, child: row.child, mark: {
    expected: { identity, number: 1, method: "code", scoredRegions: ["a"], mastery: { eligible: false, reason: "no-teaching-context" }, teaching: null },
    observation: { version: 1, identity, evidence: null, readAnswerText: kind === "unread" ? null : "7", regions: kind === "unread" ? [] : [{ regionId: "a", text: "7", value: "7", certainty: "certain" }],
      certainty: kind === "unread" ? "not-read" : "certain", state: kind === "right" ? "parent-checked" : "pending", method: kind === "right" ? "parent" : "code", result,
      teaching: null, mastery: { eligible: false, reason: "no-teaching-context" }, help: "none", actor: kind === "right" ? "parent" : "system", resultVersion: 1 },
    originalEvent: null, eventId: null, at: "2026-11-05T00:00:00Z", model: kind === "unread" ? null : "synthetic-model", prompt: null } };
}

it("shows marks separately from scans: not marked yet, our team checking, and all marked", async () => {
  const data = fixture();
  const revision = data.books[0].printedRevision!;
  data.receipts = [3, 4].map(n => ({ parentId: "p1", childId: "c1", workbookId: "b1", pageId: `page-b1-${n}`, revision, status: "accepted" }));
  // Scanned, nothing read yet: the scan count is full and no mark is claimed.
  data.marks = [];
  expect(await read(data)).toMatchObject({ rows: [{ day: 2, scan: { accepted: 1, required: 1 }, marks: { kind: "none", total: 1 } }, { day: 1, marks: { kind: "none", total: 1 } }] });
  data.marks = [scheduleMark(data, 4, "unread"), scheduleMark(data, 3, "checking")];
  expect(await read(data)).toMatchObject({ rows: [{ day: 2, marks: { kind: "none", marked: 0, total: 1 } }, { day: 1, marks: { kind: "checking", marked: 0, total: 1 } }] });
  data.marks = [scheduleMark(data, 4, "right"), scheduleMark(data, 3, "right")];
  expect(await read(data)).toMatchObject({ rows: [{ day: 2, marks: { kind: "all", marked: 1, total: 1 } }, { day: 1, marks: { kind: "all", marked: 1, total: 1 } }] });
  // The extra practice page (5) is not a required page; its mark changes no day.
  data.marks.push(scheduleMark(data, 5, "checking"));
  expect(await read(data)).toMatchObject({ rows: [{ marks: { kind: "all" } }, { marks: { kind: "all" } }] });
});

it("never counts a mark from another print, another book or another family, and a failed read claims no mark", async () => {
  const data = fixture();
  data.marks = [scheduleMark(data, 3, "right", { printedRevision: "old-print" }), scheduleMark(data, 3, "right", { workbookId: "b9" }),
    { ...scheduleMark(data, 4, "right"), parent: "p2" }, { ...scheduleMark(data, 4, "right"), child: "c2" }];
  expect(await read(data)).toMatchObject({ rows: [{ marks: { kind: "none" } }, { marks: { kind: "none" } }] });
  data.fail = "marks";
  expect(await read(data)).toMatchObject({ kind: "ready", rows: [{ marks: { kind: "unknown" } }, { marks: { kind: "unknown" } }] });
});

it("lists the printed pages of a day that have no recorded scan", async () => {
  const data = fixture("c1", "p1", "b1", true);
  const revision = data.books[0].printedRevision!;
  data.receipts = [{ parentId: "p1", childId: "c1", workbookId: "b1", pageId: "page-b1-3", revision, status: "accepted" }];
  const view = await read(data);
  expect(view).toMatchObject({ kind: "ready", rows: [{ day: 2, scan: { kind: "unknown" } }, { day: 1, scan: { kind: "known", accepted: 1, required: 2, missing: [5] }, marks: { total: 2 } }] });
});

it("reads only frozen plan topics without receipts or marks, and requires a shipped, owned book", async () => {
  const data = fixture();
  const receipts = vi.fn(() => { throw new Error("Home must not read receipts"); });
  const marks = vi.fn(() => { throw new Error("Home must not read marks"); });
  const store = { ...memoryScheduleStore(data), receipts, marks };
  expect(await readScheduleTopics(store, "p1", "c1", "b1")).toBeNull();
  data.books[0].status = "shipped";
  expect(await readScheduleTopics(store, "p1", "c1", "b1")).toEqual([
    { day: 2, topic: "Second printed row first" }, { day: 1, topic: "Addition" },
  ]);
  for (const [parent, child, book] of [["p2", "c1", "b1"], ["p1", "c2", "b1"], ["p1", "c1", "b2"]]) {
    expect(await readScheduleTopics(store, parent, child, book)).toBeNull();
  }
  expect(receipts).not.toHaveBeenCalled();
  expect(marks).not.toHaveBeenCalled();
});
