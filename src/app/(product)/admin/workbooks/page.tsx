import { connection } from "next/server";
import { listWorkbookArea, requireAdmin } from "@/lib/admin-store";
import { AdminWorkbookList, LIST_FILTERS, type ListFilter } from "@/components/admin-workbook-runs";

// #312: every workbook by child and status, with its check results: the drafts that "Prepare next workbook" made (and
// the runs still working or failed) and the workbooks stored for print.
export default async function WorkbooksPage({ searchParams }: PageProps<"/admin/workbooks">) {
  const admin = await requireAdmin();
  await connection();
  const status = (await searchParams).status;
  const filter: ListFilter = typeof status === "string" && (LIST_FILTERS as readonly string[]).includes(status) ? (status as ListFilter) : "all";
  const { runs, workbooks, children } = await listWorkbookArea(admin);
  return <AdminWorkbookList email={admin.email} runs={runs.rows} more={runs.more} workbooks={workbooks} childNames={children} filter={filter} now={new Date()} />;
}
