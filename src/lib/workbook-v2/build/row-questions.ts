// Chooses the questions of the rows of one shape that has a list: for the whole sheet when its rows can all be different,
// and otherwise for each side. The seeds of the rows and places decide, and what the child met in earlier books: a
// question that the child has not seen comes first, then one seen longest ago. A sheet never repeats a question to avoid
// a seen one. A question of the last attempt prints in its swapped form when it can, and the sides after the first are
// chosen and counted with the questions of the sides before them as they print.
import { pick } from "../hash";
import type { Shape } from "../shapes";
import { questionKey } from "../shapes/shape";

/** A row of the bank on one side of a sheet, with the seed of each place and try. */
export interface AskedRow { id: string; shape: Shape; limits: unknown; items: number; seedOf(place: number, attempt: number): string }

interface Question { key: string; question: unknown }
interface Row extends AskedRow { list: Question[]; runs: Question[][] | null; front: boolean }
type Keys = ReadonlySet<string>;
type Chosen = Map<AskedRow, Question[]>;

const NONE: Keys = new Set();

/**
 * What the child met before, for the rows of one shape: how recent each question key is (more is more recent; a key that
 * is not there is unseen), and the questions of each row in the last attempt of the sheet, in order. `repeat` is false
 * for the first attempt of a sheet: the check of a book then compares the runs of a row in order by their shared
 * questions alone, so the build does too. Left out, it is true.
 */
export interface SeenBefore { recency: ReadonlyMap<string, number>; lastOfRow: ReadonlyMap<string, readonly string[]>; repeat?: boolean }
export const NOTHING_SEEN: SeenBefore = { recency: new Map(), lastOfRow: new Map() };

const sameKeys = (a: Keys, b: Keys): boolean => a.size === b.size && [...a].every((key) => b.has(key));

/**
 * The questions that each pass of a choice leaves out, the strictest first: the stale ones and every seen one, then the
 * stale ones and all but the oldest seen ones, and so on; then the stale ones alone, then the seen ones alone, then none.
 * With nothing seen, this is the stale ones and then none, as before history.
 */
function bansOf(stale: Keys, { recency }: SeenBefore): Keys[] {
  const since = [...new Set(recency.values())].sort((a, b) => a - b).map((oldest) => new Set([...recency].filter(([, r]) => r >= oldest).map(([key]) => key)));
  const all = [...since.map((seen) => new Set([...stale, ...seen])), stale, ...since, NONE];
  return all.filter((keys, i) => !all.slice(0, i).some((before) => sameKeys(before, keys)));
}

/** The questions that the child has not seen, or else those seen longest ago. */
function freshest(questions: readonly Question[], { recency }: SeenBefore): Question[] {
  const unseen = questions.filter((q) => !recency.has(q.key));
  if (unseen.length > 0 || questions.length === 0) return unseen;
  const oldest = Math.min(...questions.map((q) => recency.get(q.key) ?? 0));
  return questions.filter((q) => recency.get(q.key) === oldest);
}
/** How many choices of a row in order one search looks at. More than ten such rows on a sheet could need more. */
const MOST_TRIES = 20_000;

const asked = (shape: Shape) => (question: unknown): Question => ({ key: questionKey(shape, question), question });
const keysOf = (chosen: ReadonlyMap<AskedRow, Question[]>): string[] => [...chosen.values()].flat().map((q) => q.key);
const count = (questions: readonly Question[], keys: Keys): number => questions.filter((q) => keys.has(q.key)).length;

