// The admin dashboard and activity log (D-099) in plain data: every family with its stage, the KPIs of a date range,
// the daily series, the email log and the activity events. Pure: no network, database or clock (the caller passes
// `now`), so the pages only fetch (dashboardRows in admin-store) and show. Days are Pacific days.
import type { Province } from "@/lib/assessment";
import type { AssessmentStatus } from "@/lib/test-api";
import { canGetEmail, nextStartReminder, type StartKind } from "@/lib/reminder-schedule";
import type { DeliveryType } from "@/lib/resend-webhook";

// Rows, as admin-store reads them

export interface RawParent { id: string; created_at: string; name: string; email: string; postal: string; source: Record<string, string> | null }
export interface RawChild { id: string; created_at: string; parent_id: string; first_name: string; grade: number; province: Province }
export interface RawTest { id: string; created_at: string; status: AssessmentStatus; parent_id: string; child_id: string; grade: number; province: Province; started_at: string; completed_at: string | null; last_answer_at: string | null; answered: number }
export interface RawReport { id: string; created_at: string; assessment_id: string; parent_id: string; child_id: string; emailed_at: string | null; email_error: string | null; alerted_at: string | null; alert_error: string | null; email_clicks: number; email_first_clicked_at: string | null }
export interface RawCard {
  id: string; created_at: string; updated_at: string; parent_id: string; child_id: string; plan: "one" | "both"; price: number;
  stripe_customer_id: string | null; card_saved_at: string | null;
  /** Stripe has a finished card setup that the site did not record (the parent left before the thank-you page). */
  saved_in_stripe_only?: boolean;
}
export interface RawWaitlist { id: string; created_at: string; parent_id: string; child_id: string; province: Province }
export interface RawEmail { id: string; created_at: string; parent_id: string; child_id: string | null; assessment_id: string | null; kind: "continue" | "come_back" | "start" | "start_followup" | "unsubscribe"; status: "claimed" | "sent" | "failed" | null; attempts: number; sent_at: string | null; error: string | null; clicks: number; first_clicked_at: string | null }
/** A Stripe subscription of a saved card's customer. Times are ISO. `amount`: the price per unit, in cents. */
export interface RawSubscription {
  id: string;
  customer: string;
  status: string;
  created: string;
  /** When it ended or was cancelled; null while it runs. */
  endedAt: string | null;
  amount: number | null;
  quantity: number;
  interval: "day" | "week" | "month" | "year" | null;
  intervalCount: number;
  currency: string | null;
}

/** One delivery event from Resend's webhook (D-104), joined to its email through the kept copy. */
export interface RawDelivery { email_log_id: string | null; report_id: string | null; report_email: "parent" | "alert" | null; type: DeliveryType; occurred_at: string; detail: string | null }

export interface DashboardRows {
  parents: RawParent[];
  children: RawChild[];
  tests: RawTest[];
  reports: RawReport[];
  cards: RawCard[];
  waitlist: RawWaitlist[];
  emails: RawEmail[];
  /** Resend's delivery events of the emails with a kept copy (D-104), each with the email it belongs to. */
  deliveries: RawDelivery[];
  subscriptions: RawSubscription[];
  /** Parents left out of the numbers: admin accounts and families marked as a test (D-099). */
  testIds: string[];
  /** Why payment status is unknown (no Stripe key, or Stripe failed); null when Stripe answered. */
  stripeNote: string | null;
  /** The mode of the Stripe key that answered; null when Stripe was not asked or failed. */
  stripeMode: "live" | "test" | null;
}


// Stages

/** The funnel, in order. A family's stage is the furthest one it reached. */
export const STAGES = ["account", "started", "finished", "card_started", "card_saved", "paying"] as const;
export type FunnelStage = (typeof STAGES)[number];
/**
 * Waitlist sits beside "finished": a non-BC family finished the test and joined the waitlist instead of a plan.
 * Cancelled sits beside "paying": the family had a subscription, and none is paying now.
 */
export type Stage = FunnelStage | "waitlist" | "cancelled";
export const ALL_STAGES: readonly Stage[] = [...STAGES, "cancelled", "waitlist"];

