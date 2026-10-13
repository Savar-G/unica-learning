// PROTOTYPE ONLY. Variant A, "Daily dashboard": KPI tiles first, then the funnel and the daily chart side by side,
// a "needs you" list, the families table with a Stage column and stage filters, and the email report.
import Link from "next/link";
import { DailyBars, Funnel, Spark } from "./charts";
import { EMAIL_LABEL, RANGES, STAGES, STAGE_SHORT, ago, at, kidsText, type Dashboard, type Stage } from "./data";
import { Card, Delta, RangeTabs, StageChip, familyHref, href, type Ctx } from "./parts";

export function VariantA({ d, ctx }: { d: Dashboard; ctx: Ctx }) {
  const stage = (ctx.query.stage as Stage | undefined) ?? null;
  const q = (ctx.query.q ?? "").toLowerCase();
  const rows = d.families.filter((f) => (!stage || f.stage === stage) && (!q || `${f.name} ${f.email} ${kidsText(f)}`.toLowerCase().includes(q)));
  const rangeText = RANGES[d.range].label.toLowerCase();
  return (
    <div className="pa-a">
      <div className="pa-top">
        <div>
          <h1>Today at Unica</h1>
          <p className="pa-muted">Numbers for {d.range === "all" ? "all time" : d.range === "today" ? "today" : `the last ${rangeText}`}, Pacific time. Updated {at(d.now).replace(/\.$/, "")}.</p>
        </div>
        <RangeTabs ctx={ctx} range={d.range} />
      </div>
      {d.stripeNote && <p className="pa-note">{d.stripeNote}</p>}

      <div className="pa-kpis">
        {d.kpis.map((k) => (
          <div key={k.key} className="pa-kpi" title={k.hint}>
            <span className="pa-kpi-label">{k.label}</span>
            <b className="pa-kpi-value">{k.value}{k.unit}</b>
            <Delta value={k.value} prev={k.prev} unit={k.unit} />
            <Spark values={k.spark} tone={k.key === "paying" || k.key === "saved" ? "leaf" : "ink"} />
          </div>
        ))}
      </div>

      <div className="pa-two">
        <Card title="Funnel" aside={<span className="pa-muted">families who signed up {d.range === "all" ? "ever" : d.range === "today" ? "today" : `in the last ${rangeText}`}</span>}>
          <Funnel steps={d.funnel.map((s) => ({ label: STAGE_SHORT[s.stage], value: s.inRange }))} />
          <p className="pa-foot">Each bar counts families that got at least that far. The % is the share of the step above.</p>
        </Card>
        <Card title="Day by day">
          <DailyBars series={d.series} keys={["accounts", "started", "finished", "cards"]} />
        </Card>
      </div>

      {d.needs.length > 0 && (
        <Card title="Needs you" className="pa-needs">
          <ul>
            {d.needs.map((n) => (
              <li key={n.title} className={`is-${n.tone}`}>
                <b>{n.families.length}</b>
                <div><strong>{n.title}</strong><span className="pa-muted">{n.detail}</span>
                  <span className="pa-names">{n.families.slice(0, 5).map((f) => <Link key={f.id} href={familyHref(ctx, f)}>{f.name}</Link>)}{n.families.length > 5 && <span>+{n.families.length - 5} more</span>}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Families" aside={
        <form action="/admin" method="get" className="pa-search">
          {Object.entries(ctx.query).filter(([k]) => k !== "q").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input type="search" name="q" defaultValue={ctx.query.q ?? ""} placeholder="Search name, email, child" aria-label="Search families" />
        </form>
      }>
        <nav className="pa-pills" aria-label="Stage">
          <Link href={href(ctx, { stage: null })} aria-current={!stage ? "true" : undefined}>All <span>{d.families.length}</span></Link>
          {[...STAGES, "waitlist" as const].map((s) => (
            <Link key={s} href={href(ctx, { stage: s })} aria-current={stage === s ? "true" : undefined}>{STAGE_SHORT[s]} <span>{d.stageCounts[s]}</span></Link>
          ))}
        </nav>
        <div className="pa-scroll">
          <table className="pa-table">
            <thead><tr><th>Parent</th><th>Children</th><th>Stage</th><th>In stage</th><th>Last email</th><th>Signed up</th><th>Last activity</th></tr></thead>
            <tbody>
              {rows.slice(0, 200).map((f) => (
                <tr key={f.id}>
                  <td><Link href={familyHref(ctx, f)}><b>{f.name}</b></Link><span className="pa-sub">{f.email}</span></td>
                  <td>{kidsText(f)}</td>
                  <td><StageChip stage={f.stage} />{f.expired && f.stage === "started" && <span className="pa-sub">test expired</span>}</td>
                  <td className="pa-nowrap">{ago(f.stageAt, d.now).replace(" ago", "")}</td>
                  <td>{f.lastEmail ? <>{EMAIL_LABEL[f.lastEmail.kind]}{f.lastEmail.status === "failed" && <b className="pa-bad-text"> failed</b>}<span className="pa-sub">{ago(f.lastEmail.at, d.now)}</span></> : <span className="pa-muted">none</span>}{f.unsubscribed && <span className="pa-sub pa-warn-text">unsubscribed</span>}</td>
                  <td className="pa-nowrap">{at(f.createdAt)}</td>
                  <td className="pa-nowrap">{ago(f.lastActivityAt, d.now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="pa-empty">No families match.</p>}
        </div>
      </Card>

      <Card title="Emails" aside={<span className="pa-muted">{d.emails.filter((e) => e.status === "sent").length} sent all time</span>}>
        <div className="pa-scroll">
          <table className="pa-table">
            <thead><tr><th>Email</th><th>Subject</th><th>Goes to</th><th>When it sends</th><th className="pa-num">Sent, {rangeText}</th><th className="pa-num">Sent, all</th><th className="pa-num">Failed</th><th>Last sent</th></tr></thead>
            <tbody>
              {d.emailSummary.map((e) => (
                <tr key={e.kind}>
                  <td><b>{e.label}</b></td><td className="pa-muted">{e.subject}</td><td>{e.to}</td><td>{e.trigger}</td>
                  <td className="pa-num">{e.sentInRange}</td><td className="pa-num">{e.sent}</td>
                  <td className="pa-num">{e.failed > 0 ? <b className="pa-bad-text">{e.failed}</b> : 0}</td>
                  <td className="pa-nowrap">{e.last ? <>{at(e.last)}<span className="pa-sub">{ago(e.last, d.now)}</span></> : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="pa-h3">Latest 12</h3>
        <ul className="pa-mails">
          {d.emails.slice(0, 12).map((e) => (
            <li key={e.id}><span className={`pa-dot is-${e.status}`} /><div><b>{EMAIL_LABEL[e.kind]}</b> to <Link href={href(ctx, { family: e.familyId })}>{e.familyName}</Link><span className="pa-sub">{e.status === "failed" ? `Failed: ${e.error}` : e.subject} · {at(e.at)}</span></div></li>
          ))}
        </ul>
        <p className="pa-foot">Not counted here: sign-in codes and links, and password emails. Supabase and Resend send them and the site does not log them.</p>
      </Card>
    </div>
  );
}
