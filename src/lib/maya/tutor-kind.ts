// The tutor core's interface for a family of questions (D-345, Phase 2). FROZEN on 2026-11-15: builders of a family add
// one file under src/lib/maya/tutor-kinds/ and one line in its index; they never change this file, the tutor core
// (tutor.ts, tutor-math.ts, tutor-prompt.ts, proposeTutor in session.ts) or the stream (maya-text.ts).
//
// A kind is code only: the computed facts of a question, what a child's number means, the true-math forms of its
// claims, the numbers and operations its talk may use, and its board drawings. It holds no teaching logic and no model
// words: the model is the tutor (src/lib/maya/tutor-prompt.ts).
import type { OperationPackage } from "@/lib/question-package";

/** One step of the question as the brief shows it, in the order a child works it. `id` is the package's work step id. */
export interface TutorStepFact {
  id: string;
  /** A place or a part ("ones", "tens", "the thousands digit"), when the step has one. */
  place?: string;
  /** The step's work and its reason, in plain words with true math ("12 − 8 = 4; write 4 in the ones"). */
  work: string;
  /** The step's result as the child says it. */
  result: number | string;
}

/** A board command, as the board core reads it (src/lib/board). */
export type TutorCommand = Record<string, unknown>;

/** A drawing the model may ask for, by id, and what it shows (for the brief). */
export interface TutorDrawing {
  id: string;
  does: string;
}

export interface TutorKind {
  /** A short stable id ("column", "multiply", "place-value"): it goes in the trace. */
  readonly id: string;
  /** Whether this kind teaches the package. The first kind in the registry that fits wins. */
  fits(pkg: OperationPackage): boolean;
  /** Every step with its computed value and reason, in work order. */
  steps(pkg: OperationPackage): TutorStepFact[];
  /** What a number the child said means: right for a step or the answer, a named likely mistake, or not a value. */
  numberMeaning(pkg: OperationPackage, n: number): string;
  /** Values of the work that are never a wrong answer when the child says them: step results, digits, trade tops. */
  workValues(pkg: OperationPackage): number[];
  /**
   * The numbers and operations (expressionKey) a streamed sentence may hold: the question's, its steps', its trades'.
   * A sentence with any other number or operation waits for the whole message and its scope reading.
   */
  streamScope(pkg: OperationPackage): { numbers: number[]; expressions: string[] };
  /** The question of the next open step, for code's honest line ("What do you get for 12 minus 8?"), or null when done. */
  stepQuestion(pkg: OperationPackage, done: readonly string[]): string | null;
  /** The drawings the model may ask for on this question. */
  drawings(pkg: OperationPackage): readonly TutorDrawing[];
  /**
   * The commands for the model's drawing requests, in order, and the keys of what they drew. `drawn` is what the call
   * drew already: never draw it twice. Every command comes from the checked steps; never from the model's text, except a
   * "note" rebuilt from a true equation's values.
   */
  draw(pkg: OperationPackage, requests: readonly { offer: string; place?: string }[], drawn: readonly string[], noteId: (i: number) => string): { commands: TutorCommand[]; keys: string[] };
  /**
   * The kind's own true-math checks of one sentence of Maya's, beyond the core's equations, place quantities and
   * trades (tutor-math.ts): for example "the 9 is in the thousands place". Reasons for each false claim; empty when
   * every claim the kind reads is true. Fail closed: a claim form the kind cannot read is not proven true.
   */
  claimProblems(pkg: OperationPackage, sentence: string): string[];
  /** The direction of a trade in an "is now" / "becomes" claim, for kinds with column trades. */
  op?(pkg: OperationPackage): "add" | "subtract" | undefined;
  /** Short facts about how this kind's idea is worked, for the brief (never teaching rules). */
  notes?(pkg: OperationPackage): string[];
}

/** An operation as a key, its operands in order ("12-8"); an addition's or a product's operands in any order. */
export function expressionKey(operands: readonly number[], ops: readonly string[]): string {
  if (ops.length > 0 && ops.every((o) => o === "+")) return `+${[...operands].sort((x, y) => x - y).join(",")}`;
  if (ops.length > 0 && ops.every((o) => o === "*")) return `*${[...operands].sort((x, y) => x - y).join(",")}`;
  return operands.map((n, i) => (i === 0 ? String(n) : `${ops[i - 1]}${n}`)).join("");
}

/**
 * A "note" drawing's text, rebuilt from a whole true equation of numbers ("12 - 8 = 4" gives "12 − 8 = 4"), or null for
 * anything else: no other text from the model reaches the board.
 */
export function noteFromEquation(place: string): string | null {
  const m = /^\s*(\d{1,5}(?:\s*[+\-−–×x*÷/]\s*\d{1,5}){1,3})\s*=\s*(\d{1,6})\s*$/i.exec(place);
  if (!m) return null;
  const nums = m[1].split(/[+\-−–×x*÷/]/i).map((x) => Number(x.trim()));
  const signs = [...m[1].matchAll(/[+\-−–×x*÷/]/gi)].map((x) => (x[0] === "+" ? "+" : /[×x*]/i.test(x[0]) ? "×" : /[÷/]/.test(x[0]) ? "÷" : "−"));
  // Left to right, products first: a × b ± c.
  let total = 0;
  let term = nums[0];
  let sign = 1;
  for (let k = 0; k < signs.length; k++) {
    if (signs[k] === "×") { term *= nums[k + 1]; continue; }
    if (signs[k] === "÷") { if (nums[k + 1] === 0 || term % nums[k + 1] !== 0) return null; term /= nums[k + 1]; continue; }
    total += sign * term;
    sign = signs[k] === "+" ? 1 : -1;
    term = nums[k + 1];
  }
  total += sign * term;
  if (total !== Number(m[2])) return null;
  return `${nums.map((n, k) => (k === 0 ? String(n) : `${signs[k - 1]} ${n}`)).join(" ")} = ${Number(m[2])}`;
}
