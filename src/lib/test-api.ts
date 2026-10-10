// The child's test (#64). Shared by the test screens (client) and /api/account/assessments/* (server).
// The browser gets only TestStep: never an answer or the misconception coding of the choices.
import type { TestStep } from "@/lib/assessment";

export type TestError =
  | "off"
  | "signed_out"
  | "bad_json"
  | "invalid"
  | "not_found"
  /** The question bank cannot cover this grade yet (the sample bank covers grades 3-5). */
  | "not_ready"
  /** The answer was for another question, or the test is already complete. The current step comes back with it. */
  | "conflict"
  | "incomplete"
  | "store_failed";

export type StartResult = { ok: true; id: string; resumed: boolean } | { ok: false; error: TestError };
export type StepResult = { ok: true; step: TestStep } | { ok: false; error: TestError; step?: TestStep };
export type FinishResult = { ok: true } | { ok: false; error: TestError };

/** The longest typed answer the number pad allows. */
export const ANSWER_MAX = 12;
/** Time on one question is capped here, so a tab left open overnight does not skew the speed data. */
export const QUESTION_TIME_CAP_MS = 60 * 60_000;

export const testFail = (error: TestError, status: number, extra: object = {}) => Response.json({ ok: false, error, ...extra }, { status });
