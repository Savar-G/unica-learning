// The question package (#298, spec #295): the one shape every product reads a question in. Maya reads it to help on
// the child's exact question, the answer checker and marking read the answer and the steps, and the workbook store
// keeps it. A package says where the question comes from (a workbook page or an assessment test), the typed answer and
// the other forms that count as right, a computable operation with its worked steps, the skill (a BC standard and its
// smaller skills), the level (U1-U30, kept as 1-30), the difficulty, the expected wrong answers with their causes, and
// one easier example of the same operation with its answer and steps.
//
// The worked steps are data that code builds from the operation (workedSteps): numbers only, so a package is trusted
// only when its answer and steps are what the operation gives (checkQuestionPackage), and a change of wording never
// makes a stored package invalid. stepText gives each step's words for a board or a voice. There is no parser of
// question text: the operation is stored beside the text. Every operation kind has its computation in
// question-package-math.ts (#306 added long multiplication and division, decimals and fractions); a kind code cannot
// compute, or steps of a version it cannot read, are "unsupported", never a pass.
// Pure TypeScript: no Next.js, React, network, database or clock.
import { BC_SKILL_MAP } from "@/lib/assessment";
import {
  computation,
  gcd,
  operationCheck,
  operationProblem,
  operationResult,
  operationText,
  valueText,
  workedSteps,
  type SameNumberWrongRule,
} from "@/lib/question-package-math";

export { operationProblem, operationResult, operationText, stepText, valueText, workedSteps } from "@/lib/question-package-math";

/**
 * The version of the QuestionPackage shape. The workbook store keeps it beside each stored package (#299), so a reader
 * can tell a package of an older shape from a broken one. Raise it when the shape changes.
 */
export const QUESTION_PACKAGE_VERSION = 1;

/** A workbook question: the page number runs through the whole workbook; the question number restarts on each page. */
export interface WorkbookQuestionRef {
  source: "workbook";
  workbookId: string;
  page: number;
  question: number;
}

/** A question of a child's assessment test: the test's id and the question's id in the stored test ("s1-3"). */
export interface AssessmentQuestionRef {
  source: "assessment";
  assessmentId: string;
  questionId: string;
}

/** Where a question comes from. */
export type QuestionRef = WorkbookQuestionRef | AssessmentQuestionRef;

/**
 * A typed answer value. "number" is a whole number or a decimal; a fraction and a mixed number keep their written parts;
 * "remainder" is a division answer with a remainder ("26 R 1").
 */
export type AnswerValue =
  | { type: "number"; value: number }
  | { type: "fraction"; numerator: number; denominator: number }
  | { type: "mixed"; whole: number; numerator: number; denominator: number }
  | { type: "remainder"; quotient: number; remainder: number }
  | { type: "expression"; value: string }
  | { type: "choice"; value: string }
  | { type: "text"; value: string };

/**
 * The answer: its value, other written forms of the same number that also count as right (for example 2/4 or 0.5 for
 * 1/2; only number, fraction and mixed number forms, as code can check them), and its unit.
 */
export interface PackageAnswer {
  value: AnswerValue;
  accepted: AnswerValue[];
  unit: string | null;
}

/** A number in a fraction operation: a fraction, a mixed number or a whole number. */
export type FractionOperand = Extract<AnswerValue, { type: "number" | "fraction" | "mixed" }>;

/** The two parts of a fraction inside a worked step. */
export interface FractionParts {
  numerator: number;
  denominator: number;
}

/**
 * A computable operation (question-package-math.ts has the limits of each kind):
 * - add, subtract: whole numbers from 0 to 9999; subtraction never goes below zero.
 * - multiply: a whole number to 9999 times a whole number to 999 (long multiplication).
 * - divide: a whole number to 9999 divided by a whole number from 1 to 99 (long division, with a remainder).
 * - decimal-add, decimal-subtract, decimal-multiply: numbers to 9999.999 with at most 3 decimal places.
 * - fraction-add, fraction-subtract, fraction-multiply, fraction-divide: fractions, mixed numbers or whole numbers.
 * - fraction-simplify: one fraction to write in simplest form.
 * - fraction-equivalent: one fraction to write with a new denominator ("3/4 = ?/12").
 */
