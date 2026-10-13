import { AdminFrame } from "@/components/admin";
import { DashboardView } from "@/components/admin-dashboard";
import { FamilyDrawer } from "@/components/admin-family";
import { loadDashboard } from "@/lib/admin-dashboard-load";
import { ADMIN_PATH } from "@/lib/admin-view";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: ADMIN_PATH, title: "Admin: dashboard", description: "Admin area.", index: false });

// The admin home (D-099): KPIs, funnel, daily chart, every family with its stage, and the emails. Admins only: everyone
// else gets the site's 404 (loadDashboard runs requireAdmin), and every read runs with the admin's own session.
export default async function AdminDashboard({ searchParams }: PageProps<"/admin">) {
  const { who, d, query, demo } = await loadDashboard(await searchParams);
  const ctx = { path: ADMIN_PATH, query, demo };
  return (
    <AdminFrame email={who} section="dashboard" title={null} wide>
      <DashboardView d={d} ctx={ctx} />
      {query.family && <FamilyDrawer ctx={ctx} d={d} id={query.family} />}
    </AdminFrame>
  );
}
