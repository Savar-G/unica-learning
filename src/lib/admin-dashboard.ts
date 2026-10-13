// The admin dashboard and activity log (D-099) in plain data: every family with its stage, the KPIs of a date range,
// the daily series, the email log and the activity events. Pure: no network, database or clock (the caller passes
// `now`), so the pages only fetch (dashboardRows in admin-store) and show. Days are Pacific days.
import type { Province } from "@/lib/assessment";
import type { AssessmentStatus } from "@/lib/test-api";

// Rows, as admin-store reads them

export interface RawParent { id: string; created_at: string; name: string; email: string; postal: string; source: Record<string, string> | null }
export interface RawChild { id: string; created_at: string; parent_id: string; first_name: string; grade: number; province: Province }
export interface RawTest { id: string; created_at: string; status: AssessmentStatus; parent_id: string; child_id: string; grade: number; province: Province; started_at: string; completed_at: string | null; last_answer_at: string | null; answered: number }
export interface RawReport { id: string; created_at: string; assessment_id: string; parent_id: string; child_id: string; emailed_at: string | null; email_error: string | null; alerted_at: string | null; alert_error: string | null }
export interface RawCard { id: string; created_at: string; updated_at: string; parent_id: string; child_id: string; plan: "one" | "both"; price: number; stripe_customer_id: string | null; card_saved_at: string | null }
export interface RawWaitlist { id: string; created_at: string; parent_id: string; child_id: string; province: Province }
export interface RawEmail { id: string; created_at: string; parent_id: string; child_id: string | null; assessment_id: string | null; kind: "continue" | "come_back" | "start" | "unsubscribe"; status: "claimed" | "sent" | "failed" | null; attempts: number; sent_at: string | null; error: string | null }
/** A Stripe subscription of a saved card's customer. `created`: ISO time. `amount`: cents. */
export interface RawSubscription { customer: string; status: string; created: string; amount: number | null }

export interface DashboardRows {
  parents: RawParent[];
  children: RawChild[];
  tests: RawTest[];
  reports: RawReport[];
  cards: RawCard[];
  waitlist: RawWaitlist[];
  emails: RawEmail[];
  subscriptions: RawSubscription[];
  /** Parents left out of the numbers: admin accounts and families marked as a test (D-099). */
  testIds: string[];
  /** Why payment status is unknown (no Stripe key, or Stripe failed); null when Stripe answered. */
  stripeNote: string | null;
}

// Stages

/** The funnel, in order. A family's stage is the furthest one it reached. */
export const STAGES = ["account", "started", "finished", "card_started", "card_saved", "paying"] as const;
export type FunnelStage = (typeof STAGES)[number];
/** Waitlist sits beside "finished": a non-BC family finished the test and joined the waitlist instead of a plan. */
export type Stage = FunnelStage | "waitlist";
export const ALL_STAGES: readonly Stage[] = [...STAGES, "waitlist"];

export const STAGE_TEXT: Record<Stage, string> = {
  account: "Signed up, no test", started: "Test started", finished: "Test finished", card_started: "Opened payment page",
  card_saved: "Card saved", paying: "Paying", waitlist: "Waitlist",
};
export const STAGE_SHORT: Record<Stage, string> = {
  account: "Signed up", started: "Started test", finished: "Finished test", card_started: "Payment page",
  card_saved: "Card saved", paying: "Paying", waitlist: "Waitlist",
};
/** What happens next for a family in this stage, or what Savar can do. */
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
/** Stripe statuses that count as a paying family. past_due is still a subscriber whose last charge failed. */
const PAYING = new Set(["active", "trialing", "past_due"]);

// Emails

