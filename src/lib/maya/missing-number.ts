// Missing numbers in Maya's calls (Wave A): a printed "a × ? = c", "? × a = c" or "a − ? = c" turned into the
// operation that finds the ? (the framing step), then that operation's own worked steps. Code computes every step from
// the printed equation alone, and Maya's package check (mayaPackageCheck) computes them again here, so a stored or
// edited package cannot change them:
// - a known factor with 1 or 2 digits divides: 30 × ? = 16200 is 16200 ÷ 30; a factor that ends in zeros first drops
//   them from both numbers (16200 ÷ 30 is 1620 ÷ 3), then long division;
// - a known factor with 3 digits (244 × ? = 1464) is found by trying numbers (trial-factor.ts), never by long division
//   by 244; only a one-digit missing factor;
// - a missing number taken away subtracts: 13000 − ? = 3000 is 13000 − 3000.
// The framing and zeros steps are Maya's to say (the easier example works them; on the child's question she says them
// with the first step's invite and with "Now you try yours"); the child's work steps start after them (teachSteps).
// Pure TypeScript: no clock, network or randomness.
import {
  checkQuestionPackage, workedSteps,
  type MissingNumberStep, type Operation, type OperationLimits, type PackageCheck, type QuestionPackage, type WorkedStep,
} from "@/lib/question-package";
import { inverseText, printedEquation, reducedText, zerosText } from "./missing-number-text";
import { trialStep, type TrialStep } from "./trial-factor";

export type FrameStep = Extract<MissingNumberStep, { kind: "missing-frame" }>;
export type ZerosStep = Extract<MissingNumberStep, { kind: "drop-zeros" }>;
/** The printed equation: its sign, the known number, where the ? is, and the number after "=". */
export type Printed = Pick<FrameStep, "sign" | "known" | "unknownFirst" | "total">;
/** How the missing number is found: divide, drop zeros then divide, try numbers, or subtract. */
export type MissingMethod = "divide" | "zeros" | "try" | "subtract";

/** The largest printed number a missing-number question may have (six columns, as Maya's board names them). */
export const MISSING_MAX = 999_999;
/** The largest divisor long division takes here; a bigger known factor (after its zeros) is found by trying. */
const LONG_DIVISOR_MAX = 99;

export interface MissingWork {
  method: MissingMethod;
  answer: number;
  operation: Operation;
  steps: WorkedStep[];
}

const isWhole = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= MISSING_MAX;
const trailingZeros = (n: number) => { let k = 0; while (n > 0 && n % 10 === 0) { n /= 10; k++; } return k; };

/**
 * The method, the answer, the operation and the worked steps (framing step first, result last) for a printed missing
 * number, or null when Maya has no method for it: a fraction or remainder answer, a number above MISSING_MAX, "? − a",
 * a 3-digit known factor with a missing factor above 9, or a 3-digit known factor that ends in zeros.
 */
export function missingWork(p: Printed): MissingWork | null {
  if (!isWhole(p.known) || !isWhole(p.total) || typeof p.unknownFirst !== "boolean") return null;
  if (p.sign === "×") {
    if (p.known < 1 || p.total < 1 || p.total % p.known !== 0) return null;
    const answer = p.total / p.known;
    const frame: FrameStep = { id: "frame", kind: "missing-frame", sign: "×", known: p.known, unknownFirst: p.unknownFirst, total: p.total, inverse: "÷", from: p.total, by: p.known };
    const k = trailingZeros(p.known);
    const toBy = p.known / 10 ** k;
    const toFrom = p.total / 10 ** k;
    const operation: Operation = { kind: "divide", operands: [toFrom, toBy] };
    const zeros: ZerosStep[] = k > 0 ? [{ id: "zeros", kind: "drop-zeros", from: p.total, by: p.known, zeros: k, toFrom, toBy }] : [];
    if (toBy <= LONG_DIVISOR_MAX) return { method: k > 0 ? "zeros" : "divide", answer, operation, steps: [frame, ...zeros, ...workedSteps(operation)] };
    const trial = k === 0 ? trialStep(toBy, toFrom) : null;
    if (!trial) return null;
    return { method: "try", answer, operation, steps: [frame, trial, { id: "result", kind: "result", value: { type: "number", value: answer } }] };
  }
  if (p.sign === "−") {
    if (p.unknownFirst || p.total > p.known) return null;
    const operation: Operation = { kind: "subtract", operands: [p.known, p.total] };
    const frame: FrameStep = { id: "frame", kind: "missing-frame", sign: "−", known: p.known, unknownFirst: false, total: p.total, inverse: "−", from: p.known, by: p.total };
    return { method: "subtract", answer: p.known - p.total, operation, steps: [frame, ...workedSteps(operation)] };
  }
  return null;
}

