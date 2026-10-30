import { notFound } from "next/navigation";
import { getWorkbook, requireAdmin } from "@/lib/admin-store";
import { AdminWorkbook } from "@/components/admin-workbook";

// One workbook as data (#299): its pages, page images, measured question boxes and question packages, read through the
// workbook store with the admin's session. Each child's workbooks are listed on the admin child page.
export default async function AdminWorkbookPage({ params }: PageProps<"/admin/workbooks/[id]">) {
  const admin = await requireAdmin();
  const detail = await getWorkbook(admin, (await params).id);
  if (!detail) notFound();
  return <AdminWorkbook email={admin.email} detail={detail} />;
}