export type Operation =
  | KindsOf<"add" | "subtract" | "multiply" | "divide" | "decimal-add" | "decimal-subtract" | "decimal-multiply", [number, number]>
  | KindsOf<"fraction-add" | "fraction-subtract" | "fraction-multiply" | "fraction-divide", [FractionOperand, FractionOperand]>
  | { kind: "fraction-simplify"; operands: [Extract<AnswerValue, { type: "fraction" }>] }
  | { kind: "fraction-equivalent"; operands: [Extract<AnswerValue, { type: "fraction" }>]; denominator: number };

/** One operation shape for each kind, so a kind picks its shape. */
type KindsOf<K extends string, O> = K extends string ? { kind: K; operands: O } : never;

/** The operations code can compute. */
export type OperationKind = Operation["kind"];

/** A column of the written method. */
export type Place =
  | "thousandths" | "hundredths" | "tenths"
  | "ones" | "tens" | "hundreds" | "thousands" | "ten thousands" | "hundred thousands" | "millions";

/**
 * One worked step, with the numbers a board shows. `id` names the step (a column's place, "r2-tens", "common");
 * a wrong answer names the step where its mistake happens by this id. The shapes are version 1 (STEPS_VERSIONS).
 */
export type WorkedStep =
  | {
      id: string;
      kind: "add-column";
      place: Place;
      /** The column's digits, top to bottom; a number with no digit in this column adds none. */
      digits: number[];
      /** The ten carried in from the column to the right. */
      carryIn: number;
      total: number;
      write: number;
      carryOut: number;
    }
  | {
      id: string;
      kind: "subtract-column";
      place: Place;
      /** The top digit as written, or 0 when the top number has no digit in this column (addedZero). */
      top: number;
      /** The bottom digit, or null when the bottom number has no digit in this column. */
      bottom: number | null;
      /** This column gave 1 to the column to its right, so its top is 1 less. */
      lent: boolean;
      /** This column took 1 from the column to its left, so its top is 10 more. */
      regrouped: boolean;
      /** The digit written, or null for a 0 on the left of the result, which is not written (105 - 98 is 7). */
      write: number | null;
      /** Only when true: the top decimal has fewer places, so a 0 is written in (5.2 - 1.75 works 5.20). */
      addedZero?: true;
    }
  | {
      /**
       * "r<row>-<place>": row 1 is the multiplier's ones digit. A decimal multiplication works its numbers without the
       * points (2.5 x 1.3 as 25 x 13), so its places are those of the whole numbers; "place-point" then puts the point.
       */
      id: string;
      kind: "multiply-digit";
      /** The place of the multiplier's digit; its row is written that many places to the left. */
      row: Place;
      /** The place of the top digit in the top number. */
      place: Place;
      /** The top digit, or null for the last carry of the row, which is written as it is. */
      top: number | null;
      multiplier: number;
      carryIn: number;
      total: number;
      /** The digit written, or null for a 0 on the left of a row of 0s. */
      write: number | null;
      carryOut: number;
    }
  | {
      /** "r<row>": a row of a multiplier with more than one digit. */
      id: string;
      kind: "partial-product";
      row: Place;
      multiplier: number;
      /** The 0s written on the right of the row first. */
      zeros: number;
      /** The row's value, with its 0s. */
      value: number;
    }
  | {
      /** "point": a decimal multiplication puts the point in the whole-number product. */
      id: string;
      kind: "place-point";
      product: number;
      decimals: number;
      value: number;
    }
  | {
      /** The place of the dividend digit brought down; the quotient digit is written above it. */
      id: string;
      kind: "divide-digit";
      place: Place;
      digit: number;
      /** The number divided at this step: the last remainder and the digit brought down. */
      current: number;
      quotient: number;
      /** The quotient digit written, or null for a 0 on the left of the quotient. */
      write: number | null;
      product: number;
      remainder: number;
    }
  | { id: string; kind: "to-improper"; from: FractionOperand[]; to: FractionParts[] }
  | { id: string; kind: "common-denominator"; from: FractionParts[]; denominator: number; factors: number[]; to: FractionParts[] }
  | { id: string; kind: "combine-numerators"; op: "add" | "subtract"; numerators: number[]; denominator: number; numerator: number }
  | { id: string; kind: "flip"; from: FractionParts; to: FractionParts }
  | { id: string; kind: "multiply-fractions"; numerators: number[]; denominators: number[]; numerator: number; denominator: number }
  | { id: string; kind: "simplify"; from: FractionParts; divisor: number; to: FractionParts }
  | { id: string; kind: "to-mixed"; from: FractionParts; whole: number; rest: FractionParts }
  | { id: string; kind: "scale-fraction"; from: FractionParts; by: "multiply" | "divide"; factor: number; to: FractionParts }
  | { id: "result"; kind: "result"; value: AnswerValue };

