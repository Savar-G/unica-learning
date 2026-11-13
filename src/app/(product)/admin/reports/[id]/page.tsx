import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-store";
import { adminTestPath } from "@/lib/admin-view";
import { loadReportView } from "@/lib/report-loading";
import { progressPreview } from "@/lib/progress-preview";
import { adminReportReader } from "@/lib/report-loading-server";
import { AdminFrame } from "@/components/admin-frame";
import { childPath } from "@/components/admin-records";
import { ReportCard } from "@/components/report";

// A stored report as the parent's report page shows it, read with the admin's session through the report-loading
// module (#161), with the drawings signed for the admin. D-315: the frame head names the child and links the test.
export default async function AdminReportPage({ params }: PageProps<"/admin/reports/[id]">) {
  const admin = await requireAdmin();
  const report = await loadReportView(adminReportReader(admin), (await params).id);
  if (!report) notFound();
  return <AdminFrame email={admin.email} title={`${report.view.childName}'s report`}
    lead="The report as the parent sees it. Read-only: nothing here changes it."
    actions={<>
      <Link className="btn adm-btn" href={adminTestPath(report.assessmentId)}>Open the test</Link>
      <Link className="btn adm-btn ghost" href={childPath(report.childId)}>Open {report.view.childName}</Link>
      <Link className="btn adm-btn ghost" href={`/admin/reports/${report.view.id}/deck`}>Open the results deck</Link>
    </>}>
    <p className="adm-report-note">The test page has the flags, every answer and all shown work.</p>
    <ReportCard view={report.view} readOnly progress={progressPreview(report.view)} />
  </AdminFrame>;
}
