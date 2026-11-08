// Claim questions for Maya (Wave A, A4): a circle question that states a computed claim, such as "True or false: 8 × 850
// = 6800." or "Is 6 × 870 greater than 5226? Circle yes or no." The workbook stores them with no operation: the answer is
// the circled word, from the template's own expression ("'yes' if f == 0 else 'no'").
//
// Maya works out the claim's computed side (8 × 850) with steps she already teaches, then compares the result with the
// printed number, then circles the word. Everything comes from the stored package, read three ways that must agree
// (wave brief, hard rule 3):
// 1. the printed text, matched by one of the closed forms below (no free parsing, no slot names);
// 2. the result code computes for the operation, its comparison with the printed number, and the word that gives, which
//    must be the item's answer key and the template's answer;
// 3. the template's own values: the printed numbers are among them, and the template's expression evaluator, run on
//    them, gives the same result as code's operation.
// If any of the three fails, the question stays held. The printed book and the stored package never change: the
// teaching package is a new value, and the item, the text and the template source are kept as they are.
// Pure TypeScript: no network, database, clock or randomness.
import {
  checkQuestionPackage, equivalent, operationProblem, operationResult, operationText, sameValue, workedSteps,
  type AnswerValue, type Operation, type OperationPackage, type QuestionPackage, type WorkedStep,
} from "@/lib/question-package";
import { templateAnswer, templateNumbers, type TemplateSource } from "@/lib/question-package-template";
import { compileExpression, decimalValue, EvaluationBudget, formatValue, type ExpressionValue } from "@/lib/workbook-curriculum/expression";

/** The two words a claim is circled with, in the order the claim holds or does not. */
export type ClaimChoices = readonly ["true", "false"] | readonly ["yes", "no"];

/** A claim read from its package: what the question claims, the computed side, and the word to circle. */
export interface Claim {
  /** The claim's words: true and false, or yes and no. The first is circled when the claim holds. */
  choices: ClaimChoices;
  /** "equal": the computed side is the printed number; "greater": it is more than the printed number. */
  relation: "equal" | "greater";
  /** The computed side, as an operation Maya teaches. */
  operation: Operation;
  /** What the operation makes. */
  value: number;
  /** The printed number the result is compared with. */
  shown: number;
  holds: boolean;
  /** The word to circle: choices[0] when the claim holds, else choices[1]. */
  word: string;
  /** The other word. */
  other: string;
}

const NUMBER = "\\d+(?:\\.\\d+)?";
const n = (name: string) => `(?<${name}>${NUMBER})`;
const SIGN = "(?<sign>[+×−])";

/**
 * The closed printed forms, each with its words and its relation. "Name says a × b = c. Check with c ÷ b." checks the
 * claim by the division the question prints: c ÷ b is compared with a.
 */
const FORMS: readonly { pattern: RegExp; choices: ClaimChoices; relation: Claim["relation"]; divide?: true }[] = [
  { pattern: new RegExp(`^True or false: ${n("a")} ${SIGN} ${n("b")} = ${n("c")}\\.$`), choices: ["true", "false"], relation: "equal" },
  { pattern: new RegExp(`^Is ${n("a")} ${SIGN} ${n("b")} greater than ${n("c")}\\? Circle yes or no\\.$`), choices: ["yes", "no"], relation: "greater" },
  { pattern: new RegExp(`^Is ${n("a")} ${SIGN} ${n("b")} = ${n("c")} right\\? Circle yes or no\\.$`), choices: ["yes", "no"], relation: "equal" },
  {
    pattern: new RegExp(`^(?<who>[A-Z][a-z]{1,15}) says ${n("a")} × ${n("b")} = ${n("c")}\\. Check with \\k<c> ÷ \\k<b>\\. Is \\k<who> right\\? Circle yes or no\\.$`),
    choices: ["yes", "no"], relation: "equal", divide: true,
  },
];

/**
 * The operation of a printed sign on two printed numbers: whole numbers, else decimals. A whole-number product with the
 * shorter number first ("6 × 870") is worked with it below ("870 × 6"): one row, the method of the grade, instead of a
 * row for each digit of 870. Maya says that the two orders make the same number (claim.ts in src/lib/maya).
 */
function signOperation(sign: string, a: number, b: number): Operation {
  const whole = Number.isSafeInteger(a) && Number.isSafeInteger(b);
  const kind = sign === "+" ? (whole ? "add" : "decimal-add") : sign === "−" ? (whole ? "subtract" : "decimal-subtract") : whole ? "multiply" : "decimal-multiply";
  const shorterFirst = kind === "multiply" && String(a).length < String(b).length;
  return { kind, operands: shorterFirst ? [b, a] : [a, b] };
}

