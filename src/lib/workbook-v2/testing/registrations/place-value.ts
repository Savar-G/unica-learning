// The facts of place.value. The shape divides the number by powers of ten; this file reads the characters of the printed
// number, and goes over every number of 2 to 4 digits for each question about some limits.
import { onlyLimit, rangeLimit, step, type LargeSpace, type Limits, type Printed, type Rows, type ShapeRegistration } from "../shape-registration";

const r = (min: number, max: number) => ({ min, max });
const WIDE: Limits = { digits: r(2, 4), number: r(10, 9999), zeros: r(0, 3), zeroInOnes: "allowed", zeroInTens: "allowed", zeroInHundreds: "allowed" };
const NAMES = ["thousands", "hundreds", "tens", "ones"];
const ONE: Readonly<Record<string, string>> = { thousands: "thousand", hundreds: "hundred", tens: "ten", ones: "one" };
const NOUGHTS: Readonly<Record<string, string>> = { thousands: "000", hundreds: "00", tens: "0", ones: "" };

/** The number, then a row for each place, from the highest one. */
const rowsOf = (n: number | string): Rows => [String(n), ...NAMES.slice(4 - String(n).length).map((name) => `${name}□`)];

/**
 * How hard a number is, from the first difference on: more digits; then the zeros inside it (before the last digit that
 * is not 0), each one more harder, then zeros only at its end, then no zero; then the larger number.
 */
function keyOf(text: string): number[] {
  const atEnd = /0*$/.exec(text)?.[0].length ?? 0;
  const inside = [...text].filter((c) => c === "0").length - atEnd;
  return [text.length, inside > 0 ? 1 + inside : atEnd > 0 ? 1 : 0, Number(text)];
}

function read(rows: Rows): Printed | null {
  const [text = "", ...more] = rows;
  if (!/^[1-9]\d{1,3}$/.test(text)) return null;
  const names = NAMES.slice(4 - text.length);
  if (more.length !== names.length || more.some((row, i) => row !== `${names[i]}□`)) return null;
  const chars = [...text];
  const fromOnes = (place: number) => chars.at(-1 - place);
  const values = chars.map((c, i) => (c === "0" ? "0" : `${c}${NOUGHTS[names[i]]}`));
  return {
    answer: { parts: chars.map((value, i) => ({ name: names[i], kind: "digit", value })) },
    features: {
      digits: chars.length, number: Number(text), zeros: chars.filter((c) => c === "0").length,
      zeroInOnes: fromOnes(0) === "0", zeroInTens: chars.length > 2 && fromOnes(1) === "0", zeroInHundreds: chars.length > 3 && fromOnes(2) === "0",
    },
    widths: { rows: names.length },
    steps: [...chars.map((c, i) => step(`${c} ${c === "1" ? ONE[names[i]] : names[i]} is ${values[i]}`)), step(`${values.join(" + ")} = ${text}`), step(chars.join(", "))],
  };
}

const LIMITS = { digits: rangeLimit(2, 4), number: rangeLimit(10, 9999), zeros: rangeLimit(0, 3), zeroInOnes: onlyLimit(), zeroInTens: onlyLimit(), zeroInHundreds: onlyLimit() };

/** Every number of 2 to 4 digits with its facts, from the easiest to the hardest. */
const EVERY = Array.from({ length: 9990 }, (_, i) => String(10 + i)).map((text) => ({ text, key: keyOf(text), printed: read(rowsOf(text)) as Printed }))
  .sort((a, b) => { const at = a.key.findIndex((n, i) => n !== b.key[i]); return a.key[at] - b.key[at]; });

let last: { limits: Limits; inside: typeof EVERY } | null = null;
function insideOf(limits: Limits): typeof EVERY {
  if (last?.limits === limits) return last.inside;
  const rules = Object.entries(LIMITS).map(([name, rule]) => ({ name, rule, limit: limits[name] }));
  last = { limits, inside: EVERY.filter(({ printed: { features } }) => rules.every(({ name, rule, limit }) => rule.allows(features[name], limit))) };
  return last.inside;
}
const ends = (limits: Limits, at: number): Rows => { const all = insideOf(limits); return all.length === 0 ? [] : rowsOf(all.at(at)?.text ?? ""); };
/** The widest: the most rows, and of these the largest number, as any of them prints the same rows. */
function widest(limits: Limits): Rows {
  const most = insideOf(limits).reduce<string | null>((top, { text }) => (top === null || text.length > top.length || (text.length === top.length && Number(text) > Number(top)) ? text : top), null);
  return most === null ? [] : rowsOf(most);
}