/** The printed equation's closed forms: digits only (no sign, comma or leading zero), one space around each sign. */
const NUMBER = "(0|[1-9]\\d{0,5})";
const FORMS: readonly [RegExp, (m: RegExpExecArray) => Printed][] = [
  [new RegExp(`^${NUMBER} × \\? = ${NUMBER}$`), (m) => ({ sign: "×", known: Number(m[1]), unknownFirst: false, total: Number(m[2]) })],
  [new RegExp(`^\\? × ${NUMBER} = ${NUMBER}$`), (m) => ({ sign: "×", known: Number(m[1]), unknownFirst: true, total: Number(m[2]) })],
  [new RegExp(`^${NUMBER} − \\? = ${NUMBER}$`), (m) => ({ sign: "−", known: Number(m[1]), unknownFirst: false, total: Number(m[2]) })],
];

/** The printed missing number of a question text, by an exact form only; null for any other text. */
export function readPrinted(text: string): Printed | null {
  for (const [form, build] of FORMS) {
    const m = form.exec(text);
    if (m) return build(m);
  }
  return null;
}

/** The framing step a package's (or easier example's) steps start with, or null. */
export function frameOf(steps: unknown): FrameStep | null {
  const first = Array.isArray(steps) ? steps[0] : null;
  return typeof first === "object" && first !== null && (first as { kind?: unknown }).kind === "missing-frame" ? first as FrameStep : null;
}

/** Plain data equal at every depth, whatever the key order. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Why a part's text, operation and steps are not the missing number code computes from its frame, or its method. */
function partProblem(text: unknown, operation: unknown, steps: unknown, what: string): { problem: string } | { method: MissingMethod } {
  const frame = frameOf(steps);
  if (!frame) return { problem: `${what} has no framing step` };
  const work = missingWork(frame);
  if (!work) return { problem: `${what}: Maya has no method for this missing number` };
  if (text !== printedEquation(frame)) return { problem: `${what}'s framing step is not its printed equation` };
  if (!same(operation, work.operation) || !same(steps, work.steps)) return { problem: `${what}'s missing-number steps are not the steps code computes` };
  return { method: work.method };
}

/** The package's steps start with a framing step: Maya's check computes them (checkMissingNumber). */
export const isMissingNumber = (raw: unknown): boolean =>
  typeof raw === "object" && raw !== null && frameOf((raw as { steps?: unknown }).steps) !== null;

/**
 * Maya's check of a missing-number package, or null for any other package (the default check applies). The question's
 * and the easier example's framing steps, operation and steps must be what code computes from their printed equations,
 * with the same method; then the package, with its operation's plain worked steps in their place, must pass the
 * default check under `limits` (its answer, wrong answers, smaller easier example and item).
 */
export function checkMissingNumber(raw: unknown, limits?: OperationLimits): PackageCheck | null {
  if (!isMissingNumber(raw)) return null;
  const p = raw as Record<string, unknown>;
  const failed = (reason: string): PackageCheck => ({ ok: false, status: "failed", reason });
  const target = partProblem(p.text, p.operation, p.steps, "the question");
  if ("problem" in target) return failed(target.problem);
  const easier = p.easierExample;
  if (typeof easier !== "object" || easier === null) return failed("the package has no easier example");
  const e = easier as Record<string, unknown>;
  const example = partProblem(e.text, e.operation, e.steps, "the easier example");
  if ("problem" in example) return failed(example.problem);
  if (example.method !== target.method) return failed("the easier example is not found the same way as the question");
  const plain = (op: unknown) => workedSteps(op as Operation);
  const base = { ...p, steps: plain(p.operation), easierExample: { ...e, steps: plain(e.operation) } };
  const check = checkQuestionPackage(base, undefined, limits);
  if (check.ok) return { ok: true, status: "checked", package: raw as QuestionPackage };
  return check.status === "not-checked" ? { ...check, package: raw as QuestionPackage } : check;
}

