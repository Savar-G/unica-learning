import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateSnapshot } from "../bank/snapshot";
import { readBookRequest } from "../build/book-input";
import { buildBook, PART_OF_BOOK, planBook, wholeBook, type BuiltBook } from "../build/build-book";
import rawFacts from "../fixtures/snapshot-facts.json";
import rawStories from "../fixtures/snapshot-invented-topic.json";
import storyBook from "../fixtures/book-invented-topic.json";
import { canonicalJson } from "../hash";
import { fakeRenderer } from "../testing/fake-renderer";
import { historyFromBooks, MAX_SHEETS, nextBookSheets, planNextBook, type NextBookInput } from "./plan-book";
import { levelOrder, type ChildPosition, type QueueEntry } from "./position";

const bank = validateSnapshot(structuredClone(rawFacts));
if (!bank.ok) throw new Error(bank.problems.join("\n"));
const SNAPSHOT = bank.snapshot;
const IDS = levelOrder(SNAPSHOT).map((s) => s.id);

const positionOf = (queue: QueueEntry[]): ChildPosition => ({ ok: true, childId: "child-1", queue, done: [], assumedPassed: [], teamNotices: [], mayaNudges: [] });
const newSheets = (count: number) => IDS.slice(0, count).map((sheetId): QueueEntry => ({ sheetId, attempt: 1, reason: "new" }));
/** A queue of any length, with invented sheet ids, for the size rules alone. */
const longQueue = (count: number) => Array.from({ length: count }, (_, i): QueueEntry => ({ sheetId: `sheet-${i + 1}`, attempt: 1, reason: "new" }));
const tokens = (count: number) => Array.from({ length: count }, (_, i) => `https://unicalearning.com/tutor/p/next-${i + 1}`);
const input = (change: Partial<NextBookInput> = {}): NextBookInput => ({
  bookId: "book-2", childId: "child-1", snapshot: SNAPSHOT, position: positionOf(newSheets(5)), pagesPerDay: 4, days: 2, qrTokens: tokens(8), ...change,
});
const problemsOf = (outcome: ReturnType<typeof planNextBook>) => (outcome.ok ? [] : outcome.problems).join("\n");

