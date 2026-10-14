import "server-only";
import { randomInt } from "node:crypto";
import type { Attempt } from "@/lib/assessment";
import type { AssessmentStatus } from "@/lib/test-api";

// Shared pieces of the child's test (#64) on the server. A test attempt's steps (start, the next step, the answer,
// the facts section and finish) go through the test attempt module (src/lib/test-attempt.ts, spec #144); its Supabase
// store (src/lib/test-attempt-server.ts) and the reminder store (src/lib/reminder-store.ts) read assessment rows into
// the core's terms with toAttempt. Every time comes from the server's clock, as epoch ms (#72).

/** A new seed for each test: siblings, and a retake, get different questions. Postgres integer, 0 to 2^31 - 1. */
export const newSeed = () => randomInt(0, 2 ** 31 - 1);

/** The assessment columns the resume and retake rules read. */
export interface AttemptRow {
  id: string;
  status: AssessmentStatus;
  started_at: string;
  last_answer_at: string | null;
  resume_until: string;
  completed_at: string | null;
}

const toMs = (time: string) => Date.parse(time);

/** A stored row in the core's terms. `answeredAll` only when the answers were loaded. */
export function toAttempt(row: AttemptRow, answeredAll?: boolean): Attempt {
  return {
    id: row.id,
    status: row.status,
    startedAt: toMs(row.started_at),
    lastAnswerAt: row.last_answer_at ? toMs(row.last_answer_at) : null,
    resumeUntil: toMs(row.resume_until),
    completedAt: row.completed_at ? toMs(row.completed_at) : null,
    ...(answeredAll === undefined ? {} : { answeredAll }),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
