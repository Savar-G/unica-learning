import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database";
import { encodeHistory } from "@/lib/board-history";
import { INK_AFTER_END_MS, INK_SAVE_GAP_MS, type CallChange, type CallRecord, type CallStore, type ConnectionLog } from "@/lib/maya-call";
import type { SweepCallSource, SweepCursor } from "@/lib/maya-call-sweep";
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
  if (c.notePending !== undefined) u.note_pending = c.notePending;
  if (c.speechToText !== undefined) u.speech_to_text = c.speechToText;
  if (c.voice !== undefined) u.voice = c.voice;
  if (c.connectedSeconds !== undefined) u.connected_seconds = c.connectedSeconds;
  if (c.flag !== undefined) {
    u.flag = c.flag?.level ?? null;
    u.flagged_at = c.flag?.at ?? null;
  }
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
    childInk: r.child_ink,
    learningEventId: r.learning_event_id,
    profileRebuiltAt: r.profile_rebuilt_at,
    notePending: r.note_pending,
    speechToText: r.speech_to_text,
    voice: r.voice,
    connectedSeconds: r.connected_seconds,
    flag: r.flag && r.flagged_at ? { level: r.flag, at: r.flagged_at } : null,
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
        speech_to_text: c.speechToText,
        voice: c.voice,
        connected_seconds: c.connectedSeconds,
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
    async pendingNotes(childId, limit) {
      if (!UUID.test(childId)) return [];
      const { data, error } = await admin
        .from("maya_calls")
        .select("*")
        .eq("child_id", childId.toLowerCase())
        .eq("status", "ended")
        .not("note_pending", "is", null)
        .order("ended_at", { ascending: true })
        .limit(Math.max(1, Math.min(limit, 20)));
      if (error) throw new Error(`maya call pending notes: ${error.message}`);
      return (data ?? []).map(fromCallRow);
    },
    async saveInk(id, owner, ink) {
      if (!UUID.test(id) || !UUID.test(owner.parentId) || !UUID.test(owner.childId)) return "not_found";
      // One statement compares and writes (R625-2); the revision and the call's write time stay (#534). The board goes as
      // the JSON of its saved copy: Maya's commands are plain JSON, which their type (unknown) does not say.
      const { data, error } = await admin.rpc("save_maya_call_ink", {
        p_id: id.toLowerCase(), p_parent: owner.parentId.toLowerCase(), p_child: owner.childId.toLowerCase(),
        p_ink: JSON.parse(encodeHistory(ink)) as Json, p_gap_ms: INK_SAVE_GAP_MS, p_after_end_ms: INK_AFTER_END_MS,
      });
      if (error) throw new Error(`maya call save ink: ${error.message}`);
      if (data === "saved" || data === "stale" || data === "busy" || data === "closed" || data === "not_found") return data;
      throw new Error(`maya call save ink: unexpected answer ${String(data)}`);
    },
    async clearNote(id) {
      if (!UUID.test(id)) return false;
      const { data, error } = await admin
        .from("maya_calls")
        .update({ note_pending: null, updated_at: new Date().toISOString() })
        .eq("id", id.toLowerCase())
        .eq("status", "ended")
        .not("note_pending", "is", null)
        .select("id");
      if (error) throw new Error(`maya call clear note: ${error.message}`);
      return (data ?? []).length === 1;
    },
  };
}

/** A stored time as the database writes it, microseconds and offset kept (so the cursor is exact). */
const STORED_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

/** A PostgREST filter for rows after a cursor, by `column`, then id. Only a stored time and an id reach the filter text. */
function afterFilter(column: string, c: SweepCursor): string {
  const at = c.at;
  if (!STORED_TIME.test(at) || !Number.isFinite(Date.parse(at)) || !UUID.test(c.id)) throw new Error("maya sweep: bad cursor");
  return `${column}.gt.${at},and(${column}.eq.${at},id.gt.${c.id.toLowerCase()})`;
}

