import "server-only";
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { restoreSession, type Session, type StoredTest, type Submission } from "@/lib/assessment";
import { pilotOn } from "@/lib/pilot";
import { testFail, type AssessmentStatus } from "@/lib/test-api";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";

// The server side of the child's test (#64). The drawn test and the answers live in the database, read and written
// with the secret key; every request rebuilds the session from them and marks with the assessment core.

/** A new seed for each test: siblings, and a retake, get different questions. Postgres integer, 0 to 2^31 - 1. */
export const newSeed = () => randomInt(0, 2 ** 31 - 1);

export interface AssessmentRow {
  id: string;
  status: AssessmentStatus;
  test: StoredTest;
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
 */
export async function loadTest(admin: SupabaseClient, parent: string, id: string): Promise<{ row: AssessmentRow; session: Session } | { error: Response }> {
  if (!isUuid(id)) return { error: testFail("not_found", 404) };
  const { data: row, error } = await admin.from("assessments").select("id, status, test").eq("id", id).eq("parent_id", parent).maybeSingle<AssessmentRow>();
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
