// Evaluate questions in Maya's calls (Maya coverage Wave A, A2): a multi-step expression worked in the order of
// operations ("9 × 880 + 9 × 40", "(8150 − 500) ÷ 9"). The package's checked worked steps (question-package-algebra.ts)
// give the parts in order, one "operate" step each. Maya teaches each part in that order: code says which part comes
// first and why, the child gives the part's result, and code checks it. A child stuck on a part gets that part's own
// column method: the worked steps of the one-step operation (add, subtract, multiply or divide), which code computes
// with workedSteps, said with the existing column lines and drawn with the existing board columns.
//
// The steps a child does, in order: each part's columns ("e1.r1-ones" ...), then the part itself ("e1"), then the next
// part. The last part has no step of its own: its result is the question's answer ("result"). A right result for a part
// counts its columns done, and its columns done count the part done (closeParts), so a child who knows 9 × 880 = 7920
// is never walked through the columns.
//
// Held (fail closed): an expression with unknowns, decimals, negative numbers or fractions; a part whose one-step
// operation code does not check by default (a number above 9999, or a divisor of 3 digits: `partMethod` is the seam for
// the try-factor path); a missing-number text code cannot match exactly; and a question with no easier example of the
// same shape. The easier example Maya works first must be the same shape as the question: when the stored one is not
// (the generator stores "1 + 1"), code makes one with the same signs and brackets and smaller numbers, and checks it.
// When no example of the shape is smaller by the package check, an example that is easier by Maya's own rule
// (easierForMaya: no more digits, a smaller sum) may be used.
// Pure TypeScript: no clock, network or randomness.
import {
  checkQuestionPackage,
  operationProblem,
  stepText,
  workedSteps,
  type EasierExample,
  type OperationLimits,
  type Operation,
  type OperationPackage,
  type WorkedStep,
} from "@/lib/question-package";
import { plainNumber } from "./numbers";
import { MAYA_TEACHING_LIMITS, teachingLimits } from "@/lib/maya-teaching/limits";

type OperateStep = Extract<WorkedStep, { kind: "operate" }>;
type Sign = OperateStep["op"];

/** One part of an evaluate question, in the order of operations. */
export interface EvaluatePart {
  /** The part's operate step id ("e1"). */
  id: string;
  step: OperateStep;
  /** The part as the expression writes it: "9 × 880". */
  expr: string;
  /** The one-step operation code works the part's columns with: 880 × 9 (the longer number on top). */
  operation: Operation;
  /** The one-step operation's own worked steps, with its result. */
  inner: WorkedStep[];
  /** The part's column steps as the child's steps: the part's id before each id ("e1.r1-ones"), no result. */
  columns: WorkedStep[];
  /** The last part: its result is the question's answer. */
  last: boolean;
  /** The expression before this part is worked ("7920 + 9 × 40"). */
  before: string;
  /** Why this part comes now, in code's words; null for the last part. */
  reason: string | null;
}

/** A missing-number text code matched exactly ("9 × ? = 8150 − 500", stored as "(8150 − 500) ÷ 9"). */
export interface Frame {
  /** How the last part finds ?: "divide" (a × ? = c) or "subtract" (a − ? = c). */
  verb: "divide" | "subtract";
  /** The printed equation with the worked side as a number: "9 × ? = 7650". */
  equation: string;
  /** The printed equation as the page writes it: "9 × ? = 8150 − 500". Maya names the question by it. */
  printed: string;
}

export interface EvaluateTeaching {
  parts: EvaluatePart[];
  /** The steps the child does, in order, without the result. */
  steps: WorkedStep[];
  frame: Frame | null;
  /** The easier example Maya works first: the stored one when it is the same shape, else one code made. */
  example: EasierExample;
}

/**
 * Maya's limits for a part's own one-step operation (Wave A, #724): whole numbers to 999,999, the six columns her
 * board and place names cover. Passed explicitly; the generator and every default check keep today's limits. The
 * divisor stays at today's 99: a 3-digit divisor is A3's try-factor path (partMethod holds it).
 */
const PART_LIMITS: OperationLimits = Object.freeze({ wholeResult: MAYA_TEACHING_LIMITS.wholeResult });

