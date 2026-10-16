import { AdminFrame } from "@/components/admin";
import { TemplateTableView } from "@/components/admin-templates";
import { BANKS } from "@/lib/assessment";
import { requireAdmin, templateStats } from "@/lib/admin-store";
import { ADMIN_TEMPLATES_PATH, parseTemplateFilters, templateStats as countAnswers, templateTable } from "@/lib/admin-templates";
import { demoAnswers } from "@/lib/admin-templates-demo";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: ADMIN_TEMPLATES_PATH, title: "Admin: question templates", description: "Admin area.", index: false });

// One row per question template, by BC grade, across all children (#199). Admins only: everyone else gets the site's
// 404, and the database counts with the admin's own session (admin_template_stats). ?demo=1 in local development counts
// made-up tests instead, without a sign-in, as on the dashboard (D-099).
export default async function TemplatesPage({ searchParams }: PageProps<"/admin/templates">) {
  const query = await searchParams;
  const filters = parseTemplateFilters(query);
  const demo = query.demo === "1" && process.env.NODE_ENV === "development";
  const admin = demo ? null : await requireAdmin();
  const stats = admin ? await templateStats(admin, filters) : countAnswers(demoAnswers(), filters);
  return (
    <AdminFrame email={admin?.email ?? "demo data"} section="templates" title="Question templates">
      <TemplateTableView table={templateTable(stats, Object.values(BANKS).flat())} filters={filters} demo={demo} />
    </AdminFrame>
  );
}
