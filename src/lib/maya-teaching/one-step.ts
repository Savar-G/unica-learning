// One-step workbook questions with no stored operation (Wave A, group "one-step"): stories and number sentences that are
// one add, subtract or multiply, kinds Maya already teaches. The book's wordings are closed printed forms below, read
// after the #525 forms (workbook-maya-operation.ts); a bare "18000 + 2000 = ?" is read there already. Most of these
// were left without an operation at generation because a number is above today's limit (10000 − 2426): the adapter
// checks them under Maya's wider limits (limits.ts). Pure TypeScript.
import type { QuestionPackage } from "@/lib/question-package";
import { binary, FORM_PARTS, printedOperation, printedRelationships, type PrintedForm } from "@/lib/workbook-maya-operation";
import { agreedAnswer } from "./agreement";
import { withShapedExample } from "./examples";
import { MAYA_TEACHING_LIMITS } from "./limits";

const { WORDS, ACTOR, THINGS, n } = FORM_PARTS;
/** A container word, said again in the plural: "jar" and "jars", "box" and "boxes". */
const CONTAINER = "(?<box>[a-z]+)";
const CONTAINERS = "\\k<box>(?:s|es)";

/** The template frames the book prints, as closed forms. Each names the role of every printed number. */
export const ONE_STEP_FORMS: readonly PrintedForm[] = [
  // "Each jar has 373 toy cars. Amara has 6 of them. How many toy cars in all?" (4.5, 4.8: a × b)
  [`Each ${WORDS} has ${n("size")} ${THINGS}\\. ${ACTOR} has ${n("groups")} of them\\. How many \\k<things> in all\\?`, v => binary("*", +v.size, +v.groups)],
  // "Omar puts 5 books in each jar. How many books in 4 jars?" (4.9: m × p)
  [`${ACTOR} puts ${n("size")} ${THINGS} in each ${CONTAINER}\\. How many \\k<things> in ${n("groups")} ${CONTAINERS}\\?`, v => binary("*", +v.size, +v.groups)],
  // "Ava has 10000 tickets and gives 2426 away. How many tickets are left?" (4.4: a − b)
  [`${ACTOR} has ${n("a")} ${THINGS} and gives ${n("b")} away\\. How many \\k<things> are left\\?`, v => binary("-", +v.a, +v.b)],
  // "A box holds 4000 beads. Kai takes out 1250. How many beads are left in the box?" (4.4: a − b)
  [`A ${CONTAINER} holds ${n("a")} ${THINGS}\\. ${ACTOR} takes out ${n("b")}\\. How many \\k<things> are left in the \\k<box>\\?`, v => binary("-", +v.a, +v.b)],
  // "Zara collected 17000 tickets and a friend collected 3000. How many tickets is that in all?" (5.8: a + b)
  [`${ACTOR} collected ${n("a")} ${THINGS} and a friend collected ${n("b")}\\. How many \\k<things> is that in all\\?`, v => binary("+", +v.a, +v.b)],
];
const RELATIONSHIPS = printedRelationships(ONE_STEP_FORMS);

/** One add, subtract or multiply: the kinds this deriver makes. Anything else is another deriver's. */
const ONE_STEP: readonly string[] = ["add", "subtract", "multiply"];

/** The teaching package of a one-step question, or null when any of the three agreements fails. */
export function deriveOneStep(printed: QuestionPackage): QuestionPackage | null {
  const operation = printedOperation(printed.text, RELATIONSHIPS);
  if (!operation || !ONE_STEP.includes(operation.kind)) return null;
  const agreed = agreedAnswer(printed, operation, "one-step");
  if (!agreed) return null;
  return withShapedExample(printed, operation, agreed.answer, MAYA_TEACHING_LIMITS);
}
