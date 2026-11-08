// Fraction questions in Maya's calls (#407, spec of #400): which fraction questions Maya teaches, how a child's answer is
// read in a fraction call, and which answers are right for the question as it is worded. The gate judges with the same
// rules. Pure TypeScript: no clock, network or randomness.
import { equivalent, isRightAnswer, sameValue, type AnswerValue, type OperationKind, type OperationPackage, type WorkedStep } from "@/lib/question-package";
import type { ReadOptions } from "./numbers";

/** The fraction operation kinds the question package computes. */
const FRACTION_KINDS: readonly OperationKind[] = ["fraction-add", "fraction-subtract", "fraction-multiply", "fraction-divide", "fraction-simplify", "fraction-equivalent"];

/** The kinds whose answer may be an equal fraction in another form (14/16 for 7/8), when the question allows it. */
const EQUAL_FORM_KINDS: readonly OperationKind[] = ["fraction-add", "fraction-subtract"];

/**
 * The worked step kinds Maya has lines for. A question whose steps (or its easier example's) hold any other kind is held:
 * a mixed or whole operand (`to-improper`), multiplying and dividing fractions (`multiply-fractions`, `flip`) and
 * equivalent fractions (`scale-fraction`) need their own lines first.
 */
export const TAUGHT_STEP_KINDS: readonly WorkedStep["kind"][] = [
  "add-column", "subtract-column", "multiply-digit", "partial-product", "place-point", "divide-digit",
  "common-denominator", "combine-numerators", "simplify", "to-mixed", "result",
  // B1a: the digit in a place (place-value questions, src/lib/maya/place-value*.ts).
  "read-digit",
  // A claim's compare step (claim.ts), only in the session package of a checked claim question.
  "claim-compare",
];

/** The step kinds of a package (and of its easier example) Maya has no lines for. */
export const untaughtSteps = (pkg: OperationPackage): string[] =>
  [...new Set([...pkg.steps, ...pkg.easierExample.steps].map((s) => s.kind).filter((k) => !TAUGHT_STEP_KINDS.includes(k)))];

/**
 * The worked steps Maya teaches for this question, without the result (#407). A whole-number or decimal question: every
 * step. A fraction question leaves out the mixed number (11/8 is already a right answer, the package's rules take any
 * simplest form) and, unless the question asks for the simplest form, the simplifying (2/4 is right then, research C38).
 */
export const teachSteps = (pkg: OperationPackage): WorkedStep[] =>
  pkg.steps.filter((s) => s.kind !== "result" && s.kind !== "to-mixed" && (s.kind !== "simplify" || asksSimplest(pkg)));

/** The question is a fraction question. */
export const isFractionQuestion = (pkg: OperationPackage) => FRACTION_KINDS.includes(pkg.operation.kind);

/** How the child's turns are read in this call: spoken fractions only in a fraction call (numbers.ts). */
export const readOptionsFor = (pkg: OperationPackage | null): ReadOptions => ({
  fractions: pkg !== null && isFractionQuestion(pkg),
  known: pkg === null ? [] : knownNumbers(pkg),
  carries: pkg === null ? [] : pkg.steps.flatMap((st) => ("carryOut" in st && st.carryOut > 0 ? [st.carryOut] : [])),
});

/** The question's own numbers: its printed operands and every number in its worked steps (PR #624 review). */
function knownNumbers(pkg: OperationPackage): number[] {
  const out = new Set<number>();
  const walk = (x: unknown) => {
    if (typeof x === "number") out.add(x);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") Object.values(x).forEach(walk);
  };
  walk(pkg.operation.operands);
  walk(pkg.steps);
  return [...out];
}

/** The words a question uses to ask for the simplest form. */
const ASKS_SIMPLEST = /\b(?:simplest|lowest terms|simplify|simplified)\b/i;

/** The question asks for the simplest form, in its own words ("Write the answer in simplest form."). */
export const asksSimplest = (pkg: OperationPackage) => pkg.operation.kind === "fraction-simplify" || ASKS_SIMPLEST.test(pkg.text);

/** How Maya names the form the question asks for: the question's own words, "lowest terms" or "simplest form". */
export const simplestWords = (pkg: OperationPackage) => (/\blowest terms\b/i.test(pkg.text) ? "lowest terms" : "simplest form");

const isFractionForm = (v: AnswerValue) => v.type === "fraction" || v.type === "mixed";

/**
 * The value is right for the question as it is worded (#407, research C38): right by the package's rules
 * (`isRightAnswer`: the answer, its accepted forms, any simplest form of the number), or, in an addition or subtraction of
 * fractions, an equal fraction in another form (14/16 for 7/8), unless the question asks for the simplest form or the
 * package lists that form as a wrong answer.
 */
export function rightForQuestion(pkg: OperationPackage, value: AnswerValue): boolean {
  if (isRightAnswer(pkg.operation, pkg.answer, value)) return true;
  return EQUAL_FORM_KINDS.includes(pkg.operation.kind) && isFractionForm(value) && equivalent(value, pkg.answer.value) &&
    !asksSimplest(pkg) && !pkg.wrongAnswers.some((w) => sameValue(w.value, value));
}

/**
 * The value is the right amount in a form the question does not take (#407): an equal fraction (14/16 for 7/8) when the
 * question asks for the simplest form. It is not a wrong answer: the child did the adding, and simplifies next.
 */
export const isEqualForm = (pkg: OperationPackage, value: AnswerValue): boolean =>
  asksSimplest(pkg) && EQUAL_FORM_KINDS.includes(pkg.operation.kind) && isFractionForm(value) && equivalent(value, pkg.answer.value) && !rightForQuestion(pkg, value);
