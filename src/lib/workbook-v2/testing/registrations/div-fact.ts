import { answerOf, each, formLimit, groupsOf, numbersOf, q, r, rowsOf, span } from "../division-facts";
import { isInside, orderLimit, rangeLimit, setLimit, step, type Limits, type Printed, type Rows, type ShapeRegistration } from "../shape-registration";

const WIDE: Limits = { divisors: span(2, 10), quotient: r(0, 10), order: "mixed", form: "line" };
const BRACKET: Limits = { ...WIDE, form: "bracket" };
const TABLE_7: Limits = { ...WIDE, divisors: [7], quotient: r(1, 9), order: "up" };

function read(rows: Rows): Printed | null {
  const numbers = numbersOf(rows);
  if (!numbers || numbers.parts === 2 || numbers.divisor < 2 || numbers.divisor > 10) return null;
  const { dividend, divisor, form } = numbers;
  const [quotient, left] = groupsOf(dividend, divisor);
  if (left > 0 || quotient > 10) return null;
  return {
    answer: answerOf(numbers, quotient, left), features: { divisors: divisor, quotient, order: null, form },
    widths: { outside: String(divisor).length, inside: String(dividend).length, quotient: String(quotient).length },
    steps: [step(`${divisor} × ${quotient} = ${dividend}`), step(`${dividend} ÷ ${divisor} = ${quotient}`), step(String(quotient))],
  };
}

/** The tables one after the other, each with its quotients rising. */
const space = (["line", "bracket"] as const).flatMap((form) => span(2, 10).flatMap((divisor) => span(0, 10).map((n) => rowsOf({ dividend: Array.from({ length: n }, () => divisor).reduce((sum, d) => sum + d, 0), divisor, form, parts: 1 }))));
const inside = new Map<string, readonly Rows[]>();
const line = (...texts: string[]) => texts.map((text) => step(text));
const whole = (value: number) => answerOf({ dividend: 0, divisor: 2, form: "line", parts: 1 }, value, 0);

