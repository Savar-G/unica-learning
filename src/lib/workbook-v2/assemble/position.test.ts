import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateSnapshot } from "../bank/snapshot";
import rawSnapshot from "../fixtures/snapshot-facts.json";
import type { SheetResultKind } from "../results/sheet-results";
import { levelOrder, NUDGE_AFTER_FAILS, position, type ChildPosition, type IssuedSheet, type PositionOutcome, type QueueReason, type ScanReceipt, type SheetResultRecord } from "./position";

const bank = validateSnapshot(structuredClone(rawSnapshot));
if (!bank.ok) throw new Error(bank.problems.join("\n"));
const SNAPSHOT = bank.snapshot;
/** The five invented sheets of the level, in topic order. */
const [A, B, C, D, E] = levelOrder(SNAPSHOT).map((s) => s.id);
const PAGES = new Map(levelOrder(SNAPSHOT).map((s) => [s.id, [s.firstPage, s.firstPage + 1] as [number, number]]));

const issue = (book: number, sheetId: string, attempt: number, reason?: QueueReason): IssuedSheet => ({
  bookId: `book-${book}`, bookNumber: book, sheetId, attempt, pages: PAGES.get(sheetId) ?? [0, 0], ...(reason ? { reason } : {}),
});
const scans = (book: number, ...pages: number[]): ScanReceipt[] => pages.map((pageNumber) => ({ bookId: `book-${book}`, pageNumber }));
const result = (book: number, sheetId: string, attempt: number, kind: SheetResultKind): SheetResultRecord => ({ bookId: `book-${book}`, sheetId, attempt, result: kind, itemsScored: 10, mistakes: kind === "mastered" ? 0 : 3 });

function placed(issued: IssuedSheet[], receipts: ScanReceipt[] = [], results: SheetResultRecord[] = [], startSheetId?: string): ChildPosition {
  const outcome = position({ childId: "child-1", ...(startSheetId ? { startSheetId } : {}) }, issued, receipts, results, SNAPSHOT);
  if (!outcome.ok) throw new Error(outcome.problems.join("\n"));
  return outcome;
}
const queueOf = (p: ChildPosition) => p.queue.map((q) => `${q.sheetId}#${q.attempt} ${q.reason}`);

describe("the queue of a child", () => {
  it("is every sheet of the level in order for a child with no history, and starts at the start sheet", () => {
    expect(queueOf(placed([]))).toEqual([`${A}#1 new`, `${B}#1 new`, `${C}#1 new`, `${D}#1 new`, `${E}#1 new`]);
    expect(queueOf(placed([], [], [], C))).toEqual([`${C}#1 new`, `${D}#1 new`, `${E}#1 new`]);
  });

  it("puts repeats before new sheets, each in the order of the level, after a partial first book", () => {
    const issued = [issue(1, A, 1), issue(1, B, 1), issue(1, C, 1), issue(1, D, 1)];
    const p = placed(issued, scans(1, 121, 122, 123, 124, 125, 126, 127, 128), [result(1, D, 1, "repeat"), result(1, A, 1, "mastered"), result(1, B, 1, "repeat")]);
    expect(queueOf(p)).toEqual([`${B}#2 repeat`, `${D}#2 repeat`, `${E}#1 new`]);
    expect(p.done).toEqual([A]);
    expect(p.assumedPassed).toEqual([{ sheetId: C, attempt: 1, bookId: "book-1" }]);
  });

  it("follows topic-and-sheet order rather than page numbers, including startSheetId", () => {
    const raw = structuredClone(rawSnapshot);
    // Two topics whose declared order (topic-8 then topic-7, with sheets reversed inside topic-8) differs from firstPage (121..129).
    raw.topics = [
      { id: "topic-8", code: "2-8", title: "Later pages first", sheets: [E, D] },
      { id: "topic-7", code: "2-7", title: "Number facts", sheets: [A, B, C] },
    ];
    const reordered = validateSnapshot(raw);
    if (!reordered.ok) throw new Error(reordered.problems.join("\n"));
    expect(levelOrder(reordered.snapshot).map((s) => s.id)).toEqual([E, D, A, B, C]);
    const p = position({ childId: "child-1", startSheetId: D }, [], [], [], reordered.snapshot);
    if (!p.ok) throw new Error(p.problems.join("\n"));
    expect(queueOf(p)).toEqual([`${D}#1 new`, `${A}#1 new`, `${B}#1 new`, `${C}#1 new`]);
  });

  it("is a pure function: the same history in another order gives the same position", () => {
    const issued = [issue(1, A, 1), issue(1, B, 1), issue(2, B, 2, "repeat"), issue(2, C, 1)];
    const results = [result(1, A, 1, "repeat"), result(1, B, 1, "repeat"), result(2, B, 2, "mastered")];
    const one = placed(issued, scans(1, 121), results);
    expect(placed([...issued].reverse(), scans(1, 121), [...results].reverse())).toEqual(one);
    expect(queueOf(one)).toEqual([`${A}#2 repeat`, `${C}#2 unscanned`, `${D}#1 new`, `${E}#1 new`]);
  });
});