export const STAGE_TEXT: Record<Stage, string> = {
  account: "Signed up, no test", started: "Test started", finished: "Test finished", card_started: "Opened payment page",
  card_saved: "Card saved", paying: "Paying", cancelled: "Cancelled", waitlist: "Waitlist",
};
export const STAGE_SHORT: Record<Stage, string> = {
  account: "Signed up", started: "Started test", finished: "Finished test", card_started: "Payment page",
  card_saved: "Card saved", paying: "Paying", cancelled: "Cancelled", waitlist: "Waitlist",
};
/** What happens next for a family in this stage, or what Savar can do. */
export const STAGE_ACTION: Record<Stage, string> = {
  account: "Start reminders go out automatically: on day 1, and a last one on day 3.",
  started: "The continue reminder goes out automatically.",
  finished: "Report sent. Waiting for the parent to choose a plan.",
  card_started: "The parent left the payment page. Consider a personal email.",
  card_saved: "Start the Stripe subscription when the first workbook ships.",
  paying: "Nothing to do.",
  cancelled: "The Stripe subscription ended. Consider asking the parent why.",
  waitlist: "Not BC. Waiting for their curriculum.",
};
const RANK: Record<Stage, number> = { account: 0, started: 1, finished: 2, waitlist: 2, card_started: 3, card_saved: 4, paying: 5, cancelled: 5 };
/** Stripe statuses that count as paying. past_due is still a subscriber whose last charge failed (shown in Needs you). */
const PAYING = new Set(["active", "trialing", "past_due"]);
/** Stripe statuses of a subscription that never started (the first payment did not go through): not counted at all. */
const NEVER_STARTED = new Set(["incomplete", "incomplete_expired"]);
/** A subscription's amount per month, in dollars: the price times the quantity, spread over its billing period. */
export function monthlyAmount(s: RawSubscription): number {
  if (s.amount === null || !s.interval) return 0;
  const months = { day: 12 / 365, week: 12 / 52, month: 1, year: 12 }[s.interval] * Math.max(1, s.intervalCount);
  return (s.amount * Math.max(1, s.quantity)) / 100 / months;
}

// Emails

export type EmailKind = "start" | "start_followup" | "continue" | "come_back" | "report" | "alert" | "unsubscribe";
export interface EmailKindInfo { kind: EmailKind; label: string; subject: string; to: string; trigger: string }
/** Every email the site logs. The subjects follow reminder-email.ts and report-email.ts. */
export const EMAIL_KINDS: readonly EmailKindInfo[] = [
  { kind: "start", label: "Start reminder", subject: "{child} has not started the free math test", to: "Parent", trigger: "Account made, no test started" },
  { kind: "start_followup", label: "Last start reminder", subject: "Last reminder: {child}'s free math test", to: "Parent", trigger: "Day 3, still no test started" },
  { kind: "continue", label: "Continue reminder", subject: "{child} can finish the math test", to: "Parent", trigger: "Test started, not finished" },
  { kind: "come_back", label: "Come back reminder", subject: "{child} can start the math test again", to: "Parent", trigger: "Test expired before the end" },
  { kind: "report", label: "Report email", subject: "{child}'s math report is ready", to: "Parent", trigger: "Test finished, report built" },
  { kind: "alert", label: "Report alert", subject: "Test finished: {child}, grade {grade}, working at ...", to: "You", trigger: "Test finished, report built" },
  { kind: "unsubscribe", label: "Unsubscribe", subject: "No email: the parent turned reminders off", to: "-", trigger: "Parent clicked unsubscribe" },
];
export const EMAIL_LABEL = Object.fromEntries(EMAIL_KINDS.map((k) => [k.kind, k.label])) as Record<EmailKind, string>;