function prepared(row: AskedRow, front: boolean): Row {
  const runs = row.shape.orderedRuns?.(row.limits, row.items)?.map((run) => run.map(asked(row.shape))) ?? null;
  const wrong = runs?.find((run) => run.length !== row.items);
  if (wrong) throw new Error(`the row "${row.id}" in order has ${wrong.length} questions and must have ${row.items}`);
  if (runs?.length === 0) throw new Error(`the row "${row.id}" in order has no ${row.items} questions`);
  return { ...row, list: (row.shape.list?.(row.limits) ?? []).map(asked(row.shape)), runs, front };
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

/**
 * The runs of a row from the one that its seed names: those with the fewest stale questions first, then the fewest seen
 * ones, then runs different from the last attempt of the row, then those seen longest ago.
 */
function runsInOrder({ id, runs, seedOf }: Row, stale: Keys, seen: SeenBefore): Question[][] {
  if (!runs) return [];
  const start = pick(seedOf(0, 0), runs.length);
  const turned = [...runs.slice(start), ...runs.slice(0, start)];
  const last = seen.lastOfRow.get(id)?.join("\n");
  if (stale.size === 0 && seen.recency.size === 0 && last === undefined) return turned;
  const scoreOf = (run: Question[]) => [
    count(run, stale),
    run.filter((q) => seen.recency.has(q.key)).length,
    last !== undefined && run.map((q) => q.key).join("\n") === last ? 1 : 0,
    run.reduce((sum, q) => sum + (seen.recency.get(q.key) ?? -1) + 1, 0),
  ];
  const before = (a: number[], b: number[]) => a.findIndex((n, i) => n !== b[i]);
  return turned.map((run) => ({ run, score: scoreOf(run) })).sort((a, b) => { const i = before(a.score, b.score); return i < 0 ? 0 : a.score[i] - b.score[i]; }).map(({ run }) => run);
}

/** The first choice of runs that share no question, respect `ban` (and optionally avoid the last attempt's exact run), and leave a complete assignment for the mixed rows, or null. */
function chooseRuns(ordered: readonly Row[], mixed: readonly Row[], taken: Keys, stale: Keys, seen: SeenBefore, ban: Keys, avoidLast: boolean): Map<Row, Question[]> | null {
  const blocked = ban.size === 0 ? taken : new Set([...taken, ...ban]);
  const isLast = (row: Row, run: readonly Question[]) => {
    const last = seen.lastOfRow.get(row.id)?.join("\n");
    return last !== undefined && run.map((q) => q.key).join("\n") === last;
  };
  const candidates = ordered.map((row) => runsInOrder(row, stale, seen).filter((run) => (!avoidLast || !isLast(row, run)) && count(run, blocked) === 0));
  if (candidates.some((runs) => runs.length === 0)) return null;
  if (!canAllDiffer([...ordered, ...mixed], blocked)) return null;
  const failed = new Set<string>();
  let tries = 0;
  const search = (index: number, used: Keys): Map<Row, Question[]> | null => {
    if (index === ordered.length) return new Map();
    const state = `${index} ${[...used].sort().join()}`;
    if (failed.has(state)) return null;
    for (const run of candidates[index]) {
      if (++tries > MOST_TRIES) return null;
      if (count(run, used) > 0) continue;
      const next = new Set([...used, ...run.map((q) => q.key)]);
      const rest = candidates.slice(index + 1);
      // Each row in order that is left must have a free run, and all rows that are left enough questions outside `blocked`.
      if (!rest.every((runs) => runs.some((other) => count(other, next) === 0)) || !canAllDiffer([...ordered.slice(index + 1), ...mixed], next)) continue;
      const found = search(index + 1, next);
      if (found) return found.set(ordered[index], run);
    }
    failed.add(state);
    return null;
  };
  return search(0, blocked);
}

/**
 * How the check of a book (checks/repeat-rule.ts) compares a run of a row in order with the other runs of its table:
 * the questions that the other rows in order of its side (and of the front, for a row of the back) print too, then on a
 * repeat the questions that the child has seen, then whether it is the run of the last attempt. Less is better.
 */
interface RunCost { twice: number; seen: number; last: number }
const RUN_COSTS = ["twice", "seen", "last"] as const;
const beats = (a: RunCost, b: RunCost): boolean => RUN_COSTS.every((c) => a[c] <= b[c]) && RUN_COSTS.some((c) => a[c] < b[c]);
const lessThan = (a: RunCost, b: RunCost): boolean => { const c = RUN_COSTS.find((k) => a[k] !== b[k]); return c !== undefined && a[c] < b[c]; };
/** At most this many changes of a run: each one makes the sum of all counts smaller, so far fewer are ever needed. */
const MOST_CHANGES = 1_000;

function runCost(row: Row, run: readonly Question[], others: Keys, seen: SeenBefore): RunCost {
  const repeat = seen.repeat !== false;
  const last = repeat ? seen.lastOfRow.get(row.id)?.join("\n") : undefined;
  return {
    twice: count(run, others),
    seen: repeat ? run.filter((q) => seen.recency.has(q.key)).length : 0,
    last: last !== undefined && last !== "" && run.map((q) => q.key).join("\n") === last ? 1 : 0,
  };
}

/**
 * The runs that a row in order is compared with: those of the other rows in order of its side, and of the front for a
 * row of the back (`front` holds the runs of the front when only the back is chosen here).
 */
function othersOf(row: Row, runs: ReadonlyMap<Row, Question[]>, front: Keys): Keys {
  const keys = new Set(row.front ? [] : front);
  for (const [other, run] of runs) if (other !== row && (other.front || !row.front)) for (const q of run) keys.add(q.key);
  return keys;
}

/**
 * How many questions a side prints more than once, and how many of its questions the sheet prints more than once (on the
 * side or also on the front), for a choice of runs with the mixed rows that it gives them.
 */
type Repeats = (runs: ReadonlyMap<Row, Question[]>) => readonly [side: number, sheet: number];
type MixedOf = (runs: ReadonlyMap<Row, Question[]>, stale: Keys) => readonly Place[];
interface SidePrinting { earlier: Chosen; printed(chosen: Chosen): Chosen }

/**
 * The repeats of a side after the sides `earlier`, all as they print (`printed`): a question of the last attempt that
 * prints in its swapped form counts in that form, and it does not when this side prints that form.
 */
function repeatsAfter({ earlier, printed }: SidePrinting, own: Chosen) {
  const shown = printed(new Map([...earlier, ...own]));
  const keysOfRows = (rows: Iterable<AskedRow>) => [...rows].flatMap((row) => (shown.get(row) ?? []).map((q) => q.key));
  const keys = keysOfRows(own.keys());
  const earlierPrinted = keysOfRows(earlier.keys());
  const earlierKeys = new Set(earlierPrinted);
  const once = new Set(keys);
  const side = keys.length - once.size;
  const overlap = [...once].filter((key) => earlierKeys.has(key)).length;
  return { earlierKeys, side, overlap, sheet: side + overlap + earlierPrinted.length - earlierKeys.size };
}

/** A later choice can block a swap on the previous side. Retry the mixed rows against the questions that now print. */
function mixedAfter(runs: ReadonlyMap<Row, Question[]>, stale: Keys, assign: MixedOf, printing?: SidePrinting): readonly Place[] {
  let places = assign(runs, stale);
  if (!printing || stale.size === 0 || places.length === 0) return places;
  let avoid = stale;
  let repeats = repeatsAfter(printing, byRow(runs, places));
  while (repeats.overlap > 0 && !sameKeys(avoid, repeats.earlierKeys)) {
    avoid = repeats.earlierKeys;
    const next = assign(runs, avoid);
    const changed = repeatsAfter(printing, byRow(runs, next));
    // Each accepted change reduces at least one count and increases neither.
    if (changed.side > repeats.side || changed.sheet > repeats.sheet) break;
    if (changed.side === repeats.side && changed.sheet === repeats.sheet) break;
    places = next;
    repeats = changed;
  }
  return places;
}

const repeatsOf = (printing: SidePrinting, mixedOf: (runs: ReadonlyMap<Row, Question[]>) => readonly Place[]): Repeats => (runs) => {
  const { side, sheet } = repeatsAfter(printing, byRow(runs, mixedOf(runs)));
  return [side, sheet];
};

/**
 * Changes the run of a row in order that another legal run of its table beats: no worse on every count of `RunCost` and
 * better on one, with the other rows as they are. Of those, it takes the best by the counts in order, then the first in
 * the order of `runsInOrder` (so a run seen longer ago before one seen lately). This is the choice that the check of a
 * book wants, also when a row in order comes after the row that it shares questions with. With `repeats`, a change
 * that makes the side or the sheet repeat more questions (the mixed rows chosen again) is not taken, and the next best
 * run is tried: fewer repeats come before fewer seen questions. Each change makes the sum of the counts of all rows
 * smaller (the counts of the front never depend on the back), so it ends. A choice that no run beats stays as it is: a
 * book that passed the check prints the same.
 */
function settleRuns(runs: Map<Row, Question[]>, stale: Keys, seen: SeenBefore, front: Keys, legal: (row: Row, run: readonly Question[]) => boolean, repeats?: Repeats): Map<Row, Question[]> {
  const rows = [...runs.keys()];
  const options = new Map(rows.map((row) => [row, runsInOrder(row, stale, seen)]));
  for (let changes = 0, changed = true; changed && changes < MOST_CHANGES;) {
    changed = false;
    for (const row of rows) {
      const kept = runs.get(row) ?? [];
      const others = othersOf(row, runs, front);
      const now = runCost(row, kept, others, seen);
      let before: readonly [number, number] | null = null;
      const noMore = (run: Question[]): boolean => {
        if (!repeats) return true;
        before ??= repeats(runs);
        runs.set(row, run);
        const [side, sheet] = repeats(runs);
        runs.set(row, kept);
        return side <= before[0] && sheet <= before[1];
      };
      const better = (options.get(row) ?? []).map((run) => ({ run, cost: runCost(row, run, others, seen) })).filter(({ cost }) => beats(cost, now));
      better.sort((a, b) => (lessThan(a.cost, b.cost) ? -1 : lessThan(b.cost, a.cost) ? 1 : 0));
      const best = better.find(({ run }) => legal(row, run) && noMore(run));
      if (best && changes < MOST_CHANGES) { runs.set(row, best.run); changes++; changed = true; }
    }
  }
  return runs;
}

interface Place { row: Row; index: number; question: Question | null }

/**
 * The questions of the mixed rows, the row with the fewest first: the one that the seed of the place gives, or one of
 * those that are left, or an augmenting path that moves earlier places. Stale questions come only after all others, and
 * seen ones after unseen ones, the oldest first (`bansOf`).
 */
function assignMixed(mixed: readonly Row[], taken: Keys, stale: Keys, seen: SeenBefore): Place[] {
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
    const first = asked(shape)(shape.generate(limits, seedOf(place.index, 0)).question);
    if (isFree(first)) return own(place, first);
    const left = list.filter(isFree);
    return left.length > 0 ? own(place, left[pick(seedOf(place.index, 1), left.length)]) : move(place, banned, new Set());
  };
  let without = places;
  for (const banned of bansOf(stale, seen)) if (without.length > 0) without = without.filter((place) => !give(place, banned));
  return places;
}

