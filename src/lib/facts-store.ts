import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { factsStep, restoreFacts, type FactsSession, type FactsStep, type FactsTest, type FactSubmission, type StoredTest } from "@/lib/assessment";
import { isUuid } from "@/lib/assessment-store";
import { testFail, type AssessmentStatus } from "@/lib/test-api";

// The server side of the timed facts section (#70). The server's clock times the section: started_at is stored when
// the child presses Start, and each answer stores its arrival time since then. The core only takes those times as input.

export interface FactsOwner {
  id: string;
  status: AssessmentStatus;
  test: StoredTest;
}

/** The parent's assessment (only the parts the facts section needs), or the error response to send. */
export async function factsOwner(admin: SupabaseClient, parent: string, id: string): Promise<FactsOwner | { error: Response }> {
  if (!isUuid(id)) return { error: testFail("not_found", 404) };
  const { data, error } = await admin.from("assessments").select("id, status, test").eq("id", id).eq("parent_id", parent).maybeSingle<FactsOwner>();
  if (error) {
    console.error("[facts] assessment load failed", error.message);
    return { error: testFail("store_failed", 502) };
  }
  return data ?? { error: testFail("not_found", 404) };
}

export interface LoadedFacts {
  /** When the section started, in ms since the epoch, by the server's clock. */
  startedAt: number;
  session: FactsSession;
}

/** Where the section is now, by the server's clock. */
export const stepNow = (loaded: LoadedFacts): FactsStep => factsStep(loaded.session, Date.now() - loaded.startedAt);

/** The section rebuilt from the stored facts and answers; null when it has not started; or the error response to send. */
export async function loadFacts(admin: SupabaseClient, assessmentId: string): Promise<LoadedFacts | null | { error: Response }> {
  const { data: row, error } = await admin.from("assessment_facts").select("started_at, test").eq("assessment_id", assessmentId)
    .maybeSingle<{ started_at: string; test: FactsTest }>();
  if (error) {
    console.error("[facts] load failed", error.message);
    return { error: testFail("store_failed", 502) };
  }
  if (!row) return null;
  const { data: answers, error: answersError } = await admin.from("fact_answers").select("fact_id, response, at_ms")
    .eq("assessment_id", assessmentId).order("position").returns<{ fact_id: string; response: string; at_ms: number }[]>();
  if (answersError) {
    console.error("[facts] answers load failed", answersError.message);
    return { error: testFail("store_failed", 502) };
  }
  const submissions: FactSubmission[] = (answers ?? []).map((a) => ({ factId: a.fact_id, response: a.response, atMs: a.at_ms }));
  try {
    return { startedAt: Date.parse(row.started_at), session: restoreFacts(row.test, submissions) };
  } catch (e) {
    console.error("[facts] restore failed", assessmentId, e instanceof Error ? e.message : e);
    return { error: testFail("store_failed", 500) };
  }
}