/** What Resend said happened to an email after it took it (D-104). */
export const DELIVERY_TEXT: Record<DeliveryType, string> = {
  delivered: "Delivered", delivery_delayed: "Delivery delayed", bounced: "Bounced", complained: "Marked as spam", failed: "Not delivered", suppressed: "Not sent: address on the suppression list",
};
/** The delivery events that mean the parent did not get the email, or did not want it. */
export const deliveryProblem = (type: DeliveryType | undefined) => type === "bounced" || type === "complained" || type === "failed" || type === "suppressed";
export interface Delivery { type: DeliveryType; at: string; detail: string | null }
/** An email that did not reach the parent: Resend refused it, or it bounced, failed or was marked as spam. */
export const emailFailed = (e: EmailEvent) => e.status === "failed" || deliveryProblem(e.delivery?.type);
/** Resend's newest delivery event of a sent email as one line, or null before one arrives (D-104). */
export function deliveryLine(e: EmailEvent): { text: string; bad: boolean } | null {
  if (e.status !== "sent" || !e.delivery) return null;
  const { type, detail } = e.delivery;
  return { text: `${DELIVERY_TEXT[type]}${detail ? `: ${detail}` : ""}`, bad: deliveryProblem(type) };
}
/** "Clicked 2 times" for an email the parent clicked (D-105), else null. */
export const clicksText = (e: EmailEvent) => (e.clicks ? `Clicked ${e.clicks.count === 1 ? "once" : `${e.clicks.count} times`}` : null);
/** The emails a parent can click: every one to the parent with a button (not the alert to Savar, not an unsubscribe). */
export const clickable = (e: EmailEvent) => e.kind !== "alert" && e.kind !== "unsubscribe";
/** The dot of an email in the lists: failed when it did not reach the parent. */
export const emailDot = (e: EmailEvent) => (emailFailed(e) ? "failed" : e.status);

/** The kept copy of a logged email (public.email_copies, D-103): what the site handed to Resend on the last attempt. */
export interface EmailCopyView {
  outcome: "sent" | "refused" | "unknown";
  from: string | null;
  to: string;
  replyTo: string | null;
  subject: string;
  text: string;
  html: string | null;
  /** When the last attempt's copy was kept. */
  keptAt: string;
  /** Resend's delivery events of the email, oldest first (D-104). */
  events: Delivery[];
}
/** The email list id of a report's emails: "<report id>:report" or "<report id>:alert". A reminder's id is its log id. */
export const reportEmailId = (reportId: string, which: "report" | "alert") => `${reportId}:${which}`;

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
  /** Resend's newest delivery event of the email (D-104); null before any arrives, or for an email without a copy. */
  delivery: Delivery | null;
  /** The parent's visits from the email's button (D-105): how many, and the first; null when never clicked. */
  clicks: { count: number; first: string } | null;
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
  /** The newest card setup, for display. */
  card: { plan: string; price: number; savedAt: string | null; updatedAt: string; customerId: string | null } | null;
  /** Every card setup (one per child), oldest first. */
  cards: { childId: string; savedAt: string | null; createdAt: string; customerId: string | null }[];
  /** The paying subscription, else the newest ended one; null when the family never subscribed. */
  subscription: { status: string; since: string; endedAt: string | null; monthly: number } | null;
  /** Every subscription that started, on any of the family's customers, oldest first. */
  subscriptions: RawSubscription[];
  /** Newest first, including the report alerts to Savar. */
  emails: EmailEvent[];
  /** The newest email to the parent (not an alert, not an unsubscribe). */
  lastEmail: EmailEvent | null;
  unsubscribed: boolean;
  /**
   * The start reminder each child with no test gets next, by the job's own rules (D-102); empty when the parent
   * unsubscribed or the address cannot get email. `at` can be past: the job sends it on its next run (every 15 minutes).
   */
  nextReminders: { childName: string; kind: StartKind; at: string }[];
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