/** The child's steps of each kind code teaches inside a part. Anything else holds the question (fail closed). */
const PART_STEP_KINDS: readonly WorkedStep["kind"][] = ["add-column", "subtract-column", "multiply-digit", "partial-product", "divide-digit", "result"];

const KIND: Record<Sign, "add" | "subtract" | "multiply" | "divide"> = { "+": "add", "−": "subtract", "×": "multiply", "÷": "divide" };
/** The board's column layout of a part's operation; division has no board layout yet. */
const LAYOUT: Partial<Record<Operation["kind"], string>> = { add: "add", subtract: "subtract", multiply: "multiply" };

const isWhole = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
const nonZero = (n: number) => [...String(n)].filter((d) => d !== "0").length;

/**
 * The method code works a part with: the one-step operation's worked steps, or why it cannot. The seam for the
 * try-factor path (Wave A, A3): a divide part whose divisor has 3 digits is held here today ("(8763 + 30) ÷ 977");
 * A3's checked trial multiplication fills it by returning its steps for that part.
 */
export function partMethod(operation: Operation, limits: OperationLimits = PART_LIMITS): { steps: WorkedStep[] } | { held: string } {
  const problem = operationProblem(operation, limits);
  if (problem !== null) {
    if (operation.kind === "divide" && operation.operands[1] >= 100) return { held: "a divide part with a 3-digit divisor" };
    return { held: `a part with numbers code does not check yet (${problem})` };
  }
  const steps = workedSteps(operation);
  const untaught = steps.find((s) => !PART_STEP_KINDS.includes(s.kind));
  return untaught ? { held: `the ${untaught.kind} step of a part` } : { steps };
}

/** The one-step operation of a part: a product puts the number with more digits that are not 0 on top. */
function partOperation(step: OperateStep): Operation {
  const kind = KIND[step.op];
  const { left: a, right: b } = step;
  if (kind !== "multiply") return { kind, operands: [a, b] };
  const top = nonZero(b) > nonZero(a) || (nonZero(b) === nonZero(a) && b > a);
  return { kind, operands: top ? [b, a] : [a, b] };
}

/** The signs an expression still has, outside any number ("7920 + 9 × 40" has + and ×). */
const signsIn = (expr: string): Sign[] => (expr.match(/[+−×÷]/g) ?? []) as Sign[];

/** Why a part comes now, in code's words (the order of operations), or null for the last part. */
function reasonOf(step: OperateStep, after: string, framed: boolean, first: boolean): string | null {
  const rest = signsIn(after);
  if (rest.length === 0) return null;
  if (framed && first) return "Work out the side with only numbers first.";
  if (step.rule === "brackets") return "Work inside the brackets first.";
  const later = rest.filter((s) => s === "+" || s === "−");
  if (step.rule === "multiply-divide") {
    if (later.length === 0) return "Work from left to right.";
    const verb = step.op === "×" ? "Multiply" : "Divide";
    const words = [...new Set(later.map((s) => (s === "+" ? "add" : "subtract")))].sort();
    return `${verb} before you ${words.join(" and ")}.`;
  }
  return "Add and subtract from left to right.";
}

/** The expression as one-step text: "9 × 880". */
const partText = (step: OperateStep) => `${step.left} ${step.op} ${step.right}`;

/** Every number in an expression or a step is a whole number at least 0, and each step is an operation. */
function wholeSteps(steps: readonly WorkedStep[]): steps is (OperateStep | Extract<WorkedStep, { kind: "result" }>)[] {
  return steps.every((s) => (s.kind === "operate" && isWhole(s.left) && isWhole(s.right) && isWhole(s.value))
    || (s.kind === "result" && s.value.type === "number" && isWhole(s.value.value)));
}

/**
 * The missing-number frame of the printed text, matched exactly against the stored expression: "9 × ? = X" or
 * "? × 9 = X" with "(X) ÷ 9", and "a − ? = X" with "a − (X)". Null when the text has no ? standing alone (a plain
 * expression or a story); undefined for a ? code cannot match (the question is held).
 */
