import { AdminFrame } from "@/components/admin-frame";
import { AdminParentDashboard } from "@/components/admin-parent-dashboard";
import { requireAdmin } from "@/lib/admin-store";
import { PARENT_EXPLORER_PATH, previewSelection } from "@/lib/admin-parent-dashboard";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: PARENT_EXPLORER_PATH, title: "Admin: parent app preview", description: "Parent app views with sample data.", index: false });

export default async function ParentDashboardExplorer({ searchParams }: PageProps<"/admin/dashboard">) {
  // The canonical page and its older alias independently pass this authorization check on every request.
  const admin = await requireAdmin();
  return <AdminFrame email={admin.email} title="Parent app preview" lead="See the parent app with sample families.">
    <AdminParentDashboard selection={previewSelection(await searchParams)} />
  </AdminFrame>;
}