export function buildFamilies(rows: DashboardRows, now = new Date()): Family[] {
  const testIds = new Set(rows.testIds);
  const childName = new Map(rows.children.map((c) => [c.id, c.first_name]));
  const testById = new Map(rows.tests.map((t) => [t.id, t]));
  const reportByTest = new Map(rows.reports.map((r) => [r.assessment_id, r.id]));
  // The newest delivery event of each email, by its id in the email list.
  const deliveryOf = new Map<string, Delivery>();
  for (const d of rows.deliveries) {
    const key = d.email_log_id ?? (d.report_id && reportEmailId(d.report_id, d.report_email === "alert" ? "alert" : "report"));
    const held = key ? deliveryOf.get(key) : undefined;
    if (key && (!held || held.at <= d.occurred_at)) deliveryOf.set(key, { type: d.type, at: d.occurred_at, detail: d.detail });
  }
  const subsOf = new Map<string, RawSubscription[]>();
  for (const s of rows.subscriptions) if (!NEVER_STARTED.has(s.status)) subsOf.set(s.customer, [...(subsOf.get(s.customer) ?? []), s]);

  return rows.parents.map((p) => {
    const mine = <T extends { parent_id: string }>(xs: T[]) => xs.filter((x) => x.parent_id === p.id);
    const children = mine(rows.children);
    const tests = mine(rows.tests).sort((a, b) => b.started_at.localeCompare(a.started_at));
    const cards = mine(rows.cards).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const waits = mine(rows.waitlist);
    const customers = new Set(cards.flatMap((c) => (c.stripe_customer_id ? [c.stripe_customer_id] : [])));
    const subs = [...customers].flatMap((c) => subsOf.get(c) ?? []).sort((a, b) => a.created.localeCompare(b.created));
    const paying = subs.filter((s) => PAYING.has(s.status));
    const shown = paying.at(-1) ?? subs.at(-1) ?? null;

    const emails: EmailEvent[] = mine(rows.emails).map((e) => {
      const child = e.child_id ? (childName.get(e.child_id) ?? null) : null;
      const grade = e.assessment_id ? (testById.get(e.assessment_id)?.grade ?? null) : null;
      return {
        id: e.id, kind: e.kind, at: e.sent_at ?? e.created_at, familyId: p.id, familyName: p.name, childName: child, attempts: e.attempts, error: e.error,
        status: e.kind === "unsubscribe" || e.status === "sent" ? "sent" : e.status === "failed" ? "failed" : "pending",
        subject: subjectFor(e.kind, child, grade),
        delivery: deliveryOf.get(e.id) ?? null,
        clicks: e.clicks > 0 && e.first_clicked_at ? { count: e.clicks, first: e.first_clicked_at } : null,
      };
    });
    for (const r of mine(rows.reports)) {
      const child = childName.get(r.child_id) ?? null;
      const grade = testById.get(r.assessment_id)?.grade ?? null;
      const base = { familyId: p.id, familyName: p.name, childName: child, attempts: 1 };
      const delivered = (which: "report" | "alert") => deliveryOf.get(reportEmailId(r.id, which)) ?? null;
      emails.push({ ...base, id: reportEmailId(r.id, "report"), kind: "report", at: r.emailed_at ?? r.created_at, error: r.email_error, status: emailStatus(r.emailed_at, r.email_error), subject: subjectFor("report", child, grade), delivery: delivered("report"), clicks: r.email_clicks > 0 && r.email_first_clicked_at ? { count: r.email_clicks, first: r.email_first_clicked_at } : null });
      emails.push({ ...base, id: reportEmailId(r.id, "alert"), kind: "alert", at: r.alerted_at ?? r.created_at, error: r.alert_error, status: emailStatus(r.alerted_at, r.alert_error), subject: subjectFor("alert", child, grade), delivery: delivered("alert"), clicks: null });
    }
    emails.sort(newestFirst);

    const reached: Partial<Record<Stage, string>> = { account: p.created_at };
    const at = {
      started: earliest(tests.map((t) => t.started_at)),
      finished: earliest(tests.map((t) => t.completed_at)),
      waitlist: earliest(waits.map((w) => w.created_at)),
      card_started: earliest(cards.map((c) => c.created_at)),
      card_saved: earliest(cards.map((c) => c.card_saved_at)),
      paying: subs[0]?.created ?? null,
      cancelled: subs.length > 0 && paying.length === 0 ? latest(subs.map((s) => s.endedAt ?? s.created)) : null,
    };
    for (const [s, when] of Object.entries(at)) if (when) reached[s as Stage] = when;
    // the furthest stage; waitlist beats finished and cancelled beats paying (same ranks), since each came after
    const stage = (Object.keys(reached) as Stage[]).reduce<Stage>((best, s) => (RANK[s] > RANK[best] || (RANK[s] === RANK[best] && (s === "waitlist" || s === "cancelled")) ? s : best), "account");
    const card = cards[0] ?? null;
    const unsubscribed = emails.some((e) => e.kind === "unsubscribe");
    const logOf = mine(rows.emails);
    const nextReminders = unsubscribed || !canGetEmail(p.email) ? [] : children.flatMap((c) => {
      if (tests.some((t) => t.child_id === c.id)) return [];
      const first = logOf.find((e) => e.kind === "start" && e.child_id === c.id);
      const followup = logOf.some((e) => e.kind === "start_followup" && e.child_id === c.id);
      const next = nextStartReminder(Date.parse(c.created_at), { firstStartAt: first ? Date.parse(first.created_at) : null, followup }, now.getTime());
      return next ? [{ childName: c.first_name, kind: next.kind, at: new Date(next.dueAt).toISOString() }] : [];
    });

    return {
      id: p.id, name: p.name, email: p.email, postal: p.postal, createdAt: p.created_at, source: sourceOf(p.source),
      children: children.map((c) => ({ id: c.id, name: c.first_name, grade: c.grade, province: c.province })),
      stage, stageAt: reached[stage] ?? p.created_at, reached,
      tests: tests.map((t) => ({ id: t.id, childId: t.child_id, childName: childName.get(t.child_id) ?? "Child", status: t.status, startedAt: t.started_at, completedAt: t.completed_at, lastAnswerAt: t.last_answer_at, answered: t.answered, reportId: reportByTest.get(t.id) ?? null })),
      expired: tests.length > 0 && tests.every((t) => t.status === "expired"),
      card: card ? { plan: card.plan === "one" ? "Math" : "Math and reading", price: card.price, savedAt: card.card_saved_at, updatedAt: card.updated_at, customerId: card.stripe_customer_id } : null,
      cards: [...cards].reverse().map((c) => ({ childId: c.child_id, savedAt: c.card_saved_at, createdAt: c.created_at, customerId: c.stripe_customer_id })),
      subscription: shown ? { status: shown.status, since: shown.created, endedAt: shown.endedAt, monthly: paying.reduce((n, s) => n + monthlyAmount(s), 0) } : null,
      subscriptions: subs,
      emails,
      lastEmail: emails.find((e) => e.kind !== "alert" && e.kind !== "unsubscribe") ?? null,
      unsubscribed,
      nextReminders,
      test: testIds.has(p.id),
      lastActivityAt: latest([p.created_at, ...tests.flatMap((t) => [t.started_at, t.last_answer_at, t.completed_at]), ...cards.flatMap((c) => [c.updated_at, c.card_saved_at]), ...waits.map((w) => w.created_at), ...subs.flatMap((s) => [s.created, s.endedAt])]),
    };
  });
}

