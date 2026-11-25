// The questions of two numbers in columns, counted for the registrations of add.column and sub.column. The shapes fill
// the columns from the ones up. This goes from the first column down and decides in each column whether the one below it
// must carry. It knows only sums: 302 - 147 = 155 is read as 155 + 147 = 302, and what that subtraction borrows from a
// place is what the sum carries into the place.
import type { Range } from "../shapes/shape";
import type { Limits, Rows } from "./shape-registration";

/** One column of a sum. `low` is null where the second number has no digit. */
export interface SumColumn { place: number; isFirst: boolean; first: number; low: number | null; total: number; gets: boolean; gives: boolean }
/** How hard a question is, next to the size of its numbers, and what the limits ask of a whole question. */
export interface SumKind { columns: number; lowDigits: number; carries: number; chain: boolean; zeros: number; equal: boolean }

export interface SumRules {
  sign: "+" | "-";
  columns: Range;
  lowDigits: Range;
  /** The numbers of the sum: for a subtraction the first is the difference and the total is the top number. */
  first: Range;
  low: Range;
  total: Range;
  column(column: SumColumn, columns: number, lowDigits: number): boolean;
  kind(kind: SumKind): boolean;
}

/** A question as one number: the sum of its two numbers times 100,000, and its top number. */
const BOTH = 100_000;
interface Ways { n: number; least: number; most: number }
interface Move { top: number; low: number; digits: readonly [number, number, number]; gets: 0 | 1; gives: 0 | 1; chain: boolean; zero: boolean; equal: boolean }

/** What each column may be. */
function movesOf(rules: SumRules, place: number, columns: number, lowDigits: number): Move[] {
  const isFirst = place === columns - 1;
  const moves: Move[] = [];
  for (let first = rules.sign === "+" && isFirst ? 1 : 0; first <= 9; first++) {
    for (let digit = place === lowDigits - 1 ? 1 : 0; digit <= (place < lowDigits ? 9 : 0); digit++) {
      for (const gets of place === 0 ? [0 as const] : [0 as const, 1 as const]) {
        const sum = first + digit + gets;
        const gives = !isFirst && sum >= 10 ? 1 : 0;
        const total = sum - 10 * gives;
        const top = rules.sign === "+" ? first : total;
        if (rules.sign === "-" && isFirst && (total < 1 || total > 9)) continue;
        if (!rules.column({ place, isFirst, first, low: place < lowDigits ? digit : null, total, gets: gets === 1, gives: gives === 1 }, columns, lowDigits)) continue;
        const chain = gets === 1 && gives === 1 && (rules.sign === "+" ? first + digit === 9 : top === 0 || top === digit);
        moves.push({ top, low: digit, digits: [first, digit, total], gets, gives, chain, zero: gets === 1 && rules.sign === "-" && top === 0, equal: place < lowDigits && top === digit });
      }
    }
  }
  return moves;
}

/** A state from the first column down: the carry that the next column must give, what came so far, and the bounds that are still touched. */
const [CARRY, COUNT, CHAIN, RUN, ZEROS, EQUAL, TOUCHED] = [1, 2, 8, 16, 64, 256, 512];
const field = (state: number, unit: number, size: number) => Math.floor(state / unit) % size;

function addWays(to: Map<number, Ways>, state: number, { n, least, most }: Ways, more: number): void {
  const known = to.get(state);
  if (!known) return void to.set(state, { n, least: least + more, most: most + more });
  known.n += n;
  known.least = Math.min(known.least, least + more);
  known.most = Math.max(known.most, most + more);
}

const digitOf = (bound: number, place: number, isFirst: boolean) => (isFirst ? Math.floor(bound / 10 ** place) : Math.floor(bound / 10 ** place) % 10);

