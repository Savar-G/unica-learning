// The activity log (D-099; restyled for D-313, D-315): the full day-by-day log of what families did, which Home's
// "Since yesterday" links to with "See all", and the "Needs you" lists Home links to (?view=needs). Families by stage
// (?view=families, ?view=stage:<stage>) and the email views (?view=emails...) still answer at their old addresses; their
// own pages are Families and Emails. Server components only.
import Link from "next/link";
import { Empty, Pills, SectionHead } from "@/components/admin-blocks";
import { EmailLog } from "@/components/admin-emails";
import { DELIVERY_WORDS } from "@/lib/delivery-state";
import { RangeTabs, StageChip, TestMark, familyHref, href, type Ctx } from "@/components/admin-dashboard-parts";
import {
  ALL_STAGES,
  EMAIL_KINDS,
  EMAIL_LABEL,
  RANGES,
  STAGE_ACTION,
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
import { ADMIN_PATH } from "@/lib/admin-view";
import "./admin-pages.css";

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
  // Every count here is of the real families (d.real); the lists can also hold the test families, tagged.
  const needs = new Set(d.needs.flatMap((n) => n.families.filter((f) => !f.test).map((f) => f.id))).size;
  const pills = [
    { key: "activity", href: href(ctx, { view: null, group: null }), label: "Activity log", count: null, current: view.kind === "activity" },
    { key: "needs", href: href(ctx, { view: "needs", group: null }), label: "Needs you", count: needs, current: view.kind === "needs" },
  ];
  // Families by stage and the email views stay reachable by their old addresses; their own pages are Families and Emails.
  if (view.kind === "families") pills.push({ key: "families", href: href(ctx, { view: "families" }), label: "Families by stage", count: d.real.families.length, current: true });
  if (view.kind === "emails") pills.push({ key: "emails", href: href(ctx, { view: "emails" }), label: "Emails", count: d.real.emails.length, current: true });
  return (
    <div className="ap-act">
      {ctx.demo && <p className="adm-note">Demo data: made-up families, not your database. Local development only.</p>}
      <div className="ap-act-tools">
        <Pills label="Activity views" pills={pills} />
        {view.kind === "activity" && <RangeTabs ctx={ctx} range={d.range} />}
      </div>
      {view.kind === "activity" && <ActivityLog d={d} ctx={ctx} />}
      {view.kind === "needs" && <NeedsList d={d} ctx={ctx} />}
      {view.kind === "families" && <StageList d={d} ctx={ctx} stage={view.stage} />}
      {view.kind === "emails" && <EmailLog d={d} ctx={ctx} filter={view.filter} />}
      <p className="adm-note ap-foot">Families by stage are on <Link href={`${ADMIN_PATH}/parents`} prefetch={false}>Families</Link>, and every email is on <Link href={`${ADMIN_PATH}/emails`} prefetch={false}>Emails</Link>.</p>
    </div>
  );
}