// Activity

export type ActivityKind = "account" | "test_start" | "test_finish" | "card_start" | "card_saved" | "paying" | "cancelled" | "waitlist" | "email";
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
    for (const c of f.cards) add(c.savedAt, "card_saved", `saved a card for ${f.children.find((k) => k.id === c.childId)?.name ?? "a child"}`);
    for (const s of f.subscriptions) {
      add(s.created, "paying", `subscription started in Stripe (CAD ${monthlyAmount(s).toFixed(2)}/month)`);
      if (s.endedAt) add(s.endedAt, "cancelled", "subscription ended in Stripe");
    }
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

/**
 * One number of a range. `prev`: the same span just before (cut at the same time of day, so "today" is compared with
 * yesterday up to this time); null for all time and for point-in-time numbers. `spark`: one value per day.
 */
export interface Kpi { key: string; label: string; value: number; prev: number | null; format?: "%" | "cad"; spark: number[]; hint: string }
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
  emailSummary: (EmailKindInfo & { sent: number; failed: number; pending: number; sentInRange: number; last: string | null; clicked: number })[];
  needs: { title: string; detail: string; tone: "warn" | "bad" | "info"; families: Family[] }[];
  stripeNote: string | null;
  stripeMode: "live" | "test" | null;
  /** Saved cards that only Stripe knew about (see confirmCardsInStripe in admin-store). */
  cardsFoundInStripe: number;
  /** Team and test families: how many there are, and whether they are in the numbers. */
  tests: { count: number; shown: boolean };
}

