import { answerOf, divisionLines, each, formLimit, groupsOf, numbersOf, q, r, remainderLimit, rowsOf, span, withEnd, type PrintedDivision } from "../division-facts";
import { rangeLimit, setLimit, type Limits, type Printed, type Rows, type ShapeRegistration } from "../shape-registration";

const WIDE: Limits = { dividend: r(1, 89), divisors: span(2, 9), quotient: r(0, 9), remainder: "any", form: "line" };
const BRACKET: Limits = { ...WIDE, form: "bracket" };
const EXACT: Limits = { ...WIDE, remainder: "none" };

function read(rows: Rows): Printed | null {
  const numbers = numbersOf(rows);
  if (!numbers || numbers.dividend < 1 || numbers.divisor < 2 || numbers.divisor > 9) return null;
  const { dividend, divisor, form, parts } = numbers;
  const [quotient, left] = groupsOf(dividend, divisor);
  if (quotient > 9 || (parts === 1 && left > 0)) return null;
  return {
    answer: answerOf(numbers, quotient, left), features: { dividend, divisors: divisor, quotient, remainder: { left, parts }, form },
    widths: { inside: String(dividend).length }, steps: divisionLines(numbers, quotient, left),
  };
}

const space = (["line", "bracket"] as const).flatMap((form) => ([1, 2] as const).flatMap((parts) => span(2, 9).flatMap((divisor) => span(1, 89).map((dividend) => rowsOf({ dividend, divisor, form, parts }))))).filter((rows) => read(rows) !== null);
const numbers = (dividend: number, divisor: number, parts: 1 | 2 = 2): PrintedDivision => ({ dividend, divisor, form: "line", parts });
const example = (name: string, of: PrintedDivision, quotient: number, left: number, ...lines: string[]) => [
  { name: `${name}, in a line`, rows: rowsOf(of), answer: answerOf(of, quotient, left), steps: withEnd(of, ...lines) },
  { name: `${name}, in a bracket`, rows: rowsOf({ ...of, form: "bracket" }), answer: answerOf(of, quotient, left), steps: withEnd(of, ...lines) },
];