function ActivityLog({ d, ctx }: { d: Dashboard; ctx: Ctx }) {
  const group = (Object.keys(GROUPS) as Group[]).find((g) => g === ctx.query.group) ?? "all";
  const days = new Set(d.days);
  const inSpan = (a: Activity) => shown(a) && (d.range === "all" || days.has(dayKey(a.at)));
  const inRange = d.activity.filter(inSpan);
  const items = inRange.filter((a) => inGroup(a, group));
  // the counts: the real families' events only
  const realInRange = d.real.activity.filter(inSpan);
  const real = new Set(d.real.families.map((f) => f.id));
  const realCount = (list: Activity[]) => list.filter((a) => real.has(a.familyId)).length;
  const byDay = new Map<string, Activity[]>();
  for (const a of items.slice(0, LOG_MAX)) byDay.set(dayKey(a.at), [...(byDay.get(dayKey(a.at)) ?? []), a]);
  const today = dayKey(new Date(d.now));
  const test = new Set(d.tests.ids);
  return (
    <section aria-label="Activity log">
      <Pills label="Kind of event" pills={(Object.keys(GROUPS) as Group[]).map((g) => ({
        key: g, href: href(ctx, { group: g === "all" ? null : g }), label: GROUPS[g], count: realInRange.filter((a) => inGroup(a, g)).length, current: g === group,
      }))} />
      {byDay.size === 0 && <Empty>Nothing happened {d.range === "today" ? "today" : `in the last ${RANGES[d.range].label.toLowerCase()}`}. Choose a longer range to look further back.</Empty>}
      {[...byDay].map(([day, list]) => (
        <section key={day} className="ap-day" aria-label={day === today ? "Today" : day === shiftDay(today, -1) ? "Yesterday" : dayLabel(day)}>
          <h2>{day === today ? "Today" : day === shiftDay(today, -1) ? "Yesterday" : dayLabel(day)} <span>{realCount(list)} event{realCount(list) === 1 ? "" : "s"}</span></h2>
          <ul className="ap-feed">
            {list.map((a, i) => (
              <li key={`${a.kind}-${a.familyId}-${a.at}-${i}`} className={`is-${a.kind}${a.email?.status === "failed" ? " is-failed" : ""}`}>
                <span className="ap-k" aria-hidden="true" />
                <time dateTime={a.at}>{at(a.at).split(", ").pop()}</time>
                <span>
                  <Link href={familyHref(ctx, a.familyId)}><b>{a.familyName}</b></Link><TestMark test={test.has(a.familyId)} /> {a.text}
                  {a.email?.status === "failed" && <b className="ap-bad"> (failed: {a.email.error ?? "unknown error"})</b>}
                  {a.email?.status === "pending" && <span className="ap-muted"> ({DELIVERY_WORDS[a.email.state]})</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {items.length > LOG_MAX && <p className="adm-note ap-foot">Showing only the newest events. Choose a shorter range to see the rest.</p>}
    </section>
  );
}

function FamilyRows({ d, ctx, families }: { d: Dashboard; ctx: Ctx; families: Family[] }) {
  if (families.length === 0) return <Empty>No families here.</Empty>;
  return (
    <ul className="ap-rows">
      {families.map((f) => (
        <li key={f.id}>
          <span className="ap-row-who">
            <span><Link href={familyHref(ctx, f.id)}>{f.name}</Link><TestMark test={f.test} /></span>
            <span className="adm-sub">{kidsText(f)}</span>
          </span>
          <span className="ap-row-end">
            <StageChip stage={f.stage} />
            <span>{since(f.stageAt, d.now)} in this stage</span>
            <span>{f.lastEmail ? <>Last email: {EMAIL_LABEL[f.lastEmail.kind]}, {f.lastEmail.status === "failed" ? "failed, " : ""}{ago(f.lastEmail.at, d.now)}</> : "No email yet"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function StageList({ d, ctx, stage }: { d: Dashboard; ctx: Ctx; stage: Stage | null }) {
  const families = stage ? d.families.filter((f) => f.stage === stage).sort((a, b) => a.stageAt.localeCompare(b.stageAt)) : d.families;
  return (
    <section className="ap-card" aria-labelledby="ap-stage">
      <SectionHead id="ap-stage" title={stage ? STAGE_TEXT[stage] : "All families"} count={families.filter((f) => !f.test).length}
        line={stage ? `${STAGE_ACTION[stage]} Longest waiting first.` : "Most recently active first."} />
      <FamilyRows d={d} ctx={ctx} families={families} />
    </section>
  );
}

function NeedsList({ d, ctx }: { d: Dashboard; ctx: Ctx }) {
  if (d.needs.length === 0) return <Empty>Nothing needs you right now. A family shows here when a payment fails, a card waits for a plan, or a test or an email gets stuck.</Empty>;
  return (
    <>
      {d.needs.map((n) => (
        <section key={n.title} className={`ap-need is-${n.tone}`} aria-label={n.title}>
          <h2>{n.title} <span>{n.families.filter((f) => !f.test).length}</span></h2>
          <p>{n.detail}.</p>
          <FamilyRows d={d} ctx={ctx} families={n.families} />
        </section>
      ))}
    </>
  );
}
