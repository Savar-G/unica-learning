// Place value: a number of 2 to 4 digits, and the digit of each of its places, from the highest one to the ones. The space
// is the 9,990 numbers from 10 to 9999: how many of them have each pattern of zeros up to each number is made one time, so a
// count or a choice reads a few sums and keeps nothing.
import { pick } from "../hash";
import { answerLine, type Answer, type Step } from "../contract";
import { WORD, type Word } from "./column-count";
import { emptyProblem, readLimitFields, within, type Item, type Range, type Shape } from "./shape";

export interface PlaceValueLimits {
  digits: Range;
  number: Range;
  /** How many digits of the number are 0. */
  zeros: Range;
  /** A 0 in a place. The first digit is never 0, so a 0 in the tens needs 3 digits and a 0 in the hundreds needs 4. */
  zeroInOnes: Word;
  zeroInTens: Word;
  zeroInHundreds: Word;
}
export interface PlaceValueQuestion { number: number }

const RANGES = { digits: { min: 2, max: 4 }, number: { min: 10, max: 9999 }, zeros: { min: 0, max: 3 } };
const WORDS = { zeroInOnes: WORD, zeroInTens: WORD, zeroInHundreds: WORD };
/** The name of each place, from the ones up: it is the name of the answer part and the label of its row. */
const PLACES = ["ones", "tens", "hundreds", "thousands"] as const;
const UNIT = ["one", "ten", "hundred", "thousand"] as const;

/** The digits of a number, the highest place first. */
const digitsOf = (n: number): number[] => [...String(n)].map(Number);

/**
 * From the first difference on: more digits; then a 0 inside the number (one that a digit after it ends), more of these,
 * a 0 only at the end, or no 0; then the larger number.
 */
function scoreOf(n: number): number {
  const digits = digitsOf(n);
  const trailing = digits.length - 1 - digits.findLastIndex((d) => d !== 0);
  const inside = digits.filter((d) => d === 0).length - trailing;
  const zeros = inside > 0 ? 1 + inside : trailing > 0 ? 1 : 0;
  return digits.length * 100_000 + zeros * 10_000 + n;
}

/**
 * The zeros of a number: 8 times how many digits are 0, plus 1, 2 and 4 for a 0 in the ones, the tens and the hundreds.
 * The first digit is never 0, so this says each limit of zeros.
 */
function patternOf(n: number): number {
  const fromOnes = digitsOf(n).reverse();
  return 8 * fromOnes.filter((d) => d === 0).length + [0, 1, 2].reduce((bits, place) => (fromOnes[place] === 0 ? bits | (1 << place) : bits), 0);
}

const SIZE = RANGES.number.max + 1;
const PATTERNS = 8 * (RANGES.zeros.max + 1);
const PATTERN = Uint8Array.from({ length: SIZE }, (_, n) => (n < RANGES.number.min ? 0 : patternOf(n)));
const SCORE = Int32Array.from({ length: SIZE }, (_, n) => (n < RANGES.number.min ? 0 : scoreOf(n)));
/** How many numbers from 10 to n have a pattern: at `pattern * SIZE + n`. These are made one time. */
const UP_TO = new Int32Array(PATTERNS * SIZE);
for (let n = RANGES.number.min; n < SIZE; n++) for (let p = 0; p < PATTERNS; p++) UP_TO[p * SIZE + n] = UP_TO[p * SIZE + n - 1] + (PATTERN[n] === p ? 1 : 0);

const allows = (word: Word, has: boolean): boolean => word === "allowed" || (word === "only") === has;

/** The numbers of some limits: those from `low` to `high` that have one of the patterns. A count of digits is a span of numbers. */
interface Span { patterns: number[]; low: number; high: number }
function spanOf(l: PlaceValueLimits): Span {
  const patterns = Array.from({ length: PATTERNS }, (_, p) => p).filter((p) => within(p >> 3, l.zeros) && allows(l.zeroInOnes, (p & 1) > 0) && allows(l.zeroInTens, (p & 2) > 0) && allows(l.zeroInHundreds, (p & 4) > 0));
  return { patterns, low: Math.max(l.number.min, 10 ** (l.digits.min - 1)), high: Math.min(l.number.max, 10 ** l.digits.max - 1) };
}
/** How many numbers of the span are n or less. */
const upTo = ({ patterns, low }: Span, n: number): number => (n < low ? 0 : patterns.reduce((sum, p) => sum + UP_TO[p * SIZE + n] - UP_TO[p * SIZE + low - 1], 0));
function count(limits: PlaceValueLimits): number {
  const span = spanOf(limits);
  return upTo(span, span.high);
}
/** Each number of the limits, rising. */
function each(limits: PlaceValueLimits, visit: (n: number) => void): void {
  const { patterns, low, high } = spanOf(limits);
  for (let n = low; n <= high; n++) if (patterns.includes(PATTERN[n])) visit(n);
}

