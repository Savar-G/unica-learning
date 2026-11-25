// The questions of two numbers in columns (add.column and sub.column), counted and found with no list of them: there are
// 90,899,091 and 49,995,000. The columns are filled from the ones up. All that the columns so far can change in the ones
// above is one number, a `Low`, and each Low knows in how many ways the columns reach it. Digits that change a Low in the
// same way are one `Move`.
import { emptyProblem, readLimitFields, type Range } from "./shape";

export type Word = "never" | "allowed" | "only";
export const WORD: readonly Word[] = ["never", "allowed", "only"];
export const NOT_ONLY: readonly Word[] = ["never", "allowed"];

export interface ColumnQuestion { a: number; b: number }

/** A value for each of the tens, hundreds and thousands, or for each of the ones, tens and hundreds. */
export type Three<T> = readonly [T, T, T];

/** The limits of both shapes in one form. A pass is a carry into a column, or a borrow from it; the last column makes none. */
export interface ColumnRules {
  sign: "+" | "-";
  aDigits: Range;
  bDigits: Range;
  a: Range;
  b: Range;
  result: Range;
  passes: Range;
  /** The passes of the tens, the hundreds and the thousands. A column that is not there has none. */
  passAt: Three<Range>;
  /** A pass that makes the next one. */
  chain: Word;
  /** A zero in the ones, the tens and the hundreds of each number. */
  aZeros: Three<Word>;
  bZeros: Three<Word>;
  /** A zero between the first digit and the ones of the sum. */
  zeroInside: Word;
  /** A borrow that a zero of the top number must get first from the place above it, and one that two zeros must get. */
  acrossZero: Word;
  acrossTwoZeros: Word;
  /** The same digit twice in a column. */
  equalDigits: Word;
  /** A difference with fewer digits than the top number. */
  shorter: Word;
}

/** What the difficulty needs to know of a question, next to its size. The top number is never the one with fewer digits. */
export interface ColumnKind { digits: number; passes: number; chain: boolean; zerosCrossed: number }

const MOST_DIGITS = 4;
const within = (n: number, r: Range) => n >= r.min && n <= r.max;
const meets = (word: Word, has: boolean) => word === "allowed" || (word === "only") === has;

/** The bits of a Low: first what the columns have done, then what the bounds of the three numbers say of the low digits. */
type Low = number;
const PASS = 1;
const ONE_PASS = 2;
const PASSES = 3 * ONE_PASS;
const CHAIN = 8;
const ONE_ZERO = 16;
const MOST_ZEROS = 3 * ONE_ZERO;
const ONE_RUN = 64;
const RUN = 3 * ONE_RUN;
const EQUAL = 256;
/** The lower number has no more digits, and how many it has. */
const CLOSED = 512;
const ONE_LENGTH = 1024;
const LENGTH = 3 * ONE_LENGTH;
const [A_LEAST, A_MOST, B_LEAST, B_MOST, R_LEAST, R_MOST] = [1 << 12, 1 << 13, 1 << 14, 1 << 15, 1 << 16, 1 << 17];
const B_BOUNDS = B_LEAST | B_MOST;
const BOUNDS = A_LEAST | A_MOST | B_BOUNDS | R_LEAST | R_MOST;
/** A column that breaks a limit. */
const NONE = -1;

const passesOf = (low: Low) => (low & PASSES) / ONE_PASS;
const mostZerosOf = (low: Low) => (low & MOST_ZEROS) / ONE_ZERO;
const runOf = (low: Low) => (low & RUN) / ONE_RUN;

/** Only these parts of a Low are told apart, so that a question is found in few steps. */
function partsOf(rules: ColumnRules, forKinds: boolean): number {
  const crossings = forKinds || rules.acrossZero === "only" || rules.acrossTwoZeros === "only";
  return PASS | CLOSED | BOUNDS
    | (forKinds || rules.passes.min > 0 || rules.passes.max < MOST_DIGITS - 1 ? PASSES : 0)
    | (forKinds || rules.chain === "only" ? CHAIN : 0)
    | (crossings ? MOST_ZEROS : 0)
    | (crossings || rules.acrossTwoZeros === "never" ? RUN : 0)
    | (rules.equalDigits === "only" ? EQUAL : 0)
    | (forKinds ? LENGTH : 0);
}

