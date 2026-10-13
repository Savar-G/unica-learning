// PROTOTYPE ONLY. Variant B, "Pipeline board": one column per stage, every family a card that says how long it has
// waited and what was last sent. The numbers sit in one line above; an email heat map sits below.
import Link from "next/link";
import { Heat } from "./charts";
import { EMAIL_KINDS, RANGES, STAGES, STAGE_ACTION, STAGE_TEXT, ago, dayKey, type Dashboard, type Family, type Stage } from "./data";
import { RangeTabs, familyHref, href, type Ctx } from "./parts";

const COLUMNS: Stage[] = [...STAGES, "waitlist"];

export function VariantB({ d, ctx }: { d: Dashboard; ctx: Ctx }) {
  const hideOld = ctx.query.old !== "1";
  const now = new Date(d.now).getTime();
  const fresh = (f: Family) => !hideOld || f.stage === "card_saved" || now - new Date(f.lastActivityAt).getTime() < 30 * 86_400_000;
  const k = Object.fromEntries(d.kpis.map((x) => [x.key, x]));
  const days = d.days.length >= 7 ? d.days : Array.from({ length: 14 }, (_, i) => dayKey(new Date(now - (13 - i) * 86_400_000)));
  return (
    <div className="pa-b">
      <div className="pa-top">
        <h1>Pipeline</h1>
        <RangeTabs ctx={ctx} range={d.range} />
      </div>
      <p className="pa-strip">
        <span><b>{k.accounts.value}</b> new accounts</span>
        <span><b>{k.started.value}</b> tests started</span>
        <span><b>{k.finished.value}</b> finished ({k.completion.value}%)</span>
        <span><b>{k.saved.value}</b> cards saved</span>
        <span><b>{k.paying.value}</b> new paying</span>
        <span><b>{k.emails.value}</b> emails sent</span>
        <em>{RANGES[d.range].label}</em>
      </p>
      {d.stripeNote && <p className="pa-note">{d.stripeNote}</p>}

      <div className="pa-board">
        {COLUMNS.map((s, i) => {
          const fams = d.families.filter((f) => f.stage === s && fresh(f)).sort((a, b) => a.stageAt.localeCompare(b.stageAt));
          const reached = d.funnel.find((x) => x.stage === s)?.ever ?? 0;
          const prev = i > 0 && i < STAGES.length ? d.funnel[i - 1].ever : 0;
          return (
            <section key={s} className={`pa-col is-${s}`} aria-label={STAGE_TEXT[s]}>
              <header>
                <h2>{STAGE_TEXT[s]}</h2>
                <b>{d.stageCounts[s]}</b>
                <p>{s === "waitlist" ? "Outside BC" : i === 0 ? `${reached} signed up in all` : `${reached} got here${prev ? `, ${Math.round((reached / prev) * 100)}% of the step before` : ""}`}</p>
              </header>
              <p className="pa-col-hint">{STAGE_ACTION[s]}</p>
              <ul>
                {fams.slice(0, 40).map((f) => {
                  const waited = (now - new Date(f.stageAt).getTime()) / 86_400_000;
                  return (
                    <li key={f.id} className={waited > 3 && s !== "paying" && s !== "waitlist" ? "is-stale" : ""}>
                      <Link href={familyHref(ctx, f)}>
                        <span className="pa-card-name">{f.name}</span>
                        <span className="pa-card-kids">{f.children.map((c) => `${c.name}, gr ${c.grade}${c.province === "BC" ? "" : `, ${c.province}`}`).join(" · ")}</span>
                        <span className="pa-card-meta">
                          <span>{ago(f.stageAt, d.now).replace(" ago", "")} here</span>
                          {f.lastEmail && <span className={f.lastEmail.status === "failed" ? "pa-bad-text" : ""}>✉ {EMAIL_KINDS.find((e) => e.kind === f.lastEmail!.kind)!.label.replace(" reminder", "")} {ago(f.lastEmail.at, d.now)}{f.lastEmail.status === "failed" ? ", failed" : ""}</span>}
                          {f.unsubscribed && <span className="pa-warn-text">unsubscribed</span>}
                          {s === "started" && f.expired && <span>expired</span>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
                {fams.length > 40 && <li className="pa-more">+{fams.length - 40} more</li>}
                {fams.length === 0 && <li className="pa-col-empty">Nobody here</li>}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="pa-foot">
        Oldest first in each column. A card with an orange edge has waited more than 3 days.{" "}
        {hideOld ? <>Families with no activity for 30 days are hidden. <Link href={href(ctx, { old: "1" })}>Show them</Link>.</> : <Link href={href(ctx, { old: null })}>Hide families with no activity for 30 days</Link>}
      </p>

      <section className="pa-card">
        <header className="pa-card-head"><h2>Emails, day by day</h2><span className="pa-muted">darker = more sent that day</span></header>
        <Heat days={days} rows={EMAIL_KINDS.filter((e) => e.kind !== "unsubscribe").map((e) => ({ label: e.label, counts: days.map((day) => d.emails.filter((m) => m.kind === e.kind && m.status === "sent" && dayKey(m.at) === day).length) }))} />
        <dl className="pa-mailstats">
          {d.emailSummary.filter((e) => e.kind !== "unsubscribe").map((e) => (
            <div key={e.kind}>
              <dt>{e.label}</dt>
              <dd><b>{e.sent}</b> sent{e.failed > 0 && <>, <span className="pa-bad-text">{e.failed} failed</span></>}</dd>
              <dd className="pa-muted">last {ago(e.last, d.now)}</dd>
              <dd className="pa-muted pa-small">&ldquo;{e.subject}&rdquo;</dd>
            </div>
          ))}
          <div><dt>Unsubscribes</dt><dd><b>{d.emailSummary.find((e) => e.kind === "unsubscribe")!.sent}</b> parents</dd></div>
        </dl>
      </section>
    </div>
  );
}