function frameOf(text: string, expr: string, parts: readonly OperateStep[]): Frame | null | undefined {
  const t = text.trim().replace(/\s+/g, " ");
  if (!/(?:^|\s)\?(?:\s|$)/.test(t)) return null;
  // "976746 + 10000 + 1000 = ?": the ? is the whole answer, the expression as stored. A plain expression, no frame.
  if (t === `${expr} = ?`) return null;
  if (parts.length !== 2) return undefined;
  const [first] = parts;
  const side = partText(first);
  const times = /^(\d+) × \? = (.+)$/.exec(t) ?? /^\? × (\d+) = (.+)$/.exec(t);
  if (times && times[2] === side && expr === `(${side}) ÷ ${times[1]}`) {
    const equation = t.startsWith("?") ? `? × ${times[1]} = ${first.value}` : `${times[1]} × ? = ${first.value}`;
    return { verb: "divide", equation, printed: t };
  }
  const minus = /^(\d+) − \? = (.+)$/.exec(t);
  if (minus && minus[2] === side && expr === `${minus[1]} − (${side})`) return { verb: "subtract", equation: `${minus[1]} − ? = ${first.value}`, printed: t };
  return undefined;
}

/** The shape of an expression: its signs and brackets, with each number as n. */
const shapeOf = (expr: string) => expr.replace(/\d+/g, "n");

/** An expression worked: its operate steps when every value is a whole number at least 1, else null. */
function workedWhole(expr: string): { steps: WorkedStep[]; value: number } | null {
  const op: Operation = { kind: "evaluate", operands: [expr] };
  if (operationProblem(op) !== null) return null;
  const steps = workedSteps(op);
  if (!wholeSteps(steps) || steps.some((s) => s.kind === "operate" && s.value < 1)) return null;
  const result = steps.at(-1);
  return result?.kind === "result" && result.value.type === "number" ? { steps, value: result.value.value } : null;
}

/**
 * The numbers code tries in place of n in an easier example: its first digit, then near it, never more than n (a
 * single digit may also go up to 9, as the question's own numbers are never used, and to 1 last).
 */
function candidates(n: number): number[] {
  const lead = Number(String(n)[0]);
  const top = Math.min(Math.max(n, 2), 20);
  const start = Math.max(2, n < 10 ? n : lead);
  const out: number[] = [];
  for (let v = start; v <= top; v++) out.push(v);
  for (let v = start - 1; v >= 2; v--) out.push(v);
  if (n < 10) for (let v = n + 1; v <= 9; v++) out.push(v);
  // 1 last: only when nothing else keeps the example smaller and off the question's own digits. givesAway refuses it
  // where it is a trivial operand (× 1, ÷ 1).
  if (n < 10) out.push(1);
  return out;
}

const MAX_TRIES = 6000;

/** A trivial operand anywhere in an expression: ÷ 1, × 1 or 1 ×, + 0 or 0 +, − 0. It teaches nothing. */
const TRIVIAL = [/[×÷]\s*1(?!\d)/, /(?<![\d.])1\s*×/, /[+−]\s*0(?!\d)/, /(?<![\d.])0\s*\+/];

/**
 * The easier example gives the question's answer away (brief, lessons 11 and 12): its answer is the question's, or the
 * question's times a power of 10 apart (1700 + 300 = 2000 for 17000 + 3000), or the first digits of the question's
 * answer (88 for 880); or the example uses one of the question's own numbers, or the question's answer as any of its
 * numbers ("(5 + 3) ÷ 1" for an answer of 5), or as the result of any step Maya works on the board ("1 + 3 × 6" for
 * an answer of 18: 3 × 6 = 18). An example with a trivial operand (÷ 1, × 1, + 0, − 0) is refused too.
 */
export function givesAway(exampleExpr: string, exampleValue: number, expr: string, answer: number, steps: readonly WorkedStep[] = []): boolean {
  const own = new Set(expr.match(/\d+/g) ?? []);
  const numbers = exampleExpr.match(/\d+/g) ?? [];
  if (numbers.some((t) => own.has(t))) return true;
  if (!Number.isSafeInteger(answer) || !Number.isSafeInteger(exampleValue)) return true;
  if (numbers.some((t) => Number(t) === answer)) return true;
  if (TRIVIAL.some((re) => re.test(exampleExpr))) return true;
  if (exampleValue === answer) return true;
  if (steps.some((s) => s.kind === "operate" && s.value === answer)) return true;
  for (let k = 10; exampleValue * k <= answer; k *= 10) if (exampleValue * k === answer) return true;
  return String(answer).startsWith(String(exampleValue));
}

