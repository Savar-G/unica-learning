import type { KnownPlan, ParentPlan } from "@/lib/parent-plan";

// One stored plan state per child (#548, spec #544), so a page load does not call Stripe per child.
//
// A Stripe event only says that something changed. Each event reads the customer's subscriptions again and stores what
// parentPlan makes of them, so the stored kind follows the same rule as the plan page: the zero invoice of a free month
// does not read as paying, and an event about an old subscription does not end a running one.
//
// The order: the row keeps the read with the highest value from one database sequence. Each read takes its value before
// it starts, so a read that missed a change took before that change, and the take of the change's own event comes after
// it. App clocks play no part: two servers' clocks can disagree. Values never repeat, so there are no ties. A duplicate of
// the row's event writes nothing. A write with no event only fills a missing row. An event replaces a filled row by the
// same order.
//
// `unknown` is never stored. It is what a child with no row reads as, and a read that fails leaves the row as it is.
//
// A webhook can be lost, so each row that can still change is also read again once a day (rereadPlan, run by sweepPlanReads in card-reconcile.ts),
// and so is a started plan the row does not show yet (PLAN_START_READ_KINDS). That read follows the same order. It keeps the row's event time: see rereadPlan.
// The store (child_plan_states and card_setups) and the provider (Stripe) are the seams: plan-state-server.ts holds
// Supabase and Stripe, plan-state-memory.ts holds both in memory for tests.

/** The events the webhook keeps. */
export const PLAN_EVENT_TYPES = [
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed", "invoice.paid", "invoice.payment_failed",
] as const;
export type PlanEventType = (typeof PLAN_EVENT_TYPES)[number];

/** One Stripe event the webhook keeps. */
export interface PlanEvent {
  id: string;
  type: PlanEventType;
  /** Unix seconds. */
  created: number;
  /** The Stripe customer, or null when the event names none. */
  customer: string | null;
}

/** A child's row for the parent signed in. */
export interface PlanKey {
  parentId: string;
  childId: string;
}

/** The child of a Stripe customer, through card_setups. */
export interface PlanOwner extends PlanKey {
  customer: string;
  cardSaved: boolean;
}

export interface StoredPlanState {
  plan: KnownPlan;
  /** ISO time of the event that wrote the row; null on a row filled with no event. */
  eventAt: string | null;
  eventId: string | null;
}

export interface PlanWrite extends StoredPlanState {
  /** What `takeReadOrder` gave before the Stripe read. */
  readOrder: number;
}

export type PlanSave = "stored" | "older" | "duplicate" | "no_match";

export interface PlanStateStore {
  /** The child with this Stripe customer, or null. Throws when the read fails. */
  ownerOfCustomer(customer: string): Promise<PlanOwner | null>;
  /** This parent's child, with its Stripe customer, or null when there is no customer. Throws when the read fails. */
  ownerOfChild(key: PlanKey): Promise<PlanOwner | null>;
  /** The child's row, or null. Throws when the read fails. */
  load(key: PlanKey): Promise<StoredPlanState | null>;
  /** The next value of one shared database sequence. Take it before a Stripe read. Throws when it fails. */
  takeReadOrder(): Promise<number>;
  /**
   * In one statement, by the rules at the top of this file. Writes nothing and answers `no_match` when no card setup has
   * this customer; a write with no event only fills a missing row, and otherwise answers `older`. Throws when it fails.
   */
  save(customer: string, write: PlanWrite): Promise<PlanSave>;
}

export interface PlanProvider {
  /** What Stripe says about this customer's plan now. Throws when it cannot tell. */
  plan(customer: string): Promise<KnownPlan>;
}

export interface PlanStates {
  store: PlanStateStore;
  provider: PlanProvider;
}

/**
 * Stores what one event leads to. `no_match` means that nothing could use the event: Stripe should not send it again.
 * Throws when Stripe or the store fails, so Stripe sends it again.
 */
