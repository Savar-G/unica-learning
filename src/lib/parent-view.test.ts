import { afterEach, describe, expect, it, vi } from "vitest";
import { BC_SKILL_MAP, type AreaAnswer, type ReportModel } from "@/lib/assessment";
import { capitalName, plainSkillName } from "@/lib/skill-name";
import { listChildren, readChild, readMonthlySummary, readOverview, readProgress, readWorkbooks } from "@/lib/parent-view";
import { bookDays, withHomeCount, type ReadySchedule } from "@/lib/workbook-days";
import { memoryParentViewReaders, type MemoryParentViewTables, type MemoryResult, type MemoryScan, type MemoryTest, type MemoryWorkbook } from "@/lib/parent-view-memory";

// The parent view module (spec #544), through its public interface, over the in-memory reader, which keeps the
// database's access rules: a parent reads only their own rows, and only shipped workbooks.
vi.mock("server-only", () => ({}));
afterEach(() => vi.restoreAllMocks());

const NOW = Date.parse("2026-11-04T18:00:00Z");
const HOUR = 3_600_000;

const test = (id: string, over: Partial<MemoryTest> = {}): MemoryTest => ({
  id, parentId: "parent-1", childId: "child-1", province: "BC", status: "completed",
  startedAt: NOW - 100 * HOUR, lastAnswerAt: NOW - 99 * HOUR, resumeUntil: NOW - 75 * HOUR, completedAt: NOW - 99 * HOUR, ...over,
});
const open = (id: string, over: Partial<MemoryTest> = {}) => test(id, { status: "in_progress", resumeUntil: NOW + HOUR, completedAt: null, ...over });
const report = (assessmentId: string, parentId = "parent-1", childId = "child-1") => ({ assessmentId, parentId, childId });
const leah = { id: "child-1", parentId: "parent-1", firstName: "Leah", grade: 3, createdAt: "2026-10-01T00:00:00Z" };
const omar = { id: "child-2", parentId: "parent-2", firstName: "Omar", grade: 5, createdAt: "2026-10-02T00:00:00Z" };

const parent = (tables: Omit<MemoryParentViewTables, "children"> & { children?: MemoryParentViewTables["children"] } = {}) =>
  memoryParentViewReaders({ children: [leah, omar], ...tables }).parent("parent-1");
const stageOf = async (tables: Parameters<typeof parent>[0]) => (await readChild(parent(tables), "child-1", NOW))?.stage;

describe("the stage of a child, from the stored facts", () => {
  it("no test", async () => {
    expect(await stageOf({})).toBe("no_test");
  });
  it("only an expired test is no test", async () => {
    expect(await stageOf({ tests: [test("t", { status: "expired", completedAt: null })] })).toBe("no_test");
  });
  it("a test still open", async () => {
    expect(await stageOf({ tests: [open("t")] })).toBe("test_running");
  });
  it("an in-progress row past its 24 hours is not open, even before the server marks it expired", async () => {
    expect(await stageOf({ tests: [open("t", { resumeUntil: NOW - 1 })] })).toBe("no_test");
  });
  it("the clock decides: the same row is open one millisecond earlier", async () => {
    const reader = parent({ tests: [open("t", { resumeUntil: NOW })] });
    expect((await readChild(reader, "child-1", NOW))?.stage).toBe("test_running");
    expect((await readChild(reader, "child-1", NOW + 1))?.stage).toBe("no_test");
  });
  it("a test with every answer in waits to be scored and never expires", async () => {
    expect(await stageOf({ tests: [open("t", { resumeUntil: NOW - 50 * HOUR, answeredAll: true })] })).toBe("test_running");
  });
  it("a finished test with its report not ready", async () => {
    expect(await stageOf({ tests: [test("t")] })).toBe("test_running");
  });
  it("the latest finished test decides: an older report does not hide a newer test's wait", async () => {
    const tests = [test("old", { completedAt: NOW - 90 * HOUR }), test("new", { completedAt: NOW - HOUR })];
    expect(await stageOf({ tests, reports: [report("old")] })).toBe("test_running");
  });
  it("the latest finished test decides: an older test with no report does not hide a newer report", async () => {
    const tests = [test("older", { completedAt: NOW - 90 * HOUR }), test("new", { completedAt: NOW - HOUR })];
    expect(await stageOf({ tests, reports: [report("new")] })).toBe("report_ready_bc");
  });
  it("a new test open after a report", async () => {
    expect(await stageOf({ tests: [test("old"), open("new")], reports: [report("old")] })).toBe("test_running");
  });
  it("an expired test after a report leaves the report ready", async () => {
    expect(await stageOf({ tests: [test("old"), test("new", { status: "expired", completedAt: null })], reports: [report("old")] })).toBe("report_ready_bc");
  });
  it("a report outside BC, and a report with the curriculum 'other', wait", async () => {
    expect(await stageOf({ tests: [test("t", { province: "ON" })], reports: [report("t")] })).toBe("report_ready_waitlist");
    expect(await stageOf({ tests: [test("t", { province: "other" })], reports: [report("t")] })).toBe("report_ready_waitlist");
  });
  it("a saved card, and an unsaved card row that does not count", async () => {
    expect(await stageOf({ cards: [{ parentId: "parent-1", childId: "child-1", cardSavedAt: "2026-11-01T00:00:00Z" }] })).toBe("first_book_coming");
    expect(await stageOf({ cards: [{ parentId: "parent-1", childId: "child-1", cardSavedAt: null }] })).toBe("no_test");
  });
  it("a delivery receipt, with no plan row: the plan reads as unknown and the child stays active", async () => {
    expect(await stageOf({ deliveries: [{ parentId: "parent-1", childId: "child-1" }] })).toBe("active");
  });
  it("an ended plan", async () => {
    expect(await stageOf({ deliveries: [{ parentId: "parent-1", childId: "child-1" }], plans: [{ parentId: "parent-1", childId: "child-1", kind: "ended" }] })).toBe("ended");
  });
  it("a failed plan read keeps the child in active and is logged", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await stageOf({ deliveries: [{ parentId: "parent-1", childId: "child-1" }], plans: [{ parentId: "parent-1", childId: "child-1", kind: "ended" }], fail: ["plans"] })).toBe("active");
    expect(log).toHaveBeenCalledOnce();
  });
  it.each(["children", "tests", "reports", "cards", "deliveries", "workbooks"] as const)("a failed read of %s throws: it never reads as a family with no data", async (table) => {
    await expect(listChildren(parent({ fail: [table] }), NOW)).rejects.toThrow(table);
  });
});

describe("the tabs follow the reader's switches", () => {
  const delivered = { deliveries: [{ parentId: "parent-1", childId: "child-1" }] };
  it("all off", async () => {
    expect((await readChild(parent(delivered), "child-1", NOW))?.tabs).toEqual(["overview", "workbooks", "assessment", "account"]);
  });
  it("all on", async () => {
    const child = await readChild(parent({ ...delivered, switches: { progress: true, maya: true, scanPages: true } }), "child-1", NOW);
    expect(child?.tabs).toEqual(["overview", "progress", "workbooks", "scan_pages", "maya", "assessment", "account"]);
  });
  it("a child's own open plan shows Scan pages for that child only", async () => {
    const off = { progress: false, maya: false, scanPages: false };
    const named = await readChild(parent({ ...delivered, switches: { ...off, scanPlanChildren: new Set(["child-1"]) } }), "child-1", NOW);
    expect(named?.tabs).toContain("scan_pages");
    const sibling = await readChild(parent({ ...delivered, switches: { ...off, scanPlanChildren: new Set(["child-2"]) } }), "child-1", NOW);
    expect(sibling?.tabs).not.toContain("scan_pages");
  });
});

describe("what a parent reads", () => {
  it("lists only their own children, oldest first, with one read of each table for the list", async () => {
    const younger = { ...leah, id: "child-3", firstName: "Ana", createdAt: "2026-10-03T00:00:00Z" };
    const readers = memoryParentViewReaders({ children: [younger, omar, leah] });
    const list = await listChildren(readers.parent("parent-1"), NOW);
    expect(list.map((c) => c.firstName)).toEqual(["Leah", "Ana"]);
    expect(readers.reads).toEqual({ children: 1, tests: 1, reports: 1, cards: 1, deliveries: 1, workbooks: 1, plans: 1, switches: 1, corrections: 0, dispatches: 0, family: 0, results: 0, scans: 0, pages: 0, learning: 0, pin: 0, maya: 0, skillTests: 0, questions: 0, planTopics: 0, overviewProgress: 0, history: 0, mistakes: 0 });
  });
  it("lists a child's reports, the newest test first", async () => {
    const reader = parent({ tests: [test("old", { completedAt: NOW - 90 * HOUR }), test("new", { completedAt: NOW - 10 * HOUR })], reports: [report("old"), report("new")] });
    expect((await readChild(reader, "child-1", NOW))?.reportIds).toEqual(["report-new", "report-old"]);
  });
  it("gives the exact fields of a child, and nothing for a panel with no data", async () => {
    expect(await readChild(parent(), "child-1", NOW)).toEqual({
      id: "child-1", firstName: "Leah", schoolGrade: 3, reportIds: [], finishedTests: [], stage: "no_test", opensOn: "start_test", tabs: ["assessment", "account"], readOnly: false, currentWorkbook: null,
    });
  });
  it("gives no children to a parent with none", async () => {
    expect(await listChildren(memoryParentViewReaders({ children: [omar] }).parent("parent-1"), NOW)).toEqual([]);
  });
  it("reads another family's child as not found, the same as an id that does not exist", async () => {
    const reader = parent({ tests: [test("t", { parentId: "parent-2", childId: "child-2" })], reports: [report("t", "parent-2", "child-2")] });
    expect(await readChild(reader, "child-2", NOW)).toBeNull();
    expect(await readChild(reader, "no-such-child", NOW)).toBeNull();
    expect(await readChild(reader, "not a uuid; drop table", NOW)).toBeNull();
  });
  it("never lets another family's rows move a child's stage", async () => {
    const other = { parentId: "parent-2", childId: "child-1" };
    expect(await stageOf({
      tests: [test("t", other)], reports: [report("t", "parent-2")], cards: [{ ...other, cardSavedAt: "2026-11-01T00:00:00Z" }],
      deliveries: [other], plans: [{ ...other, kind: "ended" }], workbooks: [{ ...other, number: 1, status: "shipped" }],
    })).toBe("no_test");
  });
  it("names the newest shipped workbook, and only a shipped one", async () => {
    const book = { parentId: "parent-1", childId: "child-1" };
    const child = await readChild(parent({ workbooks: [{ ...book, number: 1, status: "shipped" }, { ...book, number: 3, status: "approved" }, { ...book, number: 2, status: "shipped" }] }), "child-1", NOW);
    expect(child?.currentWorkbook).toEqual({ number: 2 });
  });
  it("puts no field of a raw profile, learning event, Maya call or AI finding in the output, whatever a row holds", async () => {
    const SECRET = "RAW-CANARY";
    const raw = { learner_profile: SECRET, learning_events: [SECRET], maya_call: { transcript: SECRET }, ai: { findings: [SECRET] }, placement: { note: SECRET }, model: { ai: SECRET }, learning_note: SECRET };
    const book = { parentId: "parent-1", childId: "child-1" };
    const reader = parent({
      children: [{ ...leah, ...raw }],
      tests: [{ ...test("t"), ...raw }],
      reports: [{ ...report("t"), ...raw }],
      cards: [{ ...book, cardSavedAt: "2026-11-01T00:00:00Z", ...raw }],
      deliveries: [{ ...book, ...raw }],
      plans: [{ ...book, kind: "paying", ...raw }],
      workbooks: [{ ...book, number: 1, status: "shipped", ...raw }],
    });
    const [listed] = await listChildren(reader, NOW);
    expect(listed.stage).toBe("active");
    expect(Object.keys(listed).sort()).toEqual(["currentWorkbook", "finishedTests", "firstName", "id", "opensOn", "readOnly", "reportIds", "schoolGrade", "stage", "tabs"]);
    expect(JSON.stringify(listed)).not.toContain(SECRET);
    expect(JSON.stringify(await readChild(reader, "child-1", NOW))).not.toContain(SECRET);
  });
});

describe("the finished tests of a child", () => {
  const reportOf = (assessmentId: string) => ({ ...report(assessmentId), id: `report-${assessmentId}` });
  it("lists each test with a report, newest first, with the time it finished", async () => {
    const older = NOW - 800 * HOUR;
    const newer = NOW - 99 * HOUR;
    const view = await readChild(parent({
      tests: [test("old", { completedAt: older }), test("new", { completedAt: newer })],
      reports: [reportOf("old"), reportOf("new")],
    }), "child-1", NOW);
    expect(view?.finishedTests).toEqual([{ reportId: "report-new", finishedAt: newer }, { reportId: "report-old", finishedAt: older }]);
    expect(view?.reportIds).toEqual(["report-new", "report-old"]);
  });
  it("leaves out a finished test whose report is not ready, and a test that has not finished", async () => {
    const view = await readChild(parent({ tests: [test("waiting"), open("running")] }), "child-1", NOW);
    expect(view?.finishedTests).toEqual([]);
  });
});

