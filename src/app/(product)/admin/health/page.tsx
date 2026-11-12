import { AdminHealth } from "@/components/admin-health";
import { AdminFrame } from "@/components/admin-frame";
import { requireAdmin } from "@/lib/admin-store";
import { healthMeasures, healthSummary } from "@/lib/admin-health";
import { loadHealth } from "@/lib/admin-health-server";
import { showTestFamilies } from "@/lib/admin-test-families-server";
import { demoHealthRows } from "@/lib/admin-health-demo";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: "/admin/health", title: "Admin: what to fix", description: "Admin area.", index: false });

// What to fix (D-331): the failure and quality counts of the last 7 and 30 days, worst first, each with a link to the
// list behind it. One admin-only database call (admin_health_v1) per load: no polling, no prefetch. Test families follow
// the "Show test families" switch (D-313), as /admin/templates does: left out, or counted while it is on.
// ?demo=1 in local development shows made-up counts instead, without a sign-in, as on the dashboard (D-099).
export default async function HealthPage({ searchParams }: PageProps<"/admin/health">) {
  const demo = (await searchParams).demo === "1" && process.env.NODE_ENV === "development";
  const admin = demo ? null : await requireAdmin();
  const withTests = demo ? false : await showTestFamilies();
  const now = new Date();
  const measures = healthMeasures(admin ? await loadHealth(admin, withTests) : demoHealthRows(now), now);
  return (
    <AdminFrame email={admin?.email ?? "demo data"} title="What to fix" lead="What failed in the last 7 and 30 days, worst first. Each line links to the list behind it." testNote={withTests && "Test families are showing, and on this page they are counted in the numbers."}>
      <AdminHealth measures={measures} summary={healthSummary(measures)} now={now.toISOString()} />
    </AdminFrame>
  );
}