/** An end of a range that stops no number is one that no digit can break. */
const NO_LEAST = -1;
const NO_MOST = 10 ** (MOST_DIGITS + 2);
const widened = (range: Range, possible: Range): Range =>
  ({ min: range.min <= possible.min ? NO_LEAST : range.min, max: range.max >= possible.max ? NO_MOST : range.max });
/** The numbers with these numbers of digits. */
const withDigits = ({ min, max }: Range): Range => ({ min: 10 ** (min - 1), max: 10 ** max - 1 });

const lengthOf = (n: number) => String(n).length;
/** The range that both allow. */
const both = (one: Range, other: Range): Range => ({ min: Math.max(one.min, other.min), max: Math.min(one.max, other.max) });

/** The same questions, with no number of digits that a range does not have, and no end of a range that stops nothing. */
function narrowed(rules: ColumnRules): ColumnRules {
  const { sign, a, b, result } = rules;
  const aDigits = both(rules.aDigits, { min: lengthOf(a.min), max: lengthOf(a.max) });
  const bDigits = both(rules.bDigits, { min: lengthOf(b.min), max: Math.min(aDigits.max, lengthOf(b.max)) });
  const results = sign === "+" ? { min: a.min + b.min, max: a.max + b.max } : { min: Math.max(0, a.min - b.max), max: a.max - b.min };
  return { ...rules, aDigits, bDigits, a: widened(a, withDigits(aDigits)), b: widened(b, withDigits(bDigits)), result: widened(result, results) };
}

/** Where a digit of the lower number stands: below its first digit, at it, or past it. */
type Foot = "inner" | "first" | "none";
interface Column { place: number; isLast: boolean; foot: Foot }

/** The columns that a place can be. The top number never has fewer digits than the lower one. */
function columnsAt({ aDigits, bDigits, aZeros, bZeros, passAt }: ColumnRules, place: number): Column[] {
  const count = place + 1;
  const noneOnly = (zeros: Three<Word>) => zeros.slice(place).every((word) => word !== "only");
  const lasts = [
    ...(within(count, aDigits) && noneOnly(aZeros) && passAt.slice(place).every((r) => r.min === 0) ? [true] : []),
    ...(count < aDigits.max ? [false] : []),
  ];
  const feet: Foot[] = [
    ...(count < bDigits.max ? ["inner" as const] : []),
    ...(within(count, bDigits) && noneOnly(bZeros) ? ["first" as const] : []),
    "none",
  ];
  return lasts.flatMap((isLast) => feet.flatMap((foot) => (isLast && foot === "inner" ? [] : [{ place, isLast, foot }])));
}

const digitsFrom = (first: number) => Array.from({ length: 10 - first }, (_, i) => first + i);
const [ANY, NOT_ZERO, NO_DIGIT] = [digitsFrom(0), digitsFrom(1), [0]];

/** The part of a bound that a column compares: its digit, or all that is left of it at the first digit of the number. */
const partOf = (bound: number, place: number, isFirst: boolean): number => {
  const rest = Math.floor(bound / 10 ** place);
  return isFirst ? rest : rest % 10;
};
/** The parts of both ends of a range that a column compares, and the two bits that say what the digits up to here are. */
interface Bound { least: number; most: number; leastBit: number; mostBit: number }
const boundOf = ({ min, max }: Range, place: number, isFirst: boolean, leastBit: number, mostBit: number): Bound =>
  ({ least: min === NO_LEAST ? min : partOf(min, place, isFirst), most: max === NO_MOST ? max : partOf(max, place, isFirst), leastBit, mostBit });
const isFree = ({ least, most }: Bound): boolean => least === NO_LEAST && most === NO_MOST;
/** A digit that is not the one of the bound decides its bit. */
const decided = (value: number, { least, most, leastBit, mostBit }: Bound): number => (value > least ? leastBit : 0) | (value < most ? mostBit : 0);
/** The same digit keeps what the digits below said. */
const same = (value: number, { least, most, leastBit, mostBit }: Bound): number => (value === least ? leastBit : 0) | (value === most ? mostBit : 0);
/** Past the first digit of the lower number its bounds hold. */
const PAST: Bound = { least: NO_LEAST, most: NO_MOST, leastBit: B_LEAST, mostBit: B_MOST };

/** A question as one number: first by the sum of its two numbers, then by the top number. Columns add their keys. */
const KEY = 10 ** (MOST_DIGITS + 1);
const keyOf = (a: number, b: number): number => (a + b) * KEY + a;
const sizeOf = (key: number): number => Math.floor(key / KEY);

