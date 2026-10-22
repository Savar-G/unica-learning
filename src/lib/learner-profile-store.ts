import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toJson, type Database } from "@/lib/database";
import { isUuid } from "@/lib/assessment-store";
import type { LearnerProfileStore } from "@/lib/learner-profile";
import { LEARNING_COLUMNS, fromRow } from "@/lib/learning-style";

// The learner profile's store (src/lib/learner-profile.ts, #196) in Supabase, with the secret key: the service role
// writes public.learner_profiles (migration add_learner_profiles), which only admins can read. The family write fence
// refuses a profile for a family being deleted. Tests use src/lib/learner-profile-memory.ts.
// Each save gives the build a random id, kept in the profile JSON as `buildId`: the AI parts' save (#197) is an update
// filtered on it, so it changes the row only while the row still holds that build. No migration: built_at stays the
// build's time, as a timestamp is not an id (two builds can share a millisecond).

export function learnerProfileStore(admin: SupabaseClient<Database>): LearnerProfileStore {
  return {
    async learning(childId) {
      if (!isUuid(childId)) return null;
      const { data, error } = await admin.from("children").select(LEARNING_COLUMNS).eq("id", childId).maybeSingle();
      if (error) throw new Error(`profile learning load: ${error.message}`);
      const answers = data ? fromRow(data) : null;
      // Field by field: the free text never leaves this read.
      return answers && { styles: answers.styles, interests: answers.interests, feeling: answers.feeling, goal: answers.goal, weeklyTime: answers.weeklyTime };
    },
    async latestFinished(childId) {
      if (!isUuid(childId)) return null;
      const { data, error } = await admin.from("assessments").select("id").eq("child_id", childId).eq("status", "completed")
        .order("completed_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(`profile latest test load: ${error.message}`);
      return data?.id ?? null;
    },
    async save({ assessmentId, parentId, childId, profile }) {
      const buildId = randomUUID();
      const row = {
        assessment_id: assessmentId, parent_id: parentId, child_id: childId, schema_version: profile.schemaVersion, profile: toJson({ ...profile, buildId }),
        built_at: new Date().toISOString(),
      };
      // One profile per test: a build again replaces it (created_at stays).
      const { error } = await admin.from("learner_profiles").upsert(row, { onConflict: "assessment_id" });
      if (error) throw new Error(`profile save: ${error.message}`);
      return buildId;
    },
    async saveAi({ assessmentId, profile }, buildId) {
      // Compare and set: only the row that still holds this build. built_at stays: the AI parts are the same build's.
      const { data, error } = await admin.from("learner_profiles")
        .update({ schema_version: profile.schemaVersion, profile: toJson({ ...profile, buildId }) })
        .eq("assessment_id", assessmentId).eq("profile->>buildId", buildId)
        .select("assessment_id");
      if (error) throw new Error(`profile AI save: ${error.message}`);
      return data.length > 0;
    },
  };
}
