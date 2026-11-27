import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateSnapshot, type Snapshot } from "../bank/snapshot";
import type { BookHistory } from "../build/book-history";
import { planBook } from "../build/build-book";
import rawFacts from "../fixtures/snapshot-facts.json";
import type { BookItem } from "../contract";
import { canonicalJson } from "../hash";
import { TEMPLATES } from "../layout/templates";
import { sheetResult, type ItemMark } from "../results/sheet-results";
import { DEFAULT_DAYS, readLevelConfig, WORKBOOK_1_PACES, type LevelConfig } from "./level-config";
import { COVER_PAGES, historyFromBooks, MAX_SHEETS, MAX_TOTAL_PAGES, nextBookSheets, planNextBook } from "./plan-book";
import { position, type ChildPosition, type IssuedSheet, type QueueEntry, type ScanReceipt, type SheetResultRecord } from "./position";
import { coverFactsOf, planWorkbook, workbookSheets, type WorkbookPlan } from "./workbook-plan";

/**
 * An invented Level 3 bank shaped like product spec 16.5: topics 3-7 to 3-16, 10 sheets each, every sheet a copy of the
 * facts sheet. The sheet "3-9-4" is sheet 4 of topic 3-9.
 */
const TOPICS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((n) => `3-${n}`);
const FACTS_SHEET = rawFacts.sheets[0];
const RAW_LEVEL_3 = {
  format: 1, id: "invented-level-3-plan-v1", level: { id: "level-3", name: "3" },
  topics: TOPICS.map((code, t) => ({ id: `topic-${t + 7}`, code, title: `Topic ${code}`, sheets: Array.from({ length: 10 }, (_, s) => `${code}-${s + 1}`) })),
  sheets: TOPICS.flatMap((code, t) => Array.from({ length: 10 }, (_, s) => ({ ...structuredClone(FACTS_SHEET), id: `${code}-${s + 1}`, firstPage: 2 * (10 * t + s) + 1 }))),
};
const bank = validateSnapshot(structuredClone(RAW_LEVEL_3));
if (!bank.ok) throw new Error(bank.problems.join("\n"));
const LEVEL_3: Snapshot = bank.snapshot;
const ITEMS_PER_SHEET = FACTS_SHEET.front.rows.reduce((n, r) => n + r.items, 0) + FACTS_SHEET.back.rows.reduce((n, r) => n + r.items, 0);
const SYNTHETIC_ITEMS = Array.from({ length: ITEMS_PER_SHEET }, (_, i) => ({ id: `item-${i + 1}` }));

/** Computes a real `SheetResultRecord` through `sheetResult()` so fixtures always match the production mastery thresholds. */
function scoredResult(
  bookId: string,
  sheetId: string,
  attempt: number,
  outcome: "mastered" | "repeat" | "unknown",
  masteryPercent: number,
): SheetResultRecord {
  const maxAllowed = ITEMS_PER_SHEET - Math.ceil((ITEMS_PER_SHEET * masteryPercent) / 100);
  const marks: ItemMark[] = outcome === "mastered"
    ? SYNTHETIC_ITEMS.map(({ id }) => ({ itemId: id, firstTry: "right" }))
    : outcome === "repeat"
      ? SYNTHETIC_ITEMS.map(({ id }, i) => ({ itemId: id, firstTry: i < maxAllowed + 1 ? "wrong" : "right" }))
      : SYNTHETIC_ITEMS.slice(0, Math.floor(ITEMS_PER_SHEET * 0.5)).map(({ id }) => ({ itemId: id, firstTry: "right" }));
  const scored = sheetResult(SYNTHETIC_ITEMS, marks, { masteryPercent });
  if (!scored.ok || scored.result !== outcome) throw new Error(`expected ${outcome}, got ${scored.ok ? scored.result : scored.problems.join("; ")}`);
  return { bookId, sheetId, attempt, result: scored.result, itemsScored: scored.itemsScored, mistakes: scored.mistakes };
}

/** The sheets from one topic and sheet to another, both included, in the order of the level: `range("3-7", 9, "3-11", 8)`. */
const ORDER = [...LEVEL_3.sheets.keys()];
const range = (fromTopic: string, fromSheet: number, toTopic: string, toSheet: number) => ORDER.slice(ORDER.indexOf(`${fromTopic}-${fromSheet}`), ORDER.indexOf(`${toTopic}-${toSheet}`) + 1);
const paceOf = (name: string): LevelConfig => {
  const record = WORKBOOK_1_PACES.find((p) => p.names.includes(name));
  if (!record) throw new Error(`no pace for ${name}`);
  return record.config;
};