/** Pairs of digits, as 10 × top + lower, that are the same in all that a column asks of them, with the first of them. */
interface Cell { x: number; y: number; pairs: number[]; least: number; most: number }

/** Digits that change each Low with this carry (or borrow) in the same way, and how many pairs they are. `set` and `keep` are bits of a Low. */
interface Move { set: number; keep: number; isLast: boolean; cells: Cell[]; pairs: number; least: number; most: number }
/** The moves of one place, for each kind of Low that they go on: what it passes, and whether the lower number has more digits. */
type Moves = Move[][];
const sideOf = (got: number, isClosed: boolean): number => got + (isClosed ? 2 : 0);
/** Bits next to those of a Low: the column makes a pass, and the borrow from it goes over a zero. */
const [MAKES_PASS, CROSSES] = [1 << 18, 1 << 19];
const ALWAYS_KEPT = CHAIN | EQUAL | CLOSED | LENGTH;

/** What a column writes: its digit, or all that is left at the last column. */
const valueOf = (isSum: boolean, got: number, x: number, y: number) => (isSum ? x + y + got : x - y - got);
const writtenOf = (value: number, isLast: boolean) => (isLast ? value : (value + 10) % 10);

const digitsFor = (x: readonly number[], y: readonly number[]): Cell[] =>
  x.flatMap((top) => y.map((low) => ({ x: top, y: low, pairs: [top * 10 + low], least: keyOf(top, low), most: keyOf(top, low) })));

/** The cells with all pairs apart, for columns that compare a digit with a bound. */
const APART = [false, true].map((isLast) => ({ inner: digitsFor(isLast ? NOT_ZERO : ANY, ANY), first: digitsFor(isLast ? NOT_ZERO : ANY, NOT_ZERO), none: digitsFor(isLast ? NOT_ZERO : ANY, NO_DIGIT) }));

/** The cells of a column that compares nothing: one for each way in which the rules can tell two digits apart. */
function together(cells: readonly Cell[], isSum: boolean, got: number, isLast: boolean): Cell[] {
  const kinds = new Map<string, Cell>();
  for (const cell of cells) {
    const { x, y } = cell;
    const value = valueOf(isSum, got, x, y);
    const kind = [value >= 10, value < 0, value === 0, writtenOf(value, isLast) % 10 === 0, x === 0, y === 0, x === y, x + y === 9].map(Number).join("");
    const known = kinds.get(kind);
    kinds.set(kind, known ? { ...known, pairs: [...known.pairs, ...cell.pairs], least: Math.min(known.least, cell.least), most: Math.max(known.most, cell.most) } : cell);
  }
  return [...kinds.values()];
}
const TOGETHER = [true, false].map((isSum) => [0, 1].map((got) => APART.map((feet, last) => {
  const cells = (foot: Foot) => together(feet[foot], isSum, got, last === 1);
  return { inner: cells("inner"), first: cells("first"), none: cells("none") };
})));

/** The bits that two digits set in a Low that passes `got` to them, with no look at the bounds, or NONE when they break a limit. */
function bitsOf(rules: ColumnRules, { place, isLast, foot }: Column, got: number, x: number, y: number): number {
  const isSum = rules.sign === "+";
  const value = valueOf(isSum, got, x, y);
  const passes = isSum ? value >= 10 : value < 0;
  const isPass = passes && !isLast;
  if (isLast ? passes && !isSum : !within(passes ? 1 : 0, rules.passAt[place])) return NONE;
  if (isLast && !meets(rules.shorter, place > 0 && value === 0)) return NONE;
  if (isSum && place > 0 && writtenOf(value, isLast) % 10 === 0 && rules.zeroInside === "never") return NONE;
  const isEqual = foot !== "none" && x === y;
  const chain = got === 1 && isPass && (isSum ? x + y === 9 : x === 0 || x === y);
  const crosses = !isSum && got === 1 && x === 0;
  if ((isEqual && rules.equalDigits === "never") || (chain && rules.chain === "never") || (crosses && rules.acrossZero === "never")) return NONE;
  return (passes ? PASS : 0) | (chain ? CHAIN : 0) | (isEqual ? EQUAL : 0) | (foot === "first" ? CLOSED | place * ONE_LENGTH : 0) | (isPass ? MAKES_PASS : 0) | (crosses ? CROSSES : 0);
}

