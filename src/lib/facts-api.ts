// The timed facts section (#70). Shared by the facts screen (client) and /api/account/assessments/[id]/facts (server).
import type { FactsStep } from "@/lib/assessment";
import type { TestError } from "@/lib/test-api";

export type FactsStepResult = { ok: true; step: FactsStep } | { ok: false; error: TestError; step?: FactsStep };

/** The longest typed fact answer: facts go up to 100. */
export const FACT_ANSWER_MAX = 3;
/** A fact answer: empty (skipped) or up to three digits. */
export const isFactResponse = (v: unknown): v is string => typeof v === "string" && /^\d{0,3}$/.test(v);
