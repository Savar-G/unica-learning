import "server-only";
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  attemptState,
  createSession,
  recordActivity,
  restoreSession,
  startState,
  storedTest,
  testStep,
  type Attempt,
  type Grade,
  type Session,
  type StartState,
  type StoredTest,
  type Submission,
} from "@/lib/assessment";
import type { Child } from "@/lib/account";
import { pilotOn } from "@/lib/pilot";
import { testFail, type AssessmentStatus } from "@/lib/test-api";
import type { StartStore, StoredAttempt } from "@/lib/test-start";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";

// The server side of the child's test (#64). The drawn test and the answers live in the database, read and written
// with the secret key; every request rebuilds the session from them and marks with the assessment core.
// Stop, resume and retake (#72): every time comes from this server's clock (Date.now() in the routes) and is checked
// with the core's rules. Writes that depend on the time are guarded in the update itself, so two requests at once
// cannot both win: see expireTest and holdTest.

/** A new seed for each test: siblings, and a retake, get different questions. Postgres integer, 0 to 2^31 - 1. */
export const newSeed = () => randomInt(0, 2 ** 31 - 1);

/** The assessment columns the resume and retake rules read. */
const ATTEMPT_COLUMNS = "id, status, started_at, last_answer_at, resume_until, completed_at";

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

const at = (iso: string) => Date.parse(iso);
const iso = (ms: number) => new Date(ms).toISOString();

/** A stored row in the core's terms. `answeredAll` only when the answers were loaded. */
export function toAttempt(row: AttemptRow, answeredAll?: boolean): Attempt {
  return {
    id: row.id,
    status: row.status,
    startedAt: at(row.started_at),
    lastAnswerAt: row.last_answer_at ? at(row.last_answer_at) : null,
    resumeUntil: at(row.resume_until),
    completedAt: row.completed_at ? at(row.completed_at) : null,
    ...(answeredAll === undefined ? {} : { answeredAll }),
  };
}

/** Marks a test expired, only while it is in progress and its window ended before `now`. A late answer cannot undo it. */
export async function expireTest(admin: SupabaseClient, id: string, now: number): Promise<void> {
  const { error } = await admin.from("assessments").update({ status: "expired" })
    .eq("id", id).eq("status", "in_progress").lt("resume_until", iso(now));
  if (error) throw new Error(`expire failed: ${error.message}`);
}

// Guarded: changes the row only while the test is in progress and its window has not ended at `now`. Once this
// succeeds, an expire request cannot match the row for another 24 hours.
async function hold(admin: SupabaseClient, id: string, now: number, patch: { resume_until: string; last_answer_at?: string }): Promise<boolean> {
  const { data, error } = await admin.from("assessments").update(patch)
    .eq("id", id).eq("status", "in_progress").gte("resume_until", iso(now)).select("id");
  if (error) throw new Error(`hold failed: ${error.message}`);
  return (data ?? []).length === 1;
}

/**
 * Records an answer at `now`: the test stays open for another 24 hours from it (the core's recordActivity).
 * False when the test is no longer open (it expired, or another request scored it), so the caller must not store the
 * answer. Call it before the answer is stored: an answer that arrives after the deadline loses to it.
 */
export async function holdForAnswer(admin: SupabaseClient, attempt: Attempt, now: number): Promise<boolean> {
  const next = recordActivity(attempt, now, { answered: true });
  return hold(admin, attempt.id, now, { resume_until: iso(next.resumeUntil), last_answer_at: iso(now) });
}

/** The signed-in parent and an admin client, or the error response to send. */
export async function testAccess(): Promise<{ parent: string; admin: SupabaseClient } | { error: Response }> {
  if (!pilotOn()) return { error: testFail("off", 404) };
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

/**
 * The start request's view of one child's tests (src/lib/test-start.ts), read and written with the secret key.
 * The one-open-test-per-child index makes a second new test fail; that failure is "taken".
 */
export function startStore(admin: SupabaseClient, parent: string, child: Child, now: number): StartStore {
  return {
    async attempts() {
      const { data, error } = await admin.from("assessments").select(`${ATTEMPT_COLUMNS}, seed`)
        .eq("child_id", child.id).eq("parent_id", parent).returns<(AttemptRow & { seed: number })[]>();
      if (error) throw new Error(`attempts load failed: ${error.message}`);
      const attempts: StoredAttempt[] = [];
      for (const row of data ?? []) {
        const attempt: StoredAttempt = { ...toAttempt(row), seed: row.seed };
        // Past its window, a test in progress may still have every answer in (its scoring call failed): look.
        if (row.status === "in_progress" && now > attempt.resumeUntil) {
          const read = await readTest(admin, parent, row.id);
          if ("error" in read) throw new Error("open test read failed");
          attempt.answeredAll = testStep(read.session).status === "complete";
        }
        attempts.push(attempt);
      }
      return attempts;
    },
    expire: (id, at) => expireTest(admin, id, at),
    hold: (id, at, resumeUntil) => hold(admin, id, at, { resume_until: iso(resumeUntil) }),
    async create(seed, attempt) {
      let session: Session;
      try {
        session = createSession({ grade: child.grade as Grade, province: child.province }, seed);
      } catch (e) {
        console.error("[test] cannot build a test", child.grade, e instanceof Error ? e.message : e);
        return "not_ready";
      }
      const { data, error } = await admin.from("assessments")
        .insert({
          parent_id: parent,
          child_id: child.id,
          seed,
          grade: child.grade,
          province: child.province,
          test: storedTest(session),
          started_at: iso(attempt.startedAt),
          resume_until: iso(attempt.resumeUntil),
        })
        .select("id").single<{ id: string }>();
      // One open test per child (unique index): another request opened one first.
      if (error?.code === "23505") return "taken";
      if (error) throw new Error(`start failed: ${error.message}`);
      return { id: data.id };
    },
  };
}

/**
 * What each child's start screen offers, from the parent's own session (row-level security returns only their rows).
 * Pass a child id to read one child. A read error shows "Start test"; the start request checks the rules again.
 */
export async function startStates(db: SupabaseClient, childId?: string): Promise<Map<string, StartState>> {
  if (childId !== undefined && !isUuid(childId)) return new Map();
  let query = db.from("assessments").select(`child_id, ${ATTEMPT_COLUMNS}`);
  if (childId) query = query.eq("child_id", childId);
  const { data, error } = await query.returns<(AttemptRow & { child_id: string })[]>();
  if (error) console.error("[test] attempts read failed", error.message);
  const byChild = new Map<string, Attempt[]>();
  for (const row of data ?? []) byChild.set(row.child_id, [...(byChild.get(row.child_id) ?? []), toAttempt(row)]);
  const now = Date.now();
  return new Map([...byChild].map(([id, attempts]) => [id, startState(attempts, now)]));
}

/** A child with no entry in startStates has no test yet. */
export const NO_TEST: StartState = { kind: "start", retake: false };
