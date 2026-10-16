import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Grade, StartState, StoredTest } from "@/lib/assessment";
import type { Child } from "@/lib/account";
import { isUuid, toAttempt, type AttemptRow } from "@/lib/assessment-store";
import { startStates, StoreError, type AttemptStore } from "@/lib/test-attempt";
import { adminClient } from "@/lib/supabase-auth";
import type { FactsTest } from "@/lib/assessment";
import type { FactsStore } from "@/lib/test-attempt";
import type { AnswerTimeline, ShownStore } from "@/lib/test-attempt";
import type { ContextStore } from "@/lib/test-attempt";
import { workPath } from "@/lib/work-payload";
import { WORK_BUCKET } from "@/lib/work-store";

// The test attempt module's Supabase store (src/lib/test-attempt.ts, #146): the database, read and written with the
// secret key. Every read is filtered by the parent the route passes (from their verified session), so a parent never
// reaches another family's test. The guards are the database's: the unique index assessments_one_open_per_child (one
// open test per child), and updates guarded in the update itself, so two requests at once cannot both win.
// Answers (#147): one answer per place in a test (unique on assessment_id and position). The drawings go to the private
// bucket (src/lib/work-store.ts), written with the secret key in the parent's folder. Finish (#150): the update that
// completes a test is guarded by its status, so two finishes at once store one placement.

const iso = (ms: number) => new Date(ms).toISOString();

/** The assessment columns the resume and retake rules read: an AttemptRow. */
const ATTEMPT_COLUMNS = "id, status, started_at, last_answer_at, resume_until, completed_at";

export function attemptStore(admin: SupabaseClient): AttemptStore {
  return {
    ...factsStore(admin),
    ...shownStore(admin),
    ...contextStore(admin),
    async child(parent, childId) {
      const { data, error } = await admin.from("children").select("id, grade, province")
        .eq("id", childId).eq("parent_id", parent).maybeSingle<Pick<Child, "id" | "grade" | "province">>();
      if (error) throw new StoreError("child load failed", error.message);
      return data ? { id: data.id, grade: data.grade as Grade, province: data.province } : null;
    },

    async attempts(parent, childId) {
      let query = admin.from("assessments").select(`child_id, seed, ${ATTEMPT_COLUMNS}`).eq("parent_id", parent);
      if (childId !== undefined) query = query.eq("child_id", childId);
      const { data, error } = await query.returns<(AttemptRow & { child_id: string; seed: number })[]>();
      if (error) throw new StoreError("attempts load failed", error.message);
      return (data ?? []).map((row) => ({ ...toAttempt(row), childId: row.child_id, seed: row.seed }));
    },

    async load(parent, id) {
      const { data: row, error } = await admin.from("assessments").select(`${ATTEMPT_COLUMNS}, test`)
        .eq("id", id).eq("parent_id", parent).maybeSingle<AttemptRow & { test: StoredTest }>();
      if (error) throw new StoreError("load failed", error.message);
      if (!row) return null;
      const { data: answers, error: answersError } = await admin.from("answers")
        .select("question_id, response, time_ms").eq("assessment_id", id).order("position")
        .returns<{ question_id: string; response: string; time_ms: number }[]>();
      if (answersError) throw new StoreError("answers load failed", answersError.message);
      return {
        attempt: toAttempt(row),
        test: row.test,
        answers: (answers ?? []).map((a) => ({ questionId: a.question_id, response: a.response, timeMs: a.time_ms })),
      };
    },

    async expire(id, now) {
      const { error } = await admin.from("assessments").update({ status: "expired" })
        .eq("id", id).eq("status", "in_progress").lt("resume_until", iso(now));
      if (error) throw new StoreError("expire failed", error.message);
    },

    async openAnswerWindow(id, now, until) {
      const { data, error } = await admin.from("assessments").update({ resume_until: iso(until) })
        .eq("id", id).eq("status", "in_progress").gte("resume_until", iso(now)).select("id");
      if (error) throw new StoreError("deadline update failed", error.message);
      return (data ?? []).length === 1;
    },

    async recordAnswerTime(id, at) {
      const time = iso(at);
      const { error } = await admin.from("assessments").update({ last_answer_at: time })
        .eq("id", id).or(`last_answer_at.is.null,last_answer_at.lt."${time}"`);
      if (error) throw new StoreError("answer time save failed", error.message);
    },

    async undoAnswerWindow(id, until, previous) {
      const { error } = await admin.from("assessments").update({ resume_until: iso(previous) })
        .eq("id", id).eq("resume_until", iso(until));
      if (error) throw new StoreError("deadline undo failed", error.message);
    },

    async storeDrawing(parent, id, questionId, png) {
      // A new name for each upload, so two tabs never write over each other's file.
      const path = workPath(parent, id, questionId, randomBytes(6).toString("hex"));
      const { error } = await admin.storage.from(WORK_BUCKET).upload(path, png, { contentType: "image/png", upsert: false, cacheControl: "3600" });
      if (error) throw new StoreError("upload failed", error.message);
      return path;
    },

    async removeDrawing(path) {
      const { error } = await admin.storage.from(WORK_BUCKET).remove([path]);
      if (error) throw new StoreError("remove failed", error.message);
    },

    async insertAnswer(id, answer) {
      const { error } = await admin.from("answers").insert({
        assessment_id: id,
        position: answer.position,
        question_id: answer.questionId,
        template_id: answer.templateId,
        values: answer.values,
        response: answer.response,
        correct: answer.correct,
        misconception: answer.misconception,
        time_ms: answer.timeMs,
        work_required: answer.workRequired,
        work_path: answer.workPath,
        work_text: answer.workText,
        ...timelineColumns(answer.timeline),
      });
      // One answer per place (unique index on assessment_id and position): another request stored it first.
      if (error?.code === "23505") return "taken";
      if (error) throw new StoreError("answer save failed", error.message);
      return "stored";
    },

    async recordRoute(id, route) {
      const { error } = await admin.from("assessments").update({ route }).eq("id", id);
      if (error) throw new StoreError("route save failed", error.message);
    },

    async complete(id, { at, placement, help }) {
      const { error } = await admin.from("assessments")
        .update({ status: "completed", completed_at: iso(at), route: placement.route, placement, help })
        .eq("id", id).eq("status", "in_progress");
      if (error) throw new StoreError("finish failed", error.message);
    },

    async create(parent, child, { attempt, seed, test }) {
      const { data, error } = await admin.from("assessments")
        .insert({
          parent_id: parent,
          child_id: child.id,
          seed,
          grade: child.grade,
          province: child.province,
          test,
          started_at: iso(attempt.startedAt),
          resume_until: iso(attempt.resumeUntil),
        })
        .select("id").single<{ id: string }>();
      // One open test per child (unique index): another request opened one first.
      if (error?.code === "23505") return "taken";
      if (error) throw new StoreError("start failed", error.message);
      return { id: data.id };
    },
  };
}