const tokens = (count: number, tag: string) => Array.from({ length: count }, (_, i) => `q-${tag}-${i + 1}`);
interface History { issued: IssuedSheet[]; receipts: ScanReceipt[]; results: SheetResultRecord[] }
const empty = (): History => ({ issued: [], receipts: [], results: [] });

function placed(childId: string, history: History, startSheetId?: string, snapshot: Snapshot = LEVEL_3): ChildPosition {
  const outcome = position({ childId, ...(startSheetId ? { startSheetId } : {}) }, history.issued, history.receipts, history.results, snapshot);
  if (!outcome.ok) throw new Error(outcome.problems.join("\n"));
  return outcome;
}
type Planned = Extract<WorkbookPlan, { ok: true }>;
/** The plan of a book for a position, with exactly the QR texts that it needs. */
function planned(where: ChildPosition, levelConfig: LevelConfig, bookId: string, options: { snapshot?: Snapshot; history?: BookHistory } = {}): Planned {
  const snapshot = options.snapshot ?? LEVEL_3;
  const pace = readLevelConfig(levelConfig);
  if (!pace.ok) throw new Error(pace.problems.join("\n"));
  const chosen = nextBookSheets(where, pace.config);
  if (typeof chosen[0] === "string") throw new Error((chosen as string[]).join("\n"));
  const outcome = planWorkbook({
    bookId, childId: where.childId, snapshot, position: where, levelConfig, qrTokens: tokens(2 * chosen.length, `${where.childId}-${bookId}`),
    ...(options.history ? { history: options.history } : {}),
  });
  if (!outcome.ok) throw new Error(outcome.problems.join("\n"));
  return outcome;
}
/** The plan of a child's next book from its history. */
const nextBook = (
  childId: string,
  history: History,
  levelConfig: LevelConfig,
  bookId: string,
  startSheetId?: string,
  options: { snapshot?: Snapshot; bookHistory?: BookHistory } = {},
): Planned => planned(placed(childId, history, startSheetId, options.snapshot), levelConfig, bookId, { snapshot: options.snapshot, history: options.bookHistory });

/** Adds a printed book to a history: its sheets, the scans of some of its days, and scored results for some of its sheets. */
function printed(
  history: History,
  plan: Planned,
  bookNumber: number,
  scannedDays: readonly number[],
  resultOf: (sheetId: string, attempt: number) => SheetResultRecord["result"] | null,
  masteryPercent = 90,
): History {
  const bookId = plan.request.bookId;
  const issued = plan.sheets.map((s): IssuedSheet => ({ bookId, bookNumber, sheetId: s.sheetId, attempt: s.attempt, pages: s.pages, reason: s.reason }));
  const scanned = plan.sheets.filter((s) => scannedDays.includes(s.day));
  const receipts = scanned.flatMap((s) => s.pages.map((pageNumber): ScanReceipt => ({ bookId, pageNumber })));
  const results = scanned.flatMap((s): SheetResultRecord[] => {
    const result = resultOf(s.sheetId, s.attempt);
    return result === null ? [] : [scoredResult(bookId, s.sheetId, s.attempt, result, masteryPercent)];
  });
  return { issued: [...history.issued, ...issued], receipts: [...history.receipts, ...receipts], results: [...history.results, ...results] };
}
const allMastered = () => "mastered" as const;
const failing = (...ids: string[]) => (sheetId: string) => (ids.includes(sheetId) ? ("repeat" as const) : ("mastered" as const));
const DAYS_1_TO_7 = [1, 2, 3, 4, 5, 6, 7];
const ALL_DAYS = Array.from({ length: DEFAULT_DAYS }, (_, i) => i + 1);

/** Each day of a plan as text: `3-9-4#2` for a repeat, `3-12-1` for a first attempt. */
const daysOf = (plan: Planned) => plan.coverFacts.days.map((d) => d.sheetIds.map((id) => {
  const attempt = plan.sheets.find((s) => s.sheetId === id)?.attempt ?? 0;
  return attempt > 1 ? `${id}#${attempt}` : id;
}));

