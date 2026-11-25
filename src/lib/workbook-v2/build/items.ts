// Turns the rows of a sheet into the questions of one child. The seed is the child, the sheet and the attempt.
import type { BookItem, Side } from "../contract";
import { canonicalJson, seedFrom } from "../hash";
import type { SnapshotRow, SnapshotSheet } from "../bank/snapshot";
import type { Item, Shape } from "../shapes";
import { chooseQuestions, type AskedRow } from "./row-questions";

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

/** The questions that a sheet has met of some limits so far, to know when there is no other. */
interface Met { keys: Set<string>; count: number | null }

/**
 * One question of a shape with no list: one that the sheet does not have; when the row has none left, one that the side
 * does not have, and then one that the row does not have. It asks again and again. When it has met every question that
 * the limits allow, it knows how little used the best one is, and stops there: more tries would give the same question.
 */
function nextItem({ shape, limits }: SnapshotRow, seedOf: (attempt: number) => string, used: Used, met: Met): Item<unknown> {
  /** How many of the sheet, the side and the row have a question: one that the row has, all three have. */
  const uses = (key: string) => used.filter((on) => on.has(key)).length;
  const ask = (attempt: number) => {
    const item = shape.generate(limits, seedOf(attempt));
    const key = keyOf(shape, item.question);
    met.keys.add(key);
    return { item, uses: uses(key) };
  };
  /** How little used a question of the row can be: 0 until all of them are met. */
  const least = () => {
    met.count ??= shape.count(limits);
    return met.keys.size < met.count ? 0 : Math.min(...[...met.keys].map(uses));
  };
  let best = ask(0);
  for (let attempt = 1; best.uses > 0 && attempt < TRIES && best.uses > least(); attempt++) {
    const next = ask(attempt);
    if (next.uses < best.uses) best = next;
  }
  return best.item;
}

function triedItems(row: SnapshotRow, seedOf: AskedRow["seedOf"], sheetUsed: Set<string>, sideUsed: Set<string>, met: Met): Item<unknown>[] {
  const used: Used = [sheetUsed, sideUsed, new Set()];
  return Array.from({ length: row.items }, (_, place) => {
    const { question, answer } = nextItem(row, (attempt) => seedOf(place, attempt), used, met);
    for (const on of used) on.add(keyOf(row.shape, question));
    return { question, answer };
  });
}

/** The questions of the rows of a side, in the order of the bank. */
interface SideRow { row: SnapshotRow; asked: AskedRow; items: Item<unknown>[] }

function sheetRows(sheet: SnapshotSheet, seed: string): Record<Side, SideRow[]> {
  const rowsOf = (side: Side): SideRow[] => sheet[side].rows.map((row) => ({
    row, items: [], asked: { id: row.id, shape: row.shape, limits: row.limits, items: row.items, seedOf: (place, attempt) => itemSeed(seed, side, row.id, place, attempt) },
  }));
  const rows = { front: rowsOf("front"), back: rowsOf("back") };
  const all = SIDES.flatMap((side) => rows[side]);
  const listed = [...new Map(all.filter(({ row }) => row.shape.list).map(({ row }) => [row.shape.id, row.shape])).values()];
  for (const shape of listed) {
    const own = SIDES.map((side) => rows[side].filter(({ row }) => row.shape.id === shape.id));
    const chosen = chooseQuestions(own.map((side) => side.map(({ asked }) => asked)));
    for (const one of own.flat()) one.items = (chosen.get(one.asked) ?? []).map((question) => ({ question, answer: shape.answer(question) }));
  }
  const sheetUsed = new Set<string>();
  const metOf = new Map<string, Met>();
  for (const side of SIDES) {
    const sideUsed = new Set<string>();
    for (const one of rows[side].filter(({ row }) => !row.shape.list)) {
      const { shape, limits } = one.row;
      const key = keyOf(shape, limits);
      const met = metOf.get(key) ?? { keys: new Set(), count: null };
      metOf.set(key, met);
      one.items = triedItems(one.row, one.asked.seedOf, sheetUsed, sideUsed, met);
    }
  }
  return rows;
}

/**
 * Easy to hard down the side: the difficulty decides the order and questions of two rows may mix. Questions of equal
 * difficulty keep the row order of the bank (the sort is stable). Scores compare only inside one shape, so only rows of
 * one shape in sequence mix. A row in order is a run of its own: it is not sorted and mixes with no other row. Each item
 * names its row.
 */
function sideItems(sheetId: string, side: Side, rows: readonly SideRow[]): RowItem[] {
  const runs: { items: RowItem[]; ordered: boolean }[] = [];
  for (const { row, items: questions } of rows) {
    const { shape, limits } = row;
    const ordered = (shape.orderedRuns?.(limits, row.items) ?? null) !== null;
    const items = questions.map(({ question, answer }): RowItem => ({
      sheetId, side, rowId: row.id, shape: shape.id, shapeVersion: shape.version, question, answer,
      face: shape.face(question), steps: shape.steps(question), difficulty: shape.difficulty(question),
    }));
    const run = runs.at(-1);
    if (run && !run.ordered && !ordered && run.items[0].shape === shape.id) run.items.push(...items);
    else runs.push({ items, ordered });
  }
  return runs.flatMap(({ items, ordered }) => (ordered ? items : items.sort((a, b) => a.difficulty - b.difficulty)));
}

/** The questions of one sheet, with the answers of the first computation (checks/printed-answers.ts has the second). */
export function sheetItems(sheet: SnapshotSheet, childId: string, attempt: number): BookItem[] {
  const rows = sheetRows(sheet, seedFrom(childId, sheet.id, attempt));
  return SIDES.flatMap((side) =>
    sideItems(sheet.id, side, rows[side]).map((item, i) => ({ ...item, id: `${sheet.id}/${attempt}/${side}/${i + 1}`, number: i + 1 })));
}

/** The rows of a sheet with a question that the row, an earlier row of the side or the front side has too. A book with them is built. */
export function repeatNotices(sheet: SnapshotSheet, items: readonly BookItem[]): string[] {
  const notices: string[] = [];
  const front = new Set<string>();
  for (const side of SIDES) {
    const onSide = new Set<string>();
    for (const row of sheet[side].rows) {
      const keys = items.filter((item) => item.side === side && item.rowId === row.id).map((item) => keyOf(row.shape, item.question));
      const tell = (others: ReadonlySet<string>, what: string, inRow = false) => {
        const twice = keys.filter((key, i) => others.has(key) || (inRow && keys.indexOf(key) < i)).length;
        if (twice > 0) notices.push(`Sheet "${sheet.id}", ${side} side, row "${row.id}": ${twice} ${twice === 1 ? "question is" : "questions are"} ${what}.`);
      };
      tell(onSide, "on this side more than once", true);
      if (side === "back") tell(front, "on the front side too");
      for (const key of keys) (side === "front" ? [onSide, front] : [onSide]).forEach((on) => on.add(key));
    }
  }
  return notices;
}
