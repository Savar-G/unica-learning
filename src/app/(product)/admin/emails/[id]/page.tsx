import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminFrame } from "@/components/admin-frame";
import { EmailView } from "@/components/admin-email";
import { FamilyDrawer } from "@/components/admin-family";
import { EMAIL_LABEL, isTeamEmail, isUnsubscribe, parseEmailId, type EmailEvent } from "@/lib/admin-dashboard";
import { loadDashboard } from "@/lib/admin-dashboard-load";
import { demoEmailCopy } from "@/lib/admin-demo";
import { emailParent, getEmailCopy, requireAdmin } from "@/lib/admin-store";
import { ADMIN_PATH, adminEmailPath } from "@/lib/admin-view";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: `${ADMIN_PATH}/emails`, title: "Admin: email", description: "Admin area.", index: false });

// One logged email the way the parent got it (D-103), from the Emails list or a family's email list: the subject as the
// title, the email in a framed preview and its facts on the side. Admins only (loadDashboard runs requireAdmin). Test
// families count here too, so an admin can open the emails of their own tests. Only the email's family and the family
// drawer's (?family=) are read, not every family.
export default async function EmailPage({ params, searchParams }: PageProps<"/admin/emails/[id]">) {
  const id = decodeURIComponent((await params).id);
  const { who, d, progress, query, demo } = await loadDashboard(await searchParams, {
    withTests: true,
    families: async (admin, q) => [...(await emailParent(admin, id).then((p) => (p ? [p] : []))), ...(q.family ? [q.family] : [])],
    // A team email about no family has no family to read it with: its send log row is read by id.
    sendIds: parseEmailId(id)?.which === "send" ? [parseEmailId(id)!.id] : [],
  });
  const e = d.emails.find((x) => x.id === id);
  if (!e || isUnsubscribe(e.kind)) notFound();
  const copy = demo ? demoEmailCopy(e, d.families.find((f) => f.id === e.familyId)) : await getEmailCopy(await requireAdmin(), id);
  const path = adminEmailPath(id);
  const ctx = { path, query, demo };
  return (
    <AdminFrame email={who} title={copy?.subject ?? e.subject} lead={leadOf(e)}
      actions={<Link className="btn ghost adm-btn" href={`${ADMIN_PATH}/emails${demo ? "?demo=1" : ""}`} prefetch={false}>All emails</Link>}>
      <EmailView e={e} copy={copy} ctx={ctx} now={d.now} />
      {query.family && <FamilyDrawer ctx={ctx} d={d} id={query.family} progress={progress} />}
    </AdminFrame>
  );
}

/** "Report alert, sent to the team about the Lee family.", "Daily digest, sent to the team.", "Report email to Lee." */
function leadOf(e: EmailEvent): string {
  if (!isTeamEmail(e.kind)) return `${EMAIL_LABEL[e.kind]} to ${e.familyName ?? "a parent"}.`;
  return e.familyName ? `${EMAIL_LABEL[e.kind]}, sent to the team about ${e.familyName}.` : `${EMAIL_LABEL[e.kind]}, sent to the team.`;
}
