import { each, factRegistration, r, span, wideFacts } from "../fact-registration";
import type { Limits } from "../shape-registration";

const WIDE = wideFacts(20, 20, 20);
const FROM_12: Limits = { ...WIDE, tables: [12], second: r(1, 9), order: "up" };
const row = (text: string) => [`${text}=□`];

export const factSubRegistration = factRegistration({
  id: "fact.sub", sign: "-", most: [20, 20, 20], swaps: false,
  result: (a, b) => (b > a ? null : span(1, a).slice(b).length),
}, [
  ["a fact", "8-5=□", "8 - 5 = 3"], ["through ten", "12-5=□", "12 - 5 = 7"], ["all of it", "9-9=□", "9 - 9 = 0"], ["the largest difference", "20-0=□", "20 - 0 = 20"],
], {
  cases: [
    { name: "every question", limits: WIDE },
    { name: "from 11 to 18, by one digit", limits: { ...WIDE, tables: span(11, 18), second: r(2, 9), result: r(2, 9) } },
    { name: "from 12, up", limits: FROM_12 },
    { name: "from 12, down", limits: { ...FROM_12, order: "down" } },
  ],
  smallSpaces: [
    { name: "one question", limits: { ...WIDE, tables: [13], second: r(7, 7) }, questions: each("13-7=□") },
    { name: "differences of 8 and 9", limits: { ...WIDE, tables: [10, 17], result: r(8, 9) }, questions: each("10-1=□ 10-2=□ 17-8=□ 17-9=□") },
    { name: "no difference below 0", limits: { ...WIDE, tables: [2], order: "up" }, questions: each("2-0=□ 2-1=□ 2-2=□") },
  ],
  witnesses: [
    { limit: "tables", limits: { ...WIDE, tables: [11, 13] }, inside: row("13-5"), outside: row("12-5") },
    { limit: "second", limits: FROM_12, inside: row("12-9"), outside: row("12-10") },
    { limit: "second", limits: FROM_12, inside: row("12-1"), outside: row("12-0") },
    { limit: "result", limits: { ...WIDE, result: r(2, 9) }, inside: row("11-2"), outside: row("11-1") },
    { limit: "result", limits: { ...WIDE, result: r(2, 9) }, inside: row("11-9"), outside: row("11-10") },
  ],
  harder: [
    { name: "through ten", easier: row("17-5"), harder: row("12-5") }, { name: "a larger first number", easier: row("8-3"), harder: row("9-3") }, { name: "far from both ends", easier: row("9-1"), harder: row("9-4") },
    { name: "far from the whole number", easier: row("9-8"), harder: row("9-5") },
  ],
  refusedLimits: [
    { name: "from 21", raw: { ...WIDE, tables: [21] }, problem: "tables must be from 0 to 20" },
    { name: "no question", raw: { ...WIDE, tables: [3], second: r(4, 9) }, problem: "no question meets these limits" },
  ],
  refusedRows: ([["nothing", []], ["no blank", ["8-5="]], ["below 0", ["5-8=□"]], ["another sign", ["8+5=□"]], ["from 21", ["21-5=□"]], ["three numbers", ["8-5-1=□"]], ["a sign in front", ["-8-5=□"]]] as const).map(([name, rows]) => ({ name, rows })),
});
