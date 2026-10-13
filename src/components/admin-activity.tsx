// The Activity tab (D-099, round r22 option C): a rail of views with counts, like a mail app; a middle column that is
// the day-by-day activity log, the "Needs you" lists, a stage list with journey dots, or the email log; and a side
// column with today against yesterday, a 14-day chart and the all-time totals.
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { DailyBars, Steps } from "@/components/admin-charts";
import { Notes, RangeTabs, StageChip, TestMark, familyHref, href, type Ctx } from "@/components/admin-dashboard-parts";
import {
  ALL_STAGES,
  EMAIL_KINDS,
  EMAIL_LABEL,
  RANGES,
  STAGES,
  STAGE_ACTION,
  STAGE_SHORT,
  STAGE_TEXT,
  ago,
  at,
  dayKey,
  dayLabel,
  kidsText,
  shiftDay,
  since,
  type Activity,
  type Dashboard,
  type EmailKind,
  type Family,
  type Stage,
} from "@/lib/admin-dashboard";

const ICON: Record<Activity["kind"], string> = { account: "+", test_start: "▶", test_finish: "✓", card_start: "$", card_saved: "▣", paying: "★", cancelled: "✕", waitlist: "◷", email: "✉" };
const GROUPS = { all: "Everything", people: "Signups and tests", money: "Payments", email: "Emails" } as const;
type Group = keyof typeof GROUPS;
const MONEY: Activity["kind"][] = ["card_start", "card_saved", "paying", "cancelled", "waitlist"];
const PEOPLE: Activity["kind"][] = ["account", "test_start", "test_finish"];
const inGroup = (a: Activity, g: Group) => g === "all" || (g === "email" ? a.kind === "email" : (g === "money" ? MONEY : PEOPLE).includes(a.kind));
/** Events shown in the log: the report alert to Savar is left out, since the report email beside it says the same. */
const shown = (a: Activity) => a.email?.kind !== "alert";
const LOG_MAX = 400;

type View = { kind: "activity" } | { kind: "needs" } | { kind: "families"; stage: Stage | null } | { kind: "emails"; filter: EmailKind | "failed" | null };

function parseView(raw: string | undefined): View {
  if (raw === "needs") return { kind: "needs" };
  if (raw === "families") return { kind: "families", stage: null };
  if (raw?.startsWith("stage:")) {
    const stage = ALL_STAGES.find((s) => s === raw.slice(6));
    if (stage) return { kind: "families", stage };
  }
  if (raw === "emails") return { kind: "emails", filter: null };
  if (raw?.startsWith("emails:")) {
    const k = raw.slice(7);
    const filter = k === "failed" ? "failed" : EMAIL_KINDS.find((e) => e.kind === k)?.kind;
    if (filter) return { kind: "emails", filter };
  }
  return { kind: "activity" };
}

export function ActivityView({ d, ctx }: { d: Dashboard; ctx: Ctx }) {
  const raw = ctx.query.view ?? "activity";
  const view = parseView(raw);
  const failed = d.emails.filter((e) => e.status === "failed" && e.kind !== "alert").length;
  const needs = new Set(d.needs.flatMap((n) => n.families.map((f) => f.id))).size;
  const rail = (key: string, label: string, n: number | null, tone?: "warn" | "bad") => (
    <Link className="dash-rail-link" href={href(ctx, { view: key === "activity" ? null : key, group: null })} aria-current={key === raw ? "true" : undefined}>
      {label}{n !== null && <span className={tone && n > 0 ? `is-${tone}` : ""}>{n}</span>}
    </Link>
  );
  return (
    <div className="dash-inbox">
      <nav className="dash-rail" aria-label="Activity views">
        <p className="dash-kicker">Watch</p>
        {rail("activity", "Activity", null)}
        {rail("needs", "Needs you", needs, "warn")}
        <p className="dash-kicker">Families by stage</p>
        {rail("families", "All families", d.families.length)}
        {ALL_STAGES.map((s) => <Fragment key={s}>{rail(`stage:${s}`, STAGE_SHORT[s], d.stageCounts[s])}</Fragment>)}
        <p className="dash-kicker">Emails</p>
        {rail("emails", "All emails", d.emails.length)}
        {EMAIL_KINDS.map((k) => <Fragment key={k.kind}>{rail(`emails:${k.kind}`, k.label, d.emails.filter((e) => e.kind === k.kind).length)}</Fragment>)}
        {rail("emails:failed", "Failed", failed, "bad")}
      </nav>

      <div className="dash-mid">
        <Notes ctx={ctx} d={d} />
        {view.kind === "activity" && <ActivityLog d={d} ctx={ctx} />}
        {view.kind === "needs" && <NeedsList d={d} ctx={ctx} />}
        {view.kind === "families" && <StageList d={d} ctx={ctx} stage={view.stage} />}
        {view.kind === "emails" && <EmailLog d={d} ctx={ctx} filter={view.filter} />}
      </div>

      <Today d={d} />
    </div>
  );
}