/**
 * An expression worked strictly from left to right, each sign in the order it is written, brackets left out: the
 * mistake the order of operations is about ("7 + 2 × 3" gives 27). NaN for a division by 0.
 */
export function leftToRight(expr: string): number {
  const tokens = expr.replace(/[()]/g, " ").match(/\d+|[+−×÷]/g) ?? [];
  let value = Number(tokens[0]);
  for (let i = 1; i + 1 < tokens.length; i += 2) {
    const n = Number(tokens[i + 1]);
    const sign = tokens[i];
    value = sign === "+" ? value + n : sign === "−" ? value - n : sign === "×" ? value * n : n === 0 ? NaN : value / n;
  }
  return value;
}

/**
 * The easier example keeps the question's order-of-operations lesson: when the question gives a different result
 * worked strictly left to right ("7 + 2 × 3": 27, not 13), the example must too ("5 + 2 × 2": 14, not 9), so working
 * it shows why the order matters. A question whose order changes nothing ("5 × 350 − 870") asks nothing of it.
 */
export function keepsOrder(exampleExpr: string, exampleValue: number, expr: string, answer: number): boolean {
  if (leftToRight(expr) === answer) return true;
  return leftToRight(exampleExpr) !== exampleValue;
}

/**
 * An easier example of the same shape as the expression: the same signs and brackets, each number its first digit or
 * a little more or less (never more than it was, at least 2), every part a whole number at least 1, not the
 * question itself or its answer (givesAway), and with the question's order-of-operations lesson (keepsOrder). The
 * first such expression in a fixed order, so the same question always gets the same example.
 */
function sameShapeExample(expr: string, answer: number, valid: (example: EasierExample) => boolean): EasierExample | null {
  const numbers = (expr.match(/\d+/g) ?? []).map(Number);
  // Never one of the question's own numbers (brief, lesson 11).
  const lists = numbers.map((n) => candidates(n).filter((v) => !numbers.includes(v)));
  if (lists.some((l) => l.length === 0)) return null;
  const pick = new Array<number>(numbers.length).fill(0);
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    let i = 0;
    const e = expr.replace(/\d+/g, () => String(lists[i][pick[i++]]));
    const worked = e !== expr ? workedWhole(e) : null;
    // The package check refuses an easier example with the question's answer; it must not give it away either.
    if (worked && !givesAway(e, worked.value, expr, answer, worked.steps) && keepsOrder(e, worked.value, expr, answer)) {
      const operation: Operation = { kind: "evaluate", operands: [e] };
      const example: EasierExample = { text: `${e} = ?`, operation, answer: { type: "number", value: worked.value }, steps: worked.steps };
      if (valid(example)) return example;
    }
    // The next choice: the last number changes first.
    let k = numbers.length - 1;
    while (k >= 0 && pick[k] === lists[k].length - 1) pick[k--] = 0;
    if (k < 0) return null;
    pick[k]++;
  }
  return null;
}

/** The package check's reason for an easier example that is not smaller than the question (question-package.ts). */
const NOT_SMALLER = "the easier example is not smaller than the question";

/**
 * Maya's own "easier" for an evaluate example, used only when no example of the same shape is smaller by the package
 * check (round 4, Option B; Maya's evaluate examples only: the package check and the generator keep their rule). Every
 * number is no larger than the question's largest; a number that has 1 digit in the question has 1 digit in the same
 * place of the example; the example has no more digits than the question; and the sum of its numbers is smaller than
 * the question's. The digits keep it on the same place values, and the smaller sum keeps it never harder than the
 * question: "1 + 4 × 4" (sum 9) is easier than "7 + 2 × 3" (sum 12), and "6 + 4 × 4" (sum 14) is not.
 */
export function easierForMaya(exampleExpr: string, expr: string): boolean {
  const own = (expr.match(/\d+/g) ?? []).map(Number);
  const made = (exampleExpr.match(/\d+/g) ?? []).map(Number);
  if (shapeOf(exampleExpr) !== shapeOf(expr) || made.length !== own.length || own.length === 0) return false;
  const largest = Math.max(...own);
  const digits = (ns: number[]) => ns.join("").length;
  const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
  return made.every((n, i) => n <= largest && (own[i] >= 10 || n < 10)) && digits(made) <= digits(own) && sum(made) < sum(own);
}