type Latest = "mastered" | "repeat" | "unknown" | "unmarked";
type Coverage = "under half" | "half or more";

/**
 * The state grid. The sheet A has its latest attempt in a book of two sheets (4 pages); 1 page scanned is under half, 2
 * are half. With "after an unscanned repeat", attempt 1 of A had no result and A was issued again in book 2.
 */
describe.each<[Latest, Coverage, boolean, string]>([
  ["mastered", "under half", false, "done"],
  ["mastered", "half or more", false, "done"],
  ["mastered", "under half", true, "done"],
  ["mastered", "half or more", true, "done"],
  ["repeat", "under half", false, "repeat"],
  ["repeat", "half or more", false, "repeat"],
  ["repeat", "under half", true, "repeat"],
  ["repeat", "half or more", true, "repeat"],
  ["unknown", "under half", false, "unscanned"],
  ["unknown", "half or more", false, "assumed"],
  ["unknown", "under half", true, "assumed"],
  ["unknown", "half or more", true, "assumed"],
  ["unmarked", "under half", false, "unscanned"],
  ["unmarked", "half or more", false, "assumed"],
  ["unmarked", "under half", true, "assumed"],
  ["unmarked", "half or more", true, "assumed"],
])("a latest attempt that is %s, in a book with %s of its pages scanned (after an unscanned repeat: %s)", (latest, coverage, afterRepeat, wanted) => {
  it(`is ${wanted}`, () => {
    const book = afterRepeat ? 2 : 1;
    const attempt = afterRepeat ? 2 : 1;
    const issued = [...(afterRepeat ? [issue(1, A, 1), issue(1, E, 1)] : []), issue(book, A, attempt, afterRepeat ? "unscanned" : undefined), issue(book, B, 1)];
    const receipts = coverage === "under half" ? scans(book, 121) : scans(book, 121, 124);
    const results = latest === "unmarked" ? [] : [result(book, A, attempt, latest)];
    const p = placed(issued, receipts, results);
    const own = p.queue.filter((q) => q.sheetId === A);
    const state = p.done.includes(A) ? "done" : p.assumedPassed.some((s) => s.sheetId === A) ? "assumed" : own[0]?.reason;
    expect(state).toBe(wanted);
    if (wanted === "repeat" || wanted === "unscanned") expect(own).toEqual([{ sheetId: A, attempt: attempt + 1, reason: wanted }]);
    else expect(own).toEqual([]);
    expect(p.teamNotices.filter((n) => n.startsWith(`Sheet "${A}"`))).toEqual(wanted === "unscanned" ? [`Sheet "${A}", attempt 1 (book 1): 1 of 4 pages of the book were scanned, so attempt 2 repeats the sheet one time.`] : []);
    expect(p.queue.findIndex((q) => q.reason === "new")).toBeGreaterThanOrEqual(p.queue.filter((q) => q.reason !== "new").length);
  });
});