function Today({ d }: { d: Dashboard }) {
  const now = new Date(d.now);
  const today = dayKey(now);
  const yesterday = shiftDay(today, -1);
  const last14 = Array.from({ length: 14 }, (_, i) => shiftDay(today, i - 13));
  const count = (day: string) => {
    const on = (iso: string | null | undefined) => !!iso && dayKey(iso) === day;
    return {
      accounts: d.families.filter((f) => on(f.createdAt)).length,
      started: d.families.reduce((n, f) => n + f.tests.filter((t) => on(t.startedAt)).length, 0),
      finished: d.families.reduce((n, f) => n + f.tests.filter((t) => on(t.completedAt)).length, 0),
      cards: d.families.filter((f) => on(f.reached.card_saved)).length,
      emails: d.emails.filter((e) => e.status === "sent" && e.kind !== "alert" && e.kind !== "unsubscribe" && on(e.at)).length,
    };
  };
  const t = count(today);
  const y = count(yesterday);
  const rows = [["accounts", "New accounts"], ["started", "Tests started"], ["finished", "Tests finished"], ["cards", "Cards saved"], ["emails", "Emails sent"]] as const;
  const ever = (s: (typeof STAGES)[number]) => d.funnel.find((f) => f.stage === s)?.ever ?? 0;
  return (
    <aside className="dash-side" aria-label="Today">
      <h2>Today <span className="dash-muted">against yesterday</span></h2>
      <dl className="dash-vs">
        {rows.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd><b>{t[key]}</b><span className={t[key] > y[key] ? "is-up" : t[key] < y[key] ? "is-down" : ""} title={`Yesterday: ${y[key]}`}>{y[key]}</span></dd>
          </div>
        ))}
      </dl>
      <h2>Last 14 days</h2>
      <DailyBars series={last14.map((day) => ({ day, ...count(day) }))} keys={["accounts", "finished"]} height={170} width={300} />
      <h2>All time</h2>
      <dl className="dash-vs is-plain">
        <div><dt>Families</dt><dd><b>{d.families.length}</b></dd></div>
        <div><dt>Finished a test</dt><dd><b>{ever("finished")}</b></dd></div>
        <div><dt>Card saved</dt><dd><b>{ever("card_saved")}</b></dd></div>
        <div><dt>Paying</dt><dd><b>{ever("paying")}</b></dd></div>
      </dl>
    </aside>
  );
}

