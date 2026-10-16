import { AdminFrame } from "@/components/admin";
import { SkillMapView } from "@/components/admin-skill-map";
import { BC_SKILL_MAP } from "@/lib/assessment";
import { requireAdmin } from "@/lib/admin-store";
import { ADMIN_PATH } from "@/lib/admin-view";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: `${ADMIN_PATH}/skill-map`, title: "Admin: BC skill map", description: "Admin area.", index: false });

// The BC skill map for reviewers (#192). Admins only. ?demo=1 in local development shows it without a sign-in, as on
// the dashboard (D-099): the map holds curriculum text only, no family data.
export default async function SkillMapPage({ searchParams }: PageProps<"/admin/skill-map">) {
  const demo = (await searchParams).demo === "1" && process.env.NODE_ENV === "development";
  const email = demo ? "local preview" : (await requireAdmin()).email;
  return (
    <AdminFrame email={email} section="skill-map" title="BC skill map">
      <SkillMapView map={BC_SKILL_MAP} />
    </AdminFrame>
  );
}