/** The moves of one place. */
function movesAt(rules: ColumnRules, kept: number, place: number): Moves {
  const bits = kept | MAKES_PASS | CROSSES;
  const sides = [0, 1, 2, 3].map(() => new Map<number, Move>());
  for (const column of columnsAt(rules, place)) {
    const { isLast, foot } = column;
    const a = boundOf(rules.a, place, isLast, A_LEAST, A_MOST);
    const b = foot === "none" ? PAST : boundOf(rules.b, place, foot === "first", B_LEAST, B_MOST);
    const result = boundOf(rules.result, place, isLast, R_LEAST, R_MOST);
    const isFreeColumn = isFree(a) && isFree(b) && isFree(result);
    for (let got = 0; got <= (place === 0 ? 0 : 1); got++) {
      const moves = sides[sideOf(got, foot === "none")];
      for (const cell of isFreeColumn ? TOGETHER[rules.sign === "+" ? 0 : 1][got][isLast ? 1 : 0][foot] : APART[isLast ? 1 : 0][foot]) {
        const { x, y } = cell;
        if (!isLast && !meets(rules.aZeros[place], x === 0)) continue;
        if (foot === "inner" && !meets(rules.bZeros[place], y === 0)) continue;
        const made = bitsOf(rules, column, got, x, y);
        if (made === NONE) continue;
        const written = writtenOf(valueOf(rules.sign === "+", got, x, y), isLast);
        const set = (made | decided(x, a) | decided(y, b) | decided(written, result)) & bits;
        const keep = (ALWAYS_KEPT | same(x, a) | same(y, b) | same(written, result)) & bits;
        // The bits of `keep` that are not always kept are those of the bounds, above the first 12.
        const id = (set * 64 + (keep >> 12)) * 2 + (isLast ? 1 : 0);
        const [pairs, least, most] = [cell.pairs.length, cell.least * 10 ** place, cell.most * 10 ** place];
        const known = moves.get(id);
        if (!known) moves.set(id, { set, keep, isLast, cells: [cell], pairs, least, most });
        else {
          known.cells.push(cell);
          known.pairs += pairs;
          known.least = Math.min(known.least, least);
          known.most = Math.max(known.most, most);
        }
      }
    }
  }
  return sides.map((moves) => [...moves.values()]);
}

/** Whether the question that ends in this Low meets the limits that no column alone decides. */
const isWhole = (rules: ColumnRules, low: Low): boolean =>
  (low & BOUNDS) === BOUNDS && within(passesOf(low), rules.passes) && meets(rules.chain, (low & CHAIN) !== 0) && meets(rules.acrossZero, mostZerosOf(low) > 0)
  && meets(rules.acrossTwoZeros, mostZerosOf(low) > 1) && meets(rules.equalDigits, (low & EQUAL) !== 0);

const movesOn = (moves: Moves, low: Low): Move[] => moves[sideOf(low & PASS, (low & CLOSED) !== 0)];

/** The Low that a move makes of a Low, or NONE. */
function after(rules: ColumnRules, kept: number, low: Low, move: Move): Low {
  const passes = passesOf(low) + ((move.set & MAKES_PASS) !== 0 ? 1 : 0);
  const run = (move.set & CROSSES) !== 0 ? runOf(low) + 1 : 0;
  if (passes > rules.passes.max || (run > 1 && rules.acrossTwoZeros === "never")) return NONE;
  const made = (low & move.keep) | move.set | passes * ONE_PASS | Math.max(mostZerosOf(low), run) * ONE_ZERO | run * ONE_RUN;
  // The lower number is whole at its first digit: from there on its bounds must hold.
  if ((made & CLOSED) !== 0 && (made & B_BOUNDS) !== B_BOUNDS) return NONE;
  return move.isLast && !isWhole(rules, made) ? NONE : made & kept;
}

/** How many ways the columns reach a Low, and the smallest and the largest of them by `keyOf`. */
interface Group { ways: number; least: number; most: number }

/** For each place: its moves, the groups of the columns below it, and the groups of the questions that end at it. */
interface Places { rules: ColumnRules; kept: number; moves: Moves[]; below: Map<Low, Group>[]; whole: Map<Low, Group>[] }

