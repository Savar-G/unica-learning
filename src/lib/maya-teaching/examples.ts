// Easier examples of the question's own shape for the packages Maya's session adapter makes (controller rule 1:
// MODEL_EXAMPLE works an example of the same shape, and it must be teachable). The example keeps the operation and
// its written form, one place smaller: 10000 − 3615 gives 1000 − 361 (regrouping across zeros again), 284 × 7 gives
// 28 × 7 (a carry again), "5 × 350 − 870" gives "5 × 35 − 87". The package check still decides: an example must be
// valid, smaller and not give the question's answer, or the next one is tried; with none left the question is held.
// Pure TypeScript.
import type { Operation } from "@/lib/question-package";

/** One place smaller: a number from 10 loses its last digit; a single digit stays. */
const smaller = (n: number) => (n >= 10 ? Math.floor(n / 10) : n);

/** The candidate examples, best first. None for a kind this adapter does not make (it is then held). */
export function shapedExamples(operation: Operation): Operation[] {
  if (operation.kind === "evaluate") {
    if (operation.values !== undefined) return [];
    const [expression] = operation.operands;
    const scaled = expression.replace(/\d+/g, (d) => String(smaller(Number(d))));
    return scaled !== expression ? [{ kind: "evaluate", operands: [scaled] }] : [];
  }
  if (operation.kind !== "add" && operation.kind !== "subtract" && operation.kind !== "multiply") return [];
  const [a, b] = operation.operands;
  const pairs: [number, number][] = [[smaller(a), smaller(b)]];
  // Two single digits ("5 × 4", "6 + 3"): one of them one less, the same kind of fact.
  if (a < 10 && b < 10) pairs.push([a - 1, b], [a, b - 1]);
  return pairs.filter(([x, y]) => x >= 1 && y >= 1 && (x !== a || y !== b)).map(([x, y]) => ({ kind: operation.kind, operands: [x, y] }) as Operation);
}
