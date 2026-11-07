import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { answersAddUp, reportShowsPlacement } from "@/lib/area-level-check";
import { fromRemovedRound, profileSkillResults, reportCallsUnreliable, restoreSession, testAreaAnswers, type AreaAnswer, type Grade } from "@/lib/assessment";
import type { Database } from "@/lib/database";
import { LEARNING_COLUMNS } from "@/lib/learning-style";
import { childPauseMailing } from "@/lib/plan-controls-server";
import type { ParentViewReader } from "@/lib/parent-view";
import { pinIsSet } from "@/lib/parent-pin-server";
import { scanPagesAccess } from "@/lib/scan-pages-access";
import { withAnswers } from "@/lib/test-attempt";
import { attemptStore } from "@/lib/test-attempt-server";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";

// The parent view module's Supabase reader (src/lib/parent-view.ts).
//   - The parent's session reads children, reports, card_setups, workbook_delivery_receipts and workbooks: row-level
//     security returns only the family's rows, and only shipped workbooks.
//   - The secret key, filtered on the signed-in parent's id, reads the tests: whether every answer of an open test is in
//     needs the stored test and the answers, which a parent may not read. This is the read the start screen uses.
//     It also reads test_accounts for the Maya switch; child_plan_states, which a parent may not read (#548): a child
//     with no row reads as `unknown`, and a load of the Account tab fills the row (src/lib/billing.ts); and the dispatch
//     emails' delivery details (carrier and tracking, #558), which only admins may read in workbook_emails; it selects
//     only the child, the workbook number and the delivery. Nothing it reads reaches the output except through
//     parent-view.ts, which checks the delivery.
// The Overview (#560): the scored answers of a finished test need the stored test, which only the secret key reads,
// filtered on the parent's id (the test attempt store's `load`, as the start screen reads an open test); the report's level
// comes from the parent's session. The scans, the pages of a shipped workbook and the learning card come from the session.
// The test is replayed by the assessment core (restoreSession, testAreaAnswers), as `npm run area-levels:check` does, and
// compared with the stored score with the same check, and the stored score with the stored report: a replay that differs
// from either gives no answers, so no bars. A test scored again after its report was made keeps the report's level and
// shows no bars, as the bars would rest on the new score.
// The monthly summary (#562) counts Maya calls in the minutes ledger (maya_minute_grants, which a parent reads): the
// database counts one child's calls that used time in the month, so no row leaves it and no page of rows can hide one.
// The Progress tab (#561): the skill states read each finished test's stored learner profile with the secret key, filtered
// on the parent and the child; only each standard's tally leaves this read (profileSkillResults), with whether the test's
// stored report calls it unreliable (only the report's reliability note is read, not its model). A test with no report
// yet gives no tally. A shipped workbook's
// standards come from the session; only the code in each question package leaves that read.
// A database error throws, and so does a missing secret key: an empty read would show a paying family "Start the test".

