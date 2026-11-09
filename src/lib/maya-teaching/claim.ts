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
  relation: "equal" | "greater" | "less";
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

/**
 * The easier examples to try, smallest result first: one-digit facts of the same kind (decimals with one place, a division
 * with no remainder). The package check then keeps only a smaller one, and exampleGivesAway one that tells nothing.
 */
function examplesFor(op: Operation): Operation[] {
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  if (op.kind === "divide") {
    return digits.filter((q) => q > 1).flatMap((q) => digits.filter((b) => b > 1).map((b) => [q * b, b]))
      .sort((x, y) => x[0] / x[1] - y[0] / y[1] || x[0] - y[0]).map(([a, b]) => ({ kind: "divide", operands: [a, b] }) as Operation);
  }
  const decimal = op.kind.startsWith("decimal-");
  const values = decimal ? digits.flatMap((w) => [1, 2, 3, 4].map((t) => Number(`${w}.${t}`))).filter((v) => v < 5) : digits;
  // No × 1: it shows nothing of multiplying.
  const pairs = values.flatMap((a) => values.map((b) => [a, b]))
    .filter(([a, b]) => (op.kind.includes("subtract") ? a > b : true) && !(op.kind.includes("multiply") && (a === 1 || b === 1)));
  const result = ([a, b]: number[]) => (op.kind.includes("multiply") ? a * b : op.kind.includes("subtract") ? a - b : a + b);
  return pairs.sort((x, y) => result(x) - result(y) || x[0] - y[0]).map(([a, b]) => ({ kind: op.kind, operands: [a, b] }) as Operation);
}

/** A number's digits without the point or leading zeros: 6.8 and 680 both begin "68". */
const digitsOf = (n: number) => String(n).replace(".", "").replace(/^0+/, "");

/**
 * The easier example gives the question's answer away (wave brief, lesson 11, from #724's review): it uses one of the
 * question's own numbers, its result times a power of 10 is the question's result (6 for 60), or the question's result
 * begins with its digits (6 for 680, 68 for 6800).
 */
export function exampleGivesAway(example: Operation, question: Operation): boolean {
  const ex = operationResult(example);
  const q = operationResult(question);
  if (ex.type !== "number" || q.type !== "number") return true;
  const numbers = (o: Operation) => (o.operands as unknown[]).filter((n): n is number => typeof n === "number");
  if (numbers(example).some((n) => numbers(question).some((m) => equivalent({ type: "number", value: n }, { type: "number", value: m })))) return true;
  if ([0, 1, 2, 3, 4, 5, 6].some((k) => Math.abs(ex.value * 10 ** k - q.value) < 1e-9)) return true;
  return digitsOf(q.value).startsWith(digitsOf(ex.value));
}

/** Every number a worked step says: totals, digits written, carries, products, quotients, values (digit lists aside). */
function workedNumbers(op: Operation): number[] {
  return (workedSteps(op) as unknown as Record<string, unknown>[]).flatMap((st) => Object.entries(st).flatMap(([key, v]) =>
    key === "digits" ? [] : typeof v === "number" ? [v]
      : v && typeof v === "object" && (v as { type?: string }).type === "number" ? [(v as { value: number }).value] : []));
}

/**
 * What of the question an easier example never prints or works out (lesson 12, #737 review, Savar's scope): the
 * question's answer, and every value of two or more digits its worked steps say (870 × 6: 5220, 42 and 52). A single
 * digit (a carry, a digit written) is allowed: a small example cannot avoid them, and lesson 12 is about the answer.
 */
function questionWork(question: Operation): number[] {
  const result = operationResult(question);
  const answer = result.type === "number" ? [result.value] : [];
  return [...answer, ...workedNumbers(question).filter((v) => digitsOf(Math.abs(v)).length >= 2)];
}

/**
 * The easier example prints or works out the question's answer or one of its multi-digit step values (questionWork): in
 * its numbers, its worked steps, its result, or the number its claim prints (`shown`).
 */
export function exampleShowsWork(example: Operation, question: Operation, shown: number | null = null): boolean {
  const work = questionWork(question);
  const result = operationResult(example);
  const own = [...(example.operands as unknown[]).filter((n): n is number => typeof n === "number"), ...workedNumbers(example),
    ...(result.type === "number" ? [result.value] : []), ...(shown === null ? [] : [shown])];
  return own.some((n) => work.some((w) => equivalent({ type: "number", value: n }, { type: "number", value: w })));
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
    if (operationProblem(example) || sameValue(operationResult(example), answer) || exampleGivesAway(example, claim.operation) || exampleShowsWork(example, claim.operation)) continue;
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
 * number is code's: for "equal" more than the result (the claim does not hold), for "greater" less and "less" more
 * (both hold), by the
 * smallest step of 1 to 4 that is none of the question's step values; with none, no example (the question is held). So
 * the example never needs a word the child must find for their own question.
 */
/** The values the question's worked steps say: column totals and written digits, products, quotients, the result. */
function stepValues(pkg: OperationPackage): Set<number> {
  const out = new Set<number>();
  for (const st of pkg.steps as unknown as Record<string, unknown>[]) {
    for (const key of ["total", "write", "value", "quotient", "product"]) {
      const v = st[key];
      if (typeof v === "number") out.add(v);
      else if (v && typeof v === "object" && (v as { type?: string }).type === "number") out.add((v as { value: number }).value);
    }
  }
  return out;
}

export function claimExample(claim: Claim, pkg: OperationPackage): Claim | null {
  const result = operationResult(pkg.easierExample.operation);
  if (result.type !== "number") return null;
  const value = result.value;
  // The number it prints is never one of the question's step values (lesson 12, #737 review: 8 in "Is 3 × 3 greater than
  // 8?" is the tens product of 40 × 2): one, two, three or four away from its result, the first that is none of them.
  // Nor is the example one that prints or works the question's answer or a multi-digit step value (exampleShowsWork).
  if (exampleShowsWork(pkg.easierExample.operation, pkg.operation)) return null;
  const own = stepValues(pkg);
  const shown = [1, 2, 3, 4].map((k) => Number((claim.relation === "greater" ? value - k : value + k).toFixed(3)))
    .find((n) => n >= 0 && !own.has(n) && !exampleShowsWork(pkg.easierExample.operation, pkg.operation, n));
  if (shown === undefined || !Number.isSafeInteger(Math.round(shown * 1000))) return null;
  const holds = claim.relation !== "equal";
  return { ...claim, operation: pkg.easierExample.operation, value, shown, holds, word: holds ? claim.choices[0] : claim.choices[1], other: holds ? claim.choices[1] : claim.choices[0] };
}