/**
 * The expressions a child may say about a missing-number step without leaving the question (scope.ts): each try of
 * a try step (236 × 7), the framing's own operation (1620 ÷ 30) and its check (30 × 54), and a zeros step's division
 * (162 ÷ 3). Every number is the checked step's.
 */
export function missingScope(st: WorkedStep): ["multiply" | "divide" | "subtract", number[]][] {
  switch (st.kind) {
    case "try-factor":
      return st.tries.map((t): ["multiply", number[]] => ["multiply", [st.factor, t.value]]);
    case "missing-frame": {
      const work = missingWork(st);
      if (!work) return [];
      return st.sign === "×"
        ? [["divide", [st.from, st.by]], ["multiply", [st.known, work.answer]]]
        : [["subtract", [st.from, st.by]], ["subtract", [st.known, work.answer]]];
    }
    case "drop-zeros":
      return [["divide", [st.from, st.by]], ["divide", [st.toFrom, st.toBy]]];
    default:
      return [];
  }
}

/** What a framed package's lines say: its printed equation, the operation that finds the ?, and the zeros or the try. */
export interface FramedLines {
  printed: string;
  inverse: string;
  /** Why that operation finds the ?: "30 times the missing number makes 1620", from the printed equation. */
  reason: string;
  method: MissingMethod;
  zeros: ZerosStep | null;
  trial: TrialStep | null;
}

/** The lines' view of a checked framed package's steps, or null for any other. */
export function framedLines(steps: readonly WorkedStep[]): FramedLines | null {
  const frame = frameOf(steps);
  const work = frame ? missingWork(frame) : null;
  if (!frame || !work) return null;
  const zeros = steps.find((s): s is ZerosStep => s.kind === "drop-zeros") ?? null;
  const trial = steps.find((s): s is TrialStep => s.kind === "try-factor") ?? null;
  return { printed: printedEquation(frame), inverse: inverseText(frame), reason: reasonText(frame), method: work.method, zeros, trial };
}

/** The printed equation in words, the reason for the framing: "30 times the missing number makes 1620". */
function reasonText(f: FrameStep): string {
  if (f.sign === "−") return `${f.known} take away the missing number is ${f.total}`;
  return f.unknownFirst ? `The missing number times ${f.known} makes ${f.total}` : `${f.known} times the missing number makes ${f.total}`;
}

