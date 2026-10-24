import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toJson, type Database } from "@/lib/database";
import type { Grade, StartState } from "@/lib/assessment";
import { isUuid, toAttempt } from "@/lib/assessment-store";
import { retakeState, startStates, StoreError, type AttemptStore, type RetakeState } from "@/lib/test-attempt";
import { adminClient } from "@/lib/supabase-auth";
import type { FactsStore } from "@/lib/test-attempt";
import type { AnswerTimeline, ShownStore } from "@/lib/test-attempt";
import type { ContextStore } from "@/lib/test-attempt";
import type { AnswerEvents } from "@/lib/answer-events";
import { strokesPath, workPath } from "@/lib/work-payload";
import { WORK_BUCKET } from "@/lib/work-store";

// The test attempt module's Supabase store (src/lib/test-attempt.ts, #146): the database, read and written with the
// secret key. Every read is filtered by the parent the route passes (from their verified session), so a parent never
// reaches another family's test. The guards are the database's: the unique index assessments_one_open_per_child (one
// open test per child), and updates guarded in the update itself, so two requests at once cannot both win.
// Answers (#147): one answer per place in a test (unique on assessment_id and position). The drawings go to the private
// bucket (src/lib/work-store.ts), written with the secret key in the parent's folder. Finish (#150): the update that
// completes a test is guarded by its status, so two finishes at once store one placement.
// Strokes (#186): JSON files in the same private bucket and folder as the drawings. The storage policy lets a parent
// read only the .png drawings; the strokes are for admins (migration add_answer_strokes).

const iso = (ms: number) => new Date(ms).toISOString();

/** The assessment columns the resume and retake rules read: an AttemptRow. */
const ATTEMPT_COLUMNS = "id, status, started_at, last_answer_at, resume_until, completed_at";

