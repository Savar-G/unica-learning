// One family's whole story in a side panel (?family=<id>) on the dashboard and activity pages (D-099).
import Link from "next/link";
import { adminEmailPath, adminParentPath, adminReportPath, adminTestPath } from "@/lib/admin-view";
import { EMAIL_LABEL, STAGES, clicksText, deliveryLine, emailDot, STAGE_ACTION, STAGE_TEXT, ago, at, nextReminderText, paymentText, type Dashboard, type Stage } from "@/lib/admin-dashboard";
import { stripeCustomerUrl as stripeUrl } from "@/lib/stripe";
import { StageChip, TestMark, href, type Ctx } from "@/components/admin-dashboard-parts";
import { ProgressPanel } from "@/components/admin-progress";
import type { ProgressSnapshot } from "@/lib/admin-progress";

export function FamilyDrawer({ ctx, d, id, progress }: { ctx: Ctx; d: Dashboard; id: string; progress: ProgressSnapshot }) {
  const f = d.families.find((x) => x.id === id);
  if (!f) return null;
  const close = href(ctx, { family: null });
  const full = ctx.demo ? null : adminParentPath(f.id);
  const path: Stage[] = f.reached.waitlist && !f.reached.card_started ? ["account", "started", "finished", "waitlist"] : [...STAGES, ...(f.reached.cancelled ? ["cancelled" as const] : [])];
  return (
    <>
      <Link href={close} className="dash-scrim" aria-label="Close family" />
      <aside className="dash-drawer" aria-label={`Family ${f.name}`}>
        <header>
          <div>
            <p className="dash-kicker">Family</p>
            <h2>{f.name}<TestMark test={f.test} /></h2>
            <p className="dash-muted">{f.email} · {f.postal ?? "no postal code"}{f.source ? ` · came from ${f.source}` : ""}</p>
          </div>
          <Link href={close} className="dash-x" aria-label="Close">×</Link>
        </header>
        <div className="dash-drawer-stage">
          <StageChip stage={f.stage} /> <span>since {at(f.stageAt)} ({ago(f.stageAt, d.now)})</span>
          <p>{STAGE_ACTION[f.stage]}</p>
          {f.unsubscribed && <p className="dash-warn-text">Reminders are off: this parent unsubscribed.</p>}
          {f.nextReminders.map((r) => <p key={r.childName + r.kind} className="dash-muted">Next email: {nextReminderText(r, d.now)}</p>)}
        </div>
        <h3>Journey</h3>
        <ol className="dash-journey">
          {path.map((s) => <li key={s} data-on={f.reached[s] ? true : undefined}><span>{STAGE_TEXT[s]}</span><time>{f.reached[s] ? at(f.reached[s]) : "not yet"}</time></li>)}
        </ol>
        <h3>Children and tests</h3>
        {f.children.map((c) => {
          const tests = f.tests.filter((t) => t.childId === c.id);
          return (
            <div key={c.id} className="dash-kid">
              <b>{c.name}</b> <span className="dash-muted">grade {c.grade}, {c.province}</span>
              {tests.length === 0 ? <p className="dash-muted">No test yet.</p> : (
                <ul>{tests.map((t) => (
                  <li key={t.id}>
                    {t.status === "completed" ? "Finished" : t.status === "expired" ? "Expired" : "In progress"} · {t.answered} answers · started {at(t.startedAt)}{t.completedAt ? `, finished ${at(t.completedAt)}` : ""}
                    {!ctx.demo && <> · <Link href={adminTestPath(t.id)}>Test</Link>{t.reportId && <> · <Link href={adminReportPath(t.reportId)}>Report</Link></>}</>}
                    {t.id in progress.tests && <ProgressPanel id={t.id} initial={progress} live={!ctx.demo} />}
                  </li>
                ))}</ul>
              )}
            </div>
          );
        })}
        <h3>Payment</h3>
        <p>{paymentText(f)}</p>
        {f.card?.customerId && stripeUrl(f.card.customerId) && <p><a href={stripeUrl(f.card.customerId)!} target="_blank" rel="noopener noreferrer">Open in Stripe</a></p>}
        <h3>Emails ({f.emails.length})</h3>
        {f.emails.length === 0 ? <p className="dash-muted">No emails yet.</p> : (
          <ul className="dash-mails">
            {f.emails.map((e) => (
              <li key={e.id}>
                <span className={`dash-dot is-${emailDot(e)}`} />
                <div><b>{EMAIL_LABEL[e.kind]}</b>{e.kind !== "unsubscribe" && <> <Link href={adminEmailPath(e.id, ctx.demo)} className="dash-muted">&ldquo;{e.subject}&rdquo;</Link></>}
                  <span className="dash-sub">{e.status === "failed" ? `Failed after ${e.attempts} ${e.attempts === 1 ? "try" : "tries"}: ${e.error ?? "unknown error"}` : e.status === "pending" ? "Waiting to send" : (deliveryLine(e)?.text ?? (e.kind === "alert" ? "Sent to you" : "Sent to the parent"))}{clicksText(e) && ` · ${clicksText(e)}`} · {at(e.at)}</span></div>
              </li>
            ))}
          </ul>
        )}
        {full && <p><Link href={full} className="dash-btn">Open the full family record</Link></p>}
      </aside>
    </>
  );
}
