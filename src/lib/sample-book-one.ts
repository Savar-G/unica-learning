import "server-only";
// D-305: Leah's sample report with workbook 1 from the real planner, like a family's report. Server only: the planner
// reads the whole BC curriculum, which must not reach a browser bundle (the admin preview calls sampleReportView).
import { isGrade } from "@/lib/assessment";
import { bookOne } from "@/lib/report-book-one";
import type { ReportView } from "@/lib/report-view";
import { sampleLearnerProfile, sampleReportView } from "@/lib/sample-children";

export function sampleReportWithBook(): ReportView {
  const view = sampleReportView();
  const profile = sampleLearnerProfile();
  const grade = view.model.level.grade;
  if (!profile || !isGrade(grade)) return view;
  return { ...view, bookOne: bookOne({ profile, grade, assessmentId: view.id, completedAt: view.completedAt, minutes: view.minutes, howWeHelp: view.model.howWeHelp }) };
}
