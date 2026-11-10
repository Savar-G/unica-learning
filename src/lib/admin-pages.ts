// The numbers behind the summary strips of the remaining admin pages (D-313, D-315): Maya's calls, the emails, the AI
// reviews and the flyer test. Pure: each page reads its rows, these turn them into what the page shows.
import { safetyText } from "@/lib/maya-flag-text";
import type { FlagLevel } from "@/lib/maya-call";
import { per100, type FlyerRow } from "@/lib/flyers";

/** A bar's width as a whole percent of the longest bar, 0 to 100. A value above 0 always shows a sliver. */
export function barPercent(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.max(2, Math.min(100, Math.round((value / max) * 100)));
}

// ---------- Maya's calls ----------

/** One call as the summary reads it (public.maya_calls). */
export interface CallStatRow {
  created_at: string;
  parent_id: string;
  call_seconds: number | null;
  flag: string | null;
  safety_severity: string | null;
  safety_flag: boolean;
}

export interface CallSummary {
  /** Calls started in the window. */
  calls: number;
  /** Whole minutes on calls in the window (the saved call time, rounded). */
  minutes: number;
  /** Calls in the window with a safety flag or a safety concern. */
  flagged: number;
}

/** A call's flag, the way the list and the call page name it: its flag, else the outcome's own safety. */
export const callFlagged = (r: Pick<CallStatRow, "flag" | "safety_severity" | "safety_flag">) =>
  safetyText((r.flag as FlagLevel | null) ?? null, r.safety_severity === "immediate" || r.safety_severity === "concern" ? r.safety_severity : null, r.safety_flag) !== null;

/** The calls of the last `days` days before `now`, without the test families (`isTest`): never counted. */
export function callSummary(rows: readonly CallStatRow[], now: Date, isTest: (parentId: string) => boolean, days = 7): CallSummary {
  const from = now.getTime() - days * 86_400_000;
  const kept = rows.filter((r) => !isTest(r.parent_id) && Date.parse(r.created_at) >= from && Date.parse(r.created_at) <= now.getTime());
  const seconds = kept.reduce((n, r) => n + Math.max(0, r.call_seconds ?? 0), 0);
  return { calls: kept.length, minutes: Math.round(seconds / 60), flagged: kept.filter(callFlagged).length };
}

// ---------- emails ----------

/** One email kind on the Emails page (the dashboard's emailSummary). */
export interface EmailKindCount { kind: string; label: string; sent: number; failed: number; clicked: number; pending: number }

export interface EmailBarSize {
  /** The sent bar's width against the busiest kind. */
  width: number;
  /** The clicked part, as a percent of this kind's own sent bar. */
  clickedShare: number;
}

/** The kinds that sent anything (or failed), busiest first, with their bar widths. */
export function emailBars<T extends EmailKindCount>(kinds: readonly T[]): (T & EmailBarSize)[] {
  const used = kinds.filter((k) => k.sent + k.failed + k.pending > 0);
  const max = Math.max(0, ...used.map((k) => k.sent));
  return used
    .map((k) => ({ ...k, width: barPercent(k.sent, max), clickedShare: k.sent > 0 ? Math.round((100 * Math.min(k.clicked, k.sent)) / k.sent) : 0 }))
    .sort((a, b) => b.sent - a.sent || b.failed - a.failed || a.label.localeCompare(b.label));
}

// ---------- AI reviews ----------

export interface ReviewSummary {
  total: number;
  low: number;
  /** By kind of mistake: slip, misunderstanding, no mistake. */
  kinds: { kind: "slip" | "misunderstanding" | "none"; label: string; n: number }[];
}

export const REVIEW_KIND_TEXT = { slip: "Small slip", misunderstanding: "Misunderstanding", none: "No mistake" } as const;

/** The summary from the counts the page read; "no mistake" is what is left. */
export function reviewSummary(c: { total: number; low: number; slip: number; misunderstanding: number }): ReviewSummary {
  const none = Math.max(0, c.total - c.slip - c.misunderstanding);
  return {
    total: c.total,
    low: c.low,
    kinds: [
      { kind: "misunderstanding", label: REVIEW_KIND_TEXT.misunderstanding, n: c.misunderstanding },
      { kind: "slip", label: REVIEW_KIND_TEXT.slip, n: c.slip },
      { kind: "none", label: REVIEW_KIND_TEXT.none, n: none },
    ],
  };
}

// ---------- the flyer test ----------

export interface FlyerSide { value: number | null; text: string; width: number }
export interface FlyerMetric { key: string; label: string; a: FlyerSide; b: FlyerSide; lead: "a" | "b" | null }

/** Flyer A against flyer B, one pair of bars per measure. Scans per 100 needs the handed-out counts. */
export function flyerMetrics(a: FlyerRow, b: FlyerRow): FlyerMetric[] {
  const pair = (key: string, label: string, pick: (r: FlyerRow) => number | null): FlyerMetric => {
    const va = pick(a);
    const vb = pick(b);
    const max = Math.max(va ?? 0, vb ?? 0);
    const side = (v: number | null): FlyerSide => ({ value: v, text: v === null ? "-" : v.toLocaleString("en-CA"), width: v === null ? 0 : barPercent(v, max) });
    const lead = va === null || vb === null || va === vb ? null : va > vb ? "a" : "b";
    return { key, label, a: side(va), b: side(vb), lead };
  };
  return [
    pair("scans", "Scans per 100 flyers", (r) => per100(r.scans, r.delivered)),
    pair("signups", "Signups", (r) => r.accounts),
    pair("finished", "Finished the test", (r) => r.finished),
    pair("cards", "Saved a card", (r) => r.cardSaved),
    pair("paying", "Paying", (r) => r.paying),
  ];
}
