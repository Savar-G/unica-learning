import { missingRegistration, r, span } from "../missing-registration";
import type { Limits } from "../shape-registration";

const WIDE: Limits = { tables: span(1, 10), missing: r(0, 10), result: r(0, 100), blank: "either" };
const TABLE_7: Limits = { tables: [7], missing: r(2, 9), result: r(0, 100), blank: "first" };

export const missingFactorRegistration = missingRegistration({
  id: "missing.factor", sign: "×", back: "÷", known: [1, 10], most: [10, 100],
  result: (a, b) => span(1, a).flatMap(() => span(1, b)).length,
}, [
  ["the first number", "□×7=35", ["35 ÷ 7 = 5", "5 × 7 = 35", "5"]], ["the second number", "5×□=35", ["35 ÷ 5 = 7", "5 × 7 = 35", "7"]],
  ["a missing 0", "4×□=0", ["0 ÷ 4 = 0", "4 × 0 = 0", "0"]], ["the largest question", "□×10=100", ["100 ÷ 10 = 10", "10 × 10 = 100", "10"]],
], {
  cases: [{ name: "every question", limits: WIDE }, { name: "up to 9 × 9", limits: { ...WIDE, tables: span(2, 9), missing: r(2, 9) } }, { name: "the table of 7, with the blank first", limits: TABLE_7 }, { name: "the second number of easy tables", limits: { ...WIDE, tables: [2, 5, 10], missing: r(1, 10), blank: "second" } }],
  smallSpaces: [
    { name: "one question", limits: { ...TABLE_7, missing: r(5, 5) }, questions: [["□×7=35"]] },
    { name: "both places", limits: { ...TABLE_7, missing: r(5, 6), blank: "either" }, questions: [["□×7=35"], ["7×□=35"], ["□×7=42"], ["7×□=42"]] },
    { name: "products that cut the tables", limits: { ...WIDE, tables: [3, 10], result: r(27, 40), blank: "second" }, questions: [["3×□=27"], ["3×□=30"], ["10×□=30"], ["10×□=40"]] },
  ],
  witnesses: [
    { limit: "tables", limits: { ...WIDE, tables: [2, 7] }, inside: ["□×7=35"], outside: ["□×5=35"] },
    { limit: "missing", limits: TABLE_7, inside: ["□×7=63"], outside: ["□×7=70"] },
    { limit: "missing", limits: TABLE_7, inside: ["□×7=14"], outside: ["□×7=7"] },
    { limit: "result", limits: { ...WIDE, result: r(30, 40) }, inside: ["8×□=40"], outside: ["9×□=45"] },
    { limit: "result", limits: { ...WIDE, result: r(30, 40) }, inside: ["6×□=30"], outside: ["7×□=28"] },
    { limit: "blank", limits: TABLE_7, inside: ["□×7=35"], outside: ["7×□=35"] },
    { limit: "blank", limits: { ...WIDE, blank: "second" }, inside: ["7×□=35"], outside: ["□×7=35"] },
  ],
  harder: [{ name: "a harder table", easier: ["5×□=45"], harder: ["6×□=36"] }, { name: "the blank in the first place", easier: ["7×□=56"], harder: ["□×7=56"] }, { name: "a larger number in the blank", easier: ["7×□=49"], harder: ["7×□=56"] }],
  refusedLimits: [
    { name: "a known factor of 0", raw: { ...WIDE, tables: [0, 1] }, problem: "tables must be from 1 to 10" },
    { name: "a missing number of 11", raw: { ...WIDE, missing: r(0, 11) }, problem: "missing must be from 0 to 10" },
    { name: "an unknown place", raw: { ...WIDE, blank: "last" }, problem: 'blank must be "first" or "second" or "either"' },
    { name: "no question", raw: { ...TABLE_7, result: r(36, 41) }, problem: "no question meets these limits" },
  ],
  refusedRows: ([["nothing", []], ["a known factor of 0", ["0×□=0"]], ["a known factor of 0 in the second place", ["□×0=0"]], ["a product that the table does not have", ["□×7=36"]], ["two blanks", ["□×□=35"]], ["no blank", ["5×7=35"]], ["a blank at the end", ["5×7=□"]],
    ["a missing number of 11", ["□×7=77"]], ["a known factor of 11", ["11×□=55"]], ["another sign", ["□+7=35"]], ["a zero in front", ["□×07=35"]], ["two rows", ["□×7", "=35"]]] as const).map(([name, rows]) => ({ name, rows })),
});
