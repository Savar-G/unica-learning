// Turns the rows of a sheet into the questions of one child. The seed is the child, the sheet and the attempt. With the
// history of the child, a question that the child has not seen comes first, then one seen longest ago; a question of the
// last attempt prints in its swapped form when its limits allow it, and a side does not print in the order of last time.
import type { BookItem, Side } from "../contract";
import { canonicalJson, pick, seedFrom } from "../hash";
import type { SnapshotRow, SnapshotSheet } from "../bank/snapshot";
import type { Item, Shape } from "../shapes";
import { questionKey, type ShapeSpace } from "../shapes/shape";
import { historyKey, type LastAttempt, type SheetHistory } from "./book-history";
import { chooseQuestions, NOTHING_SEEN, type AskedRow, type SeenBefore } from "./row-questions";

const SIDES: readonly Side[] = ["front", "back"];

/**
 * How often a place asks for a question that the sheet does not have yet. A sheet has few places, so when a row has more
 * questions than that, most tries succeed; a row that has none left uses one again.
 */
const TRIES = 500;
/** Spaces up to this size are scanned exhaustively when history is present so an unseen or oldest-seen item is never missed. */
const EXHAUSTIVE_LIMIT = 20_000;

/** The seed of one place of a row, and of each next try for that place. */
export const itemSeed = (sheetSeed: string, side: Side, rowId: string, place: number, attempt: number): string => seedFrom(sheetSeed, side, rowId, place, attempt);

type RowItem = Omit<BookItem, "number" | "id">;

/** The questions that a sheet, a side of it and a row of the side have. */
type Used = readonly [sheet: Set<string>, side: Set<string>, row: Set<string>];

const keyOf = (shape: Shape, question: unknown): string => `${shape.id} ${questionKey(shape, question)}`;

/** The questions that a sheet has met of some limits so far, to know when there is no other. */
interface Met { keys: Set<string>; count: number | null }

/**
 * How much a question of a shape with no list is avoided for what the child saw: 0 when unseen, and more the more recent
 * its last book. `weight` is more than any penalty, so one more use on the sheet always counts more.
 */
interface Penalty { of(key: string): number; weight: number }
const NO_PENALTY: Penalty = { of: () => 0, weight: 1 };

function penaltyOf(history: SheetHistory | null): Penalty {
  if (!history || history.recency.size === 0) return NO_PENALTY;
  const ranks = new Map([...new Set(history.recency.values())].sort((a, b) => a - b).map((r, i) => [r, i + 1]));
  return { of: (key) => ranks.get(history.recency.get(key) ?? -1) ?? 0, weight: ranks.size + 1 };
}

/**
 * One question of a shape with no list: one that the sheet does not have; when the row has none left, one that the side
 * does not have, and then one that the row does not have. It asks again and again. When it has met every question that
 * the limits allow, it knows how little used the best one is, and stops there: more tries would give the same question.
 */