/** The reader of this parent, from their session and the secret key. */
export function parentViewReader(session: SupabaseClient<Database>, parent: string, admin: SupabaseClient<Database> | null, env: Readonly<Record<string, string | undefined>> = process.env): ParentViewReader {
  return {
    async children() {
      const { data, error } = await session.from("children").select("id, first_name, grade, province").order("created_at").order("id");
      if (error) throw new Error(`children read: ${error.message}`);
      // A check constraint limits grade to 0-9.
      return data.map((c) => ({ id: c.id, firstName: c.first_name, grade: c.grade as Grade, province: c.province }));
    },
    async tests() {
      if (!admin) throw new Error("tests read: no secret key");
      return withAnswers(attemptStore(admin), parent);
    },
    async reports() {
      const { data, error } = await session.from("reports").select("id, child_id, assessment_id, assessment:assessments!inner(province)");
      if (error) throw new Error(`reports read: ${error.message}`);
      return data.map((r) => ({ id: r.id, childId: r.child_id, assessmentId: r.assessment_id, curriculum: r.assessment.province }));
    },
    async cardsSaved() {
      const { data, error } = await session.from("card_setups").select("child_id").not("card_saved_at", "is", null);
      if (error) throw new Error(`cards read: ${error.message}`);
      return data.map((c) => ({ childId: c.child_id }));
    },
    async deliveries() {
      const { data, error } = await session.from("workbook_delivery_receipts").select("child_id, workbook_id, delivered_at");
      if (error) throw new Error(`deliveries read: ${error.message}`);
      return data.map((d) => ({ childId: d.child_id, workbookId: d.workbook_id, deliveredAt: d.delivered_at }));
    },
    async deliveryCorrections() {
      const { data, error } = await session.from("workbook_delivery_corrections").select("workbook_id, delivered_at, audit_id");
      if (error) throw new Error(`corrections read: ${error.message}`);
      return data.map((c) => ({ workbookId: c.workbook_id, deliveredAt: c.delivered_at, auditId: c.audit_id }));
    },
    async shippedWorkbooks() {
      const { data, error } = await session.from("workbooks").select("id, child_id, number, shipped_at").eq("status", "shipped");
      if (error) throw new Error(`workbooks read: ${error.message}`);
      return data.map((w) => ({ id: w.id, childId: w.child_id, number: w.number, shippedAt: w.shipped_at }));
    },
    async pauseWeeks(child, number) {
      if (!admin) throw new Error("pause read: no secret key");
      return childPauseMailing(admin, parent, child, number);
    },
    async dispatches() {
      if (!admin) throw new Error("dispatches read: no secret key");
      const { data, error } = await admin.from("workbook_emails").select("child_id, workbook_number, delivery").eq("parent_id", parent).eq("kind", "dispatch");
      if (error) throw new Error(`dispatches read: ${error.message}`);
      return data.map((d) => ({ childId: d.child_id, number: d.workbook_number, delivery: d.delivery }));
    },
    async family() {
      const { data, error } = await session.from("parents").select("time_zone, postal").maybeSingle();
      if (error) throw new Error(`family read: ${error.message}`);
      return { timeZone: data?.time_zone ?? null, postal: data?.postal ?? null };
    },
    async plans() {
      if (!admin) throw new Error("plans read: no secret key");
      const { data, error } = await admin.from("child_plan_states").select("child_id, kind").eq("parent_id", parent);
      if (error) throw new Error(`plans read: ${error.message}`);
      return data.map((p) => ({ childId: p.child_id, kind: p.kind }));
    },
    async testResult(assessmentId) {
      if (!admin) throw new Error("test result read: no secret key");
      const [loaded, report, stored] = await Promise.all([
        attemptStore(admin).load(parent, assessmentId),
        session.from("reports").select("model").eq("assessment_id", assessmentId).maybeSingle(),
        admin.from("assessments").select("placement").eq("id", assessmentId).eq("parent_id", parent).maybeSingle(),
      ]);
      if (report.error) throw new Error(`report read: ${report.error.message}`);
      if (stored.error) throw new Error(`stored score read: ${stored.error.message}`);
      if (!loaded || !report.data) return null;
      let answers: AreaAnswer[] | null = null;
      try {
        // D-145: the removed extra round's answers are left out, as the test attempt module leaves them out.
        const replay = testAreaAnswers(restoreSession(loaded.test, loaded.answers.filter((a) => !fromRemovedRound(a.questionId)), loaded.route ?? null, loaded.stage3Route ?? null));
        // Bars that count other answers than the report did would tell a second story beside the Level tile: the replay
        // must add up to the stored score, and the stored report must show that score.
        const placement = stored.data?.placement;
        if (placement && answersAddUp(replay, placement) && reportShowsPlacement(report.data.model, placement)) answers = replay;
      } catch (e) {
        console.error("[parent-view] test replay failed", e instanceof Error ? e.message : "failed");
      }
      return { level: report.data.model.level, answers, unreliable: reportCallsUnreliable(report.data.model) };
    },
    async savedScans() {
      const { data, error } = await session.from("scan_photos").select("workbook_id, page_id, expires_at, created_at").eq("state", "saved");
      if (error) throw new Error(`scans read: ${error.message}`);
      // A saved photo always has a page (a check constraint); the workbook is the page's.
      return data.flatMap((s) => (s.workbook_id && s.page_id ? [{ workbookId: s.workbook_id, pageId: s.page_id, expiresAt: s.expires_at, takenAt: s.created_at }] : []));
    },
    async workbookPages(workbookId) {
      const { data, error } = await session.from("workbook_pages").select("id, day_label").eq("workbook_id", workbookId);
      if (error) throw new Error(`pages read: ${error.message}`);
      return data.map((p) => ({ id: p.id, dayLabel: p.day_label }));
    },
    async learningCards() {
      const { data, error } = await session.from("children").select(`id, ${LEARNING_COLUMNS}`);
      if (error) throw new Error(`learning card read: ${error.message}`);
      return data.map(({ id, ...card }) => ({ childId: id, ...card }));
    },
    async pinSet() {
      return pinIsSet(parent);
    },
    async mayaCalls(childId, from, to) {
      // The minutes ledger, which a parent reads: one grant per child call, settled with the seconds it used. Only the
      // count leaves this read; maya_calls itself stays closed to parents (#295).
      const { count, error } = await session.from("maya_minute_grants").select("child_id", { count: "exact", head: true })
        .eq("kind", "child").eq("child_id", childId).gt("used_seconds", 0)
        .gte("created_at", new Date(from).toISOString()).lt("created_at", new Date(to).toISOString());
      if (error) throw new Error(`maya calls read: ${error.message}`);
      if (count === null) throw new Error("maya calls read: no count");
      return count;
    },
    async skillTests(childId) {
      if (!admin) throw new Error("skill tests read: no secret key");
      const [tests, profiles, reports] = await Promise.all([
        admin.from("assessments").select("id, completed_at").eq("parent_id", parent).eq("child_id", childId).eq("status", "completed"),
        admin.from("learner_profiles").select("assessment_id, profile").eq("parent_id", parent).eq("child_id", childId),
        admin.from("reports").select("assessment_id, reliability:model->reliability").eq("parent_id", parent).eq("child_id", childId),
      ]);
      if (tests.error) throw new Error(`skill tests read: ${tests.error.message}`);
      if (profiles.error) throw new Error(`learner profiles read: ${profiles.error.message}`);
      if (reports.error) throw new Error(`skill reports read: ${reports.error.message}`);
      // A test with no report yet has unknown reliability: no tally of it leaves until its report exists.
      const reported = new Set(reports.data.map((r) => r.assessment_id));
      const unreliable = new Set(reports.data.filter(reportCallsUnreliable).map((r) => r.assessment_id));
      const finished = new Map(tests.data.flatMap((t) => (t.completed_at ? [[t.id, new Date(t.completed_at).toISOString()] as const] : [])));
      return profiles.data.flatMap((p) => {
        const at = finished.get(p.assessment_id);
        return at && reported.has(p.assessment_id) ? profileSkillResults(p.profile, at, unreliable.has(p.assessment_id)) : [];
      });
    },
    async workbookStandards(workbookId) {
      const { data, error } = await session.from("workbook_questions").select("standard:package->skill->>standard").eq("workbook_id", workbookId);
      if (error) throw new Error(`workbook standards read: ${error.message}`);
      return [...new Set(data.flatMap((q) => q.standard ?? []))];
    },
    async switches() {
      const [scanPages, testFamily] = await Promise.all([
        scanPagesAccess(parent, admin, env),
        admin?.from("test_accounts").select("parent_id").eq("parent_id", parent).maybeSingle(),
      ]);
      return {
        progress: env.PROGRESS_TAB_ENABLED === "on",
        // Test families only until a child can call Maya (#337), as Parent home shows the minutes today.
        maya: !testFamily?.error && testFamily?.data?.parent_id === parent,
        scanPages,
      };
    },
  };
}

/** The reader of the signed-in parent; null when no one is signed in. */
export async function signedInParentView(): Promise<ParentViewReader | null> {
  const session = await sessionClient();
  const parent = await parentId(session);
  return parent ? parentViewReader(session, parent, adminClient()) : null;
}