function placesOf(given: ColumnRules, forKinds: boolean): Places {
  const rules = narrowed(given);
  const kept = partsOf(rules, forKinds);
  const moves: Moves[] = [];
  const below: Map<Low, Group>[] = [new Map([[BOUNDS, { ways: 1, least: 0, most: 0 }]])];
  const whole: Map<Low, Group>[] = [];
  for (let place = 0; place < rules.aDigits.max; place++) {
    const [next, ends] = [new Map<Low, Group>(), new Map<Low, Group>()];
    moves.push(movesAt(rules, kept, place));
    for (const [low, group] of below[place]) {
      for (const move of movesOn(moves[place], low)) {
        const made = after(rules, kept, low, move);
        if (made === NONE) continue;
        const groups = move.isLast ? ends : next;
        const [ways, least, most] = [group.ways * move.pairs, group.least + move.least, group.most + move.most];
        const known = groups.get(made);
        if (!known) groups.set(made, { ways, least, most });
        else {
          known.ways += ways;
          known.least = Math.min(known.least, least);
          known.most = Math.max(known.most, most);
        }
      }
    }
    below.push(next);
    whole.push(ends);
  }
  return { rules, kept, moves, below, whole };
}

const countOf = (whole: Places["whole"]): number => whole.reduce((sum, ends) => [...ends.values()].reduce((n, group) => n + group.ways, sum), 0);

export const countQuestions = (rules: ColumnRules): number => countOf(placesOf(rules, false).whole);

/** One question: `choose` gets how many there are, and gives a place in their order. */
export function chooseQuestion(given: ColumnRules, choose: (count: number) => number): ColumnQuestion {
  const places = placesOf(given, false);
  const { rules, kept, moves, below } = places;
  let left = choose(countOf(places.whole));
  const question = { a: 0, b: 0 };
  /** Takes the digits at a place that make a wanted Low. It gives the Low below them, or NONE when the question is further on. */
  const take = (place: number, isWanted: (move: Move, made: Low) => boolean): Low => {
    for (const [low, { ways }] of below[place]) {
      for (const move of movesOn(moves[place], low)) {
        const made = after(rules, kept, low, move);
        if (made === NONE || !isWanted(move, made)) continue;
        if (left >= ways * move.pairs) {
          left -= ways * move.pairs;
          continue;
        }
        const pair = move.cells.flatMap((cell) => cell.pairs)[Math.floor(left / ways)];
        left %= ways;
        question.a += Math.floor(pair / 10) * 10 ** place;
        question.b += (pair % 10) * 10 ** place;
        return low;
      }
    }
    return NONE;
  };
  for (let last = 0; last < moves.length; last++) {
    let low = take(last, (move) => move.isLast);
    if (low === NONE) continue;
    for (let place = last - 1; place >= 0; place--) {
      const wanted = low;
      low = take(place, (move, made) => !move.isLast && made === wanted);
    }
    return question;
  }
  throw new Error("there is no question at this place");
}

/** The place of a question in the order of `chooseQuestion`, or -1 when it does not meet the limits. */
export function placeOfQuestion(given: ColumnRules, { a, b }: ColumnQuestion): number {
  const { rules, kept, moves, below, whole } = placesOf(given, false);
  const last = lengthOf(a) - 1;
  if (last >= moves.length) return -1;
  // From the ones up, where the question stands in the group that its columns so far are in.
  let [low, inGroup] = [BOUNDS, 0];
  for (let place = 0; place <= last; place++) {
    const pair = (Math.floor(a / 10 ** place) % 10) * 10 + (Math.floor(b / 10 ** place) % 10);
    const isClosed = place >= lengthOf(b) - 1;
    const holds = (move: Move) => move.isLast === (place === last) && (((move.set | low) & CLOSED) !== 0) === isClosed && move.cells.some((cell) => cell.pairs.includes(pair));
    const taken = movesOn(moves[place], low).find((move) => holds(move) && after(rules, kept, low, move) !== NONE);
    if (!taken) return -1;
    const next = after(rules, kept, low, taken);
    inGroup += taken.cells.flatMap((cell) => cell.pairs).indexOf(pair) * (below[place].get(low)?.ways ?? 0);
    before: for (const [other, { ways }] of below[place]) {
      for (const move of movesOn(moves[place], other)) {
        if (other === low && move === taken) break before;
        const made = after(rules, kept, other, move);
        if (made !== NONE && move.isLast === taken.isLast && (move.isLast || made === next)) inGroup += ways * move.pairs;
      }
    }
    low = next;
  }
  return countOf(whole.slice(0, last)) + inGroup;
}

