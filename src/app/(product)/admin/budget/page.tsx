import { AdminFrame } from "@/components/admin-frame";
import { BudgetPage } from "@/components/admin-budget";
import { requireAdmin } from "@/lib/admin-store";
import { BUDGET_PATH } from "@/lib/budget";
import { readBudget } from "@/lib/budget-store";
import { PACIFIC_ZONE, localDay } from "@/lib/family-time";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: BUDGET_PATH, title: "Admin: Budget", description: "Admin area.", index: false });

// The budget tracker (D-333): the team's money in and out, and who owes whom between Savar and Cedric. Three small reads
// through the admin's own session, no polling, no prefetch. Admins only: everyone else gets the site's 404.
export default async function BudgetRoute() {
  const admin = await requireAdmin();
  const today = localDay(new Date().getTime(), PACIFIC_ZONE);
  const data = await readBudget(admin).then((d) => ({ data: d }), (e: unknown) => { console.error("[budget] read failed", e instanceof Error ? e.message : e); return { error: "The budget could not be read. Try again in a moment." }; });
  return (
    <AdminFrame email={admin.email} title="Budget" lead="Money in and out, and who owes whom between Savar and Cedric. All amounts in CAD.">
      <BudgetPage data={"data" in data ? data.data : null} today={today} error={"error" in data ? data.error : null} />
    </AdminFrame>
  );
}
