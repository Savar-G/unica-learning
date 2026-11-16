import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { answersAddUp, reportShowsPlacement } from "@/lib/area-level-check";
import { BC_SKILL_MAP, REPORTED_STRAND, profileSkillResults, reportCallsUnreliable, restoreSession, testAreaAnswers, type AreaAnswer, type Grade } from "@/lib/assessment";
import type { Database } from "@/lib/database";
import { LEARNING_COLUMNS } from "@/lib/learning-style";
import { chatFamilyGate } from "@/lib/maya-chat";
import { childPauseMailing } from "@/lib/plan-controls-server";
import { dayNumber } from "@/lib/parent-week";
import { readScheduleTopics } from "@/lib/parent-schedule";
import { parentScheduleStore } from "@/lib/parent-schedule-store";
import type { ParentViewReader } from "@/lib/parent-view";
import type { StateChange } from "@/lib/progress-series";
import { pinIsSet } from "@/lib/parent-pin-server";
import { familyOpenPlanChildren } from "@/lib/plan-access";
import { scanMarkingReader, markingCommand } from "@/lib/scan-marking-reader";
import { effectiveHelpMarks, effectiveSkillMarks } from "@/lib/scan-marking";
import { itemKey, markingEvent } from "@/lib/scan-observation";
import { scanReleased } from "@/lib/scan-pages-access";
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
// The monthly summary (#562) counts the child's Maya chats with the secret key, filtered on the parent and the child
// (maya_calls stays closed to parents, #295): a chat counts when it ended in the month and the child sent Maya at least
// one message. The database counts them, so no row leaves it and no page of rows can hide one.
// The Progress tab (#561): the skill states read each finished test's stored learner profile with the secret key, filtered
// on the parent and the child; only each standard's tally leaves this read (profileSkillResults), with whether the test's
// stored report calls it unreliable (only the report's reliability note is read, not its model). A test with no report
// yet gives no tally. A shipped workbook's
// standards come from the session; only the code in each question package leaves that read.
// The Home's and Progress tab's dates and line (#1003, #1004) read `skill_state_history` the same way (`skillHistory`):
// the secret key, filtered on the parent and the child; only the standard, the state and `changed_at` leave.
// A database error throws, and so does a missing secret key: an empty read would show a paying family "Start the test".

