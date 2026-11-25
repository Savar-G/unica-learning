// The facts of add.repeated. The shape multiplies; this file counts the things of equal groups.
import { rangeLimit, step, wholeAnswer, type Limits, type Printed, type Rows, type ShapeRegistration } from "../shape-registration";

const r = (min: number, max: number) => ({ min, max });
const rowOf = (number: number, count: number): Rows => [`${Array.from({ length: count }, () => number).join("+")}=□`];
/** The things of the first groups, counted one at a time. */
const things = (number: number, groups: number): number => Array.from({ length: groups }, () => Array.from({ length: number })).flat().length;

function read(rows: Rows): Printed | null {
  const found = rows.length === 1 ? /^([1-9]|10)((?:\+\1(?!\d)){1,8})=□$/.exec(rows[0]) : null;
  if (!found) return null;
  const [number, count] = [Number(found[1]), 1 + found[2].split("+").length - 1];
  const total = things(number, count);
  const sums = Array.from({ length: count - 1 }, (_, i) => step(`${things(number, i + 1)} + ${number} = ${things(number, i + 2)}`));
  return { answer: wholeAnswer(String(total)), features: { number, count }, widths: { pieces: 2 * count, characters: String(total).length }, steps: [...sums, step(`${count} × ${number} = ${total}`), step(String(total))] };
}

const WIDE: Limits = { number: r(1, 10), count: r(2, 9) };

export const repeatedAddRegistration: ShapeRegistration = {
  id: "add.repeated", working: "lines",
  limits: { number: rangeLimit(1, 10), count: rangeLimit(2, 9) },
  read,
  space: Array.from({ length: 80 }, (_, i) => rowOf(1 + Math.floor(i / 8), 2 + (i % 8))),
  cases: [{ name: "every question", limits: WIDE }, { name: "3 to 5 equal groups", limits: { number: r(2, 5), count: r(3, 5) } }, { name: "long lines", limits: { number: r(2, 10), count: r(6, 9) } }],
  smallSpaces: [
    { name: "one question", limits: { number: r(10, 10), count: r(9, 9) }, questions: [["10+10+10+10+10+10+10+10+10=□"]] },
    { name: "four questions", limits: { number: r(4, 5), count: r(2, 3) }, questions: [["4+4=□"], ["4+4+4=□"], ["5+5=□"], ["5+5+5=□"]] },
  ],
  witnesses: [
    { limit: "number", limits: { ...WIDE, number: r(2, 5) }, inside: rowOf(5, 3), outside: rowOf(6, 3) },
    { limit: "number", limits: { ...WIDE, number: r(2, 5) }, inside: rowOf(2, 3), outside: rowOf(1, 3) },
    { limit: "count", limits: { ...WIDE, count: r(3, 5) }, inside: rowOf(2, 5), outside: rowOf(2, 6) },
    { limit: "count", limits: { ...WIDE, count: r(3, 5) }, inside: rowOf(2, 3), outside: rowOf(2, 2) },
  ],
  harder: [{ name: "one more number", easier: rowOf(10, 3), harder: rowOf(2, 4) }, { name: "a larger number", easier: rowOf(3, 4), harder: rowOf(4, 4) }],
  examples: ([
    ["three fours", "4+4+4=□", ["4 + 4 = 8", "8 + 4 = 12", "3 × 4 = 12", "12"]],
    ["two numbers", "7+7=□", ["7 + 7 = 14", "2 × 7 = 14", "14"]],
    ["the largest question", "10+10+10+10+10+10+10+10+10=□", ["10 + 10 = 20", "20 + 10 = 30", "30 + 10 = 40", "40 + 10 = 50", "50 + 10 = 60", "60 + 10 = 70", "70 + 10 = 80", "80 + 10 = 90", "9 × 10 = 90", "90"]],
  ] as const).map(([name, row, texts]) => ({ name, rows: [row], answer: wholeAnswer(texts[texts.length - 1]), steps: texts.map((text) => step(text)) })),
  refusedLimits: [
    { name: "a number of 11", raw: { ...WIDE, number: r(2, 11) }, problem: "number must be from 1 to 10" },
    { name: "one number", raw: { ...WIDE, count: r(1, 3) }, problem: "count must be from 2 to 9" },
    { name: "ten numbers", raw: { ...WIDE, count: r(2, 10) }, problem: "count must be from 2 to 9" },
  ],
  refusedRows: ([["nothing", []], ["one number", ["4=□"]], ["two numbers that differ", ["4+5=□"]], ["no blank", ["4+4="]], ["a zero", ["0+0=□"]], ["a number of 11", ["11+11=□"]], ["ten numbers", ["2+2+2+2+2+2+2+2+2+2=□"]], ["another sign", ["4×4=□"]], ["a zero in front", ["04+04=□"]], ["two rows", ["4+4", "=□"]]] as const).map(([name, rows]) => ({ name, rows })),
};
