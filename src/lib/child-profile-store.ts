import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Grade } from "@/lib/assessment";
import type { ChildProfileStore } from "@/lib/child-profile";
import { toJson, type Database } from "@/lib/database";
import { LEARNING_COLUMNS, fromRow } from "@/lib/learning-style";

// The child profile's store (src/lib/child-profile.ts, #303) in Supabase, with the secret key: the service role may
// only read, insert and update public.child_profiles (migration add_child_profiles); admins read it; parents read
// nothing. Each save stores a new random build token (migration child_profile_build_token). The first save is an
// insert (a second first save fails on the primary key: 23505); each later save is an update filtered on the build
// token it expects, so it changes the row only while the row still holds that build, also after a deletion and a new
// first build (review R345-2). The family write fence trigger runs before the keys: 55000 family_unavailable refuses a
// save; 55000 family_scope refuses one on another family's test, but for a test that no longer exists it means the test
// was deleted after the inputs were read, so the rebuild builds again (review R345-1). The foreign key to the child
// under its parent (23503) refuses a save; the one to the test (23503 too) means the test is gone: build again. The
// inputs read the child, its finished tests and which have a stored learner profile, then that one profile. Tests use
// src/lib/child-profile-memory.ts.

const message = (error: { message: string }) => error.message;

export function childProfileStore(admin: SupabaseClient<Database>): ChildProfileStore {
  async function testExists(id: string) {
    const { data, error } = await admin.from("assessments").select("id").eq("id", id).maybeSingle();
    if (error) throw new Error(`child profile test check: ${message(error)}`);
    return data !== null;
  }
  return {
    async current(childId) {
      const { data, error } = await admin.from("child_profiles").select("revision, build_token, built_at, schema_version, profile").eq("child_id", childId).maybeSingle();
      if (error) throw new Error(`child profile load: ${message(error)}`);
      return data && { revision: data.revision, buildToken: data.build_token, builtAt: new Date(data.built_at).toISOString(), schemaVersion: data.schema_version, profile: data.profile };
    },
    async inputs(childId) {
      const [child, tests, profiles] = await Promise.all([
        admin.from("children").select(`parent_id, grade, ${LEARNING_COLUMNS}`).eq("id", childId).maybeSingle(),
        admin.from("assessments").select("id, completed_at").eq("child_id", childId).eq("status", "completed"),
        admin.from("learner_profiles").select("assessment_id").eq("child_id", childId),
      ]);
      for (const [read, r] of [["child", child], ["tests", tests], ["learner profiles", profiles]] as const) {
        if (r.error) throw new Error(`child profile ${read} load: ${message(r.error)}`);
      }
      if (!child.data) return null;
      const stored = new Set((profiles.data ?? []).map((p) => p.assessment_id));
      // The test that finished last among those with a stored profile.
      const latest = (tests.data ?? []).filter((t) => stored.has(t.id) && t.completed_at)
        .sort((a, b) => Date.parse(b.completed_at!) - Date.parse(a.completed_at!))[0];
      let profile: unknown = undefined;
      if (latest) {
        const one = await admin.from("learner_profiles").select("profile").eq("assessment_id", latest.id).maybeSingle();
        if (one.error) throw new Error(`child profile learner profile load: ${message(one.error)}`);
        profile = one.data?.profile;
      }
      const buildId = (profile as { buildId?: unknown } | undefined)?.buildId;
      const answers = fromRow(child.data);
      return {
        parentId: child.data.parent_id,
        grade: child.data.grade as Grade,
        // Field by field: the free text never leaves this read.
        learning: answers && { styles: answers.styles, interests: answers.interests, feeling: answers.feeling, goal: answers.goal, weeklyTime: answers.weeklyTime },
        assessment: latest ? { assessmentId: latest.id, completedAt: new Date(latest.completed_at!).toISOString(), buildId: typeof buildId === "string" ? buildId : null, profile } : null,
      };
    },
    async save({ childId, parentId, assessmentId, profile }, expected) {
      const row = {
        parent_id: parentId, assessment_id: assessmentId, revision: (expected?.revision ?? 0) + 1, build_token: crypto.randomUUID(),
        schema_version: profile.schemaVersion, profile: toJson(profile), built_at: new Date().toISOString(),
      };
      const { data, error } = expected === null
        ? await admin.from("child_profiles").insert({ ...row, child_id: childId }).select("revision, build_token")
        : await admin.from("child_profiles").update(row).eq("child_id", childId).eq("build_token", expected.buildToken).select("revision, build_token");
      if (error) {
        // 23505: another build stored the first revision; 23503 on the test's key: the test was deleted since the
        // inputs were read; 23503 on the child's key: the child is not under that parent.
        if (error.code === "23505" || (error.code === "23503" && error.message.includes("child_profiles_assessment_id_child_id_fkey"))) return "changed";
        // 55000 family_scope for a test that no longer exists: deleted since the inputs were read.
        if (error.code === "55000" && error.message.includes("family_scope") && assessmentId && !(await testExists(assessmentId))) return "changed";
        if (error.code === "23503" || error.code === "55000") return { refused: error.message };
        throw new Error(`child profile save: ${message(error)}`);
      }
      return data.length > 0 ? { revision: data[0].revision, buildToken: data[0].build_token } : "changed";
    },
  };
}