const EXPRESSION_SIGN: Record<string, string> = { "+": "+", "−": "-", "×": "*" };

/** A template value as the expression evaluator holds it: a whole number exactly, a decimal from its written digits. */
const asValue = (x: number, budget: EvaluationBudget): ExpressionValue => (Number.isSafeInteger(x) ? BigInt(x) : decimalValue(String(x), budget));

/** The names of the template's values that equal a printed number, exactly. */
function namesOf(values: Record<string, number>, printed: number): string[] {
  return Object.keys(values).filter((k) => /^[A-Za-z][A-Za-z0-9_]*$/.test(k) && equivalent({ type: "number", value: values[k] }, { type: "number", value: printed }));
}

/**
 * Agreement 3: the template's values hold the printed numbers, and the template's own expression evaluator gives the
 * operation's result from them. Any name that holds a printed number may stand for it: the arithmetic is the same.
 */
function templateAgrees(source: TemplateSource, printed: { a: number; b: number; c: number }, expression: (x: string, y: string, z: string) => string, value: number): boolean {
  const values = templateNumbers(source);
  if (!values) return false;
  const [as, bs, cs] = [namesOf(values, printed.a), namesOf(values, printed.b), namesOf(values, printed.c)];
  if (as.length === 0 || bs.length === 0 || cs.length === 0) return false;
  try {
    const budget = new EvaluationBudget();
    const bindings: Record<string, ExpressionValue> = Object.create(null);
    for (const [k, v] of Object.entries(values)) bindings[k] = asValue(v, budget);
    const got = formatValue(compileExpression(expression(as[0], bs[0], cs[0]), budget).evaluate(bindings, budget), budget);
    return equivalent({ type: "number", value: Number(got) }, { type: "number", value }) && /^-?\d+(?:\.\d+)?$/.test(got);
  } catch {
    return false;
  }
}

/** The printed text as the forms read it: one space between words, and the minus sign as printed ("−"). */
const printedText = (text: string) => text.replace(/[–-]/g, "−").replace(/\s+/g, " ").trim();

/**
 * The claim of a package, or null when it is not a claim question code can read and check: the item is one circled
 * choice of true and false (or yes and no), scored by one template check whose answer is the item's key, and the
 * printed text, code's computation and the template's values all agree. `operation` (optional): the package's own
 * operation, which must then be the claim's computed side. Never reads the package's answer, steps or easier example.
 */
export function readClaim(pkg: QuestionPackage, operation: Operation | null = null): Claim | null {
  const item = pkg.item;
  if (!item || item.format !== "circle" || !item.scorable || item.parentChecked || item.error !== null || (item.figure ?? null) !== null) return null;
  if (item.regions.length !== 1 || item.checks.length !== 1) return null;
  const [region] = item.regions;
  const [check] = item.checks;
  if (region.kind !== "choice" || region.mark !== "circle" || check.kind !== "template-choice" || check.region !== region.id || region.answer === null) return null;
  const key = templateAnswer(check.source);
  if (!("answer" in key) || key.answer !== region.answer) return null;
  const text = printedText(pkg.text);
  for (const form of FORMS) {
    const m = form.pattern.exec(text);
    if (!m?.groups) continue;
    if (region.choices.length !== 2 || region.choices[0] !== form.choices[0] || region.choices[1] !== form.choices[1]) return null;
    const [a, b, c] = [Number(m.groups.a), Number(m.groups.b), Number(m.groups.c)];
    if (form.divide && ![a, b, c].every(Number.isSafeInteger)) return null;
    const op: Operation = form.divide ? { kind: "divide", operands: [c, b] } : signOperation(m.groups.sign, a, b);
    if (operationProblem(op)) return null;
    if (operation !== null && !sameOperation(operation, op)) return null;
    const result = operationResult(op);
    if (result.type !== "number") return null;
    const value = result.value;
    const shown = form.divide ? a : c;
    const holds = form.relation === "equal" ? equivalent(result, { type: "number", value: shown }) : value > shown;
    const word = holds ? form.choices[0] : form.choices[1];
    const other = holds ? form.choices[1] : form.choices[0];
    // Agreement 2: code's word is the item's key and the template's answer.
    if (word !== region.answer || word !== key.answer) return null;
    // Agreement 3: the template's values hold the printed numbers, and its evaluator makes the same result.
    const expression = form.divide
      ? (_x: string, y: string, z: string) => `${z} // ${y} if ${z} % ${y} == 0 else -1`
      : (x: string, y: string) => `${x} ${EXPRESSION_SIGN[m.groups!.sign]} ${y}`;
    if (!templateAgrees(check.source, { a, b, c }, expression, value)) return null;
    return { choices: form.choices, relation: form.relation, operation: op, value, shown, holds, word, other };
  }
  return null;
}

