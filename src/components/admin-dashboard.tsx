// The admin home (D-099, round r22 option A): KPI tiles first, then the funnel beside the day-by-day chart, a
// "Needs you" list, the families table with a Stage column and stage filters, and the email report.
import Link from "next/link";
import { DailyBars, Funnel, Spark } from "@/components/admin-charts";
import { Card, Delta, Notes, RangeTabs, StageChip, TestMark, familyHref, href, type Ctx } from "@/components/admin-dashboard-parts";
import { ALL_STAGES, EMAIL_LABEL, RANGES, deliveryLine, emailDot, STAGE_SHORT, ago, at, kidsText, since, type Dashboard } from "@/lib/admin-dashboard";
import { ADMIN_PATH } from "@/lib/admin-view";
import type { ProgressSnapshot } from "@/lib/admin-progress";
import { ProgressCell } from "@/components/admin-progress";

/** Families per page of the table; the stage pills and search narrow it. */
const ROWS_MAX = 200;

export function DashboardView({ d, ctx, progress }: { d: Dashboard; ctx: Ctx; progress: ProgressSnapshot }) {
  const stage = ALL_STAGES.find((s) => s === ctx.query.stage) ?? null;
  const q = (ctx.query.q ?? "").trim().toLowerCase();
  const rows = d.families.filter((f) => (!stage || f.stage === stage) && (!q || `${f.name} ${f.email} ${kidsText(f)}`.toLowerCase().includes(q)));
  const period = d.range === "all" ? "all time" : d.range === "today" ? "today" : `the last ${RANGES[d.range].label.toLowerCase()}`;
  return (
    <div className="dash-page">
      <div className="dash-top">
        <div>
          <h1>Dashboard</h1>
          <p className="dash-muted">Numbers for {period}, in Pacific time. Updated {at(d.now).replace(/\.$/, "")}. <Link href={`${ADMIN_PATH}/activity`}>See the activity log</Link></p>
        </div>
        <RangeTabs ctx={ctx} range={d.range} />
      </div>
      <Notes ctx={ctx} d={d} />

      <div className="dash-kpis">
        {d.kpis.map((k) => (
          <div key={k.key} className="dash-kpi" title={k.hint}>
            <span className="dash-kpi-label">{k.label}</span>
            <b className="dash-kpi-value">{k.format === "cad" ? `$${k.value.toLocaleString("en-CA", { maximumFractionDigits: 0 })}` : k.value}{k.format === "%" ? "%" : ""}</b>
            {k.prev === null && k.spark.length === 0 ? <span className="dash-delta">right now{k.format === "cad" ? ", CAD" : ""}</span> : <Delta value={k.value} prev={k.prev} unit={k.format === "%" ? "%" : undefined} />}
            <Spark values={k.spark} tone={k.key === "paying" || k.key === "saved" ? "leaf" : "ink"} />
          </div>
        ))}
      </div>

      <div className="dash-two">
        <Card title="Funnel" aside={<span className="dash-muted">families who signed up {d.range === "all" ? "at any time" : period === "today" ? "today" : `in ${period}`}</span>}>
          <Funnel steps={d.funnel.map((s) => ({ label: s.stage === "paying" ? "Subscribed" : STAGE_SHORT[s.stage], value: s.inRange }))} />
          <p className="dash-foot">Each bar counts the families that got at least that far. The % is the share of the step above.</p>
        </Card>
        <Card title="Day by day">
          <DailyBars series={d.series} keys={["accounts", "started", "finished", "cards"]} />
        </Card>
      </div>

      {d.needs.length > 0 && (
        <Card title="Needs you" className="dash-needs">
          <ul>
            {d.needs.map((n) => (
              <li key={n.title} className={`is-${n.tone}`}>
                <b>{n.families.length}</b>
                <div>
                  <strong>{n.title}</strong><span className="dash-muted">{n.detail}</span>
                  <span className="dash-names">
                    {n.families.slice(0, 5).map((f) => <Link key={f.id} href={familyHref(ctx, f.id)}>{f.name}</Link>)}
                    {n.families.length > 5 && <span>and {n.families.length - 5} more</span>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Families" aside={
        <form action={ctx.path} method="get" className="dash-search">
          {Object.entries(ctx.query).filter(([k]) => k !== "q" && k !== "family").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input type="search" name="q" defaultValue={ctx.query.q ?? ""} placeholder="Search name, email, child" aria-label="Search families" />
        </form>
      }>
        <nav className="dash-pills" aria-label="Stage">
          <Link href={href(ctx, { stage: null })} aria-current={!stage ? "true" : undefined}>All <span>{d.families.length}</span></Link>
          {ALL_STAGES.map((s) => (
            <Link key={s} href={href(ctx, { stage: s })} aria-current={stage === s ? "true" : undefined}>{STAGE_SHORT[s]} <span>{d.stageCounts[s]}</span></Link>
          ))}
        </nav>
        <div className="dash-scroll">
          <table className="dash-table">
            <thead><tr><th scope="col">Parent</th><th scope="col">Children</th><th scope="col">Stage</th><th scope="col">In stage</th><th scope="col">Last email</th><th scope="col">Signed up</th><th scope="col">Last activity</th></tr></thead>
            <tbody>
              {rows.slice(0, ROWS_MAX).map((f) => (
                <tr key={f.id}>
                  <td><Link href={familyHref(ctx, f.id)}><b>{f.name}</b></Link><TestMark test={f.test} /><span className="dash-sub">{f.email}</span></td>
                  <td>{kidsText(f)}</td>
                  <td><StageChip stage={f.stage} />{f.expired && f.stage === "started" && <span className="dash-sub">test expired</span>}
                    {/* The newest test a child can still go on with: how far they got, live. */}
                    {(() => { const t = f.tests.find((x) => x.id in progress.tests); return t && <ProgressCell id={t.id} initial={progress} live={!ctx.demo} />; })()}
                  </td>
                  <td className="dash-nowrap">{since(f.stageAt, d.now)}</td>
                  <td>
                    {f.lastEmail ? <>{EMAIL_LABEL[f.lastEmail.kind]}{f.lastEmail.status === "failed" && <b className="dash-bad-text"> failed</b>}<span className="dash-sub">{ago(f.lastEmail.at, d.now)}</span></> : <span className="dash-muted">None</span>}
                    {f.unsubscribed && <span className="dash-sub dash-warn-text">Unsubscribed</span>}
                  </td>
                  <td className="dash-nowrap">{at(f.createdAt)}</td>
                  <td className="dash-nowrap">{ago(f.lastActivityAt, d.now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="dash-empty">No families match.</p>}
        </div>
        {rows.length > ROWS_MAX && <p className="dash-foot">Showing the {ROWS_MAX} most recently active of {rows.length}. Use a stage or the search to narrow the list.</p>}
      </Card>

      <Card title="Emails" aside={<span className="dash-muted">{d.emails.filter((e) => e.status === "sent" && e.kind !== "unsubscribe").length} sent at any time</span>}>
        <div className="dash-scroll">
          <table className="dash-table">
            <thead><tr><th scope="col">Email</th><th scope="col">Subject</th><th scope="col">Goes to</th><th scope="col">Sends when</th><th scope="col" className="dash-num">Sent, {d.range === "all" ? "all time" : RANGES[d.range].label.toLowerCase()}</th><th scope="col" className="dash-num">Sent, all time</th><th scope="col" className="dash-num">Failed</th><th scope="col" className="dash-num">Clicked</th><th scope="col">Last sent</th></tr></thead>
            <tbody>
              {d.emailSummary.map((e) => (
                <tr key={e.kind}>
                  <td><b>{e.label}</b></td><td className="dash-muted">{e.subject}</td><td>{e.to}</td><td>{e.trigger}</td>
                  <td className="dash-num">{e.sentInRange}</td><td className="dash-num">{e.sent}</td>
                  <td className="dash-num">{e.failed > 0 ? <b className="dash-bad-text">{e.failed}</b> : 0}</td>
                  <td className="dash-num">{e.kind === "alert" || e.kind === "unsubscribe" || e.sent === 0 ? "-" : <>{e.clicked}<span className="dash-sub">{Math.round((100 * e.clicked) / e.sent)}% of sent</span></>}</td>
                  <td className="dash-nowrap">{e.last ? <>{at(e.last)}<span className="dash-sub">{ago(e.last, d.now)}</span></> : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="dash-h3">Latest 12</h3>
        <ul className="dash-mails">
          {d.emails.slice(0, 12).map((e) => (
            <li key={e.id}>
              <span className={`dash-dot is-${emailDot(e)}`} />
              <div>
                <b>{EMAIL_LABEL[e.kind]}</b> {e.kind === "alert" ? "about" : e.kind === "unsubscribe" ? "by" : "to"} <Link href={familyHref(ctx, e.familyId)}>{e.familyName}</Link>
                <span className="dash-sub">{e.status === "failed" ? `Failed: ${e.error ?? "unknown error"}` : e.status === "pending" ? "Waiting to send" : e.kind === "unsubscribe" ? "Reminders turned off" : deliveryLine(e)?.bad ? deliveryLine(e)!.text : e.subject} · {at(e.at)}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="dash-foot">Not counted: sign-in codes, sign-in links and password emails. The site does not log them.</p>
      </Card>

      <Card title="How these numbers are counted" className="dash-how">
        <dl>
          {d.kpis.map((k) => <div key={k.key}><dt>{k.label}</dt><dd>{k.hint}</dd></div>)}
          <div><dt>Days and comparisons</dt><dd>Pacific days. Each number is compared with the same number of days just before, cut at the same time of day, so &ldquo;today&rdquo; is compared with yesterday up to this time.</dd></div>
          <div><dt>Stage</dt><dd>The furthest step each family reached, across all its children. Paying: a Stripe subscription that is active, trialing or past due. Cancelled: it had one, and none is paying now. A subscription whose first payment never went through is not counted.</dd></div>
          <div><dt>Funnel</dt><dd>Families who signed up in the range, by the furthest step they reached since. The % is the share of the step above.</dd></div>
          <div><dt>Left out</dt><dd>Admin accounts and families marked as a test. A deleted family leaves every number, past days included. Signups from before the free test launched (the old reservation form) are not in these numbers.</dd></div>
        </dl>
      </Card>
    </div>
  );
}

