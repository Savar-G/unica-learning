// Synthetic stored spot-the-error questions (C2), in the shape the generator stores them (workbook-step-items.ts): the
// question's printed text and template check, with a "right" choice (ticked Yes or No, checked by template-shown with the
// shown answer) and a "fix" box (checked by the template). The numbers are made up here, never a customer's. For tests,
// the behaviour gate and the practice suite. Pure TypeScript.
import type { QuestionPackage } from "@/lib/question-package";
import { printedMissing } from "./missing-number-fixtures";
import { storedPlaceValue, type PlaceValueVariant } from "./place-value-samples";
import type { Place } from "@/lib/question-package";

/**
 * A stored one-box question (its box and its one template check) printed as Spot the error, with `shown` as the answer
 * given. "Is it right?" is Yes only when the shown answer is the box's key.
 */
export function asSpot(stored: QuestionPackage, shown: number): QuestionPackage {
  const item = stored.item!;
  const box = item.regions.find((r) => r.kind === "box")!;
  const check = item.checks.find((c) => c.kind === "template")!;
  if (box.kind !== "box" || box.answer?.type !== "number" || check.kind !== "template") throw new Error("asSpot: not a one-box template question");
  return {
    ...stored,
    id: `${stored.id}:spot-${shown}`,
    item: {
      format: "spot-the-error", scorable: true, parentChecked: false, error: null,
      regions: [
        { id: "right", kind: "choice", mark: "tick", label: "Is it right?", choices: ["Yes", "No"], answer: shown === box.answer.value ? "Yes" : "No" },
        { id: "fix", kind: "box", label: "Fix it", answer: box.answer },
      ],
      checks: [
        { kind: "template-shown", region: "right", source: check.source, shown: String(shown) },
        { kind: "template", region: "fix", source: check.source },
      ],
    },
  };
}

const int = (value: number) => ({ int: String(value) });

/** 5.9-multiply-tens#1.1 printed as Spot the error: "a × b = ?" with b = b0 rounded down to tens. */
export function spotMultiplyTens(a0: number, b0: number, shown: number): QuestionPackage {
  const b = Math.floor(b0 / 10) * 10;
  return asSpot({
    id: `spot-multiply-${a0}-${b0}`,
    ref: { source: "workbook", workbookId: "00000000-0000-4000-8000-0000000000c2", page: 14, question: 10 },
    templateId: "5.9-multiply-tens#1.1:bare", textSource: "code", text: `${a0} × ${b} = ?`,
    operation: null, answer: null, steps: [], wrongAnswers: [], easierExample: null,
    level: 16, difficulty: 1, skill: { standard: "5.9", skills: ["5.9-multiply-tens"] },
    item: {
      format: "write-number", scorable: true, parentChecked: false, error: null,
      regions: [{ id: "answer", kind: "box", label: null, answer: { type: "number", value: a0 * b } }],
      checks: [{
        kind: "template", region: "answer",
        source: {
          answer: "a * b", check: "b0 >= 10", values: null, derived: [["a", "a0"], ["b", "b0 // 10 * 10"]],
          slots: [{ name: "a0", value: int(a0), domain: { min: 1, max: 9 } }, { name: "b0", value: int(b0), domain: { min: 10, max: 900 } }],
        },
      }],
    },
  }, shown);
}

/** A missing factor printed as Spot the error: "known × ? = total". */
export function spotMissing(known: number, missing: number, shown: number): QuestionPackage {
  return asSpot(printedMissing({ known, missing, sign: "×", id: `spot-missing-${known}-${missing}` }), shown);
}

/** A place-value digit or value ask printed as Spot the error. */
export function spotPlaceValue(variant: PlaceValueVariant, n0: number, place: Place, shown: number): QuestionPackage {
  return asSpot(storedPlaceValue({ variant, n0, place }), shown);
}
