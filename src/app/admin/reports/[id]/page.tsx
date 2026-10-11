import Link from "next/link";
import { notFound } from "next/navigation";
import { getReportView, requireAdmin } from "@/lib/admin-store";
import { adminTestPath } from "@/lib/admin-view";
import { AdminFrame } from "@/components/admin";
import { ReportCard } from "@/components/report";

export default async function AdminReportPage({ params }: PageProps<"/admin/reports/[id]">) {
  const admin = await requireAdmin();
  const report = await getReportView(admin, (await params).id);
  if (!report) notFound();
  return <AdminFrame email={admin.email} section="tests" title="Report">
    <p className="adm-report-note">Read-only report. <Link href={adminTestPath(report.assessmentId)}>Open the test, flags and all shown work</Link>.</p>
    <ReportCard view={report.view} readOnly />
  </AdminFrame>;
}