const answer = ({ number }: PlaceValueQuestion): Answer => {
  const digits = digitsOf(number);
  return { parts: digits.map((d, i) => ({ name: PLACES[digits.length - 1 - i], kind: "digit", value: String(d) })) };
};
const item = (question: PlaceValueQuestion): Item<PlaceValueQuestion> => ({ question, answer: answer(question) });

/** The widest number of each count of digits: all of one count print the same rows, so the largest one stands for them. */
function widest(limits: PlaceValueLimits): Item<PlaceValueQuestion>[] {
  const byDigits = new Map<number, number>();
  each(limits, (n) => byDigits.set(String(n).length, n));
  return [...byDigits.values()].map((number) => item({ number }));
}

/**
 * Reads the printed number and the label of each row: a whole number of 2 to 4 digits, and below it one row for each place
 * from the highest one down. The digit of each place comes from the number by division.
 */
function solveAgain(rows: readonly string[]): Item<PlaceValueQuestion> | null {
  const [prompt, ...more] = rows;
  if (!/^[1-9][0-9]{1,3}$/.test(prompt ?? "")) return null;
  const number = Number(prompt);
  let places = 0;
  for (let rest = number; rest > 0; rest = Math.floor(rest / 10)) places++;
  if (more.length !== places) return null;
  const parts: Answer["parts"] = [];
  for (let place = places - 1; place >= 0; place--) {
    const name = ["ones", "tens", "hundreds", "thousands"][place];
    if (more[places - 1 - place] !== `${name}□`) return null;
    parts.push({ name, kind: "digit", value: String(Math.floor(number / 10 ** place) % 10) });
  }
  return { question: { number }, answer: { parts } };
}

/** "3 hundreds is 300" for each place, from the highest one; then the number as the sum of these; then the digits. */
function steps(q: PlaceValueQuestion): Step[] {
  const digits = digitsOf(q.number);
  const values = digits.map((d, i) => d * 10 ** (digits.length - 1 - i));
  return [
    ...digits.map((d, i) => `${d} ${UNIT[digits.length - 1 - i]}${d === 1 ? "" : "s"} is ${values[i]}`),
    `${values.join(" + ")} = ${q.number}`,
    answerLine(answer(q)),
  ].map((text) => ({ text, marks: [] }));
}

function difficultyRange(limits: PlaceValueLimits): { easiest: number; hardest: number } {
  let [easiest, hardest] = [Infinity, -Infinity];
  each(limits, (n) => { [easiest, hardest] = [Math.min(easiest, SCORE[n]), Math.max(hardest, SCORE[n])]; });
  return { easiest, hardest };
}

export const placeValue: Shape<PlaceValueLimits, PlaceValueQuestion> = {
  id: "place.value",
  version: 1,
  answerKind: "digit",
  readLimits(raw) {
    const fields = readLimitFields(raw, RANGES, WORDS);
    if (typeof fields === "string") return { ok: false, problem: fields };
    const limits = fields as unknown as PlaceValueLimits;
    return count(limits) > 0 ? { ok: true, limits } : { ok: false, problem: emptyProblem(fields, RANGES, WORDS, (l) => count(l as unknown as PlaceValueLimits)) };
  },
  /** The number at the place that the seed picks in the rising list: the first one with more numbers up to it than that place. */
  generate(limits, seed) {
    const span = spanOf(limits);
    const place = pick(seed, upTo(span, span.high));
    let [low, high] = [span.low, span.high];
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (upTo(span, middle) > place) high = middle;
      else low = middle + 1;
    }
    return item({ number: low });
  },
  answer,
  solveAgain,
  steps,
  difficulty: ({ number }) => scoreOf(number),
  difficultyRange,
  worstCase(limits) {
    const most = widest(limits).at(-1);
    if (!most) throw new Error("no question meets these limits");
    return most;
  },
  forms: widest,
  count,
  face: (q) => ({ kind: "fields", prompt: String(q.number), rows: answer(q).parts.map(({ name }) => ({ label: name, blank: name })) }),
};
