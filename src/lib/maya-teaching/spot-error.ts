// Spot the error for Maya (Wave C, C2; design: .design/research/maya-spot-error-design.md): a workbook item that prints a
// question and a worked answer ("6 × 830 = ? Answer given: 498."). The child ticks "Is it right?" (Yes or No) and, when it
// is not, writes the right answer in the "Fix it" box. The workbook stores it with no operation.
//
// The question under the worked answer is one Maya already teaches (place value, a missing number, one multiply). This
// deriver hands that question to its own deriver, unchanged, as a one-box item: the printed text, the "fix" region and its
// template check. That deriver keeps its own three agreements (the printed text by a closed form, code's result equal to the
// answer key, and the template's expression on the stored slot values). The spot item adds its own checks: the result is
// the fix's key and the template's answer, and "Is it right?" is code's comparison of the result with the shown answer,
// which must be the item's key and the template-shown rule. If any fails, the question stays held. The printed book and the
// stored package never change: only the teaching fields are added. Pure TypeScript: no clock, network or randomness.
import { mayaPackageCheck } from "@/lib/maya/session";
import { equivalent, hasOperation, operationResult, type QuestionPackage } from "@/lib/question-package";
import { templateAnswer } from "@/lib/question-package-template";
import { readSpotItem } from "./spot-item";
import { deriveMissingNumber } from "./missing-number";
import { deriveOneStep } from "./one-step";
import { derivePlaceValue } from "./place-value";
import { derivePattern } from "./pattern";
import { TEACHING_SOURCE } from "./limits";

/** The question under the worked answer: the same package with one box, the fix, and its template check. */
function underlyingQuestion(pkg: QuestionPackage): QuestionPackage | null {
  const item = pkg.item;
  const fix = item?.regions.find((r) => r.id === "fix");
  const check = item?.checks.find((c) => c.kind === "template");
  if (!item || fix?.kind !== "box" || !check) return null;
  return { ...pkg, item: { ...item, format: "write-number", regions: [{ ...fix, label: null }], checks: [check] } };
}

/** The derivers of the questions a spot item may hold, each with its own agreements. */
const UNDERLYING: readonly ((printed: QuestionPackage) => QuestionPackage | null)[] = [deriveMissingNumber, deriveOneStep, derivePlaceValue, derivePattern];

/** The teaching package of a spot-the-error question, or null to leave it held. */
export function deriveSpotError(printed: QuestionPackage): QuestionPackage | null {
  if (printed.operation !== null || printed.answer !== null || printed.easierExample !== null || printed.steps.length > 0) return null;
  const spot = readSpotItem(printed);
  const question = spot ? underlyingQuestion(printed) : null;
  if (!spot || !question) return null;
  for (const derive of UNDERLYING) {
    const made = derive(structuredClone(question));
    if (!made || !hasOperation(made)) continue;
    const result = operationResult(made.operation);
    if (result.type !== "number" || !equivalent(made.answer.value, result)) continue;
    // The spot item's own agreements: the result is the fix's key and the template's answer, and "Is it right?" is code's
    // comparison of the result with the shown answer (the template-shown rule: Yes only when the two are the same).
    const key = templateAnswer(spot.source);
    if (!("answer" in key) || key.answer !== String(result.value) || spot.fix !== result.value) continue;
    const holds = result.value === spot.shown;
    if (spot.right !== (holds ? "Yes" : "No") || (key.answer === String(spot.shown)) !== holds) continue;
    const shownWrong = holds ? [] : [{ value: { type: "number" as const, value: spot.shown }, cause: "spot-shown", description: "Takes the answer given as right.", step: null }];
    const teaching: QuestionPackage = {
      ...printed,
      operationSource: TEACHING_SOURCE,
      operation: made.operation,
      answer: made.answer,
      steps: made.steps,
      wrongAnswers: [...shownWrong, ...made.wrongAnswers.filter((w) => !equivalent(w.value, { type: "number", value: spot.shown }))],
      easierExample: made.easierExample,
    };
    if (mayaPackageCheck(teaching).ok) return teaching;
  }
  return null;
}
