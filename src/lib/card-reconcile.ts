import { RUNNING_PLAN } from "@/lib/parent-plan";

// Stripe follows the row (#554, public.child_card_updates). A client timeout leaves a Stripe request's outcome unknown, and the
// request can land later, so no lock can order the writes. So nothing here tries to. The row holds the child's newest card, and
// each path compares Stripe with the row and writes only what differs:
//   - a card update's return, at once (billing.ts);
//   - the webhook, on a subscription created or updated event, so a late subscription write corrects itself in seconds;
//   - the sweep in the /api/reminders run, every 15 minutes, for what no event shows: a missed event, or a late write to the Customer.
// A corrective write raises one more event, and that event's comparison finds nothing to change, so this cannot loop.
//
// needs_repair: the row's card has not been seen everywhere. It is set when a card is recorded, and when a comparison cannot
// confirm the state. Only a read that shows Stripe on the row's card clears it. The sweep looks at a clean row too for 7 days after
// its card changed, as a late write comes after the flag was cleared.
//
// A plan creation has the same problem, and the same answer. Its record (pending_plan_*) is written before the request, with the
// request's idempotency key and card, and a retry sends the same two. A timeout leaves the record, and the webhook, the sweep or
// the next start decides it when it finds the subscription. Stripe keeps a key for 24 hours, so a retry stops at 23 hours, and at 24
// hours the sweep lists the customer's subscriptions: with none found, the record ends and a new start may run.

/** The sweep's look at a clean row lasts this long after its card changed. */
export const CARD_WATCH_MS = 7 * 24 * 60 * 60 * 1000;
/** Stripe keeps an idempotency key for at least this long. */
export const PLAN_KEY_MS = 24 * 60 * 60 * 1000;
/** A retry sends the record's key only this long after the record. */
export const PLAN_RETRY_MS = 23 * 60 * 60 * 1000;
/** A start's own request ends well within this. Until then the start answers for itself, and the webhook and the sweep leave its record. */
export const PLAN_ANSWER_MS = 60_000;
/** Comparisons that overtake each other, in one call. */
const CARD_TRIES = 3;
/** One sweep's rows. The row looked at longest ago comes first, so the next run has the rest. */
const SWEEP_LIMIT = 200;

const PLAN_OVER: ReadonlySet<string> = new Set(["canceled", "incomplete_expired"]);
/** A subscription that blocks a new start. */
export const planNotOver = (status: string) => !PLAN_OVER.has(status);

/** A return's card, recorded when it is the child's newest. `created` is in Unix seconds. */
export interface RecordedCard {
  parentId: string;
  session: string;
  created: number;
  paymentMethod: string;
}

/** The newest card of a row. A row made by a plan start has neither. */
export interface NewestCard {
  session: string | null;
  paymentMethod: string | null;
}

export type CardRecord =
  /** Not this parent's card setup. Nothing was written. */
  | { state: "no_match" }
  /** `recorded`: this call made its session the newest. */
  | ({ state: "row"; needsRepair: boolean; recorded: boolean } & NewestCard);

export type CardSettle =
  /** Another session is the newest now. Nothing was written. */
  | ({ state: "newer" } & NewestCard)
  /** Confirmed: the flag is clear. */
  | { state: "settled" }
  /** Not confirmed: the flag is set. */
  | { state: "flagged" };

/** A plan creation recorded before its Stripe request. `at` is in milliseconds. */
export interface PendingPlan {
  key: string;
  card: string;
  at: number;
}

/** One child's row, with its card setup and customer. */
export interface CardRow extends NewestCard {
  cardId: string;
  customer: string;
  needsRepair: boolean;
  pendingPlan: PendingPlan | null;
}

export interface CardRows {
  /** Records `card` when it is the child's newest. Throws when it fails. */
  recordCard(cardId: string, card: RecordedCard): Promise<CardRecord>;
  /** After a comparison of Stripe with `session`'s card. Throws when it fails. */
  settleCard(cardId: string, session: string | null, confirmed: boolean): Promise<CardSettle>;
  /** The card setup's row, or null. A family being deleted has none. Throws when it fails. */
  cardRow(cardId: string): Promise<CardRow | null>;
  /** The customer's row, or null. A family being deleted has none. Throws when it fails. */
  cardRowOfCustomer(customer: string): Promise<CardRow | null>;
  /** Rows with a pending plan, or with a card that is flagged or changed after `changedAfter` (ms), the row looked at longest ago first. Throws when it fails. */
  dueCardRows(changedAfter: number, limit: number): Promise<CardRow[]>;
  /** The sweep looked at this row. Throws when it fails. */
  noteCardChecked(cardId: string): Promise<void>;
  /** Records a creation, or answers the one already pending. Throws when it fails, and for a card setup that does not exist. */
  beginPlanStart(cardId: string, key: string, card: string): Promise<PendingPlan>;
  /** The creation with this key is decided. Another key's record stays. Throws when it fails. */
  endPlanStart(cardId: string, key: string): Promise<void>;
}

