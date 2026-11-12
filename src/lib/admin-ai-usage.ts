// The admin page of AI usage and cost (D-330, /admin/ai): the period, and the shaping of what the database function
// admin_ai_usage returns into what the page shows. Pure: no database, no clock (the caller passes `now`), no network.
// Days are Vancouver days (the team's time, not a family's). Money is stored in US dollars; CAD uses MAYA_USD_TO_CAD.
import { PACIFIC_ZONE, addDays, localDateTime, localDay } from "@/lib/family-time";

export const ADMIN_AI_PATH = "/admin/ai";

export const RANGES = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
] as const;
export type RangeKey = (typeof RANGES)[number]["key"];
export const DEFAULT_RANGE: RangeKey = "30d";

export function parseRange(value: string | string[] | undefined): RangeKey {
  const v = Array.isArray(value) ? value[0] : value;
  return RANGES.some((r) => r.key === v) ? (v as RangeKey) : DEFAULT_RANGE;
}

export interface Period {
  range: RangeKey;
  /** The first instant (Vancouver midnight of the first day) and the instant after the last day: [from, to). */
  from: Date;
  to: Date;
  /** Every Vancouver day of the period, "YYYY-MM-DD", oldest first. Today is the last. */
  days: string[];
}

/** The period of a range, ending with today in Vancouver. */
export function periodFor(range: RangeKey, now: number): Period {
  const today = localDay(now, PACIFIC_ZONE);
  const first = range === "7d" ? addDays(today, -6) : range === "30d" ? addDays(today, -29) : `${today.slice(0, 8)}01`;
  const days: string[] = [];
  for (let d = first; d <= today; d = addDays(d, 1)) days.push(d);
  return { range, from: new Date(localDateTime(first, PACIFIC_ZONE)), to: new Date(localDateTime(addDays(today, 1), PACIFIC_ZONE)), days };
}

/** The first instant of this month in Vancouver, and the end of today: the span the OpenRouter check compares. */
export const monthPeriod = (now: number): Period => periodFor("month", now);

// ---------- what the database function returns ----------

export interface UsageTotals {
  costUsd: number;
  /** The part of the cost from the new ledger, and the part rebuilt from the older ledgers (history). */
  ledgerUsd: number;
  historyUsd: number;
  calls: number;
  subscriptionCalls: number;
  /** Paid-provider calls with no cost in their answer. */
  unpricedCalls: number;
}
export interface ModelLine { model: string; provider: string; costUsd: number; calls: number }
export interface FeatureLine { feature: string; costUsd: number; calls: number }
export interface DayModel { day: string; model: string; costUsd: number; calls: number }
export interface FamilyLine {
  /** Null: the line for calls with no family. */
  parentId: string | null;
  name: string | null;
  email: string | null;
  children: number;
  costUsd: number;
  calls: number;
  topFeature: string | null;
  /** The family's monthly plan price in CAD cents for plans that charge now, and whether a free month runs. */
  revenueCents: number | null;
  freeMonth: boolean;
}
export interface UsageView {
  totals: UsageTotals;
  daily: DayModel[];
  byFeature: FeatureLine[];
  byModel: ModelLine[];
  families: FamilyLine[];
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const rows = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((r): r is Record<string, unknown> => !!r && typeof r === "object") : []);

const dayOf = (v: string | null): string => (v && v.includes("T") && !Number.isNaN(Date.parse(v)) ? localDay(Date.parse(v), PACIFIC_ZONE) : v ?? "");

/** The view of admin_ai_usage's JSON. A missing or odd part reads as empty: the page shows nothing rather than failing. */
export function parseUsage(raw: unknown): UsageView {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const t = (o.totals && typeof o.totals === "object" ? o.totals : {}) as Record<string, unknown>;
  return {
    totals: {
      costUsd: num(t.cost_usd), ledgerUsd: num(t.cost_ledger_usd), historyUsd: num(t.cost_history_usd),
      calls: num(t.calls), subscriptionCalls: num(t.subscription_calls), unpricedCalls: num(t.unpriced_calls),
    },
    // A day is "YYYY-MM-DD", or the start instant of a day (the function groups by the day starts the page sent).
    daily: rows(o.daily).map((r) => ({ day: dayOf(str(r.day)), model: str(r.model) ?? "not recorded", costUsd: num(r.cost_usd), calls: num(r.calls) })).filter((r) => r.day),
    byFeature: rows(o.by_feature).map((r) => ({ feature: str(r.feature) ?? "other", costUsd: num(r.cost_usd), calls: num(r.calls) })),
    byModel: rows(o.by_model).map((r) => ({ model: str(r.model) ?? "not recorded", provider: str(r.provider) ?? "openrouter", costUsd: num(r.cost_usd), calls: num(r.calls) })),
    families: rows(o.families).map((r) => ({
      parentId: str(r.parent_id), name: str(r.name), email: str(r.email), children: num(r.children),
      costUsd: num(r.cost_usd), calls: num(r.calls), topFeature: str(r.top_feature),
      revenueCents: r.revenue_cents === null || r.revenue_cents === undefined ? null : num(r.revenue_cents),
      freeMonth: r.free_month === true,
    })),
  };
}

// ---------- features ----------

/** The groups the page shows. A feature not listed falls into "Other". */
export const FEATURE_GROUPS = [
  { key: "workbook", label: "Workbook generator", features: ["workbook", "solve_check", "workbook_gate"] },
  { key: "maya", label: "Maya", features: ["maya", "maya_review", "maya_note", "maya_speech"] },
  { key: "marking", label: "Marking", features: ["marking"] },
  { key: "explain", label: "Explain this problem", features: ["explain"] },
  { key: "reports", label: "Reports", features: ["report", "work_review"] },
  { key: "profiles", label: "Profiles", features: ["child_profile", "learner_profile"] },
  { key: "other", label: "Other", features: ["photo_check", "other"] },
] as const;

