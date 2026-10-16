import { AdminFrame } from "@/components/admin";
import { ActivityView } from "@/components/admin-activity";
import { FamilyDrawer } from "@/components/admin-family";
import { loadDashboard } from "@/lib/admin-dashboard-load";
import { ADMIN_PATH } from "@/lib/admin-view";
import { pageMetadata } from "@/lib/metadata";

const PATH = `${ADMIN_PATH}/activity`;
export const metadata = pageMetadata({ path: PATH, title: "Admin: activity", description: "Admin area.", index: false });

// The activity log (D-099): what happened day by day, the families by stage and every email. Admins only, like the
// dashboard (loadDashboard runs requireAdmin).
export default async function AdminActivity({ searchParams }: PageProps<"/admin/activity">) {
  const { who, d, query, demo } = await loadDashboard(await searchParams);
  const ctx = { path: PATH, query, demo };
  return (
    <AdminFrame email={who} section="activity" title={null} wide>
      <ActivityView d={d} ctx={ctx} />
      {query.family && <FamilyDrawer ctx={ctx} d={d} id={query.family} />}
    </AdminFrame>
  );
}
