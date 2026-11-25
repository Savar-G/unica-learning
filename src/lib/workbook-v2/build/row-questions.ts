// Chooses the questions of the rows of one shape that has a list: for the whole sheet when its rows can all be different,
// and otherwise for each side. The seeds of the rows and places decide; nothing else does.
import { canonicalJson, pick } from "../hash";
import type { Shape } from "../shapes";

/** A row of the bank on one side of a sheet, with the seed of each place and try. */
export interface AskedRow { id: string; shape: Shape; limits: unknown; items: number; seedOf(place: number, attempt: number): string }

interface Question { key: string; question: unknown }
interface Row extends AskedRow { list: Question[]; runs: Question[][] | null }
type Keys = ReadonlySet<string>;
type Chosen = Map<AskedRow, Question[]>;

const NONE: Keys = new Set();
/** How many choices of a row in order one search looks at. More than ten such rows on a sheet could need more. */
const MOST_TRIES = 20_000;

const asked = (question: unknown): Question => ({ key: canonicalJson(question), question });
const keysOf = (chosen: Chosen): string[] => [...chosen.values()].flat().map((q) => q.key);
const count = (questions: readonly Question[], keys: Keys): number => questions.filter((q) => keys.has(q.key)).length;

function prepared(row: AskedRow): Row {
  const runs = row.shape.orderedRuns?.(row.limits, row.items)?.map((run) => run.map(asked)) ?? null;
  const wrong = runs?.find((run) => run.length !== row.items);
  if (wrong) throw new Error(`the row "${row.id}" in order has ${wrong.length} questions and must have ${row.items}`);
  if (runs?.length === 0) throw new Error(`the row "${row.id}" in order has no ${row.items} questions`);
  return { ...row, list: (row.shape.list?.(row.limits) ?? []).map(asked), runs };
}

/** Whether each row can get its number of questions, all different and none taken: augmenting paths, with no seed. */
function canAllDiffer(rows: readonly Row[], taken: Keys): boolean {
  const owner = new Map<string, Row>();
  const give = (row: Row, seen: Set<string>): boolean => row.list.some(({ key }) => {
    if (taken.has(key) || seen.has(key)) return false;
    seen.add(key);
    const has = owner.get(key);
    if (has && !give(has, seen)) return false;
    owner.set(key, row);
    return true;
  });
  return rows.every((row) => Array.from({ length: row.items }).every(() => give(row, new Set())));
}

/** The runs of a row from the one that its seed names, those with the fewest stale questions first. */
function runsInOrder({ runs, seedOf }: Row, stale: Keys): Question[][] {
  if (!runs) return [];
  const start = pick(seedOf(0, 0), runs.length);
  const turned = [...runs.slice(start), ...runs.slice(0, start)];
  return stale.size === 0 ? turned : turned.map((run) => ({ run, old: count(run, stale) })).sort((a, b) => a.old - b.old).map(({ run }) => run);
}

/** The first choice of runs that share no question and leave a complete assignment for the mixed rows, or null. */
function chooseRuns(ordered: readonly Row[], mixed: readonly Row[], taken: Keys, stale: Keys): Chosen | null {
  const candidates = ordered.map((row) => runsInOrder(row, stale));
  const failed = new Set<string>();
  let tries = 0;
  const search = (index: number, used: Keys): Chosen | null => {
    if (index === ordered.length) return new Map();
    const state = `${index} ${[...used].sort().join()}`;
    if (failed.has(state)) return null;
    for (const run of candidates[index]) {
      if (++tries > MOST_TRIES) return null;
      if (count(run, used) > 0) continue;
      const next = new Set([...used, ...run.map((q) => q.key)]);
      const rest = candidates.slice(index + 1);
      // Each row in order that is left must have a free run, and all rows that are left enough questions.
      if (!rest.every((runs) => runs.some((other) => count(other, next) === 0)) || !canAllDiffer([...ordered.slice(index + 1), ...mixed], next)) continue;
      const found = search(index + 1, next);
      if (found) return found.set(ordered[index], run);
    }
    failed.add(state);
    return null;
  };
  return canAllDiffer([...ordered, ...mixed], taken) ? search(0, taken) : null;
}

interface Place { row: Row; index: number; question: Question | null }

