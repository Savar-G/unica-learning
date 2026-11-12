import { AdminFamiliesAtRisk } from "@/components/admin-families-at-risk";
import { AdminFrame } from "@/components/admin-frame";
import { requireAdmin } from "@/lib/admin-store";
import { riskFamilies, riskSummary } from "@/lib/admin-families-at-risk";
import { loadFamiliesAtRisk } from "@/lib/admin-families-at-risk-server";
import { showTestFamilies } from "@/lib/admin-test-families-server";
import { demoRiskRows } from "@/lib/admin-families-at-risk-demo";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: "/admin/families-at-risk", title: "Admin: families at risk", description: "Admin area.", index: false });

// Families at risk (D-332): each child on a running or troubled plan, with the days since the last real activity, the
// reasons the family may leave and the next action, the most at risk first. One admin-only database call
// (admin_families_at_risk_v1) per load: no polling, no prefetch. Test families follow the "Show test families" switch (D-313).
// ?demo=1 in local development shows made-up families instead, without a sign-in, as on the dashboard (D-099).
export default async function FamiliesAtRiskPage({ searchParams }: PageProps<"/admin/families-at-risk">) {
  const demo = (await searchParams).demo === "1" && process.env.NODE_ENV === "development";
  const admin = demo ? null : await requireAdmin();
  const withTests = demo ? false : await showTestFamilies();
  const now = new Date();
  const families = riskFamilies(admin ? await loadFamiliesAtRisk(admin, withTests) : demoRiskRows(now), now);
  return (
    <AdminFrame email={admin?.email ?? "demo data"} title="Families at risk" lead="Families on a plan, the most at risk first: who went quiet, who cancelled, who owes a payment." testNote={withTests && "Test families are showing. They are tagged test and are left out of the counts when a real family is listed."}>
      <AdminFamiliesAtRisk families={families} summary={riskSummary(families)} now={now.toISOString()} />
    </AdminFrame>
  );
}