describe("the Workbooks tab (#558)", () => {
  const own = { parentId: "parent-1", childId: "child-1" };
  const card = { cards: [{ ...own, cardSavedAt: "2026-10-20T00:00:00Z" }] };
  // Leah's family has no saved time zone or postal code, so family time comes from Leah's province: BC, Pacific.
  const book = (number: number, over: Partial<MemoryWorkbook> = {}): MemoryWorkbook => ({ ...own, id: `wb-${number}`, number, status: "shipped", shippedAt: "2026-11-02T22:00:00Z", pdfPath: `parent-1/wb-${number}/workbook.pdf`, ...over });
  const mail = { method: "mail", carrier: "Canada Post", trackingNumber: "7023 1234", trackingUrl: "https://www.canadapost-postescanada.ca/track?n=70231234" };
  const read = (tables: Parameters<typeof parent>[0], now = NOW) => readWorkbooks(parent({ ...card, ...tables }), "child-1", now);

  it("applies only the stored pause weeks for this child's next workbook", async () => {
    const reader = parent({ cards: [{ ...own, cardSavedAt: "2026-10-01" }], workbooks: [book(1)] });
    const calls: unknown[][] = [];
    reader.pauseWeeks = async (child, number) => { calls.push([child, number]); return number === 2 ? 2 : 0; };
    const view = await readWorkbooks(reader, "child-1", NOW);
    expect(view?.next).toEqual({ kind: "range", earliest: "2026-11-30", latest: "2026-12-21" });
    expect(calls).toEqual([["child-1", 2]]);
    reader.pauseWeeks = async (_child, number) => number === 3 ? 2 : 0;
    expect((await readWorkbooks(reader, "child-1", NOW))?.next).toEqual({ kind: "range", earliest: "2026-11-16", latest: "2026-12-07" });
  });

  it("before the first book ships: the status, with no date and no book", async () => {
    expect(await read({ workbooks: [book(1, { status: "printed" })] })).toEqual({
      child: expect.objectContaining({ id: "child-1", firstName: "Leah", stage: "first_book_coming" }),
      current: null, next: { kind: "first_book_coming" }, books: [], today: "2026-11-04", homeScan: null,
    });
  });
  it("counts saved, unexpired scans of day pages on the current book's Workbooks cover", async () => {
    const page = (id: string, dayLabel: string | null) => ({ parentId: "parent-1", workbookId: "wb-1", id, dayLabel });
    const scan = (pageId: string, over: Partial<MemoryScan> = {}): MemoryScan => ({ ...own, workbookId: "wb-1", pageId, state: "saved", expiresAt: "2027-01-01T00:00:00Z", ...over });
    const tables = {
      workbooks: [book(1)], deliveries: [{ ...own, workbookId: "wb-1", deliveredAt: "2026-11-02T22:00:00Z" }],
      pages: [page("c", null), page("a", "Day 1"), page("b", "Day 1"), page("d", "Day 2"), page("e", "Day 2")],
      scans: [scan("a"), scan("b", { expiresAt: "2026-11-01T00:00:00Z" }), scan("c"), scan("d", { state: "rejected" }), scan("e", { workbookId: "wb-other" })],
    };
    // One of four day pages: the expired photo, the cover, the rejected photo and another book's photo do not count.
    expect((await read(tables))?.homeScan).toEqual({ bookId: "wb-1", scanned: 1, total: 4 });
    expect((await readOverview(parent({ ...card, ...tables }), "child-1", NOW))?.workbook?.doneDays).toBe(0);
    // No delivered book: nothing to count. A failed read leaves the count out and the page still reads.
    expect((await read({ workbooks: [book(1)] }))?.homeScan).toBeNull();
    expect((await read({ ...tables, fail: ["scans"] }))?.homeScan).toBeNull();
  });
  it("a shipped book with no confirmed delivery: shipped in family time, tracking, and 14 to 35 days after shipping", async () => {
    const view = await read({ workbooks: [book(1)], dispatches: [{ ...own, number: 1, delivery: mail }] });
    // 22:00 UTC on November 2 is 14:00 on November 2 in Vancouver.
    expect(view?.current).toEqual({ id: "wb-1", number: 1, shippedOn: "2026-11-02", deliveredOn: null, delivery: { method: "mail", carrier: "Canada Post", trackingNumber: "7023 1234", trackingUrl: mail.trackingUrl } });
    expect(view?.next).toEqual({ kind: "range", earliest: "2026-11-16", latest: "2026-12-07" });
  });
  it("uses the family's time zone for every day", async () => {
    const view = await read({ workbooks: [book(1, { shippedAt: "2026-11-03T04:30:00Z" })], family: { timeZone: "America/Toronto", postal: null } });
    expect(view?.current?.shippedOn).toBe("2026-11-02");
    const pacific = await read({ workbooks: [book(1, { shippedAt: "2026-11-03T04:30:00Z" })] });
    expect(pacific?.current?.shippedOn).toBe("2026-11-02");
    const late = await read({ workbooks: [book(1, { shippedAt: "2026-11-03T06:30:00Z" })], family: { timeZone: "America/Toronto", postal: null } });
    expect(late?.current?.shippedOn).toBe("2026-11-03");
    // Today, which the book's calendar day is counted from, is a family-time day too (#1031).
    expect([view?.today, pacific?.today]).toEqual(["2026-11-04", "2026-11-04"]);
    expect((await read({ workbooks: [book(1)], family: { timeZone: "America/Toronto", postal: null } }, Date.parse("2026-11-04T04:30:00Z")))?.today).toBe("2026-11-03");
  });
  it("a confirmed delivery ends the range 28 days after it, and the newest correction wins", async () => {
    const deliveries = [{ ...own, workbookId: "wb-1", deliveredAt: "2026-11-05T20:00:00Z" }];
    expect((await read({ workbooks: [book(1)], deliveries }, Date.parse("2026-11-07T20:00:00Z")))?.next).toEqual({ kind: "range", earliest: "2026-11-16", latest: "2026-12-03" });
    const corrections = [
      { ...own, workbookId: "wb-1", deliveredAt: "2026-11-04T20:00:00Z", auditId: 7 },
      { ...own, workbookId: "wb-1", deliveredAt: "2026-11-06T20:00:00Z", auditId: 9 },
      { ...own, workbookId: "wb-1", deliveredAt: "2026-11-03T20:00:00Z", auditId: 8 },
    ];
    const view = await read({ workbooks: [book(1)], deliveries, corrections }, Date.parse("2026-11-07T20:00:00Z"));
    expect(view?.current?.deliveredOn).toBe("2026-11-06");
    expect(view?.next).toEqual({ kind: "range", earliest: "2026-11-16", latest: "2026-12-04" });
  });
  it("the current book is the newest shipped one, with its own delivery and tracking", async () => {
    const view = await read({
      workbooks: [book(1, { shippedAt: "2026-10-10T18:00:00Z" }), book(2), book(3, { status: "approved" })],
      deliveries: [{ ...own, workbookId: "wb-1", deliveredAt: "2026-10-14T18:00:00Z" }],
      dispatches: [{ ...own, number: 1, delivery: { method: "hand" } }, { ...own, number: 2, delivery: mail }],
    });
    expect(view?.current).toMatchObject({ id: "wb-2", number: 2, deliveredOn: null, delivery: { method: "mail" } });
    expect(view?.books.map((b) => b.number)).toEqual([2, 1]);
  });
  it("lists every shipped book, newest first, without PDF access", async () => {
    const view = await read({ workbooks: [book(1, { pdfPath: null, shippedAt: "2026-10-10T18:00:00Z" }), book(2)] });
    expect(view?.books).toEqual([
      { id: "wb-2", number: 2, shippedOn: "2026-11-02", deliveredOn: null },
      { id: "wb-1", number: 1, shippedOn: "2026-10-10", deliveredOn: null },
    ]);
  });
  it("hand delivery has no tracking; a mail dispatch with no tracking link keeps the number", async () => {
    expect((await read({ workbooks: [book(1)], dispatches: [{ ...own, number: 1, delivery: { method: "hand", carrier: "stale", trackingNumber: "stale" } }] }))?.current?.delivery).toEqual({ method: "hand" });
    expect((await read({ workbooks: [book(1)], dispatches: [{ ...own, number: 1, delivery: { ...mail, trackingUrl: "" } }] }))?.current?.delivery).toEqual({ method: "mail", carrier: "Canada Post", trackingNumber: "7023 1234", trackingUrl: null });
  });
  it("shows no tracking that does not pass the delivery check, and none from an email not yet made", async () => {
    for (const delivery of [{}, { method: "mail", carrier: "Canada Post" }, { ...mail, trackingUrl: "http://plain.example/track" }, { ...mail, trackingUrl: "javascript:alert(1)" }]) {
      expect((await read({ workbooks: [book(1)], dispatches: [{ ...own, number: 1, delivery }] }))?.current?.delivery).toBeNull();
    }
    expect((await read({ workbooks: [book(1)] }))?.current?.delivery).toBeNull();
  });
  it("after the range passed: a status, with no date", async () => {
    expect((await read({ workbooks: [book(1)] }, Date.parse("2026-12-08T20:00:00Z")))?.next).toEqual({ kind: "past_estimate" });
  });
  it("a shipped book with no shipping time gives no date", async () => {
    expect((await read({ workbooks: [book(1, { shippedAt: null })] }))?.next).toEqual({ kind: "none" });
  });
  it("after the plan ended: the books stay, with no next book", async () => {
    const view = await read({ workbooks: [book(1)], deliveries: [{ ...own, workbookId: "wb-1", deliveredAt: "2026-11-05T20:00:00Z" }], plans: [{ ...own, kind: "ended" }] });
    expect(view?.child.stage).toBe("ended");
    expect(view?.next).toEqual({ kind: "none" });
    expect(view?.books).toHaveLength(1);
  });
  it("is not found for a child whose stage has no Workbooks tab", async () => {
    expect(await readWorkbooks(parent({}), "child-1", NOW)).toBeNull();
  });
  it("reads only the parent's own shipped books: another family's rows never show or move a date", async () => {
    const other = { parentId: "parent-2", childId: "child-1" };
    const view = await read({
      workbooks: [{ ...book(1), ...other, id: "theirs" }, book(1, { status: "draft" })],
      deliveries: [{ ...other, workbookId: "wb-1", deliveredAt: "2026-11-03T20:00:00Z" }],
      corrections: [{ ...other, workbookId: "wb-1", deliveredAt: "2026-11-03T20:00:00Z", auditId: 1 }],
      dispatches: [{ ...other, number: 1, delivery: mail }],
    });
    expect(view).toMatchObject({ current: null, next: { kind: "first_book_coming" }, books: [] });
  });
  it("reads another family's child as not found", async () => {
    const readers = memoryParentViewReaders({ children: [leah, omar], cards: [{ parentId: "parent-2", childId: "child-2", cardSavedAt: "2026-10-20T00:00:00Z" }], workbooks: [{ ...book(1), parentId: "parent-2", childId: "child-2" }] });
    expect(await readWorkbooks(readers.parent("parent-1"), "child-2", NOW)).toBeNull();
  });
  it("copies only the fields it names, whatever a row holds", async () => {
    const SECRET = "RAW-CANARY";
    const view = await read({
      workbooks: [{ ...book(1), levels: [SECRET], profileBuild: SECRET } as MemoryWorkbook],
      dispatches: [{ ...own, number: 1, delivery: { ...mail, note: SECRET }, to_address: SECRET, text_body: SECRET } as never],
      deliveries: [{ ...own, workbookId: "wb-1", deliveredAt: "2026-11-05T20:00:00Z", actorId: SECRET } as never],
    });
    expect(JSON.stringify(view)).not.toContain(SECRET);
    expect(JSON.stringify(view)).not.toContain("workbook.pdf");
  });
  it.each(["corrections", "dispatches", "family"] as const)("a failed read of %s throws", async (table) => {
    await expect(read({ workbooks: [book(1)], fail: [table] })).rejects.toThrow(table);
  });
});