describe("the next book", () => {
  it("takes the first sheets of the queue, two a day for 4 pages a day, and is a request that the engine reads", () => {
    const repeat: QueueEntry = { sheetId: IDS[3], attempt: 2, reason: "repeat" };
    const outcome = planNextBook(input({ position: positionOf([repeat, ...newSheets(3)]) }));
    if (!outcome.ok) throw new Error(outcome.problems.join("\n"));
    expect(outcome.request).toEqual({
      bookId: "book-2", childId: "child-1",
      sheets: [
        { sheetId: IDS[3], attempt: 2, qr: { front: tokens(8)[0], back: tokens(8)[1] }, startsDay: true },
        { sheetId: IDS[0], attempt: 1, qr: { front: tokens(8)[2], back: tokens(8)[3] } },
        { sheetId: IDS[1], attempt: 1, qr: { front: tokens(8)[4], back: tokens(8)[5] }, startsDay: true },
        { sheetId: IDS[2], attempt: 1, qr: { front: tokens(8)[6], back: tokens(8)[7] } },
      ],
    });
    expect(JSON.parse(JSON.stringify(outcome.request))).toEqual(outcome.request);
    expect(Array.isArray(readBookRequest(outcome.request, SNAPSHOT))).toBe(false);
    expect(planBook({ snapshot: rawFacts, book: outcome.request }).ok).toBe(true);
  });

  it("takes one more sheet for an odd count, which belongs to the last day, and never leaves a blank page", () => {
    const outcome = planNextBook(input({ pagesPerDay: 2, days: 3 }));
    if (!outcome.ok) throw new Error(outcome.problems.join("\n"));
    expect(outcome.request.sheets.map((s) => [s.sheetId, s.startsDay ?? false])).toEqual([[IDS[0], true], [IDS[1], true], [IDS[2], true], [IDS[3], false]]);
  });

  it("refuses a short queue that leaves a day with fewer sheets than the pages a day, which a whole book's build refuses too", async () => {
    expect(problemsOf(planNextBook(input({ position: positionOf(newSheets(2)), pagesPerDay: 6, days: 1, qrTokens: tokens(4) }))))
      .toMatch(/^Day 1 of the book has 2 sheets, and at 6 pages a day each day has 3 sheets \(the last day may have one more/);
    expect(problemsOf(planNextBook(input({ position: positionOf(newSheets(4)), pagesPerDay: 6, days: 2, qrTokens: tokens(8) })))).toMatch(/^Day 2 of the book has 1 sheet/);
    // The same two sheets planned at 4 pages a day are a day of 4 pages: a whole book of 6 pages a day stops at its level check.
    const two = planNextBook(input({ position: positionOf(newSheets(2)), pagesPerDay: 4, days: 1, qrTokens: tokens(4) }));
    if (!two.ok) throw new Error(two.problems.join("\n"));
    const built = await buildBook({ snapshot: rawFacts, book: two.request }, fakeRenderer(), wholeBook(6));
    expect(built).toMatchObject({ status: "failed", findings: [expect.objectContaining({ check: "level", rule: "pages-a-day", sheet: IDS[0] })] });
  });

  it("plans the extra sheet of an even book on its last day, and a whole book of it builds", async () => {
    const outcome = planNextBook(input({ position: positionOf(newSheets(5)), pagesPerDay: 6, days: 1, qrTokens: tokens(8) }));
    if (!outcome.ok) throw new Error(outcome.problems.join("\n"));
    expect(outcome.request.sheets.map((s) => s.startsDay ?? false)).toEqual([true, false, false, false]);
    const built = await buildBook({ snapshot: rawFacts, book: outcome.request }, fakeRenderer(), wholeBook(6));
    expect(built.status === "built" ? [] : built.problems).toEqual([]);
  });

  it("refuses an odd queue that cannot round up to an even book, and refuses an empty queue", () => {
    expect(nextBookSheets(positionOf(newSheets(3)), { pagesPerDay: 8, days: 1 })).toEqual([expect.stringMatching(/has 3 sheets, and a book needs an even number of sheets/)]);
    expect(nextBookSheets(positionOf(newSheets(1)), { pagesPerDay: 8, days: 1 })).toEqual([expect.stringMatching(/has 1 sheet, and a book needs an even number of sheets/)]);
    expect(nextBookSheets(positionOf([]), { pagesPerDay: 8, days: 1 })).toEqual([expect.stringMatching(/has 0 sheets/)]);
  });

  it(`has at most ${MAX_SHEETS} sheets, also when an odd count rounds up, and derives day starts from sheetsCount`, () => {
    expect(MAX_SHEETS).toBe(58);
    expect(nextBookSheets(positionOf(longQueue(100)), { pagesPerDay: 2, days: 58 })).toHaveLength(58);
    expect(nextBookSheets(positionOf(longQueue(100)), { pagesPerDay: 2, days: 57 })).toHaveLength(58);
    expect(nextBookSheets(positionOf(longQueue(100)), { pagesPerDay: 2, days: 59 })).toEqual([expect.stringMatching(/at most 58 sheets \(116 pages and 4 cover pages, 120 in all\), and this one asks for 59/)]);
    expect(nextBookSheets(positionOf(longQueue(100)), { pagesPerDay: 20, days: 6 })).toEqual([expect.stringMatching(/asks for 60/)]);
    expect(nextBookSheets(positionOf(longQueue(100)), { pagesPerDay: 2, sheetsCount: 61 })).toEqual([expect.stringMatching(/asks for 61/)]);
    expect(nextBookSheets(positionOf(longQueue(100)), { pagesPerDay: 2, sheetsCount: 6 })).toHaveLength(6);
    const byCount = planNextBook(input({ pagesPerDay: 2, days: undefined, sheetsCount: 4, qrTokens: tokens(8) }));
    if (!byCount.ok) throw new Error(byCount.problems.join("\n"));
    expect(byCount.request.sheets.map((s) => s.startsDay ?? false)).toEqual([true, true, true, true]);
  });

  it("carries the region, the scenario and the history as plain JSON, and none of them when the input has none", () => {
    const history = { books: [{ bookId: "book-1", items: [{ shape: "fact.mul", key: "{\"a\":5,\"b\":7}" }] }], lastAttempts: [], seenPhrasings: [] };
    const plain = planNextBook(input());
    const carried = planNextBook(input({ history }));
    if (!plain.ok || !carried.ok) throw new Error("no plan");
    expect(Object.keys(plain.request)).toEqual(["bookId", "childId", "sheets"]);
    expect(carried.request.history).toEqual(history);
    const stories = validateSnapshot(structuredClone(rawStories));
    if (!stories.ok) throw new Error("no snapshot");
    const queue = levelOrder(stories.snapshot).slice(0, 2).map((s): QueueEntry => ({ sheetId: s.id, attempt: 1, reason: "new" }));
    const themed = planNextBook(input({ snapshot: stories.snapshot, position: positionOf(queue), qrTokens: tokens(4), region: "US", scenario: "space" }));
    if (!themed.ok) throw new Error(themed.problems.join("\n"));
    expect([themed.request.region, themed.request.scenario]).toEqual(["US", "space"]);
  });

  it.each<[string, Partial<NextBookInput>, RegExp]>([
    ["too few QR texts", { qrTokens: tokens(7) }, /needs exactly 8 QR texts, and it has 7/],
    ["too many QR texts", { qrTokens: tokens(9) }, /needs exactly 8 QR texts, and it has 9/],
    ["a QR text twice", { qrTokens: [...tokens(7), tokens(1)[0]] }, /QR text .* is used more than once/],
    ["a QR text with a space", { qrTokens: [...tokens(7), "a b"] }, /must be printable text with no space/],
    ["a QR text that is too long to scan", { qrTokens: [...tokens(7), "x".repeat(100)] }, /needs squares that are too small to scan/],
    ["pages a day of 0", { pagesPerDay: 0 }, /Pages a day must be an even whole number, 2 or more, not 0/],
    ["an odd number of pages a day", { pagesPerDay: 3 }, /not 3/],
    ["pages a day that are not whole", { pagesPerDay: 2.5 }, /not 2.5/],
    ["0 days", { days: 0 }, /Days must be a whole number, 1 or more, not 0/],
    ["neither days nor sheetsCount", { days: undefined, sheetsCount: undefined }, /Either days or sheetsCount must be given/],
    ["a sheet count of 0", { sheetsCount: 0 }, /sheets of a book must be a whole number/],
    ["contradictory days and sheetsCount", { pagesPerDay: 2, days: 1, sheetsCount: 4 }, /must match pagesPerDay × days \/ 2/],
    ["a sheet count not divisible by pagesPerDay / 2", { pagesPerDay: 4, days: undefined, sheetsCount: 5 }, /must be a multiple of 2/],
    ["the position of another child", { position: { ...positionOf(newSheets(5)), childId: "child-2" } }, /position is of the child "child-2"/],
    ["a bad book id", { bookId: "book 2" }, /bookId must use only letters/],
    ["a malformed history", { history: { books: [{ bookId: "b", items: [{ shape: "fact.mul" }] }], lastAttempts: [], seenPhrasings: [] } as unknown as NextBookInput["history"] }, /key is missing/],
    ["a non-plain history instance", { history: Object.assign(Object.create({ inherited: true }), { books: [], lastAttempts: [], seenPhrasings: [] }) as NextBookInput["history"] }, /must be a plain object/],
    ["a sparse history list", { history: { books: new Array(1), lastAttempts: [], seenPhrasings: [] } as unknown as NextBookInput["history"] }, /must be a plain list/],
  ])("refuses %s", (_name, change, problem) => {
    expect(problemsOf(planNextBook(input(change)))).toMatch(problem);
  });

  it(`always has an even count of at most ${MAX_SHEETS} sheets, in the order of the queue, and never shortens an odd queue`, () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 80 }), fc.integer({ min: 1, max: 10 }), fc.integer({ min: 1, max: 12 }), (queued, perDay, days) => {
      const queue = longQueue(queued);
      const sheets = nextBookSheets(positionOf(queue), { pagesPerDay: 2 * perDay, days });
      const wanted = perDay * days;
      const taken = Math.min(wanted, queued);
      const canRoundUp = taken % 2 === 1 && queued > taken && taken + 1 <= MAX_SHEETS;
      if (wanted > MAX_SHEETS || taken === 0 || (taken % 2 === 1 && !canRoundUp)) {
        expect(typeof sheets[0]).toBe("string");
        return;
      }
      const chosen = sheets as QueueEntry[];
      expect(chosen.length % 2).toBe(0);
      expect(chosen.length).toBeLessThanOrEqual(MAX_SHEETS);
      expect(chosen.length).toBe(taken % 2 === 0 ? taken : taken + 1);
      expect(chosen).toEqual(queue.slice(0, chosen.length));
    }));
  });
});

