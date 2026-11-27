// The repeat rule of architecture 9.3, read back from a finished book: a sheet repeats a question only when its row has no
// other; on a repeat with the child's history, a question the child has not seen comes before a seen one, a question of the
// last attempt prints in its swapped form when its limits allow it, and a side does not print the last attempt's order.
// A row in order prints one whole run of its table. It decides from the items, the rows and the history alone, with no code
// of the build that chose the questions.
import type { SnapshotRow } from "../bank/snapshot";
import { historyKey, sheetHistory, type BookHistory, type LastAttempt } from "../build/book-history";
import type { BookItem, Side } from "../contract";
import { canonicalJson } from "../hash";
import type { Shape } from "../shapes";
import { questionKey } from "../shapes/shape";
import type { BookCheckData, CheckedSheet } from "./book-input";
import { attemptOf, finder, type BookFinding, type Place } from "./findings";
import type { RowHas } from "./membership";

const SIDES: readonly Side[] = ["front", "back"];
/** The largest space of questions that the check reads whole. The build reads spaces up to this size whole too (build/items.ts). */
const MOST_QUESTIONS = 20_000;
/** A fixed seed: the identity of a question of a space does not depend on it. */
const SEED = "repeat-check";

const keyOf = (shape: Shape, question: unknown): string => historyKey(shape.id, questionKey(shape, question));

interface Printed { item: BookItem; row: SnapshotRow; key: string; form: string }

/** The legal runs of a row in order, each as its question keys and its printed forms, or null for a row that mixes its questions. */
interface Run { keys: string[]; forms: string }
const RUNS = new WeakMap<SnapshotRow, Run[] | null>();
function runsOf(row: SnapshotRow): Run[] | null {
  if (RUNS.has(row)) return RUNS.get(row) ?? null;
  const { shape, limits, items } = row;
  const runs = shape.orderedRuns?.(limits, items)?.map((run) => ({ keys: run.map((q) => keyOf(shape, q)), forms: run.map((q) => canonicalJson(q)).join("\n") })) ?? null;
  RUNS.set(row, runs);
  return runs;
}

/**
 * The questions of a row that mixes them: every key when the space is small enough to read whole, or else how many there
 * are and a way to know whether a key is one of them. A key of a shape with no identity is its question as JSON.
 */
type Pool = { keys: ReadonlySet<string> } | { count: number; holds: (key: string) => boolean | null };

function poolOf(row: SnapshotRow, cache: Map<string, Pool | null>, has: RowHas): Pool | null {
  const id = `${row.shape.id} ${canonicalJson(row.limits)}`;
  if (cache.has(id)) return cache.get(id) ?? null;
  const { shape, limits } = row;
  let pool: Pool | null = null;
  if (runsOf(row) === null && shape.list) pool = { keys: new Set(shape.list(limits).map((q) => keyOf(shape, q))) };
  else if (runsOf(row) === null && shape.space) {
    const space = shape.space(limits);
    if (space.count <= MOST_QUESTIONS) pool = { keys: new Set(Array.from({ length: space.count }, (_, i) => keyOf(shape, space.at(i, SEED).question))) };
    else if (!shape.identity) {
      const prefix = historyKey(shape.id, "");
      const holds = (key: string): boolean | null => {
        if (!key.startsWith(prefix)) return false;
        try {
          return has(row, JSON.parse(key.slice(prefix.length)));
        } catch {
          return null;
        }
      };
      pool = { count: space.count, holds };
    }
  }
  cache.set(id, pool);
  return pool;
}

/**
 * Whether a row that mixes its questions has one that the sheet does not print and that `free` allows. A large space is
 * not read: it has one when it has more questions than the keys that the sheet prints or `free` refuses (`taken`). A key
 * that cannot be read back counts as one of the row's, so the rule is never broken by a doubt.
 */
