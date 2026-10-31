import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getWorkbookRun, requireAdmin } from "@/lib/admin-store";
import { AdminWorkbookRun } from "@/components/admin-workbook-runs";

// #312: one "Prepare next workbook" run: its progress or its error, then its draft page by page (the page image beside
// each question's data), then the audit log. ?only=attention shows only the pages that need attention.
export default async function WorkbookRunPage({ params, searchParams }: PageProps<"/admin/workbooks/runs/[id]">) {
  const admin = await requireAdmin();
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const detail = await getWorkbookRun(admin, id);
  if (!detail) notFound();
  return <AdminWorkbookRun email={admin.email} detail={detail} now={new Date()} only={query.only === "attention"} />;
}