describe("the Home (#560, #1003)", () => {
  const own = { parentId: "parent-1", childId: "child-1" };
  const card = { cards: [{ ...own, cardSavedAt: "2026-10-20T00:00:00Z" }] };
  const switches = { progress: false, maya: false, scanPages: true };
  // The book was delivered on Monday 2026-11-02 in Vancouver. NOW is Wednesday 2026-11-04, so today is Day 3 and the week
  // is Days 1 to 5.
  const delivered = { ...card, deliveries: [{ ...own, workbookId: "wb-1", deliveredAt: "2026-11-02T20:00:00Z" }], workbooks: [{ ...own, id: "wb-1", number: 1, status: "shipped" }] };
  const page = (id: string, dayLabel: string | null) => ({ parentId: "parent-1", workbookId: "wb-1", id, dayLabel });
  const pages = [page("cover", null), ...[1, 2, 3, 4, 5].flatMap((d) => [page(`d${d}a`, `Day ${d}`), page(`d${d}b`, `Day ${d}`)])];
  const scan = (pageId: string, over: Record<string, string> = {}) => ({ ...own, workbookId: "wb-1", pageId, state: "saved", expiresAt: "2027-01-01T00:00:00Z", ...over });
  const scans = (...ids: string[]) => ids.map((id) => scan(id));
  const question = (pageId: string, standard: string | null) => ({ parentId: "parent-1", workbookId: "wb-1", pageId, standard });
  const read = (tables: Partial<Parameters<typeof parent>[0]> = {}, now = NOW) => readOverview(parent({ children: [leah, omar], ...delivered, pages, switches, ...tables }), "child-1", now);
  const circles = (view: Awaited<ReturnType<typeof read>>) => view?.week?.map((d) => `${d.label}:${d.state}`);
  // The parent-facing name (src/lib/skill-name.ts): the one Home's lists and sentences both say.
  const nameOf = (code: string) => plainSkillName(BC_SKILL_MAP.standards.find((s) => s.code === code)!.text);
  const textOf = (code: string) => capitalName(nameOf(code));

  it("is not found for another family's child, and for a stage with no Overview", async () => {
    const readers = memoryParentViewReaders({ children: [leah, omar], cards: [{ parentId: "parent-2", childId: "child-2", cardSavedAt: "2026-10-20T00:00:00Z" }] });
    expect(await readOverview(readers.parent("parent-1"), "child-2", NOW)).toBeNull();
    expect(await readOverview(parent({ tests: [test("t")], reports: [report("t")] }), "child-1", NOW)).toBeNull();
  });

  it("before any book is delivered: no week and no card; the mailed book is on its way", async () => {
    const view = await read({ deliveries: [] });
    expect(view).toEqual({ child: expect.objectContaining({ id: "child-1", stage: "first_book_coming" }), resultPreparing: false, resultLate: false, week: null, workbook: null, onTheWay: 1, scanPrompt: null, skills: expect.anything(), weekLine: null, highlights: [], summaryMonth: null });
    expect((await read({ deliveries: [], workbooks: [] }))?.onTheWay).toBeNull();
  });

  describe("while a newer book is in the mail", () => {
    // Book 1 was delivered on Monday 2 November; Book 2 shipped and has no confirmed delivery.
    const two = { workbooks: [{ ...own, id: "wb-1", number: 1, status: "shipped" }, { ...own, id: "wb-2", number: 2, status: "shipped" }] };
    const twoPages = [...pages, { parentId: "parent-1", workbookId: "wb-2", id: "2-d1a", dayLabel: "Day 1" }];
    it("keeps the newest delivered book's card and week, and says the next one is on its way", async () => {
      const view = await read({ ...two, pages: twoPages, scans: scans("d1a", "d1b") });
      expect(view?.workbook).toMatchObject({ number: 1, doneDays: 1, today: { day: 3, label: "Today" } });
      expect(circles(view)).toEqual(["Mon:done", "Tue:open", "Wed:today", "Thu:open", "Fri:open"]);
      expect(view?.onTheWay).toBe(2);
    });
    it("a book already delivered is not on its way, and the delivered one is the newest delivered", async () => {
      const both = { deliveries: [{ ...own, workbookId: "wb-1", deliveredAt: "2026-10-19T20:00:00Z" }, { ...own, workbookId: "wb-2", deliveredAt: "2026-11-02T20:00:00Z" }] };
      const view = await read({ ...two, ...both, pages: twoPages.map((p) => (p.workbookId === "wb-2" ? p : { ...p, id: `1-${p.id}` })) });
      expect(view?.workbook?.number).toBe(2);
      expect(view?.onTheWay).toBeNull();
    });
    it("a corrected delivery in the future does not count as delivered", async () => {
      const view = await read({ ...two, pages: twoPages, deliveries: [{ ...own, workbookId: "wb-1", deliveredAt: "2026-11-02T20:00:00Z" }, { ...own, workbookId: "wb-2", deliveredAt: "2026-11-20T20:00:00Z" }] });
      expect(view?.workbook?.number).toBe(1);
      expect(view?.onTheWay).toBe(2);
    });
  });

  describe("this week and the workbook card", () => {
    it.each([
      { situation: "on track", saved: ["d1a", "d1b", "d2a", "d2b", "d3a"], done: 2,
        states: ["Mon:done", "Tue:done", "Wed:today", "Thu:open", "Fri:open"], line: { lead: "On track this week.", text: "2 days done." } },
      { situation: "behind", saved: ["d1a", "d1b", "d2a"], done: 1,
        states: ["Mon:done", "Tue:open", "Wed:today", "Thu:open", "Fri:open"], line: { lead: "A quieter week.", text: "1 day done. Day 2 is ready when Leah is." } },
      { situation: "ahead", saved: ["d1a", "d1b", "d2a", "d2b", "d3a", "d3b", "d4a", "d4b"], done: 4,
        states: ["Mon:done", "Tue:done", "Wed:today_done", "Thu:done", "Fri:open"], line: { lead: "On track this week.", text: "4 days done." } },
      { situation: "scanning out of order", saved: ["d1a", "d1b", "d3a", "d3b"], done: 2,
        states: ["Mon:done", "Tue:open", "Wed:today_done", "Thu:open", "Fri:open"], line: { lead: "Catching up this week.", text: "2 days done. Day 2 is ready when Leah is." } },
    ])("the card and week agree when $situation", async ({ saved, done, states, line }) => {
      const view = await read({ scans: scans(...saved) });
      expect(view?.workbook).toEqual({ number: 1, doneDays: done, totalDays: 10, today: { day: 3, label: "Today", title: null } });
      expect(circles(view)).toEqual(states);
      expect(view?.weekLine).toEqual(line);
    });
    it("before the first scan: zero days done and the prompt to scan the first pages", async () => {
      const view = await read({});
      expect(circles(view)).toEqual(["Mon:open", "Tue:open", "Wed:today", "Thu:open", "Fri:open"]);
      expect(view?.workbook?.doneDays).toBe(0);
      expect(view?.scanPrompt).toEqual({ day: 3, pages: 2 });
    });
    it("no prompt after the first scan, and none where the Scan tab is off", async () => {
      expect((await read({ scans: scans("d1a") }))?.scanPrompt).toBeNull();
      expect((await read({ switches: { progress: false, maya: false, scanPages: false } }))?.scanPrompt).toBeNull();
    });
    it("counts a day only when every page of it has a saved photo that has not expired", async () => {
      const view = await read({ scans: [scan("d1a"), scan("d1b", { expiresAt: "2026-11-01T00:00:00Z" }), scan("d2a"), scan("d2b", { state: "pending" })] });
      expect(circles(view)).toEqual(["Mon:open", "Tue:open", "Wed:today", "Thu:open", "Fri:open"]);
      expect(view?.workbook?.doneDays).toBe(0);
    });
    it("counts only the newest shipped workbook, and only the family's own rows", async () => {
      const workbooks = [{ ...own, id: "wb-1", number: 1, status: "shipped" }, { ...own, id: "wb-2", number: 2, status: "shipped" }];
      const deliveries = [{ ...own, workbookId: "wb-2", deliveredAt: "2026-11-02T20:00:00Z" }];
      const newer = pages.map((p) => ({ ...p, workbookId: "wb-2", id: `2-${p.id}` }));
      const view = await read({ workbooks, deliveries, pages: [...pages, ...newer], scans: [...scans("d1a", "d1b"), { ...scan("2-d1a"), workbookId: "wb-2" }, { ...scan("2-d1b"), workbookId: "wb-2", parentId: "parent-2" }] });
      expect(view?.workbook?.number).toBe(2);
      expect(circles(view)).toEqual(["Mon:open", "Tue:open", "Wed:today", "Thu:open", "Fri:open"]);
    });
    it("a weekend shows the Friday's day, named by its weekday", async () => {
      const saturday = Date.parse("2026-11-07T20:00:00Z");
      const view = await read({ scans: scans("d1a", "d1b", "d2a", "d2b", "d3a", "d3b", "d4a", "d4b", "d5a", "d5b") }, saturday);
      expect(circles(view)).toEqual(["Mon:done", "Tue:done", "Wed:done", "Thu:done", "Fri:done"]);
      expect(view?.workbook).toMatchObject({ doneDays: 5, today: { day: 5, label: "Friday" } });
    });
    it("a book delivered on a weekend starts on Day 1, named by the Monday it starts on, never Friday", async () => {
      const view = await read({ deliveries: [{ ...own, workbookId: "wb-1", deliveredAt: "2026-11-07T20:00:00Z" }] }, Date.parse("2026-11-07T21:00:00Z"));
      expect(view?.workbook).toMatchObject({ doneDays: 0, today: { day: 1, label: "Day 1 · Monday" } });
      expect(circles(view)).toEqual(["Mon:open", "Tue:open", "Wed:open", "Thu:open", "Fri:open"]);
    });
    describe("after the book's last day, or once the plan ended", () => {
      const all = (n: number) => Array.from({ length: n }, (_, i) => i + 1).flatMap((d) => [page(`e${d}a`, `Day ${d}`), page(`e${d}b`, `Day ${d}`)]);
      const full = { pages: all(10), scans: all(9).map((p) => scan(p.id)) };
      // Delivered Monday 2 November: Day 10 is Friday 13 November. Saturday 14 and Tuesday 17 are after it.
      it("has no Today row and no ringed circle, and the card keeps the book and its completed days", async () => {
        for (const at of ["2026-11-14T20:00:00Z", "2026-11-17T20:00:00Z"]) {
          const view = await read(full, Date.parse(at));
          expect(view?.workbook).toMatchObject({ number: 1, doneDays: 9, totalDays: 10, today: null });
          expect(view?.week?.some((d) => d.state === "today" || d.state === "today_done")).toBe(false);
          expect(view?.scanPrompt).toBeNull();
        }
      });
      it("shows all ten days done when the workbook is complete", async () => {
        const view = await read({ pages: all(10), scans: all(10).map((p) => scan(p.id)) }, Date.parse("2026-11-14T20:00:00Z"));
        expect(view?.workbook).toEqual({ number: 1, doneDays: 10, totalDays: 10, today: null });
        expect(circles(view)).toEqual(["Mon:done", "Tue:done", "Wed:done", "Thu:done", "Fri:done"]);
        expect(view?.weekLine).toEqual({ lead: "On track this week.", text: "5 days done." });
      });
      it("crosses into week two at Monday midnight in family time", async () => {
        const tables = { pages: all(10), scans: all(6).map((p) => scan(p.id)) };
        const sunday = await read(tables, Date.parse("2026-11-09T06:59:59Z"));
        const monday = await read(tables, Date.parse("2026-11-09T07:00:00Z"));
        expect(sunday?.workbook).toMatchObject({ doneDays: 6, today: { day: 5, label: "Friday" } });
        expect(monday?.workbook).toMatchObject({ doneDays: 6, today: { day: 6, label: "Today" } });
        expect(circles(sunday)).toEqual(["Mon:done", "Tue:done", "Wed:done", "Thu:done", "Fri:done"]);
        expect(circles(monday)).toEqual(["Mon:today_done", "Tue:open", "Wed:open", "Thu:open", "Fri:open"]);
        expect(sunday?.weekLine?.text).toBe("5 days done.");
        expect(monday?.weekLine?.text).toBe("1 day done.");
      });
      it("the book's last day is still Today", async () => {
        const view = await read(full, Date.parse("2026-11-13T20:00:00Z"));
        expect(view?.workbook).toMatchObject({ doneDays: 9, today: { day: 10, label: "Today" } });
        expect(circles(view)?.[4]).toBe("Fri:today");
      });
      it("an ended plan has no Today row or ringed circle, mid-book", async () => {
        const view = await read({ plans: [{ ...own, kind: "ended" }] });
        expect(view?.child.stage).toBe("ended");
        expect(view?.workbook).toMatchObject({ doneDays: 0, today: null });
        expect(view?.week?.some((d) => d.state === "today" || d.state === "today_done")).toBe(false);
      });
    });
    it("reads the delivery day in the family's time zone", async () => {
      // 02:00 UTC on Tuesday 3 November is Monday 2 November in Vancouver: Day 1 is Monday, so Wednesday is Day 3.
      const view = await read({ deliveries: [{ ...own, workbookId: "wb-1", deliveredAt: "2026-11-03T02:00:00Z" }] });
      expect(view?.workbook?.today?.day).toBe(3);
    });
    describe("the printed title for Today", () => {
      const PLAN = ["Hundreds, tens and ones", "Comparing numbers", "Adding with regrouping", "Subtracting across a zero", "Review"];
      const plan = PLAN.map((topic, i) => ({ ...own, workbookId: "wb-1", day: i + 1, topic }));
      // Most of Day 3's questions are on 3.1, whose name is not the plan's name for the day.
      const questions = [question("d3a", "3.1"), question("d3a", "3.1"), question("d3b", "3.2")];
      const tables = { scans: scans("d1a", "d1b", "d2a", "d2b", "d3a"), questions, planTopics: plan };
      /** The Workbooks tab's schedule for the same book: the plan's topics, 8 required pages a day. */
      const schedule = (): ReadySchedule => ({
        kind: "ready", child: { id: "child-1", parentId: "parent-1", firstName: "Leah" }, book: { id: "wb-1", number: 1 }, dailyTime: "about 19 minutes", minutes: { min: 19, max: 19 }, scansUnknown: false,
        rows: PLAN.map((topic, i) => ({ day: i + 1, topic, second: "", pages: [3 + i * 8, 10 + i * 8] as [number, number], requiredMinutes: 19, extra: false,
          requiredPages: Array.from({ length: 8 }, (_, k) => 3 + i * 8 + k), scan: { kind: "unknown" as const }, marks: { kind: "none" as const, marked: 0, total: 8 } })),
      });

      it("Home and the Workbooks tab name Day 3 the same way", async () => {
        expect(textOf("3.1")).not.toBe(PLAN[2]);
        const home = await read(tables);
        expect(home?.workbook?.today?.title).toBe("Adding with regrouping");
        const reader = parent({ children: [leah, omar], ...delivered, pages, switches, ...tables });
        const workbooks = await readWorkbooks(reader, "child-1", NOW);
        const cover = withHomeCount(bookDays(schedule(), { start: workbooks!.current!.deliveredOn, today: workbooks!.today, ended: false }), workbooks!.homeScan!);
        expect(cover.day).toBe(home!.workbook!.today!.day);
        expect(cover.topic).toBe(home!.workbook!.today!.title);
        expect(cover.rows[cover.day - 1].topic).toBe(home!.workbook!.today!.title);
        expect([cover.scanned, cover.total, cover.percent]).toEqual([5, 10, 50]);
      });
      it("names each day of the week by the plan, whichever day it is", async () => {
        for (const [day, at] of [[1, "2026-11-02T20:00:00Z"], [2, "2026-11-03T20:00:00Z"], [4, "2026-11-05T20:00:00Z"]] as const) {
          expect((await read(tables, Date.parse(at)))?.workbook?.today?.title).toBe(PLAN[day - 1]);
        }
      });
      it("omits the title when no usable printed title can be read", async () => {
        const cases: MemoryParentViewTables[] = [
          { ...tables, fail: ["planTopics"] },
          { ...tables, planTopics: plan.filter((r) => r.day !== 3) },
          { ...tables, planTopics: [] },
          { ...tables, planTopics: plan.map((r) => ({ ...r, topic: " " })) },
          { ...tables, planTopics: plan.map((r) => ({ ...r, parentId: "parent-2" })) },
        ];
        for (const input of cases) {
          expect((await read(input))?.workbook?.today).toEqual({ day: 3, label: "Today", title: null });
        }
      });
    });
  });

  describe("the skills since the child started", () => {
    const tally = (standard: string, correct: number, total: number, at = "2026-10-30T18:00:00Z") => ({ ...own, assessmentId: "t", standard, correct, total, at });
    const change = (standard: string, state: "mastered" | "working_on" | "needs_review" | "not_started", changedAt: string) => ({ ...own, standard, state, changedAt });
    const on = { switches: { progress: true, maya: false, scanPages: true }, tests: [test("t")], reports: [report("t")] };
    const skills = async (tables: Partial<Parameters<typeof parent>[0]> = {}) => (await read({ ...on, ...tables }))?.skills;

    it("lists Mastered, Learning and Needs help from the skill state rule", async () => {
      expect(await skills({ skillTests: [tally("3.1", 4, 4), tally("3.2", 0, 4)], questions: [question("d1a", "3.4")] })).toEqual({
        mastered: [{ code: "3.1", name: textOf("3.1"), masteredOn: null, sentence: null }],
        learning: [{ code: "3.4", name: textOf("3.4"), masteredOn: null, sentence: null }],
        needsHelp: [{ code: "3.2", name: textOf("3.2"), masteredOn: null, sentence: "Came up tricky on the test." }],
      });
    });
    describe("Needs help also counts a Learning skill the child is struggling with now (#1025)", () => {
      // NOW is 2026-11-04 10:00 in Vancouver. The window is the family-time days 2026-10-22 to 2026-11-04.
      const answered = (standard: string, rights: boolean[], at = "2026-11-03T18:00:00Z") => rights.map((right) => ({ standard, right, review: false, at }));
      const withMarks = (skillMarks: ReturnType<typeof answered>) => ({ overviewProgress: [{ ...own, marks: [], skillMarks }] });
      const inBook = { questions: [question("d1a", "3.4"), question("d1b", "3.5")] };

      it("moves it from Learning to Needs help, beside a needs_review skill, in the skill map's order", async () => {
        const got = await skills({ ...inBook, skillTests: [tally("3.2", 0, 4)], ...withMarks(answered("3.4", [false, false, true, false])) });
        expect(got?.needsHelp).toEqual([
          { code: "3.2", name: textOf("3.2"), masteredOn: null, sentence: "Came up tricky on the test." },
          { code: "3.4", name: textOf("3.4"), masteredOn: null, sentence: "Has been tricky on recent pages." },
        ]);
        expect(got?.learning).toEqual([{ code: "3.5", name: textOf("3.5"), masteredOn: null, sentence: null }]);
      });
      it("3 answers do not count, and exactly 60% right does not count", async () => {
        expect((await skills({ ...inBook, ...withMarks(answered("3.4", [false, false, false])) }))?.needsHelp).toEqual([]);
        expect((await skills({ ...inBook, ...withMarks(answered("3.4", [true, true, true, false, false])) }))?.needsHelp).toEqual([]);
      });
      it("59% counts", async () => {
        const rights = [...Array<boolean>(13).fill(true), ...Array<boolean>(9).fill(false)];
        expect((await skills({ ...inBook, ...withMarks(answered("3.4", rights)) }))?.needsHelp.map((s) => s.code)).toEqual(["3.4"]);
      });
      it("ignores answers older than 14 days, by the family's day: 2026-10-21 is out, 2026-10-22 is in", async () => {
        const four = [false, false, false, false];
        expect((await skills({ ...inBook, ...withMarks(answered("3.4", four, "2026-10-21T18:00:00Z")) }))?.needsHelp).toEqual([]);
        expect((await skills({ ...inBook, ...withMarks(answered("3.4", four, "2026-10-22T18:00:00Z")) }))?.needsHelp.map((s) => s.code)).toEqual(["3.4"]);
        // 06:00 UTC on 2026-10-22 is still 2026-10-21 in Vancouver (UTC-7): out of the window there.
        expect((await skills({ ...inBook, ...withMarks(answered("3.4", four, "2026-10-22T06:00:00Z")) }))?.needsHelp).toEqual([]);
      });
      it("blank answers are not wrong: 4 blanks, or 3 wrong and 1 blank, leave it Learning; 4 wrong moves it", async () => {
        // The skill state rule still reads a blank as not right (skillMarks), so only helpMarks carries the flag.
        const at = "2026-11-03T18:00:00Z";
        const mark = (right: boolean, blank: boolean) => ({ standard: "3.4", right, review: false, at, blank });
        const withHelpMarks = (helpMarks: ReturnType<typeof mark>[]) => ({ overviewProgress: [{ ...own, marks: [], skillMarks: helpMarks.map(({ standard, right, review, at }) => ({ standard, right, review, at })), helpMarks }] });
        const four = (...kinds: ("wrong" | "blank")[]) => kinds.map((k) => mark(false, k === "blank"));
        const learning = async (tables: ReturnType<typeof withHelpMarks>) => (await skills({ ...inBook, ...tables }))!;
        expect((await learning(withHelpMarks(four("blank", "blank", "blank", "blank")))).needsHelp).toEqual([]);
        expect((await learning(withHelpMarks(four("wrong", "wrong", "wrong", "blank")))).needsHelp).toEqual([]);
        const struggling = await learning(withHelpMarks(four("wrong", "wrong", "wrong", "wrong")));
        expect(struggling.needsHelp.map((s) => s.code)).toEqual(["3.4"]);
        const blankToo = await learning(withHelpMarks([...four("wrong", "wrong", "wrong", "wrong"), ...four("blank", "blank")]));
        expect(blankToo.needsHelp.map((s) => s.code)).toEqual(["3.4"]);
      });
      it("a skill that recovers goes back to Learning", async () => {
        const wrong = answered("3.4", [false, false, false, false], "2026-10-30T18:00:00Z");
        expect((await skills({ ...inBook, ...withMarks(wrong) }))?.needsHelp.map((s) => s.code)).toEqual(["3.4"]);
        const recovered = [...wrong, ...answered("3.4", [true, true, true, true, true, true], "2026-11-03T18:00:00Z")];
        const got = await skills({ ...inBook, ...withMarks(recovered) });
        expect(got?.needsHelp).toEqual([]);
        expect(got?.learning.map((s) => s.code)).toEqual(["3.4", "3.5"]);
      });
      it("never moves a Mastered skill or a skill that is not in the book", async () => {
        // 3.1: four wrong marks on 2026-10-25, then a test with every answer right on 2026-10-30: Mastered, and it stays so.
        const marks = [...answered("3.1", [false, false, false, false], "2026-10-25T18:00:00Z"), ...answered("3.7", [false, false, false, false])];
        const got = await skills({ ...inBook, skillTests: [tally("3.1", 4, 4)], ...withMarks(marks) });
        expect(got?.mastered.map((s) => s.code)).toEqual(["3.1"]);
        expect(got?.needsHelp).toEqual([]);
        expect(got?.learning.map((s) => s.code)).toEqual(["3.4", "3.5"]);
      });
    });
    it("dates a Mastered skill by the history's changed_at, in family time: today, a weekday within the week, else the date", async () => {
      const got = await skills({
        skillTests: [tally("3.1", 4, 4), tally("3.3", 4, 4), tally("3.5", 4, 4), tally("3.6", 4, 4)],
        // The child's first batch (3.2) is the starting state; every later row is dated.
        history: [change("3.2", "needs_review", "2026-10-19T20:00:00Z"), change("3.1", "mastered", "2026-11-03T20:00:00Z"), change("3.3", "mastered", "2026-11-04T17:00:00Z"), change("3.5", "mastered", "2026-10-20T20:00:00Z")],
      });
      // Newest first; a skill with no recorded row has no date and comes last.
      expect(got?.mastered.map((s) => [s.code, s.masteredOn])).toEqual([["3.3", "today"], ["3.1", "Tuesday"], ["3.5", "Oct 20"], ["3.6", null]]);
    });
    it("a skill in the child's first batch of history rows is the starting state: no date; later rows are dated", async () => {
      // Every row of the first rebuild shares one time, whenever the child started (the table began on 2026-11-04).
      const first = "2026-11-03T20:00:00Z";
      const got = await skills({
        skillTests: [tally("3.1", 4, 4), tally("3.3", 4, 4), tally("3.5", 4, 4)],
        history: [change("3.1", "mastered", first), change("3.3", "working_on", first), change("3.3", "mastered", "2026-11-04T17:00:00Z"), change("3.5", "mastered", first)],
      });
      expect(got?.mastered.map((s) => [s.code, s.masteredOn])).toEqual([["3.3", "today"], ["3.1", null], ["3.5", null]]);
    });
    it("a skill that was mastered and is not now has no date", async () => {
      const got = await skills({ skillTests: [tally("3.1", 4, 4)], history: [change("3.1", "mastered", "2026-11-03T20:00:00Z"), change("3.1", "working_on", "2026-11-04T01:00:00Z")], questions: [question("d1a", "3.1")] });
      expect(got?.mastered.map((s) => [s.code, s.masteredOn])).toEqual([["3.1", null]]);
    });
    it("counts a skill mastered at any grade, not only the working level's", async () => {
      expect((await skills({ skillTests: [tally("2.1", 4, 4), tally("3.1", 4, 4), tally("4.1", 4, 4)] }))?.mastered.map((s) => s.code)).toEqual(["2.1", "3.1", "4.1"]);
    });
    it("a history that cannot be read leaves the dates out and keeps the counts", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const got = await skills({ skillTests: [tally("3.1", 4, 4)], history: [change("3.1", "mastered", "2026-11-03T20:00:00Z")], fail: ["history"] });
      expect(got?.mastered).toEqual([{ code: "3.1", name: textOf("3.1"), masteredOn: null, sentence: null }]);
    });
    describe("the sentence under each skill (#989)", () => {
      // NOW is Wednesday 2026-11-04 in Vancouver. A skill's sentence is written by src/lib/skill-sentences.ts from the rule's
      // state and the rows behind it; with too little, the row has none.
      const inBook = { questions: [question("d1a", "3.4"), question("d1b", "3.5")] };
      const answered = (standard: string, results: ("r" | "w")[]) => results.map((r, i) => ({ standard, right: r === "r", review: false, at: `2026-10-${String(28 + i).padStart(2, "0")}T18:00:00Z` }));
      const withMarks = (skillMarks: ReturnType<typeof answered>) => ({ overviewProgress: [{ ...own, marks: [], skillMarks }] });
      const mistake = (standard: string, cause: string, at: string) => ({ ...own, standard, cause, at });
      const sentences = (list: { code: string; sentence: string | null }[] | undefined) => list?.map((s) => [s.code, s.sentence]);

      it("Mastered: the date the list shows, nothing about how, and none with no recorded date", async () => {
        const got = await skills({
          skillTests: [tally("3.1", 4, 4), tally("3.3", 4, 4)],
          history: [change("3.2", "needs_review", "2026-10-19T20:00:00Z"), change("3.1", "mastered", "2026-11-03T20:00:00Z")],
        });
        expect(sentences(got?.mastered)).toEqual([["3.1", "Mastered Tuesday"], ["3.3", null]]);
        expect(got?.mastered.map((s) => s.masteredOn)).toEqual(["Tuesday", null]);
      });
      it("Learning: getting steadier after a wrong answer and a run of right ones", async () => {
        const got = await skills({ ...inBook, ...withMarks(answered("3.4", ["w", "r", "r", "r"])) });
        expect(sentences(got?.learning)).toEqual([["3.4", "Getting steadier: right the last 3 times"], ["3.5", null]]);
        expect(JSON.stringify(got)).not.toMatch(/%|percent/);
      });
      it("Learning: says 'Started' from the child's first marked answer on the skill, not from a history row", async () => {
        const first = "2026-11-02T20:00:00Z";
        const history = [change("3.6", "mastered", first), change("3.4", "working_on", "2026-11-03T20:00:00Z")];
        // A history row alone, with no marked answer: no start.
        expect(sentences((await skills({ ...inBook, history }))?.learning)).toEqual([["3.4", null], ["3.5", null]]);
        // One wrong answer and one right one on 3.4, the first on Oct 28: the start is that day, whatever the history says.
        const got = await skills({ ...inBook, history, ...withMarks(answered("3.4", ["w", "r"])) });
        expect(sentences(got?.learning)).toEqual([["3.4", "Started Oct 28"], ["3.5", null]]);
        // A blank answer is not a start.
        const blankMark = { standard: "3.4", right: false, review: false, at: "2026-11-01T18:00:00Z" };
        const blank = await skills({ ...inBook, overviewProgress: [{ ...own, marks: [], skillMarks: [blankMark], helpMarks: [{ ...blankMark, blank: true }] }] });
        expect(sentences(blank?.learning)).toEqual([["3.4", null], ["3.5", null]]);
      });
      it("Learning: a skill only in a Book 2 that has not been delivered has no start, whatever a rebuild recorded before delivery", async () => {
        // Book 1 was delivered; Book 2 shipped and is in the mail. 3.5 is only in Book 2, and a rebuild already wrote its working_on row.
        const two = { workbooks: [{ ...own, id: "wb-1", number: 1, status: "shipped" }, { ...own, id: "wb-2", number: 2, status: "shipped" }] };
        const book2 = { ...two, questions: [question("d1a", "3.4"), { parentId: "parent-1", workbookId: "wb-2", pageId: "2-d0", standard: "3.5" }] };
        const rebuilt = [change("3.6", "mastered", "2026-11-02T20:00:00Z"), change("3.5", "working_on", "2026-11-03T20:00:00Z")];
        const before = await skills({ ...book2, history: rebuilt });
        expect(sentences(before?.learning)).toEqual([["3.5", null]]);
        // Once the child has answered the skill on a marked page, the sentence says that day.
        const after = await skills({ ...book2, history: rebuilt, ...withMarks(answered("3.5", ["w", "r"])) });
        expect(sentences(after?.learning)).toEqual([["3.5", "Started Oct 28"]]);
      });
      it("Needs help: the table's text for a cause marked on 2 wrong answers lately, and no next-workbook clause without a next workbook", async () => {
        const got = await skills({
          ...inBook, skillTests: [tally("3.2", 0, 4)],
          mistakes: [mistake("3.2", "O3", "2026-11-02T18:00:00Z"), mistake("3.2", "O3", "2026-11-03T18:00:00Z"), mistake("3.4", "O1", "2026-11-03T18:00:00Z")],
        });
        // 3.4 has one wrong answer with a cause only: not a habit, and it is not struggling, so it is Learning with no sentence.
        expect(sentences(got?.needsHelp)).toEqual([["3.2", "Forgets to carry when adding."]]);
        expect(sentences(got?.learning)).toEqual([["3.4", null], ["3.5", null]]);
      });
      it("Needs help: says Back in the next workbook only when the book in the mail has the skill", async () => {
        const mailed = { workbooks: [{ ...own, id: "wb-1", number: 1, status: "shipped" }, { ...own, id: "wb-2", number: 2, status: "shipped" }] };
        const twoQuestions = (...standards: string[]) => ({ ...mailed, questions: [question("d1a", "3.4"), ...standards.map((standard, i) => ({ parentId: "parent-1", workbookId: "wb-2", pageId: `2-d${i}`, standard }))] });
        // 3.2 is struggling (a Learning skill in the newest book) or, in a book without it, weak on the test: Needs help either way.
        const causes = { skillTests: [tally("3.2", 0, 4)], ...withMarks(answered("3.2", ["w", "w", "r", "w"])), mistakes: [mistake("3.2", "O3", "2026-11-02T18:00:00Z"), mistake("3.2", "O3", "2026-11-03T18:00:00Z")] };
        const has = await skills({ ...twoQuestions("3.2", "3.5"), ...causes });
        expect(sentences(has?.needsHelp)).toEqual([["3.2", "Forgets to carry when adding. Back in the next workbook."]]);
        const lacks = await skills({ ...twoQuestions("3.5"), ...causes });
        expect(sentences(lacks?.needsHelp)).toEqual([["3.2", "Forgets to carry when adding."]]);
        // Book 1 is the book in the mail: nothing comes before it, so it is never "the next workbook".
        const first = await skills({ ...inBook, ...causes, deliveries: [] });
        expect(sentences(first?.needsHelp)).toEqual([["3.2", "Forgets to carry when adding."]]);
        // No book in the mail: the newest shipped book is the delivered one, so there is no next workbook yet.
        expect(sentences((await skills({ ...inBook, ...causes }))?.needsHelp)).toEqual([["3.2", "Forgets to carry when adding."]]);
        // A plan that ended has no next workbook.
        const ended = await skills({ ...twoQuestions("3.2"), ...causes, plans: [{ ...own, kind: "ended" }] });
        expect(sentences(ended?.needsHelp)).toEqual([["3.2", "Forgets to carry when adding."]]);
      });
      it("Needs help: a struggling Learning skill with no cause says it has been tricky", async () => {
        const got = await skills({ ...inBook, ...withMarks(answered("3.4", ["w", "w", "r", "w"])) });
        expect(sentences(got?.needsHelp)).toEqual([["3.4", "Has been tricky on recent pages."]]);
      });
      it("a cause older than 14 days, or another child's, names no mistake", async () => {
        const base = { ...inBook, skillTests: [tally("3.2", 0, 4)] };
        const old = await skills({ ...base, mistakes: [mistake("3.2", "O3", "2026-10-10T18:00:00Z"), mistake("3.2", "O3", "2026-10-11T18:00:00Z")] });
        expect(sentences(old?.needsHelp)).toEqual([["3.2", "Came up tricky on the test."]]);
        const theirs = await skills({ ...base, mistakes: [{ ...own, childId: "child-2", standard: "3.2", cause: "O3", at: "2026-11-02T18:00:00Z" }, { ...own, childId: "child-2", standard: "3.2", cause: "O3", at: "2026-11-03T18:00:00Z" }] });
        expect(sentences(theirs?.needsHelp)).toEqual([["3.2", "Came up tricky on the test."]]);
      });
      it("a cause read that fails leaves the mistake out and the rest as it was", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const got = await skills({ ...inBook, skillTests: [tally("3.2", 0, 4)], mistakes: [mistake("3.2", "O3", "2026-11-02T18:00:00Z"), mistake("3.2", "O3", "2026-11-03T18:00:00Z")], fail: ["mistakes"] });
        expect(sentences(got?.needsHelp)).toEqual([["3.2", "Came up tricky on the test."]]);
      });
    });
    it("shows with the Progress tab off too: only the tab stays behind its switch (2026-11-14)", async () => {
      expect(await skills({ skillTests: [tally("3.1", 4, 4)], switches })).not.toBeNull();
    });
    it("a failed marking read hides the skills and keeps the week and the card", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const view = await read({ ...on, skillTests: [tally("3.1", 4, 4)], fail: ["overviewProgress"] });
      expect(view?.skills).toBeNull();
      expect(view?.week).not.toBeNull();
    });
    it("a failed read of the tallies hides the skills too: an empty read would show every skill as not started", async () => {
      expect((await read({ ...on, fail: ["skillTests"] }))?.skills).toBeNull();
    });
  });

  describe("the week line and Highlights (#990)", () => {
    // NOW is Wednesday 2026-11-04, Day 3. The book was delivered on Monday 2 November, so Days 1 and 2 are behind us.
    // The child started on 2026-10-31; the first batch of history rows is dated before the week.
    const tally = (standard: string, correct: number, total: number) => ({ ...own, assessmentId: "t", standard, correct, total, at: "2026-10-30T18:00:00Z" });
    const change = (standard: string, state: "mastered" | "working_on" | "needs_review", changedAt: string) => ({ ...own, standard, state, changedAt });
    // A wrong answer marked on `markedOn` (a day, at 6 p.m. UTC) from the page of Day `bookDay` of Book 1 (the page's own label, not the marking day).
    const wrongOn = (standard: string, ...entries: [markedOn: string, bookDay: number][]) => entries.map(([d, bookDay]) => ({ standard, right: false, review: false, at: `${d}T18:00:00Z`, blank: false, day: `wb-1:${bookDay}` }));
    const withMarks = (helpMarks: ReturnType<typeof wrongOn>) => ({ overviewProgress: [{ ...own, marks: [], skillMarks: helpMarks.map(({ standard, right, review, at }) => ({ standard, right, review, at })), helpMarks }] });
    const base = { switches: { progress: true, maya: false, scanPages: true }, tests: [test("t")], reports: [report("t")] };
    const START = change("3.4", "working_on", "2026-11-01T20:00:00Z");
    const story = async (tables: Partial<Parameters<typeof parent>[0]> = {}, now = NOW) => { const v = await read({ ...base, ...tables }, now); return { line: v?.weekLine && `${v.weekLine.lead} ${v.weekLine.text}`, highlights: v?.highlights }; };

    it("on track: the days done against the days behind us, and the new skills mastered since Monday, from the history", async () => {
      expect(await story({ scans: scans("d1a", "d1b", "d2a", "d2b"), skillTests: [tally("3.1", 4, 4)], history: [START, change("3.1", "mastered", "2026-11-03T20:00:00Z")] })).toEqual({
        line: "On track this week. 2 days done, and 1 new skill mastered since Monday.",
        highlights: [`Leah mastered ${nameOf("3.1")} this week.`],
      });
      expect((await story({ scans: scans("d1a", "d1b", "d2a", "d2b") })).line).toBe("On track this week. 2 days done.");
    });
    it("names several new masteries by their count", async () => {
      const got = await story({ scans: scans("d1a", "d1b", "d2a", "d2b"), skillTests: [tally("3.1", 4, 4), tally("3.3", 4, 4)], history: [START, change("3.1", "mastered", "2026-11-03T20:00:00Z"), change("3.3", "mastered", "2026-11-04T17:00:00Z")] });
      expect(got.line).toBe("On track this week. 2 days done, and 2 new skills mastered since Monday.");
      expect(got.highlights).toEqual(["Leah mastered 2 skills this week."]);
    });
    it("a bit behind: a quieter week, and the first open day is ready when the child is", async () => {
      expect((await story({ scans: scans("d1a", "d1b") })).line).toBe("A quieter week. 1 day done. Day 2 is ready when Leah is.");
    });
    it("catching up: an earlier day is open and the latest is done", async () => {
      expect((await story({ scans: scans("d2a", "d2b") })).line).toBe("Catching up this week. 1 day done. Day 1 is ready when Leah is.");
    });
    it("a day with only some pages scanned is not done", async () => {
      expect((await story({ scans: scans("d1a", "d1b", "d2a") })).line).toBe("A quieter week. 1 day done. Day 2 is ready when Leah is.");
    });
    it("no scans this week: a quiet week, said gently, when the family has scanned another book's pages", async () => {
      const elsewhere = [{ ...own, workbookId: "wb-0", pageId: "old", state: "saved", expiresAt: "2027-01-01T00:00:00Z", takenAt: "2026-10-20T20:00:00Z" }];
      expect((await story({ scans: elsewhere })).line).toBe("A quiet week so far. Nothing scanned yet. Day 1 is ready when Leah is.");
    });
    it("before the family's first scan, the scan prompt speaks and the line does not; with no Scan tab there is no line", async () => {
      expect(await story({})).toEqual({ line: null, highlights: [] });
      expect((await story({ scans: scans("d1a", "d1b"), switches: { progress: true, maya: false, scanPages: false } })).line).toBeNull();
    });
    it("nothing to say: a Monday with nothing done yet has no line, and no skill news means no Highlights", async () => {
      const elsewhere = [{ ...own, workbookId: "wb-0", pageId: "old", state: "saved", expiresAt: "2027-01-01T00:00:00Z", takenAt: "2026-10-20T20:00:00Z" }];
      expect(await story({ scans: elsewhere }, Date.parse("2026-11-02T22:00:00Z"))).toEqual({ line: null, highlights: [] });
    });
    it("no line after the plan ended or once the book is over; the Highlights about skills stay", async () => {
      const ended = await story({ scans: scans("d1a", "d1b"), plans: [{ ...own, kind: "ended" }], skillTests: [tally("3.1", 4, 4)], history: [START, change("3.1", "mastered", "2026-11-03T20:00:00Z")] });
      expect(ended.line).toBeNull();
      expect(ended.highlights).toHaveLength(1);
      expect((await story({ scans: scans("d1a", "d1b") }, Date.parse("2026-11-20T18:00:00Z"))).line).toBeNull();
    });
    it("a repeated mistake: a Needs help skill that was wrong on 2 different days, named in its own words", async () => {
      const got = await story({ scans: scans("d1a", "d1b"), skillTests: [tally("3.2", 0, 4)], ...withMarks(wrongOn("3.2", ["2026-11-02", 1], ["2026-11-03", 2], ["2026-11-03", 2])) });
      expect(got.highlights).toEqual([`The one to watch is ${nameOf("3.2")}: it was tricky on 2 workbook days in the last two weeks.`]);
    });
    it("wrong answers on one day, or on a skill that is not Needs help, make no repeated mistake", async () => {
      expect((await story({ scans: scans("d1a", "d1b"), skillTests: [tally("3.2", 0, 4)], ...withMarks(wrongOn("3.2", ["2026-11-03", 2], ["2026-11-03", 2], ["2026-11-03", 2])) })).highlights).toEqual([]);
      // A Learning skill with 2 wrong answers is too few to be struggling, so it is not Needs help and is not named.
      expect((await story({ scans: scans("d1a", "d1b"), questions: [question("d1a", "3.4")], ...withMarks(wrongOn("3.4", ["2026-11-02", 1], ["2026-11-03", 2])) })).highlights).toEqual([]);
    });
    it("names a skill in the same plain words in the lists and in the sentences: no aside, no prefix", async () => {
      const done = { scans: scans("d1a", "d1b", "d2a", "d2b"), skillTests: [tally("1.3", 4, 4), tally("8.14", 4, 4)] };
      const view = await read({ ...base, ...done, history: [START, change("1.3", "mastered", "2026-11-03T20:00:00Z")] });
      expect(view?.highlights).toEqual(["Leah mastered addition and subtraction to 20 this week."]);
      expect(view?.skills?.mastered.map((m) => m.name)).toEqual(["Addition and subtraction to 20", "Best buys"]);
      expect(nameOf("1.3")).toBe("addition and subtraction to 20");
      expect(nameOf("8.14")).toBe("best buys");
    });
    it("a skill name too long for a sentence: the count form for a mastery, no sentence for the one to watch, the whole name in the lists", async () => {
      const long = nameOf("3.14");
      expect(long.length).toBeGreaterThan(45);
      const mastered = await read({ ...base, scans: scans("d1a", "d1b"), skillTests: [tally("3.14", 4, 4)], history: [START, change("3.14", "mastered", "2026-11-03T20:00:00Z")] });
      expect(mastered?.highlights).toEqual(["Leah mastered 1 new skill this week."]);
      expect(mastered?.skills?.mastered.map((m) => m.name)).toEqual([capitalName(long)]);
      const watched = await story({ scans: scans("d1a", "d1b"), skillTests: [tally("3.14", 0, 4)], ...withMarks(wrongOn("3.14", ["2026-11-02", 1], ["2026-11-03", 2])) });
      expect(watched.highlights).toEqual([]);
      // The skill is still in Needs help, by its whole name.
      expect((await read({ ...base, skillTests: [tally("3.14", 0, 4)], ...withMarks(wrongOn("3.14", ["2026-11-02", 1], ["2026-11-03", 2])) }))?.skills?.needsHelp.map((s) => s.name)).toEqual([capitalName(long)]);
    });
    it("counts the workbook days a skill was tricky on, not the days it was marked: a week of pages scanned at once is several days", async () => {
      const got = await story({ scans: scans("d1a", "d1b"), skillTests: [tally("3.2", 0, 4)], ...withMarks(wrongOn("3.2", ["2026-11-03", 1], ["2026-11-03", 2], ["2026-11-03", 3])) });
      expect(got.highlights).toEqual([`The one to watch is ${nameOf("3.2")}: it was tricky on 3 workbook days in the last two weeks.`]);
    });
    it("one evening's marking that crosses midnight is one workbook day, so no repeat", async () => {
      // 11:30 p.m. on 2026-11-02 and 12:30 a.m. on 2026-11-03 in Vancouver, both from Day 2's pages.
      const marks = wrongOn("3.2", ["2026-11-03", 2]).map((m, i) => ({ ...m, at: i === 0 ? "2026-11-03T07:30:00Z" : "2026-11-03T08:30:00Z" }));
      const two = [...marks, { ...marks[0], at: "2026-11-03T08:30:00Z" }];
      expect((await story({ scans: scans("d1a", "d1b"), skillTests: [tally("3.2", 0, 4)], ...withMarks(two) })).highlights).toEqual([]);
    });
    it("a new book delivered mid-week does not hide the pages scanned earlier in the week: no full day yet, not 'nothing scanned'", async () => {
      // Book 1 was delivered on Monday 2026-10-26; Book 2 on Tuesday 2026-11-03 (Day 1), so on Wednesday Day 1 is behind us and not done.
      // Some of Book 1's pages were scanned on Monday 2026-11-02, before Book 2 came.
      const page2 = (id: string, dayLabel: string | null) => ({ parentId: "parent-1", workbookId: "wb-2", id, dayLabel });
      const got = await story({
        workbooks: [{ ...own, id: "wb-1", number: 1, status: "shipped" }, { ...own, id: "wb-2", number: 2, status: "shipped" }],
        deliveries: [{ ...own, workbookId: "wb-1", deliveredAt: "2026-10-26T20:00:00Z" }, { ...own, workbookId: "wb-2", deliveredAt: "2026-11-03T20:00:00Z" }],
        pages: [...pages, ...[1, 2].flatMap((d) => [page2(`e${d}a`, `Day ${d}`), page2(`e${d}b`, `Day ${d}`)])],
        scans: [scan("d1a", { takenAt: "2026-11-02T20:00:00Z" })],
      });
      expect(got.line).toBe("A quiet week so far. No full day done yet. Day 1 is ready when Leah is.");
      // A sibling's scans, and scans of no book of this child's, do not count.
      const sibling = { parentId: "parent-1", childId: "child-2", workbookId: "wb-s", pageId: "s1", state: "saved", expiresAt: "2027-01-01T00:00:00Z", takenAt: "2026-11-02T20:00:00Z" };
      const alone = await story({
        workbooks: [{ ...own, id: "wb-1", number: 1, status: "shipped" }, { ...own, id: "wb-2", number: 2, status: "shipped" }, { ...own, childId: "child-2", id: "wb-s", number: 1, status: "shipped" }],
        deliveries: [{ ...own, workbookId: "wb-1", deliveredAt: "2026-10-26T20:00:00Z" }, { ...own, workbookId: "wb-2", deliveredAt: "2026-11-03T20:00:00Z" }],
        pages: [...pages, ...[1, 2].flatMap((d) => [page2(`e${d}a`, `Day ${d}`), page2(`e${d}b`, `Day ${d}`)])],
        scans: [sibling],
      });
      expect(alone.line).toBe("A quiet week so far. Nothing scanned yet. Day 1 is ready when Leah is.");
    });
    it("names the earliest open day of the book, the Workbooks tab's orange row, not this week's first missed day", async () => {
      // Delivered Monday 2026-10-26, so Wednesday 2026-11-04 is Day 8. Day 2 was never finished; Day 6 is done, Day 7 is not.
      const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap((d) => [page(`d${d}a`, `Day ${d}`), page(`d${d}b`, `Day ${d}`)]);
      const got = await story({
        deliveries: [{ ...own, workbookId: "wb-1", deliveredAt: "2026-10-26T20:00:00Z" }], pages: ten,
        scans: scans("d1a", "d1b", "d2a", "d3a", "d3b", "d4a", "d4b", "d5a", "d5b", "d6a", "d6b"),
      });
      expect(got.line).toBe("A quieter week. 1 day done. Day 2 is ready when Leah is.");
    });
    it("a streak of days done in a row, from 3", async () => {
      const got = await story({ scans: scans("d1a", "d1b", "d2a", "d2b", "d3a", "d3b") });
      expect(got.line).toBe("On track this week. 3 days done.");
      expect(got.highlights).toEqual(["Leah has done 3 workbook days in a row."]);
      expect((await story({ scans: scans("d1a", "d1b", "d2a", "d2b") })).highlights).toEqual([]);
    });
    it("picks two by priority: a mastery and a repeated mistake come before a streak", async () => {
      const got = await story({
        scans: scans("d1a", "d1b", "d2a", "d2b", "d3a", "d3b"), skillTests: [tally("3.1", 4, 4), tally("3.2", 0, 4)], history: [START, change("3.1", "mastered", "2026-11-03T20:00:00Z")],
        ...withMarks(wrongOn("3.2", ["2026-11-02", 1], ["2026-11-03", 2])),
      });
      expect(got.highlights).toEqual([`Leah mastered ${nameOf("3.1")} this week.`, `The one to watch is ${nameOf("3.2")}: it was tricky on 2 workbook days in the last two weeks.`]);
    });
    it("a skill mastered before Monday, in the starting batch, or with no recorded row is not new", async () => {
      const done = { scans: scans("d1a", "d1b", "d2a", "d2b"), skillTests: [tally("3.1", 4, 4)] };
      expect((await story({ ...done, history: [START, change("3.1", "mastered", "2026-11-01T22:00:00Z")] })).highlights).toEqual([]);
      expect((await story({ ...done, history: [change("3.1", "mastered", "2026-11-03T20:00:00Z")] })).highlights).toEqual([]);
      expect((await story(done)).highlights).toEqual([]);
      expect((await story(done)).line).toBe("On track this week. 2 days done.");
    });
    it("a history that cannot be read claims no mastery, and keeps the rest", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const got = await story({ scans: scans("d1a", "d1b", "d2a", "d2b"), skillTests: [tally("3.1", 4, 4)], history: [START, change("3.1", "mastered", "2026-11-03T20:00:00Z")], fail: ["history"] });
      expect(got).toEqual({ line: "On track this week. 2 days done.", highlights: [] });
    });
    it("claims no skill news when the marks cannot be read, and keeps the week", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await story({ scans: scans("d1a", "d1b", "d2a", "d2b"), skillTests: [tally("3.1", 4, 4)], fail: ["overviewProgress"] })).toEqual({ line: "On track this week. 2 days done.", highlights: [] });
    });
    it("uses no percent right, no wrong-answer count and no raw record", async () => {
      const got = await story({
        scans: scans("d1a", "d1b", "d2a", "d2b", "d3a", "d3b"), skillTests: [tally("3.1", 4, 4), tally("3.2", 0, 4)], history: [START, change("3.1", "mastered", "2026-11-03T20:00:00Z")],
        ...withMarks(wrongOn("3.2", ["2026-11-02", 1], ["2026-11-03", 2])),
      });
      expect(`${got.line} ${got.highlights!.join(" ")}`).not.toMatch(/%|percent|wrong|score|different days/i);
    });
  });

  it("holds only the named fields: no percent right, no wrong-answer count, no level or area bar, no raw record", async () => {
    const view = await read({ scans: scans("d1a"), switches: { progress: true, maya: false, scanPages: true }, tests: [test("t")], reports: [report("t")], skillTests: [{ ...own, assessmentId: "t", standard: "3.1", correct: 4, total: 4, at: "2026-10-30T18:00:00Z", secret: "RAW" } as never] });
    expect(Object.keys(view!).sort()).toEqual(["child", "highlights", "onTheWay", "resultLate", "resultPreparing", "scanPrompt", "skills", "summaryMonth", "week", "weekLine", "workbook"]);
    expect(Object.keys(view!.workbook!).sort()).toEqual(["doneDays", "number", "today", "totalDays"]);
    expect(JSON.stringify(view)).not.toMatch(/RAW|percentRight|wrong|"level"|"areas"/);
  });

  it("the newest finished test with no report yet: the new result is being prepared, and the Home still shows", async () => {
    const tests = [test("old", { completedAt: NOW - 90 * HOUR }), test("newest", { completedAt: NOW - HOUR })];
    const view = await read({ tests, reports: [report("old")] });
    expect(view?.child.stage).toBe("active");
    expect(view?.resultPreparing).toBe(true);
    expect(view?.resultLate).toBe(false);
    expect(view?.week).not.toBeNull();
  });
  it("says a report is late more than an hour after the test finished, because the job does not retry", async () => {
    const finishedAt = (hoursAgo: number) => [test("new", { completedAt: NOW - hoursAgo * HOUR })];
    expect((await read({ tests: finishedAt(0.5) }))?.resultLate).toBe(false);
    const late = await read({ tests: finishedAt(2) });
    expect(late?.resultPreparing).toBe(true);
    expect(late?.resultLate).toBe(true);
  });
  it("an open test does not hide the newest finished test: its result is not being prepared", async () => {
    const view = await read({ tests: [test("t"), open("o")], reports: [report("t")] });
    expect(view?.resultPreparing).toBe(false);
  });

  describe("the monthly summary's month (the email agrees with it)", () => {
    it("is offered from the month after the first confirmed delivery, and not before", async () => {
      expect((await read({}))?.summaryMonth).toBeNull();
      expect((await read({}, Date.parse("2026-12-03T18:00:00Z")))?.summaryMonth).toBe("2026-11");
    });
  });
});

