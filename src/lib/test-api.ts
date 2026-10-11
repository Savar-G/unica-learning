// The child's test (#64). Shared by the test screens (client) and /api/account/assessments/* (server).
// The browser gets only TestStep: never an answer or the misconception coding of the choices.
import type { TestStep } from "@/lib/assessment";

/** An assessment row's status. "expired" comes with stop and resume (#72). */
export type AssessmentStatus = "in_progress" | "completed" | "expired";

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
  /** The test ran out of time: 24 hours passed since the child last worked on it (#72). "Start again" draws a new one. */
  | "expired"
  /** A new test opens 30 days after the last completed one (#72). The start request sends `opensAt` with it. */
  | "retake_closed"
  /** A show-your-work question was answered with an empty whiteboard (#67). */
  | "work_required"
  /** The drawing or the typed working is over its size limit (#67). A `message` says which. */
  | "work_too_big"
  | "store_failed";

export type StartResult = { ok: true; id: string; resumed: boolean } | { ok: false; error: TestError };
export type StepResult = { ok: true; step: TestStep } | { ok: false; error: TestError; step?: TestStep };
export type FinishResult = { ok: true } | { ok: false; error: TestError };

/** The longest typed answer the number pad allows. */
export const ANSWER_MAX = 12;
/** Time on one question is capped here, so a tab left open overnight does not skew the speed data. */
export const QUESTION_TIME_CAP_MS = 60 * 60_000;

/** The largest whiteboard drawing the server stores, as PNG bytes (#67). The browser makes the image smaller to fit. */
export const WORK_IMAGE_MAX_BYTES = 1_000_000;
/** The most typed working the server stores for one question, in characters (#67). */
export const WORK_TEXT_MAX = 1000;
/** An answer request bigger than this is refused before it is read: room for the largest drawing in base64, and the text. */
export const ANSWER_BODY_MAX = 1_500_000;

export const testFail = (error: TestError, status: number, extra: object = {}) => Response.json({ ok: false, error, ...extra }, { status });
