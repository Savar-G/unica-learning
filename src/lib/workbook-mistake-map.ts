import type { MISCONCEPTIONS } from "@/lib/assessment/misconceptions";
import type { SamMistake } from "@/lib/workbook-book";

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
} as const satisfies Partial<Record<keyof typeof MISCONCEPTIONS, SamMistake>>;

/** An explicitly mapped Sam mistake, or null. Unknown and unsupported ids have no fallback. */
export function samMistakeFor(misconception: string): SamMistake | null {
  return Object.hasOwn(MISTAKE_MAP, misconception)
    ? MISTAKE_MAP[misconception as keyof typeof MISTAKE_MAP]
    : null;
}
