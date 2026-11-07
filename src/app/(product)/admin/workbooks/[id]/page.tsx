import { notFound } from "next/navigation";
import { getWorkbook, requireAdmin } from "@/lib/admin-store";
import { AdminWorkbook } from "@/components/admin-workbook";
import { savedWorkbookWhy } from "./saved-why";
import { WhyThisBook } from "./why-this-book";
import { getWorkbookEmailPanel } from "@/lib/admin-workbook-emails";
import { WorkbookEmails } from "@/components/workbook-emails";

// One workbook as data (#299): its pages, page images, measured question boxes and question packages, read through the
// workbook store with the admin's session. Each child's workbooks are listed on the admin child page.
export default async function AdminWorkbookPage({ params }: PageProps<"/admin/workbooks/[id]">) {
  const admin = await requireAdmin();
  const detail = await getWorkbook(admin, (await params).id);
  if (!detail) notFound();
  const printed = detail.workbook.status === "printed" || detail.workbook.status === "shipped";
  const [why, panel] = await Promise.all([
    savedWorkbookWhy(admin, detail.runId),
    printed ? getWorkbookEmailPanel(admin, detail.workbook) : Promise.resolve(null),
  ]);
  const emails = printed ? panel
    ? <WorkbookEmails key={`${panel.cardId}:${detail.workbook.number}`} {...panel} workbookNumber={detail.workbook.number} allowReady={detail.workbook.status === "printed"} />
    : <p className="adm-note">Workbook emails are unavailable because this child has no confirmed saved card.</p>
    : <p className="adm-note">Print this workbook before sending its ready or delivery email.</p>;
  return <AdminWorkbook email={admin.email} detail={detail} why={<WhyThisBook why={why} />} emails={emails} />;
}
