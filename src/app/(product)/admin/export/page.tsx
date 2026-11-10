import { AdminFrame } from "@/components/admin-frame";
import { ExportView } from "@/components/admin-export";
import { ADMIN_EXPORT_PATH } from "@/lib/admin-export";
import { requireAdmin } from "@/lib/admin-store";
import { showTestFamilies } from "@/lib/admin-test-families-server";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: ADMIN_EXPORT_PATH, title: "Admin: export", description: "Admin area.", index: false });

// The raw data export (#200). Admins only: everyone else gets the site's 404, and the route checks again for each file.
// ?demo=1 in local development links to the made-up families instead, without a sign-in, as on the dashboard (D-099).
export default async function ExportPage({ searchParams }: PageProps<"/admin/export">) {
  const query = await searchParams;
  const demo = query.demo === "1" && process.env.NODE_ENV === "development";
  const email = demo ? "demo data" : (await requireAdmin()).email;
  const withTests = await showTestFamilies();
  return (
    <AdminFrame email={email} title="Export" lead="Download the test data as CSV or JSON." testNote={withTests && "Test families are showing, and the files below include them."}>
      <ExportView withTests={withTests} demo={demo} />
    </AdminFrame>
  );
}