/** The questions with these numbers of digits, by their kinds. */
function waysOf(rules: SumRules, columns: number, lowDigits: number): Map<number, Ways> {
  const ofDigits = (range: Range, digits: number): Range => ({ min: Math.max(range.min, 10 ** (digits - 1)), max: Math.min(range.max, 10 ** digits - 1) });
  const [top, low] = [ofDigits(rules.sign === "+" ? rules.first : rules.total, columns), ofDigits(rules.low, lowDigits)];
  const other = rules.sign === "+" ? rules.total : rules.first;
  if (top.min > top.max || low.min > low.max || other.min > other.max) return new Map();
  const bounds = rules.sign === "+" ? [top, low, other] : [other, low, top];
  // A bound that no number of these digits passes is not looked at.
  const free = rules.sign === "+" ? { min: top.min + low.min, max: top.max + low.max } : { min: Math.max(0, top.min - low.max), max: top.max - low.min };
  const loose = bounds.map((b, i) => (b === other ? [b.min <= free.min, b.max >= free.max] : [b.min === 10 ** ((i === 1 ? lowDigits : columns) - 1), b.max === 10 ** (i === 1 ? lowDigits : columns) - 1]));
  const start = loose.reduce((all, [least, most], i) => all + (least ? 0 : TOUCHED * 4 ** i) + (most ? 0 : 2 * TOUCHED * 4 ** i), 0);

  let states = new Map<number, Ways>([[start, { n: 1, least: 0, most: 0 }]]);
  for (let place = columns - 1; place >= 0; place--) {
    const next = new Map<number, Ways>();
    const isFirst = place === columns - 1;
    const parts = bounds.map((b) => [digitOf(b.min, place, isFirst), digitOf(b.max, place, isFirst)]);
    const byGives = [0, 1].map((gives) => movesOf(rules, place, columns, lowDigits).filter((m) => m.gives === gives));
    for (const [state, ways] of states) {
      const [touched, run] = [Math.floor(state / TOUCHED), field(state, RUN, 4)];
      for (const move of byGives[state % 2]) {
        let still = touched;
        for (let i = 0; i < 3 && still >= 0; i++) {
          const [least, most] = [1 << (2 * i), 2 << (2 * i)];
          if ((touched & least) !== 0) still = move.digits[i] < parts[i][0] ? -1 : move.digits[i] > parts[i][0] ? still & ~least : still;
          if (still >= 0 && (touched & most) !== 0) still = move.digits[i] > parts[i][1] ? -1 : move.digits[i] < parts[i][1] ? still & ~most : still;
        }
        if (still < 0) continue;
        const zeros = move.zero ? run + 1 : 0;
        const made = move.gets * CARRY + (field(state, COUNT, 4) + move.gets) * COUNT + (move.chain || field(state, CHAIN, 2) === 1 ? CHAIN : 0)
          + zeros * RUN + Math.max(field(state, ZEROS, 4), zeros) * ZEROS + (move.equal || field(state, EQUAL, 2) === 1 ? EQUAL : 0) + still * TOUCHED;
        addWays(next, made, ways, ((move.top + move.low) * BOTH + move.top) * 10 ** place);
      }
    }
    states = next;
  }
  return states;
}

const hardnessOf = (k: SumKind): number => ((k.columns * 10 + k.carries) * 10 + (k.chain ? 1 : 0)) * 10 + k.zeros;

export interface SumEnds { count: number; easiest: Rows; hardest: Rows; widest: Rows }

/** The number of questions inside some rules, and the questions at their ends. */
export function sumEnds(rules: SumRules): SumEnds {
  let count = 0;
  let [easiest, hardest, widest] = [0, 0, 0];
  let [easy, hard, wide] = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0];
  for (let columns = rules.columns.min; columns <= rules.columns.max; columns++) {
    for (let lowDigits = rules.lowDigits.min; lowDigits <= Math.min(columns, rules.lowDigits.max); lowDigits++) {
      for (const [state, { n, least, most }] of waysOf(rules, columns, lowDigits)) {
        const kind = { columns, lowDigits, carries: field(state, COUNT, 4), chain: field(state, CHAIN, 2) === 1, zeros: field(state, ZEROS, 4), equal: field(state, EQUAL, 2) === 1 };
        if (!rules.kind(kind)) continue;
        count += n;
        const hardness = hardnessOf(kind);
        if (hardness < easy || (hardness === easy && least < easiest)) [easy, easiest] = [hardness, least];
        if (hardness > hard || (hardness === hard && most > hardest)) [hard, hardest] = [hardness, most];
        const places = Math.max(columns, lowDigits + 1, rules.sign === "+" ? String(Math.floor(most / BOTH)).length : 0);
        if (places > wide) [wide, widest] = [places, most];
      }
    }
  }
  const rows = (best: number): Rows => [String(best % BOTH), `${rules.sign}${Math.floor(best / BOTH) - (best % BOTH)}`];
  return { count, easiest: rows(easiest), hardest: rows(hardest), widest: rows(widest) };
}

/** The ends of any limits, worked out one time for each. */
export function endsOf(rulesOf: (limits: Limits) => SumRules): (limits: Limits) => SumEnds {
  const known = new Map<string, SumEnds>();
  return (limits) => {
    const key = JSON.stringify(limits);
    const ends = known.get(key) ?? sumEnds(rulesOf(limits));
    known.set(key, ends);
    return ends;
  };
}

export const inside = (n: number, range: unknown): boolean => n >= (range as Range).min && n <= (range as Range).max;
export const meets = (word: unknown, has: boolean): boolean => word === "allowed" || word === (has ? "only" : "never");

/** Whether a number has a zero at a place, after its first digit. */
export const zeroAt = (n: number, place: number): boolean => n >= 10 ** (place + 1) && Math.floor(n / 10 ** place) % 10 === 0;
const A_ZEROS = ["aZeroInOnes", "aZeroInTens", "aZeroInHundreds"];
const B_ZEROS = ["bZeroInOnes", "bZeroInTens", "bZeroInHundreds"];
/** The zero limits of both numbers for one column, and for the places that a number does not have. */
export const zerosMeet = (limits: Limits, { place, isFirst, low }: SumColumn, top: number, lowDigits: number): boolean =>
  place > 2 || (meets(limits[A_ZEROS[place]], top === 0 && !isFirst) && meets(limits[B_ZEROS[place]], low === 0 && place < lowDigits - 1));
export const absentMeet = (limits: Limits, columns: number, into: readonly string[]): boolean =>
  [...A_ZEROS.slice(columns), ...B_ZEROS.slice(columns)].every((name) => limits[name] !== "only") && into.slice(columns - 1).every((name) => inside(0, limits[name]));
