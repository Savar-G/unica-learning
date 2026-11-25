// The facts of count.skip. The shape counts lines in runs and adds one step at a time; this file looks at every line and
// every set of blanks (as the bits of a number), and multiplies.
import type { Step } from "../../contract";
import { choiceLimit, neverLimit, oftenWide, rangeLimit, step, type LargeSpace, type LimitRule, type Limits, type Printed, type Rows, type ShapeRegistration } from "../shape-registration";

const r = (min: number, max: number) => ({ min, max });
interface Ranges { [name: string]: { min: number; max: number } }
const inRange = (n: number, range: { min: number; max: number }) => n >= range.min && n <= range.max;

/** The steps from easy to hard. */
const EASY_FIRST = "2 10 5 3 4 6 7 8 9".split(" ").map(Number);

interface Line { start: number; by: number; terms: number }
const LINES: readonly Line[] = [5, 6, 7, 8, 9, 10].flatMap((terms) => Array.from({ length: 21 * 101 }, (_, i) => ({ start: i % 101, by: Math.floor(i / 101) - 10, terms })))
  .filter(({ start, by, terms }) => Math.abs(by) >= 2 && start + (terms - 1) * by >= 0);

/** Sets of blanks: bit 0 is the first term. */
interface Blanks { bits: number; many: number; first: number; last: number }
const placesOf = (bits: number, terms: number): number[] => Array.from({ length: terms }, (_, i) => i + 1).filter((place) => Math.floor(bits / 2 ** (place - 1)) % 2 === 1);
const hasNeighbours = (bits: number, terms: number): boolean => bits.toString(2).padStart(terms, "0").includes("00");
const BLANKS: ReadonlyMap<number, readonly Blanks[]> = new Map([5, 6, 7, 8, 9, 10].map((terms) => [terms, Array.from({ length: 2 ** terms }, (_, bits) => bits)
  .map((bits) => ({ bits, places: placesOf(bits, terms) })).filter(({ bits, places }) => places.length >= 1 && places.length <= 5 && hasNeighbours(bits, terms))
  .map(({ bits, places }) => ({ bits, many: places.length, first: places[0], last: places[places.length - 1] }))]));

function linesInside(limits: Limits): Line[] {
  const { step: size, start, terms } = limits as unknown as Ranges;
  return LINES.filter((l) => inRange(l.start, start) && inRange(Math.abs(l.by), size) && inRange(l.terms, terms)
    && (limits.direction === "either" || limits.direction === (l.by > 0 ? "up" : "down")) && (limits.offStep === "allowed" || l.start % Math.abs(l.by) === 0));
}
function blanksInside(limits: Limits): Map<number, readonly Blanks[]> {
  const { blanks, places } = limits as unknown as Ranges;
  return new Map([...BLANKS].map(([terms, all]) => [terms, all.filter((b) => inRange(b.many, blanks) && b.first >= places.min && b.last <= places.max)]));
}

const valueAt = ({ start, by }: Line, place: number): number => start + (place - 1) * by;
const rowsOf = (line: Line, bits: number): Rows => {
  const blanks = placesOf(bits, line.terms);
  return Array.from({ length: line.terms }, (_, i) => (blanks.includes(i + 1) ? "□" : String(valueAt(line, i + 1))));
};
const hardness = ({ start, by }: Line): number => (by < 0 ? 2000 : 0) + (start % Math.abs(by) === 0 ? 0 : 1000) + EASY_FIRST.indexOf(Math.abs(by)) * 10;

interface Ends { count: number; easiest: Rows; hardest: Rows; widest: Rows }
const known = new Map<string, Ends>();
function endsOf(limits: Limits): Ends {
  const key = JSON.stringify(limits);
  const found = known.get(key);
  if (found) return found;
  const blanks = blanksInside(limits);
  const most = new Map([...blanks].map(([terms, all]) => [terms, [...all].sort((a, b) => a.many - b.many)]));
  let count = 0;
  const ends = { easiest: { hard: Number.POSITIVE_INFINITY, rows: [] as Rows }, hardest: { hard: Number.NEGATIVE_INFINITY, rows: [] as Rows }, widest: { wide: -1, rows: [] as Rows } };
  for (const line of linesInside(limits)) {
    const all = most.get(line.terms) ?? [];
    if (all.length === 0) continue;
    count += all.length;
    const [few, many] = [all[0], all[all.length - 1]];
    const [low, high] = [hardness(line) + few.many, hardness(line) + many.many];
    if (low < ends.easiest.hard) ends.easiest = { hard: low, rows: rowsOf(line, few.bits) };
    if (high > ends.hardest.hard) ends.hardest = { hard: high, rows: rowsOf(line, many.bits) };
    const wide = line.terms * 1000 + Math.max(valueAt(line, 1), valueAt(line, line.terms));
    if (wide > ends.widest.wide) ends.widest = { wide, rows: rowsOf(line, few.bits) };
  }
  const result = { count, easiest: ends.easiest.rows, hardest: ends.hardest.rows, widest: ends.widest.rows };
  known.set(key, result);
  return result;
}

