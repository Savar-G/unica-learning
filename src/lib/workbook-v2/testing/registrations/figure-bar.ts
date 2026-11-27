// The facts of figure.bar. The shape adds the parts of the bars; this file multiplies the count of bars by the number in
// one of them, and lists every bar model that can print.
import { rangeLimit, step, wholeAnswer, type Limits, type Printed, type Rows, type ShapeRegistration } from "../shape-registration";

const r = (min: number, max: number) => ({ min, max });
const WIDE: Limits = { groups: r(2, 6), size: r(2, 99), product: r(4, 594) };
const TOTAL_ROW = "? | Total = | □";

/** The bars in one row, each part apart, and the total in the next. */
const rowsOf = (groups: number, size: number): Rows => [Array.from({ length: groups }, () => String(size)).join(" | "), TOTAL_ROW];

function read(rows: Rows): Printed | null {
  if (rows.length !== 2 || rows[1] !== TOTAL_ROW) return null;
  const found = /^([1-9]\d?)((?: \| \1(?!\d)){1,5})$/.exec(rows[0]);
  if (!found || Number(found[1]) < 2) return null;
  const [size, groups] = [Number(found[1]), 1 + found[2].split(" | ").length - 1];
  const total = groups * size;
  return {
    answer: wholeAnswer(String(total)),
    features: { groups, size, product: total },
    // More bars are wider, and of the same bars the larger number: a single width that orders them so.
    widths: { bars: groups, widest: groups * 1000 + size },
    steps: [step(`${Array.from({ length: groups }, () => size).join(" + ")} = ${total}`), step(`${groups} × ${size} = ${total}`), step(String(total))],
  };
}

const EVERY: Rows[] = [];
for (let groups = 2; groups <= 6; groups++) for (let size = 2; size <= 99; size++) EVERY.push(rowsOf(groups, size));

export const figureBarRegistration: ShapeRegistration = {
  id: "figure.bar", working: "lines",
  limits: { groups: rangeLimit(2, 6), size: rangeLimit(2, 99), product: rangeLimit(4, 594) },
  read,
  space: EVERY,
  cases: [
    { name: "every bar model", limits: WIDE },
    { name: "two or three small bars", limits: { groups: r(2, 3), size: r(2, 20), product: r(4, 60) } },
    { name: "four to six bars", limits: { groups: r(4, 6), size: r(2, 25), product: r(8, 150) } },
    { name: "larger bars", limits: { groups: r(2, 4), size: r(10, 50), product: r(20, 200) } },
    { name: "five or six bars", limits: { groups: r(5, 6), size: r(10, 99), product: r(50, 594) } },
    { name: "a total of 100 at most", limits: { ...WIDE, product: r(4, 100) } },
  ],
  smallSpaces: [
    { name: "one question", limits: { groups: r(6, 6), size: r(99, 99), product: r(4, 594) }, questions: [rowsOf(6, 99)] },
    { name: "a total of 12", limits: { ...WIDE, product: r(12, 12) }, questions: [rowsOf(2, 6), rowsOf(3, 4), rowsOf(4, 3), rowsOf(6, 2)] },
    { name: "two or three bars of 2 or 3", limits: { groups: r(2, 3), size: r(2, 3), product: r(4, 594) }, questions: [rowsOf(2, 2), rowsOf(2, 3), rowsOf(3, 2), rowsOf(3, 3)] },
  ],
  witnesses: [
    { limit: "groups", limits: { ...WIDE, groups: r(3, 4) }, inside: rowsOf(4, 10), outside: rowsOf(5, 10) },
    { limit: "groups", limits: { ...WIDE, groups: r(3, 4) }, inside: rowsOf(3, 10), outside: rowsOf(2, 10) },
    { limit: "size", limits: { ...WIDE, size: r(10, 20) }, inside: rowsOf(3, 20), outside: rowsOf(3, 21) },
    { limit: "size", limits: { ...WIDE, size: r(10, 20) }, inside: rowsOf(3, 10), outside: rowsOf(3, 9) },
    { limit: "product", limits: { ...WIDE, product: r(30, 100) }, inside: rowsOf(4, 25), outside: rowsOf(4, 26) },
    { limit: "product", limits: { ...WIDE, product: r(30, 100) }, inside: rowsOf(3, 10), outside: rowsOf(2, 14) },
  ],
  // More bars come first, then the larger number in each bar, which at one count of bars is also the larger total.
  harder: [
    { name: "more groups, though the bars are smaller", easier: rowsOf(3, 99), harder: rowsOf(4, 2) },
    { name: "a larger size and a larger total", easier: rowsOf(4, 12), harder: rowsOf(4, 13) },
    { name: "more groups, though the total is smaller", easier: rowsOf(2, 50), harder: rowsOf(3, 20) },
  ],
  examples: [
    { name: "four bars of 15", rows: rowsOf(4, 15), answer: wholeAnswer("60"), steps: [step("15 + 15 + 15 + 15 = 60"), step("4 × 15 = 60"), step("60")] },
    { name: "the smallest", rows: rowsOf(2, 2), answer: wholeAnswer("4"), steps: [step("2 + 2 = 4"), step("2 × 2 = 4"), step("4")] },
    { name: "the largest", rows: rowsOf(6, 99), answer: wholeAnswer("594"), steps: [step("99 + 99 + 99 + 99 + 99 + 99 = 594"), step("6 × 99 = 594"), step("594")] },
  ],
  refusedLimits: [
    { name: "not an object", raw: [], problem: "the limits must be an object" },
    { name: "one bar", raw: { ...WIDE, groups: r(1, 6) }, problem: "groups must be from 2 to 6" },
    { name: "seven bars", raw: { ...WIDE, groups: r(2, 7) }, problem: "groups must be from 2 to 6" },
    { name: "a size of 1", raw: { ...WIDE, size: r(1, 9) }, problem: "size must be from 2 to 99" },
    { name: "a total of 595", raw: { ...WIDE, product: r(4, 595) }, problem: "product must be from 4 to 594" },
    { name: "a limit of another shape", raw: { ...WIDE, carries: r(0, 1) }, problem: 'unknown limit "carries"' },
    { name: "large bars with a small total", raw: { ...WIDE, size: r(60, 99), product: r(4, 100) }, problem: "no question meets these limits (a wider size or product has some)" },
  ],
  refusedRows: ([
    ["nothing", []], ["only the bars", ["15 | 15"]], ["only the total", [TOTAL_ROW]], ["one bar", ["15", TOTAL_ROW]], ["seven bars", ["2 | 2 | 2 | 2 | 2 | 2 | 2", TOTAL_ROW]],
    ["bars that differ", ["15 | 16", TOTAL_ROW]], ["a zero in front", ["05 | 05", TOTAL_ROW]], ["bars of 1", ["1 | 1", TOTAL_ROW]], ["bars of 100", ["100 | 100", TOTAL_ROW]],
    ["no separator", ["1515", TOTAL_ROW]], ["no question mark", ["15 | 15", "Total = | □"]], ["no prompt", ["15 | 15", "? | □"]], ["no blank", ["15 | 15", "? | Total ="]],
    ["the total first", [TOTAL_ROW, "15 | 15"]], ["a row more", ["15 | 15", TOTAL_ROW, "30"]], ["a sign", ["+15 | +15", TOTAL_ROW]],
  ] as const).map(([name, rows]) => ({ name, rows })),
};
