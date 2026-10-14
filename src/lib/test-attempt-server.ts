import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Grade, StartState, StoredTest } from "@/lib/assessment";
import type { Child } from "@/lib/account";
import { ATTEMPT_COLUMNS, isUuid, toAttempt, type AttemptRow } from "@/lib/assessment-store";
import { startStates, StoreError, type AttemptStore } from "@/lib/test-attempt";
import { adminClient } from "@/lib/supabase-auth";

// The test attempt module's Supabase store (src/lib/test-attempt.ts, #146): the database, read and written with the
// secret key. Every read is filtered by the parent the route passes (from their verified session), so a parent never
// reaches another family's test. The guards are the database's: the unique index assessments_one_open_per_child (one
// open test per child), and updates guarded in the update itself, so two requests at once cannot both win.

const iso = (ms: number) => new Date(ms).toISOString();

export function attemptStore(admin: SupabaseClient): AttemptStore {
  return {
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