const space: LargeSpace = {
  count: (limits) => endsOf(limits).count, easiest: (limits) => endsOf(limits).easiest, hardest: (limits) => endsOf(limits).hardest, widest: (limits) => endsOf(limits).widest,
  // Every line of 5 terms with a start up to 20, with one blank after the first two terms.
  listed: LINES.filter((l) => l.terms === 5 && l.start <= 20).flatMap((l) => [4, 8, 16].map((bits) => rowsOf(l, bits))),
};

function read(rows: Rows): Printed | null {
  const terms = rows.length;
  const printed = rows.map((row) => (row === "□" ? null : /^\d{1,3}$/.test(row) && String(Number(row)) === row ? Number(row) : Number.NaN));
  const pair = printed.findLastIndex((value, i) => i > 0 && value !== null && printed[i - 1] !== null);
  if (terms < 5 || terms > 10 || printed.some(Number.isNaN) || pair < 0) return null;
  const by = (printed[pair] ?? 0) - (printed[pair - 1] ?? 0);
  const line = { start: (printed[pair] ?? 0) - pair * by, by, terms };
  const values = printed.map((_, i) => valueAt(line, i + 1));
  const places = printed.flatMap((value, i) => (value === null ? [i + 1] : []));
  if (Math.abs(by) < 2 || Math.abs(by) > 10 || line.start > 100 || places.length < 1 || places.length > 5 || values.some((v, i) => v < 0 || (printed[i] !== null && printed[i] !== v))) return null;
  const answers = places.map((place) => String(values[place - 1]));
  const size = Math.abs(by);
  // A blank with no printed term in front of it is worked back from the term after it, the last one of them first.
  const lead = places.filter((place, i) => place === i + 1);
  const sentence = (from: number, to: number): Step => step(`${from} ${to > from ? "+" : "-"} ${size} = ${to}`);
  return {
    answer: { parts: answers.map((value, i) => ({ name: `blank-${i + 1}`, kind: "whole-number", value })) },
    features: { step: size, direction: by > 0 ? "up" : "down", start: line.start, offStep: line.start % size !== 0, terms, blanks: places.length, places },
    widths: { terms, characters: Math.max(...values.map((v) => String(v).length)) },
    steps: [...[...lead].reverse().map((place) => sentence(values[place], values[place - 1])), ...places.slice(lead.length).map((place) => sentence(values[place - 2], values[place - 1])), step(answers.join(", "))],
  };
}

const range = (min: number, max: number) => oftenWide(rangeLimit(min, max), r(min, max));
/** Every blank stands in the range. */
const placesLimit: LimitRule = { ...range(1, 10), allows: (feature, limit) => Array.isArray(feature) && feature.every((place: number) => inRange(place, limit as { min: number; max: number })) };

const WIDE: Limits = { step: r(2, 10), direction: "either", start: r(0, 100), offStep: "allowed", terms: r(5, 10), blanks: r(1, 5), places: r(1, 10) };
const PLAIN: Limits = { ...WIDE, offStep: "never", direction: "up", places: r(3, 10) };
const ONE_LINE: Limits = { ...PLAIN, step: r(5, 5), start: r(10, 10), terms: r(5, 5) };
const q = (text: string): Rows => text.split(" ");
/** One question for each text between bars. */
const each = (texts: string): Rows[] => texts.split(" | ").map(q);