const sameOperation = (x: Operation, y: Operation) => x.kind === y.kind && JSON.stringify(x.operands) === JSON.stringify(y.operands);

/** The easier examples to try, smallest first: the same kind with small numbers (the package check picks a smaller one). */
function examplesFor(op: Operation): Operation[] {
  if (op.kind === "divide") return [[4, 2], [6, 2], [6, 3], [8, 2], [9, 3]].map(([a, b]) => ({ kind: "divide", operands: [a, b] }) as Operation);
  const decimal = op.kind.startsWith("decimal-");
  const pairs = decimal ? [[1.2, 1.3], [1.1, 1.2], [2.1, 1.3], [1.5, 1.2]] : [[2, 3], [2, 1], [3, 1], [3, 2], [1, 2], [1, 3], [2, 2], [3, 3], [1, 1]];
  return pairs.map(([a, b]) => ({ kind: op.kind, operands: [a, b] }) as Operation);
}

/**
 * The teaching package of a claim question: the stored package with the claim's computed side as its operation, code's
 * worked steps, one wrong answer and a smaller easier example, marked `operationSource: "maya"`, or null when the
 * question is not a claim code can check. The printed text, the item and the template source are the stored ones. The
 * session (src/lib/maya/claim.ts) reads the claim again from this package and teaches the circled word as its answer.
 */
export function claimTeaching(pkg: QuestionPackage): QuestionPackage | null {
  if (pkg.operation !== null || pkg.answer !== null || pkg.easierExample !== null || pkg.steps.length > 0 || pkg.wrongAnswers.length > 0) return null;
  if (!checkQuestionPackage(pkg).ok) return null;
  const claim = readClaim(pkg);
  if (!claim) return null;
  const answer: AnswerValue = { type: "number", value: claim.value };
  // A wrong product: one more than the result, never the printed number (that is the claim, not a slip).
  const wrong = [claim.value + 1, claim.value + 2].find((v) => !equivalent({ type: "number", value: v }, { type: "number", value: claim.shown }))!;
  for (const example of examplesFor(claim.operation)) {
    if (operationProblem(example) || sameValue(operationResult(example), answer)) continue;
    const candidate: QuestionPackage = {
      ...pkg,
      operationSource: "maya",
      operation: claim.operation,
      answer: { value: answer, accepted: [], unit: null },
      steps: workedSteps(claim.operation),
      wrongAnswers: [{ value: { type: "number", value: wrong }, cause: "calculation", description: "Works out a different result.", step: null }],
      easierExample: { text: `${operationText(example)} = ?`, operation: example, answer: operationResult(example), steps: workedSteps(example) },
    };
    if (checkQuestionPackage(candidate).ok) return candidate;
  }
  return null;
}

/** The claim-compare step of a claim, and of its easier example (claimExample). */
export function claimStep(claim: Pick<Claim, "relation" | "value" | "shown" | "holds">): Extract<WorkedStep, { kind: "claim-compare" }> {
  return { id: "claim", kind: "claim-compare", relation: claim.relation, value: claim.value, shown: claim.shown, holds: claim.holds };
}

/**
 * The claim Maya works for the easier example: the same words and relation on the example's own result. Its printed
 * number is code's: for "equal" one more than the result (the claim does not hold), for "greater" one less (it holds),
 * so the example never needs a word the child must find for their own question.
 */
export function claimExample(claim: Claim, pkg: OperationPackage): Claim | null {
  const result = operationResult(pkg.easierExample.operation);
  if (result.type !== "number") return null;
  const value = result.value;
  const shown = claim.relation === "equal" ? value + 1 : value - 1;
  if (shown < 0 || !Number.isSafeInteger(Math.round(shown * 1000))) return null;
  const holds = claim.relation === "greater";
  return { ...claim, operation: pkg.easierExample.operation, value, shown: Number(shown.toFixed(3)), holds, word: holds ? claim.choices[0] : claim.choices[1], other: holds ? claim.choices[1] : claim.choices[0] };
}
