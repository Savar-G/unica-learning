import { notFound } from "next/navigation";
import { AdminFrame } from "@/components/admin";
import { EmailView } from "@/components/admin-email";
import { FamilyDrawer } from "@/components/admin-family";
import { loadDashboard } from "@/lib/admin-dashboard-load";
import { demoEmailCopy } from "@/lib/admin-demo";
import { getEmailCopy, requireAdmin } from "@/lib/admin-store";
import { ADMIN_PATH, adminEmailPath } from "@/lib/admin-view";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: `${ADMIN_PATH}/emails`, title: "Admin: email", description: "Admin area.", index: false });

// One logged email the way the parent got it (D-103), from the Emails list or a family's email list. Admins only
// (loadDashboard runs requireAdmin). Test families count here too, so an admin can open the emails of their own tests.
export default async function EmailPage({ params, searchParams }: PageProps<"/admin/emails/[id]">) {
  const id = decodeURIComponent((await params).id);
  const { who, d, query, demo } = await loadDashboard({ ...(await searchParams), tests: "1" });
  const e = d.emails.find((x) => x.id === id);
  if (!e || e.kind === "unsubscribe") notFound();
  const copy = demo ? demoEmailCopy(e, d.families.find((f) => f.id === e.familyId)) : await getEmailCopy(await requireAdmin(), id);
  const path = adminEmailPath(id);
  const ctx = { path, query, demo };
  return (
    <AdminFrame email={who} section="emails" title={null} wide>
      <div className="dash-page">
        <EmailView e={e} copy={copy} ctx={ctx} back={`${ADMIN_PATH}/emails${demo ? "?demo=1" : ""}`} now={d.now} />
      </div>
      {query.family && <FamilyDrawer ctx={ctx} d={d} id={query.family} />}
    </AdminFrame>
  );
}