describe("the history of a child from built books", () => {
  const built = async (book: unknown, snapshot: unknown): Promise<BuiltBook> => {
    const result = await buildBook({ snapshot, book }, fakeRenderer(), PART_OF_BOOK);
    if (result.status !== "built") throw new Error(result.problems.join("\n"));
    return result;
  };

  it("lists each book's questions, the last attempt of each sheet in printed order, and the phrasings read", async () => {
    const one = await built(storyBook, rawStories);
    const twoBook = { ...structuredClone(storyBook), bookId: "invented-topic-book-2", sheets: [{ ...storyBook.sheets[2], attempt: 2, qr: { front: "two-front", back: "two-back" } }, { ...storyBook.sheets[1], attempt: 2, qr: { front: "two-front-b", back: "two-back-b" } }] };
    const two = await built(twoBook, rawStories);
    const history = historyFromBooks([one, two]);
    expect(history.books.map((b) => [b.bookId, b.items.length])).toEqual([["invented-topic-book", one.items.length], ["invented-topic-book-2", two.items.length]]);
    expect(history.lastAttempts.map((a) => [a.sheetId, a.attempt])).toEqual([["column-multiplication-1", 1], ["equal-groups-1", 2], ["story-problems-1", 2]]);
    const stories = history.lastAttempts[2].items;
    expect(stories.map((i) => [i.side, i.rowId, i.shape])).toEqual(two.items.filter((i) => i.sheetId === "story-problems-1").map((i) => [i.side, i.rowId, "story"]));
    expect(stories.map((i) => i.form)).toEqual(two.items.filter((i) => i.sheetId === "story-problems-1").map((i) => canonicalJson(i.question)));
    // A story is one question whatever its numbers: its key is its id.
    expect(stories.every((i) => /^"[a-z-]+"$/.test(i.key))).toBe(true);
    expect(history.seenPhrasings.length).toBeGreaterThan(0);
    expect(new Set(history.seenPhrasings.map((p) => `${p.question}/${p.phrasing}`)).size).toBe(history.seenPhrasings.length);
    expect(JSON.parse(JSON.stringify(history))).toEqual(history);
  });
});