/** The wordings of the framing lines (lines.ts merges them into its TEMPLATES). Pending Savar's approval (D-202). */
export const MISSING_TEMPLATES = {
  // Each framing line says why first ({reason}: "30 times the missing number makes 1620"), so a child who asks why
  // Maya divides hears it in code's words. {Reason} is the same words with a capital.
  "invite.frame": [
    "{Reason}. So the missing number is {inverse}. Let's start with {where}. What can you do there?",
    "{Reason}. To find the missing number, work out {inverse}. Let's look at {where} first.",
    "{Reason}. That means the missing number is {inverse}. Start with {where}. What do you think?",
    "{Reason}. So work out {inverse} to find it. First, {where}. What would you do?",
    "{Reason}. We find the missing number with {inverse}. Start with {where}.",
  ],
  "invite.frame.zeros": [
    "{Reason}. So the missing number is {inverse}. Take {zeros} off both numbers. That gives {reduced}.",
    "{Reason}. To find it, work out {inverse}. Take {zeros} off both numbers. Now it's {reduced}.",
    "{Reason}. That means the missing number is {inverse}. Take {zeros} off both to get {reduced}.",
    "{Reason}. So work out {inverse}. Take {zeros} off both numbers. That makes {reduced}.",
    "{Reason}. We find it with {inverse}. Take {zeros} off both numbers. We get {reduced}.",
  ],
  "invite.frame.try": [
    "{Reason}. So the missing number is {inverse}. Try a number for it. What is {factor} times your number?",
    "{Reason}. To find it, work out {inverse}. Pick a number to try. Multiply {factor} by it.",
    "{Reason}. That means the missing number is {inverse}. Let's try a number. What do you get for {factor} times it?",
    "{Reason}. So work out {inverse}. Guess a number first. Then work out {factor} times it.",
    "{Reason}. We find it with {inverse}. Choose a number. Then multiply it by {factor}.",
  ],
  // A child's question about the first step (J06): code's answer, from the printed equation. Pending D-202.
  "frame.why": [
    "{Reason}. That is why we work out {inverse}.",
    "{Reason}. So {inverse} gives the missing number.",
    "Here's why. {Reason}. So we work out {inverse}.",
    "{Reason}. Working out {inverse} finds the missing number.",
    "Because {reason}. So the missing number is {inverse}.",
  ],
  "trial.why": [
    "Dividing by {factor} in your head is hard. Multiplying is easier. So we try a number and multiply it by {factor}.",
    "{Reason}. Multiplying by {factor} is easier than dividing. So we try a number and check it.",
    "It's hard to divide by {factor}. It's easier to multiply. So we try a number and check {factor} times it.",
    "We try numbers because multiplying is easier than dividing by {factor}. Each try shows if we need bigger or smaller.",
    "{Reason}. A try times {factor} shows if the number is too big or too small.",
  ],
  "try.target.frame": [
    "Now you try yours: {expr}. To find the missing number, work out {inverse}.",
    "Your turn! Try {expr}. Work out {inverse} to find the missing number.",
    "Can you try {expr} the same way? The missing number is {inverse}.",
    "Now it's your turn with {expr}. Find the missing number with {inverse}.",
    "Over to you! Try {expr}. Work out {inverse} the same way.",
  ],
} as const satisfies Record<string, readonly string[]>;

export type MissingKey = keyof typeof MISSING_TEMPLATES;

/**
 * The framing, said before the first step's hint while Maya has not said it yet in the call (frameDue): "The missing
 * number is 1620 ÷ 30. That is 162 ÷ 3." So a child who starts with "I'm stuck." hears where 162 ÷ 3 comes from.
 */
export function frameLead(f: FramedLines): string {
  return f.zeros ? `The missing number is ${f.inverse}. That is ${reducedText(f.zeros)}.` : `The missing number is ${f.inverse}.`;
}

/** The framing is still due: the question is a missing number and none of Maya's turns so far said its operation. */
export function frameDue(steps: readonly WorkedStep[], said: readonly string[]): boolean {
  const f = framedLines(steps);
  return f !== null && !said.some((t) => t.includes(f.inverse));
}

/** Why the first step does what it does (step.why), for "Why do I divide?" or "Why do I try numbers?". */
export function frameWhy(f: FramedLines): { key: MissingKey; vars: Record<string, string | number> } {
  const Reason = f.reason[0].toUpperCase() + f.reason.slice(1);
  return f.trial ? { key: "trial.why", vars: { factor: f.trial.factor, Reason } } : { key: "frame.why", vars: { Reason, reason: f.reason, inverse: f.inverse } };
}

/** The invite of the first work step of a framed question, H0: it says the framing (and the zeros) first. */
export function frameInvite(f: FramedLines, where: string): { key: MissingKey; vars: Record<string, string | number> } {
  const why = { Reason: f.reason[0].toUpperCase() + f.reason.slice(1), inverse: f.inverse };
  if (f.trial) return { key: "invite.frame.try", vars: { ...why, factor: f.trial.factor } };
  if (f.zeros) return { key: "invite.frame.zeros", vars: { ...why, zeros: zerosText(f.zeros.zeros), reduced: reducedText(f.zeros) } };
  return { key: "invite.frame", vars: { ...why, where } };
}