describe("W1-1: a level config is data", () => {
  it("plans 104, 84, 64 and 44 pages for the four Workbook 1 configs of UNI-167, 10 days each, with no level named", () => {
    const totals = WORKBOOK_1_PACES.map(({ config }) => {
      const plan = planned(placed("child-1", empty()), config, "book-1");
      expect(plan.coverFacts.days.map((d) => d.sheets)).toEqual(Array(DEFAULT_DAYS).fill(config.pagesPerDay / 2));
      expect([plan.coverFacts.pagesPerDay, plan.coverFacts.minutesPerPage]).toEqual([config.pagesPerDay, config.minutesPerPage]);
      return plan.coverFacts.totalPages;
    });
    expect(totals).toEqual([104, 84, 64, 44]);
  });

  it("has the pace and the mastery line of each level from 2 to 12 as data", () => {
    const table = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].map((name) => {
      const { pagesPerDay, minutesPerPage, masteryPercent } = paceOf(name);
      return `${name}: ${pagesPerDay}p ${minutesPerPage}m ${masteryPercent}%`;
    });
    expect(table).toEqual([
      "2: 10p 2m 90%", "3: 10p 2m 90%", "4: 10p 2m 90%", "5: 10p 2m 90%", "6: 10p 2m 90%",
      "7: 8p 3m 80%", "8: 8p 3m 80%", "9: 8p 3m 80%", "10: 6p 4m 80%", "11: 4p 6m 80%", "12: 4p 6m 80%",
    ]);
    expect(WORKBOOK_1_PACES.flatMap((p) => p.names)).toHaveLength(11);
    for (const { config } of WORKBOOK_1_PACES) expect(readLevelConfig(config)).toEqual({ ok: true, config: { ...config, days: DEFAULT_DAYS } });
  });

  it.each<[string, unknown, RegExp]>([
    ["an odd number of pages a day", { pagesPerDay: 9, minutesPerPage: 2, masteryPercent: 90 }, /Pages a day must be an even whole number, 2 or more, not 9/],
    ["0 pages a day", { pagesPerDay: 0, minutesPerPage: 2, masteryPercent: 90 }, /not 0/],
    ["pages a day that are not whole", { pagesPerDay: 2.5, minutesPerPage: 2, masteryPercent: 90 }, /not 2.5/],
    ["0 minutes a page", { pagesPerDay: 10, minutesPerPage: 0, masteryPercent: 90 }, /Minutes a page must be a number more than 0, not 0/],
    ["minutes a page below 0", { pagesPerDay: 10, minutesPerPage: -1, masteryPercent: 90 }, /not -1/],
    ["minutes a page that are not finite", { pagesPerDay: 10, minutesPerPage: Number.POSITIVE_INFINITY, masteryPercent: 90 }, /must be a plain value/],
    ["minutes a page as text", { pagesPerDay: 10, minutesPerPage: "2", masteryPercent: 90 }, /not "2"/],
    ["a mastery percent of 0", { pagesPerDay: 10, minutesPerPage: 2, masteryPercent: 0 }, /mastery percent must be a whole number from 1 to 100, not 0/],
    ["a mastery percent over 100", { pagesPerDay: 10, minutesPerPage: 2, masteryPercent: 101 }, /not 101/],
    ["a mastery percent that is not whole", { pagesPerDay: 10, minutesPerPage: 2, masteryPercent: 89.5 }, /not 89.5/],
    ["0 days", { pagesPerDay: 10, minutesPerPage: 2, masteryPercent: 90, days: 0 }, /Days must be a whole number, 1 or more, not 0/],
    ["days that are not whole", { pagesPerDay: 10, minutesPerPage: 2, masteryPercent: 90, days: 1.5 }, /not 1.5/],
    ["a bigint days value without throwing", { pagesPerDay: 10, minutesPerPage: 2, masteryPercent: 90, days: BigInt(1) }, /must be a plain value/],
    ["an unknown field", { pagesPerDay: 10, minutesPerPage: 2, masteryPercent: 90, dyas: 1 }, /unknown field "dyas"/],
    ["inherited config fields", Object.create({ pagesPerDay: 10, minutesPerPage: 2, masteryPercent: 90 }), /must be a plain object/],
    ["no object", null, /must be an object/],
  ])("refuses %s, also in planWorkbook", (_name, config, problem) => {
    const read = readLevelConfig(config);
    expect(read.ok ? [] : read.problems).toEqual([expect.stringMatching(problem)]);
    const outcome = planWorkbook({ bookId: "book-1", childId: "child-1", snapshot: LEVEL_3, position: placed("child-1", empty()), levelConfig: config as LevelConfig, qrTokens: tokens(100, "x") });
    expect(outcome.ok ? [] : outcome.problems).toEqual([expect.stringMatching(problem)]);
  });

  it("refuses failed positions, malformed queue entries, bigint sizes, and broken template frames without throwing", () => {
    const failedPos = position({ childId: "bad id" }, [], [], [], LEVEL_3);
    expect(nextBookSheets(failedPos as unknown as ChildPosition, { pagesPerDay: 2, days: 2 })).toEqual([expect.stringMatching(/child id/)]);
    const badPosPlan = planWorkbook({ bookId: "book-1", childId: "child-1", snapshot: LEVEL_3, position: failedPos as unknown as ChildPosition, levelConfig: paceOf("3"), qrTokens: tokens(100, "x") });
    expect(badPosPlan).toEqual({ ok: false, problems: [expect.stringMatching(/child id/)] });

    const badQueue: ChildPosition = { ...placed("child-1", empty()), queue: [{ sheetId: "3-7-1", attempt: 1, reason: "repeat" } as QueueEntry, { sheetId: "3-7-2", attempt: 1, reason: "new" }] };
    const badQueuePlan = planWorkbook({ bookId: "book-1", childId: "child-1", snapshot: LEVEL_3, position: badQueue, levelConfig: { pagesPerDay: 2, minutesPerPage: 2, masteryPercent: 90, days: 2 }, qrTokens: tokens(4, "q") });
    expect(badQueuePlan).toEqual({ ok: false, problems: [expect.stringMatching(/attempt 1 cannot have reason "repeat"/)] });

    const bigintPlan = planNextBook({ bookId: "book-1", childId: "child-1", snapshot: LEVEL_3, position: placed("child-1", empty()), pagesPerDay: 2, days: BigInt(1) as unknown as number, qrTokens: tokens(4, "b") });
    expect(bigintPlan).toEqual({ ok: false, problems: [expect.stringMatching(/not 1n/)] });

    // A template whose front QR box enters the spine zone must be rejected by planNextBook and planWorkbook, matching planBook.
    const orig = TEMPLATES.get("facts-2x10")!;
    const brokenTemplate = structuredClone(orig);
    brokenTemplate.sides.front.frame.qr.x = 0;
    const brokenTemplates = new Map([...TEMPLATES, ["facts-2x10", brokenTemplate]]);
    const brokenBank = validateSnapshot(structuredClone(RAW_LEVEL_3), undefined, brokenTemplates);
    if (!brokenBank.ok) throw new Error(brokenBank.problems.join("\n"));
    const brokenPos = placed("child-1", empty(), undefined, brokenBank.snapshot);
    const brokenPlan = planWorkbook({ bookId: "book-1", childId: "child-1", snapshot: brokenBank.snapshot, position: brokenPos, levelConfig: { pagesPerDay: 2, minutesPerPage: 2, masteryPercent: 90, days: 2 }, qrTokens: tokens(4, "sp") });
    expect(brokenPlan.ok).toBe(false);
    if (!brokenPlan.ok) expect(brokenPlan.problems.join("\n")).toMatch(/"qr" enters the spine zone/);

    // A template whose question place overlaps the footer must also be rejected before returning a request.
    const slotTemplate = structuredClone(orig);
    slotTemplate.sides.front.places[0].slot.y = slotTemplate.sides.front.frame.footer.y - 4;
    const slotTemplates = new Map([...TEMPLATES, ["facts-2x10", slotTemplate]]);
    const slotBank = validateSnapshot(structuredClone(RAW_LEVEL_3), undefined, slotTemplates);
    if (!slotBank.ok) throw new Error(slotBank.problems.join("\n"));
    const slotPos = placed("child-1", empty(), undefined, slotBank.snapshot);
    const slotPlan = planWorkbook({ bookId: "book-1", childId: "child-1", snapshot: slotBank.snapshot, position: slotPos, levelConfig: { pagesPerDay: 2, minutesPerPage: 2, masteryPercent: 90, days: 2 }, qrTokens: tokens(4, "sl") });
    expect(slotPlan.ok).toBe(false);
    if (!slotPlan.ok) expect(slotPlan.problems.join("\n")).toMatch(/footer|overlaps|margin/i);
  });

  it("names every problem of a config at once", () => {
    const read = readLevelConfig({ pagesPerDay: 3, minutesPerPage: 0, masteryPercent: 0, days: 0 });
    expect(read.ok ? 0 : read.problems.length).toBe(4);
  });
});