/**
 * What the start screen of each of the parent's children offers now (#72), for the account pages. Pass a child id to
 * read one child. Without the secret key, or for an id that is not a uuid, every child is offered "Start test".
 */
export async function parentStartStates(parent: string, childId?: string): Promise<Map<string, StartState>> {
  if (childId !== undefined && !isUuid(childId)) return new Map();
  const admin = adminClient();
  if (!admin) return new Map();
  return startStates(attemptStore(admin), parent, Date.now(), childId);
}

/**
 * The store's operations for the timed facts section (#70, #148): the tables assessment_facts (one row per test, the
 * primary key) and fact_answers (one row per fact, unique by position). Only the server reads and writes them. These
 * rows have no parent column: the module calls these operations only for a test that `load` found for the parent, so
 * they filter by the test's id.
 */
function factsStore(admin: SupabaseClient): FactsStore {
  return {
    async loadFacts(id) {
      const { data: row, error } = await admin.from("assessment_facts").select("started_at, test").eq("assessment_id", id)
        .maybeSingle<{ started_at: string; test: FactsTest }>();
      if (error) throw new StoreError("load failed", error.message);
      if (!row) return null;
      const { data: answers, error: answersError } = await admin.from("fact_answers").select("fact_id, response, at_ms, browser_ms")
        .eq("assessment_id", id).order("position").returns<{ fact_id: string; response: string; at_ms: number; browser_ms: number | null }[]>();
      if (answersError) throw new StoreError("answers load failed", answersError.message);
      return {
        startedAt: Date.parse(row.started_at),
        test: row.test,
        answers: (answers ?? []).map((a) => ({ factId: a.fact_id, response: a.response, atMs: a.at_ms, browserMs: a.browser_ms })),
      };
    },

    async insertFacts(id, { startedAt, test }) {
      const { error } = await admin.from("assessment_facts").insert({ assessment_id: id, started_at: iso(startedAt), test });
      // One facts section per test (the primary key): another request started it first.
      if (error?.code === "23505") return "taken";
      if (error) throw new StoreError("start failed", error.message);
      return "stored";
    },

    async insertFactAnswer(id, { position, factId, response, correct, atMs, serverMs, browserMs }) {
      // #185: the time on the fact by the server and by the browser (null when the screen sent none).
      const { error } = await admin.from("fact_answers").insert({
        assessment_id: id, position, fact_id: factId, response, correct, at_ms: Math.round(atMs), server_ms: Math.round(serverMs), browser_ms: browserMs,
      });
      // One answer per position (unique): another request answered this fact first.
      if (error?.code === "23505") return "taken";
      if (error) throw new StoreError("answer save failed", error.message);
      return "stored";
    },
  };
}