export const featureGroupOf = (feature: string | null): (typeof FEATURE_GROUPS)[number] =>
  FEATURE_GROUPS.find((g) => (g.features as readonly string[]).includes(feature ?? "")) ?? FEATURE_GROUPS[FEATURE_GROUPS.length - 1];

export interface GroupLine { key: string; label: string; costUsd: number; calls: number }

/** Cost by feature group, largest cost first (then calls). Groups with no calls are left out. */
export function groupFeatures(lines: readonly FeatureLine[]): GroupLine[] {
  const by = new Map<string, GroupLine>();
  for (const l of lines) {
    const g = featureGroupOf(l.feature);
    const cur = by.get(g.key) ?? { key: g.key, label: g.label, costUsd: 0, calls: 0 };
    cur.costUsd += l.costUsd;
    cur.calls += l.calls;
    by.set(g.key, cur);
  }
  return [...by.values()].filter((g) => g.calls > 0).sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);
}

// ---------- the daily chart ----------

/** The most models drawn in the daily chart; the rest fold into "Other models". */
export const MAX_STACK_MODELS = 6;
export const OTHER_MODELS = "Other models";

export interface StackDay { day: string; totalUsd: number; calls: number; segments: { model: string; costUsd: number }[] }
export interface Stack { models: string[]; days: StackDay[]; maxUsd: number }

/**
 * Cost per day, stacked by model. The models with the most cost in the period get a place (MAX_STACK_MODELS), in cost
 * order, so a model keeps one colour on the whole page; the others share "Other models". Every day of the period is
 * there, also with no cost. Models with no cost (the subscription) add no segment.
 */
export function buildStack(daily: readonly DayModel[], days: readonly string[]): Stack {
  const total = new Map<string, number>();
  for (const d of daily) total.set(d.model, (total.get(d.model) ?? 0) + d.costUsd);
  const ranked = [...total.entries()].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([m]) => m);
  const shown = ranked.slice(0, MAX_STACK_MODELS);
  const models = ranked.length > shown.length ? [...shown, OTHER_MODELS] : shown;
  const out: StackDay[] = days.map((day) => ({ day, totalUsd: 0, calls: 0, segments: [] }));
  const at = new Map(out.map((d) => [d.day, d]));
  for (const d of daily) {
    const day = at.get(d.day);
    if (!day) continue;
    day.calls += d.calls;
    if (d.costUsd <= 0) continue;
    const model = shown.includes(d.model) ? d.model : OTHER_MODELS;
    const seg = day.segments.find((s) => s.model === model);
    if (seg) seg.costUsd += d.costUsd;
    else day.segments.push({ model, costUsd: d.costUsd });
    day.totalUsd += d.costUsd;
  }
  for (const d of out) d.segments.sort((a, b) => models.indexOf(a.model) - models.indexOf(b.model));
  return { models, days: out, maxUsd: Math.max(0, ...out.map((d) => d.totalUsd)) };
}

/** A "nice" top for the chart's axis at or above `max`: 1, 2, 2.5, 5 or 10 times a power of ten. */
export function niceTop(max: number): number {
  if (!(max > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const n = max / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

// ---------- money ----------

const usdFormat = new Intl.NumberFormat("en-CA", { style: "currency", currency: "USD", currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cadFormat = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "USD 1.23"; a cost under one cent shows its small amount, so a cheap call is not "0.00". */
export function usd(amount: number): string {
  if (amount > 0 && amount < 0.01) return `USD ${amount.toFixed(4)}`;
  return usdFormat.format(amount).replace(/ /g, " ");
}
export const cad = (amountUsd: number, rate: number): string => cadFormat.format(amountUsd * rate);
export const cadCents = (cents: number): string => cadFormat.format(cents / 100);

/** Days in the period for the plan price: a month counts as 30.44 days. */
export const DAYS_PER_MONTH = 30.44;

/**
 * The AI cost as a percent of the plan price for the same days, both in CAD. Null with no charging plan (a family with
 * none, or only a free month) or a zero price. `periodDays`: the days the cost covers.
 */
export function costShare(costUsd: number, rate: number, revenueCents: number | null, periodDays: number): number | null {
  if (revenueCents === null || !(revenueCents > 0) || !(periodDays > 0)) return null;
  const revenue = (revenueCents / 100) * (periodDays / DAYS_PER_MONTH);
  return Math.round(((costUsd * rate) / revenue) * 1000) / 10;
}

// ---------- the OpenRouter check ----------

export interface OpenRouterCheck {
  /** What OpenRouter says this month's keys used, in US dollars, summed over the keys that answered. */
  monthUsd: number;
  /** How many keys were asked, and how many answered. */
  asked: number;
  answered: number;
}

/** The monthly usage of one OpenRouter answer to GET /api/v1/key (`data.usage_monthly`), or null when it has none. */
export function keyMonthUsage(body: unknown): number | null {
  const data = body && typeof body === "object" ? (body as { data?: unknown }).data : null;
  const v = data && typeof data === "object" ? (data as { usage_monthly?: unknown }).usage_monthly : null;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

export interface CheckLine {
  /** What OpenRouter says, what the ledger recorded, and the difference (OpenRouter minus recorded; can be below zero). */
  openRouterUsd: number;
  recordedUsd: number;
  notRecordedUsd: number;
}
export const checkLine = (check: OpenRouterCheck, recordedUsd: number): CheckLine =>
  ({ openRouterUsd: check.monthUsd, recordedUsd, notRecordedUsd: check.monthUsd - recordedUsd });