describe("W1-2: Workbook 1 is the same for every child who starts at the same sheet", () => {
  it("gives two children the same sheets, attempts, day starts and cover facts, and other numbers", () => {
    const config = paceOf("3");
    const [a, b] = ["child-a", "child-b"].map((childId) => nextBook(childId, empty(), config, `${childId}-book-1`, "3-9-4"));
    const sheetsOf = (plan: Planned) => plan.request.sheets.map(({ sheetId, attempt, startsDay }) => ({ sheetId, attempt, startsDay }));
    expect(sheetsOf(a)).toEqual(sheetsOf(b));
    expect(a.sheets).toEqual(b.sheets);
    expect(a.coverFacts).toEqual(b.coverFacts);
    expect(a.sheets.map((s) => s.sheetId)).toEqual(range("3-9", 4, "3-14", 3));
    expect(a.sheets.every((s) => s.attempt === 1 && s.reason === "new")).toBe(true);

    const [itemsA, itemsB] = [a, b].map((plan) => {
      const book = planBook({ snapshot: RAW_LEVEL_3, book: plan.request });
      if (!book.ok) throw new Error(book.problems.join("\n"));
      return book.items;
    });
    expect(itemsA.map((i) => i.id)).toEqual(itemsB.map((i) => i.id));
    const questions = (items: BookItem[]) => items.map((i) => canonicalJson(i.question));
    expect(questions(itemsA)).not.toEqual(questions(itemsB));
  });
});

