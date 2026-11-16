import { AdminFrame } from "@/components/admin-frame";
import { ChildUnitCostPage } from "@/components/admin-child-unit-cost";
import { requireAdmin } from "@/lib/admin-store";
import { CHILD_COST_PATH, monthFor, parseMonthKey, readChildUnitCost, type UnitCostView } from "@/lib/child-unit-cost";
import { supabaseUnitCostReader } from "@/lib/child-unit-cost-store";
import { spendConfig } from "@/lib/maya-spend";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: CHILD_COST_PATH, title: "Admin: cost per child", description: "Admin area.", index: false });

// Cost per child per month (docs/child-unit-cost.md): two database function calls (the families, then the sums inside each
// family's own month), no polling, no prefetch. Admins only: everyone else gets the site's 404.
export default async function ChildUnitCostRoute({ searchParams }: PageProps<"/admin/ai/children">) {
  const query = await searchParams;
  const admin = await requireAdmin();
  const now = new Date().getTime();
  const monthKey = parseMonthKey(query.month);
  const read = await readChildUnitCost(supabaseUnitCostReader(admin), { month: monthFor(monthKey, now), rate: spendConfig().usdToCad, withTests: true, now })
    .then((v): { view: UnitCostView } | { error: string } => ({ view: v }), () => ({ error: "The cost per child could not be read. Try again in a moment." }));
  return (
    <AdminFrame email={admin.email} title="Cost per child" lead="Each child's recorded cost in the family's own month, against what the plan charged." testNote="All families, including test and admin families, are included regardless of the global test-family switch.">
      <ChildUnitCostPage view={"view" in read ? read.view : null} monthKey={monthKey} error={"error" in read ? read.error : null} />
    </AdminFrame>
  );
}