/** An expected wrong answer and its cause: a misconception id ("O3") and its plain description. */
export interface WrongAnswer {
  value: AnswerValue;
  cause: string;
  description: string;
  /** The worked step where the mistake happens, or null when it is not one step (a wrong operation). */
  step: string | null;
}

/** One easier example of the same operation, for Maya to work on the board before the child's own question. */
export interface EasierExample {
  text: string;
  operation: Operation;
  answer: AnswerValue;
  steps: WorkedStep[];
}

/**
 * The difficulty inside the question's level: 1 is easier than the level's core questions, 2 is the core, 3 is a
 * stretch.
 */
export type Difficulty = 1 | 2 | 3;

export interface QuestionPackage {
  /**
   * The question's stable id, kept when pages are renumbered: a workbook question's own id; for an assessment
   * question, "<test id>:<question id>".
   */
  id: string;
  ref: QuestionRef;
  /** The assessment template the question came from, or null. */
  templateId: string | null;
  /** The question as the child reads it. */
  text: string;
  answer: PackageAnswer;
  operation: Operation;
  /**
   * The shape version of the worked steps here and in the easier example; absent means 1. Code checks only the
   * versions in STEPS_VERSIONS; any other is "unsupported", never a pass.
   */
  stepsVersion?: number;
  steps: WorkedStep[];
  /** A BC standard code ("2.4") and the ids of its smaller skills in the BC skill map. */
  skill: { standard: string; skills: string[] };
  /** The Unica level, 1 to 30 (shown as U1 to U30). */
  level: number;
  difficulty: Difficulty;
  wrongAnswers: WrongAnswer[];
  easierExample: EasierExample;
}

/** Why a question has no trusted package. */
export type UnavailableReason = "unsupported-template" | "invalid-package";

/**
 * A question read: the package, no such question, or "content unavailable": the question exists, but no trusted
 * package can be given for it. A product never teaches or marks from an unavailable question.
 */
export type QuestionLookup =
  | { status: "found"; package: QuestionPackage }
  | { status: "not-found" }
  | { status: "unavailable"; reason: UnavailableReason; detail: string };

/**
 * A package check: "checked" (code recomputed the answer, every step and the easier example), "failed" with the first
 * reason, or "unsupported": code cannot compute the operation or read its steps, so the question is not checked by
 * code. Only "checked" is ok.
 */
export type PackageCheck =
  | { ok: true; status: "checked"; package: QuestionPackage }
  | { ok: false; status: "failed"; reason: string }
  | { ok: false; status: "unsupported"; reason: string };

/** The worked-step shape versions code can check. Version 1 is the shapes of WorkedStep. */
export const STEPS_VERSIONS: readonly number[] = [1];

// ---------- Validation ----------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isWhole = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Two answer values are the same written value. Equivalent forms (2/4 and 1/2) are not the same here. */
export function sameValue(a: AnswerValue, b: AnswerValue): boolean {
  switch (a.type) {
    case "fraction":
      return b.type === "fraction" && a.numerator === b.numerator && a.denominator === b.denominator;
    case "mixed":
      return b.type === "mixed" && a.whole === b.whole && a.numerator === b.numerator && a.denominator === b.denominator;
    case "remainder":
      return b.type === "remainder" && a.quotient === b.quotient && a.remainder === b.remainder;
    default:
      return a.type === b.type && a.value === (b as { value: unknown }).value;
  }
}

/** Same data, deeply, in any key order (jsonb does not keep it): for the stored steps against the computed ones. */
function sameData(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameData(x, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => k in b && sameData(a[k], b[k]));
  }
  return a === b;
}

/**
 * A number, fraction, mixed number or a remainder answer with no remainder as an exact rational [numerator, denominator] (BigInt, denominator above 0), or
 * null for a value that is not one of them. A decimal is read from its written digits, so 85.0000000001 is not 85.
 */
