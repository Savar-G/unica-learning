// "Families at risk" (/admin/families-at-risk, D-332): for each child on a running or troubled plan, how far the family has
// gone quiet, what is wrong, and what the team does next. Pure: no network, database or clock. The database reports the
// facts (function admin_families_at_risk_v1); this module decides the risk, the words and the order. The rules for a
// failed payment and for a book held for missing scans are the ones the dashboard and Production already use: a held book
// links to Production, every other reason to the family's own page, which lists that family's Needs you items. (The
// Needs you list shows a failed payment only for a Stripe past_due plan; the plan state also holds unpaid and incomplete,
// so a failed payment does not link to that list.)
import { adminParentPath, ADMIN_WORKBOOKS_PATH } from "@/lib/admin-view";

/** One row of admin_families_at_risk_v1. */
export interface RiskRow {
  parentId: string;
  parentName: string;
  childId: string;
  childName: string;
  planKind: "free_month" | "paying" | "ending" | "payment_failed" | "paused";
  endingFree: boolean;
  nextChargeAt: string | null;
  endsAt: string | null;
  /** When the plan started (newest started plan, else the free month's first charge minus 30 days), or null when unknown. */
  planSince: string | null;
  lastActivityAt: string | null;
  lastActivityKind: "scan" | "maya" | "marks" | null;
  lastSignInAt: string | null;
  heldBook: number | null;
  testFamily: boolean;
}

export type RiskTone = "bad" | "warn" | "ok";

/** A family with no scan, chat or mark for this many days is worth a look, then at risk. */
export const QUIET_WARN_DAYS = 7;
export const QUIET_BAD_DAYS = 14;
/** A plan this young has had no time to go quiet. */
export const NEW_PLAN_DAYS = 3;
/** Below this many families, shares say too little: the page says so. */
export const FEW_FAMILIES = 5;

export interface Reason { key: "payment_failed" | "cancelled_free" | "ending" | "paused" | "held_book" | "quiet"; tone: RiskTone; text: string; action: string; href: string; link: string }

export interface RiskFamily {
  parentId: string;
  parentName: string;
  childName: string;
  childId: string;
  tone: RiskTone;
  plan: string;
  reasons: Reason[];
  /** Whole days since the last scan, chat or mark, or since the plan started when there is none. Null for a new plan. */
  quietDays: number | null;
  /** "scan", "Maya chat" or "marked page"; null when there is none yet. */
  lastActivity: { at: string; kind: string } | null;
  lastSignInAt: string | null;
  /** The worst reason's action, and where to do it. */
  next: { text: string; href: string; link: string } | null;
  /** The family's own page: it lists its Needs you items. */
  familyHref: string;
  test: boolean;
}

const DAY_MS = 86_400_000;
const KIND_TEXT = { scan: "Scan sent", maya: "Maya chat", marks: "Page marked" } as const;
const days = (from: string, now: Date) => Math.floor((now.getTime() - new Date(from).getTime()) / DAY_MS);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** "Nov 12", the plan's date in plain words (the page's own time zone is Pacific, as every admin time). */
const dayText = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "America/Vancouver" }) : "soon");

function planText(r: RiskRow): string {
  switch (r.planKind) {
    case "free_month": return `Free month${r.nextChargeAt ? `, first charge ${dayText(r.nextChargeAt)}` : ""}`;
    case "paying": return "Paying";
    case "ending": return `${r.endingFree ? "Free month" : "Plan"} ends ${dayText(r.endsAt)}`;
    case "payment_failed": return "Payment failed";
    case "paused": return `Paused${r.nextChargeAt ? `, resumes ${dayText(r.nextChargeAt)}` : ""}`;
  }
}