describe("W1-3: 4 cover pages and 2 a sheet, a multiple of 4, at most 120 pages", () => {
  it(`has ${COVER_PAGES} cover pages and at most ${MAX_SHEETS} sheets, so at most ${MAX_TOTAL_PAGES} pages`, () => {
    expect([COVER_PAGES, MAX_TOTAL_PAGES, MAX_SHEETS]).toEqual([4, 120, 58]);
    const fresh = placed("child-1", empty());
    const full = planned(fresh, { pagesPerDay: 2, minutesPerPage: 2, masteryPercent: 90, days: 58 }, "book-1");
    expect([full.sheets.length, full.coverFacts.totalPages]).toEqual([58, 120]);
  });

  it("takes one more sheet of the queue for an odd count, on the last day, with its pages counted", () => {
    const fresh = placed("child-1", empty());
    const rounded = planned(fresh, { pagesPerDay: 2, minutesPerPage: 2, masteryPercent: 90, days: 57 }, "book-1");
    expect([rounded.sheets.length, rounded.coverFacts.totalPages, rounded.coverFacts.days.length]).toEqual([58, 120, 57]);
    expect(rounded.coverFacts.days.at(-1)).toMatchObject({ day: 57, sheets: 2, startPage: 113, endPage: 116 });
    const small = planned(fresh, { pagesPerDay: 6, minutesPerPage: 2, masteryPercent: 90, days: 3 }, "book-2");
    expect(small.coverFacts.days.map((d) => [d.day, d.sheets, d.startPage, d.endPage])).toEqual([[1, 3, 1, 6], [2, 3, 7, 12], [3, 4, 13, 20]]);
    expect([small.coverFacts.interiorPages, small.coverFacts.totalPages]).toEqual([20, 24]);
    expect(small.request.sheets.map((s) => s.startsDay ?? false)).toEqual([true, false, false, true, false, false, true, false, false, false]);
  });

  it.each<[string, Partial<LevelConfig>, string | undefined, RegExp]>([
    ["59 sheets", { pagesPerDay: 2, days: 59 }, undefined, /at most 58 sheets .* asks for 59/],
    ["60 sheets", { pagesPerDay: 12, days: 10 }, undefined, /at most 58 sheets .* asks for 60/],
    ["an odd count with no sheet left to round up", { pagesPerDay: 6, days: 1 }, "3-20-8", /has 3 sheets, and a book needs an even number of sheets/],
  ])("refuses %s", (_name, change, startSheetId, problem) => {
    const outcome = planWorkbook({ bookId: "book-1", childId: "child-1", snapshot: LEVEL_3, position: placed("child-1", empty(), startSheetId), levelConfig: { pagesPerDay: 2, minutesPerPage: 2, masteryPercent: 90, ...change }, qrTokens: tokens(120, "x") });
    expect(outcome.ok ? [] : outcome.problems).toEqual([expect.stringMatching(problem)]);
  });

  it("is always a multiple of 4 pages, at most 120, with every sheet of the queue's start on a day, and no empty day", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 15 }), fc.integer({ min: 0, max: ORDER.length - 1 }), (perDay, days, start) => {
      const pace = { pagesPerDay: 2 * perDay, minutesPerPage: 2, masteryPercent: 90, days };
      const where = placed("child-1", empty(), ORDER[start]);
      const chosen = nextBookSheets(where, pace);
      if (typeof chosen[0] === "string") {
        const wanted = perDay * days;
        const taken = Math.min(wanted, where.queue.length);
        expect(wanted > MAX_SHEETS || (taken % 2 === 1 && where.queue.length === taken)).toBe(true);
        return;
      }
      const sheets = workbookSheets(chosen as typeof where.queue, LEVEL_3, pace);
      const facts = coverFactsOf(sheets, LEVEL_3, pace);
      expect(facts.totalPages % 4).toBe(0);
      expect(facts.totalPages).toBeLessThanOrEqual(MAX_TOTAL_PAGES);
      expect(facts.totalPages).toBe(COVER_PAGES + 2 * sheets.length);
      expect(sheets.map((s) => s.sheetId)).toEqual(where.queue.slice(0, sheets.length).map((q) => q.sheetId));
      expect(facts.days.map((d) => d.day)).toEqual(facts.days.map((_, i) => i + 1));
      expect(facts.days.every((d) => d.sheets > 0 && d.sheets === d.sheetIds.length && d.topics.length > 0)).toBe(true);
      expect(facts.days.flatMap((d) => d.sheetIds)).toEqual(sheets.map((s) => s.sheetId));
      expect(facts.days.map((d) => [d.startPage, d.endPage])).toEqual(facts.days.map((d, i) => {
        const before = facts.days.slice(0, i).reduce((n, e) => n + e.sheets, 0);
        return [2 * before + 1, 2 * (before + d.sheets)];
      }));
      expect(facts.days.length).toBeLessThanOrEqual(days);
      expect(facts.days.slice(0, -1).every((d) => d.sheets === perDay)).toBe(true);
    }));
  });
});

