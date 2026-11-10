import { AdminFrame } from "@/components/admin-frame";
import { ActivityView } from "@/components/admin-activity";
import { FamilyDrawer } from "@/components/admin-family";
import { loadDashboard } from "@/lib/admin-dashboard-load";
import { ADMIN_PATH } from "@/lib/admin-view";
import { pageMetadata } from "@/lib/metadata";

const PATH = `${ADMIN_PATH}/activity`;
export const metadata = pageMetadata({ path: PATH, title: "Admin: activity", description: "Admin area.", index: false });

// The activity log (D-099): what happened day by day, and the "Needs you" lists. Home links here with "See all".
// Admins only, like Home (loadDashboard runs requireAdmin).
export default async function AdminActivity({ searchParams }: PageProps<"/admin/activity">) {
  const { who, d, progress, query, demo } = await loadDashboard(await searchParams);
  const ctx = { path: PATH, query, demo };
  return (
    <AdminFrame email={who} title="Activity" lead="Everything families did, day by day, newest first." testNote={d.tests.shown && d.tests.count > 0}>
      <ActivityView d={d} ctx={ctx} />
      {query.family && <FamilyDrawer ctx={ctx} d={d} id={query.family} progress={progress} />}
    </AdminFrame>
  );
}