export function reasonsFor(r: RiskRow, now: Date): { reasons: Reason[]; quietDays: number | null } {
  const reasons: Reason[] = [];
  if (r.planKind === "payment_failed") reasons.push({ key: "payment_failed", tone: "bad", text: "The last payment failed", action: "Ask the parent to fix the card", href: adminParentPath(r.parentId), link: "Family page" });
  if (r.planKind === "ending" && r.endingFree) reasons.push({ key: "cancelled_free", tone: "bad", text: `Cancelled in the free month, ends ${dayText(r.endsAt)}`, action: "Call the parent and ask why", href: adminParentPath(r.parentId), link: "Family page" });
  if (r.planKind === "ending" && !r.endingFree) reasons.push({ key: "ending", tone: "warn", text: `Plan ends ${dayText(r.endsAt)}`, action: "Ask the parent why they cancel", href: adminParentPath(r.parentId), link: "Family page" });
  if (r.planKind === "paused") reasons.push({ key: "paused", tone: "warn", text: "Plan paused", action: "Check when it resumes", href: adminParentPath(r.parentId), link: "Family page" });
  if (r.heldBook !== null) reasons.push({ key: "held_book", tone: "bad", text: `Book ${r.heldBook} is held: no page scanned since it arrived`, action: "Ask the family to scan the pages", href: ADMIN_WORKBOOKS_PATH, link: "Production" });
  const open = r.planKind === "free_month" || r.planKind === "paying" || r.planKind === "ending";
  // Activity from an earlier plan does not count: only a scan, chat or mark since this plan started.
  const lastSince = r.lastActivityAt && (!r.planSince || r.lastActivityAt >= r.planSince) ? r.lastActivityAt : null;
  const baseline = lastSince ?? r.planSince;
  const young = !lastSince && r.planSince !== null && days(r.planSince, now) < NEW_PLAN_DAYS;
  const quietDays = baseline === null || young ? null : Math.max(0, days(baseline, now));
  if (open && quietDays !== null && quietDays >= QUIET_WARN_DAYS) {
    const since = lastSince ? `No scan, chat or marked page for ${plural(quietDays, "day")}` : `No scan, chat or marked page since the plan started ${plural(quietDays, "day")} ago`;
    reasons.push({ key: "quiet", tone: quietDays >= QUIET_BAD_DAYS ? "bad" : "warn", text: since, action: "Send a nudge or call to ask how it is going", href: adminParentPath(r.parentId), link: "Family page" });
  }
  return { reasons, quietDays };
}

const RANK: Record<RiskTone, number> = { bad: 0, warn: 1, ok: 2 };

/** Every family, the most at risk first: by tone, then by the number of reasons, then by the days quiet. */
export function riskFamilies(rows: readonly RiskRow[], now: Date): RiskFamily[] {
  return rows.map((r) => {
    const { reasons, quietDays } = reasonsFor(r, now);
    reasons.sort((a, b) => RANK[a.tone] - RANK[b.tone]);
    const worst = reasons[0] ?? null;
    return {
      parentId: r.parentId, parentName: r.parentName, childName: r.childName, childId: r.childId,
      tone: worst ? worst.tone : "ok", plan: planText(r), reasons, quietDays,
      lastActivity: r.lastActivityAt && r.lastActivityKind ? { at: r.lastActivityAt, kind: KIND_TEXT[r.lastActivityKind] } : null,
      lastSignInAt: r.lastSignInAt,
      next: worst ? { text: worst.action, href: worst.href, link: worst.link } : null,
      familyHref: adminParentPath(r.parentId), test: r.testFamily,
    };
  }).sort((a, b) =>
    RANK[a.tone] - RANK[b.tone]
    || b.reasons.length - a.reasons.length
    || (b.quietDays ?? -1) - (a.quietDays ?? -1)
    || a.parentName.localeCompare(b.parentName));
}

export interface RiskSummary { total: number; bad: number; warn: number; ok: number; few: boolean }

export function riskSummary(families: readonly RiskFamily[]): RiskSummary {
  const real = families.filter((f) => !f.test);
  const counted = real.length ? real : families;
  return {
    total: counted.length,
    bad: counted.filter((f) => f.tone === "bad").length,
    warn: counted.filter((f) => f.tone === "warn").length,
    ok: counted.filter((f) => f.tone === "ok").length,
    few: counted.length < FEW_FAMILIES,
  };
}

/** Database rows as typed values. */
export function readRiskRows(raw: readonly {
  parent_id: string; parent_name: string; child_id: string; child_name: string; plan_kind: string; ending_free: boolean;
  next_charge_at: string | null; ends_at: string | null; plan_since: string | null; last_activity_at: string | null; last_activity_kind: string | null;
  last_sign_in_at: string | null; held_book: number | null; test_family: boolean;
}[]): RiskRow[] {
  const kinds = new Set(["free_month", "paying", "ending", "payment_failed", "paused"]);
  return raw.filter((r) => kinds.has(r.plan_kind)).map((r) => ({
    parentId: r.parent_id, parentName: r.parent_name, childId: r.child_id, childName: r.child_name,
    planKind: r.plan_kind as RiskRow["planKind"], endingFree: r.ending_free, nextChargeAt: r.next_charge_at, endsAt: r.ends_at,
    planSince: r.plan_since ?? null, lastActivityAt: r.last_activity_at,
    lastActivityKind: r.last_activity_kind === "scan" || r.last_activity_kind === "maya" || r.last_activity_kind === "marks" ? r.last_activity_kind : null,
    lastSignInAt: r.last_sign_in_at, heldBook: r.held_book === null ? null : Number(r.held_book), testFamily: r.test_family,
  }));
}
