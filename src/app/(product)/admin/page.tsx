import { AdminFrame } from "@/components/admin-frame";
import { HomeView } from "@/components/admin-home";
import { FamilyDrawer } from "@/components/admin-family";
import { loadDashboard } from "@/lib/admin-dashboard-load";
import { loadHomeExtras } from "@/lib/admin-home-load";
import { ADMIN_PATH } from "@/lib/admin-view";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: ADMIN_PATH, title: "Admin: home", description: "Admin area.", index: false });

// The admin Home (D-313, D-315): new customers, workbook production, signups and marking, then what happened since
// yesterday; the full numbers in a closed section. Admins only: everyone else gets the site's 404 (both loaders run
// requireAdmin), and every read runs with the admin's own session. The dashboard, Production's books and the marking
// queue are read at once. ?family= opens a family's panel (the family page links here with it).
export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  const raw = await searchParams;
  const demo = raw.demo === "1" && process.env.NODE_ENV === "development";
  const [{ who, d, progress, query, demo: isDemo }, extras] = await Promise.all([loadDashboard(raw), loadHomeExtras(raw, demo)]);
  const ctx = { path: ADMIN_PATH, query, demo: isDemo };
  return (
    <AdminFrame email={who} title={null}>
      <HomeView d={d} ctx={ctx} extras={extras} />
      {query.family && <FamilyDrawer ctx={ctx} d={d} id={query.family} progress={progress} />}
    </AdminFrame>
  );
}
