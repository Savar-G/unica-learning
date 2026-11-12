import { afterEach, describe, expect, it, vi } from "vitest";
import { BC_SKILL_MAP, type AreaAnswer, type ReportModel } from "@/lib/assessment";
import { listChildren, readChild, readMonthlySummary, readOverview, readProgress, readWorkbooks, type OverviewProgress } from "@/lib/parent-view";
import { memoryParentViewReaders, type MemoryParentViewTables, type MemoryResult, type MemoryTest, type MemoryWorkbook } from "@/lib/parent-view-memory";

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
    expect(readers.reads).toEqual({ children: 1, tests: 1, reports: 1, cards: 1, deliveries: 1, workbooks: 1, plans: 1, switches: 1, corrections: 0, dispatches: 0, family: 0, results: 0, scans: 0, pages: 0, learning: 0, pin: 0, maya: 0, skillTests: 0, questions: 0, overviewProgress: 0 });
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
      current: null, next: { kind: "first_book_coming" }, books: [],
    });
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

describe("the Overview (#560)", () => {
  const own = { parentId: "parent-1", childId: "child-1" };
  const card = { cards: [{ ...own, cardSavedAt: "2026-10-20T00:00:00Z" }] };
  const delivered = { ...card, deliveries: [{ ...own, workbookId: "wb-1" }], workbooks: [{ ...own, id: "wb-1", number: 1, status: "shipped" }] };
  const answered = { learning: { interests: ["space"] } };
  const leahAnswered = { ...leah, ...answered };
  const level = (over: Partial<ReportModel["level"]> = {}): ReportModel["level"] => ({ working: 3, grade: 3, atCeiling: false, confidence: "normal", certainty: "clear", ...over });
  const result = (assessmentId: string, over: Partial<MemoryResult> = {}): MemoryResult => ({ ...own, assessmentId, level: level(), answers: [], ...over });
  const tested = { tests: [test("t")], reports: [report("t")] };
  const at = (area: AreaAnswer["area"], lvl: AreaAnswer["level"], right: number, wrong: number): AreaAnswer[] => [
    ...Array.from({ length: right }, () => ({ area, level: lvl, correct: true })),
    ...Array.from({ length: wrong }, () => ({ area, level: lvl, correct: false })),
  ];
  const read = (tables: Parameters<typeof parent>[0], now = NOW) => readOverview(parent({ children: [leahAnswered, omar], ...card, ...tables }), "child-1", now);

  it("is not found for another family's child, and for a stage with no Overview", async () => {
    const readers = memoryParentViewReaders({ children: [leah, omar], cards: [{ parentId: "parent-2", childId: "child-2", cardSavedAt: "2026-10-20T00:00:00Z" }] });
    expect(await readOverview(readers.parent("parent-1"), "child-2", NOW)).toBeNull();
    expect(await readOverview(parent({ ...tested, results: [result("t")] }), "child-1", NOW)).toBeNull();
  });

  it("before the first test: no tile, no bar, and Start the test as the one thing to do", async () => {
    expect(await read({})).toEqual({
      child: expect.objectContaining({ id: "child-1", stage: "first_book_coming" }), level: null, areas: [], skills: null, areasIncludeMarks: false, resultPreparing: false, resultLate: false, workbook: null, action: "start_test", summaryMonth: null,
    });
  });

  it("the Level tile: the stored working level and the day of the test in family time", async () => {
    // 2026-11-01T02:00Z is October 31 in Pacific time, Leah's province's zone.
    const view = await read({ tests: [test("t", { completedAt: Date.parse("2026-11-01T02:00:00Z") })], reports: [report("t")], results: [result("t", { level: level({ working: 2 }) })] });
    expect(view?.level).toEqual({ working: 2, earlySign: false, testedOn: "2026-10-31", unreliable: false });
  });

  it.each([
    ["an early sign", level({ certainty: "early-sign" }), true],
    ["an estimate stored as clear", level({ confidence: "low", certainty: "clear" }), true],
    ["an estimate from before certainty", level({ confidence: "low", certainty: undefined }), true],
    ["a clear level", level(), false],
  ])("an estimated level reads as an Early sign, as on the report: %s", async (_, stored, earlySign) => {
    expect((await read({ ...tested, results: [result("t", { level: stored })] }))?.level?.earlySign).toBe(earlySign);
  });

  it("uses the newest finished test", async () => {
    const tests = [test("old", { completedAt: NOW - 90 * HOUR }), test("new", { completedAt: NOW - 10 * HOUR })];
    const view = await read({ tests, reports: [report("old"), report("new")], results: [result("old", { level: level({ working: 1 }) }), result("new", { level: level({ working: 4 }) })] });
    expect(view?.level?.working).toBe(4);
    expect(view?.resultPreparing).toBe(false);
  });

  it("the newest finished test with no report yet: no level and no bars from any test, and the new result is being prepared", async () => {
    const tests = [test("old", { completedAt: NOW - 90 * HOUR }), test("newest", { completedAt: NOW - HOUR })];
    const view = await read({ ...delivered, tests, reports: [report("old")], results: [result("old", { level: level({ working: 1 }), answers: at("number", 3, 4, 0) })] });
    expect(view?.child.stage).toBe("active");
    expect(view?.level).toBeNull();
    expect(view?.areas).toEqual([]);
    expect(view?.resultPreparing).toBe(true);
    expect(view?.resultLate).toBe(false);
  });
  it("says a report is late more than an hour after the test finished, because the job does not retry", async () => {
    const finishedAt = (hoursAgo: number) => [test("new", { completedAt: NOW - hoursAgo * HOUR })];
    expect((await read({ ...delivered, tests: finishedAt(0.5) }))?.resultLate).toBe(false);
    const late = await read({ ...delivered, tests: finishedAt(2) });
    expect(late?.resultPreparing).toBe(true);
    expect(late?.resultLate).toBe(true);
  });

  it("an open test does not hide the newest finished test's result", async () => {
    const view = await read({ tests: [test("t"), open("o")], reports: [report("t")], results: [result("t", { level: level({ working: 2 }) })] });
    expect(view?.level?.working).toBe(2);
    expect(view?.resultPreparing).toBe(false);
  });

  it("the area bars follow the area rule against the school grade, with an Early sign below 4 answers", async () => {
    const answers = [...at("number", 3, 4, 0), ...at("fractions", 3, 2, 0), ...at("shapes", 4, 4, 0), ...at("algebra", 3, 1, 3), ...at("algebra", 2, 4, 0)];
    const view = await read({ ...tested, results: [result("t", { answers })] });
    expect(view?.areas).toEqual([
      { area: "number", name: "Number and operations", level: 3, label: "at-grade", earlySign: false },
      { area: "fractions", name: "Fractions and decimals", level: 3, label: "at-grade", earlySign: true },
      { area: "algebra", name: "Patterns and algebra", level: 2, label: "building-up", earlySign: false },
      { area: "shapes", name: "Shapes, measurement and data", level: 4, label: "ahead", earlySign: false },
    ]);
  });

  const progress = (over: Partial<OverviewProgress> = {}) => ({ ...own, marks: [], skillMarks: [], history: [], historyAssessment: "t", ...over });

  it("combines stored page results with the test and keeps the assessment level", async () => {
    const data = progress({ marks: at("number", 4, 4, 0) });
    const view = await read({ ...tested, results: [result("t", { answers: at("number", 3, 4, 0) })], overviewProgress: [data] });
    expect(view?.level?.working).toBe(3);
    expect(view?.areas[0]).toMatchObject({ level: 4, label: "ahead" });
    expect(view?.areasIncludeMarks).toBe(true);
    expect((await read({ ...tested, results: [result("t", { answers: null })], overviewProgress: [data] }))?.areas).toEqual([]);
    expect((await read({ ...tested, results: [result("t", { answers: [], unreliable: true })], overviewProgress: [data] }))?.areas).toEqual([]);
  });

  it("a failed marking read keeps the bars from the test alone and hides Skills mastered", async () => {
    const tables = { ...tested, switches: { progress: true, maya: false, scanPages: false }, results: [result("t", { answers: at("number", 3, 4, 0) })], skillTests: [{ ...own, assessmentId: "t", standard: "3.1", correct: 4, total: 4, at: "2026-11-01T18:00:00Z" }] };
    const view = await read({ ...tables, overviewProgress: [progress({ marks: at("number", 4, 4, 0) })], fail: ["overviewProgress"] });
    expect(view?.areas[0]).toMatchObject({ level: 3, label: "at-grade" });
    expect(view?.areasIncludeMarks).toBe(false);
    expect(view?.skills).toBeNull();
  });

  describe("Skills mastered", () => {
    const tally = (standard: string, at = "2026-11-01T18:00:00Z") => ({ ...own, assessmentId: "t", standard, correct: 4, total: 4, at });
    const history = [
      { standard: "3.1", state: "mastered" as const, changedAt: "2026-11-01T06:30:00Z" },
      { standard: "3.2", state: "mastered" as const, changedAt: "2026-11-01T07:30:00Z" },
    ];
    const tables = { ...tested, switches: { progress: true, maya: false, scanPages: false }, results: [result("t")], skillTests: [tally("3.1"), tally("3.2")] };
    const grade3 = BC_SKILL_MAP.standards.filter((s) => s.grade === 3).length;

    it("counts the rule's states and the recorded changes since the start of the family month", async () => {
      // 06:30 UTC on November 1 is October 31 in Vancouver; 07:30 UTC is November 1.
      const view = await read({ ...tables, family: { timeZone: "America/Vancouver", postal: null }, overviewProgress: [progress({ history })] });
      expect(view?.skills).toEqual({ mastered: 2, total: grade3, moreThisMonth: 1 });
    });

    it("counts no change this month while the stored history is not from the newest test and every mark", async () => {
      for (const historyAssessment of [null, "older-test"]) {
        const view = await read({ ...tables, family: { timeZone: "America/Vancouver", postal: null }, overviewProgress: [progress({ history, historyAssessment })] });
        expect(view?.skills).toEqual({ mastered: 2, total: grade3, moreThisMonth: 0 });
      }
    });

    it("counts marked items as the Progress tab does, so the tile and the map agree", async () => {
      const page = (right: boolean, at: string, review = false) => ({ standard: "3.3", right, review, at });
      const skillMarks = [page(true, "2026-11-01T18:00:00Z"), page(true, "2026-11-02T18:00:00Z"), page(true, "2026-11-02T19:00:00Z"),
        page(true, "2026-11-03T18:00:00Z"), page(false, "2026-11-03T19:00:00Z"), page(true, "2026-11-04T10:00:00Z", true)];
      const withMarks = { ...tables, overviewProgress: [progress({ skillMarks })] };
      const tile = (await read(withMarks))?.skills;
      const map = (await readProgress(parent({ children: [leahAnswered, omar], ...card, ...withMarks }), "child-1", NOW))?.areas.flatMap((a) => a.tiles);
      expect(map?.find((t) => t.code === "3.3")?.state).toBe("mastered");
      expect(tile?.mastered).toBe(3);
      expect(map?.filter((t) => t.state === "mastered")).toHaveLength(3);
      expect(tile?.total).toBe(map?.length);
    });

    it("shows only with the Progress tab", async () => {
      expect((await read({ ...tables, switches: { progress: false, maya: false, scanPages: false }, overviewProgress: [progress({ history })] }))?.skills).toBeNull();
    });
  });

  it("an area with no answers has no bar; Kindergarten to Grade 2 show no fractions", async () => {
    const answers = [...at("number", 3, 4, 0), ...at("fractions", 2, 4, 0)];
    expect((await read({ ...tested, results: [result("t", { answers })] }))?.areas.map((a) => a.area)).toEqual(["number", "fractions"]);
    const young = { ...leahAnswered, grade: 2 };
    const view = await readOverview(parent({ children: [young], ...card, ...tested, results: [result("t", { level: level({ working: 2, grade: 2 }), answers })] }), "child-1", NOW);
    expect(view?.areas.map((a) => a.area)).toEqual(["number"]);
  });

  it("a test that cannot be replayed keeps the Level tile and has no bars", async () => {
    const view = await read({ ...tested, results: [result("t", { answers: null })] });
    expect(view?.level?.working).toBe(3);
    expect(view?.areas).toEqual([]);
  });

  describe("a test the report calls unreliable (D-258, #579)", () => {
    const answers = [...at("number", 3, 4, 0), ...at("shapes", 4, 4, 0)];
    it("has no area bars, and keeps the Level tile with the flag", async () => {
      const view = await read({ ...tested, results: [result("t", { answers, unreliable: true })] });
      expect(view?.level).toEqual({ working: 3, earlySign: false, testedOn: expect.any(String), unreliable: true });
      expect(view?.areas).toEqual([]);
    });
    it("follows the report the parent reads, not a later pace flag on the test (review of PR #634)", async () => {
      // A rescore set the test's pace flag, but the stored report has no reliability note and offers no new test.
      const view = await read({ tests: [test("t", { unreliable: true })], reports: [report("t")], results: [result("t", { answers, unreliable: false })] });
      expect(view?.level?.unreliable).toBe(false);
      expect(view?.areas).toHaveLength(2);
    });
    it("an older reliable test before a newer unreliable one: the newest decides", async () => {
      const tests = [test("old", { completedAt: NOW - 90 * HOUR }), test("new", { completedAt: NOW - 10 * HOUR })];
      const view = await read({ tests, reports: [report("old"), report("new")], results: [result("old", { answers }), result("new", { answers, unreliable: true })] });
      expect(view?.level?.unreliable).toBe(true);
      expect(view?.areas).toEqual([]);
    });
    it("a reliable test keeps its bars", async () => {
      const view = await read({ ...tested, results: [result("t", { answers, unreliable: false })] });
      expect(view?.level?.unreliable).toBe(false);
      expect(view?.areas.map((a) => [a.area, a.label])).toEqual([["number", "at-grade"], ["shapes", "ahead"]]);
    });
    it("only the newest finished test counts: an older unreliable test does not hide the new bars", async () => {
      const tests = [test("old", { completedAt: NOW - 90 * HOUR }), test("new", { completedAt: NOW - 10 * HOUR })];
      const view = await read({ tests, reports: [report("old"), report("new")], results: [result("old", { answers, unreliable: true }), result("new", { answers })] });
      expect(view?.level?.unreliable).toBe(false);
      expect(view?.areas).toHaveLength(2);
    });
  });

  describe("This workbook", () => {
    const pages = [
      { parentId: "parent-1", workbookId: "wb-1", id: "cover", dayLabel: null },
      { parentId: "parent-1", workbookId: "wb-1", id: "d1a", dayLabel: "Day 1" },
      { parentId: "parent-1", workbookId: "wb-1", id: "d1b", dayLabel: "Day 1" },
      { parentId: "parent-1", workbookId: "wb-1", id: "d2a", dayLabel: "Day 2" },
      { parentId: "parent-1", workbookId: "wb-1", id: "d3a", dayLabel: "Day 3" },
    ];
    const scan = (pageId: string, over: Record<string, string> = {}) => ({ ...own, workbookId: "wb-1", pageId, state: "saved", expiresAt: "2027-01-01T00:00:00Z", ...over });

    it("does not appear with no scanned day", async () => {
      expect((await read({ ...delivered, pages }))?.workbook).toBeNull();
      expect((await read({ ...delivered, pages, scans: [scan("d1a")] }))?.workbook).toBeNull();
    });
    it("counts a day when every page of it has a saved photo that has not expired", async () => {
      const scans = [scan("d1a"), scan("d1b"), scan("d2a", { expiresAt: "2026-11-01T00:00:00Z" }), scan("d3a", { state: "pending" }), scan("cover")];
      expect((await read({ ...delivered, pages, scans }))?.workbook).toEqual({ number: 1, scannedDays: 1, days: 3 });
    });
    it("counts only the newest shipped workbook, and only the family's own rows", async () => {
      const workbooks = [{ ...own, id: "wb-1", number: 1, status: "shipped" }, { ...own, id: "wb-2", number: 2, status: "shipped" }];
      const newer = pages.map((p) => ({ ...p, workbookId: "wb-2", id: `2-${p.id}` }));
      const scans = [scan("d1a"), scan("d1b"), { ...scan("2-d1a"), workbookId: "wb-2" }, { ...scan("2-d1b"), workbookId: "wb-2", parentId: "parent-2" }];
      expect((await read({ ...delivered, workbooks, pages: [...pages, ...newer], scans }))?.workbook).toBeNull();
      const all = [...scans, { ...scan("2-d1b"), workbookId: "wb-2" }];
      expect((await read({ ...delivered, workbooks, pages: [...pages, ...newer], scans: all }))?.workbook).toEqual({ number: 2, scannedDays: 1, days: 3 });
    });
  });

  describe("the action card", () => {
    const empty = { children: [leah, omar] };
    it("shows nothing when nothing applies", async () => {
      expect((await read({ ...delivered, ...tested }))?.action).toBeNull();
    });
    it("payment failed comes first", async () => {
      const view = await read({ ...delivered, ...tested, ...empty, pinSet: false, plans: [{ ...own, kind: "payment_failed" }] });
      expect(view?.action).toBe("payment_failed");
    });
    it("then no PIN, only once a workbook has shipped, and not when the PIN cannot be read", async () => {
      expect((await read({ ...delivered, ...tested, ...empty, pinSet: false }))?.action).toBe("no_pin");
      expect((await read({ ...tested, ...empty, pinSet: false }))?.action).toBe("learning_card_empty");
      expect((await read({ ...delivered, ...tested, pinSet: null }))?.action).toBeNull();
      expect((await read({ ...delivered, ...tested, pinSet: false, fail: ["pin"] }))?.action).toBeNull();
    });
    it("then an empty learning card: every one of the six answers empty", async () => {
      expect((await read({ ...delivered, ...tested, ...empty }))?.action).toBe("learning_card_empty");
      const blank = { ...leah, learning: { learning_styles: [], interests: [], learning_note: "  " } };
      expect((await read({ ...delivered, ...tested, children: [blank] }))?.action).toBe("learning_card_empty");
      for (const answer of [{ learning_styles: ["visual"] }, { math_feeling: "likes" }, { learning_goal: "confidence" }, { weekly_time: "15" }, { learning_note: "Likes dogs" }]) {
        expect((await read({ ...delivered, ...tested, children: [{ ...leah, learning: answer }] }))?.action).toBeNull();
      }
    });
    it("shows in an ended plan, except Start the test", async () => {
      const ended = { ...delivered, ...empty, plans: [{ ...own, kind: "ended" as const }] };
      expect((await read(ended))?.child.stage).toBe("ended");
      expect((await read(ended))?.action).toBe("learning_card_empty");
    });
    it("no finished test and an open test: the test action continues it, before every other item", async () => {
      expect((await read({ tests: [open("t")], ...empty, pinSet: false }))?.action).toBe("continue_test");
      expect((await read({ ...delivered, tests: [open("t")], plans: [{ ...own, kind: "payment_failed" }] }))?.action).toBe("continue_test");
    });
    it("no finished test and a test that ran out of time: the test action starts a new one", async () => {
      expect((await read({ tests: [open("t", { status: "expired", resumeUntil: NOW - HOUR })] }))?.action).toBe("start_test");
      expect((await read({ tests: [open("t", { resumeUntil: NOW - HOUR })] }))?.action).toBe("start_test");
    });
    it("a finished test and a new open test: no test action", async () => {
      expect((await read({ tests: [test("t"), open("o")], reports: [report("t")], results: [result("t")] }))?.action).toBeNull();
    });
    it("a finished test with no report yet: no test action", async () => {
      expect((await read({ tests: [test("t")] }))?.action).toBeNull();
    });
    it("an ended plan with an open test: no test action", async () => {
      const ended = { ...delivered, tests: [open("t")], plans: [{ ...own, kind: "ended" as const }] };
      expect((await read(ended))?.child.stage).toBe("ended");
      expect((await read(ended))?.action).toBeNull();
    });
  });

  it("copies only the fields it names, whatever a row holds", async () => {
    const SECRET = "RAW-CANARY";
    const raw = { learner_profile: SECRET, ai: { findings: [SECRET] }, placement: { note: SECRET }, model: { summary: SECRET } };
    const view = await read({
      ...delivered,
      tests: [{ ...test("t"), ...raw }],
      reports: [{ ...report("t"), ...raw }],
      results: [{ ...result("t", { answers: at("number", 3, 4, 0) }), level: { ...level(), ...raw } as never, ...raw }],
      children: [{ ...leah, ...raw, learning: { learning_note: SECRET } }],
    });
    expect(view?.areas).toHaveLength(1);
    expect(JSON.stringify(view)).not.toContain(SECRET);
  });

  it.each(["results", "scans", "learning"] as const)("a failed read of %s throws", async (table) => {
    await expect(read({ ...delivered, ...tested, results: [result("t")], fail: [table] })).rejects.toThrow(table);
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

describe("the Progress tab (#561)", () => {
  const ON = { progress: true, maya: false, scanPages: false };
  const card = { cards: [{ parentId: "parent-1", childId: "child-1", cardSavedAt: "2026-10-05T00:00:00Z" }], switches: ON };
  const finished = test("t1", { completedAt: Date.parse("2026-10-30T18:00:00Z") });
  const level = { working: 3, top: 3, certainty: "clear", confidence: "high" } as unknown as ReportModel["level"];
  const result: MemoryResult = { parentId: "parent-1", childId: "child-1", assessmentId: "t1", level, answers: [] };
  const withTest = { ...card, tests: [finished], reports: [report("t1")], results: [result] };
  const tally = (standard: string, correct: number, total: number) => ({ parentId: "parent-1", childId: "child-1", assessmentId: "t1", standard, correct, total, at: "2026-10-30T18:00:00Z" });
  const read = (tables: Parameters<typeof parent>[0]) => readProgress(parent(tables), "child-1", NOW);
  const tile = (view: Awaited<ReturnType<typeof read>>, code: string) => view!.areas.flatMap((a) => a.tiles).find((t) => t.code === code);

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
      expect(readers.reads.skillTests).toBe(1);
    });
    it("makes no read of the tallies when the tab is hidden", async () => {
      const readers = memoryParentViewReaders({ children: [leah], ...withTest, switches: { progress: false, maya: false, scanPages: false } });
      await readProgress(readers.parent("parent-1"), "child-1", NOW);
      expect(readers.reads.skillTests).toBe(0);
    });
  });

  describe("the map", () => {
    it("shows the working level's grade with each state, from the tallies of only this child", async () => {
      const view = await read({ ...withTest, skillTests: [tally("3.1", 2, 2), tally("3.2", 0, 4), { ...tally("3.3", 2, 2), childId: "child-2" }] });
      expect(view!.level).toMatchObject({ working: 3, testedOn: "2026-10-30" });
      expect(tile(view, "3.1")).toMatchObject({ state: "mastered", why: "Leah got every counted answer on this right on the test on October 30." });
      expect(tile(view, "3.2")?.state).toBe("needs_review");
      expect(tile(view, "3.3")?.state).toBe("not_started");
      expect(view!.areas.map((a) => a.area)).toEqual(["number", "fractions", "algebra", "shapes"]);
    });
    it("groups a Grade 2 child's map by the standards of the level", async () => {
      const grade2 = { ...leah, grade: 2 };
      const view = await readProgress(memoryParentViewReaders({ children: [grade2], ...withTest, results: [{ ...result, level: { ...level, working: 2 } }] }).parent("parent-1"), "child-1", NOW);
      expect(view!.areas.map((a) => a.area)).toEqual(["number", "algebra", "shapes"]);
    });
    it("shows a Grade 2 child working at Grade 3 the fractions standard", async () => {
      const view = await readProgress(memoryParentViewReaders({ children: [{ ...leah, grade: 2 }], ...withTest }).parent("parent-1"), "child-1", NOW);
      expect(view!.areas.map((a) => a.area)).toEqual(["number", "fractions", "algebra", "shapes"]);
      expect(view!.areas[1].tiles.map((t) => t.code)).toContain("3.2");
    });
    it("reads the newest workbook's standards for Working on, and adds one from another grade", async () => {
      const view = await read({
        ...withTest,
        workbooks: [{ parentId: "parent-1", childId: "child-1", number: 1, status: "shipped" }, { parentId: "parent-1", childId: "child-1", number: 2, status: "shipped" }],
        questions: [
          { parentId: "parent-1", workbookId: "wb-child-1-1", standard: "3.5" },
          { parentId: "parent-1", workbookId: "wb-child-1-2", standard: "3.1" },
          { parentId: "parent-1", workbookId: "wb-child-1-2", standard: "2.1" },
          { parentId: "parent-1", workbookId: "wb-child-1-2", standard: null },
        ],
      });
      expect(view!.workbookNumber).toBe(2);
      expect(tile(view, "3.1")).toMatchObject({ state: "working_on", why: "This is in Workbook 2." });
      expect(tile(view, "2.1")).toMatchObject({ state: "working_on", grade: 2 });
      expect(tile(view, "3.5")?.state).toBe("not_started");
    });
    it("uses the family's time for the day in a line", async () => {
      const lateAtNight = Date.parse("2026-10-31T02:00:00Z");
      const view = await read({ ...withTest, family: { timeZone: "America/Vancouver", postal: null }, tests: [{ ...finished, completedAt: lateAtNight }], skillTests: [{ ...tally("3.1", 2, 2), at: "2026-10-31T02:00:00Z" }] });
      expect(tile(view, "3.1")?.why).toContain("on October 30");
    });
    it("has no map while the newest test's report is not ready, and no older result in its place", async () => {
      const newer = test("t2", { completedAt: NOW - HOUR });
      const view = await read({ ...withTest, tests: [finished, newer] });
      expect(view).toMatchObject({ level: null, areas: [] });
    });
    it("has no map with a saved card and no test", async () => {
      expect(await read(card)).toMatchObject({ level: null, workbookNumber: null, areas: [] });
    });
    it("keeps the report's note on a test the report calls unreliable", async () => {
      const view = await read({ ...withTest, results: [{ ...result, unreliable: true }] });
      expect(view!.level?.unreliable).toBe(true);
    });
    it("gives a test the report calls unreliable no state: Not started, also for a low result", async () => {
      const view = await read({ ...withTest, results: [{ ...result, unreliable: true }], skillTests: [{ ...tally("3.1", 0, 4), assessmentId: "t1" }, { ...tally("3.3", 2, 2), assessmentId: "t1" }] });
      expect(tile(view, "3.1")).toMatchObject({ state: "not_started", why: "There is not enough from Leah's test to say yet." });
      expect(tile(view, "3.3")?.state).toBe("not_started");
      expect(view!.level?.unreliable).toBe(true);
    });
    it("keeps the state of an earlier good test beside a newer test the report calls unreliable", async () => {
      const older = test("t0", { completedAt: Date.parse("2026-09-01T18:00:00Z") });
      const view = await read({
        ...withTest,
        tests: [older, finished],
        reports: [report("t0"), report("t1")],
        results: [{ ...result, assessmentId: "t0" }, { ...result, unreliable: true }],
        skillTests: [{ ...tally("3.1", 2, 2), at: "2026-09-01T18:00:00Z", assessmentId: "t0" }, { ...tally("3.1", 0, 4), assessmentId: "t1" }],
      });
      expect(tile(view, "3.1")).toMatchObject({ state: "mastered", why: "Leah got every counted answer on this right on the test on September 1." });
      expect(view!.level?.unreliable).toBe(true);
    });

    describe("a test whose report is not built yet: no evidence until it is", () => {
      // A good test, then a low test whose report is pending, then the newest test, reported, with no tally of 3.3.
      const good = test("t0", { completedAt: Date.parse("2026-09-01T18:00:00Z") });
      const low = test("t-low", { completedAt: Date.parse("2026-09-15T18:00:00Z") });
      const tables = (lowReport: { unreliable: boolean } | null) => ({
        ...withTest,
        tests: [good, low, finished],
        reports: [report("t0"), report("t1"), ...(lowReport ? [report("t-low")] : [])],
        results: [{ ...result, assessmentId: "t0" }, result, ...(lowReport ? [{ ...result, assessmentId: "t-low", unreliable: lowReport.unreliable }] : [])],
        workbooks: [{ parentId: "parent-1", childId: "child-1", number: 1, status: "shipped" as const }],
        questions: [{ parentId: "parent-1", workbookId: "wb-child-1-1", standard: "3.3" }],
        skillTests: [
          { ...tally("3.3", 2, 2), at: "2026-09-01T18:00:00Z", assessmentId: "t0" },
          { ...tally("3.3", 0, 4), at: "2026-09-15T18:00:00Z", assessmentId: "t-low" },
          { ...tally("3.4", 0, 4), at: "2026-09-15T18:00:00Z", assessmentId: "t-low" },
        ],
      });
      it("keeps an earlier Mastered beside a low test with its report pending", async () => {
        const view = await read(tables(null));
        expect(tile(view, "3.3")).toMatchObject({ state: "mastered", why: "Leah got every counted answer on this right on the test on September 1." });
        expect(tile(view, "3.4")?.state).toBe("not_started");
      });
      it("keeps it too once the report calls that test unreliable", async () => {
        const view = await read(tables({ unreliable: true }));
        expect(tile(view, "3.3")?.state).toBe("mastered");
        expect(tile(view, "3.4")?.state).toBe("not_started");
      });
      it("reads the test once its report exists and calls it reliable", async () => {
        const view = await read(tables({ unreliable: false }));
        expect(tile(view, "3.3")?.state).toBe("needs_review");
        expect(tile(view, "3.4")?.state).toBe("needs_review");
      });
    });
  });

  describe("what leaves the module", () => {
    it("holds only the named fields: no raw record field, no marks, no counts", async () => {
      const raw = { ...tally("3.1", 2, 2), secret: "RAW-PROFILE", ai: "AI-GUESS" };
      const view = await read({ ...withTest, skillTests: [raw] });
      expect(Object.keys(view!).sort()).toEqual(["areas", "child", "level", "workbookNumber"]);
      expect(Object.keys(view!.areas[0]).sort()).toEqual(["area", "name", "tiles"]);
      expect(Object.keys(view!.areas[0].tiles[0]).sort()).toEqual(["code", "grade", "name", "skills", "state", "why", "workbookLine"]);
      const text = JSON.stringify(view!.areas);
      for (const bad of ["RAW-PROFILE", "AI-GUESS", '"correct"', '"total"', '"evidenceAt"', '"reason"']) expect(text).not.toContain(bad);
    });
    it("throws when the tallies cannot be read: an empty read would show every skill as Not started", async () => {
      await expect(read({ ...withTest, fail: ["skillTests"] })).rejects.toThrow("skillTests read failed");
    });
  });
});
