import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { restoreFacts, type FactsSession, type FactsTest, type FactSubmission } from "@/lib/assessment";
import { testFail } from "@/lib/test-api";

// The finish route's read of the timed facts section (#70). The facts routes go through the test attempt module
// (src/lib/test-attempt.ts, #148); the finish route moves to it too, and then this file goes (#150).

export interface LoadedFacts {
  /** When the section started, in ms since the epoch, by the server's clock. */
  startedAt: number;
  session: FactsSession;
}

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
