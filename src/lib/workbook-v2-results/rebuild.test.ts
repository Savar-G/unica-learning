// Invented marks on an invented v2 book, end to end: BookStore, sheetResults and position (UNI-243 R3 and R4). Each case
// runs on the memory store and on the Supabase store over a fake PostgREST. No reference, vault or family content.
import { describe, expect, it } from "vitest";
import { inventedTopicSnapshot } from "@/lib/workbook-v2/testing/sample";
import type { EffectiveMark } from "@/lib/scan-marking";
import type { FirstTry } from "@/lib/workbook-v2/results/sheet-results";
import { fakeBookSupabase, itemIdOf, memorySeeder, pagesOf, type BookSeeder, type SeedFamily } from "./book-store.fixtures";
import { childMarksFrom } from "./marks";
import { memoryBookStore } from "./memory-store";
import { childPosition } from "./progress";
import { masteryConfigFor, rebuildSheetResults } from "./rebuild";
import { supabaseBookStore } from "./supabase-store";
import type { BookStore, ChildMark, MarkSource } from "./types";

const SNAPSHOT = inventedTopicSnapshot();
const [A, B, C] = [...SNAPSHOT.sheets.keys()];
const REV = "abcdefabcdefabcdefabcdefabcd";
/** Ten questions a sheet: at 90% one mistake is allowed, and 8 marked is the least that is not "unknown". */
const ITEMS = 10;

/** Marks in memory with marking's rule: every change raises the child's marks version. */
function memoryMarks(): MarkSource & { set(workbookId: string, sheetId: string, attempt: number, tries: (FirstTry | null)[], printedRevision?: string): void; reads: number } {
  let version = 0;
  const marks = new Map<string, ChildMark>();
  const source = {
    reads: 0,
    set(workbookId: string, sheetId: string, attempt: number, tries: (FirstTry | null)[], printedRevision = REV) {
      tries.forEach((firstTry, i) => {
        const itemId = itemIdOf(sheetId, attempt, i + 1, ITEMS);
        if (firstTry) marks.set(`${workbookId} ${printedRevision} ${itemId}`, { workbookId, printedRevision, itemId, firstTry });
      });
      version++;
    },
    async version() { source.reads++; return version; },
    async marks() { source.reads++; return [...marks.values()]; },
  };
  return source;
}
const tries = (right: number, wrong: number, blank = 0): FirstTry[] =>
  [...Array<FirstTry>(right).fill("right"), ...Array<FirstTry>(wrong).fill("wrong"), ...Array<FirstTry>(blank).fill("blank")];

interface World { store: BookStore; seeder: BookSeeder; family: SeedFamily; book1: string; book2: string }
const adapters: [string, () => { store: BookStore; seeder: BookSeeder }][] = [
  ["memory", () => { const store = memoryBookStore(); return { store, seeder: memorySeeder(store) }; }],
  ["Supabase (fake PostgREST)", () => { const fake = fakeBookSupabase(); return { store: supabaseBookStore(fake.db), seeder: fake.seeder }; }],
];

/** Book 1 issues A and B (pages 1 to 4); book 2, when given, issues C: the child has moved on. */
async function world(make: () => { store: BookStore; seeder: BookSeeder }, withBook2 = false): Promise<World> {
  const { store, seeder } = make();
  const [book1, book2] = [crypto.randomUUID(), crypto.randomUUID()];
  const family: SeedFamily = {
    parentId: crypto.randomUUID(), childId: crypto.randomUUID(),
    books: [
      { workbookId: book1, number: 1, printedRevision: REV, levels: [3], sheets: [{ sheetId: A, attempt: 1, items: ITEMS }, { sheetId: B, attempt: 1, items: ITEMS }] },
      ...(withBook2 ? [{ workbookId: book2, number: 2, printedRevision: REV, levels: [3], sheets: [{ sheetId: C, attempt: 1, items: ITEMS }] }] : []),
    ],
  };
  await seeder.seed(family);
  return { store, seeder, family, book1, book2 };
}
const scanSheet = async (w: World, workbookId: string, k: number) => { for (const page of pagesOf(k)) await w.seeder.scan(w.family, workbookId, page); };
async function placed(w: World) {
  const p = await childPosition(w.store, w.family.childId, SNAPSHOT);
  if (!p.ok) throw new Error(p.problems.join("\n"));
  return { ...p, queueText: p.queue.map((q) => `${q.sheetId}#${q.attempt} ${q.reason}`) };
}
const stored = async (w: World, sheetId: string) => (await w.store.sheetResults(w.family.childId)).find((r) => r.sheetId === sheetId && r.attempt === 1);

