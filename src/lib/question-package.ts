// The question package (#298, spec #295): the one shape every product reads a question in. Maya reads it to help on
// the child's exact question, the answer checker and marking read the answer and the steps, and the workbook store
// keeps it. A package says where the question comes from (a workbook page or an assessment test), the typed answer and
// the other forms that count as right, a computable operation with its worked steps, the skill (a BC standard and its
// smaller skills), the level (U1-U30, kept as 1-30), the difficulty, the expected wrong answers with their causes, and
// one easier example of the same operation with its answer and steps.
//
// The worked steps are data that code builds from the operation (workedSteps), so a package is trusted only when its
// answer and steps are what the operation gives (checkQuestionPackage). There is no parser of question text: the
// operation is stored beside the text. Every Operation kind has a computation here; a later ticket adds a kind (for
// example decimals or fractions, #306) together with its steps and its computation, never a kind code cannot check.
// Pure TypeScript: no Next.js, React, network, database or clock.
import { BC_SKILL_MAP } from "@/lib/assessment";

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

/** A typed answer value. "number" is a whole number or a decimal; a fraction keeps its written parts. */
export type AnswerValue =
  | { type: "number"; value: number }
  | { type: "fraction"; numerator: number; denominator: number }
  | { type: "expression"; value: string }
  | { type: "choice"; value: string }
  | { type: "text"; value: string };

/** The answer: its value, other written forms that also count as right (for example 2/4 for 1/2), and its unit. */
export interface PackageAnswer {
  value: AnswerValue;
  accepted: AnswerValue[];
  unit: string | null;
}

/** A computable operation on whole numbers from 0 to 9999. Subtraction never goes below zero. */
export type Operation =
  | { kind: "add"; operands: [number, number] }
  | { kind: "subtract"; operands: [number, number] };

/** A column of the written method, from the right. */
export type Place = "ones" | "tens" | "hundreds" | "thousands" | "ten thousands";

/**
 * One worked step of the column method, with the numbers a board shows. `id` is the column's place ("ones"), or
 * "result"; a wrong answer names the step where its mistake happens by this id.
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
      text: string;
    }
  | {
      id: string;
      kind: "subtract-column";
      place: Place;
      /** The top digit as written. */
      top: number;
      /** The bottom digit, or null when the bottom number has no digit in this column. */
      bottom: number | null;
      /** This column gave 1 to the column to its right, so its top is 1 less. */
      lent: boolean;
      /** This column took 1 from the column to its left, so its top is 10 more. */
      regrouped: boolean;
      write: number;
      text: string;
    }
  | { id: "result"; kind: "result"; value: AnswerValue; text: string };

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
  ref: QuestionRef;
  /** The assessment template the question came from, or null. */
  templateId: string | null;
  /** The question as the child reads it. */
  text: string;
  answer: PackageAnswer;
  operation: Operation;
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

export type PackageCheck = { ok: true; package: QuestionPackage } | { ok: false; reason: string };

const PLACES: readonly Place[] = ["ones", "tens", "hundreds", "thousands", "ten thousands"];
/** A place's unit name, for "carry 1 ten". */
const UNIT: Record<Place, string> = { ones: "one", tens: "ten", hundreds: "hundred", thousands: "thousand", "ten thousands": "ten thousand" };
const MAX_OPERAND = 9999;
const MINUS = "−";

const digitAt = (n: number, i: number) => Math.floor(n / 10 ** i) % 10;
const digitCount = (n: number) => String(n).length;

/** The value an operation gives. The operation must be valid (operationProblem). */
export function operationResult(operation: Operation): AnswerValue {
  const [a, b] = operation.operands;
  switch (operation.kind) {
    case "add":
      return { type: "number", value: a + b };
    case "subtract":
      return { type: "number", value: a - b };
  }
}

/** The operation as the child reads it, without the answer: "48 + 37". */
export function operationText(operation: Operation): string {
  const [a, b] = operation.operands;
  switch (operation.kind) {
    case "add":
      return `${a} + ${b}`;
    case "subtract":
      return `${a} ${MINUS} ${b}`;
  }
}