/** The easier example: the stored one when it is the same shape and every part a whole number, else one code makes. */
function exampleFor(pkg: OperationPackage, expr: string): EasierExample | null {
  const stored = pkg.easierExample;
  const storedExpr = stored.operation.kind === "evaluate" ? stored.operation.operands[0] : null;
  const storedValue = storedExpr !== null ? workedWhole(storedExpr) : null;
  const answer = pkg.answer.value.type === "number" ? pkg.answer.value.value : NaN;
  if (storedExpr !== null && storedValue && shapeOf(storedExpr) === shapeOf(expr) && !givesAway(storedExpr, storedValue.value, expr, answer, storedValue.steps) &&
    keepsOrder(storedExpr, storedValue.value, expr, answer) && !("values" in stored.operation && stored.operation.values)) return stored;
  // The package with the made example must pass the same check as any package (its steps and answer are the
  // operation's, and the example is smaller): the first candidate that does is the example.
  const limits = teachingLimits(pkg);
  const check = (made: EasierExample) => checkQuestionPackage({ ...pkg, easierExample: made }, undefined, limits);
  const smaller = sameShapeExample(expr, answer, (made) => check(made).ok);
  if (smaller || !checkQuestionPackage(pkg, undefined, limits).ok) return smaller;
  // Else Maya's own "easier" (easierForMaya): the made example passes every other check (the smaller check is the last
  // one the package check makes), and every rule above still runs on it.
  return sameShapeExample(expr, answer, (made) => {
    const c = check(made);
    return c.ok || (c.status === "failed" && c.reason === NOT_SMALLER && easierForMaya((made.operation as { operands: string[] }).operands[0], expr));
  });
}

type Worked = { teaching: EvaluateTeaching } | { held: string };

const CACHE = new Map<string, Worked>();
const CACHE_SIZE = 64;

/** How Maya teaches an evaluate question, or why she holds it; null for any other kind. */
export function evaluateTeaching(pkg: OperationPackage): Worked | null {
  if (pkg.operation.kind !== "evaluate") return null;
  const key = JSON.stringify([pkg.text, pkg.operation, pkg.easierExample.operation]);
  const hit = CACHE.get(key);
  if (hit) return hit;
  const worked = teach(pkg);
  if (CACHE.size >= CACHE_SIZE) CACHE.delete(CACHE.keys().next().value!);
  CACHE.set(key, worked);
  return worked;
}

function teach(pkg: OperationPackage): Worked {
  const op = pkg.operation as Extract<Operation, { kind: "evaluate" }>;
  const expr = op.operands[0];
  if (op.values && Object.keys(op.values).length > 0) return { held: "Maya teaches evaluate questions only with no unknowns yet" };
  // The package passed its check, so its steps are the operation's worked steps; read them again from the operation.
  const steps = workedSteps(op);
  if (!wholeSteps(steps)) return { held: "Maya teaches evaluate questions only with whole numbers yet" };
  const operates = steps.filter((s): s is OperateStep => s.kind === "operate");
  if (operates.length === 0) return { held: "Maya teaches evaluate questions only with an operation to work" };
  const frame = frameOf(pkg.text, expr, operates);
  if (frame === undefined) return { held: "Maya cannot read this missing-number question yet" };
  const parts: EvaluatePart[] = [];
  for (const [i, step] of operates.entries()) {
    const operation = partOperation(step);
    const method = partMethod(operation);
    if ("held" in method) return { held: `Maya cannot teach ${method.held} in evaluate questions yet` };
    const last = i === operates.length - 1;
    parts.push({
      id: step.id,
      step,
      expr: partText(step),
      operation,
      inner: method.steps,
      columns: method.steps.filter((s) => s.kind !== "result").map((s) => ({ ...s, id: `${step.id}.${s.id}` }) as WorkedStep),
      last,
      before: i === 0 ? expr : operates[i - 1].rest,
      reason: last ? null : reasonOf(step, step.rest, frame !== null, i === 0),
    });
  }
  const example = exampleFor(pkg, expr);
  if (!example) return { held: "Maya has no easier example of the same shape for this evaluate question yet" };
  return {
    teaching: {
      parts,
      steps: parts.flatMap((p) => (p.last ? p.columns : [...p.columns, p.step])),
      frame,
      example,
    },
  };
}

