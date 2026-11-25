// Turns the rows of a sheet into the questions of one child. The seed is the child, the sheet and the attempt.
import type { BookItem, Side } from "../contract";
import { canonicalJson, pick, seedFrom } from "../hash";
import type { SnapshotRow, SnapshotSheet, SnapshotSide } from "../bank/snapshot";
import type { Item, Shape } from "../shapes";

const SIDES: readonly Side[] = ["front", "back"];

/**
 * How often a place asks for a question that the sheet does not have yet. A sheet has few places, so when a row has more
 * questions than that, most tries succeed; a row that has none left uses one again.
 */
const TRIES = 500;

/** The seed of one place of a row, and of each next try for that place. */
export const itemSeed = (sheetSeed: string, side: Side, rowId: string, place: number, attempt: number): string => seedFrom(sheetSeed, side, rowId, place, attempt);

type RowItem = Omit<BookItem, "number" | "id">;

/** The questions that a sheet, a side of it and a row of the side have. */
type Used = readonly [sheet: Set<string>, side: Set<string>, row: Set<string>];

const keyOf = (shape: Shape, question: unknown): string => `${shape.id} ${canonicalJson(question)}`;

/**
 * One question that the sheet does not have; when the row has none left, one that the side does not have, and then one
 * that the row does not have. A shape with a list chooses from what is left, so that it finds the last question too.
 * Another shape asks again and again.
 */
function nextItem({ shape, limits }: SnapshotRow, seedOf: (attempt: number) => string, used: Used): Item<unknown> {
  /** How many of the sheet, the side and the row have a question: one that the row has, all three have. */
  const uses = (question: unknown) => used.filter((on) => on.has(keyOf(shape, question))).length;
  let best = shape.generate(limits, seedOf(0));
  let fewest = uses(best.question);
  if (fewest > 0 && shape.list) {
    const all = shape.list(limits).map((question) => ({ question, uses: uses(question) }));
    const least = Math.min(...all.map((q) => q.uses));
    const left = all.filter((q) => q.uses === least);
    const { question } = left[pick(seedOf(1), left.length)];
    return { question, answer: shape.answer(question) };
  }
  for (let attempt = 1; fewest > 0 && attempt < TRIES; attempt++) {
    const next = shape.generate(limits, seedOf(attempt));
    const found = uses(next.question);
    if (found < fewest) [best, fewest] = [next, found];
  }
  return best;
}

/** The questions of a row in their order on the side, and whether that order is the order of a table. */
interface Row { items: RowItem[]; ordered: boolean }

function rowItems(sheetId: string, side: Side, row: SnapshotRow, seed: string, sheetUsed: Set<string>, sideUsed: Set<string>): Row {
  const { shape, limits } = row;
  const used: Used = [sheetUsed, sideUsed, new Set()];
  const take = (item: Item<unknown>): RowItem => {
    const { question, answer } = item;
    for (const on of used) on.add(keyOf(shape, question));
    return {
      sheetId, side, rowId: row.id, shape: shape.id, shapeVersion: shape.version, question, answer,
      face: shape.face(question), steps: shape.steps(question), difficulty: shape.difficulty(question),
    };
  };
  const run = shape.orderedRow?.(limits, row.items, itemSeed(seed, side, row.id, 0, 0));
  if (run && run.length !== row.items) throw new Error(`the row "${row.id}" in order has ${run.length} questions and must have ${row.items}`);
  if (run) return { items: run.map(take), ordered: true };
  return { items: Array.from({ length: row.items }, (_, place) => take(nextItem(row, (attempt) => itemSeed(seed, side, row.id, place, attempt), used))), ordered: false };
}

/** How few questions a row can choose from: the row with the fewest chooses first. A row in order has no choice. */
function choice({ shape, limits, items }: SnapshotRow): number {
  if (shape.orderedRow?.(limits, items, "")) return 0;
  return shape.list ? shape.count(limits) : Number.POSITIVE_INFINITY;
}

/**
 * Easy to hard down the side: the difficulty decides the order and questions of two rows may mix. Questions of equal
 * difficulty keep the row order of the bank (the sort is stable). Scores compare only inside one shape, so only rows of
 * one shape in sequence mix. A row in order is a run of its own: it is not sorted and mixes with no other row. Each item
 * names its row.
 */
function sideItems(sheetId: string, side: Side, content: SnapshotSide, seed: string, sheetUsed: Set<string>): RowItem[] {
  const sideUsed = new Set<string>();
  const made = new Map<SnapshotRow, Row>();
  const fewest = content.rows.map((row) => ({ row, from: choice(row) })).sort((a, b) => (a.from === b.from ? 0 : a.from - b.from));
  for (const { row } of fewest) made.set(row, rowItems(sheetId, side, row, seed, sheetUsed, sideUsed));
  const runs: Row[] = [];
  for (const row of content.rows) {
    const { items, ordered } = made.get(row) ?? { items: [], ordered: false };
    const run = runs.at(-1);
    if (run && !run.ordered && !ordered && run.items[0].shape === row.shape.id) run.items.push(...items);
    else runs.push({ items, ordered });
  }
  return runs.flatMap(({ items, ordered }) => (ordered ? items : items.sort((a, b) => a.difficulty - b.difficulty)));
}

/** The questions of one sheet, with the answers of the first computation (checks/printed-answers.ts has the second). */
export function sheetItems(sheet: SnapshotSheet, childId: string, attempt: number): BookItem[] {
  const seed = seedFrom(childId, sheet.id, attempt);
  const used = new Set<string>();
  return SIDES.flatMap((side) =>
    sideItems(sheet.id, side, sheet[side], seed, used).map((item, i) => ({ ...item, id: `${sheet.id}/${attempt}/${side}/${i + 1}`, number: i + 1 })));
}