export function attemptStore(admin: SupabaseClient<Database>): AttemptStore {
  return {
    ...factsStore(admin),
    ...shownStore(admin),
    ...contextStore(admin),
    async child(parent, childId) {
      const { data, error } = await admin.from("children").select("id, grade, province")
        .eq("id", childId).eq("parent_id", parent).maybeSingle();
      if (error) throw new StoreError("child load failed", error.message);
      return data ? { id: data.id, grade: data.grade as Grade, province: data.province } : null;
    },

    async attempts(parent, childId) {
      // #189: placement->pace->unreliable is true when the completed test's result may not be reliable (a new test opens at once).
      let query = admin.from("assessments").select(`child_id, seed, ${ATTEMPT_COLUMNS}, unreliable:placement->pace->unreliable`).eq("parent_id", parent);
      if (childId !== undefined) query = query.eq("child_id", childId);
      const { data, error } = await query;
      if (error) throw new StoreError("attempts load failed", error.message);
      return (data ?? []).map((row) => ({
        ...toAttempt(row),
        childId: row.child_id,
        seed: row.seed,
        ...(row.status === "completed" && row.unreliable === true ? { unreliable: true } : {}),
      }));
    },

    async load(parent, id) {
      const { data: row, error } = await admin.from("assessments").select(`${ATTEMPT_COLUMNS}, test, route, break_started_at, break_ended_at, help`)
        .eq("id", id).eq("parent_id", parent)
        .maybeSingle();
      if (error) throw new StoreError("load failed", error.message);
      if (!row) return null;
      // Every answer in place order. The module leaves out the removed extra round's answers (D-145, fromRemovedRound).
      const { data: answers, error: answersError } = await admin.from("answers")
        .select("question_id, response, time_ms").eq("assessment_id", id).order("position");
      if (answersError) throw new StoreError("answers load failed", answersError.message);
      return {
        attempt: toAttempt(row),
        test: row.test,
        answers: (answers ?? []).map((a) => ({ questionId: a.question_id, response: a.response, timeMs: a.time_ms })),
        ...(row.break_started_at && { break: { startedAt: Date.parse(row.break_started_at), ended: row.break_ended_at != null } }),
        help: row.help,
        // #253: the stored route is the stage 1 lock record.
        route: row.route,
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

    async storeStrokes(parent, id, questionId, json) {
      const path = strokesPath(parent, id, questionId, randomBytes(6).toString("hex"));
      const { error } = await admin.storage.from(WORK_BUCKET).upload(path, json, { contentType: "application/json", upsert: false, cacheControl: "3600" });
      if (error) throw new StoreError("upload failed", error.message);
      return path;
    },

    async removeStrokes(path) {
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
        strokes_path: answer.strokesPath ?? null,
        ...timelineColumns(answer.timeline),
        // answers.round keeps its default, 'main' (D-145: the extra round is removed).
      });
      // One answer per place (unique index on assessment_id and position): another request stored it first.
      if (error?.code === "23505") return "taken";
      if (error) throw new StoreError("answer save failed", error.message);
      return "stored";
    },

    async answerEvents(id, position) {
      const { data, error } = await admin.from("answers").select("answer_changes, read_aloud_count, read_aloud_at_ms, away_count, away_ms")
        .eq("assessment_id", id).eq("position", position).maybeSingle();
      if (error) throw new StoreError("answer events load failed", error.message);
      return data ? eventsOf(data) : null;
    },

    // #252: the rows' work columns, then each strokes file from the bucket, at the same time. A strokes file that cannot
    // be read is left out (logged): its board opens empty, and its stored work stays unless the child changes it.
    async answerWork(id, positions) {
      if (!positions.length) return [];
      const { data, error } = await admin.from("answers").select("position, work_path, work_text, strokes_path")
        .eq("assessment_id", id).in("position", [...positions]);
      if (error) throw new StoreError("answer work load failed", error.message);
      return Promise.all((data ?? []).map(async (row) => {
        let strokes: string | null = null;
        if (row.strokes_path) {
          const { data: file, error: fileError } = await admin.storage.from(WORK_BUCKET).download(row.strokes_path);
          if (fileError || !file) console.error("[strokes] download failed", fileError?.message ?? "no file");
          else strokes = await file.text();
        }
        return { position: row.position, workPath: row.work_path, workText: row.work_text, strokesPath: row.strokes_path, strokes };
      }));
    },

    // #249: one database function (migration add_answer_change) checks the section's guards and overwrites the row in
    // one transaction, and returns the work it replaced; null when a guard failed. #253: it also refuses a stage 1
    // answer once a route is stored (migration add_stage1_lock). D-145 (migration remove_extra_round_functions): it has
    // no guard on the removed extra round any more, never changes the round's answers, and does not count them as newer
    // answers.
    async changeAnswer(id, { position, questionId, response, correct, misconception, timeMs, answeredAt, events, work }, unansweredFrom) {
      const { answered_at, answer_changes, read_aloud_count, read_aloud_at_ms, away_count, away_ms } = timelineColumns({ shownAt: null, answeredAt, events });
      const answer = {
        p_assessment: id,
        p_position: position,
        p_question_id: questionId,
        p_unanswered_from: unansweredFrom,
        p_response: response,
        p_correct: correct,
        p_misconception: misconception,
        p_time_ms: timeMs,
        p_answered_at: answered_at,
        p_answer_changes: toJson(answer_changes),
        p_read_aloud_count: read_aloud_count,
        p_read_aloud_at_ms: read_aloud_at_ms,
        p_away_count: away_count,
        p_away_ms: away_ms,
      };
      // #252: typed working alone (migration change_answer_keep_drawing): the drawing and strokes paths are read under
      // the test's row lock and kept, then change_answer runs with its guards.
      // Each function answers jsonb: the work it replaced, or null when a guard failed. Each answer is read on its own,
      // so a change of either function's answer type fails the build.
      type Replaced = { work_path: string | null; strokes_path: string | null } | null;
      let replaced: Replaced;
      if (work?.keepDrawing) {
        const { data, error } = await admin.rpc("change_answer_keep_drawing", { ...answer, p_work_text: work.workText });
        if (error) throw new StoreError("answer change failed", error.message);
        replaced = data as Replaced;
      } else {
        const { data, error } = await admin.rpc("change_answer", {
          ...answer,
          p_work_changed: work !== undefined,
          p_work_path: work?.workPath ?? null,
          p_work_text: work?.workText ?? null,
          p_strokes_path: work?.strokesPath ?? null,
        });
        if (error) throw new StoreError("answer change failed", error.message);
        replaced = data as Replaced;
      }
      return replaced ? { workPath: replaced.work_path, strokesPath: replaced.strokes_path } : "closed";
    },

    // #253: one database function (migration add_stage1_lock) takes the test's row lock, as change_answer does, checks
    // that no route is stored and that the stage 1 answers are the ones the route was set from, and stores the route.
    async lockStage1(id, { route, answers }) {
      const { data, error } = await admin.rpc("lock_stage1", {
        p_assessment: id,
        p_route: route,
        p_answers: answers.map((a) => [a.questionId, a.response]),
      });
      if (error) throw new StoreError("route save failed", error.message);
      const answer: string = data;
      if (answer === "changed" || answer === "closed" || answer === "up" || answer === "stay" || answer === "down") return answer;
      throw new StoreError("route save failed", `unexpected answer ${JSON.stringify(answer)}`);
    },

    // #249: one database function (migration add_guarded_finish) takes the test's row lock, as change_answer does,
    // checks that the stored answers are the scored ones, and completes the test; "changed" when an answer changed.
    async complete(id, { at, placement, help, answers }) {
      const { data, error } = await admin.rpc("complete_test", {
        p_assessment: id,
        p_completed_at: iso(at),
        p_placement: toJson(placement),
        p_help: help,
        p_answers: answers.map((a) => [a.questionId, a.response, a.timeMs]),
      });
      if (error) throw new StoreError("finish failed", error.message);
      const answer: string = data;
      return answer === "changed" ? "changed" : "done";
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
        .select("id").single();
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
function factsStore(admin: SupabaseClient<Database>): FactsStore {
  return {
    async loadFacts(id) {
      const { data: row, error } = await admin.from("assessment_facts").select("started_at, test").eq("assessment_id", id)
        .maybeSingle();
      if (error) throw new StoreError("load failed", error.message);
      if (!row) return null;
      const { data: answers, error: answersError } = await admin.from("fact_answers").select("fact_id, response, at_ms, browser_ms")
        .eq("assessment_id", id).order("position");
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
function shownStore(admin: SupabaseClient<Database>): ShownStore {
  return {
    async recordShown(id, { position, questionId, at }) {
      // The first serve wins: a later serve of the same place is ignored (on conflict do nothing).
      const { error } = await admin.from("question_shows")
        .upsert({ assessment_id: id, position, question_id: questionId, shown_at: iso(at) }, { onConflict: "assessment_id,position", ignoreDuplicates: true });
      if (error) throw new StoreError("shown time save failed", error.message);
    },

    async shownAt(id, position) {
      const { data, error } = await admin.from("question_shows").select("question_id, shown_at")
        .eq("assessment_id", id).eq("position", position).maybeSingle();
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

/** The answer timeline's event columns of public.answers (#184), as stored. */
interface EventColumns {
  answer_changes: AnswerEvents["changes"] | null;
  read_aloud_count: number | null;
  read_aloud_at_ms: number[] | null;
  away_count: number | null;
  away_ms: number | null;
}

/** #249: the events of a stored answer; null when it has none (an answer stored before #184, or sent without them). */
function eventsOf(row: EventColumns): AnswerEvents | null {
  const { answer_changes, read_aloud_count, read_aloud_at_ms, away_count, away_ms } = row;
  if (answer_changes === null || read_aloud_count === null || read_aloud_at_ms === null || away_count === null || away_ms === null) return null;
  return { changes: answer_changes, readAloud: { count: read_aloud_count, atMs: read_aloud_at_ms }, away: { count: away_count, ms: away_ms } };
}

/**
 * The store's operations for the test context (#185): columns of public.assessments. Each update is guarded in the
 * update itself: only an eligible status/deadline, and only fields still empty, so two requests at once (or a resume on another
 * device) cannot overwrite the first record. The module calls them only for a test that `load` found for the parent.
 */
function contextStore(admin: SupabaseClient<Database>): ContextStore {
  return {
    async recordDevice(id, device) {
      const { error } = await admin.from("assessments").update({ device })
        .eq("id", id).eq("status", "in_progress").is("device", null);
      if (error) throw new StoreError("device save failed", error.message);
    },

    async startBreak(id, at) {
      const { error } = await admin.from("assessments").update({ break_started_at: iso(at) })
        .eq("id", id).eq("status", "in_progress").gte("resume_until", iso(at)).is("break_started_at", null);
      if (error) throw new StoreError("break save failed", error.message);
    },

    async endBreak(id, { at, skipped, lengthMs }) {
      const ended = { break_ended_at: iso(at), break_skipped: skipped, break_ms: lengthMs };
      // Two rounds: "shown" can land between the two updates, and then the first one takes the end.
      for (let round = 0; round < 2; round++) {
        // The usual order: the break has its start.
        const after = await admin.from("assessments").update(ended)
          .eq("id", id).in("status", ["in_progress", "completed"]).gte("resume_until", iso(at)).not("break_started_at", "is", null).is("break_ended_at", null).select("id");
        if (after.error) throw new StoreError("break save failed", after.error.message);
        if ((after.data ?? []).length > 0) return;
        // The end reached the server first: its start is the browser's length before it.
        const first = await admin.from("assessments").update({ ...ended, break_started_at: iso(at - lengthMs) })
          .eq("id", id).in("status", ["in_progress", "completed"]).gte("resume_until", iso(at)).is("break_started_at", null).is("break_ended_at", null).select("id");
        if (first.error) throw new StoreError("break save failed", first.error.message);
        if ((first.data ?? []).length > 0) return;
      }
      // The break had ended already (or the test closed): nothing changes.
    },
  };
}

/**
 * #189: when the child's next test opens, for the report's reliability note (D-108). Null when it cannot be known (no
 * secret key, an id that is not a uuid, or a failed read): the report then shows no button and names no time.
 */
export async function parentRetakeState(parent: string, childId: string): Promise<RetakeState | null> {
  if (!isUuid(childId)) return null;
  const admin = adminClient();
  if (!admin) return null;
  return retakeState(attemptStore(admin), parent, childId, Date.now());
}
