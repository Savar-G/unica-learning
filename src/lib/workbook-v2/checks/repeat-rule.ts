// The repeat rule of architecture 9.3, read back from a finished book: a sheet repeats a question only when its row has no
// other; on a repeat with the child's history, a question the child has not seen comes before a seen one, a question of the
// last attempt prints in its swapped form when its limits allow it, and a side does not print the last attempt's order.
// It decides from the items, the rows and the history alone, with no code of the build that chose the questions.
import type { SnapshotRow } from "../bank/snapshot";
import { historyKey, sheetHistory, type LastAttempt } from "../build/book-history";
import type { BookItem, Side } from "../contract";
import { canonicalJson } from "../hash";
import type { Shape } from "../shapes";
import { questionKey } from "../shapes/shape";
import type { BookCheckInput, CheckedSheet } from "./book-input";
import { attemptOf, finder, type BookFinding, type Place } from "./findings";

const SIDES: readonly Side[] = ["front", "back"];
/** The largest space of questions that the check reads whole. The build reads spaces up to this size whole too (build/items.ts). */
const MOST_QUESTIONS = 20_000;
/** A fixed seed: the identity of a question of a space does not depend on it. */
const SEED = "repeat-check";

const keyOf = (shape: Shape, question: unknown): string => historyKey(shape.id, questionKey(shape, question));

interface Printed { item: BookItem; row: SnapshotRow; key: string; form: string }

/** Whether a row prints a run of its table in order: it then repeats or keeps questions as its table does. */
const isOrdered = ({ shape, limits, items }: SnapshotRow): boolean => (shape.orderedRuns?.(limits, items) ?? null) !== null;

/** Every question key of a row, or null when the row prints in order or its space is too large to read whole. */
function poolOf(row: SnapshotRow, cache: Map<string, ReadonlySet<string> | null>): ReadonlySet<string> | null {
  const id = `${row.shape.id} ${canonicalJson(row.limits)}`;
  if (cache.has(id)) return cache.get(id) ?? null;
  let pool: ReadonlySet<string> | null = null;
  if (!isOrdered(row) && row.shape.list) pool = new Set(row.shape.list(row.limits).map((q) => keyOf(row.shape, q)));
  else if (!isOrdered(row) && row.shape.space) {
    const space = row.shape.space(row.limits);
    if (space.count <= MOST_QUESTIONS) pool = new Set(Array.from({ length: space.count }, (_, i) => keyOf(row.shape, space.at(i, SEED).question)));
  }
  cache.set(id, pool);
  return pool;
}

/** The printed questions of one sheet and attempt, each with its row, in printed order. */
function printedOf({ sheet, attempt }: CheckedSheet, items: readonly BookItem[]): Printed[] {
  const rows = new Map(SIDES.flatMap((side) => sheet[side].rows.map((row) => [`${side}/${row.id}`, row] as const)));
  return items.flatMap((item) => {
    const row = item.sheetId === sheet.id && attemptOf(item) === attempt ? rows.get(`${item.side}/${item.rowId}`) : undefined;
    return row ? [{ item, row, key: keyOf(row.shape, item.question), form: canonicalJson(item.question) }] : [];
  });
}

const keysOf = (last: LastAttempt): Set<string> => new Set(last.items.map((i) => historyKey(i.shape, i.key)));

/** The swapped form of a printed question, when its limits allow one. */
function turnedKey({ item, row }: Printed): string | null {
  const turned = row.shape.swapped?.(item.question, row.limits);
  return turned?.inLimits ? keyOf(row.shape, turned.question) : null;
}

/** What the repeat rule finds wrong with the sheets of a book. */
export function repeatFindings({ sheets, items, history }: BookCheckInput, placeOf: (item: BookItem) => Place): BookFinding[] {
  const found: BookFinding[] = [];
  const tell = finder("source", found);
  const cache = new Map<string, ReadonlySet<string> | null>();
  for (const checked of sheets) {
    const printed = printedOf(checked, items);
    const onSheet = new Map<string, number>();
    for (const { key } of printed) onSheet.set(key, (onSheet.get(key) ?? 0) + 1);
    const unprinted = (row: SnapshotRow, wanted: (key: string) => boolean): boolean => {
      for (const key of poolOf(row, cache) ?? []) if (!onSheet.has(key) && wanted(key)) return true;
      return false;
    };

    // A question twice on a sheet only when its row has no question that the sheet does not print.
    const met = new Set<string>();
    for (const one of printed) {
      const twice = met.has(one.key);
      met.add(one.key);
      if (twice && unprinted(one.row, () => true)) tell("no-repeat", placeOf(one.item), `question ${one.item.number} is on the sheet more than once, and its row "${one.row.id}" has questions that the sheet does not print`);
    }

    const own = history ? sheetHistory(history, checked.sheet.id) : null;
    if (!own || checked.attempt < 2) continue;
    const before = own.last ? keysOf(own.last) : new Set<string>();

    // A question the child saw comes only when its row has no unseen question left; a swap of the last attempt is not such a choice.
    for (const one of printed) {
      if (!own.recency.has(one.key) || isOrdered(one.row)) continue;
      const swappedFrom = turnedKey(one);
      if (swappedFrom !== null && before.has(swappedFrom)) continue;
      if (unprinted(one.row, (key) => !own.recency.has(key))) tell("unseen-first", placeOf(one.item), `question ${one.item.number} was in an earlier book, and its row "${one.row.id}" has questions that the child has not seen`);
    }
    if (!own.last) continue;

    // A question of the last attempt prints in its swapped form when the limits allow it and the sheet does not print that form.
    for (const one of printed) {
      if (!before.has(one.key) || isOrdered(one.row)) continue;
      const turned = turnedKey(one);
      if (turned !== null && turned !== one.key && !before.has(turned) && !onSheet.has(turned)) tell("swapped-form", placeOf(one.item), `question ${one.item.number} prints as in the last attempt, and its limits allow its swapped form`);
    }

    // A side does not print the last attempt's questions in the same order when two questions of one row and difficulty can change places.
    for (const side of SIDES) {
      const now = printed.filter((p) => p.item.side === side);
      const last = own.last.items.filter((i) => i.side === side).map((i) => i.form);
      if (now.length < 2 || now.length !== last.length || now.some((p, i) => p.form !== last[i])) continue;
      const movable = now.some((p, i) => i > 0 && !isOrdered(p.row) && now[i - 1].item.rowId === p.item.rowId && now[i - 1].item.difficulty === p.item.difficulty && now[i - 1].form !== p.form);
      if (movable) tell("new-order", placeOf(now[0].item), `the ${side} side prints the questions of the last attempt in the same order`);
    }
  }
  return found;
}
