import Link from "next/link";
import { AdminFrame } from "@/components/admin-frame";
import { Pills, SectionHead } from "@/components/admin-blocks";
import { href } from "@/components/admin-dashboard-parts";
import { EmailKindBars, EmailLog } from "@/components/admin-emails";
import { FamilyDrawer } from "@/components/admin-family";
import { EMAIL_KINDS, emailFailed, type EmailKind } from "@/lib/admin-dashboard";
import { loadDashboard } from "@/lib/admin-dashboard-load";
import { ADMIN_PATH } from "@/lib/admin-view";
import { pageMetadata } from "@/lib/metadata";

const PATH = `${ADMIN_PATH}/emails`;
export const metadata = pageMetadata({ path: PATH, title: "Admin: emails", description: "Admin area.", index: false });

// Every email the site logs (D-099): the emails by kind as bars, then the log with a filter per kind. Failed emails
// lead the page when there are any. Admins only (loadDashboard runs requireAdmin). Every number is of the real
// families; the log also lists the test families' emails, tagged, while "Show test families" is on.
export default async function EmailsPage({ searchParams }: PageProps<"/admin/emails">) {
  const { who, d, progress, query, demo } = await loadDashboard(await searchParams);
  const ctx = { path: PATH, query, demo };
  const filter: EmailKind | "failed" | null = query.kind === "failed" ? "failed" : (EMAIL_KINDS.find((k) => k.kind === query.kind)?.kind ?? null);
  // The counts: the real families' emails only (the list can also show the test families' emails, tagged).
  const count = (k: EmailKind | "failed") => d.real.emails.filter((e) => (k === "failed" ? emailFailed(e) : e.kind === k)).length;
  const failed = count("failed");
  const pills = [
    { key: "all", href: href(ctx, { kind: null }), label: "All", count: d.real.emails.length, current: !filter },
    ...EMAIL_KINDS.filter((k) => count(k.kind) > 0 || filter === k.kind).map((k) => ({ key: k.kind, href: href(ctx, { kind: k.kind }), label: k.label, count: count(k.kind), current: filter === k.kind })),
    { key: "failed", href: href(ctx, { kind: "failed" }), label: "Failed", count: failed, current: filter === "failed" },
  ];
  return (
    <AdminFrame email={who} title="Emails" lead="Every email the site sent to parents and to the team, and what happened to it." testNote={d.tests.shown && d.tests.count > 0}>
      {demo && <p className="adm-note">Demo data: made-up families, not your database. Local development only.</p>}
      {failed > 0 && filter !== "failed" && (
        <p className="ab-needs" role="status">
          <span><b>Needs you:</b> {failed === 1 ? "1 email did not reach the parent." : `${failed} emails did not reach the parent.`} Check the address with the family.</span>
          <Link className="btn adm-btn" href={href(ctx, { kind: "failed" })} prefetch={false}>See failed emails</Link>
        </p>
      )}
      <section className="ap-card" aria-labelledby="ap-mail-kinds">
        <SectionHead id="ap-mail-kinds" title="By kind" line="All time, real families. Each bar is the emails sent; the darker part is the ones a parent clicked." />
        <EmailKindBars d={d} ctx={ctx} />
      </section>
      <EmailLog d={d} ctx={ctx} filter={filter} nav={<Pills label="Kind of email" pills={pills} />} />
      {query.family && <FamilyDrawer ctx={ctx} d={d} id={query.family} progress={progress} />}
    </AdminFrame>
  );
}