type Pick = (f: Family) => (string | null | undefined)[];
const PICK: Record<Exclude<keyof DayCounts, "day">, Pick> = {
  accounts: (f) => [f.createdAt],
  started: (f) => f.tests.map((t) => t.startedAt),
  finished: (f) => f.tests.map((t) => t.completedAt),
  cards: (f) => f.cards.map((c) => c.savedAt),
  emails: (f) => f.emails.filter((e) => e.status === "sent" && e.kind !== "unsubscribe" && e.kind !== "alert").map((e) => e.at),
};
const pickSubscriptions: Pick = (f) => f.subscriptions.map((s) => s.created);
const STUCK_DAYS = 2;
const DAY_MS = 86_400_000;

/** `withTests`: count the team and test families too. */
export function buildDashboard(rows: DashboardRows, range: RangeKey, now: Date, { withTests = false } = {}): Dashboard {
  const everyone = buildFamilies(rows, now);
  const families = everyone.filter((f) => withTests || !f.test).sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  const emails = families.flatMap((f) => f.emails).sort(newestFirst);
  const first = earliest(families.map((f) => f.createdAt));
  const all = range === "all";
  const days = rangeDays(range, now, first);
  const sparkDays = range === "today" ? rangeDays("7d", now, first) : days;
  const cur = new Set(days);
  const prev = new Set(days.map((d) => shiftDay(d, -days.length)));
  // the previous span ends at the same time of day as now, n days back
  const prevEnd = now.getTime() - days.length * DAY_MS;
  const inCur = (iso: string | null | undefined) => !!iso && cur.has(dayKey(iso)) && new Date(iso).getTime() <= now.getTime();
  const inPrev = (iso: string | null | undefined) => !!iso && prev.has(dayKey(iso)) && new Date(iso).getTime() <= prevEnd;
  const onDay = (day: string) => (iso: string | null | undefined) => !!iso && dayKey(iso) === day;

  const count = (pick: Pick, test: (iso: string | null | undefined) => boolean) => families.reduce((n, f) => n + pick(f).filter(test).length, 0);
  const kpi = (key: string, label: string, pick: Pick, hint: string): Kpi => ({
    key, label, hint,
    value: all ? count(pick, Boolean) : count(pick, inCur),
    prev: all ? null : count(pick, inPrev),
    spark: sparkDays.map((d) => count(pick, onDay(d))),
  });

  // finish rate: of the tests started in the span, the share finished by now (bounded at 100%)
  const tests = families.flatMap((f) => f.tests);
  const rate = (inSpan: (iso: string) => boolean) => {
    const begun = tests.filter((t) => inSpan(t.startedAt));
    return begun.length === 0 ? 0 : Math.round((begun.filter((t) => t.completedAt).length / begun.length) * 100);
  };
  const payingFamilies = families.filter((f) => f.stage === "paying");
  const mrr = Math.round(payingFamilies.reduce((n, f) => n + (f.subscription?.monthly ?? 0), 0) * 100) / 100;

  const kpis: Kpi[] = [
    kpi("accounts", "New accounts", PICK.accounts, "Parents who finished making an account (email confirmed)"),
    kpi("started", "Tests started", PICK.started, "Tests begun. A child who starts again after a test expired counts again."),
    kpi("finished", "Tests finished", PICK.finished, "Tests finished. Each one sends the parent a report."),
    {
      key: "completion", label: "Finish rate", format: "%", hint: "Of the tests started in these days, the share finished by now. Tests still in progress count as not finished.",
      value: rate(all ? () => true : inCur), prev: all ? null : rate(inPrev), spark: sparkDays.map((d) => rate(onDay(d))),
    },
    kpi("saved", "Cards saved", PICK.cards, "Cards saved in Stripe, one per child. Nothing is charged."),
    kpi("subscribed", "Subscriptions started", pickSubscriptions, "Stripe subscriptions you started on a saved card"),
    { key: "paying", label: "Paying now", hint: "Families with a Stripe subscription that is active, trialing or past due, right now", value: payingFamilies.length, prev: null, spark: [] },
    { key: "mrr", label: "Monthly revenue", format: "cad", hint: "The monthly price of every paying subscription, before any discount on the first month", value: mrr, prev: null, spark: [] },
    kpi("emails", "Emails to parents", PICK.emails, "Reminder and report emails sent"),
  ];

  const series = days.map((day) => {
    const on = onDay(day);
    return { day, accounts: count(PICK.accounts, on), started: count(PICK.started, on), finished: count(PICK.finished, on), cards: count(PICK.cards, on), emails: count(PICK.emails, on) };
  });

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
    return { ...k, sent: sent.length, failed: list.filter(emailFailed).length, pending: list.filter((e) => e.status === "pending").length, sentInRange: sent.filter((e) => all || inCur(e.at)).length, last: sent[0]?.at ?? null, clicked: sent.filter((e) => e.clicks).length };
  });

  const ageDays = (iso: string) => (now.getTime() - new Date(iso).getTime()) / DAY_MS;
  const needs: Dashboard["needs"] = [
    { title: "Payment failing", detail: "A Stripe subscription is past due: the last charge did not go through", tone: "bad" as const, families: families.filter((f) => f.subscriptions.some((s) => s.status === "past_due")) },
    { title: "Start a subscription", detail: "Card saved, and no Stripe subscription yet", tone: "warn" as const, families: families.filter((f) => f.stage === "card_saved") },
    { title: "Left the payment page", detail: "Opened the payment page but did not save a card", tone: "info" as const, families: families.filter((f) => f.stage === "card_started") },
    { title: "Stuck in the test", detail: `Test started more than ${STUCK_DAYS} days ago and not finished`, tone: "info" as const, families: families.filter((f) => f.stage === "started" && ageDays(f.stageAt) > STUCK_DAYS) },
    { title: "Email failed", detail: "An email to the parent did not send, bounced, or was marked as spam", tone: "bad" as const, families: families.filter((f) => f.emails.some((e) => emailFailed(e) && e.kind !== "alert")) },
  ].filter((n) => n.families.length > 0);

  return {
    now: now.toISOString(), range, days, families, activity: activities(families), emails, kpis, series, funnel, stageCounts, emailSummary, needs,
    stripeNote: rows.stripeNote, stripeMode: rows.stripeMode, cardsFoundInStripe: rows.cards.filter((c) => c.saved_in_stripe_only && families.some((f) => f.id === c.parent_id)).length, tests: { count: everyone.filter((f) => f.test).length, shown: withTests },
  };
}

