import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/assessment-store";
import type { LearnerProfileStore } from "@/lib/learner-profile";
import { LEARNING_COLUMNS, fromRow, type LearningRow } from "@/lib/learning-style";

// The learner profile's store (src/lib/learner-profile.ts, #196) in Supabase, with the secret key: the service role
// writes public.learner_profiles (migration add_learner_profiles), which only admins can read. The family write fence
// refuses a profile for a family being deleted. Tests use src/lib/learner-profile-memory.ts.

export function learnerProfileStore(admin: SupabaseClient): LearnerProfileStore {
  return {
    async learning(childId) {
      if (!isUuid(childId)) return null;
      const { data, error } = await admin.from("children").select(LEARNING_COLUMNS).eq("id", childId).maybeSingle<LearningRow>();
      if (error) throw new Error(`profile learning load: ${error.message}`);
      const answers = data ? fromRow(data) : null;
      // Field by field: the free text never leaves this read.
      return answers && { styles: answers.styles, interests: answers.interests, feeling: answers.feeling, goal: answers.goal, weeklyTime: answers.weeklyTime };
    },
    async latestFinished(childId) {
      if (!isUuid(childId)) return null;
      const { data, error } = await admin.from("assessments").select("id").eq("child_id", childId).eq("status", "completed")
        .order("completed_at", { ascending: false }).limit(1).maybeSingle<{ id: string }>();
      if (error) throw new Error(`profile latest test load: ${error.message}`);
      return data?.id ?? null;
    },
    async save({ assessmentId, parentId, childId, profile }) {
      const row = {
        assessment_id: assessmentId, parent_id: parentId, child_id: childId, schema_version: profile.schemaVersion, profile,
        built_at: new Date().toISOString(),
      };
      // One profile per test: a build again replaces it (created_at stays).
      const { error } = await admin.from("learner_profiles").upsert(row, { onConflict: "assessment_id" });
      if (error) throw new Error(`profile save: ${error.message}`);
    },
  };
}
