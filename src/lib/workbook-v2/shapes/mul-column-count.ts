// The questions of mul.column in order (by the first number, then by the multiplier), counted and found with no list of
// them: there are 79,920. The numbers of a range are cut into blocks of 1, 10, 100 or 1,000 that share their first
// digits. What the last digits of a block can carry into its first digits is counted one column at a time.
import type { Range } from "./shape";

export interface MulColumnLimits {
  /** How many digits the first number has. */
  digits: Range;
  a: Range;
  b: Range;
  /** How many columns get a carry. */
  carries: Range;
  /** The carry that this column of the first number gets: 0 is none, and a column that is not there gets none. */
  carryIntoTens: Range;
  carryIntoHundreds: Range;
  carryIntoThousands: Range;
  product: Range;
  zeroInProduct: "never" | "allowed";
  /** Whether the first number is a multiple of 10. */
  wholeTens: "never" | "allowed" | "only";
}
export interface MulColumnQuestion { a: number; b: number }

/** What the difficulty needs to know of a question. `passes`: the product has a digit more than the first number. */
export interface Kind { digits: number; passes: boolean; carries: number; zero: boolean; b: number }

const MOST_DIGITS = 4;
const within = (n: number, r: Range) => n >= r.min && n <= r.max;

/** What some columns from the ones have done, as one number: the carry out of them, the carries they made, a zero in the product. */
type Low = number;
const lowOf = (carry: number, carries: number, zero: boolean): Low => carry * 8 + carries * 2 + (zero ? 1 : 0);
const carryOf = (low: Low): number => low >> 3;
const carriesOf = (low: Low): number => (low >> 1) & 3;
const hasZero = (low: Low): boolean => (low & 1) === 1;
const START = lowOf(0, 0, false);
/** Columns that break a limit. */
const NONE = -1;
const LOWS = 9 * 8;

/** The limits as a column needs them. `into` has the carries that each place may get. */
interface Rules { limits: MulColumnLimits; into: readonly Range[]; b: number }

const rulesOf = (limits: MulColumnLimits, b: number): Rules =>
  ({ limits, b, into: [{ min: 0, max: 0 }, limits.carryIntoTens, limits.carryIntoHundreds, limits.carryIntoThousands] });

/** One more column that is not the last one. */
function addColumn({ limits, into, b }: Rules, low: Low, digit: number, place: number): Low {
  if (place === 0 && limits.wholeTens === (digit === 0 ? "never" : "only")) return NONE;
  const value = digit * b + carryOf(low);
  const carry = Math.floor(value / 10);
  const zero = hasZero(low) || (place > 0 && value % 10 === 0);
  const carries = carriesOf(low) + (carry > 0 ? 1 : 0);
  if ((zero && limits.zeroInProduct === "never") || carries > limits.carries.max || !within(carry, into[place + 1])) return NONE;
  return lowOf(carry, carries, zero);
}

/** The last column, or null when the question breaks a limit. */
function lastColumn({ limits, into, b }: Rules, low: Low, digit: number, place: number): Kind | null {
  const value = digit * b + carryOf(low);
  const passes = value >= 10;
  const zero = hasZero(low) || (passes && value % 10 === 0);
  if ((zero && limits.zeroInProduct === "never") || !within(carriesOf(low), limits.carries)) return null;
  for (let absent = place + 1; absent < MOST_DIGITS; absent++) if (into[absent].min > 0) return null;
  return { digits: place + 1, passes, carries: carriesOf(low), zero, b };
}

interface LowGroup { low: Low; ways: number }

/** For each number of last digits up to `most`, what they can do and in how many ways. */
function lowGroups(rules: Rules, most: number): LowGroup[][] {
  const all: LowGroup[][] = [[{ low: START, ways: 1 }]];
  for (let place = 0; place < most; place++) {
    const ways = new Array<number>(LOWS).fill(0);
    for (const group of all[place]) {
      for (let digit = 0; digit <= 9; digit++) {
        const next = addColumn(rules, group.low, digit, place);
        if (next !== NONE) ways[next] += group.ways;
      }
    }
    all.push(ways.map((n, low) => ({ low, ways: n })).filter((group) => group.ways > 0));
  }
  return all;
}