export async function applyPlanEvent(event: PlanEvent, { store, provider }: PlanStates): Promise<PlanSave> {
  if (!event.customer) return "no_match";
  const owner = await store.ownerOfCustomer(event.customer);
  if (!owner) return "no_match";
  const eventAt = new Date(event.created * 1000).toISOString();
  // Saves a Stripe read. The last change's event is never older than the row's event, so this skip cannot lose a change.
  // The save below decides again, in one statement, for an event that arrives during this one.
  const stored = await store.load(owner);
  if (stored?.eventId === event.id) return "duplicate";
  if (stored?.eventAt && Date.parse(stored.eventAt) > Date.parse(eventAt)) return "older";
  const readOrder = await store.takeReadOrder();
  const plan = await provider.plan(event.customer);
  return store.save(event.customer, { plan, eventAt, eventId: event.id, readOrder });
}

/**
 * Stores what Stripe says right after a plan start, so the plan gate (src/lib/plan-access.ts) opens with no webhook. It goes
 * through applyPlanEvent, not a fill: a fill leaves a `not_started` row as it is. The event's time is when the start began,
 * before the subscription existed, so no event of that subscription reads as older than this write. The id is one per start
 * and generation. Throws when Stripe or the store fails. The webhook then writes the row, and the daily re-read reads it in its next run
 * (PLAN_START_READ_KINDS); the card sweep writes it only when it closes an open start itself.
 */
export function applyPlanStart(start: { customer: string; cardSetup: string; generation: number; startedAt: number }, states: PlanStates): Promise<PlanSave> {
  return applyPlanEvent({
    id: `plan-start:${start.cardSetup}:${start.generation}`, type: "customer.subscription.created",
    created: Math.floor(start.startedAt / 1000), customer: start.customer,
  }, states);
}

/**
 * The kinds the daily re-read looks at: free_month, paying and ending hold the plan gate open, so a lost event must not leave them open;
 * payment_failed and paused hold it closed, so a lost event must not lock out a parent who paid.
 */
export const PLAN_READ_KINDS = ["free_month", "paying", "ending", "payment_failed", "paused"] as const;

/**
 * The kinds of a row the re-read also takes when a start backs it (#713): the newest plan start of the child's card is `started`, it
 * finished in the last 40 days, and the row was not read since, or not for 24 hours (database function due_plan_start_reads). An admin's
 * start or a Restart writes its row at once; when that write fails and the webhook is lost too, the row stays like this on a running
 * plan. A child with no row is taken in the same case, with kind null. Other ended and not_started rows are never read.
 */
export const PLAN_START_READ_KINDS = ["not_started", "ended"] as const;

/** One row the daily re-read looks at. */
export interface PlanRead extends PlanKey {
  customer: string;
  /** null: a child with no row, whose newest plan start is `started`. */
  kind: (typeof PLAN_READ_KINDS)[number] | (typeof PLAN_START_READ_KINDS)[number] | null;
  /** The row's event time, or null on a filled row or with no row. */
  eventAt: string | null;
}

/**
 * What a read may store on this row.
 * - An open row (free_month, paying, ending) stores what Stripe says.
 * - A closed row (payment_failed, paused) reopens only on a paid answer: Stripe `active`, as past_due goes to active on payment and a pause
 *   resumes with resume_on_payment_success. It also takes an answer that stays closed. A trial is not paid, and an empty list on a row that
 *   had a plan is not a clear answer: not_started would also take the family out of familyHasPlanHistory, and so away from its card and its
 *   plan's controls. Such an answer leaves the row as it is.
 * - A row a start backs (not_started, ended) takes every running plan, the free month too: it is what a new start makes. It also takes an
 *   answer that stays closed. An empty list contradicts the start record, so it leaves the row as it is.
 * - With no row (null), every answer stores, as a fill would: a child with no row is closed already, and the row then gives the read its place.
 */
export function planReadMayStore(rowKind: PlanRead["kind"], plan: KnownPlan): boolean {
  if (rowKind === null) return true;
  if (rowKind === "not_started" || rowKind === "ended") return plan.kind !== "not_started";
  if (rowKind !== "payment_failed" && rowKind !== "paused") return true;
  switch (plan.kind) {
    case "paying":
    case "payment_failed":
    case "paused":
    case "ended": return true;
    case "ending": return !plan.free;
    case "free_month":
    case "not_started": return false;
  }
}

/** Stored on a re-read of a row with no event, or of a child with no row: the save needs a time, and no Stripe event is older. */
const NO_EVENT_AT = new Date(0).toISOString();

