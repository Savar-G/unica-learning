// PROTOTYPE ONLY. Variant C, "Activity inbox": a left rail of views with counts (like a mail app), a middle column
// that is either the day-by-day activity log, a stage list with journey dots, or the full email log, and a right
// rail with today against yesterday and a small 14-day chart.
import Link from "next/link";
import { DailyBars, Steps } from "./charts";
import { EMAIL_KINDS, EMAIL_LABEL, RANGES, STAGES, STAGE_ACTION, STAGE_SHORT, STAGE_TEXT, ago, at, dayKey, dayLabel, kidsText, type Activity, type Dashboard, type EmailKind, type Stage } from "./data";
import { RangeTabs, StageChip, familyHref, href, type Ctx } from "./parts";

const ICON: Record<Activity["kind"], string> = { account: "＋", test_start: "▶", test_finish: "✓", test_expired: "⌛", card_start: "$", card_saved: "▣", paying: "★", waitlist: "◷", email: "✉" };
const GROUPS = { all: "Everything", people: "Signups and tests", money: "Payments", email: "Emails" } as const;
type Group = keyof typeof GROUPS;
const inGroup = (a: Activity, g: Group) => g === "all" || (g === "email" ? a.kind === "email" : g === "money" ? ["card_start", "card_saved", "paying", "waitlist"].includes(a.kind) : ["account", "test_start", "test_finish"].includes(a.kind));
const rank = (s: Stage) => (s === "waitlist" ? 3 : STAGES.indexOf(s) + 1);

export function VariantC({ d, ctx }: { d: Dashboard; ctx: Ctx }) {
  const view = ctx.query.view ?? "activity";
  const today = dayKey(new Date(d.now));
  const yesterday = dayKey(new Date(new Date(d.now).getTime() - 86_400_000));
  const on = (day: string) => (iso: string | null | undefined) => !!iso && dayKey(iso) === day;
  const tally = (day: string) => ({
    accounts: d.families.filter((f) => on(day)(f.createdAt)).length,
    started: d.families.reduce((n, f) => n + f.tests.filter((t) => on(day)(t.startedAt)).length, 0),
    finished: d.families.reduce((n, f) => n + f.tests.filter((t) => on(day)(t.completedAt)).length, 0),
    saved: d.families.filter((f) => on(day)(f.reached.card_saved)).length,
    emails: d.emails.filter((e) => e.status === "sent" && e.kind !== "alert" && e.kind !== "unsubscribe" && on(day)(e.at)).length,
  });
  const t = tally(today), y = tally(yesterday);
  const last14 = Array.from({ length: 14 }, (_, i) => dayKey(new Date(new Date(d.now).getTime() - (13 - i) * 86_400_000)));
  const series14 = last14.map((day) => ({ day, ...tally(day), cards: tally(day).saved }));
  const failed = d.emails.filter((e) => e.status === "failed" && e.kind !== "alert");
  const needsCount = d.needs.reduce((n, x) => n + x.families.length, 0);

  return (
    <div className="pa-c">
      <aside className="pa-rail" aria-label="Views">
        <p className="pa-kicker">Watch</p>
        <RailLink ctx={ctx} view="activity" current={view} label="Activity" n={null} />
        <RailLink ctx={ctx} view="needs" current={view} label="Needs you" n={needsCount} tone={needsCount ? "warn" : undefined} />
        <p className="pa-kicker">Families by stage</p>
        <RailLink ctx={ctx} view="all" current={view} label="All families" n={d.families.length} />
        {[...STAGES, "waitlist" as const].map((s) => <RailLink key={s} ctx={ctx} view={`stage:${s}`} current={view} label={STAGE_SHORT[s]} n={d.stageCounts[s]} />)}
        <p className="pa-kicker">Emails</p>
        <RailLink ctx={ctx} view="emails" current={view} label="All emails" n={d.emails.length} />
        {EMAIL_KINDS.map((k) => <RailLink key={k.kind} ctx={ctx} view={`emails:${k.kind}`} current={view} label={k.label} n={d.emails.filter((e) => e.kind === k.kind).length} />)}
        <RailLink ctx={ctx} view="emails:failed" current={view} label="Failed" n={failed.length} tone={failed.length ? "bad" : undefined} />
      </aside>

      <main className="pa-mid">
        {view === "activity" && <ActivityLog d={d} ctx={ctx} />}
        {view === "needs" && <Needs d={d} ctx={ctx} />}
        {(view === "all" || view.startsWith("stage:")) && <StageList d={d} ctx={ctx} stage={view === "all" ? null : (view.slice(6) as Stage)} />}
        {view.startsWith("emails") && <EmailLog d={d} ctx={ctx} kind={view.split(":")[1] as EmailKind | "failed" | undefined} />}
      </main>

      <aside className="pa-side" aria-label="Today">
        <h2>Today <span className="pa-muted">vs yesterday</span></h2>
        <dl className="pa-vs">
          {([["accounts", "New accounts"], ["started", "Tests started"], ["finished", "Tests finished"], ["saved", "Cards saved"], ["emails", "Emails sent"]] as const).map(([key, label]) => (
            <div key={key}><dt>{label}</dt><dd><b>{t[key]}</b><span className={t[key] > y[key] ? "is-up" : t[key] < y[key] ? "is-down" : ""}>{y[key]}</span></dd></div>
          ))}
        </dl>
        <h2>Last 14 days</h2>
        <DailyBars series={series14} keys={["accounts", "finished"]} height={170} width={300} />
        <h2>All time</h2>
        <dl className="pa-vs is-plain">
          <div><dt>Families</dt><dd><b>{d.families.length}</b></dd></div>
          <div><dt>Finished a test</dt><dd><b>{d.funnel[2].ever}</b></dd></div>
          <div><dt>Card saved</dt><dd><b>{d.funnel[4].ever}</b></dd></div>
          <div><dt>Paying</dt><dd><b>{d.funnel[5].ever}</b></dd></div>
        </dl>
        {d.stripeNote && <p className="pa-note">{d.stripeNote}</p>}
      </aside>
    </div>
  );
}