export const divRemainderRegistration: ShapeRegistration = {
  id: "div.remainder",
  working: "division",
  limits: { dividend: rangeLimit(1, 89), divisors: setLimit(2, 9), quotient: rangeLimit(0, 9), remainder: remainderLimit(), form: formLimit() },
  read, space,
  cases: [
    { name: "every question in a line", limits: WIDE },
    { name: "every question in a bracket", limits: BRACKET },
    { name: "nothing left", limits: { ...EXACT, quotient: r(1, 9) } },
    { name: "something left, easy tables", limits: { ...WIDE, dividend: r(3, 49), divisors: [2, 3, 4, 5], quotient: r(1, 9), remainder: "some" } },
    { name: "any remainder", limits: { ...WIDE, quotient: r(1, 9) } },
    { name: "a large remainder", limits: { ...WIDE, divisors: span(6, 9), quotient: r(1, 9), remainder: r(5, 8) } },
    { name: "a dividend that is less than the divisor", limits: { ...WIDE, quotient: r(0, 0) } },
    { name: "a bracket, nothing left, easy tables", limits: { ...BRACKET, dividend: r(10, 45), divisors: [2, 3, 4, 5], quotient: r(2, 9), remainder: "none" } },
    { name: "a bracket, nothing left, hard tables", limits: { ...BRACKET, dividend: r(18, 81), divisors: span(6, 9), quotient: r(2, 9), remainder: "none" } },
    { name: "a bracket, something left", limits: { ...BRACKET, dividend: r(10, 49), divisors: [2, 3, 4, 5], quotient: r(1, 9), remainder: "some" } },
    { name: "a bracket, any remainder", limits: { ...BRACKET, dividend: r(20, 89), divisors: span(6, 9), quotient: r(2, 9) } },
  ],
  smallSpaces: [
    { name: "one question", limits: { ...WIDE, dividend: r(37, 37), divisors: [4] }, questions: each("37÷4 R") },
    { name: "a question that leaves nothing, with both areas", limits: { ...BRACKET, dividend: r(36, 36), divisors: [4] }, questions: each("4)36 R") },
    { name: "one area, so nothing is left", limits: { ...EXACT, dividend: r(20, 25), divisors: [4, 5] }, questions: each("20÷4, 24÷4, 20÷5, 25÷5") },
    { name: "the same dividends with both areas", limits: { ...WIDE, dividend: r(20, 25), divisors: [4, 5] }, questions: each("20÷4 R, 21÷4 R, 22÷4 R, 23÷4 R, 24÷4 R, 25÷4 R, 20÷5 R, 21÷5 R, 22÷5 R, 23÷5 R, 24÷5 R, 25÷5 R") },
    { name: "something left", limits: { ...WIDE, dividend: r(20, 25), divisors: [4], remainder: "some" }, questions: each("21÷4 R, 22÷4 R, 23÷4 R, 25÷4 R") },
    { name: "a range of remainders", limits: { ...WIDE, dividend: r(20, 25), divisors: [4], remainder: r(0, 1) }, questions: each("20÷4 R, 21÷4 R, 24÷4 R, 25÷4 R") },
    { name: "a quotient of 0", limits: { ...BRACKET, divisors: [3, 4], quotient: r(0, 0) }, questions: each("3)1 R, 3)2 R, 4)1 R, 4)2 R, 4)3 R") },
    { name: "the largest dividends", limits: { ...WIDE, dividend: r(87, 89) }, questions: each("87÷9 R, 88÷9 R, 89÷9 R") },
  ],
  witnesses: [
    { limit: "dividend", limits: { ...WIDE, dividend: r(20, 50) }, inside: q("50÷7 R"), outside: q("51÷7 R") },
    { limit: "dividend", limits: { ...WIDE, dividend: r(20, 50) }, inside: q("20÷7 R"), outside: q("19÷7 R") },
    { limit: "divisors", limits: { ...WIDE, divisors: [4, 6] }, inside: q("37÷6 R"), outside: q("37÷5 R") },
    { limit: "quotient", limits: { ...WIDE, quotient: r(1, 8) }, inside: q("35÷4 R"), outside: q("36÷4 R") },
    { limit: "quotient", limits: { ...WIDE, quotient: r(1, 8) }, inside: q("4÷4 R"), outside: q("3÷4 R") },
    { limit: "remainder", limits: { ...WIDE, remainder: "some" }, inside: q("37÷4 R"), outside: q("36÷4 R") },
    { limit: "remainder", limits: EXACT, inside: q("36÷4"), outside: q("36÷4 R") },
    { limit: "remainder", limits: WIDE, inside: q("36÷4 R"), outside: q("36÷4") },
    { limit: "remainder", limits: { ...WIDE, remainder: r(2, 3) }, inside: q("39÷4 R"), outside: q("37÷4 R") },
    { limit: "remainder", limits: { ...WIDE, remainder: r(2, 3) }, inside: q("38÷4 R"), outside: q("40÷9 R") },
    { limit: "form", limits: WIDE, inside: q("37÷4 R"), outside: q("4)37 R") },
    { limit: "form", limits: BRACKET, inside: q("4)37 R"), outside: q("37÷4 R") },
  ],
  harder: [
    { name: "something left", easier: q("81÷9 R"), harder: q("3÷2 R") }, { name: "something left, by the numbers next to each other", easier: q("36÷4 R"), harder: q("37÷4 R") }, { name: "a quotient of 0", easier: q("89÷9 R"), harder: q("1÷2 R") },
    { name: "a harder table", easier: q("46÷5 R"), harder: q("10÷3 R") }, { name: "the larger table", easier: q("53÷6 R"), harder: q("8÷7 R") }, { name: "a larger dividend", easier: q("37÷4 R"), harder: q("38÷4 R") },
    { name: "the larger quotient", easier: q("4)32"), harder: q("4)36") },
  ],
  examples: [
    ...example("one left", numbers(37, 4), 9, 1, "4 × 9 = 36, 4 × 10 = 40 is too much, write 9 | q9@0 p3@1#1 p6@0#1", "37 - 36 = 1 | r1@0#2"),
    ...example("nothing left", numbers(36, 4), 9, 0, "4 × 9 = 36, 4 × 10 = 40 is too much, write 9 | q9@0 p3@1#1 p6@0#1", "36 - 36 = 0 | r0@0#2"),
    ...example("nothing left and one area", numbers(36, 4, 1), 9, 0, "4 × 9 = 36, 4 × 10 = 40 is too much, write 9 | q9@0 p3@1#1 p6@0#1", "36 - 36 = 0 | r0@0#2"),
    ...example("a dividend that is less than the divisor", numbers(3, 4), 0, 3, "3 is less than 4, write 0 | q0@0"),
    ...example("a dividend of one digit", numbers(7, 3), 2, 1, "3 × 2 = 6, 3 × 3 = 9 is too much, write 2 | q2@0 p6@0#1", "7 - 6 = 1 | r1@0#2"),
  ],
  refusedLimits: [
    { name: "not an object", raw: [], problem: "the limits must be an object" },
    { name: "a divisor of 1", raw: { ...WIDE, divisors: [1] }, problem: "divisors must be from 2 to 9" },
    { name: "a divisor of 0", raw: { ...WIDE, divisors: [0, 2] }, problem: "divisors must be from 2 to 9" },
    { name: "a dividend of 90", raw: { ...WIDE, dividend: r(1, 90) }, problem: "dividend must be from 1 to 89" },
    { name: "a dividend of 0", raw: { ...WIDE, dividend: r(0, 9) }, problem: "dividend must be from 1 to 89" },
    { name: "a quotient of 10", raw: { ...WIDE, quotient: r(1, 10) }, problem: "quotient must be from 0 to 9" },
    { name: "an unknown remainder", raw: { ...WIDE, remainder: "never" }, problem: 'remainder must be "none" or "any" or "some" or a range' },
    { name: "a remainder of 9", raw: { ...WIDE, remainder: r(0, 9) }, problem: "remainder must be from 0 to 8" },
    { name: "a range that is a word", raw: { ...WIDE, remainder: r(1, 8) }, problem: 'remainder from 1 to 8 must be "some"' },
    { name: "a range with nothing left", raw: { ...WIDE, remainder: r(0, 0) }, problem: 'remainder from 0 to 0 must be "none"' },
    { name: "both forms", raw: { ...WIDE, form: "either" }, problem: 'form must be "line" or "bracket"' },
    { name: "a limit of another shape", raw: { ...WIDE, order: "up" }, problem: 'unknown limit "order"' },
    { name: "a remainder that no divisor leaves", raw: { ...WIDE, divisors: [2, 3], remainder: r(4, 8) }, problem: "no question meets these limits (a wider divisors or remainder has some)" },
    { name: "dividends with no such quotient", raw: { ...WIDE, dividend: r(80, 89), quotient: r(1, 5), divisors: [2] }, problem: "no question meets these limits (a wider dividend has some)" },
    { name: "limits that stop each other", raw: { ...WIDE, dividend: r(37, 37), divisors: [4], remainder: "none", quotient: r(0, 0) }, problem: "no question meets these limits (together they are too narrow: dividend, divisors, quotient, remainder)" },
  ],
  refusedRows: ([["nothing", []], ["no blank", ["37÷4="]], ["something left and one area", ["37÷4=□"]], ["something left and one area in a bracket", ["□", "4)37"]], ["an answer", ["37÷4=9R1"]], ["a divisor of 1", ["5÷1=□R□"]], ["a divisor of 0", ["5÷0=□R□"]], ["a divisor of 10", ["35÷10=□R□"]],
    ["a quotient of 10", ["40÷4=□R□"]], ["a dividend of 90", ["90÷9=□R□"]], ["a dividend of 0", ["0÷4=□R□"]], ["two areas with no R", ["37÷4=□□"]], ["a small r", ["37÷4=□r□"]], ["three areas", ["37÷4=□R□R□"]], ["another sign", ["37-4=□R□"]], ["a bracket with no sign", ["□R□", "437"]], ["a bracket that is turned round", ["□R□", "37(4"]],
    ["the areas below a bracket", ["4)37", "□R□"]], ["three rows", ["□R□", "4)37", ""]], ["a zero in front", ["037÷4=□R□"]], ["a sign of both forms", ["□R□", "37÷4"]]] as const).map(([name, rows]) => ({ name, rows })),
};
