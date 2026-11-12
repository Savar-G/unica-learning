// Workbooks > Plans and delivery (D-313, D-315): what each saved card's plan is, which cards need the team, and the
// families by plan state. Pure: the page reads the cards (listNextSteps) and the books on hold, then groups them here.
// Every number counts the real families only; test families can show in the lists while the switch is on, never in a
// number.
import type { CardSetupRow } from "@/lib/admin-store";
import { shownWorkbookEmailStatus } from "@/lib/workbook-email";

export type PlanState = "not_saved" | "card_saved" | "free_month" | "paying" | "payment_failed" | "paused" | "cancelled" | "check";

export const PLAN_STATE_TEXT: Record<PlanState, string> = {
  not_saved: "Card not saved", card_saved: "Card saved", free_month: "Free month", paying: "Paying",
  payment_failed: "Payment failed", paused: "Paused", cancelled: "Cancelled", check: "Check in Stripe",
};

type PlanCard = Pick<CardSetupRow, "card_saved_at" | "planStarted" | "planKind">;

/**
 * One card's plan state. The stored plan kind decides first (a running, failed, paused or ended plan). Without one, a card
 * that was never saved is "not saved", a saved card with no start is "card saved", and any other evidence (a start with no
 * stored plan, or a failed read) is "check in Stripe".
 */
export function planState(c: PlanCard): PlanState {
  switch (c.planKind) {
    case "free_month": return "free_month";
    case "paying": return "paying";
    case "payment_failed": return "payment_failed";
    case "paused": return "paused";
    case "ending": case "ended": return "cancelled";
  }
  if (!c.card_saved_at) return "not_saved";
  return c.planStarted === false ? "card_saved" : "check";
}

/** A family with several children counts once, at its most advanced child's state. */
const FAMILY_RANK: PlanState[] = ["paying", "free_month", "payment_failed", "paused", "card_saved", "check", "cancelled", "not_saved"];
/** The order of the summary. The first four always show; the rest only when a family is in them. */
const SUMMARY: PlanState[] = ["card_saved", "free_month", "paying", "cancelled", "not_saved", "payment_failed", "paused", "check"];
const ALWAYS = new Set<PlanState>(["card_saved", "free_month", "paying", "cancelled"]);

/** The real families by plan state, for the summary graphic. `isTest`: the test and team families, never counted. */
export function familyPlanCounts(cards: readonly (PlanCard & Pick<CardSetupRow, "parent_id">)[], isTest: (parentId: string) => boolean) {
  const family = new Map<string, PlanState>();
  for (const c of cards) {
    if (isTest(c.parent_id)) continue;
    const s = planState(c), was = family.get(c.parent_id);
    if (!was || FAMILY_RANK.indexOf(s) < FAMILY_RANK.indexOf(was)) family.set(c.parent_id, s);
  }
  const n = (s: PlanState) => [...family.values()].filter((v) => v === s).length;
  return { total: family.size, states: SUMMARY.map((state) => ({ state, text: PLAN_STATE_TEXT[state], n: n(state) })).filter((s) => ALWAYS.has(s.state) || s.n > 0) };
}

export type NeedReason = "start_stuck" | "start_due" | "email";
type NeedCard = PlanCard & Pick<CardSetupRow, "id" | "stripe_customer_id" | "stuckPlanStart" | "firstWorkbook" | "workbookEmails" | "workbookEmailsReadAt">;

/** A workbook email the team must look at: not sent (it can be sent again), or with an uncertain delivery. */
export function emailsToCheck(c: Pick<CardSetupRow, "workbookEmails" | "workbookEmailsReadAt">, now: number) {
  return (c.workbookEmails ?? []).filter((r) => ["failed", "unknown"].includes(shownWorkbookEmailStatus(r, c.workbookEmailsReadAt ?? now)));
}

/**
 * Why a card needs the team, first reason first: a plan start Stripe never answered; a free month to start (book 1 has its
 * delivery receipt, no start yet: the same rule as the start button); a workbook email to check or send again.
 */
export function needReasons(c: NeedCard, now: number): NeedReason[] {
  const out: NeedReason[] = [];
  if (c.stuckPlanStart) out.push("start_stuck");
  else if (c.planStarted === false && c.card_saved_at && c.stripe_customer_id && c.firstWorkbook?.delivered === true) out.push("start_due");
  if (emailsToCheck(c, now).length > 0) out.push("email");
  return out;
}

/** The cards that need the team, grouped by their first reason, in the order of the reasons. */
export function needsYou<C extends NeedCard>(cards: readonly C[], now: number) {
  const groups: Record<NeedReason, { card: C; reasons: NeedReason[] }[]> = { start_stuck: [], start_due: [], email: [] };
  for (const card of cards) {
    const reasons = needReasons(card, now);
    if (reasons.length) groups[reasons[0]].push({ card, reasons });
  }
  return groups;
}
