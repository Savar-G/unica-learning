import { AdminFrame } from "@/components/admin-frame";
import { SocialView } from "@/components/admin-social";
import { requireAdmin } from "@/lib/admin-store";
import { pageMetadata } from "@/lib/metadata";
import { isSocialSort, socialDashboard } from "@/lib/social-dashboard";
import { readSocial } from "@/lib/social-store";

export const metadata = pageMetadata({ path: "/admin/social", title: "Admin: social", description: "Admin area.", index: false });

export default async function AdminSocial({ searchParams }: PageProps<"/admin/social">) {
  const { db, email } = await requireAdmin();
  const params = await searchParams;
  const input = await readSocial(db, new Date()).catch(() => null);
  return (
    <AdminFrame email={email} title="Social" lead="See how each channel performs and what tagged links bring to Unica.">
      {input
        ? <SocialView dashboard={socialDashboard(input, isSocialSort(params.sort) ? params.sort : "recent")} notice={params.notice} />
        : <p className="ab-needs" role="alert">Social data could not load. Reload the page to try again.</p>}
    </AdminFrame>
  );
}