export type EmailKind = "start" | "continue" | "come_back" | "report" | "alert" | "unsubscribe";
export interface EmailKindInfo { kind: EmailKind; label: string; subject: string; to: string; trigger: string }
/** Every email the site logs. The subjects follow reminder-email.ts and report-email.ts. */
export const EMAIL_KINDS: readonly EmailKindInfo[] = [
  { kind: "start", label: "Start reminder", subject: "{child} has not started the free math test", to: "Parent", trigger: "Account made, no test started" },
  { kind: "continue", label: "Continue reminder", subject: "{child} can finish the math test", to: "Parent", trigger: "Test started, not finished" },
  { kind: "come_back", label: "Come back reminder", subject: "{child} can start the math test again", to: "Parent", trigger: "Test expired before the end" },
  { kind: "report", label: "Report email", subject: "{child}'s math report is ready", to: "Parent", trigger: "Test finished, report built" },
  { kind: "alert", label: "Report alert", subject: "Test finished: {child}, grade {grade}, working at ...", to: "You", trigger: "Test finished, report built" },
  { kind: "unsubscribe", label: "Unsubscribe", subject: "No email: the parent turned reminders off", to: "-", trigger: "Parent clicked unsubscribe" },
];
export const EMAIL_LABEL = Object.fromEntries(EMAIL_KINDS.map((k) => [k.kind, k.label])) as Record<EmailKind, string>;

export interface EmailEvent {
  id: string;
  kind: EmailKind;
  /** When it was sent; for a failed or waiting email, when it was logged. */
  at: string;
  status: "sent" | "failed" | "pending";
  familyId: string;
  familyName: string;
  childName: string | null;
  subject: string;
  attempts: number;
  error: string | null;
}

// Families

export interface FamilyTest { id: string; childId: string; childName: string; status: AssessmentStatus; startedAt: string; completedAt: string | null; lastAnswerAt: string | null; answered: number; reportId: string | null }

export interface Family {
  id: string;
  name: string;
  email: string;
  postal: string;
  createdAt: string;
  /** utm_source, else the referrer's host; null when the signup did not say. */
  source: string | null;
  children: { id: string; name: string; grade: number; province: Province }[];
  stage: Stage;
  /** When the family reached its stage. */
  stageAt: string;
  /** Every stage it reached, with when (the first time). */
  reached: Partial<Record<Stage, string>>;
  /** Newest first. */
  tests: FamilyTest[];
  /** Every test it started expired. */
  expired: boolean;
  card: { plan: string; price: number; savedAt: string | null; updatedAt: string } | null;
  subscription: { status: string; since: string; amount: number | null } | null;
  /** Newest first, including the report alerts to Savar. */
  emails: EmailEvent[];
  /** The newest email to the parent (not an alert, not an unsubscribe). */
  lastEmail: EmailEvent | null;
  unsubscribed: boolean;
  lastActivityAt: string;
  /** An admin's own family or one marked as a test: left out of the numbers unless asked for. */
  test: boolean;
}

const latest = (xs: (string | null | undefined)[]) => xs.reduce<string>((m, x) => (x && x > m ? x : m), "");
const earliest = (xs: (string | null | undefined)[]) => xs.reduce<string | null>((m, x) => (x && (!m || x < m) ? x : m), null);
const newestFirst = <T extends { at: string }>(a: T, b: T) => b.at.localeCompare(a.at);

function sourceOf(source: Record<string, string> | null): string | null {
  if (source?.utm_source) return source.utm_source;
  if (!source?.referrer) return null;
  try {
    return new URL(source.referrer).hostname.replace(/^www\./, "");
  } catch {
    return source.referrer;
  }
}

function subjectFor(kind: EmailKind, child: string | null, grade: number | null): string {
  const info = EMAIL_KINDS.find((k) => k.kind === kind)!;
  return info.subject.replace("{child}", child ?? "Your child").replace("{grade}", grade === null ? "?" : String(grade));
}

const emailStatus = (sentAt: string | null, error: string | null): EmailEvent["status"] => (sentAt ? "sent" : error ? "failed" : "pending");