describe.each(adapters)("sheet results on the %s store", (_name, make) => {
  it("stops after one read for a child with v1 books only, and never reads the marks", async () => {
    const { store, seeder } = make();
    const family: SeedFamily = { parentId: crypto.randomUUID(), childId: crypto.randomUUID(), books: [] };
    await seeder.seed(family);
    const marks = memoryMarks();
    expect(await rebuildSheetResults({ books: store, marks }, family.childId)).toEqual({ status: "no-v2-books" });
    expect(marks.reads).toBe(0);
  });

  it("uses the saved level start unless the caller supplies one", async () => {
    const { store, seeder } = make();
    const childId = crypto.randomUUID();
    await seeder.seed({ parentId: crypto.randomUUID(), childId, books: [] });
    await store.saveChildState({ childId, levelId: SNAPSHOT.level.id, startSheetId: B, levelTestState: "not-due", pagesRequest: "same" });
    const cases = [[undefined, B], [C, C], [null, A]] as const;
    for (const [start, expected] of cases) {
      const placed = await childPosition(store, childId, SNAPSHOT, start);
      expect(placed).toMatchObject({ ok: true, queue: expect.any(Array) });
      if (placed.ok) expect(placed.queue[0]?.sheetId).toBe(expected);
    }
  });

  it("includes books published before the observed marks version in the same rebuild", async () => {
    const w = await world(make);
    const marks = memoryMarks();
    marks.set(w.book1, A, 1, tries(10, 0));
    const outcome = await rebuildSheetResults({
      books: w.store,
      marks: {
        marks: marks.marks,
        version: async (parentId, childId) => {
          await w.seeder.seed({ ...w.family, books: [{ workbookId: w.book2, number: 2, printedRevision: REV, levels: [3],
            sheets: [{ sheetId: C, attempt: 1, items: ITEMS }] }] });
          marks.set(w.book2, C, 1, tries(10, 0));
          return marks.version(parentId, childId);
        },
      },
    }, w.family.childId);
    expect(outcome).toMatchObject({ status: "written", written: 3, marksVersion: 2 });
    expect(await stored(w, C)).toMatchObject({ workbookId: w.book2, marksVersion: 2, result: "mastered" });
  });

  it("uses the first issuance for legacy duplicates and preserves results for all distinct attempts", async () => {
    const w = await world(make);
    await w.seeder.seed({ ...w.family, books: [{ workbookId: w.book2, number: 2, printedRevision: REV, levels: [3],
      sheets: [{ sheetId: A, attempt: 1, items: ITEMS }, { sheetId: C, attempt: 1, items: ITEMS }] }] });
    const marks = memoryMarks();
    marks.set(w.book1, A, 1, tries(10, 0));
    marks.set(w.book2, A, 1, tries(0, 10));
    marks.set(w.book2, C, 1, tries(10, 0));
    expect(await rebuildSheetResults({ books: w.store, marks }, w.family.childId)).toMatchObject({ status: "written", written: 3 });
    expect(await stored(w, A)).toMatchObject({ workbookId: w.book1, result: "mastered" });
    expect(await stored(w, C)).toMatchObject({ workbookId: w.book2, result: "mastered" });
    expect(await w.store.issuedSheets(w.family.childId)).toHaveLength(4);
    expect((await placed(w)).done).toEqual([A, C]);
  });

  it("rebuilds a result saved against a later duplicate without losing other sheets", async () => {
    const w = await world(make);
    await w.seeder.seed({ ...w.family, books: [{ workbookId: w.book2, number: 2, printedRevision: REV, levels: [3],
      sheets: [{ sheetId: A, attempt: 1, items: ITEMS }, { sheetId: C, attempt: 1, items: ITEMS }] }] });
    const legacy = {
      workbookId: w.book2, printedRevision: REV, sheetId: A, attempt: 1,
      itemsTotal: ITEMS, itemsScored: ITEMS, mistakes: 4, result: "repeat", marksVersion: 2,
    } as const;
    w.seeder.seedResult(w.family.childId, legacy);
    const marks = memoryMarks();
    marks.set(w.book1, A, 1, tries(10, 0));
    expect(await rebuildSheetResults({ books: w.store, marks }, w.family.childId)).toMatchObject({ status: "written", written: 2, stale: 1 });
    expect(await stored(w, A)).toEqual(legacy);
    marks.set(w.book2, C, 1, tries(10, 0));
    expect(await rebuildSheetResults({ books: w.store, marks }, w.family.childId)).toMatchObject({ status: "written", written: 3, stale: 0 });
    expect(await stored(w, A)).toMatchObject({ workbookId: w.book1, result: "mastered", marksVersion: 2 });
    expect(await stored(w, C)).toMatchObject({ workbookId: w.book2, result: "mastered", marksVersion: 2 });
    expect(await w.store.writeSheetResults(w.family.childId, 3, [legacy])).toMatchObject({ status: "refused" });
    expect(await w.store.issuedSheets(w.family.childId)).toHaveLength(4);
  });

  it.each(["selected", "duplicate"] as const)("infers a legacy retry reason with a result from the %s issuance", async (resultSource) => {
    const w = await world(make);
    const retryBook = crypto.randomUUID();
    await w.seeder.seed({ ...w.family, books: [
      { workbookId: w.book2, number: 2, printedRevision: REV, levels: [3], sheets: [{ sheetId: A, attempt: 1, items: ITEMS }] },
      { workbookId: retryBook, number: 3, printedRevision: REV, levels: [3], sheets: [{ sheetId: A, attempt: 2, items: ITEMS }] },
    ] });
    w.seeder.seedResult(w.family.childId, {
      workbookId: resultSource === "selected" ? w.book1 : w.book2,
      printedRevision: REV, sheetId: A, attempt: 1, itemsTotal: ITEMS, itemsScored: ITEMS, mistakes: 4, result: "repeat", marksVersion: 1,
    });
    const progress = await placed(w);
    expect(progress.queue.filter((q) => q.sheetId === A)).toEqual(
      resultSource === "selected" ? [{ sheetId: A, attempt: 3, reason: "unscanned" }] : [],
    );
  });

  it("under half of a book scanned: the unknown sheets repeat one time, with a notice for the team", async () => {
    const w = await world(make);
    const marks = memoryMarks();
    await w.seeder.scan(w.family, w.book1, 1);
    marks.set(w.book1, A, 1, tries(3, 0));
    expect(await rebuildSheetResults({ books: w.store, marks }, w.family.childId)).toMatchObject({ status: "written", written: 2, marksVersion: 1 });
    expect(await stored(w, A)).toMatchObject({ result: "unknown", itemsScored: 3 });
    const p = await placed(w);
    expect(p.queueText).toEqual([`${A}#2 unscanned`, `${B}#2 unscanned`, `${C}#1 new`]);
    expect(p.teamNotices).toHaveLength(2);
    expect(p.teamNotices[0]).toMatch(/1 of 4 pages of the book were scanned/);
  });

  it("half a book or more scanned: a sheet without marks counts as passed until its marks arrive", async () => {
    const w = await world(make);
    const marks = memoryMarks();
    await scanSheet(w, w.book1, 0);
    marks.set(w.book1, A, 1, tries(10, 0));
    expect(await rebuildSheetResults({ books: w.store, marks }, w.family.childId)).toMatchObject({ status: "written", written: 2 });
    expect(await stored(w, A)).toMatchObject({ result: "mastered", itemsScored: 10, mistakes: 0, marksVersion: 1 });
    expect(await stored(w, B)).toMatchObject({ result: "unknown", itemsScored: 0, marksVersion: 1 });
    const p = await placed(w);
    expect(p.done).toEqual([A]);
    expect(p.assumedPassed).toEqual([{ sheetId: B, attempt: 1, bookId: w.book1 }]);
    expect(p.queueText).toEqual([`${C}#1 new`]);
    expect(p.teamNotices).toEqual([]);
  });

  it("a late fail after a later book moved on: the rebuild takes the new marks version and the sheet repeats", async () => {
    const w = await world(make, true);
    const marks = memoryMarks();
    await scanSheet(w, w.book1, 0);
    await scanSheet(w, w.book2, 0);
    marks.set(w.book1, A, 1, tries(10, 0));
    await rebuildSheetResults({ books: w.store, marks }, w.family.childId);
    expect((await placed(w)).queueText).toEqual([]);
    // Savar's case of 2026-11-24: only 10 of 16 would be marked; here 4 of 10 marked with 2 wrong is a proven fail.
    marks.set(w.book1, B, 1, tries(2, 2));
    expect(await rebuildSheetResults({ books: w.store, marks }, w.family.childId)).toMatchObject({ status: "written", marksVersion: 2 });
    expect(await stored(w, B)).toMatchObject({ result: "repeat", itemsScored: 4, mistakes: 2, marksVersion: 2 });
    const p = await placed(w);
    expect(p.queueText).toEqual([`${B}#2 repeat`]);
    expect(p.assumedPassed).toEqual([{ sheetId: C, attempt: 1, bookId: w.book2 }]);
  });

  it("a team mark change rebuilds with a higher marks version and flips the result both ways", async () => {
    const w = await world(make);
    const marks = memoryMarks();
    await scanSheet(w, w.book1, 0);
    await scanSheet(w, w.book1, 1);
    marks.set(w.book1, A, 1, tries(10, 0));
    marks.set(w.book1, B, 1, [...tries(7, 0), null, null, null]);
    await rebuildSheetResults({ books: w.store, marks }, w.family.childId);
    expect(await stored(w, B)).toMatchObject({ result: "unknown", marksVersion: 2 });
    // Our team marks the three questions the AI was unsure of: B is now mastered.
    marks.set(w.book1, B, 1, tries(10, 0));
    await rebuildSheetResults({ books: w.store, marks }, w.family.childId);
    expect(await stored(w, B)).toMatchObject({ result: "mastered", itemsScored: 10, marksVersion: 3 });
    // Our team corrects two readings of A to wrong: A goes from mastered to repeat.
    marks.set(w.book1, A, 1, tries(8, 2));
    await rebuildSheetResults({ books: w.store, marks }, w.family.childId);
    expect(await stored(w, A)).toMatchObject({ result: "repeat", mistakes: 2, marksVersion: 4 });
    expect((await placed(w)).queueText).toEqual([`${A}#2 repeat`, `${C}#1 new`]);
  });

  it("a slow rebuild from an older marks version never clobbers a newer one", async () => {
    const w = await world(make);
    const marks = memoryMarks();
    marks.set(w.book1, A, 1, tries(10, 0));
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    // The slow rebuild reads version 1 and the marks of version 1, then waits before it writes.
    const slow: MarkSource = {
      version: marks.version,
      async marks(parent, child) { const seen = await marks.marks(parent, child); await gate; return seen; },
    };
    const late = rebuildSheetResults({ books: w.store, marks: slow }, w.family.childId);
    await new Promise((resolve) => setTimeout(resolve, 0));
    marks.set(w.book1, A, 1, tries(7, 3));
    expect(await rebuildSheetResults({ books: w.store, marks }, w.family.childId)).toMatchObject({ marksVersion: 2, written: 2 });
    release();
    expect(await late).toMatchObject({ status: "written", marksVersion: 1, written: 0, stale: 2 });
    expect(await stored(w, A)).toMatchObject({ result: "repeat", mistakes: 3, marksVersion: 2 });
  });

  it("names a book whose levels have no mastery line, and writes the others", async () => {
    const w = await world(make);
    const marks = memoryMarks();
    marks.set(w.book1, A, 1, tries(10, 0));
    const outcome = await rebuildSheetResults({ books: w.store, marks, configFor: () => null }, w.family.childId);
    expect(outcome).toMatchObject({ status: "written", written: 0, problems: [expect.stringMatching(/Book 1: no mastery line/)] });
    expect(await w.store.sheetResults(w.family.childId)).toEqual([]);
  });

  it("ignores marks from an older printed revision of the same workbook", async () => {
    const w = await world(make);
    const marks = memoryMarks();
    marks.set(w.book1, A, 1, tries(10, 0), "0000000000000000000000000000");
    await rebuildSheetResults({ books: w.store, marks }, w.family.childId);
    expect(await stored(w, A)).toMatchObject({ result: "unknown", itemsScored: 0, mistakes: 0 });
  });

  it("scores Level 1 books at 90% mastery independently of Workbook 1 pace tables", async () => {
    const { store, seeder } = make();
    const book1 = crypto.randomUUID();
    const family: SeedFamily = {
      parentId: crypto.randomUUID(), childId: crypto.randomUUID(),
      books: [{ workbookId: book1, number: 1, printedRevision: REV, levels: [1], sheets: [{ sheetId: A, attempt: 1, items: ITEMS }] }],
    };
    await seeder.seed(family);
    const marks = memoryMarks();
    marks.set(book1, A, 1, tries(9, 1));
    expect(await rebuildSheetResults({ books: store, marks }, family.childId)).toMatchObject({ status: "written", written: 1, problems: [] });
    expect((await store.sheetResults(family.childId))[0]).toMatchObject({ sheetId: A, result: "mastered" });
  });

  it("keeps the persisted unscanned reason on attempt 2 after a late fail on attempt 1 so no second unscanned repeat is scheduled", async () => {
    const { store, seeder } = make();
    const [book1, book2] = [crypto.randomUUID(), crypto.randomUUID()];
    const family: SeedFamily = {
      parentId: crypto.randomUUID(), childId: crypto.randomUUID(),
      books: [
        { workbookId: book1, number: 1, printedRevision: REV, levels: [3], sheets: [{ sheetId: A, attempt: 1, items: ITEMS, reason: "new" }, { sheetId: B, attempt: 1, items: ITEMS, reason: "new" }] },
        { workbookId: book2, number: 2, printedRevision: REV, levels: [3], sheets: [{ sheetId: A, attempt: 2, items: ITEMS, reason: "unscanned" }] },
      ],
    };
    await seeder.seed(family);
    const marks = memoryMarks();
    // Late fail arrives for attempt 1; book 2 has 0 pages scanned, but attempt 2 already used the one unscanned repeat.
    marks.set(book1, A, 1, tries(6, 4));
    await rebuildSheetResults({ books: store, marks }, family.childId);
    const p = await childPosition(store, family.childId, SNAPSHOT);
    if (!p.ok) throw new Error(p.problems.join("\n"));
    expect(p.queue.filter((q) => q.sheetId === A)).toEqual([]);
    expect(p.assumedPassed).toContainEqual({ sheetId: A, attempt: 2, bookId: book2 });
  });

  it("computes old-book scan coverage across retired sheets so retiring a scanned sheet never triggers a false unscanned repeat", async () => {
    const { store, seeder } = make();
    const book1 = crypto.randomUUID();
    const family: SeedFamily = {
      parentId: crypto.randomUUID(), childId: crypto.randomUUID(),
      books: [{
        workbookId: book1, number: 1, printedRevision: REV, levels: [3],
        sheets: [{ sheetId: "retired-sheet-1", attempt: 1, items: ITEMS, reason: "new" }, { sheetId: B, attempt: 1, items: ITEMS, reason: "new" }],
      }],
    };
    await seeder.seed(family);
    // 2 of 4 pages of book 1 were scanned (both belonging to the retired sheet) -> 50% scanned -> B is assumedPassed, not repeated.
    await seeder.scan(family, book1, 1);
    await seeder.scan(family, book1, 2);
    const p = await childPosition(store, family.childId, SNAPSHOT);
    if (!p.ok) throw new Error(p.problems.join("\n"));
    expect(p.assumedPassed).toContainEqual({ sheetId: B, attempt: 1, bookId: book1 });
    expect(p.queue.filter((q) => q.sheetId === B)).toEqual([]);
  });
});