function nextItem({ shape, limits }: SnapshotRow, seedOf: (attempt: number) => string, used: Used, met: Met, penalty: Penalty): Item<unknown> {
  /** How many of the sheet, the side and the row have a question (one that the row has, all three have), then how recently the child saw it. */
  const uses = (key: string) => used.filter((on) => on.has(key)).length * penalty.weight + penalty.of(key);
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

function gcd(a: number, b: number): number {
  let [x, y] = [a, b];
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

function coprimeStride(seed: string, total: number): number {
  if (total <= 1) return 1;
  let stride = 1 + pick(seedFrom(seed, "stride"), total - 1);
  while (gcd(stride, total) !== 1) stride = stride + 1 < total ? stride + 1 : 1;
  return stride;
}

/**
 * History-aware selection on a non-listed shape with indexed space access: walks distinct indices with a deterministic
 * coprime stride so unseen items (score 0) are found immediately and small spaces always find the exact oldest-seen item.
 */
function nextSpaceItem(
  shape: Shape,
  space: ShapeSpace<unknown>,
  seed: string,
  used: Used,
  penalty: Penalty,
  historySize: number,
): Item<unknown> {
  const uses = (key: string) => used.filter((on) => on.has(key)).length * penalty.weight + penalty.of(key);
  const total = space.count;
  const start = pick(seed, total);
  const stride = coprimeStride(seed, total);
  const limit = total <= EXHAUSTIVE_LIMIT ? total : Math.min(total, historySize + used[0].size + 1);
  let index = start;
  let best: { item: Item<unknown>; uses: number } | null = null;
  for (let k = 0; k < limit; k++) {
    const item = space.at(index, seed);
    const score = uses(keyOf(shape, item.question));
    if (score === 0) return item;
    if (!best || score < best.uses) best = { item, uses: score };
    index = (index + stride) % total;
  }
  return best!.item;
}

function triedItems(row: SnapshotRow, seedOf: AskedRow["seedOf"], sheetUsed: Set<string>, sideUsed: Set<string>, met: Met, penalty: Penalty, historySize: number): Item<unknown>[] {
  const used: Used = [sheetUsed, sideUsed, new Set()];
  const space = penalty !== NO_PENALTY && row.shape.space ? row.shape.space(row.limits) : null;
  return Array.from({ length: row.items }, (_, place) => {
    const { question, answer } = space
      ? nextSpaceItem(row.shape, space, seedOf(place, 0), used, penalty, historySize)
      : nextItem(row, (attempt) => seedOf(place, attempt), used, met, penalty);
    for (const on of used) on.add(keyOf(row.shape, question));
    return { question, answer };
  });
}

/** The questions of the rows of a side, in the order of the bank. */
interface SideRow { row: SnapshotRow; asked: AskedRow; items: Item<unknown>[] }

/**
 * What the rows of one shape with a list need of a history: the keys of that shape, the last questions of each row, and
 * whether this attempt is a repeat.
 */
function seenOf(shape: Shape, history: SheetHistory | null, attempt: number): SeenBefore {
  if (!history) return NOTHING_SEEN;
  const prefix = historyKey(shape.id, "");
  const recency = new Map([...history.recency].filter(([key]) => key.startsWith(prefix)).map(([key, r]) => [key.slice(prefix.length), r]));
  const lastOfRow = new Map<string, string[]>();
  for (const item of history.last?.items ?? []) if (item.shape === shape.id) lastOfRow.set(item.rowId, [...(lastOfRow.get(item.rowId) ?? []), item.key]);
  return { recency, lastOfRow, repeat: attempt >= 2 };
}

const isOrdered = ({ shape, limits, items }: SnapshotRow): boolean => (shape.orderedRuns?.(limits, items) ?? null) !== null;

/**
 * A question of the last attempt prints in its swapped form (7 × 5 for 5 × 7) when the limits of its row allow that form,
 * the last attempt did not print that form too, and the sheet does not print it yet. A row in order keeps the order of
 * its table. The rows of a shape with a list have their printed forms from `chooseQuestions` already, which chooses the
 * runs of a later side with them.
 */
function swapRepeats(rows: Record<Side, SideRow[]>, last: LastAttempt): void {
  const before = new Set(last.items.map((item) => historyKey(item.shape, item.key)));
  const all = SIDES.flatMap((side) => rows[side]);
  const onSheet = new Set(all.flatMap(({ row, items }) => items.map((item) => keyOf(row.shape, item.question))));
  for (const one of all) {
    const { shape, limits } = one.row;
    if (!shape.swapped || shape.list || isOrdered(one.row)) continue;
    one.items = one.items.map((item) => {
      const turned = before.has(keyOf(shape, item.question)) ? shape.swapped?.(item.question, limits) : null;
      if (!turned?.inLimits || before.has(keyOf(shape, turned.question)) || onSheet.has(keyOf(shape, turned.question))) return item;
      onSheet.add(keyOf(shape, turned.question));
      return { question: turned.question, answer: shape.answer(turned.question) };
    });
  }
}

function sheetRows(sheet: SnapshotSheet, seed: string, attempt: number, history: SheetHistory | null): Record<Side, SideRow[]> {
  const rowsOf = (side: Side): SideRow[] => sheet[side].rows.map((row) => ({
    row, items: [], asked: { id: row.id, shape: row.shape, limits: row.limits, items: row.items, seedOf: (place, attempt) => itemSeed(seed, side, row.id, place, attempt) },
  }));
  const rows = { front: rowsOf("front"), back: rowsOf("back") };
  const all = SIDES.flatMap((side) => rows[side]);
  const listed = [...new Map(all.filter(({ row }) => row.shape.list).map(({ row }) => [row.shape.id, row.shape])).values()];
  for (const shape of listed) {
    const own = SIDES.map((side) => rows[side].filter(({ row }) => row.shape.id === shape.id));
    const chosen = chooseQuestions(own.map((side) => side.map(({ asked }) => asked)), seenOf(shape, history, attempt));
    for (const one of own.flat()) one.items = (chosen.get(one.asked) ?? []).map((question) => ({ question, answer: shape.answer(question) }));
  }
  const sheetUsed = new Set<string>();
  const metOf = new Map<string, Met>();
  const penalty = penaltyOf(history);
  const historySize = history?.recency.size ?? 0;
  for (const side of SIDES) {
    const sideUsed = new Set<string>();
    for (const one of rows[side].filter(({ row }) => !row.shape.list)) {
      const { shape, limits } = one.row;
      const key = `${shape.id} ${canonicalJson(limits)}`;
      const met = metOf.get(key) ?? { keys: new Set(), count: null };
      metOf.set(key, met);
      one.items = triedItems(one.row, one.asked.seedOf, sheetUsed, sideUsed, met, penalty, historySize);
    }
  }
  if (history?.last) swapRepeats(rows, history.last);
  return rows;
}

/**
 * Easy to hard down the side: the difficulty decides the order and questions of two rows may mix. Questions of equal
 * difficulty keep the row order of the bank (the sort is stable). Scores compare only inside one shape, so only rows of
 * one shape in sequence mix. A row in order is a run of its own: it is not sorted and mixes with no other row. Each item
 * names its row.
 */
function sideItems(sheetId: string, side: Side, rows: readonly SideRow[], lastForms: readonly string[] | null): RowItem[] {
  const runs: { items: RowItem[]; ordered: boolean }[] = [];
  for (const { row, items: questions } of rows) {
    const { shape } = row;
    const ordered = isOrdered(row);
    const items = questions.map(({ question, answer }): RowItem => ({
      sheetId, side, rowId: row.id, shape: shape.id, shapeVersion: shape.version, question, answer,
      face: shape.face(question), steps: shape.steps(question), difficulty: shape.difficulty(question),
    }));
    const run = runs.at(-1);
    if (run && !run.ordered && !ordered && run.items[0].shape === shape.id) run.items.push(...items);
    else runs.push({ items, ordered });
  }
  const sorted = runs.map(({ items, ordered }) => ({ ordered, items: ordered ? items : items.sort((a, b) => a.difficulty - b.difficulty) }));
  return lastForms ? newOrder(sorted, lastForms) : sorted.flatMap(({ items }) => items);
}

const formsOf = (items: readonly RowItem[]): string[] => items.map((item) => canonicalJson(item.question));

/**
 * A side that would print exactly the questions of the last attempt in the same order changes the order: in the first
 * group of questions of one row with equal difficulty that can change, the first question goes to the end of the group.
 * The order from easy to hard stays. A side whose questions all differ in difficulty keeps its one order.
 */
function newOrder(runs: readonly { items: RowItem[]; ordered: boolean }[], lastForms: readonly string[]): RowItem[] {
  const items = runs.flatMap((run) => run.items);
  const same = (forms: readonly string[]) => forms.length === lastForms.length && forms.every((form, i) => form === lastForms[i]);
  if (items.length < 2 || !same(formsOf(items))) return items;
  for (const [r, run] of runs.entries()) {
    if (run.ordered) continue;
    for (let start = 0; start < run.items.length;) {
      let end = start + 1;
      while (end < run.items.length && run.items[end].rowId === run.items[start].rowId && run.items[end].difficulty === run.items[start].difficulty) end++;
      const group = run.items.slice(start, end);
      const turned = [...group.slice(1), group[0]];
      if (group.length > 1 && formsOf(turned).join("\n") !== formsOf(group).join("\n")) {
        const changed = [...run.items.slice(0, start), ...turned, ...run.items.slice(end)];
        return runs.flatMap((other, i) => (i === r ? changed : other.items));
      }
      start = end;
    }
  }
  return items;
}

/**
 * The questions of one sheet, with the answers of the first computation (checks/printed-answers.ts has the second). With
 * no history, they are the same as before histories were known.
 */
export function sheetItems(sheet: SnapshotSheet, childId: string, attempt: number, history: SheetHistory | null = null): BookItem[] {
  const rows = sheetRows(sheet, seedFrom(childId, sheet.id, attempt), attempt, history);
  const lastForms = (side: Side) => history?.last?.items.filter((item) => item.side === side).map((item) => item.form) ?? null;
  return SIDES.flatMap((side) =>
    sideItems(sheet.id, side, rows[side], lastForms(side)).map((item, i) => ({ ...item, id: `${sheet.id}/${attempt}/${side}/${i + 1}`, number: i + 1 })));
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
