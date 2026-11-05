import { afterEach, describe, expect, it, vi } from "vitest";
import { listChildren, readChild, readWorkbooks } from "@/lib/parent-view";
import { memoryParentViewReaders, type MemoryParentViewTables, type MemoryTest, type MemoryWorkbook } from "@/lib/parent-view-memory";

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
});

describe("what a parent reads", () => {
  it("lists only their own children, oldest first, with one read of each table for the list", async () => {
    const younger = { ...leah, id: "child-3", firstName: "Ana", createdAt: "2026-10-03T00:00:00Z" };
    const readers = memoryParentViewReaders({ children: [younger, omar, leah] });
    const list = await listChildren(readers.parent("parent-1"), NOW);
    expect(list.map((c) => c.firstName)).toEqual(["Leah", "Ana"]);
    expect(readers.reads).toEqual({ children: 1, tests: 1, reports: 1, cards: 1, deliveries: 1, workbooks: 1, plans: 1, switches: 1, corrections: 0, dispatches: 0, family: 0 });
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
    expect((await read({ workbooks: [book(1)], deliveries }))?.next).toEqual({ kind: "range", earliest: "2026-11-16", latest: "2026-12-03" });
    const corrections = [
      { ...own, workbookId: "wb-1", deliveredAt: "2026-11-04T20:00:00Z", auditId: 7 },
      { ...own, workbookId: "wb-1", deliveredAt: "2026-11-06T20:00:00Z", auditId: 9 },
      { ...own, workbookId: "wb-1", deliveredAt: "2026-11-03T20:00:00Z", auditId: 8 },
    ];
    const view = await read({ workbooks: [book(1)], deliveries, corrections });
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
  it("lists every shipped book, newest first, with whether it has a PDF", async () => {
    const view = await read({ workbooks: [book(1, { pdfPath: null, shippedAt: "2026-10-10T18:00:00Z" }), book(2)] });
    expect(view?.books).toEqual([
      { id: "wb-2", number: 2, shippedOn: "2026-11-02", hasPdf: true },
      { id: "wb-1", number: 1, shippedOn: "2026-10-10", hasPdf: false },
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
