import { each, factRegistration, r, span, wideFacts } from "../fact-registration";
import type { Limits } from "../shape-registration";

const WIDE = wideFacts(10, 10, 100);
const TABLE_5: Limits = { ...WIDE, tables: [5], second: r(1, 9), order: "up" };
const row = (text: string) => [`${text}=□`];

export const factMulRegistration = factRegistration({
  id: "fact.mul", sign: "×", most: [10, 10, 100], swaps: true,
  result: (a, b) => span(1, a).flatMap(() => span(1, b)).length,
}, [
  ["a fact", "5×7=□", "5 × 7 = 35"], ["its swapped form", "7×5=□", "7 × 5 = 35"], ["a fact of 0", "0×9=□", "0 × 9 = 0"], ["the largest fact", "10×10=□", "10 × 10 = 100"],
], {
  cases: [
    { name: "every question", limits: WIDE },
    { name: "up to 9 × 9", limits: { ...WIDE, tables: span(2, 9), second: r(2, 9) } },
    { name: "the table of 5, up", limits: TABLE_5 },
    { name: "the table of 5, down", limits: { ...TABLE_5, order: "down" } },
    { name: "the table of 4, with 0 and 10", limits: { ...WIDE, tables: [4], order: "up" } },
    { name: "the tables of 2, 5 and 10", limits: { ...WIDE, tables: [2, 5, 10], second: r(1, 10) } },
    { name: "the hard tables", limits: { ...WIDE, tables: span(6, 9), second: r(3, 9) } },
  ],
  smallSpaces: [
    { name: "one question", limits: { ...WIDE, tables: [6], second: r(7, 7) }, questions: each("6×7=□") },
    { name: "two tables", limits: { ...WIDE, tables: [2, 5], second: r(3, 5) }, questions: each("2×3=□ 2×4=□ 2×5=□ 5×3=□ 5×4=□ 5×5=□") },
    { name: "a table that the result cuts", limits: { ...WIDE, tables: [3, 10], result: r(27, 40) }, questions: each("3×9=□ 3×10=□ 10×3=□ 10×4=□") },
    { name: "a table in order", limits: { ...TABLE_5, second: r(0, 3) }, questions: each("5×0=□ 5×1=□ 5×2=□ 5×3=□") },
  ],
  witnesses: [
    { limit: "tables", limits: { ...WIDE, tables: [2, 5] }, inside: row("5×3"), outside: row("4×3") },
    { limit: "second", limits: TABLE_5, inside: row("5×9"), outside: row("5×10") },
    { limit: "second", limits: TABLE_5, inside: row("5×1"), outside: row("5×0") },
    { limit: "result", limits: { ...WIDE, result: r(20, 40) }, inside: row("5×8"), outside: row("5×9") },
    { limit: "result", limits: { ...WIDE, result: r(20, 40) }, inside: row("5×4"), outside: row("5×3") },
  ],
  harder: [
    { name: "the table of 1", easier: row("1×0"), harder: row("1×3") }, { name: "the table of 2", easier: row("1×9"), harder: row("2×3") },
    { name: "the table of 10 before 5", easier: row("10×9"), harder: row("5×3") }, { name: "the table of 3 after 5", easier: row("5×9"), harder: row("3×3") },
    { name: "the larger table", easier: row("4×9"), harder: row("6×6") }, { name: "the other number", easier: row("6×7"), harder: row("6×8") },
    { name: "the swapped form is not easier than another fact", easier: row("9×4"), harder: row("6×7") },
  ],
  refusedLimits: [
    { name: "not an object", raw: 5, problem: "the limits must be an object" },
    { name: "a range of tables", raw: { ...WIDE, tables: r(2, 5) }, problem: "tables must be a list of 1 or more numbers" },
    { name: "tables that fall", raw: { ...WIDE, tables: [5, 2] }, problem: "tables must rise, with no number twice" },
    { name: "the table of 11", raw: { ...WIDE, tables: [11] }, problem: "tables must be from 0 to 10" },
    { name: "a second number of 11", raw: { ...WIDE, second: r(2, 11) }, problem: "second must be from 0 to 10" },
    { name: "an unknown order", raw: { ...WIDE, order: "ordered" }, problem: 'order must be "mixed" or "up" or "down"' },
    { name: "no order", raw: { tables: [2], second: r(1, 2), result: r(0, 100) }, problem: 'order must be "mixed" or "up" or "down"' },
    { name: "no question", raw: { ...WIDE, tables: [2, 4], result: r(99, 99) }, problem: "no question meets these limits" },
  ],
  refusedRows: ([["nothing", []], ["no blank", ["5×7="]], ["a blank that is not at the end", ["□×7=35"]], ["an answer", ["5×7=35"]], ["two blanks", ["5×□=□"]], ["another sign", ["5+7=□"]], ["no sign", ["57=□"]],
    ["a zero in front", ["05×7=□"]], ["a number that is too large", ["11×7=□"]], ["three numbers", ["5×7×2=□"]], ["two rows", ["5×7", "=□"]], ["a letter x", ["5x7=□"]]] as const).map(([name, rows]) => ({ name, rows })),
});
