// The child's test (#64). Shared by the test screens (client) and /api/account/assessments/* (server).
// The browser gets only TestStep: never an answer or the misconception coding of the choices.
import type { TestStep } from "@/lib/assessment";
import type { Refusal } from "@/lib/test-attempt";
import type { FactsRefusal } from "@/lib/test-attempt";
import type { BreakResume } from "@/lib/test-context";
import type { StrokeRecording } from "@/lib/strokes";

/** An assessment row's status. "expired" comes with stop and resume (#72). */
export type AssessmentStatus = "in_progress" | "completed" | "expired";

export type TestError =
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
  /** The drawing or the typed working is over its size limit (#67). A `message` says which. */
  | "work_too_big"
  | "store_failed";

export type StartResult = { ok: true; id: string; resumed: boolean } | { ok: false; error: TestError };
export type StepResult = { ok: true; step: TestStep; break?: BreakResume } | { ok: false; error: TestError; step?: TestStep };
export type FinishResult = { ok: true } | { ok: false; error: TestError };

/** The longest typed answer the number pad allows. */
export const ANSWER_MAX = 12;
/** Time on one question is capped here, so a tab left open overnight does not skew the speed data. The core holds it (#249). */
export { QUESTION_TIME_CAP_MS } from "@/lib/assessment";

/**
 * The whiteboard work sent with an answer (#67): the drawing as a base64 PNG, the typed working, and the strokes for
 * the admin replay (#186). Any may be left out.
 */
export interface WorkPayload {
  image?: string;
  text?: string;
  strokes?: StrokeRecording;
}

/** The largest whiteboard drawing the server stores, as PNG bytes (#67). The browser makes the image smaller to fit. */
export const WORK_IMAGE_MAX_BYTES = 1_000_000;
/** The most typed working the server stores for one question, in characters (#67). */
export const WORK_TEXT_MAX = 1000;
/** The largest stroke recording the server stores for one answer, as JSON bytes (#186). The browser thins the strokes to fit. */
export const STROKES_MAX_BYTES = 500_000;
/**
 * An answer request bigger than this is refused before it is read: room for the largest drawing in base64 (1.33 MB),
 * the largest strokes (0.5 MB), the text and the answer events.
 */
export const ANSWER_BODY_MAX = 2_000_000;

export const testFail = (error: TestError, status: number, extra: object = {}) => Response.json({ ok: false, error, ...extra }, { status });

/** The response to a refusal of the test attempt module (#146): the status code and JSON each case had before it. */
export function refusalResponse(refusal: Refusal | FactsRefusal): Response {
  switch (refusal.error) {
    case "not_found":
      return testFail("not_found", 404);
    case "expired":
      return testFail("expired", 410);
    case "conflict":
      return testFail("conflict", 409, refusal.step ? { step: refusal.step } : {});
    case "invalid":
      return testFail("invalid", 400, refusal.message ? { message: refusal.message } : {});
    case "typing_off":
      return testFail("invalid", 400, { message: "Grades 1 and 2 draw their work. Typed working is not taken." });
    case "work_too_big":
      return testFail("work_too_big", 413, { message: refusal.message });
    case "incomplete":
      return testFail("incomplete", 409);
    case "not_ready":
      return testFail("not_ready", 409);
    case "busy":
      return testFail("store_failed", 503);
    case "retake_closed":
      return testFail("retake_closed", 409, { opensAt: new Date(refusal.opensAt).toISOString() });
    case "store_failed":
      return testFail("store_failed", refusal.unreadable ? 500 : 502);
  }
}
