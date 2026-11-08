import "server-only";
import { scanMarkingReader, markingCommand } from "@/lib/scan-marking-reader";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reportCallsUnreliable, type Grade, type SkillState } from "@/lib/assessment";
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
// inputs read the child, its finished tests and which have a stored learner profile, then that one profile. The skill
// states read every finished test's stored profile whose report exists (with its reliability note), the latest shipped
// workbook's standards and the whole history, page by page. A save with history rows goes through the service function save_child_profile_and_skill_changes_from_tests
// (migration child_profile_skill_changes_from_tests): the profile and its rows in one transaction, with the same answers as
// a plain save, and null ("changed") when a test the rows came from no longer exists.
// Tests use src/lib/child-profile-memory.ts.

const message = (error: { message: string }) => error.message;

/** One page of the history. PostgREST may answer with fewer and no error, so only an empty page ends the read. */
const HISTORY_PAGE = 1000;

export function childProfileStore(admin: SupabaseClient<Database>): ChildProfileStore {
  async function testExists(id: string) {
    const { data, error } = await admin.from("assessments").select("id").eq("id", id).maybeSingle();
    if (error) throw new Error(`child profile test check: ${message(error)}`);
    return data !== null;
  }
  async function historyOf(childId: string) {
    const rows: { standard: string; state: SkillState }[] = [];
    // After the last id, not by offset: the table only grows, and no row can move between pages.
    for (let after = 0; ;) {
      const { data, error } = await admin.from("skill_state_history").select("id, standard, state").eq("child_id", childId).gt("id", after).order("id", { ascending: true }).limit(HISTORY_PAGE);
      if (error) throw new Error(`skill state history load: ${message(error)}`);
      if (data.length === 0) return rows;
      rows.push(...data.map((r) => ({ standard: r.standard, state: r.state })));
      after = data[data.length - 1].id;
    }
  }
  return {
    async marks(childId) {
      const owner = await admin.from("children").select("parent_id").eq("id", childId).maybeSingle();
      if (owner.error || !owner.data) throw new Error("marking_profile_owner");
      const parent = owner.data.parent_id, command = markingCommand(admin), store = scanMarkingReader(admin);
      for (let attempt = 0; attempt < 3; attempt++) {
        const revision = await command("revision", parent, null, null, { child: childId });
        if (typeof revision !== "number") throw new Error("marking_profile_revision");
        const items = await store.effective(parent, childId);
        if (await command("revision", parent, null, null, { child: childId }) === revision) return { revision, items };
      }
      throw new Error("marking_profile_changed");
    },
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
    async save({ childId, parentId, assessmentId, profile, skillChanges, markingRevision, skillStatesPending }, expected, signal) {
      /** What a write's error means for this save; throws when it is none of them. */
      const refusal = async (error: { code: string; message: string }): Promise<"changed" | { refused: string }> => {
        // 23505: another build stored the first revision; 23503 on the test's key: the test was deleted since the
        // inputs were read; 23503 on the child's key: the child is not under that parent.
        if (error.code === "23505" || (error.code === "23503" && error.message.includes("child_profiles_assessment_id_child_id_fkey"))) return "changed";
        // 55000 family_scope for a test that no longer exists: deleted since the inputs were read.
        if (error.code === "55000" && error.message.includes("family_scope") && assessmentId && !(await testExists(assessmentId))) return "changed";
        if (error.code === "23503" || error.code === "55000") return { refused: error.message };
        throw new Error(`child profile save: ${message(error)}`);
      };
      if (markingRevision !== undefined) {
        const call = admin.rpc("save_marked_child_profile", {
          p_child: childId, p_parent: parentId, p_marking_revision: markingRevision, p_assessment: assessmentId,
          p_expected: expected?.buildToken ?? null, p_schema_version: profile.schemaVersion, p_profile: toJson(profile),
          p_changes: toJson({ pending: skillStatesPending ?? false, rows: (skillChanges?.rows ?? []).map((c) => ({ standard: c.standard, state: c.state, reason: c.reason, evidence: c.evidence, evidence_at: c.evidenceAt })) }),
          p_tests: [...(skillChanges?.tests ?? [])],
        });
        const { data, error } = await (signal ? call.abortSignal(signal) : call);
        if (error) return refusal(error);
        if (data === null) return "changed";
        const row: unknown = data;
        if (!row || typeof row !== "object" || !("revision" in row) || !("build_token" in row) || typeof row.revision !== "number" || typeof row.build_token !== "string") throw new Error("marking_profile_save");
        return { revision: row.revision, buildToken: row.build_token };
      }
      if (skillChanges?.rows.length) {
        const { data, error } = await admin.rpc("save_child_profile_and_skill_changes_from_tests", {
          p_child: childId, p_parent: parentId, p_assessment: assessmentId, p_expected: expected?.buildToken ?? null,
          p_schema_version: profile.schemaVersion, p_profile: toJson(profile),
          p_changes: toJson(skillChanges.rows.map((c) => ({ standard: c.standard, state: c.state, reason: c.reason, evidence: c.evidence, evidence_at: c.evidenceAt }))),
          p_tests: [...skillChanges.tests],
        });
        if (error) return refusal(error);
        // The function answers null when another build is stored or a test is gone; the generated types do not say so.
        if (data === null) return "changed";
        const stored = data as { revision: number; build_token: string };
        return { revision: stored.revision, buildToken: stored.build_token };
      }
      const row = {
        parent_id: parentId, assessment_id: assessmentId, revision: (expected?.revision ?? 0) + 1, build_token: crypto.randomUUID(),
        schema_version: profile.schemaVersion, profile: toJson(profile), built_at: new Date().toISOString(),
      };
      const write = expected === null
        ? admin.from("child_profiles").insert({ ...row, child_id: childId }).select("revision, build_token")
        : admin.from("child_profiles").update(row).eq("child_id", childId).eq("build_token", expected.buildToken).select("revision, build_token");
      // The findings' deadline aborts the request (review R355-2).
      const { data, error } = await (signal ? write.abortSignal(signal) : write);
      if (error) return refusal(error);
      return data.length > 0 ? { revision: data[0].revision, buildToken: data[0].build_token } : "changed";
    },
    async skillInputs(childId) {
      const [tests, profiles, reports, book, history] = await Promise.all([
        admin.from("assessments").select("id, completed_at").eq("child_id", childId).eq("status", "completed"),
        admin.from("learner_profiles").select("assessment_id, profile").eq("child_id", childId),
        admin.from("reports").select("assessment_id, reliability:model->reliability").eq("child_id", childId),
        admin.from("workbooks").select("id").eq("child_id", childId).eq("status", "shipped").order("number", { ascending: false }).limit(1).maybeSingle(),
        historyOf(childId),
      ]);
      for (const [read, r] of [["tests", tests], ["learner profiles", profiles], ["reports", reports], ["workbook", book]] as const) {
        if (r.error) throw new Error(`skill state ${read} load: ${message(r.error)}`);
      }
      const finished = new Map((tests.data ?? []).flatMap((t) => (t.completed_at ? [[t.id, new Date(t.completed_at).toISOString()] as const] : [])));
      // A test with no report yet has unknown reliability: it is no evidence until its report exists (the report job
      // rebuilds the profile when it finishes).
      const reported = new Set((reports.data ?? []).map((r) => r.assessment_id));
      const unreliable = new Set((reports.data ?? []).filter(reportCallsUnreliable).map((r) => r.assessment_id));
      let workbookStandards: string[] = [];
      if (book.data) {
        const questions = await admin.from("workbook_questions").select("standard:package->skill->>standard").eq("workbook_id", book.data.id);
        if (questions.error) throw new Error(`skill state workbook questions load: ${message(questions.error)}`);
        workbookStandards = [...new Set(questions.data.flatMap((q) => q.standard ?? []))];
      }
      return {
        tests: (profiles.data ?? []).flatMap((p) => {
          const completedAt = finished.get(p.assessment_id);
          return completedAt && reported.has(p.assessment_id) ? [{ assessmentId: p.assessment_id, completedAt, profile: p.profile, unreliable: unreliable.has(p.assessment_id) }] : [];
        }),
        workbookStandards,
        history,
      };
    },
  };
}
