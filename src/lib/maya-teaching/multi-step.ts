// Multi-step workbook questions with no stored operation (Wave A, groups "multi-step-story" and the chained one-step
// items): the story's operations in printed order, as one `evaluate` expression ("5 × 350 − 870"). Maya holds evaluate
// until its teaching lands (A2); this deriver only makes the operation, checked against the printed text, the key and
// the template. A bare chain ("98378 + 1000 + 100 = ?") is read by the #525 equation reader. Pure TypeScript.
import type { Operation, QuestionPackage } from "@/lib/question-package";
import { expressionOperation, FORM_PARTS, printedOperation, printedRelationships, type PrintedForm } from "@/lib/workbook-maya-operation";
import { agreedAnswer } from "./agreement";
import { withShapedExample } from "./examples";
import { MAYA_TEACHING_LIMITS } from "./limits";

const { WORDS, ACTOR, SUBJECT, THINGS, n } = FORM_PARTS;
const PLACE = `(?<place>${WORDS})`;
const expression = (text: string) => expressionOperation(text);

/** The template frames the book prints, as closed forms, each giving its operations in the printed order. */
export const MULTI_STEP_FORMS: readonly PrintedForm[] = [
  // "Jin's shop has 5 boxes with 350 buttons in each. It sells 870 buttons. How many buttons are left?"
  [`${ACTOR}'s ${WORDS} has ${n("a")} boxes with ${n("b")} ${THINGS} in each\\. It sells ${n("c")} \\k<things>\\. How many \\k<things> are left\\?`, v => expression(`${v.a} * ${v.b} - ${v.c}`)],
  // "A school orders 6 boxes of 412 pencils and 8 boxes of 385 pencils. How many pencils is that in all?"
  [`A ${WORDS} orders ${n("a")} boxes of ${n("b")} ${THINGS} and ${n("c")} boxes of ${n("d")} \\k<things>\\. How many \\k<things> is that in all\\?`, v => expression(`${v.a} * ${v.b} + ${v.c} * ${v.d}`)],
  // "Hana's town has 941231 people. 30000 people move in and 1000 people move away. How many people live in the town now?"
  [`${ACTOR}'s town has ${n("a")} people\\. ${n("b")} people move in and ${n("c")} people move away\\. How many people live in the town now\\?`, v => expression(`${v.a} + ${v.b} - ${v.c}`)],
  // "Zara's farm packs 707 eggs each day for 9 days. It sells 3180 eggs. How many eggs does the farm have now?"
  [`${ACTOR}'s ${PLACE} packs ${n("a")} ${THINGS} each day for ${n("b")} days\\. It sells ${n("c")} \\k<things>\\. How many \\k<things> does the \\k<place> have now\\?`, v => expression(`${v.a} * ${v.b} - ${v.c}`)],
  // "Aiyana's school collects 951041 cans for recycling. It collects 9000 more and sends 100 away. How many cans does the school have now?"
  [`${ACTOR}'s ${PLACE} collects ${n("a")} ${THINGS} for recycling\\. It collects ${n("b")} more and sends ${n("c")} away\\. How many \\k<things> does the \\k<place> have now\\?`, v => expression(`${v.a} + ${v.b} - ${v.c}`)],
  // "A game gives 80 points for each level. Jin plays 8 levels, then loses 90 points. How many points does Jin have now?"
  [`A game gives ${n("a")} points for each level\\. ${ACTOR} plays ${n("b")} levels, then loses ${n("c")} points\\. How many points does \\k<who> have now\\?`, v => expression(`${v.a} * ${v.b} - ${v.c}`)],
  // "Jin's bike lock code is 91963. He adds 1000 to it, then takes 10 off. What is the new code?"
  [`${ACTOR}'s (?:${WORDS} )?code is ${n("a")}\\. ${SUBJECT} adds ${n("b")} to it, then takes ${n("c")} off\\. What is the new code\\?`, v => expression(`${v.a} + ${v.b} - ${v.c}`)],
  // "A food bank had 4000 cans, received 2500 more, then gave out 1200. How many cans are left?"
  [`A food bank had ${n("a")} cans, received ${n("b")} more, then gave out ${n("c")}\\. How many cans are left\\?`, v => expression(`${v.a} + ${v.b} - ${v.c}`)],
];
const RELATIONSHIPS = printedRelationships(MULTI_STEP_FORMS);

/** The evaluate operation of a multi-step question, when its printed form, its key and its template agree; else null. */
export function multiStepOperation(printed: QuestionPackage): Operation | null {
  const operation = printedOperation(printed.text, RELATIONSHIPS);
  if (operation?.kind !== "evaluate" || operation.values !== undefined) return null;
  return agreedAnswer(printed, operation, "result") ? operation : null;
}

/** The teaching package of a multi-step question (an evaluate, held until Maya teaches it), or null. */
export function deriveMultiStep(printed: QuestionPackage): QuestionPackage | null {
  const operation = multiStepOperation(printed);
  const agreed = operation && agreedAnswer(printed, operation, "result");
  if (!operation || !agreed) return null;
  return withShapedExample(printed, operation, agreed.answer, MAYA_TEACHING_LIMITS);
}