function RailLink({ ctx, view, current, label, n, tone }: { ctx: Ctx; view: string; current: string; label: string; n: number | null; tone?: "warn" | "bad" }) {
  return <Link className="pa-rail-link" href={href(ctx, { view, group: null, stage: null })} aria-current={view === current ? "true" : undefined}>{label}{n !== null && <span className={tone ? `is-${tone}` : ""}>{n}</span>}</Link>;
}

function ActivityLog({ d, ctx }: { d: Dashboard; ctx: Ctx }) {
  const group = (ctx.query.group as Group | undefined) ?? "all";
  const days = new Set(d.days);
  const items = d.activity.filter((a) => (d.range === "all" || days.has(dayKey(a.at))) && inGroup(a, group) && a.email?.kind !== "alert");
  const byDay = new Map<string, Activity[]>();
  for (const a of items.slice(0, 400)) byDay.set(dayKey(a.at), [...(byDay.get(dayKey(a.at)) ?? []), a]);
  const today = dayKey(new Date(d.now));
  return (
    <>
      <div className="pa-top"><h1>Activity</h1><RangeTabs ctx={ctx} range={d.range} /></div>
      <nav className="pa-pills" aria-label="Kind">
        {(Object.keys(GROUPS) as Group[]).map((g) => <Link key={g} href={href(ctx, { group: g === "all" ? null : g })} aria-current={g === group ? "true" : undefined}>{GROUPS[g]} <span>{d.activity.filter((a) => (d.range === "all" || days.has(dayKey(a.at))) && inGroup(a, g) && a.email?.kind !== "alert").length}</span></Link>)}
      </nav>
      {byDay.size === 0 && <p className="pa-empty">Nothing happened in {RANGES[d.range].label.toLowerCase()}.</p>}
      {[...byDay].map(([day, list]) => (
        <section key={day} className="pa-day">
          <h2>{day === today ? "Today" : dayLabel(day)} <span className="pa-muted">{list.length} events</span></h2>
          <ul className="pa-feed">
            {list.map((a, i) => (
              <li key={i} className={`is-${a.kind}${a.email?.status === "failed" ? " is-failed" : ""}`}>
                <span className="pa-ico" aria-hidden="true">{ICON[a.kind]}</span>
                <time>{at(a.at).split(", ").pop()}</time>
                <span><Link href={href(ctx, { family: a.familyId })}><b>{a.familyName}</b></Link> {a.text}{a.email?.status === "failed" && <b className="pa-bad-text"> (failed: {a.email.error})</b>}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function StageList({ d, ctx, stage }: { d: Dashboard; ctx: Ctx; stage: Stage | null }) {
  const rows = d.families.filter((f) => !stage || f.stage === stage).sort((a, b) => (stage ? a.stageAt.localeCompare(b.stageAt) : b.lastActivityAt.localeCompare(a.lastActivityAt)));
  return (
    <>
      <div className="pa-top"><h1>{stage ? STAGE_TEXT[stage] : "All families"} <span className="pa-muted">{rows.length}</span></h1></div>
      {stage && <p className="pa-lead">{STAGE_ACTION[stage]} Longest waiting first.</p>}
      <ul className="pa-rows">
        {rows.map((f) => (
          <li key={f.id}>
            <Link href={familyHref(ctx, f)}>
              <span className="pa-row-main"><b>{f.name}</b><span className="pa-muted">{kidsText(f)}</span></span>
              <Steps reached={rank(f.stage)} waitlist={f.stage === "waitlist"} />
              <span className="pa-row-stage"><StageChip stage={f.stage} /><span className="pa-sub">{ago(f.stageAt, d.now).replace(" ago", "")} in stage</span></span>
              <span className="pa-row-mail">{f.lastEmail ? <>✉ {EMAIL_LABEL[f.lastEmail.kind]}<span className="pa-sub">{f.lastEmail.status === "failed" ? "failed " : ""}{ago(f.lastEmail.at, d.now)}</span></> : <span className="pa-muted">no email yet</span>}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function Needs({ d, ctx }: { d: Dashboard; ctx: Ctx }) {
  return (
    <>
      <div className="pa-top"><h1>Needs you</h1></div>
      {d.needs.length === 0 && <p className="pa-empty">Nothing needs you right now.</p>}
      {d.needs.map((n) => (
        <section key={n.title} className={`pa-need is-${n.tone}`}>
          <h2>{n.title} <span>{n.families.length}</span></h2>
          <p className="pa-muted">{n.detail}</p>
          <ul>{n.families.map((f) => <li key={f.id}><Link href={familyHref(ctx, f)}>{f.name}</Link> <span className="pa-muted">{kidsText(f)} · {ago(f.stageAt, d.now)}</span></li>)}</ul>
        </section>
      ))}
    </>
  );
}

function EmailLog({ d, ctx, kind }: { d: Dashboard; ctx: Ctx; kind: EmailKind | "failed" | undefined }) {
  const rows = d.emails.filter((e) => !kind || (kind === "failed" ? e.status === "failed" : e.kind === kind));
  const meta = kind && kind !== "failed" ? EMAIL_KINDS.find((k) => k.kind === kind) : null;
  return (
    <>
      <div className="pa-top"><h1>{kind === "failed" ? "Failed emails" : meta ? meta.label : "All emails"} <span className="pa-muted">{rows.length}</span></h1></div>
      {meta && <p className="pa-lead">Subject: &ldquo;{meta.subject}&rdquo;. Goes to: {meta.to.toLowerCase()}. Sends when: {meta.trigger.toLowerCase()}.</p>}
      <div className="pa-scroll">
        <table className="pa-table">
          <thead><tr><th>When</th><th>Email</th><th>Family</th><th>Subject</th><th>Result</th></tr></thead>
          <tbody>
            {rows.slice(0, 300).map((e) => (
              <tr key={e.id}>
                <td className="pa-nowrap">{at(e.at)}<span className="pa-sub">{ago(e.at, d.now)}</span></td>
                <td>{EMAIL_LABEL[e.kind]}</td>
                <td><Link href={href(ctx, { family: e.familyId })}>{e.familyName}</Link></td>
                <td className="pa-muted">{e.kind === "unsubscribe" ? "-" : e.subject}</td>
                <td>{e.status === "failed" ? <span className="pa-bad-text">Failed after {e.attempts} tries: {e.error}</span> : e.status === "pending" ? "Waiting" : "Sent"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pa-foot">Sign-in codes, sign-in links and password emails are not logged by the site.</p>
    </>
  );
}
