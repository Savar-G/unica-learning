import { AdminFrame } from "@/components/admin-frame";
import { FlyersView } from "@/components/admin-flyers";
import { loadFlyers } from "@/lib/flyer-store";
import { ADMIN_PATH } from "@/lib/admin-view";
import { pageMetadata } from "@/lib/metadata";

const PATH = `${ADMIN_PATH}/flyers`;
export const metadata = pageMetadata({ path: PATH, title: "Admin: flyers", description: "Admin area.", index: false });

// The door-to-door flyer A/B test: scans, signups and the funnel for each flyer. Admins only: everyone else gets the
// site's 404 (loadFlyers runs requireAdmin).
export default async function AdminFlyers({ searchParams }: PageProps<"/admin/flyers">) {
  const d = await loadFlyers(await searchParams);
  return (
    <AdminFrame email={d.who} title="Flyers" lead="Flyer A against flyer B: scans, signups and cards." testNote={d.withTests && "Test families are showing, and on this page they are counted in the numbers."}>
      <FlyersView d={d} />
    </AdminFrame>
  );
}
