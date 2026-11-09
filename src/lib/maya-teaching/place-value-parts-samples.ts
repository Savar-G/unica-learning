// Synthetic stored place-value questions for B1b, shaped as the generator stores the 5.1-place-value-million compare
// (#x.5) and sum (#x.7) templates and the 4.2-tenths build (#3.1): the printed text, the template key, and the item's
// template check with its slots, derived values, check and answer expression. The numbers are made up here, never a
// customer's. For tests, the behaviour gate and the practice suite. Pure TypeScript.
import type { Place, QuestionPackage } from "@/lib/question-package";
import { digitAt, placeIndex } from "@/lib/question-package-place-value";
import { ZERO_DERIVED, zeroPrinted } from "./place-value-samples";

const base = (id: string, templateId: string, text: string, page: number, question: number) => ({
  id,
  ref: { source: "workbook", workbookId: "00000000-0000-4000-8000-00000000b1b0", page, question },
  templateId,
  text,
  textSource: "code",
  level: 16,
  difficulty: 2,
  operation: null,
  answer: null,
  steps: [],
  wrongAnswers: [],
  easierExample: null,
});

/**
 * A stored compare: "True or false: in N, the digit in the P1 place is bigger than the digit in the P2 place." `step` is
 * the template's step (1: five digits, 2: six, 3: six with a zero placeholder made by ZERO_DERIVED from `n0`).
 */
export function storedCompare(input: { step: 1 | 2 | 3; n0: number; place: Place; second: Place; page?: number; question?: number }): QuestionPackage {
  const { step, n0, place, second } = input;
  const n = step === 3 ? zeroPrinted(n0) : n0;
  const [pa, pb] = [10 ** placeIndex(place), 10 ** placeIndex(second)];
  const word = digitAt(n, placeIndex(place)) > digitAt(n, placeIndex(second)) ? "true" : "false";
  return {
    ...base(`synthetic-place-compare-${step}-${n0}`, `5.1-place-value-million#${step}.5:true-false`,
      `True or false: in ${n}, the digit in the ${place} place is bigger than the digit in the ${second} place.`, input.page ?? 4, input.question ?? 3),
    skill: { standard: "5.1", skills: ["5.1-place-value-million"] },
    item: {
      format: "circle", scorable: true, parentChecked: false, error: null,
      regions: [{ id: "answer", kind: "choice", mark: "circle", label: null, choices: ["true", "false"], answer: word }],
      checks: [{
        kind: "template-choice", region: "answer",
        source: {
          answer: `'true' if n // ${pa} % 10 > n // ${pb} % 10 else 'false'`, check: step === 3 ? null : "'0' not in str(n)",
          derived: [["n", step === 3 ? ZERO_DERIVED : "n0"]], values: null,
          slots: [{ name: "n0", value: { int: String(n0) }, domain: step === 1 ? { min: 10000, max: 99999 } : { min: 100000, max: 999999 } }],
        },
      }],
    },
  } as unknown as QuestionPackage;
}

/** A stored sum: "In N, what is the value of the P1 digit plus the value of the P2 digit?" (form "of" is #2.7's wording). */
export function storedSum(input: { step: 1 | 2 | 3; n0: number; place: Place; second: Place; page?: number; question?: number }): QuestionPackage {
  const { step, n0, place, second } = input;
  const n = step === 3 ? zeroPrinted(n0) : n0;
  const [pa, pb] = [10 ** placeIndex(place), 10 ** placeIndex(second)];
  const answer = digitAt(n, placeIndex(place)) * pa + digitAt(n, placeIndex(second)) * pb;
  const text = step === 2
    ? `What is the value of the ${place} digit of ${n} plus the value of its ${second} digit?`
    : `In ${n}, what is the value of the ${place} digit plus the value of the ${second} digit?`;
  return {
    ...base(`synthetic-place-sum-${step}-${n0}`, `5.1-place-value-million#${step}.7:bare`, text, input.page ?? 10, input.question ?? 1),
    skill: { standard: "5.1", skills: ["5.1-place-value-million"] },
    item: {
      format: "show-work", scorable: true, parentChecked: false, error: null,
      regions: [{ id: "answer", kind: "box", label: null, answer: { type: "number", value: answer } }, { id: "work", kind: "work", label: "Show your work" }],
      checks: [{
        kind: "template", region: "answer",
        source: {
          answer: `n // ${pa} % 10 * ${pa} + n // ${pb} % 10 * ${pb}`, check: step === 3 ? `n // ${pb} % 10 > 0 and n >= 500000` : "'0' not in str(n)",
          derived: [["n", step === 3 ? ZERO_DERIVED : "n0"]], values: null,
          slots: [{ name: "n0", value: { int: String(n0) }, domain: step === 1 ? { min: 10000, max: 99999 } : { min: 100000, max: 999999 } }],
        },
      }],
    },
  } as unknown as QuestionPackage;
}

/** A stored tenths build: "W wholes and T tenths is ? as a decimal." */
export function storedBuild(input: { wholes: number; tenths: number; page?: number; question?: number }): QuestionPackage {
  const { wholes: w, tenths: t } = input;
  return {
    ...base(`synthetic-place-build-${w}-${t}`, "4.2-tenths#3.1:bare", `${w} ${w === 1 ? "whole" : "wholes"} and ${t} ${t === 1 ? "tenth" : "tenths"} is ? as a decimal.`, input.page ?? 22, input.question ?? 6),
    skill: { standard: "4.2", skills: ["4.2-tenths"] },
    item: {
      format: "write-number", scorable: true, parentChecked: false, error: null,
      regions: [{ id: "answer", kind: "box", label: null, answer: { type: "number", value: (w * 10 + t) / 10 } }],
      checks: [{
        kind: "template", region: "answer",
        source: {
          answer: "round(w + p / 10, 1)", check: "w >= 2", derived: [], values: null,
          slots: [{ name: "w", value: { int: String(w) }, domain: { min: 1, max: 6 } }, { name: "p", value: { int: String(t) }, domain: { min: 1, max: 9 } }],
        },
      }],
    },
  } as unknown as QuestionPackage;
}
