import Link from "next/link";
import { AdminFrame } from "@/components/admin";
import { EmailLog } from "@/components/admin-activity";
import { Notes, href } from "@/components/admin-dashboard-parts";
import { FamilyDrawer } from "@/components/admin-family";
import { EMAIL_KINDS, emailFailed, type EmailKind } from "@/lib/admin-dashboard";
import { loadDashboard } from "@/lib/admin-dashboard-load";
import { ADMIN_PATH } from "@/lib/admin-view";
import { pageMetadata } from "@/lib/metadata";

const PATH = `${ADMIN_PATH}/emails`;
export const metadata = pageMetadata({ path: PATH, title: "Admin: emails", description: "Admin area.", index: false });

// Every email the site logs (D-099): reminders, report emails, report alerts and unsubscribes, with a filter per kind.
// The same log as Activity, Emails. Admins only (loadDashboard runs requireAdmin).
export default async function EmailsPage({ searchParams }: PageProps<"/admin/emails">) {
  const { who, d, query, demo } = await loadDashboard(await searchParams);
  const ctx = { path: PATH, query, demo };
  const filter: EmailKind | "failed" | null = query.kind === "failed" ? "failed" : (EMAIL_KINDS.find((k) => k.kind === query.kind)?.kind ?? null);
  const count = (k: EmailKind | "failed") => d.emails.filter((e) => (k === "failed" ? emailFailed(e) : e.kind === k)).length;
  const nav = (
    <nav className="dash-pills" aria-label="Kind of email">
      <Link href={href(ctx, { kind: null })} aria-current={!filter ? "true" : undefined}>All <span>{d.emails.length}</span></Link>
      {EMAIL_KINDS.map((k) => <Link key={k.kind} href={href(ctx, { kind: k.kind })} aria-current={filter === k.kind ? "true" : undefined}>{k.label} <span>{count(k.kind)}</span></Link>)}
      <Link href={href(ctx, { kind: "failed" })} aria-current={filter === "failed" ? "true" : undefined}>Failed <span>{count("failed")}</span></Link>
    </nav>
  );
  return (
    <AdminFrame email={who} section="emails" title={null} wide>
      <div className="dash-page">
        <Notes ctx={ctx} d={d} />
        <EmailLog d={d} ctx={ctx} filter={filter} nav={nav} />
      </div>
      {query.family && <FamilyDrawer ctx={ctx} d={d} id={query.family} />}
    </AdminFrame>
  );
}
