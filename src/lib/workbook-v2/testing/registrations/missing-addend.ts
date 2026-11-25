import { missingRegistration, r, span } from "../missing-registration";
import type { Limits } from "../shape-registration";

const WIDE: Limits = { tables: span(0, 20), missing: r(0, 20), result: r(0, 20), blank: "either" };
const TO_10: Limits = { tables: span(1, 9), missing: r(1, 9), result: r(10, 10), blank: "second" };

export const missingAddendRegistration = missingRegistration({
  id: "missing.addend", sign: "+", back: "-", known: [0, 20], most: [20, 20],
  result: (a, b) => [...span(1, a), ...span(1, b)].length,
}, [
  ["the second number", "3+□=8", ["8 - 3 = 5", "3 + 5 = 8", "5"]], ["the first number", "□+3=8", ["8 - 3 = 5", "5 + 3 = 8", "5"]],
  ["a known 0", "0+□=8", ["8 - 0 = 8", "0 + 8 = 8", "8"]], ["a missing 0", "□+20=20", ["20 - 20 = 0", "0 + 20 = 20", "0"]],
], {
  cases: [{ name: "every question", limits: WIDE }, { name: "sums to 10", limits: { ...WIDE, tables: span(1, 9), missing: r(1, 9), result: r(2, 10) } }, { name: "make 10", limits: TO_10 }],
  smallSpaces: [
    { name: "one question", limits: { ...TO_10, tables: [3] }, questions: [["3+□=10"]] },
    { name: "both places", limits: { ...WIDE, tables: [8], missing: r(5, 6) }, questions: [["□+8=13"], ["8+□=13"], ["□+8=14"], ["8+□=14"]] },
  ],
  witnesses: [
    { limit: "tables", limits: { ...WIDE, tables: [2, 7] }, inside: ["□+7=9"], outside: ["□+5=9"] },
    { limit: "missing", limits: { ...WIDE, missing: r(2, 9) }, inside: ["4+□=13"], outside: ["4+□=14"] },
    { limit: "missing", limits: { ...WIDE, missing: r(2, 9) }, inside: ["4+□=6"], outside: ["4+□=5"] },
    { limit: "result", limits: TO_10, inside: ["4+□=10"], outside: ["4+□=11"] },
    { limit: "result", limits: TO_10, inside: ["4+□=10"], outside: ["4+□=9"] },
    { limit: "blank", limits: TO_10, inside: ["4+□=10"], outside: ["□+4=10"] },
  ],
  harder: [{ name: "a larger sum", easier: ["4+□=10"], harder: ["4+□=11"] }, { name: "a larger missing number", easier: ["6+□=10"], harder: ["4+□=10"] }, { name: "the blank in the first place", easier: ["4+□=10"], harder: ["□+4=10"] }],
  refusedLimits: [{ name: "a known number of 21", raw: { ...WIDE, tables: [21] }, problem: "tables must be from 0 to 20" }, { name: "no question", raw: { ...TO_10, tables: [20] }, problem: "no question meets these limits" }],
  refusedRows: ([["nothing", []], ["a sum below the known number", ["8+□=3"]], ["two blanks", ["□+□=8"]], ["no blank", ["3+5=8"]], ["a blank at the end", ["3+5=□"]], ["a sum of 21", ["3+□=21"]], ["another sign", ["3×□=9"]], ["a zero in front", ["3+□=08"]]] as const).map(([name, rows]) => ({ name, rows })),
});
