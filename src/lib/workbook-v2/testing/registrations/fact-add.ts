import { each, factRegistration, r, span, wideFacts } from "../fact-registration";
import type { Limits } from "../shape-registration";

const WIDE = wideFacts(20, 20, 20);
const TABLE_6: Limits = { ...WIDE, tables: [6], second: r(1, 9), order: "up" };
const row = (text: string) => [`${text}=□`];

export const factAddRegistration = factRegistration({
  id: "fact.add", sign: "+", most: [20, 20, 20], swaps: true,
  result: (a, b) => [...span(1, a), ...span(1, b)].length,
}, [
  ["a fact", "3+5=□", "3 + 5 = 8"], ["past ten", "7+5=□", "7 + 5 = 12"], ["nothing more", "0+0=□", "0 + 0 = 0"], ["the largest sum", "20+0=□", "20 + 0 = 20"],
], {
  cases: [
    { name: "every question", limits: WIDE },
    { name: "up to 9 + 9", limits: { ...WIDE, tables: span(1, 9), second: r(1, 9) } },
    { name: "sums to 10", limits: { ...WIDE, tables: span(1, 9), second: r(1, 9), result: r(2, 10) } },
    { name: "the table of 6, up", limits: TABLE_6 },
    { name: "the table of 6, down", limits: { ...TABLE_6, order: "down" } },
  ],
  smallSpaces: [
    { name: "one question", limits: { ...WIDE, tables: [8], second: r(7, 7) }, questions: each("8+7=□") },
    { name: "sums of 11 and 12", limits: { ...WIDE, tables: [2, 9], result: r(11, 12) }, questions: each("2+9=□ 2+10=□ 9+2=□ 9+3=□") },
    { name: "a table that ends at 20", limits: { ...WIDE, tables: [18], order: "down" }, questions: each("18+0=□ 18+1=□ 18+2=□") },
  ],
  witnesses: [
    { limit: "tables", limits: { ...WIDE, tables: [2, 5] }, inside: row("5+3"), outside: row("4+3") },
    { limit: "second", limits: TABLE_6, inside: row("6+9"), outside: row("6+10") },
    { limit: "second", limits: TABLE_6, inside: row("6+1"), outside: row("6+0") },
    { limit: "result", limits: { ...WIDE, result: r(5, 10) }, inside: row("6+4"), outside: row("6+5") },
    { limit: "result", limits: { ...WIDE, result: r(5, 10) }, inside: row("4+1"), outside: row("3+1") },
  ],
  harder: [
    { name: "past ten", easier: row("6+4"), harder: row("6+5") }, { name: "a larger sum", easier: row("2+3"), harder: row("2+4") }, { name: "a larger smaller number", easier: row("8+1"), harder: row("5+4") },
    { name: "past ten more than a teen number", easier: row("12+5"), harder: row("7+4") },
  ],
  refusedLimits: [
    { name: "a table of 21", raw: { ...WIDE, tables: [21] }, problem: "tables must be from 0 to 20" },
    { name: "a sum past 20", raw: { ...WIDE, result: r(0, 21) }, problem: "result must be from 0 to 20" },
    { name: "no question", raw: { ...WIDE, tables: [20], second: r(1, 20) }, problem: "no question meets these limits" },
  ],
  refusedRows: ([["nothing", []], ["no blank", ["3+5="]], ["a blank that is not at the end", ["3+□=8"]], ["another sign", ["3×5=□"]], ["a sum past 20", ["15+6=□"]], ["a number past 20", ["21+0=□"]], ["three numbers", ["3+5+2=□"]], ["a zero in front", ["3+05=□"]]] as const).map(([name, rows]) => ({ name, rows })),
});
