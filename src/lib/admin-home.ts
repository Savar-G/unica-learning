// The admin Home (D-313, D-315): what each of its panels shows, in plain data. Pure: no network, database or clock (the
// caller passes the dashboard, the production books and the marking queue it already read, with their `now`). It
// invents no rule: stages, the funnel and the Needs you lists are the dashboard's (admin-dashboard.ts), the books and
// their stages are Production's (admin-production.ts).
//
// Numbers count real families only, also while "Show test families" is on. The lists (the newest customers, the
// timeline) follow the switch: test families show in them, tagged, and never in a count.
import { dayKey, shiftDay, type Activity, type Dashboard, type Family, type FunnelStage, type RangeKey } from "@/lib/admin-dashboard";
import { groupBooks, makingView, type Book, type Stage as BookStage } from "@/lib/admin-production";
import { formatInZone, partsInZone, PACIFIC_ZONE } from "@/lib/family-time";
import { READING_ISSUES, readingIssueText, type ReadingIssue } from "@/lib/scan-observation";

const DAY_MS = 86_400_000;
/** The day charts cover the last 14 Pacific days, whatever the range. */
export const STRIP_DAYS = 14;
/** At most this many dots in one day of the dot strip; more shows as "+N" above them. */
export const DOT_CAP = 4;
export const NEWEST_MAX = 3;
export const TIMELINE_MAX = 7;

const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Days

/** The last `n` Pacific days, oldest first, ending today. */
export function lastDays(now: string | Date, n = STRIP_DAYS): string[] {
  const today = dayKey(now);
  return Array.from({ length: n }, (_, i) => shiftDay(today, i - n + 1));
}

