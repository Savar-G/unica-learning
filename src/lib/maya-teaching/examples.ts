// Easier examples of the question's own shape for the packages Maya's session adapter makes (controller rule 1:
// MODEL_EXAMPLE works an example of the same shape, and it must be teachable). The example keeps the operation and
// its written form, one place smaller at a time: 10000 − 3615 gives 1000 − 361, then 100 − 36, then 10 − 3 (a
// subtraction from a round number each time, with a regroup); 284 × 7 gives 28 × 7. An example whose answer's digits
// begin the question's answer gives it away (givesAway): then a digit is changed instead, so 18000 + 2000 takes
// 1700 + 200, not 1800 + 200, and "5 × 350 − 870" takes "4 × 35 − 87", not "5 × 35 − 87" (88 for 880).
//
// The first example that passes wins. It must pass the package check (valid, smaller, not the question's answer), the
// session's own rule (a teachable kind with no untaught step), and fit the strictest turn (25 spoken words, grades 1
// to 3 and a shorter call) in every step Maya works, with the existing example_step pacing: a step that regroups
// across zeros ("There were 0 tens, so regroup 1 hundred as 10 tens; ...", 33 words) is too long there, so 10000 − 3615
// takes 10 − 3. With none left the question is held. Pure TypeScript.
import { heldReason, speechWords, TEACHABLE_KINDS } from "@/lib/maya";
import { packageLines, type LineOffer } from "@/lib/maya/lines";
import type { AnswerValue, OperationLimits, Operation, OperationPackage, QuestionPackage } from "@/lib/question-package";
import { withTeachingOperation } from "@/lib/workbook-maya-operation";
import { TEACHING_SOURCE } from "./limits";

/** The fewest words a turn may hold (session.ts turnWordLimit: grades 1 to 3, and any call that asked for less talk). */
const STRICTEST_TURN = 25;

/** One place smaller: a number from 10 loses its last digit; a single digit stays. */
const smaller = (n: number) => (n >= 10 ? Math.floor(n / 10) : n);

/**
 * The same number with its last non-zero digit one less, or one more for a 1: 1700 → 1600, 300 → 200, 35241 → 35242.
 * Taking a place off a round number keeps its answer's digits (18000 + 2000 = 20000, 1800 + 200 = 2000); a changed
 * digit gives an answer of its own.
 */
function nudged(n: number): number {
  const s = String(n);
  const at = s.search(/[1-9]0*$/);
  if (at < 0) return n;
  const d = Number(s[at]);
  return Number(`${s.slice(0, at)}${d > 1 ? d - 1 : d + 1}${s.slice(at + 1)}`);
}

/** The candidate examples, best first. None for a kind this adapter does not make (it is then held). */
export function shapedExamples(operation: Operation): Operation[] {
  const seen = new Set<string>();
  const fresh = (op: Operation) => { const key = JSON.stringify(op.operands); return !seen.has(key) && seen.add(key); };
  if (operation.kind === "evaluate") {
    if (operation.values !== undefined) return [];
    const out: Operation[] = [];
    const scale = (e: string, f: (n: number) => number) => e.replace(/\d+/g, (d) => String(f(Number(d))));
    seen.add(JSON.stringify(operation.operands));
    for (let e = operation.operands[0], next = scale(e, smaller); next !== e; e = next, next = scale(e, smaller)) {
      // As it is, then its first number changed, then every number changed.
      for (const candidate of [next, next.replace(/\d+/, (d) => String(nudged(Number(d)))), scale(next, nudged)]) {
        const op: Operation = { kind: "evaluate", operands: [candidate] };
        if (fresh(op)) out.push(op);
      }
    }
    return out;
  }
  if (operation.kind !== "add" && operation.kind !== "subtract" && operation.kind !== "multiply") return [];
  const [a, b] = operation.operands;
  seen.add(JSON.stringify([a, b]));
  const pairs: [number, number][] = [];
  for (let [x, y] = [smaller(a), smaller(b)]; ; [x, y] = [smaller(x), smaller(y)]) {
    pairs.push([x, y], [nudged(x), y], [x, nudged(y)], [nudged(x), nudged(y)]);
    if (x < 10 && y < 10) break;
  }
  // Two single digits ("5 × 4", "6 + 3"): one of them one less, the same kind of fact.
  if (a < 10 && b < 10) pairs.push([a - 1, b], [a, b - 1]);
  return pairs.filter(([x, y]) => x >= 1 && y >= 1).map(([x, y]) => ({ kind: operation.kind, operands: [x, y] }) as Operation).filter(fresh);
}

/**
 * The example gives the question's answer away: its answer's digits begin the question's answer (1800 + 200 = 2000 for
 * 18000 + 2000 = 20000, 35241 + 4127 = 39368 for 352410 + 41270 = 393680, 5 × 35 − 87 = 88 for 5 × 350 − 870 = 880).
 * The package check refuses only an equal answer.
 */
export function givesAway(question: AnswerValue, example: AnswerValue): boolean {
  if (question.type !== "number" || example.type !== "number") return false;
  return String(Math.abs(question.value)).startsWith(String(Math.abs(example.value)));
}

const fewestWords = (offers: LineOffer[]) => Math.min(...offers.flatMap((o) => o.texts).map(speechWords));

/** The introduction and every step of the example each fit the strictest turn (the session says them apart when needed). */
function exampleSpeakable(p: OperationPackage): boolean {
  const lines = packageLines(p);
  return fewestWords(lines.exampleIntro()) <= STRICTEST_TURN && p.easierExample.steps.every((s) => fewestWords(lines.exampleStep(s.id)) <= STRICTEST_TURN);
}

/**
 * The package with teaching data for `operation` and the first easier example of its shape that Maya can teach, or
 * null. A kind Maya does not teach yet (evaluate, until A2) takes the first valid example; the session holds it.
 */
export function withShapedExample(printed: QuestionPackage, operation: Operation, answer: AnswerValue, limits: OperationLimits): QuestionPackage | null {
  for (const example of shapedExamples(operation)) {
    const made = withTeachingOperation(printed, operation, answer, { source: TEACHING_SOURCE, limits, examples: [example] });
    if (!made?.operation || !made.easierExample || givesAway(answer, made.easierExample.answer)) continue;
    if (!TEACHABLE_KINDS.includes(operation.kind)) return made;
    if (heldReason(made) === null && exampleSpeakable(made as OperationPackage)) return made;
  }
  return null;
}
