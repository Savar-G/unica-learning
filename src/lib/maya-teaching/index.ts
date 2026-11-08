// Maya's session adapter (Wave A): the teaching package Maya works from, made at session time from the stored workbook
// package. Every path that starts a session on a workbook question calls `teachingPackage` first (the call start in
// maya-call.ts, workbook selection, the desk's held list). The stored package is never changed: not in storage, not in
// print and not in marking. A deriver may only add teaching data (the operation, its answer, worked steps, wrong answers
// and easier example); code computes and checks all of it (D-195). Maya's wider operand limits hold only for the
// packages made here (limits.ts). Pure TypeScript.
import { checkQuestionPackage, hasOperation, type QuestionPackage } from "@/lib/question-package";
import { heldReason, mayaPackageCheck, TEACHABLE_KINDS } from "@/lib/maya";
import { printedWorkbookQuestion } from "@/lib/workbook-maya-operation";
import { TEACHING_SOURCE } from "./limits";
import { deriveOneStep } from "./one-step";
import { deriveMultiStep } from "./multi-step";
import { deriveMissingNumber } from "./missing-number";

/**
 * Makes a teaching package from a printed workbook question, or null. It gets the printed package: no teaching data,
 * operation null, ref.source "workbook", and the default package check passed.
 */
export type Deriver = (printed: QuestionPackage) => QuestionPackage | null;

/** Each builder adds one line. The first deriver whose package passes every check below wins. */
const DERIVERS: readonly Deriver[] = [
  deriveMissingNumber, // A3: "a × ? = c", "? × a = c", "a − ? = c" (first: only its exact printed forms match)
  deriveOneStep, // A1: one add, subtract or multiply
  deriveMultiStep, // A1: multi-step stories, as evaluate (taught from A2)
];

/** The fields a deriver may add. Every other field must stay exactly as stored. */
const TEACHING_FIELDS: readonly string[] = ["operation", "answer", "steps", "wrongAnswers", "easierExample", "stepsVersion", "operationSource"];

/**
 * The package Maya teaches from: a stored workbook package with no operation gets checked teaching data from the first
 * deriver that makes it; anything else comes back unchanged. A package already marked as made here is never trusted:
 * its teaching data is dropped and made again from the printed question.
 */
export function teachingPackage(stored: unknown): unknown {
  const base = marked(stored) ? printedWorkbookQuestion(stored as QuestionPackage) : stored;
  const check = checkQuestionPackage(base);
  if (!check.ok || hasOperation(check.package) || check.package.ref.source !== "workbook") return base;
  const printed = printedWorkbookQuestion(check.package);
  for (const derive of DERIVERS) {
    const made = derive(structuredClone(printed));
    if (!made) continue;
    const teaching: QuestionPackage = { ...made, operationSource: TEACHING_SOURCE };
    if (samePrinted(teaching, printed) && hasOperation(teaching) && mayaPackageCheck(teaching).ok && exampleFits(teaching)) return teaching;
  }
  return base;
}

/**
 * Controller rule 1: the easier example is of the question's kind, and a question of a kind Maya teaches is teachable
 * with it (the session's own rule, session.ts teachableOf, which also checks the example). A kind she does not teach
 * yet (evaluate, until A2) stays held by the session.
 */
function exampleFits(p: QuestionPackage): boolean {
  if (!p.operation || !p.easierExample || p.easierExample.operation.kind !== p.operation.kind) return false;
  return !TEACHABLE_KINDS.includes(p.operation.kind) || heldReason(p) === null;
}

const marked = (raw: unknown) => typeof raw === "object" && raw !== null && (raw as { operationSource?: unknown }).operationSource === TEACHING_SOURCE;

/** The two packages print the same: every field but the teaching fields is equal. */
function samePrinted(made: QuestionPackage, printed: QuestionPackage): boolean {
  const strip = (p: QuestionPackage) => Object.fromEntries(Object.entries(p).filter(([k]) => !TEACHING_FIELDS.includes(k)));
  return sameData(strip(made), strip(printed));
}

function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter(k => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter(k => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every(k => Object.hasOwn(b, k) && sameData((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