/** The worked steps of the column method for an operation, right to left, then the result. The operation must be valid. */
export function workedSteps(operation: Operation): WorkedStep[] {
  const columns = operation.kind === "add" ? addColumns(operation.operands) : subtractColumns(operation.operands);
  const value = operationResult(operation);
  return [...columns, { id: "result", kind: "result", value, text: `${operationText(operation)} = ${valueText(value)}` }];
}

function addColumns([a, b]: [number, number]): WorkedStep[] {
  const steps: WorkedStep[] = [];
  let carry = 0;
  for (let i = 0; i < Math.max(digitCount(a), digitCount(b)) || carry > 0; i++) {
    const place = PLACES[i];
    const digits = [a, b].filter((n) => i < digitCount(n)).map((n) => digitAt(n, i));
    const total = digits.reduce((s, d) => s + d, 0) + carry;
    const write = total % 10;
    const carryOut = Math.floor(total / 10);
    const terms = [...digits, ...(carry > 0 ? [carry] : [])];
    const carried = carryOut > 0 ? ` and carry ${carryOut} ${UNIT[PLACES[i + 1]]}` : "";
    const text = terms.length > 1 ? `Add the ${place}: ${terms.join(" + ")} = ${total}. Write ${write}${carried}.` : `Bring down the ${place}: write ${write}.`;
    steps.push({ id: place, kind: "add-column", place, digits, carryIn: carry, total, write, carryOut, text });
    carry = carryOut;
  }
  return steps;
}

function subtractColumns([a, b]: [number, number]): WorkedStep[] {
  const steps: WorkedStep[] = [];
  const count = digitCount(a);
  const result = a - b;
  let lent = false;
  for (let i = 0; i < count; i++) {
    const place = PLACES[i];
    const top = digitAt(a, i);
    const bottom = i < digitCount(b) ? digitAt(b, i) : null;
    const have: number = top - (lent ? 1 : 0);
    const regrouped: boolean = have < (bottom ?? 0);
    const from = have + (regrouped ? 10 : 0);
    const write = from - (bottom ?? 0);
    const next = UNIT[PLACES[i + 1]];
    // A column of 0 that must give 1 to its right first takes 1 from its left: say it in that order.
    const regroup = have < 0
      ? `There were 0 ${place}, so regroup 1 ${next} as 10 ${place}; after the 1 ${UNIT[place]} given to the ${PLACES[i - 1]}, ${from} ${place} are left.`
      : [lent ? `The ${place} are now ${have}.` : "", regrouped ? `Regroup 1 ${next} as 10 ${place}, so ${have} ${place} become ${from}.` : ""].filter(Boolean).join(" ");
    // The left columns of the result that are 0 are not written: 105 - 98 is 7, not 007.
    const leading = i > 0 && Math.floor(result / 10 ** i) === 0;
    const written = leading ? "Write nothing: a number does not start with 0." : `Write ${write}.`;
    const work = bottom === null ? written : `Subtract the ${place}: ${from} ${MINUS} ${bottom} = ${write}. ${written}`;
    steps.push({ id: place, kind: "subtract-column", place, top, bottom, lent, regrouped, write, text: [regroup, work].filter(Boolean).join(" ") });
    lent = regrouped;
  }
  return steps;
}

function valueText(value: AnswerValue): string {
  switch (value.type) {
    case "number":
      return String(value.value);
    case "fraction":
      return `${value.numerator}/${value.denominator}`;
    default:
      return value.value;
  }
}

// ---------- Validation ----------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isWhole = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Two answer values are the same written value. Equivalent forms (2/4 and 1/2) are not the same here. */
export function sameValue(a: AnswerValue, b: AnswerValue): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "fraction" && b.type === "fraction") return a.numerator === b.numerator && a.denominator === b.denominator;
  return (a as { value: unknown }).value === (b as { value: unknown }).value;
}

/** Same values, deeply: for the stored steps against the computed ones. */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

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

function valueProblem(value: unknown, what: string): string | null {
  if (!isObject(value)) return `${what} is missing`;
  switch (value.type) {
    case "number":
      return typeof value.value === "number" && Number.isFinite(value.value) ? null : `${what} is not a finite number`;
    case "fraction":
      return Number.isInteger(value.numerator) && isWhole(value.denominator, 1) ? null : `${what} is not a fraction with a whole numerator and a denominator from 1`;
    case "expression":
    case "choice":
    case "text":
      return isText(value.value) ? null : `${what} has no text`;
    default:
      return `${what} has an unknown type`;
  }
}