function byRow(runs: ReadonlyMap<AskedRow, Question[]>, places: readonly Place[]): Chosen {
  const chosen: Chosen = new Map(runs);
  for (const { row, question } of places) if (question) chosen.set(row, [...(chosen.get(row) ?? []), question]);
  return chosen;
}

/**
 * The first choice of runs under the strictest `bansOf` tier that has one (zero seen items when possible, then
 * oldest-seen fallback), first without the runs of the last attempt, or null.
 */
function firstRuns(ordered: readonly Row[], mixed: readonly Row[], taken: Keys, stale: Keys, seen: SeenBefore): Map<Row, Question[]> | null {
  const hasLast = ordered.some((row) => seen.lastOfRow.has(row.id));
  for (const avoidLast of hasLast ? [true, false] : [false]) {
    for (const ban of bansOf(stale, seen)) {
      const runs = chooseRuns(ordered, mixed, taken, stale, seen, ban, avoidLast);
      if (runs) return runs;
    }
  }
  return null;
}

/** A run must differ from the other runs, and the mixed rows must still have distinct choices. */
const keepsDifferent = (runs: ReadonlyMap<Row, Question[]>, mixed: readonly Row[], taken: Keys, barred: Keys) => (row: Row, run: readonly Question[]): boolean => {
  const others = new Set([...runs].flatMap(([other, own]) => (other === row ? [] : own.map((q) => q.key))));
  return count(run, barred) === 0 && count(run, others) === 0 && canAllDiffer(mixed, new Set([...taken, ...others, ...run.map((q) => q.key)]));
};