/** One subscription, as a comparison reads it. */
export interface PlanCard {
  id: string;
  status: string;
  defaultCard: string | null;
  /** The key of the plan start that made it, or null for one made before the record existed. */
  startKey: string | null;
  /** ISO time the free month ends, or null. */
  firstCharge: string | null;
}

export interface CardState {
  /** The Customer no longer exists at Stripe, so nothing can charge. */
  gone: boolean;
  customerDefault: string | null;
  plans: PlanCard[];
}

/** Stripe said no, so the write did not happen. Any other error leaves the write's outcome unknown. */
export class CardWriteRefused extends Error {}

export interface CardStripe {
  /** The Customer's default and all its subscriptions. Throws when it cannot read the whole list. */
  cardState(customer: string): Promise<CardState>;
  /** Throws CardWriteRefused when Stripe said no. */
  setSubscriptionCard(subscription: string, card: string): Promise<void>;
  /** Throws CardWriteRefused when Stripe said no. */
  setCustomerCard(customer: string, card: string): Promise<void>;
}

export interface CardSeams {
  rows: CardRows;
  stripe: CardStripe;
  /** Past this, no write starts: the call answers that it cannot confirm, and the sweep goes on. */
  canWrite: () => boolean;
}

/** The test before each write. The default leaves room for one write and one read in a function of 60 seconds. */
export function writeWindow(ms = 35_000, startedAt = Date.now()): () => boolean {
  const last = startedAt + ms;
  return () => Date.now() < last;
}

const isWrong = (plan: PlanCard, card: string) => RUNNING_PLAN.has(plan.status) && plan.defaultCard !== card;

/**
 * Writes `card` where Stripe differs, and reads again. `confirmed`: a read showed Stripe on `card`. A plan first, as the plan's
 * default is what a charge uses, and the Customer's is what a later plan start reads. `made`: a subscription just created, in case
 * the list does not show it yet. Throws when a read or a write fails.
 */
export async function convergeCard(customer: string, card: string, { stripe, canWrite }: Pick<CardSeams, "stripe" | "canWrite">, made?: PlanCard): Promise<{ wrote: number; confirmed: boolean }> {
  const before = await stripe.cardState(customer);
  if (before.gone) return { wrote: 0, confirmed: true };
  const unlisted = made && !before.plans.some((p) => p.id === made.id) ? [made] : [];
  const plans = [...before.plans, ...unlisted].filter((p) => isWrong(p, card));
  const writeCustomer = before.customerDefault !== card;
  if (plans.length === 0 && !writeCustomer) return { wrote: 0, confirmed: true };
  let wrote = 0;
  const check = () => {
    if (!canWrite()) throw new Error("The time for a card write is over");
  };
  for (const plan of plans) {
    check();
    await stripe.setSubscriptionCard(plan.id, card);
    wrote++;
  }
  if (writeCustomer) {
    check();
    await stripe.setCustomerCard(customer, card);
    wrote++;
  }
  try {
    const after = await stripe.cardState(customer);
    return { wrote, confirmed: after.gone || (after.customerDefault === card && !after.plans.some((p) => isWrong(p, card))) };
  } catch (e) {
    console.error("[billing] card read after a write failed", e instanceof Error ? e.message : "failed");
    return { wrote, confirmed: false };
  }
}

export interface CardSettled {
  /** The session whose card this call brought Stripe to. Not the newest when `failure` is set and a newer one came too often. */
  session: string | null;
  wrote: number;
  /** Stripe failed. The row stays flagged. */
  failure: unknown;
}

/**
 * Brings Stripe to the row's newest card, starting at `first`, and tells the row. When a newer card is recorded meanwhile, it
 * compares again, so a write that lands in the same call is corrected in that call, and a card refused by Stripe cannot hold up
 * the card after it. Throws only when the row cannot be told.
 */
export async function settleNewestCard(cardId: string, customer: string, first: NewestCard, seams: CardSeams, made?: PlanCard): Promise<CardSettled> {
  let target = first;
  let wrote = 0;
  let failure: unknown = null;
  for (let tries = 0; tries < CARD_TRIES; tries++) {
    if (!target.paymentMethod) return { session: target.session, wrote, failure: null };
    let confirmed = false;
    failure = null;
    try {
      const done = await convergeCard(customer, target.paymentMethod, seams, made);
      wrote += done.wrote;
      confirmed = done.confirmed;
    } catch (e) {
      failure = e;
      console.error("[billing] card write failed", e instanceof Error ? e.message : "failed");
    }
    const answer = await seams.rows.settleCard(cardId, target.session, confirmed);
    if (answer.state !== "newer") return { session: target.session, wrote, failure };
    target = { session: answer.session, paymentMethod: answer.paymentMethod };
  }
  return { session: target.session, wrote, failure: failure ?? new Error("Card updates kept overtaking this one") };
}

