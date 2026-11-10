import { connection } from "next/server";
import { getWorkbookWorker, listWorkbookArea, requireAdmin } from "@/lib/admin-store";
import { loadTestFamilies } from "@/lib/admin-test-families-server";
import { pageMetadata } from "@/lib/metadata";
import { AdminWorkbookList, LIST_FILTERS, type ListFilter } from "@/components/admin-workbook-runs";

export const metadata = pageMetadata({ path: "/admin/workbooks", title: "Admin: production", description: "Admin area.", index: false });

// #312: every workbook by child and status, with its check results: the drafts that "Prepare next workbook" made (and
// the runs still working or failed) and the workbooks stored for print. Test families follow the "Show test families"
// switch (D-313).
export default async function WorkbooksPage({ searchParams }: PageProps<"/admin/workbooks">) {
  const admin = await requireAdmin();
  await connection();
  const query = await searchParams;
  const status = query.status;
  const filter: ListFilter = typeof status === "string" && (LIST_FILTERS as readonly string[]).includes(status) ? (status as ListFilter) : "all";
  const view = await loadTestFamilies(admin);
  const [{ runs, workbooks, children, deliveredIds }, worker] = await Promise.all([listWorkbookArea(admin, view.hidden), getWorkbookWorker(admin)]);
  return <AdminWorkbookList email={admin.email} runs={runs.rows} more={runs.more} workbooks={workbooks} deliveredIds={deliveredIds} childNames={children} filter={filter} now={new Date()} worker={worker}
    tests={{ show: view.show, isTest: view.isTest }} />;
}
