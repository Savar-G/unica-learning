// PROTOTYPE ONLY. One family's whole story in a side panel (?family=<id>), on top of any variant.
import Link from "next/link";
import { adminReportPath, adminTestPath } from "@/lib/admin-view";
import { EMAIL_LABEL, STAGES, STAGE_ACTION, STAGE_TEXT, ago, at, type Dashboard, type Stage } from "./data";
import { StageChip, href, parentPage, type Ctx } from "./parts";

export function FamilyDrawer({ ctx, d, id }: { ctx: Ctx; d: Dashboard; id: string }) {
  const f = d.families.find((x) => x.id === id);
  if (!f) return null;
  const close = href(ctx, { family: null });
  const full = parentPage(ctx, f);
  const path: Stage[] = f.reached.waitlist && !f.reached.card_started ? ["account", "started", "finished", "waitlist"] : [...STAGES];
  return (
    <>
      <Link href={close} className="pa-scrim" aria-label="Close family" />
      <aside className="pa-drawer" aria-label={`Family ${f.name}`}>
        <header>
          <div>
            <p className="pa-kicker">Family</p>
            <h2>{f.name}</h2>
            <p className="pa-muted">{f.email} · {f.postal}{f.source ? ` · came from ${f.source}` : ""}</p>
          </div>
          <Link href={close} className="pa-x" aria-label="Close">×</Link>
        </header>
        <div className="pa-drawer-stage">
          <StageChip stage={f.stage} /> <span>since {at(f.stageAt)} ({ago(f.stageAt, d.now)})</span>
          <p>{STAGE_ACTION[f.stage]}</p>
          {f.unsubscribed && <p className="pa-warn-text">Reminders are off: this parent unsubscribed.</p>}
        </div>
        <h3>Journey</h3>
        <ol className="pa-journey">
          {path.map((s) => <li key={s} data-on={f.reached[s] ? true : undefined}><span>{STAGE_TEXT[s]}</span><time>{f.reached[s] ? at(f.reached[s]) : "not yet"}</time></li>)}
        </ol>
        <h3>Children and tests</h3>
        {f.children.map((c) => {
          const tests = f.tests.filter((t) => t.childName === c.name);
          return (
            <div key={c.id} className="pa-kid">
              <b>{c.name}</b> <span className="pa-muted">grade {c.grade}, {c.province}</span>
              {tests.length === 0 ? <p className="pa-muted">No test yet.</p> : (
                <ul>{tests.map((t) => (
                  <li key={t.id}>
                    {t.status === "completed" ? "Finished" : t.status === "expired" ? "Expired" : "In progress"} · {t.answered} answers · started {at(t.startedAt)}{t.completedAt ? `, finished ${at(t.completedAt)}` : ""}
                    {!ctx.demo && <> · <Link href={adminTestPath(t.id)}>Test</Link>{t.reportId && <> · <Link href={adminReportPath(t.reportId)}>Report</Link></>}</>}
                  </li>
                ))}</ul>
              )}
            </div>
          );
        })}
        <h3>Payment</h3>
        {f.card ? (
          <p>{f.card.plan}, CAD {f.card.price}/month. {f.card.savedAt ? `Card saved ${at(f.card.savedAt)}.` : `Opened the payment page ${at(f.card.updatedAt)}, no card saved.`}
            {f.subscription ? ` Stripe subscription ${f.subscription.status} since ${at(f.subscription.since)}.` : f.card.savedAt ? " No subscription yet." : ""}</p>
        ) : <p className="pa-muted">{f.reached.waitlist ? `On the waitlist since ${at(f.reached.waitlist)}.` : "Has not opened the payment page."}</p>}
        <h3>Emails ({f.emails.length})</h3>
        {f.emails.length === 0 ? <p className="pa-muted">No emails yet.</p> : (
          <ul className="pa-mails">
            {f.emails.map((e) => (
              <li key={e.id}>
                <span className={`pa-dot is-${e.status}`} />
                <div><b>{EMAIL_LABEL[e.kind]}</b>{e.kind !== "unsubscribe" && <span className="pa-muted"> &ldquo;{e.subject}&rdquo;</span>}
                  <span className="pa-sub">{e.status === "failed" ? `Failed after ${e.attempts} tries: ${e.error ?? "unknown error"}` : e.status === "pending" ? "Waiting to send" : e.kind === "alert" ? "Sent to you" : "Sent to the parent"} · {at(e.at)}</span></div>
              </li>
            ))}
          </ul>
        )}
        {full && <p><Link href={full} className="pa-btn">Open the full family record</Link></p>}
      </aside>
    </>
  );
}