function rational(v: AnswerValue): [bigint, bigint] | null {
  // "26 R 0" is the number 26; any other remainder answer is a form of its own.
  if (v.type === "remainder") return v.remainder === 0 && Number.isSafeInteger(v.quotient) ? [BigInt(v.quotient), BigInt(1)] : null;
  if (v.type === "fraction" || v.type === "mixed") {
    const whole = v.type === "mixed" ? v.whole : 0;
    if (![whole, v.numerator, v.denominator].every(Number.isInteger) || v.denominator <= 0) return null;
    return [BigInt(whole) * BigInt(v.denominator) + BigInt(v.numerator), BigInt(v.denominator)];
  }
  if (v.type !== "number" || !Number.isFinite(v.value)) return null;
  // String() writes very small and very large numbers with an exponent (1e-7, 1e+21), so read it too.
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(v.value));
  if (!m) return null;
  const decimals = m[3] ?? "";
  const exponent = Number(m[4] ?? 0) - decimals.length;
  const ten = BigInt(10);
  const digits = BigInt(m[1] + m[2] + decimals);
  return exponent >= 0 ? [digits * ten ** BigInt(exponent), BigInt(1)] : [digits, ten ** BigInt(-exponent)];
}

/** Two values are the same number, exactly, in any number form (85, 85.0, 170/2 and 84 2/2 are one number). */
function sameNumber(a: AnswerValue, b: AnswerValue): boolean {
  const x = rational(a);
  const y = rational(b);
  return x !== null && y !== null && x[0] * y[1] === y[0] * x[1];
}

/** The same written value, or the same number in another form (85, 85.0 and 170/2; 14/16 and 7/8). */
export const equivalent = (a: AnswerValue, b: AnswerValue) => sameValue(a, b) || sameNumber(a, b);

/**
 * A value that answers an operation by its kind's rules (the rules checkQuestionPackage holds an answer to): the answer
 * or one of its accepted forms, or, where the kind takes any simplest form, the exact number in a simplest form (5/4 and
 * 1 1/4 for 2/3 + 7/12). The operation must be valid.
 */
export function isRightAnswer(operation: Operation, answer: PackageAnswer, value: AnswerValue): boolean {
  if ([answer.value, ...answer.accepted].some((r) => sameValue(r, value))) return true;
  const rules = computation(operation);
  return rules.answer === "simplest" && isSimplest(value) && sameNumber(value, rules.exact(operation));
}

/**
 * A simplest form: a whole number, a fraction in lowest terms with a denominator from 2, or a mixed number in lowest
 * terms (5/4 and 1 1/4 are both simplest; 10/8, 4/4 and 1 2/8 are not).
 */
function isSimplest(v: AnswerValue): boolean {
  switch (v.type) {
    case "number":
      return Number.isInteger(v.value) && v.value >= 0;
    case "fraction":
      return v.denominator >= 2 && v.numerator >= 0 && gcd(v.numerator, v.denominator) === 1;
    case "mixed":
      return v.whole >= 1 && v.numerator >= 1 && v.numerator < v.denominator && gcd(v.numerator, v.denominator) === 1;
    default:
      return false;
  }
}

function refProblem(ref: unknown): string | null {
  if (!isObject(ref)) return "the reference is missing";
  if (ref.source === "workbook") {
    if (!isText(ref.workbookId)) return "the workbook reference has no workbook id";
    if (!isWhole(ref.page, 1)) return "the workbook reference needs a page number from 1";
    if (!isWhole(ref.question, 1)) return "the workbook reference needs a question number from 1";
    return null;
  }
  if (ref.source === "assessment") {
    if (!isText(ref.assessmentId)) return "the assessment reference has no test id";
    if (!isText(ref.questionId)) return "the assessment reference has no question id";
    return null;
  }
  return "the reference's source is not workbook or assessment";
}

/** A whole number in the safe range from 0. */
const isCount = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;

function valueProblem(value: unknown, what: string): string | null {
  if (!isObject(value)) return `${what} is missing`;
  switch (value.type) {
    case "number":
      // Beyond the safe range a stored number is not the number written, so code cannot compare it exactly.
      return typeof value.value === "number" && Number.isFinite(value.value) && Math.abs(value.value) <= Number.MAX_SAFE_INTEGER
        ? null : `${what} is not a finite number in the safe range`;
    case "fraction":
      return Number.isSafeInteger(value.numerator) && isWhole(value.denominator, 1) ? null : `${what} is not a fraction with a whole numerator and a denominator from 1`;
    case "mixed":
      return isWhole(value.whole, 1) && isWhole(value.numerator, 1) && isWhole(value.denominator, 2) && value.numerator < value.denominator
        ? null : `${what} is not a mixed number: a whole number from 1 and a fraction below 1`;
    case "remainder":
      return isCount(value.quotient) && isCount(value.remainder) ? null : `${what} is not a quotient and a remainder of whole numbers`;
    case "expression":
    case "choice":
    case "text":
      return isText(value.value) ? null : `${what} has no text`;
    default:
      return `${what} has an unknown type`;
  }
}