/**
 * The store's operations for the serve times of the answer timeline (#184): the table question_shows, one row per place
 * in a test (the primary key). Only the server writes it. Like the facts rows, these rows have no parent column: the
 * module calls these operations only for a test that `load` found for the parent.
 */
function shownStore(admin: SupabaseClient): ShownStore {
  return {
    async recordShown(id, { position, questionId, at }) {
      // The first serve wins: a later serve of the same place is ignored (on conflict do nothing).
      const { error } = await admin.from("question_shows")
        .upsert({ assessment_id: id, position, question_id: questionId, shown_at: iso(at) }, { onConflict: "assessment_id,position", ignoreDuplicates: true });
      if (error) throw new StoreError("shown time save failed", error.message);
    },

    async shownAt(id, position) {
      const { data, error } = await admin.from("question_shows").select("question_id, shown_at")
        .eq("assessment_id", id).eq("position", position).maybeSingle<{ question_id: string; shown_at: string }>();
      if (error) throw new StoreError("shown time load failed", error.message);
      return data ? { position, questionId: data.question_id, at: Date.parse(data.shown_at) } : null;
    },
  };
}

/** The answer timeline's columns of public.answers (#184, migration add_answer_timeline). Null where nothing was recorded. */
function timelineColumns({ shownAt, answeredAt, events }: AnswerTimeline) {
  return {
    shown_at: shownAt === null ? null : iso(shownAt),
    answered_at: iso(answeredAt),
    answer_changes: events?.changes ?? null,
    read_aloud_count: events?.readAloud.count ?? null,
    read_aloud_at_ms: events?.readAloud.atMs ?? null,
    away_count: events?.away.count ?? null,
    away_ms: events?.away.ms ?? null,
  };
}

/**
 * The store's operations for the test context (#185): columns of public.assessments. Each update is guarded in the
 * update itself: only an open test, and only fields still empty, so two requests at once (or a resume on another
 * device) cannot overwrite the first record. The module calls them only for a test that `load` found for the parent.
 */
function contextStore(admin: SupabaseClient): ContextStore {
  return {
    async recordDevice(id, device) {
      const { error } = await admin.from("assessments").update({ device })
        .eq("id", id).eq("status", "in_progress").is("device", null);
      if (error) throw new StoreError("device save failed", error.message);
    },

    async startBreak(id, at) {
      const { error } = await admin.from("assessments").update({ break_started_at: iso(at) })
        .eq("id", id).eq("status", "in_progress").is("break_started_at", null);
      if (error) throw new StoreError("break save failed", error.message);
    },

    async endBreak(id, { at, skipped, lengthMs }) {
      const ended = { break_ended_at: iso(at), break_skipped: skipped, break_ms: lengthMs };
      // Two rounds: "shown" can land between the two updates, and then the first one takes the end.
      for (let round = 0; round < 2; round++) {
        // The usual order: the break has its start.
        const after = await admin.from("assessments").update(ended)
          .eq("id", id).eq("status", "in_progress").not("break_started_at", "is", null).is("break_ended_at", null).select("id");
        if (after.error) throw new StoreError("break save failed", after.error.message);
        if ((after.data ?? []).length > 0) return;
        // The end reached the server first: its start is the browser's length before it.
        const first = await admin.from("assessments").update({ ...ended, break_started_at: iso(at - lengthMs) })
          .eq("id", id).eq("status", "in_progress").is("break_started_at", null).is("break_ended_at", null).select("id");
        if (first.error) throw new StoreError("break save failed", first.error.message);
        if ((first.data ?? []).length > 0) return;
      }
      // The break had ended already (or the test closed): nothing changes.
    },
  };
}