export const divFactRegistration: ShapeRegistration = {
  id: "div.fact",
  working: "lines",
  limits: { divisors: setLimit(2, 10), quotient: rangeLimit(0, 10), order: orderLimit(), form: formLimit() },
  read, space,
  ordered: {
    asked: ({ order }) => order !== "mixed",
    next(rows, limits) {
      const key = JSON.stringify(limits);
      const all = inside.get(key) ?? space.filter((other) => { const p = read(other); return p !== null && isInside(divFactRegistration, p, limits); });
      inside.set(key, all);
      return all[all.findIndex((other) => other.join() === rows.join()) + (limits.order === "up" ? 1 : -1)] ?? null;
    },
  },
  swapped(rows) {
    const numbers = numbersOf(rows);
    const other = numbers ? groupsOf(numbers.dividend, numbers.divisor)[0] : 0;
    return numbers && other > 1 && other !== numbers.divisor ? rowsOf({ ...numbers, divisor: other }) : null;
  },
  swapChangesAnswer: true,
  cases: [
    { name: "every question in a line", limits: WIDE },
    { name: "every question in a bracket", limits: BRACKET },
    { name: "the easy tables", limits: { ...WIDE, divisors: [2, 5, 10], quotient: r(1, 10) } },
    { name: "two tables, up", limits: { ...WIDE, divisors: [3, 4], quotient: r(1, 10), order: "up" } },
    { name: "the table of 7, up", limits: TABLE_7 },
    { name: "the table of 7, down", limits: { ...TABLE_7, order: "down" } },
    { name: "the hard tables", limits: { ...WIDE, divisors: span(6, 9), quotient: r(1, 10) } },
    { name: "the easy tables in a bracket", limits: { ...BRACKET, divisors: [2, 10], quotient: r(1, 9) } },
    { name: "the hard tables in a bracket", limits: { ...BRACKET, divisors: span(6, 9), quotient: r(2, 9) } },
    { name: "the widest question in a bracket", limits: { ...BRACKET, divisors: [10], quotient: r(10, 10) } },
    { name: "one table in a bracket, up", limits: { ...BRACKET, divisors: [6], order: "up" } },
  ],
  smallSpaces: [
    { name: "one question", limits: { ...WIDE, divisors: [6], quotient: r(7, 7) }, questions: each("42÷6") },
    { name: "two tables", limits: { ...WIDE, divisors: [2, 5], quotient: r(3, 5) }, questions: each("6÷2, 8÷2, 10÷2, 15÷5, 20÷5, 25÷5") },
    { name: "a table in a bracket with 0 and 1", limits: { ...BRACKET, divisors: [9], quotient: r(0, 1) }, questions: each("9)0, 9)9") },
    { name: "a table in order", limits: { ...TABLE_7, quotient: r(0, 3) }, questions: each("0÷7, 7÷7, 14÷7, 21÷7") },
    { name: "the largest numbers", limits: { ...BRACKET, divisors: [9, 10], quotient: r(9, 10) }, questions: each("9)81, 9)90, 10)90, 10)100") },
  ],
  witnesses: [
    { limit: "divisors", limits: { ...WIDE, divisors: [2, 5] }, inside: q("15÷5"), outside: q("12÷4") },
    { limit: "quotient", limits: TABLE_7, inside: q("63÷7"), outside: q("70÷7") },
    { limit: "quotient", limits: TABLE_7, inside: q("7÷7"), outside: q("0÷7") },
    { limit: "form", limits: WIDE, inside: q("35÷5"), outside: q("5)35") },
    { limit: "form", limits: BRACKET, inside: q("5)35"), outside: q("35÷5") },
  ],
  harder: [
    { name: "the table of 10 after 2", easier: q("20÷2"), harder: q("10÷10") }, { name: "the table of 5 after 10", easier: q("100÷10"), harder: q("5÷5") }, { name: "the table of 3 after 5", easier: q("50÷5"), harder: q("3÷3") },
    { name: "the larger table", easier: q("40÷4"), harder: q("12÷6") }, { name: "the larger quotient", easier: q("42÷7"), harder: q("49÷7") }, { name: "the last table", easier: q("8)80"), harder: q("9)9") },
  ],
  examples: [
    { name: "a fact", rows: q("35÷5"), answer: whole(7), steps: line("5 × 7 = 35", "35 ÷ 5 = 7", "7") },
    { name: "its swapped form", rows: q("35÷7"), answer: whole(5), steps: line("7 × 5 = 35", "35 ÷ 7 = 5", "5") },
    { name: "a fact in a bracket", rows: q("5)35"), answer: whole(7), steps: line("5 × 7 = 35", "35 ÷ 5 = 7", "7") },
    { name: "a fact of 0", rows: q("0÷9"), answer: whole(0), steps: line("9 × 0 = 0", "0 ÷ 9 = 0", "0") },
    { name: "the largest fact", rows: q("10)100"), answer: whole(10), steps: line("10 × 10 = 100", "100 ÷ 10 = 10", "10") },
  ],
  refusedLimits: [
    { name: "not an object", raw: 5, problem: "the limits must be an object" },
    { name: "a divisor of 1", raw: { ...WIDE, divisors: [1, 2] }, problem: "divisors must be from 2 to 10" },
    { name: "a divisor of 0", raw: { ...WIDE, divisors: [0] }, problem: "divisors must be from 2 to 10" },
    { name: "a range of divisors", raw: { ...WIDE, divisors: r(2, 5) }, problem: "divisors must be a list of 1 or more numbers" },
    { name: "a quotient of 11", raw: { ...WIDE, quotient: r(2, 11) }, problem: "quotient must be from 0 to 10" },
    { name: "an unknown order", raw: { ...WIDE, order: "ordered" }, problem: 'order must be "mixed" or "up" or "down"' },
    { name: "both forms", raw: { ...WIDE, form: "either" }, problem: 'form must be "line" or "bracket"' },
    { name: "no form", raw: { divisors: [2], quotient: r(1, 2), order: "mixed" }, problem: 'form must be "line" or "bracket"' },
    { name: "a limit of another shape", raw: { ...WIDE, remainder: "none" }, problem: 'unknown limit "remainder"' },
  ],
  refusedRows: ([["nothing", []], ["no blank", ["35÷5="]], ["an answer", ["35÷5=7"]], ["something left", ["36÷5=□"]], ["something left in a bracket", ["□", "5)36"]], ["a divisor of 1", ["5÷1=□"]], ["a divisor of 0", ["0÷0=□"]], ["a divisor of 11", ["22÷11=□"]], ["a quotient of 11", ["55÷5=□"]],
    ["a remainder area", ["35÷5=□R□"]], ["another sign", ["35×5=□"]], ["the numbers of a bracket with no sign", ["□", "535"]], ["the largest numbers with no sign", ["□", "10100"]], ["a bracket with no blank", ["5)35"]], ["a blank below a bracket", ["5)35", "□"]], ["a line below a blank", ["□", "35÷5="]], ["two brackets", ["□", "5)35)7"]], ["a zero in front", ["035÷5=□"]], ["three numbers", ["70÷5÷2=□"]]] as const).map(([name, rows]) => ({ name, rows })),
};

