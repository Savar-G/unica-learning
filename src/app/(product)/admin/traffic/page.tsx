import { AdminFrame } from "@/components/admin-frame";
import { TrafficView } from "@/components/admin-traffic";
import { ADMIN_PATH } from "@/lib/admin-view";
import { pageMetadata } from "@/lib/metadata";
import { loadTraffic } from "@/lib/traffic-store";

const PATH = `${ADMIN_PATH}/traffic`;
export const metadata = pageMetadata({ path: PATH, title: "Admin: traffic", description: "Admin area.", index: false });

// Who visits the site and where they come from: today, the past 7 and 30 days, and all time. Admins only: everyone else
// gets the site's 404 (loadTraffic runs requireAdmin).
export default async function AdminTraffic({ searchParams }: PageProps<"/admin/traffic">) {
  const d = await loadTraffic(await searchParams);
  return (
    <AdminFrame email={d.who} title="Traffic" lead="Who visits the site, where they come from and how far they get." testNote={d.withTests && "Test families are showing, and the signup steps count them."}>
      <TrafficView d={d} />
    </AdminFrame>
  );
}