const space: LargeSpace = {
  count: (limits) => insideOf(limits).length,
  easiest: (limits) => ends(limits, 0),
  hardest: (limits) => ends(limits, -1),
  widest,
  listed: Array.from({ length: 1090 }, (_, i) => rowsOf(10 + i)),
};

const example = (name: string, number: string, ...lines: string[]) => ({ name, rows: rowsOf(number), answer: read(rowsOf(number))?.answer ?? { parts: [] }, steps: lines.map((line) => step(line)) });
const TWO = { ...WIDE, digits: r(2, 2) };

export const placeValueRegistration: ShapeRegistration = {
  id: "place.value",
  working: "places",
  limits: LIMITS,
  read, space,
  cases: [
    { name: "every number", limits: WIDE },
    { name: "2 digits with no zero", limits: { ...TWO, zeros: r(0, 0) } },
    { name: "2 digits that end in zero", limits: { ...TWO, zeroInOnes: "only" } },
    { name: "any 2 digits", limits: TWO },
    { name: "3 digits that end in zero", limits: { ...WIDE, digits: r(3, 3), zeroInOnes: "only" } },
    { name: "3 digits with a zero inside", limits: { ...WIDE, digits: r(3, 3), zeroInTens: "only", zeroInOnes: "never" } },
    { name: "the widest number", limits: { ...WIDE, number: r(9999, 9999) } },
    { name: "4 digits that end in three zeros", limits: { ...WIDE, digits: r(4, 4), zeros: r(3, 3) } },
    { name: "4 digits with two zeros inside", limits: { ...WIDE, digits: r(4, 4), zeroInHundreds: "only", zeroInTens: "only", zeroInOnes: "never" } },
  ],
  smallSpaces: [
    { name: "one question", limits: { ...WIDE, number: r(9999, 9999) }, questions: [rowsOf(9999)] },
    { name: "2 digits that end in zero", limits: { ...TWO, zeroInOnes: "only" }, questions: [10, 20, 30, 40, 50, 60, 70, 80, 90].map(rowsOf) },
    { name: "two zeros inside, near a thousand", limits: { ...WIDE, number: r(1000, 1100), zeroInHundreds: "only", zeroInTens: "only", zeroInOnes: "never" }, questions: [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009].map(rowsOf) },
    { name: "three zeros", limits: { ...WIDE, zeros: r(3, 3) }, questions: [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000].map(rowsOf) },
    { name: "a zero in the tens of 3 digits from 100 to 120", limits: { ...WIDE, number: r(100, 120), zeroInTens: "only" }, questions: [100, 101, 102, 103, 104, 105, 106, 107, 108, 109].map(rowsOf) },
  ],
  witnesses: [
    { limit: "digits", limits: { ...WIDE, digits: r(2, 3) }, inside: rowsOf(999), outside: rowsOf(1000) },
    { limit: "digits", limits: { ...WIDE, digits: r(3, 4) }, inside: rowsOf(100), outside: rowsOf(99) },
    { limit: "number", limits: { ...WIDE, number: r(50, 500) }, inside: rowsOf(500), outside: rowsOf(501) },
    { limit: "number", limits: { ...WIDE, number: r(50, 500) }, inside: rowsOf(50), outside: rowsOf(49) },
    { limit: "zeros", limits: { ...WIDE, zeros: r(1, 2) }, inside: rowsOf(1001), outside: rowsOf(1000) },
    { limit: "zeros", limits: { ...WIDE, zeros: r(1, 2) }, inside: rowsOf(10), outside: rowsOf(11) },
    { limit: "zeroInOnes", limits: { ...WIDE, zeroInOnes: "only" }, inside: rowsOf(4310), outside: rowsOf(4317) },
    { limit: "zeroInOnes", limits: { ...WIDE, zeroInOnes: "never" }, inside: rowsOf(4317), outside: rowsOf(4310) },
    { limit: "zeroInTens", limits: { ...WIDE, zeroInTens: "only" }, inside: rowsOf(4307), outside: rowsOf(4317) },
    { limit: "zeroInTens", limits: { ...WIDE, zeroInTens: "only" }, inside: rowsOf(407), outside: rowsOf(40) },
    { limit: "zeroInTens", limits: { ...WIDE, zeroInTens: "never" }, inside: rowsOf(4317), outside: rowsOf(4307) },
    { limit: "zeroInHundreds", limits: { ...WIDE, zeroInHundreds: "only" }, inside: rowsOf(4037), outside: rowsOf(4137) },
    { limit: "zeroInHundreds", limits: { ...WIDE, zeroInHundreds: "only" }, inside: rowsOf(1037), outside: rowsOf(103) },
    { limit: "zeroInHundreds", limits: { ...WIDE, zeroInHundreds: "never" }, inside: rowsOf(4137), outside: rowsOf(4037) },
  ],
  // The order: more digits (2 < 3 < 4); then zeros inside before the last digit that is not 0, more of them harder; then
  // zeros only at the end; then no zero; then the larger number.
  harder: [
    { name: "3 digits, though the number is not much larger", easier: rowsOf(99), harder: rowsOf(100) },
    { name: "4 digits, with no zero, after 3 digits with zeros inside", easier: rowsOf(909), harder: rowsOf(1111) },
    { name: "a zero at the end, after no zero", easier: rowsOf(98), harder: rowsOf(20) },
    { name: "a zero inside, after zeros at the end", easier: rowsOf(990), harder: rowsOf(101) },
    { name: "two zeros inside, after one", easier: rowsOf(9099), harder: rowsOf(1001) },
    { name: "a zero inside and one at the end, after three zeros at the end", easier: rowsOf(9000), harder: rowsOf(1010) },
    { name: "the larger number", easier: rowsOf(45), harder: rowsOf(46) },
    { name: "the larger number with zeros at the end", easier: rowsOf(1000), harder: rowsOf(1100) },
  ],
  examples: [
    example("a zero inside", "4307", "4 thousands is 4000", "3 hundreds is 300", "0 tens is 0", "7 ones is 7", "4000 + 300 + 0 + 7 = 4307", "4, 3, 0, 7"),
    example("the smallest number", "10", "1 ten is 10", "0 ones is 0", "10 + 0 = 10", "1, 0"),
    example("the word of one", "1111", "1 thousand is 1000", "1 hundred is 100", "1 ten is 10", "1 one is 1", "1000 + 100 + 10 + 1 = 1111", "1, 1, 1, 1"),
    example("the widest number", "9999", "9 thousands is 9000", "9 hundreds is 900", "9 tens is 90", "9 ones is 9", "9000 + 900 + 90 + 9 = 9999", "9, 9, 9, 9"),
  ],
  refusedLimits: [
    { name: "not an object", raw: [], problem: "the limits must be an object" },
    { name: "5 digits", raw: { ...WIDE, digits: r(2, 5) }, problem: "digits must be from 2 to 4" },
    { name: "a number of 1 digit", raw: { ...WIDE, number: r(9, 99) }, problem: "number must be from 10 to 9999" },
    { name: "four zeros", raw: { ...WIDE, zeros: r(0, 4) }, problem: "zeros must be from 0 to 3" },
    { name: "a part of a digit", raw: { ...WIDE, digits: { min: 2.5, max: 3 } }, problem: "digits.min must be a whole number" },
    { name: "no zeros limit", raw: { ...WIDE, zeros: undefined }, problem: "zeros must have min and max" },
    { name: "an unknown word", raw: { ...WIDE, zeroInTens: "sometimes" }, problem: 'zeroInTens must be "never" or "allowed" or "only"' },
    { name: "a limit of another shape", raw: { ...WIDE, carries: r(0, 1) }, problem: 'unknown limit "carries"' },
    { name: "a zero in the tens of 2 digits", raw: { ...TWO, zeroInTens: "only" }, problem: "no question meets these limits (a wider digits or zeroInTens has some)" },
    { name: "limits that stop each other", raw: { ...TWO, number: r(10, 99), zeroInTens: "only", zeroInHundreds: "only" }, problem: "no question meets these limits (together they are too narrow: digits, number, zeroInTens, zeroInHundreds)" },
  ],
  refusedRows: ([
    ["nothing", []], ["only the number", ["4307"]], ["no number", ["thousands□", "hundreds□"]], ["a zero in front", ["0437", "thousands□", "hundreds□", "tens□", "ones□"]],
    ["one digit", ["7", "ones□"]], ["five digits", ["43070", "thousands□", "hundreds□", "tens□", "ones□"]], ["the places in another order", ["437", "hundreds□", "ones□", "tens□"]],
    ["a place twice", ["43", "tens□", "tens□"]], ["a place left out", ["437", "hundreds□", "ones□"]], ["a row more", ["43", "tens□", "ones□", "ones□"]],
    ["a label with no blank", ["43", "tens", "ones□"]], ["a blank with no label", ["43", "□", "ones□"]], ["a label of one", ["43", "ten□", "ones□"]],
    ["a label with a capital", ["43", "Tens□", "ones□"]], ["a sign", ["+43", "tens□", "ones□"]], ["a comma", ["4,307", "thousands□", "hundreds□", "tens□", "ones□"]],
    ["a blank in the number", ["4□", "tens□", "ones□"]], ["two blanks in a row", ["43", "tens□□", "ones□"]], ["the blank before the label", ["43", "□tens", "ones□"]],
    ["the places of a larger number", ["43", "hundreds□", "tens□"]],
  ] as const).map(([name, rows]) => ({ name, rows })),
};
