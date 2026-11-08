import { RUNNING_PLAN } from "@/lib/parent-plan";
import { rereadPlan, type PlanRead, type PlanStates } from "@/lib/plan-state";

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
// A plan creation has the same problem. Each start is one durable record (public.plan_starts), one key per card setup and generation,
// and the record is never cleared. admit_plan_start is the one way to a create call, so a press that read before another press
// finished gets the first press's key, or finds that it finished. Time closes nothing: Stripe forgets a key after 24 hours, but that
// does not prove that the first request ended. So an open record past 24 hours stays open, the sweep goes on looking, the team gets one
// alert and a press answers that the start needs the team. Only an admin, after their own check, closes it (endStuckPlanStart).
// A new generation opens only when the record's plan has really ended, as read from Stripe, or when the record started nothing.
//
// The parent's confirmation email has its own state on the record. A refused or a busy send stays pending for the next sweep. An
// unknown outcome is final, as the email delivery module's rule says. So an email problem cannot take away a record's recovery.
//
// The plan gate trusts the stored plan state, so the same run also reads each row that can still change again once a day (sweepPlanReads). It writes
// the plan state and nothing else: it has no card write, no email code and no Stripe write. That write can still make a scan reminder due through the
// database, as the lost webhook's own write would have: _workbook_scan_reminder_program reads the row. The send stays behind its own switches.

/** The sweep's look at a clean row lasts this long after its card changed. */
export const CARD_WATCH_MS = 7 * 24 * 60 * 60 * 1000;
/** Stripe keeps an idempotency key for at least this long. */
export const PLAN_KEY_MS = 24 * 60 * 60 * 1000;
/** A retry sends the record's key only this long after the record. */
export const PLAN_RETRY_MS = 23 * 60 * 60 * 1000;
/** A start's own request ends well within this. Until then the start answers for itself, and the webhook and the sweep leave its record and its email. */
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

export type PlanStartState =
  /** Its request may still land. Only a found subscription, Stripe's refusal or an admin closes it. */
  | "open"
  /** Its subscription was found or answered. */
  | "started"
  /** Another running subscription was found, so no start may run anyway. */
  | "other"
  /** Stripe said no, so nothing started. */
  | "refused"
  /** An admin closed it after their own check. */
  | "team_ended";

/** The parent's confirmation email. `pending` stays due. `sent` and `unknown` are final. */
export type PlanEmail = "none" | "pending" | "sent" | "unknown";

/** One start of one generation: a row of public.plan_starts. Times `at` and `finished` are in milliseconds. */
export interface PlanStart {
  /** Immutable creation terms. Older records are initial starts. */
  purpose?: "initial" | "restart";
  monthlyCents?: number | null;
  generation: number;
  key: string;
  card: string;
  at: number;
  state: PlanStartState;
  subscription: string | null;
  /** ISO time the free month ends, or null. */
  firstCharge: string | null;
  finished: number | null;
  email: PlanEmail;
  /** The team's alert: its claim is held (`sending`), or it is final. Null: not sent. */
  alert: "sending" | "sent" | "unknown" | null;
}

/** How a start's record closes. */
export type PlanStartOutcome =
  | { state: "started"; subscription: string; firstCharge: string | null; email: boolean }
  | { state: "other"; subscription: string }
  | { state: "refused" };

/** One child's row, with its card setup and customer. */
export interface CardRow extends NewestCard {
  cardId: string;
  customer: string;
  /** A fenced family is visible only to resolve its existing open start and alert the team. */
  deletionQueued?: boolean;
  needsRepair: boolean;
  /** The newest generation's start, closed or open. */
  planStart: PlanStart | null;
}