/**
 * Stores what Stripe says about one row now. The save needs a new event id to replace a row, and read_at then says when Stripe was
 * last read. The take comes first, so an event that took later wins, whichever save lands first.
 *
 * It stores the row's own event time, never a time of its own: applyPlanEvent skips the read for an event older than the row's, and
 * our clock and Stripe's can disagree. With a time from our clock, the event of a change that came just after this read could read as
 * older, and that change would be lost. `unclear`: planReadMayStore refused the answer, so nothing was saved and the take goes unused. A
 * value with no save leaves a gap, and a gap changes nothing. Throws when Stripe or the store fails, and the row stays as it is.
 */
export async function rereadPlan(row: PlanRead, { store, provider }: PlanStates): Promise<{ save: PlanSave | "unclear"; plan: KnownPlan }> {
  const readOrder = await store.takeReadOrder();
  const plan = await provider.plan(row.customer);
  if (!planReadMayStore(row.kind, plan)) return { save: "unclear", plan };
  return { save: await store.save(row.customer, { plan, eventAt: row.eventAt ?? NO_EVENT_AT, eventId: `plan-read:${readOrder}`, readOrder }), plan };
}

/** The stored plan. A child with no row, or a read that fails, is unknown. Asks Stripe nothing. */
export async function readChildPlan(key: PlanKey, store: PlanStateStore): Promise<ParentPlan> {
  try {
    return (await store.load(key))?.plan ?? { kind: "unknown" };
  } catch {
    return { kind: "unknown" };
  }
}

/**
 * The stored plan; with no row, fills it from Stripe. Only a saved card has a plan to fill. Never replaces a row: an
 * event stored during the Stripe read stays, and is what this returns. Anything that fails is unknown.
 */
export async function fillChildPlan(key: PlanKey, { store, provider }: PlanStates): Promise<ParentPlan> {
  try {
    const stored = await store.load(key);
    if (stored) return stored.plan;
    const owner = await store.ownerOfChild(key);
    if (!owner?.cardSaved) return { kind: "unknown" };
    const readOrder = await store.takeReadOrder();
    const plan = await provider.plan(owner.customer);
    await store.save(owner.customer, { plan, eventAt: null, eventId: null, readOrder });
    return (await store.load(key))?.plan ?? { kind: "unknown" };
  } catch (e) {
    console.error("[plan-state] fill failed", e instanceof Error ? e.message : "failed");
    return { kind: "unknown" };
  }
}

/** A plan as the row's columns. */
export interface PlanColumns {
  kind: KnownPlan["kind"];
  next_charge_at: string | null;
  ends_at: string | null;
  monthly_cents: number | null;
  ending_free: boolean;
}

const cents = (monthly: number | null) => (monthly === null ? null : Math.round(monthly * 100));

export function planColumns(plan: KnownPlan): PlanColumns {
  const columns: PlanColumns = { kind: plan.kind, next_charge_at: null, ends_at: null, monthly_cents: null, ending_free: false };
  switch (plan.kind) {
    case "free_month": return { ...columns, next_charge_at: plan.firstCharge, monthly_cents: cents(plan.monthly) };
    case "paused": return { ...columns, next_charge_at: plan.resumesOn, monthly_cents: cents(plan.monthly) };
    case "paying": return { ...columns, next_charge_at: plan.nextCharge, monthly_cents: cents(plan.monthly) };
    case "ending": return { ...columns, ends_at: plan.endsOn, ending_free: plan.free };
    case "ended": return { ...columns, ends_at: plan.endedOn ?? null };
    case "not_started":
    case "payment_failed": return columns;
  }
}

export function planFromColumns(row: PlanColumns): ParentPlan {
  const monthly = row.monthly_cents === null ? null : row.monthly_cents / 100;
  switch (row.kind) {
    case "not_started":
    case "payment_failed": return { kind: row.kind };
    case "free_month": return row.next_charge_at ? { kind: "free_month", firstCharge: row.next_charge_at, monthly } : { kind: "unknown" };
    case "paused": return { kind: "paused", resumesOn: row.next_charge_at, monthly };
    case "paying": return { kind: "paying", nextCharge: row.next_charge_at, monthly };
    case "ending": return { kind: "ending", endsOn: row.ends_at, free: row.ending_free };
    case "ended": return row.ends_at ? { kind: "ended", endedOn: row.ends_at } : { kind: "ended" };
  }
}
