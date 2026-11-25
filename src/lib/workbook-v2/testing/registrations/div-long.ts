// The facts of div.long. The shape keeps the facts of each pair of numbers in bits; this file reads them from the first
// digits of the dividend, and goes over all pairs of 2 and 3 digits for each question about some limits.
import { answerOf, divisionLines, each, formLimit, groupsOf, numbersOf, prefixesOf, q, r, remainderLimit, rowsOf, span, tableOrder, withEnd, type PrintedDivision } from "../division-facts";
import { choiceLimit, oftenWide, onlyLimit, rangeLimit, type LimitRule, type Limits, type Printed, type Rows, type ShapeRegistration } from "../shape-registration";

const WIDE: Limits = {
  dividendDigits: r(2, 3), dividend: r(10, 999), divisor: r(2, 9), quotient: r(1, 499), quotientDigits: r(1, 3), remainder: "any", start: "either",
  bringDownZero: "allowed", zeroInside: "allowed", zeroAtEnd: "allowed", leftOver: r(0, 2), form: "line",
};
const BRACKET: Limits = { ...WIDE, form: "bracket" };
const TWO: Limits = { ...WIDE, dividendDigits: r(2, 2) };
const THREE: Limits = { ...WIDE, dividendDigits: r(3, 3) };
const NO_ZEROS = { bringDownZero: "never", zeroInside: "never", zeroAtEnd: "never" };

type Pair = Omit<PrintedDivision, "form" | "parts">;

/** What the limits talk about, for one pair of numbers; the form and the areas come from the row. */
function factsOf({ dividend, divisor }: Pair) {
  const [quotient, left] = groupsOf(dividend, divisor);
  const prefixes = prefixesOf(dividend, divisor);
  const digits = String(dividend).length;
  return {
    quotient, left,
    features: {
      dividendDigits: digits, dividend, divisor, quotient, quotientDigits: prefixes.length, start: prefixes.length === digits ? "one" : "two",
      bringDownZero: prefixes.some((p) => p.next === "0"), zeroInside: /^.+0.+$/.test(String(quotient)), zeroAtEnd: quotient % 10 === 0,
      leftOver: prefixes.slice(0, -1).filter((p) => p.left > 0).length,
    },
  };
}

function read(rows: Rows): Printed | null {
  const numbers = numbersOf(rows);
  if (!numbers || numbers.dividend < 10 || numbers.dividend > 999 || numbers.divisor < 2 || numbers.divisor > 9) return null;
  const { quotient, left, features } = factsOf(numbers);
  if (numbers.parts === 1 && left > 0) return null;
  return {
    answer: answerOf(numbers, quotient, left), features: { ...features, remainder: { left, parts: numbers.parts }, form: numbers.form },
    widths: { inside: features.dividendDigits, quotient: features.quotientDigits }, steps: divisionLines(numbers, quotient, left),
  };
}

/** Every pair, from the easiest to the hardest. */
const keyOf = ({ features: f, left }: ReturnType<typeof factsOf>): number[] =>
  [f.quotientDigits, [...String(f.quotient)].filter((d) => d === "0").length, f.dividendDigits, f.leftOver, f.bringDownZero ? 1 : 0, left > 0 ? 1 : 0, tableOrder(f.divisor), f.dividend];
const PAIRS = span(2, 9).flatMap((divisor) => span(10, 999).map((dividend) => ({ dividend, divisor, ...factsOf({ dividend, divisor }) })))
  .map((pair) => ({ ...pair, key: keyOf(pair) })).sort((a, b) => { const at = a.key.findIndex((n, i) => n !== b.key[i]); return a.key[at] - b.key[at]; });

interface Ends { count: number; easiest: Rows; hardest: Rows; widest: Rows }
let last: { limits: Limits; ends: Ends } | null = null;