export function buildFamilies(rows: DashboardRows): Family[] {
  const testIds = new Set(rows.testIds);
  const childName = new Map(rows.children.map((c) => [c.id, c.first_name]));
  const testById = new Map(rows.tests.map((t) => [t.id, t]));
  const reportByTest = new Map(rows.reports.map((r) => [r.assessment_id, r.id]));
  const subscriptionOf = new Map<string, RawSubscription>();
  for (const s of rows.subscriptions) {
    const kept = subscriptionOf.get(s.customer);
    // a paying subscription wins over an ended one; between two of the same kind, the newer one
    if (!kept || (PAYING.has(s.status) && !PAYING.has(kept.status)) || (PAYING.has(s.status) === PAYING.has(kept.status) && s.created > kept.created)) subscriptionOf.set(s.customer, s);
  }

  return rows.parents.map((p) => {
    const mine = <T extends { parent_id: string }>(xs: T[]) => xs.filter((x) => x.parent_id === p.id);
    const children = mine(rows.children);
    const tests = mine(rows.tests).sort((a, b) => b.started_at.localeCompare(a.started_at));
    const cards = mine(rows.cards).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const waits = mine(rows.waitlist);
    const paying = cards.map((c) => (c.stripe_customer_id ? subscriptionOf.get(c.stripe_customer_id) : undefined)).find((s) => s && PAYING.has(s.status)) ?? null;

    const emails: EmailEvent[] = mine(rows.emails).map((e) => {
      const child = e.child_id ? (childName.get(e.child_id) ?? null) : null;
      const grade = e.assessment_id ? (testById.get(e.assessment_id)?.grade ?? null) : null;
      return {
        id: e.id, kind: e.kind, at: e.sent_at ?? e.created_at, familyId: p.id, familyName: p.name, childName: child, attempts: e.attempts, error: e.error,
        status: e.kind === "unsubscribe" || e.status === "sent" ? "sent" : e.status === "failed" ? "failed" : "pending",
        subject: subjectFor(e.kind, child, grade),
      };
    });
    for (const r of mine(rows.reports)) {
      const child = childName.get(r.child_id) ?? null;
      const grade = testById.get(r.assessment_id)?.grade ?? null;
      const base = { familyId: p.id, familyName: p.name, childName: child, attempts: 1 };
      emails.push({ ...base, id: `${r.id}:report`, kind: "report", at: r.emailed_at ?? r.created_at, error: r.email_error, status: emailStatus(r.emailed_at, r.email_error), subject: subjectFor("report", child, grade) });
      emails.push({ ...base, id: `${r.id}:alert`, kind: "alert", at: r.alerted_at ?? r.created_at, error: r.alert_error, status: emailStatus(r.alerted_at, r.alert_error), subject: subjectFor("alert", child, grade) });
    }
    emails.sort(newestFirst);

    const reached: Partial<Record<Stage, string>> = { account: p.created_at };
    const at = {
      started: earliest(tests.map((t) => t.started_at)),
      finished: earliest(tests.map((t) => t.completed_at)),
      waitlist: earliest(waits.map((w) => w.created_at)),
      card_started: earliest(cards.map((c) => c.created_at)),
      card_saved: earliest(cards.map((c) => c.card_saved_at)),
      paying: paying?.created ?? null,
    };
    for (const [s, when] of Object.entries(at)) if (when) reached[s as Stage] = when;
    // the furthest stage; waitlist beats finished (same rank), since joining the waitlist came after finishing
    const stage = (Object.keys(reached) as Stage[]).reduce<Stage>((best, s) => (RANK[s] > RANK[best] || (RANK[s] === RANK[best] && s === "waitlist") ? s : best), "account");
    const card = cards[0] ?? null;

    return {
      id: p.id, name: p.name, email: p.email, postal: p.postal, createdAt: p.created_at, source: sourceOf(p.source),
      children: children.map((c) => ({ id: c.id, name: c.first_name, grade: c.grade, province: c.province })),
      stage, stageAt: reached[stage] ?? p.created_at, reached,
      tests: tests.map((t) => ({ id: t.id, childId: t.child_id, childName: childName.get(t.child_id) ?? "Child", status: t.status, startedAt: t.started_at, completedAt: t.completed_at, lastAnswerAt: t.last_answer_at, answered: t.answered, reportId: reportByTest.get(t.id) ?? null })),
      expired: tests.length > 0 && tests.every((t) => t.status === "expired"),
      card: card ? { plan: card.plan === "one" ? "Math" : "Math and reading", price: card.price, savedAt: card.card_saved_at, updatedAt: card.updated_at } : null,
      subscription: paying ? { status: paying.status, since: paying.created, amount: paying.amount } : null,
      emails,
      lastEmail: emails.find((e) => e.kind !== "alert" && e.kind !== "unsubscribe") ?? null,
      unsubscribed: emails.some((e) => e.kind === "unsubscribe"),
      test: testIds.has(p.id),
      lastActivityAt: latest([p.created_at, ...tests.flatMap((t) => [t.started_at, t.last_answer_at, t.completed_at]), ...cards.flatMap((c) => [c.updated_at, c.card_saved_at]), ...waits.map((w) => w.created_at), paying?.created]),
    };
  });
}

