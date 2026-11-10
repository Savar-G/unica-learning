import { connection } from "next/server";
import { getWorkbookWorker, listProduction, requireAdmin } from "@/lib/admin-store";
import { buildBooks, isStage } from "@/lib/admin-production";
import { loadTestFamilies } from "@/lib/admin-test-families-server";
import { pageMetadata } from "@/lib/metadata";
import { workbookRunner } from "@/lib/workbook-ai";
import { AdminFrame } from "@/components/admin-frame";
import { ProductionBoard } from "@/components/admin-production";
import { WorkerLine } from "@/components/admin-workbook-runs";

export const metadata = pageMetadata({ path: "/admin/workbooks", title: "Admin: production", description: "Admin area.", index: false });

// Workbooks > Production (D-313, D-315): each child's current book by stage, from no workbook yet to delivered
// (src/lib/admin-production.ts holds the rules). ?stage= shows one stage; ?older=1 shows every delivered book. Test
// families follow the "Show test families" switch and never count.
export default async function WorkbooksPage({ searchParams }: PageProps<"/admin/workbooks">) {
  const admin = await requireAdmin();
  await connection();
  const query = await searchParams;
  const stage = isStage(query.stage) ? query.stage : null;
  const view = await loadTestFamilies(admin);
  // D-200: runs are made on the workbook computer unless WORKBOOK_RUNNER is "server".
  const runner = workbookRunner();
  const now = new Date();
  const [data, worker] = await Promise.all([listProduction(admin, view, now), runner === "mac" ? getWorkbookWorker(admin) : null]);
  const books = buildBooks({ ...data, tests: { show: view.show, isTest: view.isTest } }, now);
  return <AdminFrame email={admin.email} title="Production" lead="Every workbook, from the first draft to the family's door." testNote={view.show}
    actions={runner === "mac" ? <WorkerLine worker={worker} /> : undefined}>
    <ProductionBoard books={books} now={now} stage={stage} showOlder={query.older === "1"} worker={runner === "mac" ? worker : undefined} runner={runner} incomplete={data.incomplete} />
  </AdminFrame>;
}
