import type { MISCONCEPTIONS } from "@/lib/assessment/misconceptions";
import type { SamMistake } from "@/lib/workbook-book";
import type { Operation } from "@/lib/question-package";

// Only exact matches to mistakes Sam can demonstrate. A shared cause can occur in other
// operations too, so the caller must still check the planned sum with samWork.
const MISTAKE_MAP = {
  O3: "forgot-carry",
  "carry-dropped": "forgot-carry",
  O1: "smaller-from-larger",
  O2: "smaller-from-larger",
  "smaller-from-larger": "smaller-from-larger",
  "regroup-forget": "regroup-not-taken",
  "count-start": "wrong-start",
  operation: "wrong-operation",
  "operation-swap": "wrong-operation",
  "digit-reversal": "swapped-digits",
  "difference-as-sum": "wrong-operation",
  "fee-sign": "wrong-operation",
} as const satisfies Partial<Record<keyof typeof MISCONCEPTIONS, SamMistake>>;

/** An explicitly mapped Sam mistake, or null. Unknown and unsupported ids have no fallback. */
export function samMistakeFor(misconception: string, operation?: Operation | null): SamMistake | null {
  // These two causes mean adding where a difference or remaining money is asked for.
  // They do not describe swapping addition to subtraction, or a multiplication/division error.
  if (misconception === "difference-as-sum" || misconception === "fee-sign") {
    if (operation?.kind !== "subtract" || operation.operands.length !== 2) return null;
    const [a, b] = operation.operands;
    if (typeof a !== "number" || typeof b !== "number" || !Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(a + b) || a < b || b <= 0) return null;
  }
  return Object.hasOwn(MISTAKE_MAP, misconception)
    ? MISTAKE_MAP[misconception as keyof typeof MISTAKE_MAP]
    : null;
}