/** The reader of this parent, from their session and the secret key. */
/** The skill standard of each question of the named workbooks, by `<workbook>:<page>:<number>:<question id>`. */
async function markedQuestions(admin: SupabaseClient<Database>, parent: string, workbooks: readonly string[]): Promise<Map<string, string>> {
  const questions = new Map<string, string>();
  for (const book of workbooks) {
    for (let after: string | null = null; ;) {
      let query = admin.from("workbook_questions").select("id, page_id, question_number, qid:package->>id, standard:package->skill->>standard")
        .eq("parent_id", parent).eq("workbook_id", book).order("id").limit(1000);
      if (after !== null) query = query.gt("id", after);
      const rows = await query;
      if (rows.error) throw new Error("overview questions read failed");
      if (!rows.data.length) break;
      for (const row of rows.data) if (row.qid && row.standard) questions.set(`${book}:${row.page_id}:${row.question_number}:${row.qid}`, row.standard);
      after = rows.data[rows.data.length - 1].id;
    }
  }
  return questions;
}

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
        const replay = testAreaAnswers(restoreSession(loaded.test, loaded.answers, loaded.route ?? null, loaded.stage3Route ?? null));
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
      if (!admin) throw new Error("maya calls read: no secret key");
      // A family chat (never an admin test call) that ended in the window, with at least one message from the child.
      // child_turns is written when the call ends. Only the count leaves this read.
      const { count, error } = await admin.from("maya_calls").select("id", { count: "exact", head: true })
        .eq("parent_id", parent).eq("child_id", childId).eq("kind", "chat").eq("status", "ended").gt("child_turns", 0)
        .gte("ended_at", new Date(from).toISOString()).lt("ended_at", new Date(to).toISOString());
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
    async overviewProgress(childId) {
      if (!admin) throw new Error("overview progress: no secret key");
      const owner = await session.from("children").select("id").eq("id", childId).maybeSingle();
      if (owner.error) throw new Error("overview progress owner read failed");
      if (!owner.data) return null;
      const command = markingCommand(admin);
      const reads = scanMarkingReader(admin);
      // One consistent moment: the marking revision is the same before and after the reads. A marking ack or a correction
      // in between makes it read again, three times at most, as the profile rebuild does.
      for (let attempt = 0; attempt < 3; attempt++) {
        const revision = await command("revision", parent, null, null, { child: childId });
        if (typeof revision !== "number") throw new Error("overview marking revision unavailable");
        const [items, books] = await Promise.all([
          reads.effective(parent, childId),
          session.from("workbooks").select("id, printed_revision").eq("child_id", childId).eq("status", "shipped"),
        ]);
        if (books.error) throw new Error("overview progress read failed");
        const shipped = new Map(books.data.map((book) => [book.id, book.printed_revision]));
        // Only an eligible original of a shipped page of its current print revision counts in the bars.
        const originals = items.flatMap((item) => {
          const id = item.expected.identity, decision = markingEvent(item.expected, item.observation);
          const counts = shipped.has(id.workbookId) && shipped.get(id.workbookId) === id.printedRevision && item.originalEvent && item.eventId && decision.publish;
          return counts ? [{ item, event: item.originalEvent!, right: decision.result === "right" }] : [];
        });
        const questions = await markedQuestions(admin, parent, [...new Set(originals.map(({ item }) => item.expected.identity.workbookId))]);
        const standards = new Map(BC_SKILL_MAP.standards.map((standard) => [standard.code, standard]));
        const seen = new Set<string>();
        const marks: AreaAnswer[] = [];
        for (const { item, event, right } of originals) {
          const id = item.expected.identity;
          const key = itemKey(id);
          if (seen.has(key)) throw new Error("duplicate original result");
          seen.add(key);
          const standard = standards.get(questions.get(`${id.workbookId}:${id.pageId}:${item.expected.number}:${id.itemId}`) ?? "");
          if (!standard) continue;
          if (event.parentId !== parent || event.childId !== childId || event.source !== "marking" ||
              event.key !== `marking:${createHash("sha256").update(key, "utf8").digest("hex")}` ||
              event.question.source !== "workbook" || event.question.workbookId !== id.workbookId ||
              event.question.question !== item.expected.number || event.skill.standard !== standard.code) throw new Error("overview mark source mismatch");
          marks.push({ area: REPORTED_STRAND[standard.strand], level: standard.grade, correct: right });
        }
        if (await command("revision", parent, null, null, { child: childId }) !== revision) continue;
        // The workbook day of each marked page ("Day N"), for the repeated-mistake count. A failed read leaves the days out and
        // nothing else: only the "one to watch" sentence then has nothing to count.
        const labels = new Map<string, string | null>();
        const markedBooks = [...new Set(items.map((item) => item.expected.identity.workbookId))];
        const pageRows = await Promise.all(markedBooks.map((id) => session.from("workbook_pages").select("id, day_label").eq("workbook_id", id)));
        pageRows.forEach((rows, i) => {
          if (rows.error) console.error("[parent-view] page day labels read failed");
          else for (const row of rows.data) labels.set(`${markedBooks[i]}:${row.id}`, row.day_label);
        });
        const dayOf = (workbookId: string, pageId: string) => {
          const day = dayNumber(labels.get(`${workbookId}:${pageId}`) ?? null);
          return day === null ? null : `${workbookId}:${day}`;
        };
        return { marks, skillMarks: effectiveSkillMarks(items), helpMarks: effectiveHelpMarks(items, dayOf) };
      }
      throw new Error("overview progress changed");
    },
    async workbookStandards(workbookId) {
      const { data, error } = await session.from("workbook_questions").select("standard:package->skill->>standard").eq("workbook_id", workbookId);
      if (error) throw new Error(`workbook standards read: ${error.message}`);
      return [...new Set(data.flatMap((q) => q.standard ?? []))];
    },
    async workbookQuestions(workbookId) {
      const { data, error } = await session.from("workbook_questions").select("page_id, standard:package->skill->>standard").eq("workbook_id", workbookId)
        .order("page_id").order("question_number").limit(2000);
      if (error) throw new Error(`workbook questions read: ${error.message}`);
      return data.map((q) => ({ pageId: q.page_id, standard: q.standard }));
    },
    async planTopics(childId, workbookId) {
      // Share the Workbooks tab's frozen-plan validation, without its scan receipts or marks. One deadline covers
      // every request, including ownership checks. Missing, invalid or slow plans leave Home's question fallback.
      if (!admin) return null;
      return readScheduleTopics(parentScheduleStore(session, admin, parent, AbortSignal.timeout(1500)), parent, childId, workbookId);
    },
    async skillHistory(childId) {
      if (!admin) throw new Error("skill history read: no secret key");
      // Parents may not read this table: the secret key reads it, filtered on the parent and the child, and only the
      // standard, the state and the time leave. A state this code does not know is left out.
      const known = new Set<string>(["mastered", "working_on", "needs_review", "not_started"]);
      const rows: StateChange[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await admin.from("skill_state_history").select("standard, state, changed_at")
          .eq("parent_id", parent).eq("child_id", childId).order("id").range(from, from + 999);
        if (error) throw new Error(`skill history read: ${error.message}`);
        rows.push(...data.filter((r) => known.has(r.state)).map((r) => ({ standard: r.standard, state: r.state as StateChange["state"], changedAt: r.changed_at })));
        if (data.length < 1000) return rows;
      }
    },
    async recentMistakes(childId, since) {
      if (!admin) throw new Error("recent mistakes read: no secret key");
      // Parents may not read this table: the secret key reads it, filtered on the parent and the child, and only the
      // standard, the cause id and the time leave. Only a test's answers count (`source = 'assessment'`): a call or a
      // marked page records no cause today, and a cause no one reviewed is never named. A wrong answer with no known
      // cause is not selected.
      const events: { standard: string; cause: string; at: string; assessmentId: string; questionId: string | null }[] = [];
      for (let from = 0; from < 5000; from += 1000) {
        const { data, error } = await admin.from("learning_events").select("skill_standard, mistake, occurred_at, assessment_id, assessment_question_id")
          .eq("parent_id", parent).eq("child_id", childId).eq("source", "assessment").eq("result", "wrong").not("mistake", "is", null)
          .gte("occurred_at", new Date(since).toISOString()).order("occurred_at").order("id").range(from, from + 999);
        if (error) throw new Error(`recent mistakes read: ${error.message}`);
        events.push(...data.flatMap((r) => (r.mistake && r.assessment_id ? [{ standard: r.skill_standard, cause: r.mistake, at: r.occurred_at, assessmentId: r.assessment_id, questionId: r.assessment_question_id }] : [])));
        if (data.length < 1000) break;
      }
      if (events.length === 0) return [];
      // The same tests the skill states count (src/lib/assessment/skill-state.ts): a test with no report yet has unknown
      // reliability, a test the report calls unreliable (D-258) is no evidence, and a rushed wrong answer the placement
      // left out of the score (#189, `placement.pace.leftOut`, by question id) is not a sign of what the child knows.
      const ids = [...new Set(events.map((e) => e.assessmentId))];
      const [reports, tests] = await Promise.all([
        admin.from("reports").select("assessment_id, reliability:model->reliability").eq("parent_id", parent).eq("child_id", childId).in("assessment_id", ids),
        admin.from("assessments").select("id, left_out:placement->pace->leftOut").eq("parent_id", parent).eq("child_id", childId).in("id", ids),
      ]);
      if (reports.error) throw new Error(`recent mistakes reports read: ${reports.error.message}`);
      if (tests.error) throw new Error(`recent mistakes tests read: ${tests.error.message}`);
      const reliable = new Set(reports.data.filter((r) => !reportCallsUnreliable(r)).map((r) => r.assessment_id));
      const leftOut = new Map(tests.data.map((t) => [t.id, new Set(Array.isArray(t.left_out) ? t.left_out.filter((q): q is string => typeof q === "string") : [])]));
      return events
        .filter((e) => reliable.has(e.assessmentId) && !(e.questionId !== null && leftOut.get(e.assessmentId)?.has(e.questionId)))
        .map(({ standard, cause, at }) => ({ standard, cause, at }));
    },
    async switches() {
      const [scanPages, scanPlanChildren, testFamily] = await Promise.all([
        scanReleased(parent, admin, env),
        familyOpenPlanChildren({ parentId: parent }, { db: admin }),
        admin?.from("test_accounts").select("parent_id").eq("parent_id", parent).maybeSingle(),
      ]);
      const test = !testFamily?.error && testFamily?.data?.parent_id === parent;
      const enabled = env.MAYA_CHAT_ENABLED !== "off";
      return {
        progress: env.PROGRESS_TAB_ENABLED === "on",
        maya: enabled && chatFamilyGate({ test, listed: false }, env) === "test",
        mayaPlanChildren: enabled && chatFamilyGate({ test: false, listed: false, planOpen: true }, env) === "open_plan" ? scanPlanChildren : new Set<string>(),
        scanPages,
        scanPlanChildren,
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