/** The teaching of a package Maya teaches (null for any other kind, or a held one). */
const teachingOf = (pkg: OperationPackage): EvaluateTeaching | null => {
  const t = evaluateTeaching(pkg);
  return t && "teaching" in t ? t.teaching : null;
};

/** The steps the child does in an evaluate question, without the result; null for any other kind. */
export function evaluateSteps(pkg: OperationPackage): WorkedStep[] | null {
  if (pkg.operation.kind !== "evaluate") return null;
  return teachingOf(pkg)?.steps ?? pkg.steps.filter((s) => s.kind !== "result");
}

/** The part a step of the child's question belongs to, and the part's own step it is (null for the part itself). */
export function partAt(pkg: OperationPackage, stepId: string): { part: EvaluatePart; inner: WorkedStep | null; first: boolean } | null {
  const t = teachingOf(pkg);
  if (!t) return null;
  for (const part of t.parts) {
    if (stepId === part.id && !part.last) return { part, inner: null, first: part.columns.length === 0 };
    const at = part.columns.findIndex((c) => c.id === stepId);
    if (at >= 0) return { part, inner: part.inner[at], first: at === 0 };
  }
  return null;
}

/** The one-step package of a part, for its column lines: its operation, steps and result. */
export function partPackage(pkg: OperationPackage, part: EvaluatePart): OperationPackage {
  return { ...pkg, operation: part.operation, steps: part.inner, answer: { value: { type: "number", value: part.step.value }, accepted: [], unit: null } };
}

/** The missing-number frame of an evaluate question Maya teaches, or null. Maya names the question by `printed`. */
export const evaluateFrame = (pkg: OperationPackage): Frame | null => teachingOf(pkg)?.frame ?? null;

/**
 * The steps done once a part counts as a whole (mutates and returns `done`): a part's result counts its columns done,
 * and all of its columns done count the part done.
 */
export function closeParts(pkg: OperationPackage, done: string[]): string[] {
  const t = teachingOf(pkg);
  if (!t) return done;
  for (const part of t.parts) {
    if (part.last) continue;
    const ids = part.columns.map((c) => c.id);
    if (done.includes(part.id)) {
      for (const id of ids) if (!done.includes(id)) done.push(id);
    } else if (ids.length > 0 && ids.every((id) => done.includes(id))) done.push(part.id);
  }
  return done;
}

/** The words a child may say between a part's numbers, by sign. Commutative signs take either order. */
const SIGN_WORDS: Record<Sign, string> = {
  "+": "plus|and|\\+",
  "−": "minus|take away|−|-",
  "×": "times|multiplied by|×|x|\\*",
  "÷": "divided by|÷|/",
};

/**
 * The part of an evaluate question whose column is this step ("e1" for "e1.r1-ones"), when the part has a step of its
 * own (not the last part). A part counts as the first step not done while one of its columns is: the columns are the
 * part's own working, so a child who gives 9 × 880 = 7920 is not walked through them.
 */
export function currentPart(pkg: OperationPackage, stepId: string): OperateStep | null {
  const at = partAt(pkg, stepId);
  return at?.inner && !at.part.last ? at.part.step : null;
}

/**
 * The whole turn is the part's own equation, the sum template of #698 for a part: "<a> <sign word> <b> is|equals|makes|=
 * <result>", with the part's operands in their order (either order for + and ×), in digits or words.
 */
export function partEquationSaid(body: string, step: OperateStep): boolean {
  const m = new RegExp(`^(.+?)\\s*(?:\\s(?:${SIGN_WORDS[step.op]})\\s|(?:${SIGN_WORDS[step.op]}))\\s*(.+?)\\s*(?:\\s(?:is|equals|makes|make)\\s|=)\\s*(.+)$`).exec(body);
  if (!m) return false;
  const [a, b, v] = [m[1], m[2], m[3]].map(plainNumber);
  if (a === null || b === null || v !== step.value) return false;
  const either = step.op === "+" || step.op === "×";
  return (a === step.left && b === step.right) || (either && a === step.right && b === step.left);
}