/**
 * A choice with no question twice and none that is taken, or null when there is none. Takes the first complete assignment
 * found under the strictest feasible `bansOf` tier (`firstRuns`) rather than exhaustively maximizing partial unseen counts
 * across all run combinations. Then no row in order keeps a run that another run beats while the choice stays all
 * different (`settleRuns`): a row in order wants the fewest seen questions, not those seen longest ago. `front` holds
 * the runs of the front when only the back is chosen. The questions to avoid (`stale`: those of the front) are not
 * barred, so a change of run must not make the sheet repeat more of them (`repeatsOf` counts); with none, the choice
 * repeats nothing.
 */
function chooseDifferent(rows: readonly Row[], taken: Keys, stale: Keys, seen: SeenBefore, front: Keys = NONE, printing?: SidePrinting): Chosen | null {
  const ordered = rows.filter((row) => row.runs);
  const mixed = rows.filter((row) => !row.runs);
  const assign: MixedOf = (runs, avoid) => assignMixed(mixed, new Set([...taken, ...keysOf(runs)]), avoid, seen);
  const mixedOf = (runs: ReadonlyMap<Row, Question[]>) => mixedAfter(runs, stale, assign, printing);
  if (ordered.length === 0) return canAllDiffer(mixed, taken) ? byRow(new Map(), mixedOf(new Map())) : null;
  const runs = firstRuns(ordered, mixed, taken, stale, seen);
  if (!runs) return null;
  // On a back side with a printed front, a run may take a raw front key when the final printed sheet allows it.
  const legal = keepsDifferent(runs, mixed, taken, printing ? NONE : taken);
  settleRuns(runs, stale, seen, front, legal, printing ? repeatsOf(printing, mixedOf) : undefined);
  return byRow(runs, mixedOf(runs));
}