describe("the rules over several books", () => {
  it("keeps a late fail: a result of repeat that arrives after a later book moved past the sheet", () => {
    const issued = [issue(1, A, 1), issue(1, B, 1), issue(2, C, 1), issue(2, D, 1)];
    const scanned = [...scans(1, 121, 122, 123, 124), ...scans(2, 125, 126, 127, 128)];
    const before = placed(issued, scanned);
    expect(before.assumedPassed.map((s) => s.sheetId)).toEqual([A, B, C, D]);
    expect(queueOf(before)).toEqual([`${E}#1 new`]);
    const after = placed(issued, scanned, [result(1, A, 1, "repeat")]);
    expect(queueOf(after)).toEqual([`${A}#2 repeat`, `${E}#1 new`]);
  });

  it("repeats a sheet one time for an unscanned book, never again, however many books come back unscanned", () => {
    let issued: IssuedSheet[] = [];
    const counts: number[] = [];
    for (let book = 1; book <= 6; book++) {
      const p = placed(issued);
      issued = [...issued, ...p.queue.slice(0, 2).map((q) => issue(book, q.sheetId, q.attempt, q.reason))];
      counts.push(issued.filter((s) => s.sheetId === A).length);
    }
    expect(Math.max(...counts)).toBe(2);
    expect(issued.filter((s) => s.sheetId === A).map((s) => s.attempt)).toEqual([1, 2]);
  });

  it("does not issue a second unscanned repeat when a late fail lands on attempt 1 after an unscanned repeat was already issued", () => {
    const issued = [issue(1, A, 1, "new"), issue(1, B, 1, "new"), issue(2, A, 2, "unscanned"), issue(2, C, 1, "new")];
    const p = placed(issued, [], [result(1, A, 1, "repeat")]);
    expect(p.queue.filter((q) => q.sheetId === A)).toEqual([]);
    expect(p.assumedPassed).toContainEqual({ sheetId: A, attempt: 2, bookId: "book-2" });
    // By contrast, when attempt 2 was issued for a fail (not unscanned), an unmarked attempt 2 in an unscanned book still gets its one unscanned repeat.
    const afterFail = placed([issue(1, A, 1, "new"), issue(1, B, 1, "new"), issue(2, A, 2, "repeat"), issue(2, C, 1, "new")], [], [result(1, A, 1, "repeat")]);
    expect(afterFail.queue.filter((q) => q.sheetId === A)).toEqual([{ sheetId: A, attempt: 3, reason: "unscanned" }]);
  });

  it(`nudges Maya after ${NUDGE_AFTER_FAILS} failed attempts, and keeps the sheet due`, () => {
    const issued = [issue(1, A, 1), issue(1, B, 1), issue(2, A, 2, "repeat"), issue(2, B, 2, "repeat"), issue(3, A, 3, "repeat"), issue(3, C, 1)];
    const twice = placed(issued.slice(0, 4), [], [result(1, A, 1, "repeat"), result(2, A, 2, "repeat")]);
    expect(twice.mayaNudges).toEqual([]);
    const thrice = placed(issued, [], [result(1, A, 1, "repeat"), result(2, A, 2, "repeat"), result(3, A, 3, "repeat")]);
    expect(thrice.mayaNudges).toEqual([{ sheetId: A, failedAttempts: 3 }]);
    expect(thrice.queue[0]).toEqual({ sheetId: A, attempt: 4, reason: "repeat" });
  });

  it("counts a page scanned twice one time", () => {
    const issued = [issue(1, A, 1), issue(1, B, 1)];
    const once = placed(issued, scans(1, 121));
    const thrice = placed(issued, scans(1, 121, 121, 121));
    expect(thrice).toEqual(once);
    expect(queueOf(once)).toContain(`${A}#2 unscanned`);
  });
});

