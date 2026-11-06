import { AdminFrame } from "@/components/admin";
import { AdminParentDashboard } from "@/components/admin-parent-dashboard";
import { requireAdmin } from "@/lib/admin-store";
import { previewSelection } from "@/lib/admin-parent-dashboard";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: "/admin/parent-dashboard", title: "Admin: Parent dashboard", description: "Parent dashboard views with sample data.", index: false });

export default async function ParentDashboardExplorer({ searchParams }: PageProps<"/admin/parent-dashboard">) {
  // No demo bypass. This page is the only addressable preview entry and checks authorization on every request.
  const admin = await requireAdmin();
  return <AdminFrame email={admin.email} section="parent-dashboard" title="Parent dashboard">
    <AdminParentDashboard selection={previewSelection(await searchParams)} />
  </AdminFrame>;
}
