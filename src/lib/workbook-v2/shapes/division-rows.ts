// The second computation of the division shapes. It reads the printed rows and looks for every quotient and remainder that
// give the dividend back: quotient × divisor + remainder, with 0 <= remainder < divisor. It divides nothing and shares no
// code with the shapes.
import type { Answer } from "../contract";
import type { DivisionQuestion } from "./division";
import type { Item } from "./shape";

const LINE = /^(0|[1-9]\d{0,2})÷([1-9]\d?)=□(R□)?$/;
const BRACKET = /^□(R□)?\n([1-9]\d?)\)(0|[1-9]\d{0,2})$/;

export interface Found { dividend: number; divisor: number; quotient: number; remainder: number; parts: 1 | 2 }

function printedOf(rows: readonly string[]): DivisionQuestion | null {
  const line = rows.length === 1 ? LINE.exec(rows[0]) : null;
  if (line) return { dividend: Number(line[1]), divisor: Number(line[2]), form: "line", parts: line[3] ? 2 : 1 };
  const bracket = rows.length === 2 ? BRACKET.exec(rows.join("\n")) : null;
  return bracket && { dividend: Number(bracket[3]), divisor: Number(bracket[2]), form: "bracket", parts: bracket[1] ? 2 : 1 };
}

/** The question that the rows print and its one answer, or null. `isOfShape` says which questions the shape has. */
export function solveDivision(rows: readonly string[], isOfShape: (found: Found) => boolean): Item<DivisionQuestion> | null {
  const question = printedOf(rows);
  if (!question) return null;
  const { dividend, divisor, parts } = question;
  const pairs: [quotient: number, remainder: number][] = [];
  for (let quotient = 0; quotient * divisor <= dividend; quotient++) {
    for (let remainder = 0; remainder < divisor; remainder++) if (quotient * divisor + remainder === dividend && (parts === 2 || remainder === 0)) pairs.push([quotient, remainder]);
  }
  const [only, ...more] = pairs;
  if (!only || more.length > 0) return null;
  const [quotient, remainder] = only;
  if (!isOfShape({ dividend, divisor, quotient, remainder, parts })) return null;
  const answer: Answer = { parts: (parts === 1 ? [["answer", quotient] as const] : [["quotient", quotient] as const, ["remainder", remainder] as const]).map(([name, value]) => ({ name, kind: "whole-number", value: String(value) })) };
  return { question, answer };
}
