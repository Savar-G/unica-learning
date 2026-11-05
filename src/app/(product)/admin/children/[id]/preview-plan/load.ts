import "server-only";
import type { AdminSession } from "@/lib/admin-store";
import { getChild, getChildWorkbooks } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { isGrade, learnerProfile, storedProfile } from "@/lib/assessment";
import { fromRow } from "@/lib/learning-style";
import { storedChildProfile } from "@/lib/child-profile";
import { learningEventStore } from "@/lib/learning-events-store";
import { loadReportInputs } from "@/lib/report-loading";
import { adminReportReader } from "@/lib/report-loading-server";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { planNextWorkbook } from "@/lib/workbook-placement";
import { previewWorkbook } from "@/lib/workbook-why";
import { staleLearnerProfile, WORKBOOK_LEARNER_DERIVED_VERSION } from "@/lib/workbook-profile-freshness";

// Only read operations. Use the admin's session, never a service-role client or a profile rebuild that saves.
export async function loadPreviewPlan(admin: AdminSession, id: string) {
  if (!isUuid(id)) return null;
  const record = await getChild(admin, id);
  if (!record) return null;
  const child = record.child;
  const key = child.province === "BC" ? "bc" : null;
  const curriculum = key ? curriculumFor(key) : null;
  if (!curriculum || !isGrade(child.grade)) return { child, preview: { ok: false as const, reason: "A workbook curriculum is not available for this child." } };
  const [tests, books, events, previous] = await Promise.all([
    admin.db.rpc("admin_assessments").select("id, completed_at, device").eq("child_id", id).eq("status", "completed")
      .eq("placement->>scoredAgainst", "BC").order("completed_at", { ascending: false }).order("id").limit(1).maybeSingle(),
    getChildWorkbooks(admin, id),
    learningEventStore(admin.db).range(id, { from: "0001-01-01T00:00:00Z", to: "9999-12-31T23:59:59Z" }),
    admin.db.from("child_profiles").select("profile").eq("child_id", id).maybeSingle(),
  ]);
  if (tests.error) throw new Error("Could not read the completed test.");
  if (previous.error) throw new Error("Could not read the saved profile notes.");
  const learning = fromRow(child);
  // Discard free text before building the in-memory profile.
  const answers = learning && { styles: learning.styles, interests: learning.interests, feeling: learning.feeling, goal: learning.goal, weeklyTime: learning.weeklyTime };
  let assessment = null;
  let report = null;
  let rebuilt = false;
  if (tests.data) {
    const test = tests.data;
    const metadata = await admin.db.rpc("admin_reports").select("minutes, recommendation:model->>howWeHelp").eq("assessment_id", test.id).maybeSingle();
    if (metadata.error) throw new Error("Could not read the report recommendation.");
    const recommendation = metadata.data?.recommendation;
    report = { minutes: metadata.data?.minutes ?? null, howWeHelp: recommendation === "ahead" || recommendation === "behind" || recommendation === "on-grade" ? recommendation : null };
    const stored = await admin.db.from("learner_profiles").select("schema_version, profile").eq("assessment_id", test.id).maybeSingle();
    if (stored.error) throw new Error("Could not read the test profile.");
    let profile = staleLearnerProfile(stored.data?.schema_version ?? null, stored.data?.profile) ? null : storedProfile(stored.data?.profile);
    if (!profile) {
      try {
        const inputs = await loadReportInputs(adminReportReader(admin), test.id, () => Promise.reject(new Error("Preview does not read comparisons.")));
        if (inputs) {
          const derived = learnerProfile({ placement: inputs.assessment.placement, answers: inputs.profileAnswers(), help: inputs.assessment.help, learning: answers });
          const current = derived && { ...derived, workbookDerivedVersion: WORKBOOK_LEARNER_DERIVED_VERSION };
          profile = current;
          rebuilt = !!current;
        }
      } catch {
        profile = null;
      }
    }
    if (!profile || staleLearnerProfile(profile.schemaVersion, profile)) return { child, preview: { ok: false as const, reason: "The test profile could not be built from the assessment. Check the child's profile before making the book." } };
    assessment = { assessmentId: test.id, completedAt: test.completed_at, buildId: null, profile };
  }
  const preview = previewWorkbook({ curriculum, grade: child.grade, workbooks: books, report, device: tests.data?.device ?? null, previous: storedChildProfile(previous.data?.profile),
    facts: { grade: child.grade, learning: answers, assessment, events } }, planNextWorkbook);
  if (rebuilt && preview.ok) preview.why.warnings.push("This preview rebuilt older test facts without AI. A real run can add new AI notes after it rebuilds those facts.");
  return { child, preview };
}
