import "server-only";
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  attemptState,
  recordAnswer,
  restoreSession,
  testStep,
  type Attempt,
  type Session,
  type StoredTest,
  type Submission,
} from "@/lib/assessment";
import { testFail, type AssessmentStatus } from "@/lib/test-api";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";

// The server side of the child's test (#64). The drawn test and the answers live in the database, read and written
// with the secret key; every request rebuilds the session from them and marks with the assessment core.
// Stop, resume and retake (#72): every time comes from this server's clock (Date.now() in the routes) and is checked
// with the core's rules. Writes that depend on the time are guarded in the update itself, so two requests at once
// cannot both win: see expireTest and openAnswerWindow. Only a stored answer moves a test's deadline.
// Start, the next step and the start screens go through the test attempt module (src/lib/test-attempt.ts, #146); the
// answer and finish routes still use loadTest and openAnswerWindow here until they move to it too (#147, #150).

/** A new seed for each test: siblings, and a retake, get different questions. Postgres integer, 0 to 2^31 - 1. */
export const newSeed = () => randomInt(0, 2 ** 31 - 1);

/** The assessment columns the resume and retake rules read. */
export const ATTEMPT_COLUMNS = "id, status, started_at, last_answer_at, resume_until, completed_at";

export interface AttemptRow {
  id: string;
  status: AssessmentStatus;
  started_at: string;
  last_answer_at: string | null;
  resume_until: string;
  completed_at: string | null;
}

export interface AssessmentRow extends AttemptRow {
  test: StoredTest;
}

const toMs = (time: string) => Date.parse(time);
const iso = (ms: number) => new Date(ms).toISOString();

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

/** Marks a test expired, only while it is in progress and its window ended before `now`. A late answer cannot undo it. */
export async function expireTest(admin: SupabaseClient, id: string, now: number): Promise<void> {
  const { error } = await admin.from("assessments").update({ status: "expired" })
    .eq("id", id).eq("status", "in_progress").lt("resume_until", iso(now));
  if (error) throw new Error(`expire failed: ${error.message}`);
}

/** The answer being stored: after the insert, call stored(), or failed() when the insert failed for any other reason than a duplicate. */
export interface AnswerWindow {
  /** Records the answer time (last_answer_at). It never moves back: two tabs can store answers in the same moment. */
  stored(): Promise<void>;
  /** Puts the deadline back where it was, unless something moved it since. */
  failed(): Promise<void>;
}

/**
 * Before an answer is stored at `now`: moves the deadline to 24 hours from now (the core's recordAnswer), only while
 * the test is in progress and its deadline has not passed. The guard is in the update itself, so an expire request
 * and this cannot both win. Null when the test is no longer open: the caller must not store the answer.
 */
export async function openAnswerWindow(admin: SupabaseClient, attempt: Attempt, now: number): Promise<AnswerWindow | null> {
  const until = iso(recordAnswer(attempt, now).resumeUntil);
  const { data, error } = await admin.from("assessments").update({ resume_until: until })
    .eq("id", attempt.id).eq("status", "in_progress").gte("resume_until", iso(now)).select("id");
  if (error) throw new Error(`deadline update failed: ${error.message}`);
  if ((data ?? []).length !== 1) return null;
  return {
    async stored() {
      const at = iso(now);
      const { error: e } = await admin.from("assessments").update({ last_answer_at: at })
        .eq("id", attempt.id).or(`last_answer_at.is.null,last_answer_at.lt."${at}"`);
      if (e) console.error("[test] answer time save failed", e.message);
    },
    async failed() {
      const { error: e } = await admin.from("assessments").update({ resume_until: iso(attempt.resumeUntil) })
        .eq("id", attempt.id).eq("resume_until", until);
      if (e) console.error("[test] deadline undo failed", e.message);
    },
  };
}

/** The signed-in parent and an admin client, or the error response to send. */
export async function testAccess(): Promise<{ parent: string; admin: SupabaseClient } | { error: Response }> {
  const parent = await parentId(await sessionClient());
  if (!parent) return { error: testFail("signed_out", 401) };
  const admin = adminClient();
  if (!admin) return { error: testFail("store_failed", 503) };
  return { parent, admin };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/**
 * The parent's assessment and the session rebuilt from its answers, or the error response to send.
 * The parent comes from the session cookie, so a parent can never reach another family's test.
 * A test that ran out of time at `now` answers "expired" (410), and is marked expired if it was still in progress.
 */
export async function loadTest(
  admin: SupabaseClient,
  parent: string,
  id: string,
  now = Date.now(),
): Promise<{ row: AssessmentRow; session: Session; attempt: Attempt } | { error: Response }> {
  const read = await readTest(admin, parent, id);
  if ("error" in read) return read;
  const { row, session } = read;
  // A test with every answer in never expires: it only waits to be scored.
  const attempt = toAttempt(row, testStep(session).status === "complete");
  if (attemptState(attempt, now) === "expired") {
    if (row.status === "in_progress") {
      try {
        await expireTest(admin, row.id, now);
      } catch (e) {
        console.error("[test]", e instanceof Error ? e.message : e);
      }
    }
    return { error: testFail("expired", 410) };
  }
  return { row, session, attempt };
}

/** The assessment and the session rebuilt from its answers, with no time check. */
async function readTest(admin: SupabaseClient, parent: string, id: string): Promise<{ row: AssessmentRow; session: Session } | { error: Response }> {
  if (!isUuid(id)) return { error: testFail("not_found", 404) };
  const { data: row, error } = await admin.from("assessments").select(`${ATTEMPT_COLUMNS}, test`).eq("id", id).eq("parent_id", parent).maybeSingle<AssessmentRow>();
  if (error) {
    console.error("[test] load failed", error.message);
    return { error: testFail("store_failed", 502) };
  }
  if (!row) return { error: testFail("not_found", 404) };
  const { data: answers, error: answersError } = await admin.from("answers")
    .select("question_id, response, time_ms").eq("assessment_id", id).order("position").returns<{ question_id: string; response: string; time_ms: number }[]>();
  if (answersError) {
    console.error("[test] answers load failed", answersError.message);
    return { error: testFail("store_failed", 502) };
  }
  const submissions: Submission[] = (answers ?? []).map((a) => ({ questionId: a.question_id, response: a.response, timeMs: a.time_ms }));
  try {
    return { row, session: restoreSession(row.test, submissions) };
  } catch (e) {
    console.error("[test] restore failed", id, e instanceof Error ? e.message : e);
    return { error: testFail("store_failed", 500) };
  }
}