// Activity

export type ActivityKind = "account" | "test_start" | "test_finish" | "card_start" | "card_saved" | "paying" | "waitlist" | "email";
export interface Activity { at: string; kind: ActivityKind; familyId: string; familyName: string; text: string; email?: EmailEvent }

/** Everything that happened, newest first: signups, tests, payment steps and every email. */
export function activities(families: Family[]): Activity[] {
  const out: Activity[] = [];
  for (const f of families) {
    const add = (at: string | null | undefined, kind: ActivityKind, text: string, email?: EmailEvent) => {
      if (at) out.push({ at, kind, familyId: f.id, familyName: f.name, text, email });
    };
    const kids = f.children.map((c) => c.name).join(" and ");
    add(f.createdAt, "account", kids ? `signed up for ${kids}` : "signed up");
    for (const t of f.tests) {
      add(t.startedAt, "test_start", `${t.childName} started the test`);
      add(t.completedAt, "test_finish", `${t.childName} finished the test (${t.answered} answers)`);
    }
    add(f.reached.card_started, "card_start", "opened the payment page");
    add(f.reached.card_saved, "card_saved", f.card ? `saved a card (${f.card.plan}, CAD ${f.card.price}/month)` : "saved a card");
    add(f.reached.paying, "paying", "subscription started in Stripe");
    add(f.reached.waitlist, "waitlist", "joined the waitlist");
    for (const e of f.emails) add(e.at, "email", e.kind === "unsubscribe" ? "turned reminders off" : `${EMAIL_LABEL[e.kind]}: "${e.subject}"`, e);
  }
  return out.sort(newestFirst);
}

// Days and ranges

export const RANGES = { today: { label: "Today", days: 1 }, "7d": { label: "7 days", days: 7 }, "30d": { label: "30 days", days: 30 }, all: { label: "All time", days: 0 } } as const;
export type RangeKey = keyof typeof RANGES;
export const pickRange = (raw: unknown): RangeKey => (typeof raw === "string" && Object.hasOwn(RANGES, raw) ? (raw as RangeKey) : "7d");

const PACIFIC_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit" });
/** The Pacific day of a time, as YYYY-MM-DD. */
export const dayKey = (iso: string | Date) => PACIFIC_DAY.format(typeof iso === "string" ? new Date(iso) : iso);
/** The day `n` days after `day` (n may be negative). Date arithmetic on the calendar day, so DST never skips one. */
export function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const daysBack = (last: string, n: number) => Array.from({ length: n }, (_, i) => shiftDay(last, i - n + 1));