/** A part (the question or its easier example): its operation is valid, and its answer and steps are what it gives. */
function partProblem(operation: unknown, answer: unknown, steps: unknown, what: string): string | null {
  const problem = operationProblem(operation);
  if (problem) return what === "the question" ? problem : `${what}: ${problem}`;
  const value = valueProblem(answer, `${what}'s answer`);
  if (value) return value;
  const op = operation as Operation;
  const rules = computation(op);
  const right = rules.answer === "result"
    ? sameValue(answer as AnswerValue, operationResult(op))
    : isSimplest(answer as AnswerValue) && sameNumber(answer as AnswerValue, rules.exact(op));
  if (!right) return `${what}'s answer is not what its operation gives`;
  if (!sameData(steps, workedSteps(op))) return `${what}'s worked steps are not the steps of its operation`;
  return null;
}

/** How big an operation is: the digits it is written with, then its count of worked steps. */
interface Size {
  digits: number;
  steps: number;
}
const size = (operation: Operation): Size => ({ digits: (operationText(operation).match(/\d/g) ?? []).length, steps: workedSteps(operation).length });
/** An easier example has fewer digits, or as many digits and fewer steps (1/5 + 2/5 is easier than 2/3 + 3/4). */
const smaller = (a: Size, b: Size) => a.digits < b.digits || (a.digits === b.digits && a.steps < b.steps);

type Problem = { status: "failed" | "unsupported"; reason: string };
const failed = (reason: string | null): Problem | null => (reason ? { status: "failed", reason } : null);

function packageProblem(p: unknown): Problem | null {
  if (!isObject(p)) return failed("the package is not an object");
  if (!isText(p.id)) return failed("the package has no id");
  const ref = refProblem(p.ref);
  if (ref) return failed(ref);
  if (p.templateId !== null && !isText(p.templateId)) return failed("the template id is not text or null");
  if (!isText(p.text)) return failed("the question has no text");
  if (p.stepsVersion !== undefined) {
    if (!isWhole(p.stepsVersion, 1)) return failed("the steps version is not a whole number from 1");
    if (!STEPS_VERSIONS.includes(p.stepsVersion)) return { status: "unsupported", reason: `code cannot read worked steps of version ${p.stepsVersion}` };
  }
  const operation = operationCheck(p.operation);
  if (operation?.status === "unsupported") return operation;
  const form = unknownForm(p);
  if (form) return { status: "unsupported", reason: `code cannot check answers of type ${form}` };
  // Only an easier example of the question's (valid) operation kind can be beyond code; another kind fails later.
  const easier = operation === null && isObject(p.easierExample) && isObject(p.easierExample.operation)
    && p.easierExample.operation.kind === (p.operation as Operation).kind ? operationCheck(p.easierExample.operation) : null;
  if (easier?.status === "unsupported") return { status: "unsupported", reason: `the easier example: ${easier.reason}` };
  return failed(contentProblem(p));
}

const ANSWER_TYPES: readonly string[] = ["number", "fraction", "mixed", "remainder", "expression", "choice", "text"];

/** The first answer type in the package that code does not know, or null. */
function unknownForm(p: Record<string, unknown>): string | null {
  const answer = isObject(p.answer) ? p.answer : {};
  const easier = isObject(p.easierExample) ? p.easierExample : {};
  const values = [
    answer.value,
    ...(Array.isArray(answer.accepted) ? answer.accepted : []),
    ...(Array.isArray(p.wrongAnswers) ? p.wrongAnswers.map((w) => (isObject(w) ? w.value : null)) : []),
    easier.answer,
  ];
  const unknown = values.find((v) => isObject(v) && typeof v.type === "string" && !ANSWER_TYPES.includes(v.type));
  return unknown ? String((unknown as { type: string }).type) : null;
}