export interface CardCheckSeams extends CardSeams {
  /** Tells the parent that the plan they did not hear about has started. Throws when it cannot, and the record stays. */
  announcePlan(row: CardRow, plan: PlanCard): Promise<void>;
}

export type PlanCheck =
  /** No record. */
  | "none"
  /** The record stays: a start may still answer for it, or its creation may still land. */
  | "waiting"
  /** Its subscription was found. */
  | "started"
  /** Another running subscription was found, so no start may run anyway. */
  | "other"
  /** The key's life is over and no subscription was found. A new start may run. */
  | "never_landed";

/** Decides a pending creation from the customer's subscriptions. Throws when Stripe or the store fails, and the record stays. */
async function checkPendingPlan(row: CardRow, pending: PendingPlan, { rows, stripe, announcePlan }: CardCheckSeams, now: number): Promise<PlanCheck> {
  if (now - pending.at < PLAN_ANSWER_MS) return "waiting";
  const state = await stripe.cardState(row.customer);
  const started = state.plans.find((p) => p.startKey === pending.key);
  if (started) {
    if (planNotOver(started.status)) await announcePlan(row, started);
    await rows.endPlanStart(row.cardId, pending.key);
    return "started";
  }
  if (state.plans.some((p) => planNotOver(p.status))) {
    await rows.endPlanStart(row.cardId, pending.key);
    return "other";
  }
  if (now - pending.at < PLAN_KEY_MS) return "waiting";
  await rows.endPlanStart(row.cardId, pending.key);
  return "never_landed";
}

export interface CardCheck {
  wrote: number;
  plan: PlanCheck;
  /** Stripe failed, or the plan's record could not be decided. The row is flagged, or its record stays, so the sweep comes back. */
  failure: unknown;
}

/** Brings one row's Stripe side to the row, and decides its pending creation. Throws only when the row cannot be flagged. */
export async function checkCardRow(row: CardRow, seams: CardCheckSeams, now = Date.now()): Promise<CardCheck> {
  const card = await settleNewestCard(row.cardId, row.customer, row, seams);
  if (!row.pendingPlan) return { wrote: card.wrote, plan: "none", failure: card.failure };
  try {
    return { wrote: card.wrote, plan: await checkPendingPlan(row, row.pendingPlan, seams, now), failure: card.failure };
  } catch (e) {
    console.error("[billing] pending plan check failed", e instanceof Error ? e.message : "failed");
    return { wrote: card.wrote, plan: "waiting", failure: card.failure ?? e };
  }
}

/** The webhook's part: the customer's row, when it has one. Throws only when the store fails, so Stripe sends the event again. */
export async function checkCustomerCard(customer: string, seams: CardCheckSeams, now = Date.now()): Promise<CardCheck | null> {
  const row = await seams.rows.cardRowOfCustomer(customer);
  return row && checkCardRow(row, seams, now);
}

export interface CardSweep {
  due: number;
  checked: number;
  /** Rows where a write was needed. */
  corrected: number;
  /** Pending creations decided. */
  plans: number;
  failed: number;
  outOfTime: boolean;
}

/** The sweep's time: its clock, and when it stops starting a row. The row's writes follow `canWrite` in the seams. */
export interface SweepTime {
  now(): number;
  startBy: number;
}

/** Looks at each due row in turn. One row's failure stops only that row. Throws when the first read fails. */
export async function sweepCards(seams: CardCheckSeams, time: SweepTime, limit = SWEEP_LIMIT): Promise<CardSweep> {
  const rows = await seams.rows.dueCardRows(time.now() - CARD_WATCH_MS, limit);
  const result: CardSweep = { due: rows.length, checked: 0, corrected: 0, plans: 0, failed: 0, outOfTime: false };
  for (const row of rows) {
    if (time.now() >= time.startBy) {
      result.outOfTime = true;
      break;
    }
    try {
      const check = await checkCardRow(row, seams, time.now());
      result.checked++;
      if (check.wrote > 0) result.corrected++;
      if (check.plan === "started" || check.plan === "other" || check.plan === "never_landed") result.plans++;
      if (check.failure) result.failed++;
    } catch (e) {
      result.failed++;
      console.error("[billing] card row check failed", e instanceof Error ? e.message : "failed");
    }
    try {
      await seams.rows.noteCardChecked(row.cardId);
    } catch (e) {
      console.error("[billing] card row note failed", e instanceof Error ? e.message : "failed");
    }
  }
  return result;
}