/** How many days of the current week (Monday to Sunday) have passed, today included: 1 on a Monday, 7 on a Sunday. */
export function thisWeekDays(today: string): number {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** How many of `times` fall on each of `days` (Pacific). A time after `now` is not counted. */
export function perDay(days: readonly string[], times: readonly (string | null | undefined)[], now: string): number[] {
  const end = Date.parse(now);
  const index = new Map(days.map((d, i) => [d, i]));
  const out = days.map(() => 0);
  for (const t of times) {
    if (!t || Date.parse(t) > end) continue;
    const i = index.get(dayKey(t));
    if (i !== undefined) out[i]++;
  }
  return out;
}

export interface DayColumn {
  day: string;
  n: number;
  /** In the current week (the shaded band). */
  thisWeek: boolean;
}
/** One dot per event, at most `cap`; `more` events past that. */
export interface DotColumn extends DayColumn { dots: number; more: number }
/** A labeled bar: its height as a share of the busiest day (0 to 100). */
export interface BarColumn extends DayColumn { height: number }

const band = (days: readonly string[]) => thisWeekDays(days[days.length - 1] ?? "1970-01-05");

export function dotColumns(days: readonly string[], counts: readonly number[], cap = DOT_CAP): DotColumn[] {
  const week = band(days);
  return days.map((day, i) => ({ day, n: counts[i] ?? 0, dots: Math.min(counts[i] ?? 0, cap), more: Math.max(0, (counts[i] ?? 0) - cap), thisWeek: i >= days.length - week }));
}

export function barColumns(days: readonly string[], counts: readonly number[]): BarColumn[] {
  const week = band(days);
  const top = Math.max(1, ...counts);
  return days.map((day, i) => ({ day, n: counts[i] ?? 0, height: Math.round(((counts[i] ?? 0) / top) * 100), thisWeek: i >= days.length - week }));
}

// The range

/** What the range is called in a sentence, and the span it is compared with (none for all time). */
export const PERIOD: Record<RangeKey, { now: string; before: string | null }> = {
  today: { now: "today", before: "yesterday" },
  "7d": { now: "in the last 7 days", before: "the 7 days before" },
  "30d": { now: "in the last 30 days", before: "the 30 days before" },
  all: { now: "all time", before: null },
};

/**
 * Whether a time is in the dashboard's range, and in the span just before it: the dashboard's own rule (the same number
 * of days, cut at the same time of day). `inPrev` is null for all time.
 */
export function spanOf(d: Pick<Dashboard, "days" | "now" | "range">): { inCur: (iso: string | null | undefined) => boolean; inPrev: ((iso: string | null | undefined) => boolean) | null } {
  const now = Date.parse(d.now);
  const n = d.days.length;
  const cur = new Set(d.days);
  const prev = new Set(d.days.map((day) => shiftDay(day, -n)));
  const prevEnd = now - n * DAY_MS;
  const all = d.range === "all";
  return {
    inCur: (iso) => !!iso && Date.parse(iso) <= now && (all || cur.has(dayKey(iso))),
    inPrev: all ? null : (iso) => !!iso && prev.has(dayKey(iso)) && Date.parse(iso) <= prevEnd,
  };
}

/** "Up 2 on the 7 days before", or null when there is nothing to compare with. */
export function changeText(value: number, prev: number | null, range: RangeKey): { text: string; tone: "up" | "down" | "same" } | null {
  const before = PERIOD[range].before;
  if (prev === null || !before) return null;
  const d = value - prev;
  if (d > 0) return { text: `Up ${d} on ${before}`, tone: "up" };
  if (d < 0) return { text: `Down ${-d} on ${before}`, tone: "down" };
  return { text: `Same as ${before}`, tone: "same" };
}

/** "Tuesday 10 November", Pacific. */
export function homeDate(now: string | Date): string {
  const p = partsInZone(now, PACIFIC_ZONE, { weekday: "long", day: "numeric", month: "long" });
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "9:15 am" today, "Yesterday, 7:42 pm", else "Nov 6, 4:10 pm" (Pacific). */
export function whenShort(iso: string | null | undefined, now: string): string {
  if (!iso) return "";
  const day = dayKey(iso), today = dayKey(now);
  const time = formatInZone(iso, PACIFIC_ZONE, { hour: "numeric", minute: "2-digit" }).replace(/\s?a\.m\./i, " am").replace(/\s?p\.m\./i, " pm");
  if (day === today) return time;
  if (day === shiftDay(today, -1)) return `Yesterday, ${time}`;
  return `${formatInZone(iso, PACIFIC_ZONE, { month: "short", day: "numeric" })}, ${time}`;
}

// New customers

/** The family stages of a customer: a saved card, the free month, paying. */
export const CUSTOMER_STAGES: readonly Family["stage"][] = ["card_saved", "trial", "paying"];
/** The dashboard's Needs you title shown in the customers panel. */
export const PAYMENT_FAILING = "Payment failing";

export interface CustomersPanel {
  /** Real families whose first card was saved in the range, and in the span before (null for all time). */
  count: number;
  prev: number | null;
  /** Real families in the free month or paying, right now. */
  active: number;
  /** Cards saved by real families on each of the last 14 days. */
  days: DotColumn[];
  cards14: number;
  /** The newest customers by their first saved card, test families too while they show. */
  newest: Family[];
  /** Real families whose last charge failed. */
  failing: Family[];
}

export function customersPanel(d: Dashboard, max = NEWEST_MAX): CustomersPanel {
  const real = d.families.filter((f) => !f.test);
  const span = spanOf(d);
  const firstSave = (f: Family) => f.reached.card_saved;
  const days = lastDays(d.now);
  const counts = perDay(days, real.flatMap((f) => f.cards.map((c) => c.savedAt)), d.now);
  return {
    count: real.filter((f) => span.inCur(firstSave(f))).length,
    prev: span.inPrev ? real.filter((f) => span.inPrev!(firstSave(f))).length : null,
    active: real.filter((f) => f.stage === "trial" || f.stage === "paying").length,
    days: dotColumns(days, counts),
    cards14: counts.reduce((n, c) => n + c, 0),
    newest: d.families.filter((f) => CUSTOMER_STAGES.includes(f.stage) && firstSave(f))
      .sort((a, b) => firstSave(b)!.localeCompare(firstSave(a)!)).slice(0, max),
    failing: d.needs.find((n) => n.title === PAYMENT_FAILING)?.families ?? [],
  };
}

/** Which of a family's books the panel talks about first: the one that needs the team most. */
const BOOK_ORDER: readonly BookStage[] = ["none", "review", "making", "approved", "printed", "shipped", "delivered"];

/** One plain line on where a customer stands. `books`: Production's books, or null when they could not be read. */
export function customerLine(f: Family, books: readonly Book[] | null): string {
  if (f.stage === "trial") {
    const end = f.subscriptions.find((s) => s.status === "trialing")?.trialEnd;
    return end ? `Free month. First charge ${formatInZone(end, PACIFIC_ZONE, { month: "short", day: "numeric" })}.` : "In the free month.";
  }
  if (f.stage === "paying") return f.subscription ? `Paying CAD ${f.subscription.monthly.toFixed(2)} a month.` : "Paying.";
  const mine = (books ?? []).filter((b) => b.parentId === f.id);
  if (!books || mine.length === 0) return "Card saved. No plan started yet.";
  const first = [...mine].sort((a, b) => BOOK_ORDER.indexOf(a.stage) - BOOK_ORDER.indexOf(b.stage))[0];
  const none = mine.filter((b) => b.stage === "none").length;
  const words: Record<BookStage, string> = {
    none: none > 1 ? `${none} children have no workbook yet.` : "No workbook yet.",
    review: "A draft is ready to review.",
    making: "A workbook is being made.",
    approved: "Workbook approved, ready to print.",
    printed: "Workbook printed, ready to ship.",
    shipped: "Workbook shipped, delivery not confirmed yet.",
    delivered: first.planStarted ? "Workbook delivered." : "Workbook delivered. The free month can start.",
  };
  return `Card saved. ${words[first.stage]}`;
}

export type CustomerAction = { kind: "prepare"; book: Book } | { kind: "prepare-many"; count: number } | { kind: "start" } | null;

/**
 * The one action a customer row carries, when one is due: prepare the workbook of a child with none (Production's
 * "No workbook yet"), or, once a child's workbook is delivered and that child has no plan, start the free month (done
 * under Plans and delivery, by the existing rule: the plan starts after the first workbook's delivery is confirmed).
 */
export function customerAction(f: Family, books: readonly Book[] | null): CustomerAction {
  if (!books) return null;
  const mine = books.filter((b) => b.parentId === f.id);
  const none = mine.filter((b) => b.stage === "none");
  if (none.length === 1) return { kind: "prepare", book: none[0] };
  if (none.length > 1) return { kind: "prepare-many", count: none.length };
  if (mine.some((b) => b.stage === "delivered" && !b.planStarted && b.cardSavedAt)) return { kind: "start" };
  return null;
}

// Signups

const FUNNEL_STEPS: readonly { stage: FunnelStage; label: string }[] = [
  { stage: "account", label: "Signed up" },
  { stage: "started", label: "Started the test" },
  { stage: "finished", label: "Report sent" },
  { stage: "card_saved", label: "Card saved" },
];
/** The dashboard's Needs you lists that name a family who may need a nudge, with the words the panel uses. */
export const NUDGES: readonly { title: string; words: string }[] = [
  { title: "Stuck in the test", words: "stuck in the test" },
  { title: "Left the payment page", words: "left the payment page" },
];

export interface SignupsPanel {
  count: number;
  prev: number | null;
  /** New accounts of real families on each of the last 14 days. */
  days: BarColumn[];
  total14: number;
  /** Families who signed up in the range, by how far they got; `pct` is the share of those who signed up. */
  funnel: { stage: FunnelStage; label: string; n: number; pct: number }[];
  nudges: { words: string; families: Family[] }[];
}

export function signupsPanel(d: Dashboard): SignupsPanel {
  const accounts = d.kpis.find((k) => k.key === "accounts");
  const days = lastDays(d.now);
  const counts = perDay(days, d.families.filter((f) => !f.test).map((f) => f.createdAt), d.now);
  const at = (s: FunnelStage) => d.funnel.find((x) => x.stage === s)?.inRange ?? 0;
  const first = at("account");
  return {
    count: accounts?.value ?? 0,
    prev: accounts?.prev ?? null,
    days: barColumns(days, counts),
    total14: counts.reduce((n, c) => n + c, 0),
    funnel: FUNNEL_STEPS.map((s) => ({ ...s, n: at(s.stage), pct: first ? Math.round((at(s.stage) / first) * 100) : 0 })),
    nudges: NUDGES.flatMap((n) => {
      const families = d.needs.find((x) => x.title === n.title)?.families ?? [];
      return families.length ? [{ words: n.words, families }] : [];
    }),
  };
}

// Workbook production

export interface ProductionPanel {
  /** Real books that wait for the team, and how many of them are drafts and children with no workbook. */
  needYou: number;
  review: number;
  none: number;
  /** All real books on the journey. */
  total: number;
  line: { bold: string; rest: string };
  /** A book being made (real ones first, the newest first), and how many others are being made. */
  running: Book | null;
  otherRunning: number;
  /** The first book of Production's Needs you group: drafts first, then the longest waiting. */
  next: Book | null;
}

export function productionPanel(books: readonly Book[], now: Date): ProductionPanel {
  const real = books.filter((b) => !b.test);
  const review = real.filter((b) => b.stage === "review").length;
  const none = real.filter((b) => b.stage === "none").length;
  const needYou = review + none;
  const hint = review && none ? "Review a draft or start a first workbook."
    : review ? (review === 1 ? "Review the draft." : "Review the drafts.")
      : none ? (none === 1 ? "Start a first workbook." : "Start the first workbooks.") : "";
  const line = needYou > 0 ? { bold: `${pl(needYou, "book needs", "books need")} you.`, rest: hint }
    : real.length === 0 ? { bold: "No workbooks yet.", rest: "A child joins here when their family saves a card." }
      : { bold: "Nothing needs you right now.", rest: "Every book is moving." };
  const making = books.filter((b) => b.stage === "making")
    .sort((a, b) => Number(a.test) - Number(b.test) || (b.at ?? "").localeCompare(a.at ?? ""));
  const next = groupBooks(books, now).find((g) => g.key === "you")?.books[0] ?? null;
  return { needYou, review, none, total: real.length, line, running: making[0] ?? null, otherRunning: Math.max(0, making.length - 1), next };
}

/** The running book's progress line, from Production's own view of a book being made. */
export function runningView(book: Book, now: Date): ReturnType<typeof makingView> | null {
  return book.run ? makingView(book.run.run, book.run.activity, now) : null;
}

// Marking

/** What the panel needs of a waiting answer (the marking queue's rows). */
export interface WaitingAnswer { parent: string; child: string; childName: string; book: number; issue: string | null; since: string; testFamily: boolean }

/** Why an answer waits, in the Marking page's words. */
export const waitReason = (issue: string | null) =>
  issue && (READING_ISSUES as readonly string[]).includes(issue) ? readingIssueText(issue as ReadingIssue) : "Waiting for a person to mark it.";

export interface MarkingPanel {
  /** Real families' answers waiting for the team. `more`: the read stopped at its limit, so there may be more. */
  count: number;
  more: boolean;
  /** When the oldest real answer started waiting. */
  oldest: string | null;
  /** The reasons, the most common first. */
  reasons: { text: string; n: number }[];
  /** The books the answers come from, the most first; at most 3. */
  books: { childId: string; label: string; n: number }[];
}

export function markingPanel(items: readonly WaitingAnswer[], total: number, isTest: (parentId: string) => boolean): MarkingPanel {
  const real = items.filter((i) => !i.testFamily && !isTest(i.parent));
  const tally = <K extends string>(keys: K[]) => {
    const m = new Map<K, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const names = new Map(real.map((i) => [`${i.child}:${i.book}`, { childId: i.child, label: `${i.childName || "A child"} · Book ${i.book}` }]));
  return {
    count: real.length,
    more: total > items.length,
    oldest: real.map((i) => i.since).sort()[0] ?? null,
    reasons: tally(real.map((i) => waitReason(i.issue))).map(([text, n]) => ({ text, n })),
    books: tally(real.map((i) => `${i.child}:${i.book}`)).slice(0, 3).map(([k, n]) => ({ ...names.get(k)!, n })),
  };
}

// Since yesterday

/**
 * The latest events since the start of yesterday (Pacific), oldest first: the activity log's own events, without the
 * emails (each email's step is already an event). Test families show only while the switch is on, as in the log.
 */
export function sinceYesterday(d: Pick<Dashboard, "activity" | "now">, max = TIMELINE_MAX): Activity[] {
  const from = shiftDay(dayKey(d.now), -1);
  const now = Date.parse(d.now);
  return d.activity.filter((a) => a.kind !== "email" && dayKey(a.at) >= from && Date.parse(a.at) <= now).slice(0, max).reverse();
}