describe("the mastery line of a book", () => {
  it.each<[number[], number | null]>([[[1], 90], [[3], 90], [[6], 90], [[7], 80], [[12], 80], [[2, 5], 90], [[6, 7], null], [[], null]])("levels %j: %s", (levels, percent) => {
    expect(masteryConfigFor(levels)).toEqual(percent === null ? null : { masteryPercent: percent });
  });
});

describe("the marks of a child's v2 questions", () => {
  const mark = (itemId: string, result: FirstTry | null, state: string) =>
    ({ expected: { identity: { workbookId: "book", printedRevision: REV, pageId: "page", itemId } }, observation: { result, state } }) as unknown as Pick<EffectiveMark, "expected" | "observation">;
  it("keeps the marked v2 questions only, by their engine id and printed revision", () => {
    expect(childMarksFrom([
      mark("v2:s/1/front/1", "right", "scored"), mark("v2:s/1/front/2", "blank", "scored"), mark("v2:s/1/front/3", "wrong", "parent-checked"),
      mark("v2:s/1/front/4", null, "pending"), mark("v2:s/1/front/5", "wrong", "pending"), mark("v2:s/1/front/6", "right", "parent-pending"),
      mark("question-1", "right", "scored"),
    ])).toEqual([
      { workbookId: "book", printedRevision: REV, itemId: "s/1/front/1", firstTry: "right" },
      { workbookId: "book", printedRevision: REV, itemId: "s/1/front/2", firstTry: "blank" },
      { workbookId: "book", printedRevision: REV, itemId: "s/1/front/3", firstTry: "wrong" },
    ]);
  });
});
