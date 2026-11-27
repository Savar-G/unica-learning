// The golden books (architecture 11.1): two synthetic children on each synthetic level. Both get the same Book 1 of the
// first two sheets of the level. The strong child masters both, and its golden book is Book 2 of the next new sheets. The
// weak child fails the second sheet, and its golden book is Book 2 that repeats it (attempt 2, with the history of Book 1,
// so the repeat prefers questions it has not seen and swapped forms) and then the next new sheet. Only invented
// snapshots live in the repository; a real level comes from a private snapshot file (scripts/workbook-v2-golden.ts).
import { historyFromBooks, planNextBook } from "../assemble/plan-book";
import { position, type ChildPosition, type IssuedSheet, type SheetResultRecord } from "../assemble/position";
import { validateSnapshot, type Snapshot } from "../bank/snapshot";
import { buildBook, planBook, type BuildInput, type BuildResult } from "../build/build-book";
import factsSnapshot from "../fixtures/snapshot-facts.json";
import divisionSnapshot from "../fixtures/snapshot-division.json";
import type { BookItem } from "../contract";
import type { Renderer } from "../renderer";
import { sheetResult, type ItemMark } from "../results/sheet-results";
import type { GoldenBuild } from "./golden";

export const GOLDEN_CHILDREN = ["strong", "weak"] as const;
export type GoldenChild = (typeof GOLDEN_CHILDREN)[number];

/** A level for golden books: its snapshot as data, and the share of right first tries that masters a sheet. */
export interface GoldenLevel { snapshot: unknown; masteryPercent: number }

/** The synthetic levels whose golden books run in public CI. Every snapshot id starts with "invented-". */
export const SYNTHETIC_LEVELS: readonly GoldenLevel[] = [
  { snapshot: factsSnapshot, masteryPercent: 90 },
  { snapshot: divisionSnapshot, masteryPercent: 90 },
];

/** The name of a golden book: the snapshot id and the child, such as "invented-level-2-facts-v1/weak". */
export const goldenBookName = (snapshotId: string, child: GoldenChild): string => `${snapshotId}/${child}`;

const PAGES_A_DAY = 4;

function snapshotOf(level: GoldenLevel): Snapshot {
  const bank = validateSnapshot(structuredClone(level.snapshot));
  if (!bank.ok) throw new Error(`The golden level does not validate:\n${bank.problems.join("\n")}`);
  return bank.snapshot;
}

export const levelId = (level: GoldenLevel): string => snapshotOf(level).id;

const qrTexts = (childId: string, book: number, count: number): string[] =>
  Array.from({ length: 2 * count }, (_, i) => `https://unicalearning.com/tutor/p/${childId}-${book}-${i + 1}`);

function nextRequest(snapshot: Snapshot, childId: string, book: number, where: ChildPosition, history?: ReturnType<typeof historyFromBooks>) {
  const next = planNextBook({
    bookId: `${childId}-book-${book}`, childId, snapshot, position: where, pagesPerDay: PAGES_A_DAY, days: 1,
    qrTokens: qrTexts(childId, book, 2), ...(history ? { history } : {}),
  });
  if (!next.ok) throw new Error(`The golden Book ${book} of ${childId} does not plan:\n${next.problems.join("\n")}`);
  return next.request;
}

/** Invented first tries: every question right, or just below `masteryPercent` so a weak sheet always fails at any setting (1–100). */
function marksOf(items: readonly BookItem[], fail: boolean, masteryPercent: number): ItemMark[] {
  const maxRight = fail ? Math.max(0, Math.ceil((items.length * masteryPercent) / 100) - 1) : items.length;
  return items.map((item, i) => ({ itemId: item.id, firstTry: i < maxRight ? "right" : "wrong" }));
}

/** The input of a golden book: plain JSON for `planBook` and `buildBook`, the same each time. Needs no typesetter. */
export function goldenInput(level: GoldenLevel, child: GoldenChild): BuildInput {
  const snapshot = snapshotOf(level);
  const childId = `golden-${child}`;
  const start = position({ childId }, [], [], [], snapshot);
  if (!start.ok) throw new Error(start.problems.join("\n"));
  const first = nextRequest(snapshot, childId, 1, start);
  const one = planBook({ snapshot: level.snapshot, book: first });
  if (!one.ok) throw new Error(`The golden Book 1 of ${childId} does not plan:\n${one.problems.join("\n")}`);

  const bookId = first.bookId;
  const sheetIds = first.sheets.map((s) => s.sheetId);
  const issued = sheetIds.map((sheetId): IssuedSheet => {
    const pages = one.pages.filter((p) => p.sheetId === sheetId).map((p) => p.page);
    return { bookId, bookNumber: 1, sheetId, attempt: 1, pages: [pages[0], pages[1]] };
  });
  const receipts = one.pages.map((p) => ({ bookId, pageNumber: p.page }));
  const results = sheetIds.map((sheetId, i): SheetResultRecord => {
    const items = one.items.filter((item) => item.sheetId === sheetId);
    const outcome = sheetResult(items, marksOf(items, child === "weak" && i === 1, level.masteryPercent), { masteryPercent: level.masteryPercent });
    if (!outcome.ok) throw new Error(outcome.problems.join("\n"));
    return { bookId, sheetId, attempt: 1, result: outcome.result, itemsScored: outcome.itemsScored, mistakes: outcome.mistakes };
  });
  const where = position({ childId }, issued, receipts, results, snapshot);
  if (!where.ok) throw new Error(where.problems.join("\n"));
  const history = historyFromBooks([{ record: { bookId }, items: one.items }]);
  const book = nextRequest(snapshot, childId, 2, where, history);
  if (child === "weak" && book.sheets[0]?.attempt !== 2) {
    throw new Error(`The weak golden book for ${snapshot.id} at mastery ${level.masteryPercent}% must start with attempt 2, got attempt ${String(book.sheets[0]?.attempt ?? "none")}.`);
  }
  return { snapshot: level.snapshot, book };
}

export function buildGoldenBook(level: GoldenLevel, child: GoldenChild, renderer: Renderer): Promise<BuildResult> {
  return buildBook(goldenInput(level, child), renderer);
}

/** Every golden book of the levels, strong then weak for each level, built with every check. `only` keeps one book by name. */
export async function buildGoldenBooks(levels: readonly GoldenLevel[], renderer: Renderer, only?: string): Promise<GoldenBuild[]> {
  const builds: GoldenBuild[] = [];
  for (const level of levels) {
    for (const child of GOLDEN_CHILDREN) {
      const book = goldenBookName(levelId(level), child);
      if (only !== undefined && only !== book) continue;
      const built = await buildGoldenBook(level, child, renderer);
      if (built.status !== "built") throw new Error(`The golden book ${book} does not build:\n${built.problems.join("\n")}`);
      builds.push({ book, inputHash: built.record.inputHash, pdf: built.pdf, pages: built.pages });
    }
  }
  if (only !== undefined && builds.length === 0) throw new Error(`There is no golden book ${only}.`);
  return builds;
}
