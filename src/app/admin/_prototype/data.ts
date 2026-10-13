// PROTOTYPE ONLY (branch site/admin-revamp-prototype). The admin dashboard's data: every family with its stage, the
// KPIs of a date range, the daily series and the email log. buildDashboard is pure; loadRaw reads with the admin's
// own session (admin_* functions) and asks Stripe which saved cards have a subscription.
import type { AdminSession } from "@/lib/admin-store";
import type { Province } from "@/lib/assessment";
import { stripe } from "@/lib/stripe";
import type { AssessmentStatus } from "@/lib/test-api";

// Raw rows

export interface RawParent { id: string; created_at: string; name: string; email: string; postal: string; source: Record<string, string> | null }
export interface RawChild { id: string; created_at: string; parent_id: string; first_name: string; grade: number; province: Province }
export interface RawTest { id: string; created_at: string; status: AssessmentStatus; parent_id: string; child_id: string; grade: number; province: Province; started_at: string; completed_at: string | null; last_answer_at: string | null; answered: number }
export interface RawReport { id: string; created_at: string; assessment_id: string; parent_id: string; child_id: string; emailed_at: string | null; email_error: string | null; alerted_at: string | null; alert_error: string | null }
export interface RawCard { id: string; created_at: string; updated_at: string; parent_id: string; child_id: string; plan: "one" | "both"; price: number; stripe_customer_id: string | null; card_saved_at: string | null }
export interface RawWaitlist { id: string; created_at: string; parent_id: string; child_id: string; province: Province }
export interface RawEmail { id: string; created_at: string; parent_id: string; child_id: string | null; assessment_id: string | null; kind: "continue" | "come_back" | "start" | "unsubscribe"; status: "claimed" | "sent" | "failed" | null; attempts: number; sent_at: string | null; error: string | null }
export interface RawSubscription { customer: string; status: string; created: string; amount: number | null }

export interface Raw {
  parents: RawParent[];
  children: RawChild[];
  tests: RawTest[];
  reports: RawReport[];
  cards: RawCard[];
  waitlist: RawWaitlist[];
  emails: RawEmail[];
  subscriptions: RawSubscription[];
  /** null: Stripe was asked; else why it was not (no key, or the call failed). */
  stripeNote: string | null;
}

