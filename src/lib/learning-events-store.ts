import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/assessment-store";
import type { Database } from "@/lib/database";
import { learningEvents, type LearningEvent, type LearningEventStore, type NewLearningEvent } from "@/lib/learning-events";
import { backfillAssessmentEvents, type BackfillResult } from "@/lib/learning-events-assessment";

// The learning events' store (src/lib/learning-events.ts, #302) in Supabase, with the secret key: the service role may
// only insert into and read public.learning_events (migration add_learning_events); admins read it; parents read
// nothing. The idempotency key is unique in the table, so a retried insert fails with 23505 and the store reads the
// event that is already stored. The family write fence refuses an event for a family being deleted; the foreign keys
// refuse a child of another parent and a test of another child. Tests use src/lib/learning-events-memory.ts.

/** The columns the store reads: every column but the time the row was stored. */
type Row = Omit<Database["public"]["Tables"]["learning_events"]["Row"], "created_at">;

const COLUMNS = "id, idempotency_key, parent_id, child_id, source, question_source, workbook_id, workbook_page, workbook_question, assessment_id, assessment_question_id, skill_standard, skills, result, stuck_step, mistake, hints, time_ms, occurred_at, evidence_kind, evidence_id";

/** PostgREST answers at most 1000 rows a request (the project's max rows), so a range read pages. */
const PAGE_SIZE = 1000;

function toRow(e: NewLearningEvent): Database["public"]["Tables"]["learning_events"]["Insert"] {
  const q = e.question;
  return {
    idempotency_key: e.key,
    parent_id: e.parentId,
    child_id: e.childId,
    source: e.source,
    question_source: q.source,
    workbook_id: q.source === "workbook" ? q.workbookId : null,
    workbook_page: q.source === "workbook" ? q.page : null,
    workbook_question: q.source === "workbook" ? q.question : null,
    assessment_id: q.source === "assessment" ? q.assessmentId : null,
    assessment_question_id: q.source === "assessment" ? q.questionId : null,
    skill_standard: e.skill.standard,
    skills: e.skill.skills,
    result: e.result,
    stuck_step: e.stuckStep,
    mistake: e.mistake,
    hints: e.hints,
    time_ms: e.timeMs,
    occurred_at: e.occurredAt,
    evidence_kind: e.evidence?.kind ?? null,
    evidence_id: e.evidence?.id ?? null,
  };
}

function fromRow(r: Row): LearningEvent {
  const question: NewLearningEvent["question"] = r.question_source === "workbook"
    ? { source: "workbook", workbookId: r.workbook_id!, page: r.workbook_page!, question: r.workbook_question! }
    : { source: "assessment", assessmentId: r.assessment_id!, questionId: r.assessment_question_id! };
  return {
    id: r.id,
    key: r.idempotency_key,
    parentId: r.parent_id,
    childId: r.child_id,
    source: r.source,
    question,
    skill: { standard: r.skill_standard, skills: r.skills },
    result: r.result,
    stuckStep: r.stuck_step,
    mistake: r.mistake,
    hints: r.hints,
    timeMs: r.time_ms,
    // Postgres writes "+00:00"; the module's times are ISO strings in UTC.
    occurredAt: new Date(r.occurred_at).toISOString(),
    evidence: r.evidence_kind && r.evidence_id ? { kind: r.evidence_kind, id: r.evidence_id } : null,
  };
}

export function learningEventStore(admin: SupabaseClient<Database>, { pageSize = PAGE_SIZE } = {}): LearningEventStore {
  return {
    async insert(event) {
      const { data, error } = await admin.from("learning_events").insert(toRow(event)).select(COLUMNS).single();
      if (!error) return { created: true, event: fromRow(data) };
      // 23505: the key is stored (a retry, or a write that won a race): give the stored event.
      if (error.code !== "23505") throw new Error(`learning event append: ${error.message}`);
      const stored = await admin.from("learning_events").select(COLUMNS).eq("idempotency_key", event.key).single();
      if (stored.error) throw new Error(`learning event load: ${stored.error.message}`);
      return { created: false, event: fromRow(stored.data) };
    },
    async range(childId, { from, to }) {
      const events: LearningEvent[] = [];
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await admin.from("learning_events").select(COLUMNS)
          .eq("child_id", childId).gte("occurred_at", from).lt("occurred_at", to)
          .order("occurred_at", { ascending: true }).order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw new Error(`learning events load: ${error.message}`);
        events.push(...data.map(fromRow));
        if (data.length < pageSize) return events;
      }
    },
  };
}

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
