import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/assessment-store";
import type { Database } from "@/lib/database";
import { learningEvents } from "@/lib/learning-events";
import { backfillAssessmentEvents, type BackfillResult } from "@/lib/learning-events-assessment";
import { learningEventStore } from "@/lib/learning-events-store";

// The reader of one finished test's answers for the assessment backfill (src/lib/learning-events-assessment.ts, #302),
// with the secret key: it reads public.assessments and public.answers and appends through the learning events' store.
/**
 * Appends the learning events of one finished test's answers (src/lib/learning-events-assessment.ts), for one family
 * at a time; there is no backfill of every test. Null when the test is not found or not finished: an unfinished test's
 * answers can still change.
 */
export async function backfillAssessment(admin: SupabaseClient<Database>, assessmentId: string): Promise<BackfillResult | null> {
  if (!isUuid(assessmentId)) return null;
  const test = await admin.from("assessments").select("id, parent_id, child_id, status").eq("id", assessmentId).maybeSingle();
  if (test.error) throw new Error(`backfill test load: ${test.error.message}`);
  if (!test.data || test.data.status !== "completed") return null;
  const answers = await admin.from("answers")
    .select("id, question_id, template_id, response, correct, misconception, time_ms, answered_at, created_at")
    .eq("assessment_id", assessmentId).order("position", { ascending: true });
  if (answers.error) throw new Error(`backfill answers load: ${answers.error.message}`);
  const owner = { assessmentId, parentId: test.data.parent_id, childId: test.data.child_id };
  return backfillAssessmentEvents(learningEvents(learningEventStore(admin)), owner, answers.data.map((a) => ({
    id: a.id, questionId: a.question_id, templateId: a.template_id, response: a.response, correct: a.correct,
    misconception: a.misconception, timeMs: a.time_ms, answeredAt: a.answered_at, createdAt: a.created_at,
  })));
}