/** The questions of the mixed rows of a side that cannot be all different: as `assignMixed`, then a place with none left takes one again. */
function mixedWithRepeats(mixed: readonly Row[], runs: ReadonlyMap<Row, Question[]>, stale: Keys, seen: SeenBefore): Place[] {
  const places = assignMixed(mixed, new Set(keysOf(runs)), stale, seen);
  for (const place of places) {
    if (place.question) continue;
    const own = new Set(places.flatMap((p) => (p.row === place.row && p.question ? [p.question.key] : [])));
    const left = freshest(place.row.list.filter((q) => !own.has(q.key)), seen);
    place.question = left[pick(place.row.seedOf(place.index, 3), left.length)];
  }
  return places;
}

/**
 * The rows of a side that cannot all be different: each row has no question twice, and as few are repeated as it finds.
 * Each row in order takes a run in turn; then a row that an earlier row took a better run from gets another one, and so
 * on (`settleRuns`), so the rows after a row count too, when the side and the sheet repeat no more questions for it.
 */
function chooseWithRepeats(rows: readonly Row[], stale: Keys, seen: SeenBefore, front: Keys, printing: SidePrinting): Chosen {
  const runs = new Map<Row, Question[]>();
  for (const row of rows.filter((r) => r.runs)) {
    const used = new Set(keysOf(runs));
    runs.set(row, runsInOrder(row, stale, seen).reduce((best, run) => (count(run, used) < count(best, used) ? run : best)));
  }
  const mixed = rows.filter((row) => !row.runs);
  const assign: MixedOf = (chosen, avoid) => mixedWithRepeats(mixed, chosen, avoid, seen);
  const mixedOf = (chosen: ReadonlyMap<Row, Question[]>) => mixedAfter(chosen, stale, assign, printing);
  settleRuns(runs, stale, seen, front, () => true, repeatsOf(printing, mixedOf));
  return byRow(runs, mixedOf(runs));
}

