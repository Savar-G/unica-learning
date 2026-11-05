import { afterEach, describe, expect, it, vi } from "vitest";
import { listChildren, readChild } from "@/lib/parent-view";
import { memoryParentViewReaders, type MemoryParentViewTables, type MemoryTest } from "@/lib/parent-view-memory";

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
    expect(readers.reads).toEqual({ children: 1, tests: 1, reports: 1, cards: 1, deliveries: 1, workbooks: 1, plans: 1, switches: 1 });
  });
  it("gives the exact fields of a child, and nothing for a panel with no data", async () => {
    expect(await readChild(parent(), "child-1", NOW)).toEqual({
      id: "child-1", firstName: "Leah", schoolGrade: 3, stage: "no_test", opensOn: "start_test", tabs: ["assessment", "account"], readOnly: false, currentWorkbook: null,
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
    expect(Object.keys(listed).sort()).toEqual(["currentWorkbook", "firstName", "id", "opensOn", "readOnly", "schoolGrade", "stage", "tabs"]);
    expect(JSON.stringify(listed)).not.toContain(SECRET);
    expect(JSON.stringify(await readChild(reader, "child-1", NOW))).not.toContain(SECRET);
  });
});