describe("the monthly summary (#562)", () => {
  const own = { parentId: "parent-1", childId: "child-1" };
  const card = { cards: [{ ...own, cardSavedAt: "2026-09-20T00:00:00Z" }] };
  // Delivered on September 30 at 20:00 in Vancouver (UTC-7): October 1 in UTC, September in family time.
  const delivered = { ...card, deliveries: [{ ...own, workbookId: "wb-1", deliveredAt: "2026-10-01T03:00:00Z" }], workbooks: [{ ...own, id: "wb-1", number: 1, status: "shipped", shippedAt: "2026-09-25T18:00:00Z" }] };
  const level = (over: Partial<ReportModel["level"]> = {}): ReportModel["level"] => ({ working: 3, grade: 3, atCeiling: false, confidence: "normal", certainty: "clear", ...over });
  const result = (assessmentId: string, over: Partial<MemoryResult> = {}): MemoryResult => ({ ...own, assessmentId, level: level(), answers: [], ...over });
  const answers = (area: AreaAnswer["area"], lvl: AreaAnswer["level"], right: number): AreaAnswer[] => Array.from({ length: right }, () => ({ area, level: lvl, correct: true }));
  const sept = { tests: [test("t", { completedAt: Date.parse("2026-09-10T18:00:00Z") })], reports: [report("t")], results: [result("t", { answers: answers("number", 3, 4) })] };
  const tables = (over: Parameters<typeof parent>[0] = {}) => parent({ ...delivered, ...sept, ...over });
  const summary = (over: Parameters<typeof parent>[0] = {}, month = "2026-10", now = NOW) => readMonthlySummary(tables(over), "child-1", month, now);

  describe("which months it offers", () => {
    it("the Overview offers the last finished month in family time, from the month after the first delivery", async () => {
      expect((await readOverview(tables(), "child-1", NOW))?.summaryMonth).toBe("2026-10");
      // On October 31 at 23:30 in Vancouver it is still October: the last finished month is September, the delivery's month.
      expect((await readOverview(tables(), "child-1", Date.parse("2026-11-01T06:30:00Z")))?.summaryMonth).toBe("2026-09");
      // In the month of the first delivery there is no finished month after it began.
      expect((await readOverview(tables(), "child-1", Date.parse("2026-09-30T12:00:00Z")))?.summaryMonth).toBeNull();
    });
    it("none before a delivery is confirmed, and none for a stage with no Overview", async () => {
      expect((await readOverview(tables({ deliveries: [] }), "child-1", NOW))?.summaryMonth).toBeNull();
      expect(await summary({ deliveries: [] })).toBeNull();
      expect(await readMonthlySummary(parent({ ...sept }), "child-1", "2026-10", NOW)).toBeNull();
    });
    it("a correction of the delivery time moves the first month", async () => {
      const corrections = [{ ...own, workbookId: "wb-1", deliveredAt: "2026-10-20T18:00:00Z", auditId: 2 }];
      expect((await readOverview(tables({ corrections }), "child-1", NOW))?.summaryMonth).toBe("2026-10");
      expect(await summary({ corrections }, "2026-09")).toBeNull();
    });
    it("refuses a month before the first delivery, the current month, a later month and a malformed month", async () => {
      expect(await summary({}, "2026-08")).toBeNull();
      expect(await summary({}, "2026-11")).toBeNull();
      expect(await summary({}, "2026-12")).toBeNull();
      for (const bad of ["2026-13", "2026-1", "october", "2026-10-01", ""]) expect(await summary({}, bad)).toBeNull();
      expect(await summary({}, "2026-09")).not.toBeNull();
    });
    it("is not found for another family's child", async () => {
      const readers = memoryParentViewReaders({
        children: [leah, omar],
        cards: [{ parentId: "parent-2", childId: "child-2", cardSavedAt: "2026-09-20T00:00:00Z" }],
        deliveries: [{ parentId: "parent-2", childId: "child-2", deliveredAt: "2026-09-01T00:00:00Z" }],
      });
      expect(await readMonthlySummary(readers.parent("parent-1"), "child-2", "2026-10", NOW)).toBeNull();
      expect(await readMonthlySummary(readers.parent("parent-2"), "child-2", "2026-10", NOW)).not.toBeNull();
    });
  });

  it("holds the level, the area bars, the month's workbooks, scanned days, Maya calls and the next book's range", async () => {
    const pages = ["d1a", "d1b", "d2a"].map((id) => ({ parentId: "parent-1", workbookId: "wb-2", id, dayLabel: id.startsWith("d1") ? "Day 1" : "Day 2" }));
    const scan = (pageId: string, takenAt: string) => ({ ...own, workbookId: "wb-2", pageId, state: "saved", expiresAt: "2027-01-01T00:00:00Z", takenAt });
    const view = await summary({
      workbooks: [...delivered.workbooks, { ...own, id: "wb-2", number: 2, status: "shipped", shippedAt: "2026-10-14T18:00:00Z" }],
      deliveries: [...delivered.deliveries, { ...own, workbookId: "wb-2", deliveredAt: "2026-10-18T18:00:00Z" }],
      pages,
      scans: [scan("d1a", "2026-10-20T18:00:00Z"), scan("d1b", "2026-10-21T18:00:00Z"), scan("d2a", "2026-10-25T18:00:00Z")],
      maya: [
        { ...own, kind: "chat", status: "ended", endedAt: "2026-10-02T18:00:00Z", childTurns: 5 },
        { ...own, kind: "chat", status: "ended", endedAt: "2026-10-30T18:00:00Z", childTurns: 1 },
      ],
    });
    expect(view).toEqual({
      firstName: "Leah", schoolGrade: 3, month: "2026-10", madeOn: "2026-11-04",
      level: { working: 3, earlySign: false, testedOn: "2026-09-10", unreliable: false },
      areas: [{ area: "number", name: expect.any(String), level: 3, label: "at-grade", earlySign: false }],
      mailed: [{ number: 2, shippedOn: "2026-10-14" }],
      daysScanned: 2, mayaCalls: 2,
      next: { earliest: "2026-10-28", latest: "2026-11-15" },
    });
  });

  it("a test the report calls unreliable has no area bars in the summary; a reliable one keeps them (D-258)", async () => {
    const flagged = await summary({ results: [result("t", { answers: answers("number", 3, 4), unreliable: true })] });
    expect(flagged?.level).toMatchObject({ working: 3, unreliable: true });
    expect(flagged?.areas).toEqual([]);
    expect((await summary())?.areas).toHaveLength(1);
  });

  it("has nothing for a section with no data", async () => {
    const view = await summary({ tests: [], reports: [], results: [] });
    expect(view).toMatchObject({ level: null, areas: [], mailed: [], daysScanned: 0, mayaCalls: 0, next: null });
  });

  it("counts month boundaries in family time", async () => {
    const pages = [{ parentId: "parent-1", workbookId: "wb-1", id: "p", dayLabel: "Day 1" }];
    // 06:30 UTC on November 1 is October 31 in Vancouver.
    const late = "2026-11-01T06:30:00Z";
    const view = await summary({
      workbooks: [{ ...delivered.workbooks[0], shippedAt: "2026-10-01T03:00:00Z" }],
      pages, scans: [{ ...own, workbookId: "wb-1", pageId: "p", state: "saved", expiresAt: "2027-01-01T00:00:00Z", takenAt: late }],
      maya: [{ ...own, kind: "chat", status: "ended", endedAt: late, childTurns: 2 }, { ...own, kind: "chat", status: "ended", endedAt: "2026-10-01T06:30:00Z", childTurns: 2 }],
    });
    // Shipped on September 30 in Vancouver, so not in October; the late scan and call are October's; the early call is September's.
    expect(view).toMatchObject({ mailed: [], daysScanned: 1, mayaCalls: 1 });
  });

  it("uses the newest test finished by the month's end, not a later one", async () => {
    const tests = [test("t", { completedAt: Date.parse("2026-09-10T18:00:00Z") }), test("nov", { completedAt: Date.parse("2026-11-02T18:00:00Z") })];
    const view = await summary({ tests, reports: [report("t"), report("nov")], results: [result("t"), result("nov", { level: level({ working: 5 }) })] });
    expect(view?.level).toEqual({ working: 3, earlySign: false, testedOn: "2026-09-10", unreliable: false });
  });

  it("a day counts only when every page of it has a saved photo, in the month of its last page", async () => {
    const pages = ["a", "b"].map((id) => ({ parentId: "parent-1", workbookId: "wb-1", id, dayLabel: "Day 1" }));
    const scan = (pageId: string, takenAt: string, state = "saved") => ({ ...own, workbookId: "wb-1", pageId, state, expiresAt: "2027-01-01T00:00:00Z", takenAt });
    expect((await summary({ pages, scans: [scan("a", "2026-10-02T18:00:00Z")] }))?.daysScanned).toBe(0);
    expect((await summary({ pages, scans: [scan("a", "2026-10-02T18:00:00Z"), scan("b", "2026-10-03T18:00:00Z", "pending")] }))?.daysScanned).toBe(0);
    expect((await summary({ pages, scans: [scan("a", "2026-09-29T18:00:00Z"), scan("b", "2026-10-03T18:00:00Z")] }))?.daysScanned).toBe(1);
    expect((await summary({ pages, scans: [scan("a", "2026-09-29T18:00:00Z"), scan("b", "2026-09-30T18:00:00Z")] }))?.daysScanned).toBe(0);
  });

  it("counts only the child's own ended chats with a message from the child, never an admin test call, a live chat or another child's", async () => {
    const ended = { status: "ended" as const, endedAt: "2026-10-02T18:00:00Z" };
    const maya = [
      { ...own, kind: "chat" as const, ...ended, childTurns: 0 },
      { ...own, kind: "chat" as const, status: "live" as const, endedAt: null, childTurns: null },
      { ...own, kind: "admin_test" as const, ...ended, childTurns: 4 },
      { parentId: "parent-1", childId: "child-3", kind: "chat" as const, ...ended, childTurns: 4 },
      { parentId: "parent-2", childId: "child-1", kind: "chat" as const, ...ended, childTurns: 4 },
    ];
    expect((await summary({ maya }))?.mayaCalls).toBe(0);
    expect((await summary({ maya: [...maya, { ...own, kind: "chat" as const, ...ended, childTurns: 1 }] }))?.mayaCalls).toBe(1);
  });

  it("copies only the fields it names, whatever a row holds", async () => {
    const SECRET = "RAW-CANARY";
    const raw = { learner_profile: SECRET, transcript: SECRET, ai: { findings: [SECRET] }, model: { summary: SECRET } };
    const view = await summary({
      results: [{ ...result("t", { answers: answers("number", 3, 4) }), level: { ...level(), ...raw } as never, ...raw }],
      maya: [{ ...own, kind: "chat", status: "ended", endedAt: "2026-10-02T18:00:00Z", childTurns: 2, ...raw } as never],
      children: [{ ...leah, ...raw }, omar],
    });
    expect(JSON.stringify(view)).not.toContain(SECRET);
  });
});