function endsOf(limits: Limits): Ends {
  if (last?.limits === limits) return last.ends;
  const { form, ...rules } = limits;
  const row: Pick<PrintedDivision, "form" | "parts"> = { form: form === "line" ? "line" : "bracket", parts: rules.remainder === "none" ? 1 : 2 };
  // A limit at its widest permits each pair, and the form of the row is the form of the limits.
  const narrow = Object.entries(divLongRegistration.limits).filter(([name]) => name !== "form" && JSON.stringify(limits[name]) !== JSON.stringify(WIDE[name]));
  const inside = PAIRS.filter(({ features, left }) => narrow.every(([name, rule]) => rule.allows(name === "remainder" ? { left, parts: row.parts } : (features as Limits)[name], limits[name])));
  const rows = (pair: Pair | undefined): Rows => (pair ? rowsOf({ dividend: pair.dividend, divisor: pair.divisor, ...row }) : []);
  const widest = inside.reduce<(typeof inside)[number] | undefined>((most, p) => (!most || p.features.dividendDigits + p.features.quotientDigits > most.features.dividendDigits + most.features.quotientDigits ? p : most), undefined);
  const ends = { count: inside.length, easiest: rows(inside[0]), hardest: rows(inside[inside.length - 1]), widest: rows(widest) };
  last = { limits, ends };
  return ends;
}

/** All 2-digit dividends by each divisor, every 61st pair of 3 digits, in both forms, and with one area those that leave nothing. */
const LISTED: Rows[] = PAIRS.filter((p, i) => p.dividend < 100 || i % 61 === 0).flatMap(({ dividend, divisor, left }, i) =>
  ([1, 2] as const).filter((parts) => parts === 2 || left === 0).map((parts) => rowsOf({ dividend, divisor, form: (i + parts) % 2 === 0 ? "line" : "bracket", parts })));

const range = (min: number, max: number) => oftenWide(rangeLimit(min, max), r(min, max));
const word = (rule: LimitRule) => oftenWide(rule, "allowed");
const numbers = (dividend: number, divisor: number, parts: 1 | 2 = 2): PrintedDivision => ({ dividend, divisor, form: "bracket", parts });
const example = (name: string, of: PrintedDivision, quotient: number, left: number, ...lines: string[]) => ({ name, rows: rowsOf(of), answer: answerOf(of, quotient, left), steps: withEnd(of, ...lines) });