/** The answer, the steps and everything after them, for a package whose operation code can compute. */
function contentProblem(p: Record<string, unknown>): string | null {
  const answer = p.answer;
  if (!isObject(answer)) return "the answer is missing";
  const work = partProblem(p.operation, answer.value, p.steps, "the question");
  if (work) return work;
  const target = p.operation as Operation;
  const rules = computation(target);
  const exact = rules.exact(target);
  const value = answer.value as AnswerValue;
  if (!Array.isArray(answer.accepted)) return "the accepted forms are not a list";
  if (rules.accepted === "none" && answer.accepted.length > 0) return "this question takes only its answer, with no other forms";
  for (const form of answer.accepted) {
    const problem = valueProblem(form, "an accepted form");
    if (problem) return problem;
    if (rational(form as AnswerValue) === null) return "an accepted form is not a number or a fraction, so code cannot check it";
    if (sameValue(form as AnswerValue, value)) return "an accepted form repeats the answer";
    if (!sameNumber(form as AnswerValue, exact)) return `the accepted form ${valueText(form as AnswerValue)} is not the answer's number`;
    if (rules.accepted === "simplest" && !isSimplest(form as AnswerValue)) return `the accepted form ${valueText(form as AnswerValue)} is not in simplest form`;
  }
  if (answer.unit !== null && !isText(answer.unit)) return "the unit is not text or null";
  const rightForms = [value, ...answer.accepted] as AnswerValue[];

  if (!isObject(p.skill) || !isText(p.skill.standard) || !Array.isArray(p.skill.skills)) return "the skill needs a standard and a list of skills";
  const code = p.skill.standard;
  const standard = BC_SKILL_MAP.standards.find((s) => s.code === code);
  if (!standard) return `the standard ${code} is not in the BC skill map`;
  for (const id of p.skill.skills) {
    if (!standard.skills.some((s) => s.id === id)) return `the skill ${String(id)} is not a skill of standard ${standard.code}`;
  }

  if (!isWhole(p.level, 1, 30)) return "the level is not U1 to U30";
  if (p.difficulty !== 1 && p.difficulty !== 2 && p.difficulty !== 3) return "the difficulty is not 1, 2 or 3";

  if (!Array.isArray(p.wrongAnswers) || p.wrongAnswers.length === 0) return "the package has no wrong answers";
  const stepIds = (p.steps as WorkedStep[]).map((s) => s.id);
  const seen: AnswerValue[] = [];
  for (const w of p.wrongAnswers) {
    if (!isObject(w)) return "a wrong answer is not an object";
    const problem = valueProblem(w.value, "a wrong answer");
    if (problem) return problem;
    const wrongValue = w.value as AnswerValue;
    if (isRight(wrongValue, rightForms, exact, rules.sameNumberWrong)) return `the wrong answer ${valueText(wrongValue)} is a right answer`;
    if (seen.some((s) => equivalent(s, wrongValue))) return `the wrong answer ${valueText(wrongValue)} is listed twice`;
    seen.push(wrongValue);
    if (!isText(w.cause) || !isText(w.description)) return "a wrong answer needs a cause and its description";
    if (w.step !== null && !stepIds.includes(w.step as string)) return `the wrong answer ${valueText(wrongValue)} names a step the question does not have`;
  }

  const easier = p.easierExample;
  if (!isObject(easier)) return "the package has no easier example";
  if (!isText(easier.text)) return "the easier example has no text";
  if (!isObject(easier.operation) || easier.operation.kind !== target.kind) return "the easier example is not the same operation";
  const easierWork = partProblem(easier.operation, easier.answer, easier.steps, "the easier example");
  if (easierWork) return easierWork;
  if (!smaller(size(easier.operation as Operation), size(target))) return "the easier example is not smaller than the question";
  return null;
}

/**
 * A wrong answer that is really right: the answer or an accepted form, or the answer's number in a form the rules do not
 * let stay wrong (a fraction that is not simplified may stay wrong; for "3/4 = ?/12", 3/4 is wrong).
 */
function isRight(wrong: AnswerValue, rightForms: AnswerValue[], exact: AnswerValue, rule: SameNumberWrongRule): boolean {
  if (rightForms.some((r) => sameValue(r, wrong))) return true;
  if (!sameNumber(wrong, exact)) return false;
  if (rule === "any") return false;
  if (rule === "unsimplified") return (wrong.type === "fraction" || wrong.type === "mixed") ? isSimplest(wrong) : true;
  return true;
}

/**
 * Checks a package, for example one read from the database: "checked" with the package, "failed" with the first reason,
 * or "unsupported" when code cannot compute its operation or read its steps.
 */
export function checkQuestionPackage(candidate: unknown): PackageCheck {
  const problem = packageProblem(candidate);
  if (!problem) return { ok: true, status: "checked", package: candidate as QuestionPackage };
  return { ok: false, status: problem.status, reason: problem.reason };
}