/** The Pacific days of a range, oldest first, ending today. "all" starts at the first signup (at least 14 days). */
export function rangeDays(range: RangeKey, now: Date, first: string | null): string[] {
  const today = dayKey(now);
  let n: number = RANGES[range].days;
  if (n === 0) {
    n = 14;
    if (first) for (let d = dayKey(first); d < shiftDay(today, -13); d = shiftDay(d, 1)) n++;
  }
  return daysBack(today, n);
}

// The dashboard

export interface Kpi { key: string; label: string; value: number; prev: number | null; unit?: "%"; spark: number[]; hint: string }
export interface DayCounts { day: string; accounts: number; started: number; finished: number; cards: number; emails: number }

export interface Dashboard {
  now: string;
  range: RangeKey;
  days: string[];
  /** Most recent activity first. */
  families: Family[];
  activity: Activity[];
  emails: EmailEvent[];
  kpis: Kpi[];
  series: DayCounts[];
  /** Families that reached each funnel stage: ever, and among those who signed up in the range. */
  funnel: { stage: FunnelStage; ever: number; inRange: number }[];
  stageCounts: Record<Stage, number>;
  emailSummary: (EmailKindInfo & { sent: number; failed: number; pending: number; sentInRange: number; last: string | null })[];
  needs: { title: string; detail: string; tone: "warn" | "bad" | "info"; families: Family[] }[];
  stripeNote: string | null;
  /** Team and test families: how many there are, and whether they are in the numbers. */
  tests: { count: number; shown: boolean };
}

type Pick = (f: Family) => (string | null | undefined)[];
const PICK: Record<Exclude<keyof DayCounts, "day">, Pick> = {
  accounts: (f) => [f.createdAt],
  started: (f) => f.tests.map((t) => t.startedAt),
  finished: (f) => f.tests.map((t) => t.completedAt),
  cards: (f) => [f.reached.card_saved],
  emails: (f) => f.emails.filter((e) => e.status === "sent" && e.kind !== "unsubscribe" && e.kind !== "alert").map((e) => e.at),
};
const pickPaying: Pick = (f) => [f.reached.paying];
const STUCK_DAYS = 2;