/**
 * The questions of the mixed rows, the row with the fewest first: the one that the seed of the place gives, or one of
 * those that are left, or an augmenting path that moves earlier places. Stale questions come only after all others.
 */
function assignMixed(mixed: readonly Row[], taken: Keys, stale: Keys): Place[] {
  const places = [...mixed].sort((a, b) => a.list.length - b.list.length).flatMap((row) => Array.from({ length: row.items }, (_, index): Place => ({ row, index, question: null })));
  const owner = new Map<string, Place>();
  const own = (place: Place, question: Question): true => {
    owner.set(question.key, place);
    place.question = question;
    return true;
  };
  const move = (place: Place, banned: Keys, seen: Set<string>): boolean => {
    const { list, seedOf } = place.row;
    const start = pick(seedOf(place.index, 2), list.length);
    return [...list.slice(start), ...list.slice(0, start)].some((question) => {
      if (taken.has(question.key) || banned.has(question.key) || seen.has(question.key)) return false;
      seen.add(question.key);
      const has = owner.get(question.key);
      return (!has || move(has, banned, seen)) && own(place, question);
    });
  };
  const give = (place: Place, banned: Keys): boolean => {
    const { shape, limits, list, seedOf } = place.row;
    const isFree = ({ key }: Question) => !taken.has(key) && !banned.has(key) && !owner.has(key);
    const first = asked(shape.generate(limits, seedOf(place.index, 0)).question);
    if (isFree(first)) return own(place, first);
    const left = list.filter(isFree);
    return left.length > 0 ? own(place, left[pick(seedOf(place.index, 1), left.length)]) : move(place, banned, new Set());
  };
  const without = places.filter((place) => !give(place, stale));
  if (stale.size > 0) for (const place of without) give(place, NONE);
  return places;
}

function byRow(runs: Chosen, places: readonly Place[]): Chosen {
  const chosen: Chosen = new Map(runs);
  for (const { row, question } of places) if (question) chosen.set(row, [...(chosen.get(row) ?? []), question]);
  return chosen;
}

/** A choice with no question twice and none that is taken, or null when there is none. */
function chooseDifferent(rows: readonly Row[], taken: Keys, stale: Keys): Chosen | null {
  const mixed = rows.filter((row) => !row.runs);
  const runs = chooseRuns(rows.filter((row) => row.runs), mixed, taken, stale);
  return runs && byRow(runs, assignMixed(mixed, new Set([...taken, ...keysOf(runs)]), stale));
}

/** The rows of a side that cannot all be different: each row has no question twice, and as few are repeated as it finds. */
function chooseWithRepeats(rows: readonly Row[], stale: Keys): Chosen {
  const runs: Chosen = new Map();
  for (const row of rows.filter((r) => r.runs)) {
    const used = new Set(keysOf(runs));
    runs.set(row, runsInOrder(row, stale).reduce((best, run) => (count(run, used) < count(best, used) ? run : best)));
  }
  const places = assignMixed(rows.filter((row) => !row.runs), new Set(keysOf(runs)), stale);
  for (const place of places) {
    if (place.question) continue;
    const own = new Set(places.flatMap((p) => (p.row === place.row && p.question ? [p.question.key] : [])));
    const left = place.row.list.filter((q) => !own.has(q.key));
    place.question = left[pick(place.row.seedOf(place.index, 3), left.length)];
  }
  return byRow(runs, places);
}

/** The questions of each row of a sheet, in the order of its places. All rows are of one shape. */
export function chooseQuestions(sides: readonly (readonly AskedRow[])[]): Map<AskedRow, unknown[]> {
  const rows = sides.map((side) => side.map(prepared));
  const whole = chooseDifferent(rows.flat(), NONE, NONE);
  const used = new Set<string>();
  const found = whole ? [whole] : rows.map((side) => {
    const chosen = (used.size > 0 && chooseDifferent(side, used, NONE)) || chooseDifferent(side, NONE, used) || chooseWithRepeats(side, used);
    for (const key of keysOf(chosen)) used.add(key);
    return chosen;
  });
  const asks = new Map(rows.flatMap((side, s) => side.map((row, i) => [row as AskedRow, sides[s][i]] as const)));
  return new Map(found.flatMap((chosen) => [...chosen].map(([row, questions]) => [asks.get(row) ?? row, questions.map((q) => q.question)] as const)));
}