describe("W1-4: the cover facts of each day", () => {
  it("lists every topic of a day in the order met, with no limit, the repeats, and every sheet on one day", () => {
    const config = paceOf("3");
    const plan = nextBook("child-1", empty(), config, "book-1", "3-7-8");
    const one = plan.coverFacts.days[0];
    expect(one.topics).toEqual([{ id: "topic-7", code: "3-7", title: "Topic 3-7" }, { id: "topic-8", code: "3-8", title: "Topic 3-8" }]);
    expect(plan.coverFacts.days.reduce((n, d) => n + d.sheetIds.length, 0)).toBe(plan.sheets.length);
    expect(plan.coverFacts.days.every((d) => d.repeatCount === 0)).toBe(true);
    const wide = planned(placed("child-1", empty(), "3-7-10"), { pagesPerDay: 46, minutesPerPage: 1, masteryPercent: 90, days: 1 }, "book-2");
    expect(wide.coverFacts.days).toHaveLength(1);
    expect(wide.coverFacts.days[0].topics.map((t) => t.code)).toEqual(["3-7", "3-8", "3-9", "3-10"]);
  });
});

/** Child A of product spec 16.5: Book 3 from 3-7 sheet 9 at 8 pages a day, marked to day 7 with two fails. */
const CHILD_A_PACE: LevelConfig = { pagesPerDay: 8, minutesPerPage: 2, masteryPercent: 90 };
function childABook3() {
  const book3 = nextBook("child-a", empty(), CHILD_A_PACE, "book-3", "3-7-9");
  const history = printed(empty(), book3, 3, DAYS_1_TO_7, failing("3-9-4", "3-10-3"));
  return { book3, history };
}

describe("W1-5: the sample book of product spec 16.5", () => {
  it("plans Book 3 from 3-7 sheet 9 to 3-11 sheet 8", () => {
    const { book3 } = childABook3();
    expect(book3.sheets.map((s) => s.sheetId)).toEqual(range("3-7", 9, "3-11", 8));
    expect(book3.coverFacts.days.slice(0, 7).flatMap((d) => d.sheetIds)).toEqual(range("3-7", 9, "3-10", 6));
  });

  it("plans Book 4 day for day as the sample: repeats first, 40 sheets, 84 pages, three topics on Day 1", () => {
    const { history } = childABook3();
    const book4 = nextBook("child-a", history, CHILD_A_PACE, "book-4", "3-7-9");
    expect(daysOf(book4)).toEqual([
      ["3-9-4#2", "3-10-3#2", "3-11-9", "3-11-10"],
      range("3-12", 1, "3-12", 4),
      range("3-12", 5, "3-12", 8),
      range("3-12", 9, "3-13", 2),
      range("3-13", 3, "3-13", 6),
      range("3-13", 7, "3-13", 10),
      range("3-14", 1, "3-14", 4),
      range("3-14", 5, "3-14", 8),
      range("3-14", 9, "3-15", 2),
      range("3-15", 3, "3-15", 6),
    ]);
    expect([book4.sheets.length, book4.coverFacts.interiorPages, book4.coverFacts.totalPages]).toEqual([40, 80, 84]);
    expect(book4.coverFacts.days[0].topics.map((t) => t.code)).toEqual(["3-9", "3-10", "3-11"]);
    expect(book4.coverFacts.days[0].repeatCount).toBe(2);
    expect(book4.sheets.slice(0, 2).map((s) => s.reason)).toEqual(["repeat", "repeat"]);
    expect(placed("child-a", history, "3-7-9").assumedPassed.map((s) => s.sheetId)).toEqual(range("3-10", 7, "3-11", 8));
  });

  it("opens Book 5 with a single late fail of 3-11 sheet 7, repeats a weaker child's sheet again, and a stronger child reaches 3-15 two sheets sooner", () => {
    const { history } = childABook3();
    const book4 = nextBook("child-a", history, CHILD_A_PACE, "book-4", "3-7-9");
    const late = scoredResult("book-3", "3-11-7", 1, "repeat", CHILD_A_PACE.masteryPercent);
    // Isolated late fail: every scanned sheet of Book 4 is mastered, so 3-11-7#2 opens Book 5 on its own.
    const isolatedLate = printed({ ...history, results: [...history.results, late] }, book4, 4, DAYS_1_TO_7, allMastered, CHILD_A_PACE.masteryPercent);
    const book5Isolated = nextBook("child-a", isolatedLate, CHILD_A_PACE, "book-5", "3-7-9");
    expect(daysOf(book5Isolated)[0]).toEqual(["3-11-7#2", "3-15-7", "3-15-8", "3-15-9"]);

    // Weaker child: 3-10-3 fails a second time in Book 4 alongside the late fail on 3-11-7.
    const weaker = printed({ ...history, results: [...history.results, late] }, book4, 4, DAYS_1_TO_7, failing("3-10-3"), CHILD_A_PACE.masteryPercent);
    const book5Weaker = nextBook("child-a", weaker, CHILD_A_PACE, "book-5", "3-7-9");
    expect(daysOf(book5Weaker)[0]).toEqual(["3-10-3#3", "3-11-7#2", "3-15-7", "3-15-8"]);

    const strong = printed(empty(), childABook3().book3, 3, DAYS_1_TO_7, allMastered, CHILD_A_PACE.masteryPercent);
    const strongBook4 = nextBook("child-a", strong, CHILD_A_PACE, "book-4", "3-7-9");
    expect(strongBook4.sheets.at(-1)?.sheetId).toBe("3-15-8");
  });
});

