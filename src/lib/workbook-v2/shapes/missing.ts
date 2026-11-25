// A number is missing: □ × 7 = 35, 5 × □ = 35 and 3 + □ = 8. One operation makes one shape. `tables` is the set of known
// numbers. A known factor of 0 is refused, because each number of the blank would be right.
import type { Step } from "../contract";
import { timesScore } from "./facts";
import { readLimitFields, readLimitsThat, wholeNumber, within, type Item, type Range, type Shape } from "./shape";
import { smallSpace } from "./small-space";

export type Blank = "first" | "second";
export interface MissingLimits { tables: number[]; missing: Range; result: Range; blank: Blank | "either" }
export interface MissingQuestion { known: number; result: number; blank: Blank }

interface Operation {
  id: string;
  sign: string;
  back: string;
  known: Range;
  missing: Range;
  result: Range;
  /** The result for a number in the blank. */
  forward(known: number, missing: number): number;
  /** The number in the blank. */
  inverse(known: number, result: number): number;
  /** How hard the pair is. A blank in the first place is the harder form of one pair. */
  score(known: number, missing: number): number;
}

const MULTIPLY: Operation = {
  id: "missing.factor", sign: "×", back: "÷", known: { min: 1, max: 10 }, missing: { min: 0, max: 10 }, result: { min: 0, max: 100 },
  forward: (known, missing) => known * missing, inverse: (known, result) => result / known, score: timesScore,
};
const ADD: Operation = {
  id: "missing.addend", sign: "+", back: "-", known: { min: 0, max: 20 }, missing: { min: 0, max: 20 }, result: { min: 0, max: 20 },
  forward: (known, missing) => known + missing, inverse: (known, result) => result - known, score: (known, missing) => (known + missing) * 21 + missing,
};

function missingShape({ id, sign, back, known: knowns, missing: missings, result: results, forward, inverse, score }: Operation): Shape<MissingLimits, MissingQuestion> {
  const answer = (q: MissingQuestion) => wholeNumber(inverse(q.known, q.result));
  const item = (question: MissingQuestion): Item<MissingQuestion> => ({ question, answer: answer(question) });

  function list({ tables, missing, result, blank }: MissingLimits): MissingQuestion[] {
    const out: MissingQuestion[] = [];
    for (const known of tables) {
      for (let n = missing.min; n <= missing.max; n++) {
        const total = forward(known, n);
        if (!within(total, result) || !within(total, results)) continue;
        for (const place of ["first", "second"] as const) if (blank === "either" || blank === place) out.push({ known, result: total, blank: place });
      }
    }
    return out;
  }

  return {
    id,
    version: 1,
    answerKind: "whole-number",
    readLimits: (raw) => readLimitsThat<MissingLimits>(readLimitFields(raw, { missing: missings, result: results }, { blank: ["first", "second", "either"] }, { tables: knowns }), (l) => list(l).length),
    ...smallSpace({
      list, item,
      difficulty: (q) => score(q.known, inverse(q.known, q.result)) * 2 + (q.blank === "first" ? 1 : 0),
      form: (q) => q.blank,
      width: (q) => Math.max(...[q.known, q.result, inverse(q.known, q.result)].map((n) => String(n).length)),
    }),
    answer,
    /** Puts one number after the other into the blank, until the line is true: it never takes the inverse. */
    solveAgain(rows) {
      const [row, ...more] = rows;
      const [, first, printedSign, second, total] = /^(□|0|[1-9]\d?)([+×])(□|0|[1-9]\d?)=(0|[1-9]\d{0,2})$/.exec(row ?? "") ?? [];
      if (more.length > 0 || printedSign !== sign || (first === "□") === (second === "□")) return null;
      const [known, result] = [Number(first === "□" ? second : first), Number(total)];
      if (!within(known, knowns) || !within(result, results)) return null;
      for (let n = missings.min; n <= missings.max; n++) {
        let value = sign === "+" ? n : 0;
        if (sign === "+") value += known;
        else for (let i = 0; i < known; i++) value += n;
        if (value === result) return { question: { known, result, blank: first === "□" ? "first" : "second" }, answer: wholeNumber(n) };
      }
      return null;
    },
    steps(q): Step[] {
      const missing = inverse(q.known, q.result);
      const [a, b] = q.blank === "first" ? [missing, q.known] : [q.known, missing];
      return [`${q.result} ${back} ${q.known} = ${missing}`, `${a} ${sign} ${b} = ${q.result}`, String(missing)].map((text) => ({ text, marks: [] }));
    },
    face({ known, result, blank }) {
      const [gap, number] = [{ blank: "answer" }, { text: String(known) }];
      return { kind: "equation", tokens: [...(blank === "first" ? [gap, { text: sign }, number] : [number, { text: sign }, gap]), { text: "=" }, { text: String(result) }] };
    },
  };
}

export const missingFactor = missingShape(MULTIPLY);
export const missingAddend = missingShape(ADD);