/** The kind of the question whose first digits are those of `high` and whose other columns have done `start`. */
function kindOf(rules: Rules, start: Low, high: number, place: number): Kind | null {
  let low = start;
  let rest = high;
  let at = place;
  for (; rest >= 10 && low !== NONE; rest = Math.floor(rest / 10), at++) low = addColumn(rules, low, rest % 10, at);
  return low === NONE ? null : lastColumn(rules, low, rest, at);
}

/** The questions with one multiplier. */
interface Questions { rules: Rules; groups: LowGroup[][]; first: number; last: number }

function questionsBy(limits: MulColumnLimits, b: number): Questions {
  const rules = rulesOf(limits, b);
  const first = Math.max(limits.a.min, 10 ** (limits.digits.min - 1), Math.ceil(limits.product.min / b));
  const last = Math.min(limits.a.max, 10 ** limits.digits.max - 1, Math.floor(limits.product.max / b));
  return { rules, groups: first <= last ? lowGroups(rules, String(last).length - 1) : [], first, last };
}

function questionsOf(limits: MulColumnLimits): Questions[] {
  const all: Questions[] = [];
  for (let b = limits.b.min; b <= limits.b.max; b++) all.push(questionsBy(limits, b));
  return all;
}

/** Tells each kind of question with a first number from `from` to `to`, and how many there are. */
function eachKind({ rules, groups, first, last }: Questions, from: number, to: number, tell: (kind: Kind, ways: number) => void): void {
  const end = Math.min(to, last);
  for (let at = Math.max(from, first), size = 1; at <= end; at += size) {
    let place = 0;
    for (size = 1; size * 10 <= at && at % (size * 10) === 0 && at + size * 10 - 1 <= end; size *= 10) place++;
    for (const group of groups[place]) {
      const kind = kindOf(rules, group.low, at / size, place);
      if (kind) tell(kind, group.ways);
    }
  }
}

function countFrom(all: readonly Questions[], from: number, to: number): number {
  let count = 0;
  const add = (_kind: Kind, ways: number) => { count += ways; };
  for (const questions of all) eachKind(questions, from, to, add);
  return count;
}

const ALL = [0, 10 ** MOST_DIGITS - 1] as const;

/** The question at a place in the order, from 0. */
function find(all: readonly Questions[], index: number): MulColumnQuestion {
  let left = index;
  let a = 0;
  for (let size = 10 ** (MOST_DIGITS - 1); size >= 1; size /= 10) {
    for (let count = countFrom(all, a, a + size - 1); left >= count; count = countFrom(all, a, a + size - 1)) {
      left -= count;
      a += size;
      if (a > ALL[1]) throw new Error(`there is no question ${index}`);
    }
  }
  const by = all.filter((questions) => countFrom([questions], a, a) > 0)[left];
  return { a, b: by.rules.b };
}

export const countQuestions = (limits: MulColumnLimits): number => countFrom(questionsOf(limits), ...ALL);

/** One question: `choose` gets how many there are, and gives a place in the order. */
export function mulColumnSpace(limits: MulColumnLimits): { count: number; at(index: number): MulColumnQuestion } {
  const all = questionsOf(limits);
  return { count: countFrom(all, ...ALL), at: (index) => find(all, index) };
}

export function chooseQuestion(limits: MulColumnLimits, choose: (count: number) => number): MulColumnQuestion {
  const space = mulColumnSpace(limits);
  return space.at(choose(space.count));
}

/** The scores of the easiest and the hardest question. */
export function scoreRange(limits: MulColumnLimits, score: (kind: Kind) => number): { easiest: number; hardest: number } {
  let [easiest, hardest] = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const questions of questionsOf(limits)) {
    eachKind(questions, ...ALL, (kind) => {
      easiest = Math.min(easiest, score(kind));
      hardest = Math.max(hardest, score(kind));
    });
  }
  return { easiest, hardest };
}

/** The question with the largest product: the largest first number of some multiplier. Of equal products, the first in order. */
export function widestQuestion(limits: MulColumnLimits): MulColumnQuestion {
  const largest = questionsOf(limits).flatMap((questions) => {
    const count = countFrom([questions], ...ALL);
    return count > 0 ? [find([questions], count - 1)] : [];
  });
  return largest.reduce((widest, q) => (q.a * q.b > widest.a * widest.b || (q.a * q.b === widest.a * widest.b && q.a < widest.a) ? q : widest));
}