const kindOf = (low: Low, place: number): ColumnKind =>
  ({ digits: place + 1, passes: passesOf(low), chain: (low & CHAIN) !== 0, zerosCrossed: mostZerosOf(low) });

/**
 * From the first difference on: more digits in the longer number, then more carries or borrows, then one of them that
 * makes the next, then a borrow across one zero, then across two, then the larger two numbers together.
 */
export const scoreOf = ({ digits, passes, chain, zerosCrossed }: ColumnKind, { a, b }: ColumnQuestion): number =>
  (((digits * 4 + passes) * 2 + (chain ? 1 : 0)) * 3 + zerosCrossed) * 20_000 + a + b;

/** The scores of the easiest and the hardest question. */
export function scoreRange(rules: ColumnRules): { easiest: number; hardest: number } {
  let [easiest, hardest] = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  placesOf(rules, true).whole.forEach((ends, place) => ends.forEach(({ least, most }, low) => {
    const kind = kindOf(low, place);
    easiest = Math.min(easiest, scoreOf(kind, { a: sizeOf(least), b: 0 }));
    hardest = Math.max(hardest, scoreOf(kind, { a: sizeOf(most), b: 0 }));
  }));
  return { easiest, hardest };
}

/**
 * The question with the most places in a printed row, the sign counted too. Of those the largest, with the larger top
 * number. A sum with a digit more is larger than the sums without, so the largest has the most places in its answer too.
 */
export function widestQuestion(rules: ColumnRules): ColumnQuestion {
  let [places, key] = [0, 0];
  placesOf(rules, true).whole.forEach((ends, place) => ends.forEach(({ most }, low) => {
    const wide = Math.max(place + 1, 2 + (low & LENGTH) / ONE_LENGTH);
    if (wide > places || (wide === places && most > key)) [places, key] = [wide, most];
  }));
  return { a: key % KEY, b: sizeOf(key) - (key % KEY) };
}

/** The limits of a shape, read and counted, or what is wrong with them. */
export function readColumnLimits<L>(
  raw: unknown, ranges: Readonly<Record<string, Range>>, words: Readonly<Record<string, readonly Word[]>>, rulesOf: (limits: L) => ColumnRules,
): { ok: true; limits: L } | { ok: false; problem: string } {
  const read = readLimitFields(raw, ranges, words);
  if (typeof read === "string") return { ok: false, problem: read };
  const count = (limits: Record<string, unknown>) => countQuestions(rulesOf(limits as L));
  if (count(read) > 0) return { ok: true, limits: read as L };
  return { ok: false, problem: emptyProblem(read, ranges, words, count) };
}

/** The limits that both shapes share, as ranges and words. */
export const NUMBER_RANGES = { aDigits: { min: 1, max: MOST_DIGITS }, bDigits: { min: 1, max: MOST_DIGITS }, a: { min: 1, max: 9999 }, b: { min: 1, max: 9999 } };
export const ZERO_WORDS = { aZeroInOnes: WORD, aZeroInTens: WORD, aZeroInHundreds: WORD, bZeroInOnes: WORD, bZeroInTens: WORD, bZeroInHundreds: WORD };
export interface NumberLimits {
  /** How many digits each number has. The lower one never has more than the top one. */
  aDigits: Range;
  bDigits: Range;
  a: Range;
  b: Range;
  /** A zero in this place of one number, after its first digit. */
  aZeroInOnes: Word;
  aZeroInTens: Word;
  aZeroInHundreds: Word;
  bZeroInOnes: Word;
  bZeroInTens: Word;
  bZeroInHundreds: Word;
}
/** The rules of the two numbers. The other rules stop nothing. */
export const numberRules = (l: NumberLimits) => ({
  aDigits: l.aDigits, bDigits: l.bDigits, a: l.a, b: l.b, aZeros: [l.aZeroInOnes, l.aZeroInTens, l.aZeroInHundreds] as const, bZeros: [l.bZeroInOnes, l.bZeroInTens, l.bZeroInHundreds] as const,
  zeroInside: "allowed" as Word, chain: "allowed" as Word, acrossZero: "allowed" as Word, acrossTwoZeros: "allowed" as Word, equalDigits: "allowed" as Word, shorter: "allowed" as Word,
});