export interface CardRows {
  /** Immutable terms are needed only by a start press, not by the recovery sweep. */
  startTerms?(cardId: string, generation: number): Promise<{ purpose: "initial" | "restart"; monthlyCents: number | null }>;
  /** Records `card` when it is the child's newest. Throws when it fails. */
  recordCard(cardId: string, card: RecordedCard): Promise<CardRecord>;
  /** After a comparison of Stripe with `session`'s card. Throws when it fails. */
  settleCard(cardId: string, session: string | null, confirmed: boolean): Promise<CardSettle>;
  /** The card setup's row, or null. A fenced family exposes only its existing open start. Throws when it fails. */
  cardRow(cardId: string): Promise<CardRow | null>;
  /** The customer's row, or null. A fenced family exposes only its existing open start. Throws when it fails. */
  cardRowOfCustomer(customer: string): Promise<CardRow | null>;
  /** Rows with an open start, a pending email, or a card that is flagged or changed after `changedAfter` (ms), the row looked at longest ago first. Throws when it fails. */
  dueCardRows(changedAfter: number, limit: number): Promise<CardRow[]>;
  /** The sweep looked at this row. Throws when it fails. */
  noteCardChecked(cardId: string): Promise<void>;
  /**
   * The way to a create call, in one step under the child's row lock. Opens `generation` with this key and card when the generation
   * before it is closed. Otherwise it changes nothing. It answers the newest record, and the caller sends only when that record is
   * open and is `generation`. Throws when it fails, and for a card setup that does not exist.
   */
  admitPlanStart(cardId: string, generation: number, key: string, card: string, terms?: { purpose: "initial" | "restart"; monthlyCents: number; revision?: string }): Promise<PlanStart>;
  /** Closes an open record. A closed record stays as it is. Throws when it fails. */
  finishPlanStart(cardId: string, generation: number, outcome: PlanStartOutcome): Promise<void>;
  /** The confirmation email's final outcome. Only a pending email moves. Throws when it fails. */
  notePlanEmail(cardId: string, generation: number, state: "sent" | "unknown"): Promise<void>;
  /** Claims the team's alert of an open record at least 24 hours old. False when a claim is held or the alert is final. Throws when it fails. */
  claimPlanAlert(cardId: string, generation: number): Promise<boolean>;
  /** The alert's outcome. `released` gives the claim back. Throws when it fails. */
  notePlanAlert(cardId: string, generation: number, note: { state: "sent" | "unknown" | "released"; emailId?: string; error?: string }): Promise<void>;
  /** An admin closes an open record at least 24 hours old. False when it is not one. Throws when it fails. */
  teamEndPlanStart(cardId: string, generation: number, admin: string): Promise<boolean>;
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

/** A send's outcome, as the email delivery module (src/lib/email-delivery.ts) answers it. */
export type SendOutcome = { status: "sent"; emailId: string } | { status: "refused"; error: string } | { status: "unknown"; error: string } | { status: "busy" };

export interface CardCheckSeams extends CardSeams {
  /** Stores the plan state of a start this check just closed, for the plan gate (src/lib/plan-access.ts), as the start route does for its own. */
  planStarted?(row: CardRow, start: PlanStart): Promise<void>;
  /** Tells the parent that the plan they did not hear about has started. Answers the send's outcome. Throws when the claim fails: nothing went. */
  announcePlan(row: CardRow, start: PlanStart): Promise<SendOutcome | { status: "not_sent"; released: boolean }>;
  /**
   * After a busy send: what the email's claim says. `pending`: another run is still sending it. `sent` or `unknown`: its outcome is
   * final, as with a claim that stopped with no outcome. Throws when it cannot read.
   */
  planEmailClaim(cardId: string, generation: number): Promise<"pending" | "sent" | "unknown">;
  /** Tells the team, once, that a start needs them (src/lib/card-plan-alert.ts). Throws when the claim fails: nothing went. */
  alertTeam(row: CardRow, start: PlanStart): Promise<SendOutcome>;
}

export type PlanCheck =
  /** No open record. */
  | "none"
  /** The record stays: a start may still answer for it, or its creation may still land. */
  | "waiting"
  /** Its subscription was found. */
  | "started"
  /** Another running subscription was found, so no start may run anyway. */
  | "other"
  /** The key's life is over and no subscription was found. The record stays open, and the team knows. */
  | "needs_team";

/** Closes a record whose subscription was found. The parent hears about a plan that is still on, with a date to give. */
export const startedOutcome = (plan: PlanCard, emailAllowed = true): PlanStartOutcome => ({
  state: "started", subscription: plan.id, firstCharge: plan.firstCharge, email: emailAllowed && planNotOver(plan.status) && plan.firstCharge !== null,
});

/** What a press does next, from the record and the customer's whole list of subscriptions. */
export type PressStep =
  /** The record's subscription is here. */
  | { step: "landed"; plan: PlanCard }
  /** Another running subscription is here. */
  | { step: "other"; plan: PlanCard }
  | { step: "already" }
  /** The record is too near the key's end to retry. */
  | { step: "unconfirmed" }
  /** The key's life is over and no subscription was found. Only an admin's check can close the record. */
  | { step: "needs_team" }
  /** Ask for admission to `generation`. `card`: the record's card for a retry, or null for a new start, which finds its own. */
  | { step: "admit"; generation: number; card: string | null };

/**
 * The rules of a press. A closed record opens a new generation only when no plan is running and, for a record that made a plan, that
 * plan reads as over in Stripe's list. A list without it proves nothing, so the answer is `already`.
 */
export function pressStep(start: PlanStart | null, plans: PlanCard[], now: number): PressStep {
  const running = plans.find((p) => planNotOver(p.status));
  if (!start) return running ? { step: "already" } : { step: "admit", generation: 1, card: null };
  if (start.state === "open") {
    const landed = plans.find((p) => p.startKey === start.key);
    if (landed) return { step: "landed", plan: landed };
    if (running) return { step: "other", plan: running };
    const age = now - start.at;
    if (age >= PLAN_KEY_MS) return { step: "needs_team" };
    if (age >= PLAN_RETRY_MS) return { step: "unconfirmed" };
    return { step: "admit", generation: start.generation, card: start.card };
  }
  if (running) return { step: "already" };
  if ((start.state === "started" || start.state === "other") && !plans.some((p) => p.id === start.subscription)) return { step: "already" };
  return { step: "admit", generation: start.generation + 1, card: null };
}

const closed = (start: PlanStart, outcome: PlanStartOutcome, now: number): PlanStart => ({
  ...start, state: outcome.state, finished: now,
  subscription: outcome.state === "refused" ? null : outcome.subscription,
  firstCharge: outcome.state === "started" ? outcome.firstCharge : null,
  email: outcome.state === "started" && outcome.email ? "pending" : "none",
});

/** Decides an open record from the customer's subscriptions. Throws when Stripe or the store fails, and the record stays open. */
async function checkOpenStart(row: CardRow, start: PlanStart, seams: CardCheckSeams, now: number): Promise<{ plan: PlanCheck; start: PlanStart; justClosed: boolean }> {
  if (now - start.at < PLAN_ANSWER_MS) return { plan: "waiting", start, justClosed: false };
  const { plans } = await seams.stripe.cardState(row.customer);
  const step = pressStep(start, plans, now);
  if (step.step === "landed") {
    const outcome = startedOutcome(step.plan, !row.deletionQueued);
    await seams.rows.finishPlanStart(row.cardId, start.generation, outcome);
    return { plan: "started", start: closed(start, outcome, now), justClosed: true };
  }
  // A different subscription says nothing about this request, which can still land after the list read.
  if (step.step !== "needs_team" && !(step.step === "other" && now - start.at >= PLAN_KEY_MS)) return { plan: "waiting", start, justClosed: false };
  if (start.alert === null) {
    if (!seams.canWrite()) throw new Error("The time for the team's alert is over");
    const sent = await seams.alertTeam(row, start);
    if (sent.status === "refused") throw new Error(`The team's alert did not go: ${sent.error}`);
  }
  return { plan: "needs_team", start, justClosed: false };
}

/**
 * Sends a pending confirmation email. Refused and busy stay pending for the next sweep. Unknown is final: the email may have gone.
 * A start that closed its own record is still sending its own email for a while, so an older close waits for PLAN_ANSWER_MS.
 * Throws when the email or the store fails, and the email stays pending.
 */
async function tellParent(row: CardRow, start: PlanStart, seams: CardCheckSeams, justClosed: boolean, now: number): Promise<PlanEmail> {
  if (start.email !== "pending") return start.email;
  if (!justClosed && start.finished !== null && now - start.finished < PLAN_ANSWER_MS) return "pending";
  if (!seams.canWrite()) return "pending";
  const sent = await seams.announcePlan(row, start);
  // The time ran out after the check above, during the reads, the claim or the transport's wait. Nothing went, and the next sweep sends it.
  if (sent.status === "not_sent") return "pending";
  if (sent.status === "refused") throw new Error(`The plan email did not go: ${sent.error}`);
  const state = sent.status === "busy" ? await seams.planEmailClaim(row.cardId, start.generation) : sent.status;
  if (state !== "pending") await seams.rows.notePlanEmail(row.cardId, start.generation, state);
  return state;
}

export interface CardCheck {
  wrote: number;
  plan: PlanCheck;
  /** The confirmation email's state after this check. */
  email: PlanEmail;
  /** Stripe failed, the plan's record could not be decided, or an email did not go. The row is flagged, or its record stays, so the sweep comes back. */
  failure: unknown;
}

/** A failed write costs only the plan gate's wait for the next event: the record is closed, and the email still goes. */
async function writePlanState(row: CardRow, start: PlanStart, seams: CardCheckSeams) {
  try {
    await seams.planStarted?.(row, start);
  } catch (e) {
    console.error("[billing] plan state after a closed start failed", e instanceof Error ? e.message : "failed");
  }
}

/** Brings one row's Stripe side to the row, decides its open start, and sends its pending email. Throws only when the row cannot be flagged. */
export async function checkCardRow(row: CardRow, seams: CardCheckSeams, now = Date.now()): Promise<CardCheck> {
  const card = row.deletionQueued ? { wrote: 0, failure: null } : await settleNewestCard(row.cardId, row.customer, row, seams);
  if (!row.planStart) return { wrote: card.wrote, plan: "none", email: "none", failure: card.failure };
  let start = row.planStart;
  let plan: PlanCheck = "none";
  let justClosed = false;
  try {
    if (start.state === "open") ({ plan, start, justClosed } = await checkOpenStart(row, start, seams, now));
    if (justClosed) await writePlanState(row, start, seams);
    return { wrote: card.wrote, plan, email: row.deletionQueued ? "none" : await tellParent(row, start, seams, justClosed, now), failure: card.failure };
  } catch (e) {
    console.error("[billing] plan start check failed", e instanceof Error ? e.message : "failed");
    return { wrote: card.wrote, plan: start.state === "open" && plan === "none" ? "waiting" : plan, email: start.email, failure: card.failure ?? e };
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
  /** Open starts decided. */
  plans: number;
  /** Confirmation emails with a final outcome. */
  emails: number;
  /** Open starts that need the team. */
  needsTeam: number;
  failed: number;
  outOfTime: boolean;
}

/** The sweep's time: its clock, when it stops starting a row, and the end of all its work. The row's writes follow `canWrite` in the seams. */
export interface SweepTime {
  now(): number;
  startBy: number;
  /** Ends every call of the sweep. The seams' Stripe, database and email calls take the same signal. */
  signal?: AbortSignal;
}

/** The work's answer, or a throw at the signal, so nothing can hold up the sweep past its end. */
function untilEnd<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  let stop: () => void = () => {};
  const ended = new Promise<never>((_, reject) => {
    stop = () => reject(new Error("The sweep's time is over"));
    if (signal.aborted) stop();
    else signal.addEventListener("abort", stop, { once: true });
  });
  return Promise.race([work, ended]).finally(() => signal.removeEventListener("abort", stop));
}

/**
 * Looks at each due row in turn. One row's failure stops only that row. A row is noted before its work, so a row that uses all the
 * time goes to the back of the next run. At the signal the sweep answers at once, and a cut-off row stays due: a write or an email
 * that was stopped has an unknown outcome, and the next run reads Stripe and the claim again. Throws when the first read fails.
 */
export async function sweepCards(seams: CardCheckSeams, time: SweepTime, limit = SWEEP_LIMIT): Promise<CardSweep> {
  const rows = await untilEnd(seams.rows.dueCardRows(time.now() - CARD_WATCH_MS, limit), time.signal);
  const result: CardSweep = { due: rows.length, checked: 0, corrected: 0, plans: 0, emails: 0, needsTeam: 0, failed: 0, outOfTime: false };
  for (const row of rows) {
    if (time.now() >= time.startBy || time.signal?.aborted) {
      result.outOfTime = true;
      break;
    }
    try {
      if (!row.deletionQueued) await untilEnd(seams.rows.noteCardChecked(row.cardId), time.signal);
    } catch (e) {
      console.error("[billing] card row note failed", e instanceof Error ? e.message : "failed");
    }
    try {
      const was = row.planStart?.email;
      const check = await untilEnd(checkCardRow(row, seams, time.now()), time.signal);
      result.checked++;
      if (check.wrote > 0) result.corrected++;
      if (check.plan === "started" || check.plan === "other") result.plans++;
      if (check.plan === "needs_team") result.needsTeam++;
      if (check.email !== was && (check.email === "sent" || check.email === "unknown")) result.emails++;
      if (check.failure) result.failed++;
    } catch (e) {
      result.failed++;
      if (time.signal?.aborted) result.outOfTime = true;
      console.error("[billing] card row check failed", e instanceof Error ? e.message : "failed");
    }
  }
  return result;
}

/** The rows of the daily re-read. The database decides what is due, by its own clock. */
export interface PlanReadRows {
  /** Rows of a kind in PLAN_READ_KINDS not read for 24 hours, the row looked at longest ago first. Throws when it fails. */
  duePlanReads(limit: number): Promise<PlanRead[]>;
  /** The re-read is about to try this row. It goes behind the rows not tried since. Throws when it fails. */
  notePlanReadTried(childId: string): Promise<void>;
}

export interface PlanReadSweep {
  due: number;
  /** Rows read from Stripe, with what it said stored or a newer read already there. */
  read: number;
  /** Rows whose kind changed: a webhook event did not arrive, or has not arrived yet. */
  changed: number;
  /** Closed rows that Stripe answered, with an answer they may not store (planReadMayStore). The row stays as it is, and stays due. */
  unclear: number;
  failed: number;
  outOfTime: boolean;
}

/**
 * Reads each due row again, in turn, inside the sweep's time. A row is noted before its work, so a row that uses all the time, that
 * keeps failing or that keeps answering `unclear` goes behind the others and cannot hold them up. A failed read changes nothing, as Stripe being down must not
 * close a paying family, and the row stays due. Throws when the first read fails.
 */
export async function sweepPlanReads(rows: PlanReadRows, states: PlanStates, time: SweepTime, limit = SWEEP_LIMIT): Promise<PlanReadSweep> {
  const due = await untilEnd(rows.duePlanReads(limit), time.signal);
  const result: PlanReadSweep = { due: due.length, read: 0, changed: 0, unclear: 0, failed: 0, outOfTime: false };
  for (const row of due) {
    if (time.now() >= time.startBy || time.signal?.aborted) {
      result.outOfTime = true;
      break;
    }
    try {
      await untilEnd(rows.notePlanReadTried(row.childId), time.signal);
    } catch (e) {
      console.error("[plan state] re-read note failed", e instanceof Error ? e.message : "failed");
    }
    try {
      const { save, plan } = await untilEnd(rereadPlan(row, states), time.signal);
      if (save === "no_match") throw new Error("No card setup has this customer");
      if (save === "unclear") {
        result.unclear++;
        continue;
      }
      result.read++;
      if (save === "stored" && plan.kind !== row.kind) result.changed++;
    } catch (e) {
      result.failed++;
      if (time.signal?.aborted) result.outOfTime = true;
      console.error("[plan state] re-read failed", e instanceof Error ? e.message : "failed");
    }
  }
  return result;
}
