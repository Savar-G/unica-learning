// Maya's wider operand limits (Wave A). They hold only for a package Maya's session adapter made from a stored workbook
// package (index.ts), marked with operationSource "maya-teaching". The generator and every default check keep today's
// limits: nothing here is used unless a caller passes it. Pure TypeScript.
import type { OperationLimits } from "@/lib/question-package";

/** The marker the session adapter puts on a package it made. A stored package never carries it (index.ts re-derives one that does). */
export const TEACHING_SOURCE = "maya-teaching";

/**
 * Whole-number +, − and × results (and their numbers) and ÷ dividends to 999,999: the six columns Maya's board and
 * spoken place names cover (ones to hundred thousands). Divisors to 999 are for the missing-number path (A3).
 */
export const MAYA_TEACHING_LIMITS: OperationLimits = Object.freeze({ wholeResult: 999_999, divisor: 999 });

/** Maya's limits for a package the adapter made; none (today's limits) for any other. */
export function teachingLimits(raw: unknown): OperationLimits | undefined {
  return typeof raw === "object" && raw !== null && (raw as { operationSource?: unknown }).operationSource === TEACHING_SOURCE ? MAYA_TEACHING_LIMITS : undefined;
}