/** An ended call with a step missing (src/lib/maya-call-sweep.ts `unfinished`), as the partial index of migration maya_calls_unfinished_index reads it. */
const UNFINISHED = "live.not.is.null,note_pending.not.is.null,and(learning_event_id.not.is.null,profile_rebuilt_at.is.null)";

/**
 * The calls the sweep of abandoned calls (#528) reads, on the partial indexes of migrations maya_calls_live_index and
 * maya_calls_unfinished_index. "Last written" is updated_at, which every write of the call store sets.
 */
export function sweepCallSource(admin: SupabaseClient<Database>): SweepCallSource {
  const bounded = (limit: number) => Math.max(1, Math.min(limit, 50));
  return {
    async liveCalls(createdBefore, after, limit) {
      let q = admin.from("maya_calls").select("*").eq("status", "live").lte("created_at", createdBefore);
      if (after) q = q.or(afterFilter("created_at", after));
      const { data, error } = await q.order("created_at", { ascending: true }).order("id", { ascending: true }).limit(bounded(limit));
      if (error) throw new Error(`maya live calls: ${error.message}`);
      return (data ?? []).map(fromCallRow);
    },
    async unfinishedCalls(endedFrom, writtenBefore, after, limit) {
      let q = admin.from("maya_calls").select("*").eq("status", "ended").gte("ended_at", endedFrom).lte("updated_at", writtenBefore);
      q = after ? q.or(`and(or(${UNFINISHED}),or(${afterFilter("ended_at", after)}))`) : q.or(UNFINISHED);
      const { data, error } = await q.order("ended_at", { ascending: true }).order("id", { ascending: true }).limit(bounded(limit));
      if (error) throw new Error(`maya unfinished calls: ${error.message}`);
      return (data ?? []).map(fromCallRow);
    },
    // The sweep's place in each list (#586): public.maya_call_sweep_cursors, one row per kind.
    async readPlace(kind) {
      const { data, error } = await admin.from("maya_call_sweep_cursors").select("at, call_id, until_at").eq("kind", kind).maybeSingle();
      if (error) throw new Error(`maya sweep place: ${error.message}`);
      return data?.at && data.call_id && data.until_at ? { after: { at: data.at, id: data.call_id }, until: data.until_at } : null;
    },
    async writePlace(kind, place) {
      const good = (at: string) => STORED_TIME.test(at) && Number.isFinite(Date.parse(at));
      if (place && (!good(place.after.at) || !good(place.until) || !UUID.test(place.after.id))) throw new Error("maya sweep: bad cursor");
      const { error } = await admin.from("maya_call_sweep_cursors").upsert(
        { kind, at: place?.after.at ?? null, call_id: place?.after.id.toLowerCase() ?? null, until_at: place?.until ?? null, updated_at: new Date().toISOString() },
        { onConflict: "kind" },
      );
      if (error) throw new Error(`maya sweep place write: ${error.message}`);
    },
  };
}

/**
 * The connection events of voice calls (#326) in public.maya_call_connections: append only, with the secret key. The
 * database checks the revision and appends in one transaction, with its own monotonic receipt time.
 */
export function mayaConnectionLog(admin: SupabaseClient<Database>): ConnectionLog {
  return {
    async append(e, revision) {
      const { data, error } = await admin.rpc("append_maya_call_connection", { p_call: e.callId, p_revision: revision, p_kind: e.kind });
      if (error) throw new Error(`maya call connection append: ${error.message}`);
      return data === null ? null : Date.parse(data);
    },
    async read(callId) {
      if (!UUID.test(callId)) return [];
      const { data, error } = await admin.from("maya_call_connections").select("kind, at").eq("call_id", callId.toLowerCase()).order("at", { ascending: true }).order("id", { ascending: true });
      if (error) throw new Error(`maya call connections read: ${error.message}`);
      return (data ?? []).map((r) => ({ kind: r.kind, at: Date.parse(r.at) }));
    },
  };
}