/**
 * The column boards of an evaluate question's parts: one per part with a layout (division has none yet), with the
 * parts before it (`after`), whose results its numbers may hold.
 */
export function partBoards(pkg: OperationPackage): { partId: string; id: string; operation: string; operands: [number, number]; expr: string; after: string[] }[] {
  const t = teachingOf(pkg);
  if (!t) return [];
  return t.parts.flatMap((p, i) => {
    const layout = LAYOUT[p.operation.kind];
    const after = t.parts.slice(0, i).map((x) => x.id);
    return layout ? [{ partId: p.id, id: `part-${p.id}`, operation: layout, operands: p.operation.operands as [number, number], expr: p.expr, after }] : [];
  });
}

/** The part a step of the child's question is in (its id), or null. */
export const partIdOf = (pkg: OperationPackage, stepId: string): string | null => partAt(pkg, stepId)?.part.id ?? null;

/** The steps of an evaluate question as the model reads them: id and what the step does; null for any other kind. */
export function evaluateModelSteps(pkg: OperationPackage): { id: string; text: string }[] | null {
  const t = teachingOf(pkg);
  if (!t) return null;
  return t.steps.map((s) => {
    const at = partAt(pkg, s.id);
    if (at?.inner) return { id: s.id, text: `${at.part.expr}: ${stepText(at.inner, at.part.operation)}` };
    return { id: s.id, text: stepText(s, pkg.operation) };
  });
}

/**
 * The package as Maya teaches it: for an evaluate question, with the easier example of the same shape (exampleFor).
 * Any other package as it is. The stored package never changes: this is a copy.
 */
export function withEvaluateExample<P extends OperationPackage>(pkg: P): P {
  const t = teachingOf(pkg);
  return t && t.example !== pkg.easierExample && JSON.stringify(t.example) !== JSON.stringify(pkg.easierExample) ? { ...pkg, easierExample: t.example } : pkg;
}

/**
 * The one-step problems inside an evaluate operation (each part, as its column method works it), for the scope check:
 * a child who says a part or a column of a part ("7 times 640 is 4480") stays on the question. Empty for any other
 * kind, and for a part code does not work.
 */
export function partProblems(operation: Operation): EasierExample[] {
  if (operation.kind !== "evaluate" || operationProblem(operation, MAYA_TEACHING_LIMITS) !== null) return [];
  return workedSteps(operation).flatMap((s) => {
    if (s.kind !== "operate") return [];
    const op = partOperation(s);
    const method = partMethod(op);
    return "steps" in method ? [{ text: partText(s), operation: op, answer: { type: "number" as const, value: s.value }, steps: method.steps }] : [];
  });
}

/**
 * A column the child did not do: its part counts done (from the part's result) before the column does. closeParts
 * adds a part's columns after the part, and a part after its columns, so the order of `done` tells them apart. Maya
 * never says such a column is right ("Yes! 4 × 7 = 28.") or done.
 */
export function partCovered(pkg: OperationPackage, done: readonly string[], stepId: string): boolean {
  const at = partAt(pkg, stepId);
  if (!at?.inner || at.part.last) return false;
  const part = done.indexOf(at.part.id);
  return part >= 0 && done.indexOf(stepId) > part;
}

/**
 * The missing-number frame's own relation, for the scope check: the child checks the missing number in the printed
 * equation ("8 times 870 is 6960." for 8 × ? = 6960; "8070 minus 70 is 8000." for 8070 − ? = 8000). A product takes
 * either order there. Empty without a frame.
 */
export function frameProblems(pkg: OperationPackage): EasierExample[] {
  const t = teachingOf(pkg);
  const last = t?.parts.at(-1);
  if (!t?.frame || !last) return [];
  const { left, right, value } = last.step;
  const operation: Operation = t.frame.verb === "divide" ? { kind: "multiply", operands: [right, value] } : { kind: "subtract", operands: [left, value] };
  if (operationProblem(operation, PART_LIMITS) !== null) return [];
  const steps = workedSteps(operation);
  const result = steps.at(-1);
  return result?.kind === "result" ? [{ text: t.frame.equation, operation, answer: result.value, steps }] : [];
}