export const divLongRegistration: ShapeRegistration = {
  id: "div.long",
  working: "division",
  limits: {
    dividendDigits: range(2, 3), dividend: range(10, 999), divisor: range(2, 9), quotient: range(1, 499), quotientDigits: range(1, 3), remainder: oftenWide(remainderLimit(), "any"),
    start: oftenWide(choiceLimit(["one", "two"], "either"), "either"), bringDownZero: word(onlyLimit()), zeroInside: word(onlyLimit()), zeroAtEnd: word(onlyLimit()), leftOver: range(0, 2), form: formLimit(),
  },
  read,
  space: { count: (l) => endsOf(l).count, easiest: (l) => endsOf(l).easiest, hardest: (l) => endsOf(l).hardest, widest: (l) => endsOf(l).widest, listed: LISTED },
  cases: [
    { name: "every question in a line", limits: WIDE },
    { name: "every question in a bracket", limits: BRACKET },
    { name: "2 digits with nothing left over and nothing left", limits: { ...TWO, remainder: "none", start: "one", leftOver: r(0, 0), zeroAtEnd: "never" } },
    { name: "2 digits with something left over", limits: { ...TWO, remainder: "some", start: "one", leftOver: r(1, 1) } },
    { name: "3 digits in a line, nothing left", limits: { ...THREE, remainder: "none" } },
    { name: "3 digits in a line", limits: { ...THREE, remainder: "any" } },
    { name: "2 digits in a bracket, nothing left", limits: { ...TWO, form: "bracket", remainder: "none", start: "one", zeroAtEnd: "never" } },
    { name: "3 digits in a bracket, nothing left, the first digit is enough", limits: { ...THREE, form: "bracket", remainder: "none", start: "one", ...NO_ZEROS } },
    { name: "3 digits in a bracket, nothing left, a zero inside", limits: { ...THREE, form: "bracket", remainder: "none", zeroInside: "only" } },
    { name: "2 digits in a bracket, something left", limits: { ...TWO, form: "bracket", remainder: "some", start: "one", zeroAtEnd: "never" } },
    { name: "3 digits in a bracket, two digits used, something left", limits: { ...THREE, form: "bracket", remainder: "some", start: "two", ...NO_ZEROS } },
    { name: "3 digits in a bracket, three digits of the quotient", limits: { ...THREE, form: "bracket", dividend: r(900, 999), start: "one", remainder: "some" } },
    { name: "the widest question in a line", limits: { ...WIDE, dividend: r(999, 999), divisor: r(2, 2) } },
    { name: "a zero at the end", limits: { ...THREE, zeroAtEnd: "only" } },
    { name: "a zero that comes down", limits: { ...THREE, bringDownZero: "only", zeroInside: "never", zeroAtEnd: "never" } },
    { name: "a large remainder", limits: { ...WIDE, divisor: r(6, 9), remainder: r(5, 8) } },
  ],
  smallSpaces: [
    { name: "one question", limits: { ...THREE, dividend: r(438, 438), divisor: r(6, 6), remainder: "none" }, questions: each("438÷6") },
    { name: "the same numbers with both areas", limits: { ...THREE, form: "bracket", dividend: r(438, 438), divisor: r(6, 6) }, questions: each("6)438 R") },
    { name: "dividends of 2 and 3 digits", limits: { ...WIDE, dividend: r(98, 101), divisor: r(8, 9) }, questions: each("98÷8 R, 99÷8 R, 100÷8 R, 101÷8 R, 98÷9 R, 99÷9 R, 100÷9 R, 101÷9 R") },
    { name: "nothing left", limits: { ...BRACKET, dividend: r(98, 101), divisor: r(2, 3), remainder: "none" }, questions: each("2)98, 2)100, 3)99") },
    { name: "a zero inside", limits: { ...THREE, dividend: r(612, 619), divisor: r(6, 6), zeroInside: "only", remainder: "some" }, questions: each("613÷6 R, 614÷6 R, 615÷6 R, 616÷6 R, 617÷6 R, 619÷6 R") },
    { name: "a zero at the end", limits: { ...TWO, dividend: r(40, 50), divisor: r(4, 4), zeroAtEnd: "only" }, questions: each("40÷4 R, 41÷4 R, 42÷4 R, 43÷4 R") },
    { name: "a zero that comes down and is none of the quotient", limits: { ...TWO, dividend: r(50, 90), divisor: r(4, 4), bringDownZero: "only", zeroAtEnd: "never" }, questions: each("50÷4 R, 60÷4 R, 70÷4 R, 90÷4 R") },
    { name: "two digits left over", limits: { ...THREE, dividend: r(340, 350), divisor: r(2, 2), leftOver: r(2, 2), remainder: "none" }, questions: each("350÷2") },
    { name: "one digit in the quotient", limits: { ...WIDE, quotientDigits: r(1, 1), divisor: r(2, 2) }, questions: span(10, 19).map((n) => q(`${n}÷2 R`)) },
    { name: "the first digit is enough", limits: { ...TWO, dividend: r(58, 62), divisor: r(6, 6), start: "one" }, questions: each("60÷6 R, 61÷6 R, 62÷6 R") },
    { name: "the largest quotients", limits: { ...WIDE, quotient: r(498, 499) }, questions: each("996÷2 R, 997÷2 R, 998÷2 R, 999÷2 R") },
  ],
  witnesses: [
    { limit: "dividendDigits", limits: TWO, inside: q("99÷4 R"), outside: q("100÷4 R") },
    { limit: "dividendDigits", limits: THREE, inside: q("100÷4 R"), outside: q("99÷4 R") },
    { limit: "dividend", limits: { ...WIDE, dividend: r(50, 500) }, inside: q("500÷4 R"), outside: q("501÷4 R") },
    { limit: "dividend", limits: { ...WIDE, dividend: r(50, 500) }, inside: q("50÷4 R"), outside: q("49÷4 R") },
    { limit: "divisor", limits: { ...WIDE, divisor: r(3, 5) }, inside: q("437÷5 R"), outside: q("437÷6 R") },
    { limit: "divisor", limits: { ...WIDE, divisor: r(3, 5) }, inside: q("437÷3 R"), outside: q("437÷2 R") },
    { limit: "quotient", limits: { ...WIDE, quotient: r(20, 99) }, inside: q("599÷6 R"), outside: q("600÷6 R") },
    { limit: "quotient", limits: { ...WIDE, quotient: r(20, 99) }, inside: q("120÷6 R"), outside: q("119÷6 R") },
    { limit: "quotientDigits", limits: { ...WIDE, quotientDigits: r(2, 2) }, inside: q("599÷6 R"), outside: q("600÷6 R") },
    { limit: "quotientDigits", limits: { ...WIDE, quotientDigits: r(2, 2) }, inside: q("60÷6 R"), outside: q("59÷6 R") },
    { limit: "remainder", limits: { ...WIDE, remainder: "some" }, inside: q("437÷6 R"), outside: q("438÷6 R") },
    { limit: "remainder", limits: { ...WIDE, remainder: "none" }, inside: q("438÷6"), outside: q("438÷6 R") },
    { limit: "remainder", limits: WIDE, inside: q("438÷6 R"), outside: q("438÷6") },
    { limit: "remainder", limits: { ...WIDE, remainder: r(4, 5) }, inside: q("437÷6 R"), outside: q("435÷6 R") },
    { limit: "start", limits: { ...WIDE, start: "one" }, inside: q("600÷6 R"), outside: q("599÷6 R") },
    { limit: "start", limits: { ...WIDE, start: "two" }, inside: q("599÷6 R"), outside: q("600÷6 R") },
    { limit: "bringDownZero", limits: { ...WIDE, bringDownZero: "never" }, inside: q("408÷6 R"), outside: q("430÷6 R") },
    { limit: "bringDownZero", limits: { ...WIDE, bringDownZero: "only" }, inside: q("805÷6 R"), outside: q("405÷6 R") },
    { limit: "zeroInside", limits: { ...WIDE, zeroInside: "never" }, inside: q("605÷5 R"), outside: q("614÷6 R") },
    { limit: "zeroInside", limits: { ...WIDE, zeroInside: "only" }, inside: q("614÷6 R"), outside: q("438÷6 R") },
    { limit: "zeroAtEnd", limits: { ...WIDE, zeroAtEnd: "never" }, inside: q("614÷6 R"), outside: q("425÷6 R") },
    { limit: "zeroAtEnd", limits: { ...WIDE, zeroAtEnd: "only" }, inside: q("425÷6 R"), outside: q("438÷6 R") },
    { limit: "leftOver", limits: { ...WIDE, leftOver: r(1, 1) }, inside: q("438÷6 R"), outside: q("426÷6 R") },
    { limit: "leftOver", limits: { ...WIDE, leftOver: r(1, 1) }, inside: q("614÷6 R"), outside: q("754÷2 R") },
    { limit: "form", limits: WIDE, inside: q("437÷6 R"), outside: q("6)437 R") },
    { limit: "form", limits: BRACKET, inside: q("6)437 R"), outside: q("437÷6 R") },
  ],
  harder: [
    { name: "one digit more in the quotient", easier: q("89÷9 R"), harder: q("22÷2 R") }, { name: "three digits in the quotient", easier: q("899÷9 R"), harder: q("222÷2 R") }, { name: "a zero inside the quotient", easier: q("999÷7 R"), harder: q("214÷2 R") },
    { name: "a zero at the end of the quotient", easier: q("98÷8 R"), harder: q("40÷2 R") }, { name: "two zeros in the quotient", easier: q("918÷9 R"), harder: q("200÷2 R") }, { name: "one digit more in the dividend", easier: q("99÷8 R"), harder: q("112÷2 R") },
    { name: "a digit that leaves something", easier: q("849÷4 R"), harder: q("348÷2 R") }, { name: "two digits that leave something", easier: q("975÷3 R"), harder: q("336÷2 R") }, { name: "a zero that comes down", easier: q("98÷7 R"), harder: q("30÷2 R") },
    { name: "something left", easier: q("96÷8 R"), harder: q("33÷2 R") }, { name: "a harder table", easier: q("55÷5 R"), harder: q("33÷3 R") }, { name: "a larger dividend", easier: q("437÷6 R"), harder: q("449÷6 R") },
  ],
  examples: [
    example("two digits used together", numbers(438, 6, 1), 73, 0, "4 is less than 6, use 43", "6 × 7 = 42, 6 × 8 = 48 is too much, write 7 | q7@1 p4@2#1 p2@1#1", "43 - 42 = 1, bring down 8, now 18 | r1@1#2 d8@0#2", "6 × 3 = 18, 6 × 4 = 24 is too much, write 3 | q3@0 p1@1#3 p8@0#3", "18 - 18 = 0 | r0@0#4"),
    example("a zero inside", numbers(614, 6), 102, 2, "6 × 1 = 6, 6 × 2 = 12 is too much, write 1 | q1@2 p6@2#1", "6 - 6 = 0, bring down 1, now 1 | r0@2#2 d1@1#2", "1 is less than 6, write 0, bring down 4, now 14 | q0@1 d4@0#2", "6 × 2 = 12, 6 × 3 = 18 is too much, write 2 | q2@0 p1@1#3 p2@0#3", "14 - 12 = 2 | r2@0#4"),
    example("zeros at the end", numbers(605, 6), 100, 5, "6 × 1 = 6, 6 × 2 = 12 is too much, write 1 | q1@2 p6@2#1", "6 - 6 = 0, bring down 0, now 0 | r0@2#2 d0@1#2", "0 is less than 6, write 0, bring down 5, now 5 | q0@1 d5@0#2", "5 is less than 6, write 0 | q0@0"),
    example("two digits", numbers(53, 4), 13, 1, "4 × 1 = 4, 4 × 2 = 8 is too much, write 1 | q1@1 p4@1#1", "5 - 4 = 1, bring down 3, now 13 | r1@1#2 d3@0#2", "4 × 3 = 12, 4 × 4 = 16 is too much, write 3 | q3@0 p1@1#3 p2@0#3", "13 - 12 = 1 | r1@0#4"),
    example("one digit in the quotient", { ...numbers(37, 4), form: "line" }, 9, 1, "4 × 9 = 36, 4 × 10 = 40 is too much, write 9 | q9@0 p3@1#1 p6@0#1", "37 - 36 = 1 | r1@0#2"),
  ],
  refusedLimits: [
    { name: "not an object", raw: null, problem: "the limits must be an object" },
    { name: "a divisor of 1", raw: { ...WIDE, divisor: r(1, 9) }, problem: "divisor must be from 2 to 9" },
    { name: "a divisor of 0", raw: { ...WIDE, divisor: r(0, 9) }, problem: "divisor must be from 2 to 9" },
    { name: "a divisor of 10", raw: { ...WIDE, divisor: r(2, 10) }, problem: "divisor must be from 2 to 9" },
    { name: "a dividend of 4 digits", raw: { ...WIDE, dividend: r(10, 1000) }, problem: "dividend must be from 10 to 999" },
    { name: "an unknown start", raw: { ...WIDE, start: "first" }, problem: 'start must be "one" or "two" or "either"' },
    { name: "an unknown word", raw: { ...WIDE, zeroInside: "sometimes" }, problem: 'zeroInside must be "never" or "allowed" or "only"' },
    { name: "a range that is a word", raw: { ...WIDE, remainder: r(0, 8) }, problem: 'remainder from 0 to 8 must be "any"' },
    { name: "both forms", raw: { ...WIDE, form: "both" }, problem: 'form must be "line" or "bracket"' },
    { name: "a limit with another name", raw: { ...WIDE, dividends: r(10, 99) }, problem: 'unknown limit "dividends"' },
    { name: "a zero inside of two digits", raw: { ...TWO, zeroInside: "only" }, problem: "no question meets these limits (a wider dividendDigits or zeroInside has some)" },
    { name: "three digits in the quotient of two", raw: { ...TWO, quotientDigits: r(3, 3) }, problem: "no question meets these limits (a wider dividendDigits or quotientDigits has some)" },
    { name: "three digits in the quotient and two used together", raw: { ...WIDE, quotientDigits: r(3, 3), start: "two" }, problem: "no question meets these limits (a wider quotientDigits or start has some)" },
    { name: "a remainder that no divisor leaves", raw: { ...WIDE, divisor: r(2, 5), remainder: r(5, 8) }, problem: "no question meets these limits (a wider divisor or remainder has some)" },
    { name: "a zero that comes down and goes nowhere", raw: { ...TWO, bringDownZero: "only", leftOver: r(0, 0), zeroAtEnd: "never" }, problem: "no question meets these limits (a wider dividendDigits or leftOver or bringDownZero or zeroAtEnd has some)" },
  ],
  refusedRows: ([["nothing", []], ["something left and one area", ["437÷6=□"]], ["something left and one area in a bracket", ["□", "6)437"]], ["an answer", ["438÷6=73"]], ["a divisor of 1", ["43÷1=□R□"]], ["a divisor of 0", ["43÷0=□R□"]], ["a divisor of 10", ["430÷10=□R□"]], ["a dividend of 1 digit", ["8÷4=□R□"]],
    ["a dividend of 4 digits", ["1000÷4=□R□"]], ["a dividend with a comma", ["1,000÷4=□R□"]], ["two areas with no R", ["437÷6=□□"]], ["no area", ["437÷6="]], ["another sign", ["437×6=□R□"]], ["a bracket with no sign", ["□R□", "6437"]], ["the areas below a bracket", ["6)437", "□R□"]], ["a blank inside a bracket", ["□R□", "6)□"]], ["a zero in front", ["6)043"]], ["three rows", ["□R□", "6)437", "42"]]] as const).map(([name, rows]) => ({ name, rows })),
};