describe("the Progress tab (#561, #1004)", () => {
  const ON = { progress: true, maya: false, scanPages: true };
  const own = { parentId: "parent-1", childId: "child-1" };
  const card = { cards: [{ ...own, cardSavedAt: "2026-10-05T00:00:00Z" }], switches: ON };
  const finished = test("t1", { completedAt: Date.parse("2026-10-30T18:00:00Z") });
  const level = { working: 3, top: 3, certainty: "clear", confidence: "high" } as unknown as ReportModel["level"];
  const result: MemoryResult = { ...own, assessmentId: "t1", level, answers: [] };
  const withTest = { ...card, tests: [finished], reports: [report("t1")], results: [result] };
  const tally = (standard: string, correct: number, total: number) => ({ ...own, assessmentId: "t1", standard, correct, total, at: "2026-10-30T18:00:00Z" });
  const change = (standard: string, state: "mastered" | "working_on" | "needs_review" | "not_started", changedAt: string) => ({ ...own, standard, state, changedAt });
  const mark = { standard: "3.3", right: true, review: false, at: "2026-11-03T18:00:00Z" };
  const marked = { overviewProgress: [{ ...own, marks: [], skillMarks: [mark] }] };
  const read = (tables: Parameters<typeof parent>[0]) => readProgress(parent(tables), "child-1", NOW);

  describe("who sees it", () => {
    it("is hidden with the switch for #194 off, also for a child with a test and a card", async () => {
      const off = await read({ ...withTest, switches: { progress: false, maya: false, scanPages: false } });
      expect(off).toBeNull();
    });
    it("is hidden with every switch left out: a normal family's stage gets no Progress tab", async () => {
      const tables = { ...withTest, switches: undefined };
      expect(await read(tables)).toBeNull();
      expect((await listChildren(parent(tables), NOW))[0].tabs).toEqual(["overview", "workbooks", "assessment", "account"]);
    });
    it("is hidden in a stage with no Progress tab", async () => {
      expect(await read({ switches: ON })).toBeNull();
      expect(await read({ tests: [finished], reports: [report("t1")], results: [result], switches: ON })).toBeNull();
    });
    it("reads another family's child as not found", async () => {
      const readers = memoryParentViewReaders({
        children: [leah, omar], switches: ON,
        cards: [{ parentId: "parent-2", childId: "child-2", cardSavedAt: "2026-10-05T00:00:00Z" }],
      });
      expect(await readProgress(readers.parent("parent-1"), "child-2", NOW)).toBeNull();
      expect(await readProgress(readers.parent("parent-2"), "child-2", NOW)).not.toBeNull();
    });
    it("makes no read of the tallies when the tab is hidden", async () => {
      const readers = memoryParentViewReaders({ children: [leah], ...withTest, ...marked, switches: { progress: false, maya: false, scanPages: false } });
      await readProgress(readers.parent("parent-1"), "child-1", NOW);
      expect(readers.reads.skillTests).toBe(0);
    });
  });

  describe("a family with no marks yet", () => {
    it("has no progress to show, and reads no tally or history", async () => {
      const readers = memoryParentViewReaders({ children: [leah], ...withTest, skillTests: [tally("3.1", 2, 2)] });
      expect(await readProgress(readers.parent("parent-1"), "child-1", NOW)).toEqual({ child: expect.objectContaining({ id: "child-1" }), progress: null, unavailable: false });
      expect(readers.reads.skillTests + readers.reads.history).toBe(0);
    });
    it("zero marks is the empty state, not the can't-load one", async () => {
      expect(await read({ ...withTest })).toMatchObject({ progress: null, unavailable: false });
      expect(await read({ ...withTest, overviewProgress: [{ ...own, marks: [], skillMarks: [] }] })).toMatchObject({ progress: null, unavailable: false });
    });
    it("a failed marking read is unavailable, never the empty state, and is logged", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await read({ ...withTest, ...marked, fail: ["overviewProgress"] })).toMatchObject({ progress: null, unavailable: true });
      expect(log).toHaveBeenCalled();
    });
  });

  describe("a family with one week of data", () => {
    // Delivered Monday 2 November; Monday and Tuesday scanned; today is Wednesday 4 November.
    const book = {
      deliveries: [{ ...own, workbookId: "wb-1", deliveredAt: "2026-11-02T20:00:00Z" }], workbooks: [{ ...own, id: "wb-1", number: 1, status: "shipped" }],
      pages: ["d1a", "d1b", "d2a", "d2b", "d3a"].map((id) => ({ parentId: "parent-1", workbookId: "wb-1", id, dayLabel: `Day ${id[1]}` })),
      scans: ["d1a", "d1b", "d2a", "d2b"].map((pageId) => ({ ...own, workbookId: "wb-1", pageId, state: "saved", expiresAt: "2027-01-01T00:00:00Z" })),
    };
    const data = {
      ...withTest, ...marked, ...book, skillTests: [tally("3.1", 2, 2), tally("3.2", 0, 4)],
      history: [change("3.2", "needs_review", "2026-11-02T20:00:00Z"), change("3.1", "mastered", "2026-11-03T20:00:00Z")],
    };

    it("counts the tiles from the rule now and the history before it", async () => {
      const view = await read(data);
      const p = view!.progress!;
      expect(p.summary.mastered).toBe(1);
      expect(p.summary.needsHelp).toBe(1);
      // Since Monday: 3.1 is new and moved up; 3.2 went from Not started to Needs review, which is not up.
      expect(p.summary.week).toMatchObject({ since: "2026-11-02", gain: 1, movedUp: 1 });
      expect(p.summary.all).toMatchObject({ since: "2026-10-30", gain: 1 });
    });
    it("the Needs help tile also counts a Learning skill the child is struggling with now (#1025), and gain and moved up do not change", async () => {
      const struggling = ["2026-11-02T18:00:00Z", "2026-11-03T18:00:00Z"].flatMap((at) => [false, false].map((right) => ({ standard: "3.4", right, review: false, at })));
      const questions = [{ parentId: "parent-1", workbookId: "wb-1", pageId: "d3a", standard: "3.4" }];
      const p = (await read({ ...data, questions, overviewProgress: [{ ...own, marks: [], skillMarks: [mark, ...struggling] }] }))!.progress!;
      expect(p.summary.needsHelp).toBe(2);
      expect(p.summary.mastered).toBe(1);
      expect(p.summary.week).toMatchObject({ gain: 1, movedUp: 1 });
      // Three answers are too few.
      const few = (await read({ ...data, questions, overviewProgress: [{ ...own, marks: [], skillMarks: [mark, ...struggling.slice(1)] }] }))!.progress!;
      expect(few.summary.needsHelp).toBe(1);
    });
    it("a topic's Needs help word reads the same set as the tile and Home: a struggling Learning skill alone turns its topic (#1025)", async () => {
      const questions = [{ parentId: "parent-1", workbookId: "wb-1", pageId: "d3a", standard: "3.4" }];
      const noMastery = { ...withTest, ...book, questions, skillTests: [] };
      const marksOf = (rights: boolean[]) => ({ overviewProgress: [{ ...own, marks: [], skillMarks: rights.map((right) => ({ standard: "3.4", right, review: false, at: "2026-11-03T18:00:00Z" })) }] });
      const calm = (await read({ ...noMastery, ...marksOf([true, true, true, false]) }))!.progress!;
      const struggling = (await read({ ...noMastery, ...marksOf([false, false, false, false]) }))!.progress!;
      // No state changed: the skill is Learning in both. Only the rule's set differs.
      expect(struggling.summary.needsHelp).toBe(1);
      expect(calm.summary.needsHelp).toBe(0);
      expect(calm.topics.map((t) => t.word)).not.toContain("Needs help");
      const changed = struggling.topics.filter((t, i) => t.word !== calm.topics[i].word);
      expect(changed).toHaveLength(1);
      expect(changed[0].word).toBe("Needs help");
      expect(struggling.topics.map((t) => t.name)).toEqual(calm.topics.map((t) => t.name));
    });
    it("one point per week, with a start, labelled by Monday; one per month on Month and All time", async () => {
      const p = (await read(data))!.progress!;
      expect(p.summary.week.points).toEqual([{ label: "Oct 26", value: 0 }, { label: "Nov 2", value: 1 }]);
      expect(p.summary.month.points).toEqual([{ label: "Oct", value: 0 }, { label: "Nov", value: 1 }]);
      expect(p.summary.all.points).toEqual(p.summary.month.points);
    });
    it("Days done: this week's circles, and the days of the book with every page scanned", async () => {
      const p = (await read(data))!.progress!;
      expect(p.weekDaysDone).toBe(2);
      expect(p.bookDaysDone).toBe(2);
      expect(p.workbookNumber).toBe(1);
    });
    it("names the start and the month in family time", async () => {
      const p = (await read(data))!.progress!;
      expect(p.startedOn).toBe("Oct 30");
      expect(p.monthName).toBe("November");
    });
    it("gives each math topic a word and the share of its skills mastered, never a count", async () => {
      const p = (await read(data))!.progress!;
      expect(p.topics.length).toBeGreaterThan(0);
      for (const t of p.topics) {
        expect(["Strong", "Getting there", "Needs help"]).toContain(t.word);
        expect(t.share).toBeGreaterThanOrEqual(0);
        expect(t.share).toBeLessThanOrEqual(1);
        expect(Object.keys(t).sort()).toEqual(["name", "share", "word"]);
      }
    });
    it("reads the day in the family's own zone: Sunday evening in Vancouver is last week", async () => {
      const edge = { ...data, history: [change("3.1", "mastered", "2026-11-02T06:30:00Z")] };
      const p = (await read(edge))!.progress!;
      expect(p.summary.week.points).toEqual([{ label: "Oct 26", value: 1 }, { label: "Nov 2", value: 1 }]);
      expect(p.summary.week.gain).toBe(0);
    });
  });

  describe("what leaves the module", () => {
    it("holds only the named fields: no raw record field, no marks, no counts of answers", async () => {
      const raw = { ...tally("3.1", 2, 2), secret: "RAW-PROFILE", ai: "AI-GUESS" };
      const view = await read({ ...withTest, ...marked, skillTests: [raw] });
      expect(Object.keys(view!).sort()).toEqual(["child", "progress", "unavailable"]);
      expect(Object.keys(view!.progress!).sort()).toEqual(["bookDaysDone", "monthName", "startedOn", "summary", "topics", "weekDaysDone", "workbookNumber"]);
      const text = JSON.stringify(view!.progress);
      for (const bad of ["RAW-PROFILE", "AI-GUESS", '"correct"', '"total"', '"evidenceAt"', '"reason"']) expect(text).not.toContain(bad);
    });
    it("a failed history read is unavailable, with no numbers: an empty history would count every mastered skill as new", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const view = await read({ ...withTest, ...marked, skillTests: [tally("3.1", 2, 2)], history: [change("3.1", "mastered", "2026-11-03T20:00:00Z")], fail: ["history"] });
      expect(view).toMatchObject({ progress: null, unavailable: true });
      expect(log).toHaveBeenCalled();
    });
    it("throws when the tallies cannot be read: an empty read would show every skill as Not started", async () => {
      await expect(read({ ...withTest, ...marked, fail: ["skillTests"] })).rejects.toThrow("progress: skill inputs unavailable");
    });
  });
});