describe("W1-6: the scenarios of product spec 2.3", () => {
  const LEVEL_3_PACE = paceOf("3");

  it("S1: repeats a failed sheet, goes on past the unmarked days 8 to 10, and a late fail on those days opens the book after", () => {
    const pace = paceOf("7");
    const book1 = nextBook("child-1", empty(), pace, "book-1");
    expect(book1.sheets.map((s) => s.sheetId)).toEqual(range("3-7", 1, "3-10", 10));
    const history = printed(empty(), book1, 1, DAYS_1_TO_7, failing("3-9-3"), pace.masteryPercent);
    const book2 = nextBook("child-1", history, pace, "book-2");
    expect(daysOf(book2)[0]).toEqual(["3-9-3#2", "3-11-1", "3-11-2", "3-11-3"]);
    expect(book2.sheets.filter((s) => s.attempt > 1).map((s) => s.sheetId)).toEqual(["3-9-3"]);

    const late = scoredResult("book-1", "3-10-2", 1, "repeat", pace.masteryPercent);
    const after = printed({ ...history, results: [...history.results, late] }, book2, 2, DAYS_1_TO_7, allMastered, pace.masteryPercent);
    const book3 = nextBook("child-1", after, pace, "book-3");
    expect(daysOf(book3)[0]).toEqual(["3-10-2#2", "3-14-10", "3-15-1", "3-15-2"]);
  });

  it("S4: with only Days 1 and 2 scanned, repeats both explicit unknown and unmarked sheets one time with a team notice, and never a second time", () => {
    const book1 = nextBook("child-1", empty(), LEVEL_3_PACE, "book-1");
    // Day 1-2 scanned (10 of 50 sheets = 20% < 50%): first sheet of Day 2 has an explicit "unknown" result (<80% marked), Days 3-10 are unmarked.
    const explicitUnknown = book1.sheets[5].sheetId;
    const history = printed(empty(), book1, 1, [1, 2], (sheetId) => (sheetId === explicitUnknown ? "unknown" : "mastered"), LEVEL_3_PACE.masteryPercent);
    expect(history.results.find((r) => r.sheetId === explicitUnknown)?.result).toBe("unknown");
    const where = placed("child-1", history);
    expect(where.teamNotices).toHaveLength(41);
    const book2 = nextBook("child-1", history, LEVEL_3_PACE, "book-2");
    expect(book2.teamNotices).toHaveLength(41);
    expect(book2.sheets[0]).toMatchObject({ sheetId: explicitUnknown, attempt: 2, reason: "unscanned" });
    expect(book2.sheets.slice(1, 41).map((s) => `${s.sheetId}#${s.attempt} ${s.reason}`)).toEqual(range("3-8", 1, "3-11", 10).map((id) => `${id}#2 unscanned`));
    expect(book2.sheets.slice(41).map((s) => `${s.sheetId}#${s.attempt}`)).toEqual(range("3-12", 1, "3-12", 9).map((id) => `${id}#1`));

    // Book 2 also has only Days 1 and 2 scanned, with explicit unknown on attempt 2 of `explicitUnknown`: never repeats a second time.
    const again = printed(history, book2, 2, [1, 2], (sheetId) => (sheetId === explicitUnknown ? "unknown" : "mastered"), LEVEL_3_PACE.masteryPercent);
    const book3 = nextBook("child-1", again, LEVEL_3_PACE, "book-3");
    expect(book3.sheets.some((s) => s.attempt > 2)).toBe(false);
    expect(book3.sheets.some((s) => s.sheetId === explicitUnknown)).toBe(false);
    expect(book3.sheets.filter((s) => s.reason === "unscanned").map((s) => s.sheetId)).toEqual(range("3-12", 1, "3-12", 9));
    expect(book3.teamNotices).toHaveLength(9);
  });

  it("S6: a sheet that fails 3 times keeps coming back with new numbers via planWorkbook history, with a nudge to Maya after the third fail and nothing printed", () => {
    const pace: LevelConfig = { pagesPerDay: 2, minutesPerPage: 6, masteryPercent: 80, days: 2 };
    let history = empty();
    const books: { request: Planned["request"]; items: BookItem[] }[] = [];
    const nudges: number[] = [];
    for (let n = 1; n <= 4; n++) {
      const bookHistory = books.length > 0 ? historyFromBooks(books.map((b) => ({ record: { bookId: b.request.bookId }, items: b.items }))) : undefined;
      const plan = nextBook("child-1", history, pace, `book-${n}`, "3-10-1", { bookHistory });
      expect(plan.sheets[0]).toMatchObject({ sheetId: "3-10-1", attempt: n });
      if (bookHistory) expect(plan.request.history).toEqual(bookHistory);
      nudges.push(plan.mayaNudges.length);
      if (n === 4) expect(plan.mayaNudges).toEqual([{ sheetId: "3-10-1", failedAttempts: 3 }]);
      const built = planBook({ snapshot: RAW_LEVEL_3, book: plan.request });
      if (!built.ok) throw new Error(built.problems.join("\n"));
      if (n === 4) {
        // Stripping Maya nudges and team notices from the position yields the exact same printable request and cover facts.
        const pos = placed("child-1", history, "3-10-1");
        const quiet = planWorkbook({
          bookId: `book-${n}`, childId: "child-1", snapshot: LEVEL_3,
          position: { ...pos, mayaNudges: [], teamNotices: [] },
          levelConfig: pace, qrTokens: tokens(4, `child-1-book-${n}`), ...(bookHistory ? { history: bookHistory } : {}),
        });
        if (!quiet.ok) throw new Error(quiet.problems.join("\n"));
        expect(plan.request).toEqual(quiet.request);
        expect(plan.coverFacts).toEqual(quiet.coverFacts);
      }
      books.push({ request: plan.request, items: built.items });
      history = printed(history, plan, n, ALL_DAYS, failing("3-10-1"), pace.masteryPercent);
    }
    expect(nudges).toEqual([0, 0, 0, 1]);
    const forms = books.map((b) => b.items.filter((i) => i.sheetId === "3-10-1").map((i) => canonicalJson(i.question)).join("|"));
    expect(new Set(forms).size).toBe(4);
  });

  it("S7: a child with thin v1 marks starts at topic 6-1 and moves through mastered sheets, one attempt each", () => {
    const level6Topics = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `6-${n}`);
    const rawLevel6 = {
      format: 1, id: "invented-level-6-plan-v1", level: { id: "level-6", name: "6" },
      topics: level6Topics.map((code, t) => ({ id: `topic-${t + 1}`, code, title: `Topic ${code}`, sheets: Array.from({ length: 10 }, (_, s) => `${code}-${s + 1}`) })),
      sheets: level6Topics.flatMap((code, t) => Array.from({ length: 10 }, (_, s) => ({ ...structuredClone(FACTS_SHEET), id: `${code}-${s + 1}`, firstPage: 2 * (10 * t + s) + 1 }))),
    };
    const l6 = validateSnapshot(rawLevel6);
    if (!l6.ok) throw new Error(l6.problems.join("\n"));
    const order6 = [...l6.snapshot.sheets.keys()];
    const config = paceOf("6");
    const book1 = nextBook("child-1", empty(), config, "book-1", undefined, { snapshot: l6.snapshot });
    expect(book1.sheets[0].sheetId).toBe("6-1-1");
    expect(book1.sheets.map((s) => s.sheetId)).toEqual(order6.slice(0, 50));
    const history = printed(empty(), book1, 1, ALL_DAYS, allMastered, config.masteryPercent);
    const book2 = nextBook("child-1", history, config, "book-2", undefined, { snapshot: l6.snapshot });
    expect(book2.sheets.map((s) => s.sheetId)).toEqual(order6.slice(50, 100));
    expect(book2.sheets.every((s) => s.attempt === 1)).toBe(true);
    expect(placed("child-1", history, undefined, l6.snapshot).done).toEqual(order6.slice(0, 50));
  });
});