/** `withTests`: count the team and test families too. */
export function buildDashboard(rows: DashboardRows, range: RangeKey, now: Date, { withTests = false } = {}): Dashboard {
  const everyone = buildFamilies(rows);
  const families = everyone.filter((f) => withTests || !f.test).sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  const emails = families.flatMap((f) => f.emails).sort(newestFirst);
  const first = earliest(families.map((f) => f.createdAt));
  const all = range === "all";
  const days = rangeDays(range, now, first);
  const sparkDays = range === "today" ? rangeDays("7d", now, first) : days;
  const cur = new Set(days);
  const prev = new Set(days.map((d) => shiftDay(d, -days.length)));
  const inSet = (set: Set<string>) => (iso: string | null | undefined) => !!iso && set.has(dayKey(iso));
  const inCur = inSet(cur);

  // one pass: every picked time by its Pacific day
  const byDay = (pick: Pick) => {
    const m = new Map<string, number>();
    for (const f of families) for (const x of pick(f)) if (x) m.set(dayKey(x), (m.get(dayKey(x)) ?? 0) + 1);
    return m;
  };
  const sum = (m: Map<string, number>, set: Set<string> | null) => [...m].reduce((n, [d, c]) => n + (!set || set.has(d) ? c : 0), 0);
  const kpi = (key: string, label: string, pick: Pick, hint: string): Kpi => {
    const m = byDay(pick);
    return { key, label, hint, value: sum(m, all ? null : cur), prev: all ? null : sum(m, prev), spark: sparkDays.map((d) => m.get(d) ?? 0) };
  };
  const rate = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));
  const started = kpi("started", "Tests started", PICK.started, "Children who began the free test");
  const finished = kpi("finished", "Tests finished", PICK.finished, "Finished tests; each one sends a report email");
  const kpis: Kpi[] = [
    kpi("accounts", "New accounts", PICK.accounts, "Parents who made an account"),
    started,
    finished,
    {
      key: "completion", label: "Finish rate", unit: "%", hint: "Tests finished divided by tests started, in the same days",
      value: rate(finished.value, started.value),
      prev: finished.prev === null || started.prev === null ? null : rate(finished.prev, started.prev),
      spark: finished.spark.map((f, i) => rate(f, started.spark[i])),
    },
    kpi("saved", "Cards saved", PICK.cards, "Parents who saved a card in Stripe (nothing is charged)"),
    kpi("paying", "New paying", pickPaying, "Stripe subscriptions started"),
    kpi("emails", "Emails to parents", PICK.emails, "Reminder and report emails sent"),
  ];

  const counts = Object.fromEntries(Object.entries(PICK).map(([k, pick]) => [k, byDay(pick)])) as Record<keyof typeof PICK, Map<string, number>>;
  const series = days.map((day) => ({ day, accounts: counts.accounts.get(day) ?? 0, started: counts.started.get(day) ?? 0, finished: counts.finished.get(day) ?? 0, cards: counts.cards.get(day) ?? 0, emails: counts.emails.get(day) ?? 0 }));

  const reachedStage = (f: Family, s: FunnelStage) => !!f.reached[s] || (s === "finished" && !!f.reached.waitlist);
  const funnel = STAGES.map((stage) => ({
    stage,
    ever: families.filter((f) => reachedStage(f, stage)).length,
    inRange: families.filter((f) => (all || inCur(f.createdAt)) && reachedStage(f, stage)).length,
  }));
  const stageCounts = Object.fromEntries(ALL_STAGES.map((s) => [s, families.filter((f) => f.stage === s).length])) as Record<Stage, number>;

  const emailSummary = EMAIL_KINDS.map((k) => {
    const list = emails.filter((e) => e.kind === k.kind);
    const sent = list.filter((e) => e.status === "sent");
    return { ...k, sent: sent.length, failed: list.filter((e) => e.status === "failed").length, pending: list.filter((e) => e.status === "pending").length, sentInRange: sent.filter((e) => all || inCur(e.at)).length, last: sent[0]?.at ?? null };
  });

  const ageDays = (iso: string) => (now.getTime() - new Date(iso).getTime()) / 86_400_000;
  const needs: Dashboard["needs"] = [
    { title: "Start a subscription", detail: "Card saved, no Stripe subscription yet", tone: "warn" as const, families: families.filter((f) => f.stage === "card_saved") },
    { title: "Left the payment page", detail: "Opened the payment page but did not save a card", tone: "info" as const, families: families.filter((f) => f.stage === "card_started") },
    { title: "Stuck in the test", detail: `Test started more than ${STUCK_DAYS} days ago and not finished`, tone: "info" as const, families: families.filter((f) => f.stage === "started" && ageDays(f.stageAt) > STUCK_DAYS) },
    { title: "Email failed", detail: "An email to the parent did not send", tone: "bad" as const, families: families.filter((f) => f.emails.some((e) => e.status === "failed" && e.kind !== "alert")) },
  ].filter((n) => n.families.length > 0);

  return { now: now.toISOString(), range, days, families, activity: activities(families), emails, kpis, series, funnel, stageCounts, emailSummary, needs, stripeNote: rows.stripeNote, tests: { count: everyone.filter((f) => f.test).length, shown: withTests } };
}

// Words for the pages

const PACIFIC_TIME = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
/** "Oct 12, 6:10 p.m." in Pacific time. */
export const at = (iso: string | null | undefined) => (iso ? PACIFIC_TIME.format(new Date(iso)) : "-");
/** "5 min ago", "3 h ago", "2 days ago". */
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
/** How long, without "ago": "3 h", "2 days". */
export const since = (iso: string | null | undefined, now: string) => ago(iso, now).replace(/ ago$/, "");
/** "Oct 12" for a YYYY-MM-DD day. */
export const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
export const kidsText = (f: Family) => f.children.map((c) => `${c.name} (gr ${c.grade})`).join(", ") || "No child";