type Q = { range: (a: number, b: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

async function all<T>(q: Q, what: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(`[admin prototype] ${what}: ${error.message}`);
    const rows = data as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export async function loadRaw(a: AdminSession): Promise<Raw> {
  const [parents, children, tests, reports, cards, waitlist, emails] = await Promise.all([
    all<RawParent>(a.db.rpc("admin_parents").select("id, created_at, name, email, postal, source").order("id"), "parents"),
    all<RawChild>(a.db.rpc("admin_children").select("id, created_at, parent_id, first_name, grade, province").order("id"), "children"),
    all<Omit<RawTest, "answered"> & { answers: { count: number }[] }>(a.db.rpc("admin_assessments").select("id, created_at, status, parent_id, child_id, grade, province, started_at, completed_at, last_answer_at, answers(count)").order("id"), "tests"),
    all<RawReport>(a.db.rpc("admin_reports").select("id, created_at, assessment_id, parent_id, child_id, emailed_at, email_error, alerted_at, alert_error").order("id"), "reports"),
    all<RawCard>(a.db.rpc("admin_card_setups").select("*").order("id"), "card setups"),
    all<RawWaitlist>(a.db.rpc("admin_waitlist_joins").select("*").order("id"), "waitlist"),
    all<RawEmail>(a.db.from("email_log").select("id, created_at, parent_id, child_id, assessment_id, kind, status, attempts, sent_at, error").order("id"), "email log"),
  ]);
  const { subscriptions, note } = await loadSubscriptions(cards);
  return {
    parents, children, reports, cards, waitlist, emails,
    tests: tests.map(({ answers, ...t }) => ({ ...t, answered: answers[0]?.count ?? 0 })),
    subscriptions,
    stripeNote: note,
  };
}

/** Read only: the subscriptions of each saved card's Stripe customer. The site never starts one; Savar does. */
async function loadSubscriptions(cards: RawCard[]): Promise<{ subscriptions: RawSubscription[]; note: string | null }> {
  const s = stripe();
  const customers = [...new Set(cards.flatMap((c) => (c.stripe_customer_id ? [c.stripe_customer_id] : [])))];
  if (!s) return { subscriptions: [], note: "No Stripe key here, so payment status is unknown." };
  try {
    const lists = await Promise.all(customers.map((customer) => s.subscriptions.list({ customer, status: "all", limit: 5 })));
    return {
      note: null,
      subscriptions: lists.flatMap((l) => l.data.map((sub) => ({
        customer: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        status: sub.status,
        created: new Date(sub.created * 1000).toISOString(),
        amount: sub.items.data[0]?.price.unit_amount ?? null,
      }))),
    };
  } catch (e) {
    return { subscriptions: [], note: `Stripe did not answer (${e instanceof Error ? e.message : "error"}), so payment status is unknown.` };
  }
}

// The model

export const STAGES = ["account", "started", "finished", "card_started", "card_saved", "paying"] as const;
export type FunnelStage = (typeof STAGES)[number];
export type Stage = FunnelStage | "waitlist";

export const STAGE_TEXT: Record<Stage, string> = {
  account: "Signed up, no test",
  started: "Test started",
  finished: "Test finished",
  card_started: "Opened payment page",
  card_saved: "Card saved",
  paying: "Paying",
  waitlist: "Waitlist",
};
export const STAGE_SHORT: Record<Stage, string> = {
  account: "Signed up", started: "Started test", finished: "Finished test", card_started: "Payment page", card_saved: "Card saved", paying: "Paying", waitlist: "Waitlist",
};
/** What Savar can do about a family in this stage. */
export const STAGE_ACTION: Record<Stage, string> = {
  account: "The start reminder goes out automatically.",
  started: "The continue reminder goes out automatically.",
  finished: "Report sent. Waiting for the parent to choose a plan.",
  card_started: "The parent left the payment page. Consider a personal email.",
  card_saved: "Start the Stripe subscription when the first workbook ships.",
  paying: "Nothing to do.",
  waitlist: "Not BC. Waiting for their curriculum.",
};
const RANK: Record<Stage, number> = { account: 0, started: 1, finished: 2, waitlist: 2, card_started: 3, card_saved: 4, paying: 5 };

export type EmailKind = "start" | "continue" | "come_back" | "report" | "alert" | "unsubscribe";
export const EMAIL_KINDS: { kind: EmailKind; label: string; subject: string; to: string; trigger: string }[] = [
  { kind: "start", label: "Start reminder", subject: "{child} has not started the free math test", to: "Parent", trigger: "Account made, no test started" },
  { kind: "continue", label: "Continue reminder", subject: "{child} can finish the math test", to: "Parent", trigger: "Test started, not finished" },
  { kind: "come_back", label: "Come back reminder", subject: "{child} can start the math test again", to: "Parent", trigger: "Test expired before the end" },
  { kind: "report", label: "Report email", subject: "{child}'s math report is ready", to: "Parent", trigger: "Test finished, report built" },
  { kind: "alert", label: "Report alert", subject: "Test finished: {child}, grade {n}, working at ...", to: "You", trigger: "Test finished, report built" },
  { kind: "unsubscribe", label: "Unsubscribe", subject: "(no email: the parent turned reminders off)", to: "-", trigger: "Parent clicked unsubscribe" },
];
export const EMAIL_LABEL = Object.fromEntries(EMAIL_KINDS.map((k) => [k.kind, k.label])) as Record<EmailKind, string>;

export interface EmailEvent { id: string; kind: EmailKind; at: string; status: "sent" | "failed" | "pending"; familyId: string; familyName: string; childName: string | null; subject: string; attempts: number; error: string | null }

export interface FamilyTest { id: string; childName: string; status: AssessmentStatus; startedAt: string; completedAt: string | null; lastAnswerAt: string | null; answered: number; reportId: string | null }

export interface Family {
  id: string;
  name: string;
  email: string;
  postal: string;
  createdAt: string;
  source: string | null;
  children: { id: string; name: string; grade: number; province: Province }[];
  stage: Stage;
  /** When the family reached its stage. */
  stageAt: string;
  /** Every funnel stage it reached, with when. */
  reached: Partial<Record<Stage, string>>;
  tests: FamilyTest[];
  expired: boolean;
  card: { plan: string; price: number; savedAt: string | null; updatedAt: string } | null;
  subscription: { status: string; since: string; amount: number | null } | null;
  emails: EmailEvent[];
  lastEmail: EmailEvent | null;
  unsubscribed: boolean;
  lastActivityAt: string;
}

export type ActivityKind = "account" | "test_start" | "test_finish" | "test_expired" | "card_start" | "card_saved" | "paying" | "waitlist" | "email";
export interface Activity { at: string; kind: ActivityKind; familyId: string; familyName: string; text: string; email?: EmailEvent }

const max = (xs: (string | null | undefined)[]) => xs.reduce<string>((m, x) => (x && x > m ? x : m), "");
const min = (xs: (string | null | undefined)[]) => xs.reduce<string | null>((m, x) => (x && (!m || x < m) ? x : m), null);

export function buildFamilies(raw: Raw): Family[] {
  const childName = new Map(raw.children.map((c) => [c.id, c.first_name]));
  const reportByTest = new Map(raw.reports.map((r) => [r.assessment_id, r]));
  const subByCustomer = new Map<string, RawSubscription>();
  for (const s of raw.subscriptions) {
    const prev = subByCustomer.get(s.customer);
    if (!prev || s.created > prev.created) subByCustomer.set(s.customer, s);
  }
  return raw.parents.map((p) => {
    const children = raw.children.filter((c) => c.parent_id === p.id);
    const tests = raw.tests.filter((t) => t.parent_id === p.id).sort((a, b) => b.started_at.localeCompare(a.started_at));
    const reports = raw.reports.filter((r) => r.parent_id === p.id);
    const cards = raw.cards.filter((c) => c.parent_id === p.id).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const waits = raw.waitlist.filter((w) => w.parent_id === p.id);
    const subs = cards.flatMap((c) => (c.stripe_customer_id && subByCustomer.get(c.stripe_customer_id)) || []);
    const paying = subs.find((s) => s.status === "active" || s.status === "trialing" || s.status === "past_due") ?? null;

    const emails: EmailEvent[] = [];
    for (const e of raw.emails.filter((x) => x.parent_id === p.id)) {
      const child = e.child_id ? (childName.get(e.child_id) ?? null) : null;
      const kind = e.kind as EmailKind;
      emails.push({
        id: e.id, kind, at: e.sent_at ?? e.created_at, familyId: p.id, familyName: p.name, childName: child, attempts: e.attempts, error: e.error,
        status: e.kind === "unsubscribe" ? "sent" : e.status === "sent" ? "sent" : e.status === "failed" ? "failed" : "pending",
        subject: subjectFor(kind, child),
      });
    }
    for (const r of reports) {
      const child = childName.get(r.child_id) ?? null;
      emails.push({ id: `${r.id}-report`, kind: "report", at: r.emailed_at ?? r.created_at, familyId: p.id, familyName: p.name, childName: child, attempts: 1, error: r.email_error, status: r.emailed_at ? "sent" : r.email_error ? "failed" : "pending", subject: subjectFor("report", child) });
      emails.push({ id: `${r.id}-alert`, kind: "alert", at: r.alerted_at ?? r.created_at, familyId: p.id, familyName: p.name, childName: child, attempts: 1, error: r.alert_error, status: r.alerted_at ? "sent" : r.alert_error ? "failed" : "pending", subject: subjectFor("alert", child) });
    }
    emails.sort((a, b) => b.at.localeCompare(a.at));
    const toParent = emails.filter((e) => e.kind !== "alert" && e.kind !== "unsubscribe");

    const reached: Partial<Record<Stage, string>> = { account: p.created_at };
    const started = min(tests.map((t) => t.started_at));
    if (started) reached.started = started;
    const finished = min(tests.map((t) => t.completed_at));
    if (finished) reached.finished = finished;
    const waitAt = min(waits.map((w) => w.created_at));
    if (waitAt) reached.waitlist = waitAt;
    const cardAt = min(cards.map((c) => c.created_at));
    if (cardAt) reached.card_started = cardAt;
    const savedAt = min(cards.map((c) => c.card_saved_at));
    if (savedAt) reached.card_saved = savedAt;
    if (paying) reached.paying = paying.created;

    const stage = (Object.keys(reached) as Stage[]).reduce((best, s) => (RANK[s] > RANK[best] || (RANK[s] === RANK[best] && s === "waitlist" && !reached.card_started) ? s : best), "account" as Stage);
    const card = cards[0] ?? null;
    return {
      id: p.id, name: p.name, email: p.email, postal: p.postal, createdAt: p.created_at,
      source: p.source?.utm_source ?? p.source?.heard ?? p.source?.ref ?? null,
      children: children.map((c) => ({ id: c.id, name: c.first_name, grade: c.grade, province: c.province })),
      stage, stageAt: reached[stage] ?? p.created_at, reached,
      tests: tests.map((t) => ({ id: t.id, childName: childName.get(t.child_id) ?? "Child", status: t.status, startedAt: t.started_at, completedAt: t.completed_at, lastAnswerAt: t.last_answer_at, answered: t.answered, reportId: reportByTest.get(t.id)?.id ?? null })),
      expired: tests.length > 0 && tests.every((t) => t.status === "expired"),
      card: card ? { plan: card.plan === "one" ? "Math" : "Math and reading", price: card.price, savedAt: card.card_saved_at, updatedAt: card.updated_at } : null,
      subscription: paying ? { status: paying.status, since: paying.created, amount: paying.amount } : null,
      emails,
      lastEmail: toParent[0] ?? null,
      unsubscribed: emails.some((e) => e.kind === "unsubscribe"),
      lastActivityAt: max([p.created_at, ...tests.flatMap((t) => [t.started_at, t.last_answer_at, t.completed_at]), ...cards.flatMap((c) => [c.updated_at, c.card_saved_at]), ...waits.map((w) => w.created_at), paying?.created]),
    };
  });
}

function subjectFor(kind: EmailKind, child: string | null): string {
  const name = child ?? "Your child";
  const k = EMAIL_KINDS.find((x) => x.kind === kind)!;
  return k.subject.replace("{child}", name).replace("{n}", "?");
}

export function activities(families: Family[]): Activity[] {
  const out: Activity[] = [];
  for (const f of families) {
    const kids = f.children.map((c) => c.name).join(" and ");
    out.push({ at: f.createdAt, kind: "account", familyId: f.id, familyName: f.name, text: `signed up${kids ? ` for ${kids}` : ""}` });
    for (const t of f.tests) {
      out.push({ at: t.startedAt, kind: "test_start", familyId: f.id, familyName: f.name, text: `${t.childName} started the test` });
      if (t.completedAt) out.push({ at: t.completedAt, kind: "test_finish", familyId: f.id, familyName: f.name, text: `${t.childName} finished the test (${t.answered} answers)` });
    }
    if (f.reached.card_started) out.push({ at: f.reached.card_started, kind: "card_start", familyId: f.id, familyName: f.name, text: "opened the payment page" });
    if (f.reached.card_saved) out.push({ at: f.reached.card_saved, kind: "card_saved", familyId: f.id, familyName: f.name, text: `saved a card${f.card ? ` (${f.card.plan}, CAD ${f.card.price}/month)` : ""}` });
    if (f.reached.paying) out.push({ at: f.reached.paying, kind: "paying", familyId: f.id, familyName: f.name, text: "subscription started in Stripe" });
    if (f.reached.waitlist) out.push({ at: f.reached.waitlist, kind: "waitlist", familyId: f.id, familyName: f.name, text: "joined the waitlist" });
    for (const e of f.emails) out.push({ at: e.at, kind: "email", familyId: f.id, familyName: f.name, text: e.kind === "unsubscribe" ? "turned reminders off" : `${EMAIL_LABEL[e.kind]}: "${e.subject}"`, email: e });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

// Ranges, days and KPIs

export const RANGES = { today: { label: "Today", days: 1 }, "7d": { label: "7 days", days: 7 }, "30d": { label: "30 days", days: 30 }, all: { label: "All time", days: 0 } } as const;
export type RangeKey = keyof typeof RANGES;
export const pickRange = (raw: unknown): RangeKey => (typeof raw === "string" && raw in RANGES ? (raw as RangeKey) : "7d");

const PACIFIC_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit" });
export const dayKey = (iso: string | Date) => PACIFIC_DAY.format(typeof iso === "string" ? new Date(iso) : iso);

/** The Pacific days of a range, oldest first. "all" starts at the first record (at least 14 days). */
export function rangeDays(range: RangeKey, now: Date, first: string | null): string[] {
  let n: number = RANGES[range].days;
  if (n === 0) n = Math.max(14, first ? Math.ceil((now.getTime() - new Date(first).getTime()) / 86_400_000) + 1 : 14);
  return Array.from({ length: n }, (_, i) => dayKey(new Date(now.getTime() - (n - 1 - i) * 86_400_000)));
}

export interface Kpi { key: string; label: string; value: number; prev: number | null; unit?: "%"; spark: number[]; hint: string }

export interface Dashboard {
  now: string;
  range: RangeKey;
  days: string[];
  families: Family[];
  activity: Activity[];
  emails: EmailEvent[];
  kpis: Kpi[];
  series: { day: string; accounts: number; started: number; finished: number; cards: number; emails: number }[];
  /** Families that reached each funnel stage (ever), and in the range. */
  funnel: { stage: FunnelStage; ever: number; inRange: number }[];
  stageCounts: Record<Stage, number>;
  emailSummary: { kind: EmailKind; label: string; subject: string; to: string; trigger: string; sent: number; failed: number; pending: number; sentInRange: number; last: string | null }[];
  needs: { title: string; detail: string; tone: "warn" | "bad" | "info"; families: Family[] }[];
  stripeNote: string | null;
}

export function buildDashboard(raw: Raw, range: RangeKey, now: Date): Dashboard {
  const families = buildFamilies(raw).sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  const activity = activities(families);
  const emails = families.flatMap((f) => f.emails).sort((a, b) => b.at.localeCompare(a.at));
  const first = min(raw.parents.map((p) => p.created_at));
  const days = rangeDays(range, now, first);
  const sparkDays = rangeDays(range === "today" ? "7d" : range, now, first);
  const inDays = (set: Set<string>) => (iso: string | null | undefined) => !!iso && set.has(dayKey(iso));
  const cur = new Set(days);
  const prevDays = new Set(days.map((d) => dayKey(new Date(new Date(`${d}T12:00:00-08:00`).getTime() - days.length * 86_400_000))));
  const inCur = inDays(cur);
  const inPrev = inDays(prevDays);

  const count = (pick: (f: Family) => (string | null | undefined)[], test: (iso: string | null | undefined) => boolean) => families.reduce((n, f) => n + pick(f).filter(test).length, 0);
  const daily = (pick: (f: Family) => (string | null | undefined)[]) => sparkDays.map((d) => families.reduce((n, f) => n + pick(f).filter((x) => !!x && dayKey(x) === d).length, 0));

  const pickAccounts = (f: Family) => [f.createdAt];
  const pickStarted = (f: Family) => f.tests.map((t) => t.startedAt);
  const pickFinished = (f: Family) => f.tests.map((t) => t.completedAt);
  const pickSaved = (f: Family) => [f.reached.card_saved];
  const pickPaying = (f: Family) => [f.reached.paying];
  const pickEmails = (f: Family) => f.emails.filter((e) => e.status === "sent" && e.kind !== "unsubscribe" && e.kind !== "alert").map((e) => e.at);

  const all = range === "all";
  const kpi = (key: string, label: string, pick: (f: Family) => (string | null | undefined)[], hint: string): Kpi => ({
    key, label, hint, value: count(pick, all ? Boolean : inCur), prev: all ? null : count(pick, inPrev), spark: daily(pick),
  });
  const started = kpi("started", "Tests started", pickStarted, "Children who began the free test");
  const finished = kpi("finished", "Tests finished", pickFinished, "Finished tests; each sends a report email");
  const rate = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));
  const kpis: Kpi[] = [
    kpi("accounts", "New accounts", pickAccounts, "Parents who made an account"),
    started,
    finished,
    { key: "completion", label: "Finish rate", unit: "%", value: rate(finished.value, started.value), prev: finished.prev === null || started.prev === null ? null : rate(finished.prev, started.prev), spark: finished.spark.map((f, i) => rate(f, started.spark[i])), hint: "Tests finished divided by tests started" },
    kpi("saved", "Cards saved", pickSaved, "Parents who saved a card in Stripe (nothing charged)"),
    kpi("paying", "New paying", pickPaying, "Stripe subscriptions started"),
    kpi("emails", "Emails to parents", pickEmails, "Reminder and report emails sent"),
  ];

  const series = days.map((d) => {
    const on = (x: string | null | undefined) => !!x && dayKey(x) === d;
    return {
      day: d,
      accounts: count(pickAccounts, on), started: count(pickStarted, on), finished: count(pickFinished, on), cards: count(pickSaved, on), emails: count(pickEmails, on),
    };
  });

  const funnel = STAGES.map((stage) => ({
    stage,
    ever: families.filter((f) => f.reached[stage] || (stage === "finished" && f.reached.waitlist)).length,
    inRange: families.filter((f) => (all || inCur(f.createdAt)) && (f.reached[stage] || (stage === "finished" && f.reached.waitlist))).length,
  }));
  const stageCounts = Object.fromEntries((Object.keys(STAGE_TEXT) as Stage[]).map((s) => [s, families.filter((f) => f.stage === s).length])) as Record<Stage, number>;

  const emailSummary = EMAIL_KINDS.map((k) => {
    const mine = emails.filter((e) => e.kind === k.kind);
    return { ...k, sent: mine.filter((e) => e.status === "sent").length, failed: mine.filter((e) => e.status === "failed").length, pending: mine.filter((e) => e.status === "pending").length, sentInRange: mine.filter((e) => e.status === "sent" && (all || inCur(e.at))).length, last: mine.find((e) => e.status === "sent")?.at ?? null };
  });

  const ageDays = (iso: string) => (now.getTime() - new Date(iso).getTime()) / 86_400_000;
  const needs: Dashboard["needs"] = [
    { title: "Start a subscription", detail: "Card saved, no Stripe subscription yet", tone: "warn" as const, families: families.filter((f) => f.stage === "card_saved") },
    { title: "Left the payment page", detail: "Opened the payment page but did not save a card", tone: "info" as const, families: families.filter((f) => f.stage === "card_started") },
    { title: "Stuck in the test", detail: "Test started more than 2 days ago and not finished", tone: "info" as const, families: families.filter((f) => f.stage === "started" && ageDays(f.stageAt) > 2) },
    { title: "Email failed", detail: "An email to the parent did not send", tone: "bad" as const, families: families.filter((f) => f.emails.some((e) => e.status === "failed" && e.kind !== "alert")) },
  ].filter((n) => n.families.length > 0);

  return { now: now.toISOString(), range, days, families, activity, emails, kpis, series, funnel, stageCounts, emailSummary, needs, stripeNote: raw.stripeNote };
}

// Small formatting helpers shared by the variants

const PACIFIC_TIME = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const at = (iso: string | null | undefined) => (iso ? PACIFIC_TIME.format(new Date(iso)) : "-");
export function ago(iso: string | null | undefined, now: string): string {
  if (!iso) return "-";
  const m = Math.round((new Date(now).getTime() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
export const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
export const kidsText = (f: Family) => f.children.map((c) => `${c.name} (gr ${c.grade})`).join(", ") || "No child";
