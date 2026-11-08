// Easier examples of the question's own shape for the packages Maya's session adapter makes (controller rule 1:
// MODEL_EXAMPLE works an example of the same shape, and it must be teachable). The example keeps the operation and
// its written form, one place smaller at a time: 10000 − 3615 gives 1000 − 361, then 100 − 36, then 10 − 3 (a
// subtraction from a round number each time, with a regroup); 284 × 7 gives 28 × 7; "5 × 350 − 870" gives "5 × 35 − 87".
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

/** The candidate examples, best first. None for a kind this adapter does not make (it is then held). */
export function shapedExamples(operation: Operation): Operation[] {
  if (operation.kind === "evaluate") {
    if (operation.values !== undefined) return [];
    const out: Operation[] = [];
    for (let e = operation.operands[0], next = e.replace(/\d+/g, (d) => String(smaller(Number(d)))); next !== e; e = next, next = e.replace(/\d+/g, (d) => String(smaller(Number(d))))) {
      out.push({ kind: "evaluate", operands: [next] });
    }
    return out;
  }
  if (operation.kind !== "add" && operation.kind !== "subtract" && operation.kind !== "multiply") return [];
  const [a, b] = operation.operands;
  const pairs: [number, number][] = [];
  for (let [x, y] = [smaller(a), smaller(b)]; ; [x, y] = [smaller(x), smaller(y)]) {
    pairs.push([x, y]);
    if (x < 10 && y < 10) break;
  }
  // Two single digits ("5 × 4", "6 + 3"): one of them one less, the same kind of fact.
  if (a < 10 && b < 10) pairs.push([a - 1, b], [a, b - 1]);
  const seen = new Set<string>();
  return pairs.filter(([x, y]) => x >= 1 && y >= 1 && (x !== a || y !== b) && !seen.has(`${x},${y}`) && seen.add(`${x},${y}`))
    .map(([x, y]) => ({ kind: operation.kind, operands: [x, y] }) as Operation);
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
    if (!made?.operation || !made.easierExample) continue;
    if (!TEACHABLE_KINDS.includes(operation.kind)) return made;
    if (heldReason(made) === null && exampleSpeakable(made as OperationPackage)) return made;
  }
  return null;
}