// Words for the pages

const PACIFIC_TIME = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
/** "Oct 12, 6:10 p.m." in Pacific time. */
export const at = (iso: string | null | undefined) => (iso ? PACIFIC_TIME.format(new Date(iso)) : "-");
/** "Last start reminder for Kingston, Oct 18, 1:09 p.m.": a family's next start reminder, or "due now" once its time passed. */
export const nextReminderText = (r: Family["nextReminders"][number], now: string) =>
  `${EMAIL_LABEL[r.kind]} for ${r.childName}, ${Date.parse(r.at) <= Date.parse(now) ? "due now (the job runs every 15 minutes)" : at(r.at)}`;
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
/** The family's payment in words, for the family panel and page. */
export function paymentText(f: Family): string {
  const s = f.subscription;
  if (s?.endedAt && f.stage === "cancelled") return `Stripe subscription ended ${at(s.endedAt)} (started ${at(s.since)}).`;
  if (s) return `Stripe subscription ${s.status.replace("_", " ")} since ${at(s.since)}: CAD ${s.monthly.toFixed(2)} a month.`;
  const saved = f.cards.filter((c) => c.savedAt).length;
  if (saved > 0) return `${saved} card${saved === 1 ? "" : "s"} saved, no subscription yet.`;
  if (f.card) return "Opened the payment page, no card saved.";
  return f.reached.waitlist ? "On the waitlist." : "Has not opened the payment page.";
}
export const kidsText = (f: Family) => f.children.map((c) => `${c.name} (gr ${c.grade})`).join(", ") || "No child";
