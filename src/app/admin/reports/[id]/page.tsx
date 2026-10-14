import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-store";
import { adminTestPath } from "@/lib/admin-view";
import { loadReportView } from "@/lib/report-loading";
import { adminReportReader } from "@/lib/report-loading-server";
import { AdminFrame } from "@/components/admin";
import { ReportCard } from "@/components/report";

// A stored report as the parent's report page shows it, read with the admin's session through the report-loading
// module (#161), with the drawings signed for the admin.
export default async function AdminReportPage({ params }: PageProps<"/admin/reports/[id]">) {
  const admin = await requireAdmin();
  const report = await loadReportView(adminReportReader(admin), (await params).id);
  if (!report) notFound();
  return <AdminFrame email={admin.email} section="tests" title="Report">
    <p className="adm-report-note">Read-only report. <Link href={adminTestPath(report.assessmentId)}>Open the test, flags and all shown work</Link>.</p>
    <ReportCard view={report.view} readOnly />
  </AdminFrame>;
}