export const skipCountRegistration: ShapeRegistration = {
  id: "count.skip", working: "lines",
  limits: { step: range(2, 10), direction: choiceLimit(["up", "down"], "either"), start: range(0, 100), offStep: neverLimit(), terms: range(5, 10), blanks: range(1, 5), places: placesLimit },
  read, space,
  cases: [
    { name: "every question", limits: WIDE },
    { name: "by 2, 5 terms", limits: { ...PLAIN, step: r(2, 2), start: r(0, 20), terms: r(5, 5), blanks: r(1, 2) } },
    { name: "by 2 to 5, up", limits: { ...PLAIN, step: r(2, 5), start: r(0, 30), terms: r(5, 5), blanks: r(1, 3) } },
    { name: "by any step, down", limits: { ...PLAIN, direction: "down", start: r(20, 100), terms: r(5, 5), blanks: r(2, 3) } },
    { name: "10 terms with 5 blanks", limits: { ...PLAIN, terms: r(10, 10), blanks: r(5, 5) } },
    { name: "10 terms down with a start between the steps", limits: { ...WIDE, direction: "down", terms: r(10, 10), blanks: r(3, 4), places: r(3, 10) } },
    { name: "a blank at the start", limits: { ...PLAIN, terms: r(6, 8), places: r(1, 2) } },
  ],
  smallSpaces: [
    { name: "one question", limits: { ...ONE_LINE, places: r(4, 4) }, questions: each("10 15 20 □ 30") },
    { name: "every choice of blanks after the first two", limits: ONE_LINE, questions: each("10 15 □ 25 30 | 10 15 20 □ 30 | 10 15 20 25 □ | 10 15 □ □ 30 | 10 15 □ 25 □ | 10 15 20 □ □ | 10 15 □ □ □") },
    { name: "blanks in the first two places, when a limit allows it", limits: { ...ONE_LINE, places: r(1, 2) }, questions: each("□ 15 20 25 30 | 10 □ 20 25 30 | □ □ 20 25 30") },
    { name: "no blanks that hide the step", limits: { ...ONE_LINE, places: r(2, 4), blanks: r(2, 3) }, questions: each("10 □ □ 25 30 | 10 15 □ □ 30") },
    { name: "down to 0 and no further", limits: { ...PLAIN, direction: "down", step: r(3, 4), start: r(0, 16), terms: r(5, 6), places: r(4, 4) }, questions: each("12 9 6 □ 0 | 15 12 9 □ 3 | 15 12 9 □ 3 0 | 16 12 8 □ 0") },
    { name: "starts between the steps", limits: { ...ONE_LINE, offStep: "allowed", start: r(9, 11), places: r(5, 5) }, questions: each("9 14 19 24 □ | 10 15 20 25 □ | 11 16 21 26 □") },
    { name: "both directions", limits: { ...ONE_LINE, direction: "either", start: r(20, 20), places: r(3, 3) }, questions: each("20 25 □ 35 40 | 20 15 □ 5 0") },
  ],
  witnesses: [
    { limit: "step", limits: { ...WIDE, step: r(2, 5) }, inside: q("10 15 □ 25 30"), outside: q("12 18 □ 30 36") },
    { limit: "step", limits: { ...WIDE, step: r(3, 5) }, inside: q("12 9 □ 3 0"), outside: q("12 10 □ 6 4") },
    { limit: "direction", limits: { ...WIDE, direction: "up" }, inside: q("10 15 □ 25 30"), outside: q("30 25 □ 15 10") },
    { limit: "direction", limits: { ...WIDE, direction: "down" }, inside: q("30 25 □ 15 10"), outside: q("10 15 □ 25 30") },
    { limit: "start", limits: { ...WIDE, start: r(5, 10) }, inside: q("10 15 □ 25 30"), outside: q("15 20 □ 30 35") },
    { limit: "start", limits: { ...WIDE, start: r(5, 10) }, inside: q("5 10 □ 20 25"), outside: q("0 5 □ 15 20") },
    { limit: "offStep", limits: PLAIN, inside: q("10 15 □ 25 30"), outside: q("11 16 □ 26 31") },
    { limit: "terms", limits: { ...WIDE, terms: r(6, 7) }, inside: q("10 15 □ 25 30 35"), outside: q("10 15 □ 25 30") },
    { limit: "terms", limits: { ...WIDE, terms: r(6, 7) }, inside: q("10 15 □ 25 30 35 40"), outside: q("10 15 □ 25 30 35 40 45") },
    { limit: "blanks", limits: { ...WIDE, blanks: r(2, 2) }, inside: q("10 15 □ □ 30"), outside: q("10 15 □ 25 30") },
    { limit: "blanks", limits: { ...WIDE, blanks: r(2, 2) }, inside: q("10 15 □ □ 30"), outside: q("10 15 □ □ □") },
    { limit: "places", limits: PLAIN, inside: q("10 15 □ 25 30"), outside: q("10 □ 20 25 30") },
    { limit: "places", limits: { ...PLAIN, places: r(3, 4) }, inside: q("10 15 □ □ 30"), outside: q("10 15 □ 25 □") },
  ],
  harder: [
    { name: "counting down", easier: q("11 20 □ □ □"), harder: q("20 18 □ 14 12") }, { name: "a start between the steps", easier: q("9 18 □ □ □"), harder: q("1 3 □ 7 9") },
    { name: "a larger step", easier: q("5 10 □ □ □"), harder: q("3 6 □ 12 15") }, { name: "10 is easier than 5", easier: q("10 20 □ □ □"), harder: q("10 15 □ 25 30") },
    { name: "one more blank", easier: q("10 15 □ 25 30"), harder: q("10 15 □ □ 30") }, { name: "by 6 after by 4", easier: q("4 8 □ 16 □"), harder: q("6 12 □ 24 30") },
  ],
  examples: ([
    ["up by 5", "10 15 □ 25 □ 35", ["15 + 5 = 20", "25 + 5 = 30", "20, 30"]],
    ["down by 3", "30 27 24 □ □", ["24 - 3 = 21", "21 - 3 = 18", "21, 18"]],
    ["blanks at the start", "□ □ 8 10 12", ["8 - 2 = 6", "6 - 2 = 4", "4, 6"]],
    ["blanks at the start of a line that goes down", "□ 90 80 70 □", ["90 + 10 = 100", "70 - 10 = 60", "100, 60"]],
    ["the longest question", "100 110 □ □ 140 □ 160 □ □ 190", ["110 + 10 = 120", "120 + 10 = 130", "140 + 10 = 150", "160 + 10 = 170", "170 + 10 = 180", "120, 130, 150, 170, 180"]],
  ] as const).map(([name, rows, texts]) => ({
    name, rows: q(rows), steps: texts.map((text) => step(text)),
    answer: { parts: texts[texts.length - 1].split(", ").map((value, i) => ({ name: `blank-${i + 1}`, kind: "whole-number" as const, value })) },
  })),
  refusedLimits: [
    { name: "a step of 1", raw: { ...WIDE, step: r(1, 5) }, problem: "step must be from 2 to 10" },
    { name: "a step of 11", raw: { ...WIDE, step: r(2, 11) }, problem: "step must be from 2 to 10" },
    { name: "four terms", raw: { ...WIDE, terms: r(4, 5) }, problem: "terms must be from 5 to 10" },
    { name: "no blank", raw: { ...WIDE, blanks: r(0, 5) }, problem: "blanks must be from 1 to 5" },
    { name: "six blanks", raw: { ...WIDE, blanks: r(1, 6) }, problem: "blanks must be from 1 to 5" },
    { name: "blanks that always hide the step", raw: { ...WIDE, terms: r(5, 5), blanks: r(4, 5) }, problem: "no question meets these limits" },
    { name: "places after the last term", raw: { ...WIDE, terms: r(5, 5), places: r(6, 10) }, problem: "no question meets these limits" },
    { name: "a line down below 0", raw: { ...WIDE, direction: "down", start: r(0, 7) }, problem: "no question meets these limits" },
  ],
  refusedRows: ([
    ["nothing", ""], ["no blank", "10 15 20 25 30"], ["four terms", "10 15 □ 25"], ["eleven terms", "0 2 4 6 8 10 12 14 16 18 □"], ["a step that no two neighbours show", "10 □ 20 □ 30"], ["a term that is not on the line", "10 15 □ 25 31"],
    ["another step in the middle", "10 15 □ 24 29"], ["a step of 1", "10 11 □ 13 14"], ["a step of 11", "0 11 □ 33 44"], ["one number", "5 5 □ 5 5"], ["a term below 0", "6 4 2 0 □"], ["a start past 100", "101 103 □ 107 109"], ["six blanks", "2 4 □ □ □ □ □ □"],
    ["a zero in front", "05 10 □ 20 25"], ["a fraction", "1.5 3 □ 6 7.5"], ["a letter", "10 15 x 25 30"],
  ] as const).map(([name, rows]) => ({ name, rows: rows === "" ? [] : q(rows) })),
};
