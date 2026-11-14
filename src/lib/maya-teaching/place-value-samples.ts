// Synthetic stored place-value workbook questions (B1a), shaped as the generator stores the 5.1-place-value-million
// templates (data/curriculum/step-progressions-k9.v1.json): the printed text, the template key, and the item's template
// check with its slot, derived values, check and answer expression. The numbers are made up here, never a customer's.
// For tests, the behaviour gate and the practice suite. Pure TypeScript.
import type { Place, QuestionPackage } from "@/lib/question-package";
import { digitAt, placeIndex } from "@/lib/question-package-place-value";

/** The template variants of the place-value digit and value asks. */
export type PlaceValueVariant = "1.1" | "1.2" | "1.3" | "2.1" | "2.2" | "2.3" | "3.1" | "3.2" | "3.3";

/** The zero-placeholder variants' derived number: n0 with one digit made 0, unless it already has a 0. */
export const ZERO_DERIVED = "n0 if '0' in str(n0) else n0 - n0 // (10 ** (1 + n0 % 4)) % 10 * 10 ** (1 + n0 % 4)";

/** The printed number of a zero-placeholder slot value, as ZERO_DERIVED makes it. */
export function zeroPrinted(n0: number): number {
  if (String(n0).includes("0")) return n0;
  const k = 1 + (n0 % 4);
  return n0 - digitAt(n0, k) * 10 ** k;
}

/**
 * A stored question as the generator prints it, with no teaching data. `n0` is the slot value (the printed number,
 * except in the zero-placeholder variants 3.x, where ZERO_DERIVED makes it). `form` picks the printed form of a value
 * ask: "of" ("What is the value of the digit in the ... place of N?") or "short" ("N: value of the ... digit?").
 */
export function storedPlaceValue(input: {
  variant: PlaceValueVariant;
  n0: number;
  place: Place;
  page?: number;
  question?: number;
  form?: "of" | "short";
  name?: string;
  sign?: string;
}): QuestionPackage {
  const { variant, n0, place } = input;
  const step = variant[0];
  const ask = variant[2] === "1" ? "digit" : "value";
  const story = variant[2] === "3";
  const zero = step === "3";
  const n = zero ? zeroPrinted(n0) : n0;
  const k = placeIndex(place);
  const p = 10 ** k;
  const answerExpression = ask === "digit" ? `n // ${p} % 10` : `n // ${p} % 10 * ${p}`;
  const text = ask === "digit"
    ? `In ${n}, which digit is in the ${place} place?`
    : story
      ? `${input.name ?? "Zara"} saw the number ${n} on a sign at ${input.sign ?? "the park"}. What is the value of the digit in the ${place} place?`
      : input.form === "short"
        ? `${n}: value of the ${place} digit?`
        : `What is the value of the digit in the ${place} place of ${n}?`;
  const answer = ask === "digit" ? digitAt(n, k) : digitAt(n, k) * p;
  const domain = step === "1" ? { min: 10000, max: 99999 } : { min: 100000, max: 999999 };
  return {
    id: `synthetic-place-value-${variant}-${n0}-${place.replace(" ", "-")}`,
    ref: { source: "workbook", workbookId: "00000000-0000-4000-8000-00000000b1a0", page: input.page ?? 4, question: input.question ?? 1 },
    templateId: `5.1-place-value-million#${variant}:${story ? "story" : "bare"}`,
    text,
    textSource: "code",
    level: 16,
    difficulty: 1,
    skill: { standard: "5.1", skills: ["5.1-place-value-million"] },
    operation: null,
    answer: null,
    steps: [],
    wrongAnswers: [],
    easierExample: null,
    item: {
      format: "write-number",
      scorable: true,
      parentChecked: false,
      error: null,
      regions: [{ id: "answer", kind: "box", label: null, answer: { type: "number", value: answer } }],
      checks: [{
        kind: "template",
        region: "answer",
        source: {
          answer: answerExpression,
          check: zero ? null : "'0' not in str(n)",
          derived: [["n", zero ? ZERO_DERIVED : "n0"]],
          slots: [{ name: "n0", value: { int: String(n0) }, domain }],
          values: null,
        },
      }],
    },
  } as unknown as QuestionPackage;
}
