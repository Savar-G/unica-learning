import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { CallChange, CallRecord, CallStore } from "@/lib/maya-call";
import type { QuestionRef } from "@/lib/question-package";

// The call store of Maya's calls (src/lib/maya-call.ts, #323) in Supabase: public.maya_calls with the secret key (only
// the server writes; admins read with their own session). An update names the revision it read and raises it by one,
// so of two requests about one call only the first writes. Tests use src/lib/maya-call-memory.ts.

type Row = Database["public"]["Tables"]["maya_calls"]["Row"];
type Insert = Database["public"]["Tables"]["maya_calls"]["Insert"];
type Update = Database["public"]["Tables"]["maya_calls"]["Update"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function questionColumns(q: QuestionRef): Pick<Insert, "question_source" | "assessment_id" | "assessment_question_id" | "workbook_id" | "workbook_page" | "workbook_question"> {
  return q.source === "assessment"
    ? { question_source: "assessment", assessment_id: q.assessmentId, assessment_question_id: q.questionId, workbook_id: null, workbook_page: null, workbook_question: null }
    : { question_source: "workbook", workbook_id: q.workbookId, workbook_page: q.page, workbook_question: q.question, assessment_id: null, assessment_question_id: null };
}

function changeColumns(c: CallChange): Update {
  const u: Update = {};
  if (c.status !== undefined) u.status = c.status;
  if (c.startedAt !== undefined) u.started_at = c.startedAt;
  if (c.endedAt !== undefined) u.ended_at = c.endedAt;
  if (c.live !== undefined) u.live = c.live;
  if (c.trace !== undefined) u.trace = c.trace;
  if (c.boardHistory !== undefined) u.board_history = c.boardHistory;
  if (c.learningEventId !== undefined) u.learning_event_id = c.learningEventId;
  if (c.profileRebuiltAt !== undefined) u.profile_rebuilt_at = c.profileRebuiltAt;
  if (c.counts !== undefined) {
    u.maya_turns = c.counts?.mayaTurns ?? null;
    u.child_turns = c.counts?.childTurns ?? null;
    u.fallbacks = c.counts?.fallbacks ?? null;
  }
  if (c.outcome !== undefined) {
    const o = c.outcome;
    Object.assign(u, {
      outcome_reason: o?.reason ?? null,
      assistance: o?.assistance ?? null,
      paper_status: o?.paperStatus ?? null,
      understanding: o?.understanding ?? null,
      highest_hint: o?.highestHint ?? null,
      call_seconds: o ? Math.round(o.seconds) : null,
      mishearing_confirmations: o?.mishearing.confirmations ?? null,
      mishearing_corrections: o?.mishearing.corrections ?? null,
      safety_flag: o?.safetyFlag ?? false,
      safety_severity: o?.safetySeverity ?? null,
    } satisfies Update);
  }
  return u;
}

function questionOf(r: Row): QuestionRef {
  return r.question_source === "assessment"
    ? { source: "assessment", assessmentId: r.assessment_id ?? "", questionId: r.assessment_question_id ?? "" }
    : { source: "workbook", workbookId: r.workbook_id ?? "", page: r.workbook_page ?? 0, question: r.workbook_question ?? 0 };
}

export function fromCallRow(r: Row): CallRecord {
  return {
    id: r.id,
    createdAt: r.created_at,
    recordVersion: r.record_version,
    kind: r.kind,
    mode: r.mode,
    startedBy: r.started_by,
    parentId: r.parent_id,
    childId: r.child_id,
    question: questionOf(r),
    packageId: r.package_id,
    packageHash: r.package_hash,
    questionText: r.question_text,
    status: r.status,
    revision: r.revision,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    model: r.model,
    promptVersion: r.prompt_version,
    versions: r.versions,
    outcome: r.trace?.outcome ?? null,
    counts: r.maya_turns === null ? null : { mayaTurns: r.maya_turns, childTurns: r.child_turns ?? 0, fallbacks: r.fallbacks ?? 0 },
    live: r.live,
    trace: r.trace,
    boardHistory: r.board_history,
    learningEventId: r.learning_event_id,
    profileRebuiltAt: r.profile_rebuilt_at,
  };
}

export function mayaCallStore(admin: SupabaseClient<Database>): CallStore {
  return {
    async insert(c) {
      const row: Insert = {
        id: c.id,
        record_version: c.recordVersion,
        kind: c.kind,
        mode: c.mode,
        started_by: c.startedBy,
        parent_id: c.parentId,
        child_id: c.childId,
        ...questionColumns(c.question),
        package_id: c.packageId,
        package_hash: c.packageHash,
        question_text: c.questionText,
        status: c.status,
        revision: c.revision,
        model: c.model,
        prompt_version: c.promptVersion,
        versions: c.versions,
        live: c.live,
      };
      const { error } = await admin.from("maya_calls").insert(row);
      if (error) throw new Error(`maya call insert: ${error.message}`);
    },
    async get(id) {
      if (!UUID.test(id)) return null;
      const { data, error } = await admin.from("maya_calls").select("*").eq("id", id.toLowerCase()).maybeSingle();
      if (error) throw new Error(`maya call load: ${error.message}`);
      return data ? fromCallRow(data) : null;
    },
    async update(id, revision, change) {
      const { data, error } = await admin
        .from("maya_calls")
        .update({ ...changeColumns(change), revision: revision + 1, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("revision", revision)
        .select("id");
      if (error) throw new Error(`maya call update: ${error.message}`);
      return (data ?? []).length === 1;
    },
  };
}