function hasOther(pool: Pool, onSheet: ReadonlyMap<string, number>, free: (key: string) => boolean, taken: Iterable<string>): boolean {
  if ("keys" in pool) {
    for (const key of pool.keys) if (!onSheet.has(key) && free(key)) return true;
    return false;
  }
  let inPool = 0;
  for (const key of new Set([...onSheet.keys(), ...taken])) if (pool.holds(key) !== false) inPool++;
  return pool.count > inPool;
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

/** The printed questions of each row in order, by side and row id. */
function byRow(printed: readonly Printed[]): Map<string, Printed[]> {
  const rows = new Map<string, Printed[]>();
  for (const one of printed) {
    const id = `${one.item.side}/${one.row.id}`;
    rows.set(id, [...(rows.get(id) ?? []), one]);
  }
  return rows;
}

/** How a run of a row in order compares with the other legal runs of its table: each number is better when it is less. */
interface RunCost { twice: number; seen: number; last: number }
const RUN_RULES: readonly { cost: keyof RunCost; rule: string; says: string }[] = [
  { cost: "twice", rule: "no-repeat", says: "prints questions that another row in order of the sheet prints, and its table has a run with fewer of them" },
  { cost: "seen", rule: "unseen-first", says: "prints questions from an earlier book, and its table has a run with fewer of them" },
  { cost: "last", rule: "new-order", says: "prints the run of the last attempt, and its table has another run" },
];

/**
 * A row in order prints a whole legal run of its table (`runsOf`), and none that another legal run beats: one that is
 * no worse on every count and better on one. The counts are the questions that the other rows in order of its side (and
 * of the front, for a row of the back) print too; on a repeat with the child's history, the questions that the child
 * has seen; and whether the run is the one that the row printed in the last attempt. The rest of the sheet stays as it
 * is printed, so a run that the check prefers fits the sheet as well as the printed one.
 */
function orderedRunFindings(checked: CheckedSheet, rows: ReadonlyMap<string, Printed[]>, history: BookHistory | null, placeOf: (item: BookItem) => Place): BookFinding[] {
  const found: BookFinding[] = [];
  const tell = finder("source", found);
  const own = history && checked.attempt >= 2 ? sheetHistory(history, checked.sheet.id) : null;
  const seen = (key: string) => own?.recency.has(key) === true;
  for (const run of rows.values()) {
    const [first] = run;
    const runs = runsOf(first.row);
    const printedKeys = run.map((p) => p.key);
    if (!runs || !runs.some((r) => r.keys.join("\n") === printedKeys.join("\n"))) continue;
    const side = first.item.side;
    const others = new Set<string>();
    for (const [id, other] of rows) {
      const otherSide = other[0].item.side;
      if (id !== `${side}/${first.row.id}` && runsOf(other[0].row) && (otherSide === side || otherSide === "front")) for (const { key } of other) others.add(key);
    }
    const lastKeys = own?.last?.items.filter((i) => i.side === side && i.rowId === first.row.id).map((i) => historyKey(i.shape, i.key)).join("\n");
    const costOf = (keys: readonly string[]): RunCost => ({
      twice: keys.filter((key) => others.has(key)).length,
      seen: keys.filter(seen).length,
      last: lastKeys !== undefined && lastKeys !== "" && keys.join("\n") === lastKeys ? 1 : 0,
    });
    const now = costOf(printedKeys);
    const costs = runs.map((r) => costOf(r.keys));
    const beats = (cost: RunCost) => RUN_RULES.every(({ cost: c }) => cost[c] <= now[c]) && RUN_RULES.some(({ cost: c }) => cost[c] < now[c]);
    const better = costs.filter(beats);
    const broken = RUN_RULES.find(({ cost }) => better.some((b) => b[cost] < now[cost]));
    if (broken) tell(broken.rule, placeOf(first.item), `the row "${first.row.id}" in order ${broken.says}`);
  }
  return found;
}

/** What the repeat rule finds wrong with the sheets of a book. */
export function repeatFindings({ sheets, items, history }: Pick<BookCheckData, "sheets" | "items" | "history">, placeOf: (item: BookItem) => Place, has: RowHas): BookFinding[] {
  const found: BookFinding[] = [];
  const tell = finder("source", found);
  const cache = new Map<string, Pool | null>();
  for (const checked of sheets) {
    const printed = printedOf(checked, items);
    const onSheet = new Map<string, number>();
    for (const { key } of printed) onSheet.set(key, (onSheet.get(key) ?? 0) + 1);
    const rows = byRow(printed);

    // A row in order prints one whole run of its table, in the order of the table.
    for (const own of rows.values()) {
      const runs = runsOf(own[0].row);
      const forms = own.map((p) => p.form).join("\n");
      if (runs && !runs.some((run) => run.forms === forms)) tell("ordered-run", placeOf(own[0].item), `the row "${own[0].row.id}" is in the order of its table, and it prints no run of the table`);
    }

    for (const finding of orderedRunFindings(checked, rows, history, placeOf)) found.push(finding);

    // A question twice on a sheet only when its row has no question that the sheet does not print.
    const met = new Set<string>();
    for (const one of printed) {
      const twice = met.has(one.key);
      met.add(one.key);
      const pool = poolOf(one.row, cache, has);
      if (twice && pool && hasOther(pool, onSheet, () => true, [])) tell("no-repeat", placeOf(one.item), `question ${one.item.number} is on the sheet more than once, and its row "${one.row.id}" has questions that the sheet does not print`);
    }

    const own = history ? sheetHistory(history, checked.sheet.id) : null;
    if (!own || checked.attempt < 2) continue;
    const before = own.last ? keysOf(own.last) : new Set<string>();
    const seen = (key: string) => own.recency.has(key);

    // A question the child saw comes only when its row has no unseen question left; a swap of the last attempt is not such a choice.
    for (const one of printed) {
      const pool = poolOf(one.row, cache, has);
      if (!seen(one.key) || !pool) continue;
      const swappedFrom = turnedKey(one);
      if (swappedFrom !== null && before.has(swappedFrom)) continue;
      if (hasOther(pool, onSheet, (key) => !seen(key), own.recency.keys())) tell("unseen-first", placeOf(one.item), `question ${one.item.number} was in an earlier book, and its row "${one.row.id}" has questions that the child has not seen`);
    }
    if (!own.last) continue;

    // A question of the last attempt prints in its swapped form when the limits allow it and the sheet does not print that form.
    for (const one of printed) {
      if (!before.has(one.key) || runsOf(one.row) !== null) continue;
      const turned = turnedKey(one);
      if (turned !== null && turned !== one.key && !before.has(turned) && !onSheet.has(turned)) tell("swapped-form", placeOf(one.item), `question ${one.item.number} prints as in the last attempt, and its limits allow its swapped form`);
    }

    // A side does not print the last attempt's questions in the same order when two questions of one row and difficulty can change places.
    for (const side of SIDES) {
      const now = printed.filter((p) => p.item.side === side);
      const last = own.last.items.filter((i) => i.side === side).map((i) => i.form);
      if (now.length < 2 || now.length !== last.length || now.some((p, i) => p.form !== last[i])) continue;
      const movable = now.some((p, i) => i > 0 && runsOf(p.row) === null && now[i - 1].item.rowId === p.item.rowId && now[i - 1].item.difficulty === p.item.difficulty && now[i - 1].form !== p.form);
      if (movable) tell("new-order", placeOf(now[0].item), `the ${side} side prints the questions of the last attempt in the same order`);
    }
  }
  return found;
}