function ActivityLog({ d, ctx }: { d: Dashboard; ctx: Ctx }) {
  const group = (Object.keys(GROUPS) as Group[]).find((g) => g === ctx.query.group) ?? "all";
  const days = new Set(d.days);
  const inRange = d.activity.filter((a) => shown(a) && (d.range === "all" || days.has(dayKey(a.at))));
  const items = inRange.filter((a) => inGroup(a, group));
  const byDay = new Map<string, Activity[]>();
  for (const a of items.slice(0, LOG_MAX)) byDay.set(dayKey(a.at), [...(byDay.get(dayKey(a.at)) ?? []), a]);
  const today = dayKey(new Date(d.now));
  return (
    <>
      <div className="dash-top"><h1>Activity</h1><RangeTabs ctx={ctx} range={d.range} /></div>
      <nav className="dash-pills" aria-label="Kind of event">
        {(Object.keys(GROUPS) as Group[]).map((g) => (
          <Link key={g} href={href(ctx, { group: g === "all" ? null : g })} aria-current={g === group ? "true" : undefined}>{GROUPS[g]} <span>{inRange.filter((a) => inGroup(a, g)).length}</span></Link>
        ))}
      </nav>
      {byDay.size === 0 && <p className="dash-empty">Nothing happened {d.range === "today" ? "today" : `in the last ${RANGES[d.range].label.toLowerCase()}`}.</p>}
      {[...byDay].map(([day, list]) => (
        <section key={day} className="dash-day">
          <h2>{day === today ? "Today" : day === shiftDay(today, -1) ? "Yesterday" : dayLabel(day)} <span className="dash-muted">{list.length} event{list.length === 1 ? "" : "s"}</span></h2>
          <ul className="dash-feed">
            {list.map((a, i) => (
              <li key={`${a.kind}-${a.familyId}-${a.at}-${i}`} className={`is-${a.kind}${a.email?.status === "failed" ? " is-failed" : ""}`}>
                <span className="dash-ico" aria-hidden="true">{ICON[a.kind]}</span>
                <time dateTime={a.at}>{at(a.at).split(", ").pop()}</time>
                <span>
                  <Link href={familyHref(ctx, a.familyId)}><b>{a.familyName}</b></Link> {a.text}
                  {a.email?.status === "failed" && <b className="dash-bad-text"> (failed: {a.email.error ?? "unknown error"})</b>}
                  {a.email?.status === "pending" && <span className="dash-muted"> (waiting to send)</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {items.length > LOG_MAX && <p className="dash-foot">Showing the newest {LOG_MAX} of {items.length} events. Choose a shorter range to see the rest.</p>}
    </>
  );
}

function FamilyRows({ d, ctx, families }: { d: Dashboard; ctx: Ctx; families: Family[] }) {
  const rank = (s: Stage) => (s === "waitlist" ? 3 : s === "cancelled" ? 6 : STAGES.indexOf(s) + 1);
  if (families.length === 0) return <p className="dash-empty">No families here.</p>;
  return (
    <ul className="dash-rows">
      {families.map((f) => (
        <li key={f.id}>
          <Link href={familyHref(ctx, f.id)}>
            <span className="dash-row-main"><b>{f.name}<TestMark test={f.test} /></b><span className="dash-muted">{kidsText(f)}</span></span>
            <Steps reached={rank(f.stage)} waitlist={f.stage === "waitlist"} />
            <span><StageChip stage={f.stage} /><span className="dash-sub">{since(f.stageAt, d.now)} in this stage</span></span>
            <span className="dash-row-mail">
              {f.lastEmail ? <>✉ {EMAIL_LABEL[f.lastEmail.kind]}<span className="dash-sub">{f.lastEmail.status === "failed" ? "failed, " : ""}{ago(f.lastEmail.at, d.now)}</span></> : <span className="dash-muted">No email yet</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function StageList({ d, ctx, stage }: { d: Dashboard; ctx: Ctx; stage: Stage | null }) {
  const families = stage ? d.families.filter((f) => f.stage === stage).sort((a, b) => a.stageAt.localeCompare(b.stageAt)) : d.families;
  return (
    <>
      <div className="dash-top"><h1>{stage ? STAGE_TEXT[stage] : "All families"} <span className="dash-muted">{families.length}</span></h1></div>
      <p className="dash-lead">{stage ? `${STAGE_ACTION[stage]} Longest waiting first.` : "Most recently active first."}</p>
      <FamilyRows d={d} ctx={ctx} families={families} />
    </>
  );
}

function NeedsList({ d, ctx }: { d: Dashboard; ctx: Ctx }) {
  return (
    <>
      <div className="dash-top"><h1>Needs you</h1></div>
      {d.needs.length === 0 && <p className="dash-empty">Nothing needs you right now.</p>}
      {d.needs.map((n) => (
        <section key={n.title} className={`dash-need is-${n.tone}`}>
          <h2>{n.title} <span>{n.families.length}</span></h2>
          <p className="dash-muted">{n.detail}</p>
          <FamilyRows d={d} ctx={ctx} families={n.families} />
        </section>
      ))}
    </>
  );
}

/** Every logged email, newest first; also the Emails tab. `nav`: shown under the title. */
export function EmailLog({ d, ctx, filter, nav }: { d: Dashboard; ctx: Ctx; filter: EmailKind | "failed" | null; nav?: ReactNode }) {
  const rows = d.emails.filter((e) => !filter || (filter === "failed" ? e.status === "failed" : e.kind === filter));
  const info = filter && filter !== "failed" ? EMAIL_KINDS.find((k) => k.kind === filter) : null;
  return (
    <>
      <div className="dash-top"><h1>{filter === "failed" ? "Failed emails" : info ? info.label : "All emails"} <span className="dash-muted">{rows.length}</span></h1></div>
      {nav}
      {info && <p className="dash-lead">Subject: &ldquo;{info.subject}&rdquo;. Goes to: {info.to.toLowerCase()}. Sends when: {info.trigger.toLowerCase()}.</p>}
      <div className="dash-scroll dash-card">
        <table className="dash-table">
          <thead><tr><th scope="col">When</th><th scope="col">Email</th><th scope="col">Family</th><th scope="col">Subject</th><th scope="col">Result</th></tr></thead>
          <tbody>
            {rows.slice(0, LOG_MAX).map((e) => (
              <tr key={e.id}>
                <td className="dash-nowrap">{at(e.at)}<span className="dash-sub">{ago(e.at, d.now)}</span></td>
                <td>{EMAIL_LABEL[e.kind]}</td>
                <td><Link href={familyHref(ctx, e.familyId)}>{e.familyName}</Link></td>
                <td className="dash-muted">{e.kind === "unsubscribe" ? "-" : e.subject}</td>
                <td>{e.status === "failed" ? <span className="dash-bad-text">Failed after {e.attempts} {e.attempts === 1 ? "try" : "tries"}: {e.error ?? "unknown error"}</span> : e.status === "pending" ? "Waiting to send" : e.kind === "unsubscribe" ? "Reminders off" : "Sent"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="dash-empty">No emails here.</p>}
      </div>
      {rows.length > LOG_MAX && <p className="dash-foot">Showing the newest {LOG_MAX} of {rows.length}.</p>}
      <p className="dash-foot">Not logged by the site: sign-in codes, sign-in links and password emails.</p>
    </>
  );
}