/** What is wrong with an operation, or null. */
export function operationProblem(operation: unknown): string | null {
  if (!isObject(operation)) return "the operation is missing";
  if (operation.kind !== "add" && operation.kind !== "subtract") return "the operation's kind is not one code can compute";
  const operands = operation.operands;
  if (!Array.isArray(operands) || operands.length !== 2 || !operands.every((n) => isWhole(n, 0, MAX_OPERAND))) {
    return `the operation needs two whole numbers from 0 to ${MAX_OPERAND}`;
  }
  if (operation.kind === "subtract" && operands[0] < operands[1]) return "the subtraction goes below zero";
  return null;
}

/** The answer and steps a part holds must be what its operation gives. */
function workProblem(operation: Operation, answer: AnswerValue, steps: unknown, what: string): string | null {
  if (!sameValue(answer, operationResult(operation))) return `${what}'s answer is not what its operation gives`;
  if (!same(steps, workedSteps(operation))) return `${what}'s worked steps are not the steps of its operation`;
  return null;
}

/** Total digits in the operands: an easier example has fewer. */
const size = (operation: Operation) => operation.operands.reduce((s, n) => s + digitCount(n), 0);

function packageProblem(p: unknown): string | null {
  if (!isObject(p)) return "the package is not an object";
  const ref = refProblem(p.ref);
  if (ref) return ref;
  if (p.templateId !== null && !isText(p.templateId)) return "the template id is not text or null";
  if (!isText(p.text)) return "the question has no text";

  const answer = p.answer;
  if (!isObject(answer)) return "the answer is missing";
  const value = valueProblem(answer.value, "the answer");
  if (value) return value;
  if (!Array.isArray(answer.accepted)) return "the accepted forms are not a list";
  for (const form of answer.accepted) {
    const problem = valueProblem(form, "an accepted form");
    if (problem) return problem;
  }
  if (answer.unit !== null && !isText(answer.unit)) return "the unit is not text or null";

  const operation = operationProblem(p.operation);
  if (operation) return operation;
  const work = workProblem(p.operation as Operation, answer.value as AnswerValue, p.steps, "the question");
  if (work) return work;
  const right = [answer.value, ...answer.accepted] as AnswerValue[];

  if (!isObject(p.skill) || !isText(p.skill.standard) || !Array.isArray(p.skill.skills)) return "the skill needs a standard and a list of skills";
  const code = p.skill.standard;
  const standard = BC_SKILL_MAP.standards.find((s) => s.code === code);
  if (!standard) return `the standard ${p.skill.standard} is not in the BC skill map`;
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
    if (right.some((r) => sameValue(r, wrongValue))) return `the wrong answer ${valueText(wrongValue)} is a right answer`;
    if (seen.some((s) => sameValue(s, wrongValue))) return `the wrong answer ${valueText(wrongValue)} is listed twice`;
    seen.push(wrongValue);
    if (!isText(w.cause) || !isText(w.description)) return "a wrong answer needs a cause and its description";
    if (w.step !== null && !stepIds.includes(w.step as string)) return `the wrong answer ${valueText(wrongValue)} names a step the question does not have`;
  }

  const easier = p.easierExample;
  if (!isObject(easier)) return "the package has no easier example";
  if (!isText(easier.text)) return "the easier example has no text";
  const easierOperation = operationProblem(easier.operation);
  if (easierOperation) return `the easier example: ${easierOperation}`;
  const easierValue = valueProblem(easier.answer, "the easier example's answer");
  if (easierValue) return easierValue;
  const easierWork = workProblem(easier.operation as Operation, easier.answer as AnswerValue, easier.steps, "the easier example");
  if (easierWork) return easierWork;
  const target = p.operation as Operation;
  const example = easier.operation as Operation;
  if (example.kind !== target.kind) return "the easier example is not the same operation";
  if (size(example) >= size(target)) return "the easier example is not smaller than the question";
  return null;
}

/** Checks a package, for example one read from the database: the package, or the first reason it is refused. */
export function checkQuestionPackage(candidate: unknown): PackageCheck {
  const reason = packageProblem(candidate);
  return reason ? { ok: false, reason } : { ok: true, package: candidate as QuestionPackage };
}