/**
 * The questions as they print: a question of the last attempt (`before`) prints in its swapped form (7 × 5 for 5 × 7)
 * when the limits of its row allow that form, the last attempt did not print that form, and the sheet does not print it
 * yet. A row in order keeps the order of its table. The rows go in the order of the sheet, the front first.
 */
function printedForms(order: readonly Row[], chosen: Chosen, before: Keys): Chosen {
  if (before.size === 0) return chosen;
  const onSheet = new Set(keysOf(chosen));
  const shown: Chosen = new Map(chosen);
  for (const row of order) {
    const { shape, limits, runs } = row;
    const questions = chosen.get(row);
    if (!questions || runs || !shape.swapped) continue;
    shown.set(row, questions.map((question) => {
      const turned = before.has(question.key) ? shape.swapped?.(question.question, limits) : null;
      if (!turned?.inLimits) return question;
      const swapped = asked(shape)(turned.question);
      if (before.has(swapped.key) || onSheet.has(swapped.key)) return question;
      onSheet.add(swapped.key);
      return swapped;
    }));
  }
  return shown;
}

/**
 * The questions of each row of a sheet, in the order of its places, as they print (`printedForms`). All rows are of one
 * shape. A side after the first is chosen against the sides before it as they print: all different from their printed
 * questions, else all different from their chosen questions (a swapped form that this side then takes keeps its front
 * question unswapped), else avoiding their printed questions; and its rows in order count the repeats of the whole sheet
 * as it prints. So a back row in order does not avoid a front question that prints in its swapped form.
 */
export function chooseQuestions(sides: readonly (readonly AskedRow[])[], seen: SeenBefore = NOTHING_SEEN): Map<AskedRow, unknown[]> {
  const rows = sides.map((side, s) => side.map((row) => prepared(row, s === 0)));
  const before: Keys = new Set([...seen.lastOfRow.values()].flat());
  const printed = (chosen: Chosen) => printedForms(rows.flat(), chosen, before);
  const whole = chooseDifferent(rows.flat(), NONE, NONE, seen);
  let earlier: Chosen = whole ?? new Map();
  const front = new Set<string>();
  if (!whole) for (const side of rows) {
    const used = new Set(keysOf(printed(earlier)));
    const chosenKeys = new Set(keysOf(earlier));
    const printing = { earlier, printed };
    const chosen = (used.size > 0 && (chooseDifferent(side, used, NONE, seen, front) || (!sameKeys(used, chosenKeys) && chooseDifferent(side, chosenKeys, NONE, seen, front, printing))))
      || chooseDifferent(side, NONE, used, seen, front, printing) || chooseWithRepeats(side, used, seen, front, printing);
    earlier = new Map([...earlier, ...chosen]);
    for (const [row, questions] of chosen) if ((row as Row).runs) for (const q of questions) front.add(q.key);
  }
  const asks = new Map(rows.flatMap((side, s) => side.map((row, i) => [row as AskedRow, sides[s][i]] as const)));
  return new Map([...printed(earlier)].map(([row, questions]) => [asks.get(row) ?? row, questions.map((q) => q.question)] as const));
}