describe("a history that cannot be right", () => {
  const refused = (outcome: PositionOutcome) => (outcome.ok ? [] : outcome.problems).join("\n");
  it.each<[string, () => PositionOutcome, RegExp]>([
    ["an unknown start sheet", () => position({ childId: "c", startSheetId: "no-sheet" }, [], [], [], SNAPSHOT), /no start sheet "no-sheet"/],
    ["a child id with a space", () => position({ childId: "a b" }, [], [], [], SNAPSHOT), /child id/],
    ["an unknown sheet", () => position({ childId: "c" }, [issue(1, "no-sheet", 1)], [], [], SNAPSHOT), /"no-sheet", attempt 1: the level has no such sheet/],
    ["an attempt of 0", () => position({ childId: "c" }, [issue(1, A, 0)], [], [], SNAPSHOT), /attempt must be a whole number, 1 or more/],
    ["an unknown issue reason", () => position({ childId: "c" }, [issue(1, A, 1, "manual" as QueueReason)], [], [], SNAPSHOT), /reason must be new, repeat or unscanned/],
    ["attempt 1 issued as unscanned", () => position({ childId: "c" }, [issue(1, A, 1, "unscanned")], [], [], SNAPSHOT), /attempt 1 cannot have reason "unscanned"/],
    ["attempt 2 issued without a reason", () => position({ childId: "c" }, [issue(1, A, 1, "new"), issue(2, A, 2)], [], [], SNAPSHOT), /attempt 2 must have reason "repeat" or "unscanned"/],
    ["attempt 2 issued as new", () => position({ childId: "c" }, [issue(1, A, 1, "new"), issue(2, A, 2, "new")], [], [], SNAPSHOT), /attempt 2 must have reason "repeat" or "unscanned"/],
    ["a sheet missing attempt 1", () => position({ childId: "c" }, [issue(2, A, 2, "unscanned")], [], [], SNAPSHOT), /attempts must start at 1 with no gaps/],
    ["a sheet with a gap in attempts", () => position({ childId: "c" }, [issue(1, A, 1, "new"), issue(3, A, 3, "repeat")], [], [], SNAPSHOT), /attempts must start at 1 with no gaps/],
    ["an attempt issued twice", () => position({ childId: "c" }, [issue(1, A, 1), issue(2, A, 1)], [], [], SNAPSHOT), /issued more than once/],
    ["a page twice in one book", () => position({ childId: "c" }, [issue(1, A, 1), { ...issue(1, B, 1), pages: [121, 999] }], [], [], SNAPSHOT), /"book-1" has the page 121 more than once/],
    ["a book with two numbers", () => position({ childId: "c" }, [issue(1, A, 1), { ...issue(2, B, 1), bookId: "book-1" }], [], [], SNAPSHOT), /more than one book number/],
    ["a later attempt in an earlier book", () => position({ childId: "c" }, [issue(2, A, 1), issue(1, A, 2, "repeat")], [], [], SNAPSHOT), /attempt 2 must be in a later book/],
    ["a scan of a page that the book did not print", () => position({ childId: "c" }, [issue(1, A, 1)], scans(1, 125), [], SNAPSHOT), /page 125 of the book "book-1" is of no issued page/],
    ["a scan with a string page number", () => position({ childId: "c" }, [issue(1, A, 1)], [{ bookId: "book-1", pageNumber: "121" as unknown as number }], [], SNAPSHOT), /page "121" of the book "book-1" is of no issued page/],
    ["a result of an attempt that is not issued", () => position({ childId: "c" }, [issue(1, A, 1)], [], [result(1, A, 2, "mastered")], SNAPSHOT), /did not issue this attempt/],
    ["two results of one attempt", () => position({ childId: "c" }, [issue(1, A, 1)], [], [result(1, A, 1, "mastered"), result(1, A, 1, "repeat")], SNAPSHOT), /more than one result/],
    ["an unknown result", () => position({ childId: "c" }, [issue(1, A, 1)], [], [{ ...result(1, A, 1, "mastered"), result: "passed" as SheetResultKind }], SNAPSHOT), /mastered, repeat or unknown/],
    ["more mistakes than scored questions", () => position({ childId: "c" }, [issue(1, A, 1)], [], [{ ...result(1, A, 1, "repeat"), mistakes: 11 }], SNAPSHOT), /no more mistakes than scored/],
  ])("refuses %s", (_name, run, problem) => {
    expect(refused(run())).toMatch(problem);
  });
});

/** Random histories of up to 4 books: which sheets each book issues next from the queue, its scans and its results. */
const histories = fc.array(fc.record({
  take: fc.integer({ min: 1, max: 3 }),
  scanned: fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }),
  results: fc.array(fc.constantFrom<SheetResultKind | null>("mastered", "repeat", "unknown", null), { minLength: 3, maxLength: 3 }),
}), { minLength: 0, maxLength: 4 });

describe("properties of every history", () => {
  it("each sheet is in the queue at most once, repeats come first, a done sheet is not due, and the queue is the same each time", () => {
    fc.assert(fc.property(histories, (books) => {
      let [issued, receipts, results]: [IssuedSheet[], ScanReceipt[], SheetResultRecord[]] = [[], [], []];
      books.forEach(({ take, scanned, results: kinds }, i) => {
        const book = i + 1;
        const next = placed(issued, receipts, results).queue.slice(0, take).map((q) => issue(book, q.sheetId, q.attempt, q.reason));
        issued = [...issued, ...next];
        receipts = [...receipts, ...next.flatMap((s, j) => s.pages.filter((_, k) => scanned[(2 * j + k) % 6]).map((pageNumber) => ({ bookId: s.bookId, pageNumber })))];
        results = [...results, ...next.flatMap((s, j) => (kinds[j] ? [result(book, s.sheetId, s.attempt, kinds[j])] : []))];
      });
      const p = placed(issued, receipts, results);
      expect(placed(issued, [...receipts, ...receipts], results)).toEqual(p);
      const ids = p.queue.map((q) => q.sheetId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.filter((id) => p.done.includes(id))).toEqual([]);
      const firstNew = p.queue.findIndex((q) => q.reason === "new");
      if (firstNew >= 0) expect(p.queue.slice(firstNew).every((q) => q.reason === "new")).toBe(true);
      // A sheet repeats for an unscanned book at most once.
      for (const id of new Set(issued.map((s) => s.sheetId))) {
        const noResult = issued.filter((s) => s.sheetId === id && !results.some((r) => r.sheetId === id && r.attempt === s.attempt && r.result !== "unknown"));
        expect(noResult.length).toBeLessThanOrEqual(2);
      }
    }));
  });
});
