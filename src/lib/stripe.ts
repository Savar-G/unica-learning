import "server-only";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { gradeName } from "@/lib/assessment/grades";
import { PLAN_KEY_MS, PLAN_RETRY_MS, planNotOver, pressStep, settleNewestCard, startedOutcome, writeWindow, type CardRow, type CardRows, type PlanCard, type PlanStartOutcome } from "@/lib/card-reconcile";
import { liveCardRows } from "@/lib/card-reconcile-server";
import { RUNNING_PLAN } from "@/lib/parent-plan";
import { cad, priceWithOffer } from "@/lib/site";
import { CARD_READ, CARD_WRITE, customerSubscriptions, planCard as planCardOf, refusedByStripe, stripeCards } from "@/lib/stripe-subscriptions";
import { PLAN_PRODUCT, firstChargeAt, planTerms } from "@/lib/subscription-plan";

// Created on first use, so a build without STRIPE_SECRET_KEY still works. Without the key, BC parents
// see "we'll email you a link to add your card" and Savar sends one by hand.
let client: Stripe | null = null;

export function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key);
  return client;
}

/**
 * A client whose every request ends at `signal`, for work with one deadline (the card sweep). Stripe's SDK takes no signal per request,
 * so it goes on the client's fetch. A stopped write's outcome is unknown, as with any timeout.
 */
export function stripeWithin(signal: AbortSignal): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(async (input, init) => {
      // The SDK's own retry can come after the end. It reaches no network.
      signal.throwIfAborted();
      return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal });
    }),
  });
}

export interface CardSetup {
  ref: string;
  name: string;
  email: string;
  plan: string;
  subject: string;
  grade: number;
  price: number;
  curriculum: string;
  /** Only an older signup has one (D-224). When null, the metadata has no postal key. */
  postal: string | null;
  /** Site origin for the return URLs, e.g. https://unicalearning.com */
  origin: string;
}

/** What the parent agrees to on Stripe's page. Stripe requires the amount, timing and how to cancel. */
export const cardTerms = (price: number) =>
  `Nothing is charged today. Your first month is free, starting when your first workbook arrives at your home. On day 30 we charge CAD ${cad(price)}, then CAD ${cad(price)} every month until you cancel. We email you a reminder 7 days before the first charge, with a link to manage or cancel your plan. Cancel before day 30 and you pay nothing.`;

/**
 * Creates the Stripe customer and a hosted Checkout page in setup mode: it saves the card and charges nothing.
 * When the first workbook arrives at your home, start a CAD `price` monthly subscription on this customer with the free first month
 * (a 30-day trial, TRIAL_DAYS; D-053, D-139). Stripe emails the reminder 7 days before the trial ends, with the link to manage or cancel the plan (Billing settings, 2026-10-24).
 * Returns the customer and Checkout page URL so the booking can durably release its hold.
 */
export async function cardSetupUrl(s: Stripe, p: CardSetup): Promise<{ customer: string; url: string | null }> {
  const metadata = cardMetadata(p);
  const description = cardDescription(p);
  const options = { timeout: 15_000, maxNetworkRetries: 0 };
  const customer = await s.customers.create({ email: p.email, name: p.name, description, metadata }, options);
  if (!customer.id) throw Error("Booking customer unavailable");
  const url = await checkoutUrl(s, customer.id, p, metadata, description, {
    success: `${p.origin}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
    cancel: `${p.origin}/?card=cancelled`,
  }, options);
  return { customer: customer.id, url };
}

/** The metadata keys every card setup carries; the report path adds its own (D-053). */
const cardMetadata = (p: CardSetup): Record<string, string> => ({
  ref: p.ref, plan: p.plan, subject: p.subject, grade: String(p.grade), price: String(p.price),
  curriculum: p.curriculum, ...(p.postal ? { postal: p.postal } : {}),
});
const cardDescription = (p: CardSetup) => `${p.subject}, ${gradeName(p.grade)}, ${priceWithOffer(p.price)} from the first workbook`;

/** A hosted Checkout page in setup mode for this customer. The parent sees cardTerms above the button. */
async function checkoutUrl(s: Stripe, customer: string, p: CardSetup, metadata: Record<string, string>, description: string, urls: { success: string; cancel: string }, options?: Stripe.RequestOptions) {
  const session = await s.checkout.sessions.create({
    mode: "setup",
    currency: "cad",
    customer,
    shipping_address_collection: { allowed_countries: ["CA"] },
    customer_update: { shipping: "auto" },
    client_reference_id: p.ref,
    metadata,
    setup_intent_data: { description, metadata },
    custom_text: {
      shipping_address: { message: "We use this address to ship your workbook. Delivery within Canada is included." },
      submit: { message: cardTerms(p.price) },
    },
    success_url: urls.success,
    cancel_url: urls.cancel,
  }, options);
  return session.url;
}

/** Marks a Checkout session that started on the report (#66), so /thank-you shows the report wording. */
export const REPORT_SOURCE = "report";

/** A card setup from the report page (#66): the same fields, plus the parent, child and assessment it belongs to. */
export interface ReportCardSetup extends CardSetup {
  /** card_setups.id: one per child, so a second click reuses the same Stripe customer. */
  ref: string;
  parentId: string;
  childId: string;
  assessmentId: string;
  reportId: string;
  /** The child's Stripe customer from an earlier click, or null the first time. */
  customerId: string | null;
  /** Where Stripe's back link returns: the report page at its next step. */
  cancelPath: string;
}

const reportMetadata = (p: ReportCardSetup): Record<string, string> => ({
  ...cardMetadata(p),
  source: REPORT_SOURCE,
  parent_id: p.parentId,
  child_id: p.childId,
  assessment_id: p.assessmentId,
  report_id: p.reportId,
});

/**
 * The child's Stripe customer, with the plan and report of this click in its metadata. The first click creates it
 * with an idempotency key from the ref, so two clicks at the same moment get the same customer.
 */
export async function reportCardCustomer(s: Stripe, p: ReportCardSetup): Promise<string> {
  const metadata = reportMetadata(p);
  const description = cardDescription(p);
  if (p.customerId) {
    await s.customers.update(p.customerId, { description, metadata });
    return p.customerId;
  }
  // Only fields that never change for this ref (Stripe refuses a reused key with other parameters); the email, name
  // and plan follow in the update.
  const params = { metadata: { ref: p.ref, source: REPORT_SOURCE, parent_id: p.parentId, child_id: p.childId } };
  const key = { idempotencyKey: `report-card-customer-${p.ref}` };
  let created: Stripe.Customer;
  try {
    created = await s.customers.create(params, key);
  } catch (e) {
    // A second click while the first create is still running: Stripe answers 409; the retry gets the same customer.
    if (!(e instanceof Stripe.errors.StripeError) || e.statusCode !== 409) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    created = await s.customers.create(params, key);
  }
  await s.customers.update(created.id, { email: p.email, name: p.name, description, metadata });
  return created.id;
}

/**
 * After a card is saved: the customer's plan and description follow the setup that succeeded, so a later click on
 * another plan in a second tab cannot leave the customer on a plan the parent did not save the card for.
 */
export async function keepSavedPlan(s: Stripe, customer: string, metadata: Record<string, string>) {
  if (!metadata.plan || !metadata.price) return;
  const keys = ["plan", "price", "first_month_price", "subject", "grade", "report_id", "assessment_id"].filter((k) => metadata[k]);
  const price = priceWithOffer(Number(metadata.price));
  await s.customers.update(customer, {
    description: `${metadata.subject}, ${gradeName(Number(metadata.grade))}, ${price} from the first workbook`,
    metadata: Object.fromEntries(keys.map((k) => [k, metadata[k]])),
  });
}

/** The Checkout page for a report card setup. Returns to /thank-you, or to the report when the parent goes back. */
export function reportCardSetupUrl(s: Stripe, customer: string, p: ReportCardSetup): Promise<string | null> {
  return checkoutUrl(s, customer, p, reportMetadata(p), cardDescription(p), {
    success: `${p.origin}/thank-you?session_id={CHECKOUT_SESSION_ID}&from=${REPORT_SOURCE}`,
    cancel: `${p.origin}${p.cancelPath}`,
  });
}

/** A customer's page in the Stripe Dashboard, in the mode of the key the site uses (D-099); null without a key. */
export function stripeCustomerUrl(customer: string): string | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const live = key.startsWith("sk_live_") || key.startsWith("rk_live_");
  return `https://dashboard.stripe.com/${live ? "" : "test/"}customers/${encodeURIComponent(customer)}`;
}

export type StartPlanOutcome =
  /** `generation`: the start's record, the key of its one confirmation email. */
  | { ok: true; subscription: string; firstChargeAt: string; generation: number }
  /**
   * "unconfirmed": Stripe may still make the plan. The record stays open, and the webhook, the sweep or the next press decides it.
   * "needs_team": Stripe's key has expired with no plan found, so no press can be safe. Only an admin's check closes the record.
   */
  | { ok: false; error: "no_card" | "already" | "not_delivered" | "unconfirmed" | "needs_team" };

/** True when Stripe has no object with this id (a 404), so the caller creates it. */
const missing = (e: unknown) => e instanceof Stripe.errors.StripeError && e.statusCode === 404;

/** The plan's product, created once with a fixed id. */
async function planProduct(s: Stripe) {
  try {
    await s.products.retrieve(PLAN_PRODUCT.id, {}, CARD_READ);
  } catch (e) {
    if (!missing(e)) throw e;
    await s.products.create({ id: PLAN_PRODUCT.id, name: PLAN_PRODUCT.name }, { ...CARD_WRITE, idempotencyKey: `product-${PLAN_PRODUCT.id}` });
  }
}

/**
 * The card a new plan charges: the card a parent chose in a card update (the Customer's default, #554), else the Customer's
 * newest card. Only a card: a default of another type is not one the plan start charges.
 */
async function planCard(s: Stripe, customer: string): Promise<string | undefined> {
  const found = await s.customers.retrieve(customer, { expand: ["invoice_settings.default_payment_method"] }, CARD_READ);
  const chosen = found.deleted ? null : found.invoice_settings?.default_payment_method;
  if (chosen && typeof chosen !== "string" && chosen.type === "card") return chosen.id;
  const cards = await s.paymentMethods.list({ customer, type: "card", limit: 1 }, CARD_READ);
  return cards.data[0]?.id;
}

/**
 * D-139: starts the paid plan of a saved card when the first workbook arrives at your home. A monthly subscription at the card's
 * price on the child's customer, charged to the saved card: the free first month first (a 30-day trial, nothing
 * charged), then the full price on day 30 and each month after until the parent cancels. Refuses when the
 * customer already has a subscription that is not over, or no saved card. Throws, and starts nothing, when it cannot
 * read the customer's whole list.
 *
 * #554: each start is one durable record (public.plan_starts, card-reconcile.ts), one key per card setup and generation. Only
 * admitPlanStart leads to the create call, and it is atomic in the database, so a press that read an empty list before another press
 * finished finds that record and answers "already". A retry sends the record's key and card. A timeout answers "unconfirmed" and the
 * record stays open: the request can still land. Time never closes a record. It charges the row's newest card, else the card planCard
 * finds. A card update during the start is corrected right after it and, for a late creation, by the webhook or the sweep. When that
 * last step fails the plan has still started, so the answer says so.
 */
export async function startPlan(s: Stripe, p: { cardSetup: string; customer: string; price: number; deliveryConfirmed: boolean }, now = new Date(), rows: CardRows | null = liveCardRows()): Promise<StartPlanOutcome> {
  if (p.deliveryConfirmed !== true) return { ok: false, error: "not_delivered" };
  if (!rows) throw new Error("No card rows");
  const canWrite = writeWindow();
  const row = await rows.cardRow(p.cardSetup);
  const current = (await customerSubscriptions(s, p.customer, CARD_READ)).map(planCardOf);
  const step = pressStep(row?.planStart ?? null, current, Date.now());
  const generationOfRow = row?.planStart?.generation ?? 0;

  switch (step.step) {
    case "landed": {
      // An earlier press whose answer was lost: its subscription is here, so this press gets its answer.
      await closeRecord(rows, p.cardSetup, generationOfRow, startedOutcome(step.plan));
      await settleAfterStart(s, rows, p.cardSetup, canWrite, step.plan);
      return planNotOver(step.plan.status) ? { ok: true, subscription: step.plan.id, firstChargeAt: step.plan.firstCharge ?? firstChargeAt(now, planTerms(p.price).trialDays).toISOString(), generation: generationOfRow } : { ok: false, error: "already" };
    }
    case "other":
      await closeRecord(rows, p.cardSetup, generationOfRow, { state: "other", subscription: step.plan.id });
      await settleAfterStart(s, rows, p.cardSetup, canWrite);
      return { ok: false, error: "already" };
    case "already":
      await settleAfterStart(s, rows, p.cardSetup, canWrite);
      return { ok: false, error: "already" };
    case "unconfirmed":
    case "needs_team":
      return { ok: false, error: step.step };
  }

  const card = step.card ?? row?.paymentMethod ?? await planCard(s, p.customer);
  if (!card) return { ok: false, error: "no_card" };
  const terms = planTerms(p.price);
  await planProduct(s);
  const held = await rows.admitPlanStart(p.cardSetup, step.generation, `start-plan-${p.cardSetup}-${randomUUID()}`, card);
  if (held.state === "started" || held.state === "other") {
    // Another press finished after this press read its list.
    await settleAfterStart(s, rows, p.cardSetup, canWrite);
    return { ok: false, error: "already" };
  }
  // Another press's start with an answer this press did not read, or a key too near its end to send. The next press reads it all again.
  if (held.state !== "open" || held.generation !== step.generation || Date.now() - held.at >= PLAN_RETRY_MS) return { ok: false, error: "unconfirmed" };
  let created: Stripe.Subscription;
  try {
    created = await s.subscriptions.create({
      customer: p.customer,
      items: [{ price_data: { currency: "cad", product: PLAN_PRODUCT.id, unit_amount: terms.monthlyCents, recurring: { interval: "month" } } }],
      trial_period_days: terms.trialDays,
      default_payment_method: held.card,
      metadata: { card_setup: p.cardSetup, start_key: held.key, price: cad(p.price), trial_start_reason: "workbook_delivered", delivery_confirmed: "true" },
    }, { ...CARD_WRITE, idempotencyKey: held.key });
  } catch (e) {
    if (refusedByStripe(e)) {
      // Nothing started, and Stripe answers this key the same way for 24 hours, so the next press opens a new generation.
      await closeRecord(rows, p.cardSetup, held.generation, { state: "refused" });
      throw e;
    }
    console.error("[stripe] plan start not confirmed", e instanceof Error ? e.message : "failed");
    return { ok: false, error: "unconfirmed" };
  }
  const plan = planCardOf(created);
  await closeRecord(rows, p.cardSetup, held.generation, startedOutcome(plan));
  await settleAfterStart(s, rows, p.cardSetup, canWrite, { ...plan, defaultCard: plan.defaultCard ?? held.card });
  const end = created.trial_end ? new Date(created.trial_end * 1000) : firstChargeAt(now, terms.trialDays);
  return { ok: true, subscription: created.id, firstChargeAt: end.toISOString(), generation: held.generation };
}

export type EndStuckStartOutcome =
  | { ok: true }
  /**
   * "changed": the record is not the open one the admin saw. "too_soon": Stripe may still answer its key. "landed": its plan is in
   * Stripe, so the record closed as started and the parent hears by email. "already": another running plan is in Stripe.
   */
  | { ok: false; error: "changed" | "too_soon" | "landed" | "already" };

/**
 * The one way an open record with no plan found closes: an admin's press, after their own check in Stripe. It reads Stripe's whole
 * list again first, and throws when it cannot, so it never closes a record on a read that failed.
 */
export async function endStuckPlanStart(s: Stripe, p: { cardSetup: string; customer: string; generation: number; admin: string }, rows: CardRows | null = liveCardRows()): Promise<EndStuckStartOutcome> {
  if (!rows) throw new Error("No card rows");
  const start = (await rows.cardRow(p.cardSetup))?.planStart;
  if (start?.state !== "open" || start.generation !== p.generation) return { ok: false, error: "changed" };
  if (Date.now() - start.at < PLAN_KEY_MS) return { ok: false, error: "too_soon" };
  const step = pressStep(start, (await customerSubscriptions(s, p.customer, CARD_READ)).map(planCardOf), Date.now());
  if (step.step === "landed") {
    await rows.finishPlanStart(p.cardSetup, start.generation, startedOutcome(step.plan));
    return { ok: false, error: "landed" };
  }
  if (step.step === "other") {
    await rows.finishPlanStart(p.cardSetup, start.generation, { state: "other", subscription: step.plan.id });
    return { ok: false, error: "already" };
  }
  return await rows.teamEndPlanStart(p.cardSetup, start.generation, p.admin) ? { ok: true } : { ok: false, error: "changed" };
}

/** Only logs when it cannot: the answer stands, the record stays open, and the webhook or the sweep closes it when it finds the plan. */
async function closeRecord(rows: CardRows, cardSetup: string, generation: number, outcome: PlanStartOutcome) {
  try {
    await rows.finishPlanStart(cardSetup, generation, outcome);
  } catch (e) {
    console.error("[stripe] plan start record not closed", e instanceof Error ? e.message : "failed");
  }
}

/** Brings the Customer and the plan to the row's newest card. Only logs when it cannot: the row stays flagged, and the sweep comes back. */
async function settleAfterStart(s: Stripe, rows: CardRows, cardSetup: string, canWrite: () => boolean, made?: PlanCard) {
  try {
    const row: CardRow | null = await rows.cardRow(cardSetup);
    if (!row?.paymentMethod) return;
    await settleNewestCard(cardSetup, row.customer, row, { rows, stripe: stripeCards(s), canWrite }, made);
  } catch (e) {
    console.error("[stripe] plan start could not settle the card", e instanceof Error ? e.message : "failed");
  }
}

export type CancelPlanOutcome =
  | { ok: true; changed: boolean; endsAt: string | null }
  | { ok: false; error: "no_plan" };

/**
 * The parent's cancel button. A plan in its free month or a paid month stops at the end of that month and charges
 * nothing more (terms: "takes effect at the end of the month you are in"). A plan with a failed payment stops now, so
 * Stripe does not try the card again. Throws when it cannot read the customer's whole list, so `no_plan` always means
 * that no plan can charge the card.
 */
export async function cancelPlan(s: Stripe, customer: string): Promise<CancelPlanOutcome> {
  const current = await customerSubscriptions(s, customer);
  const live = current.filter((x) => RUNNING_PLAN.has(x.status));
  if (live.length === 0) return { ok: false, error: "no_plan" };
  let changed = false;
  let endsAt: string | null = null;
  for (const plan of live) {
    if (plan.status !== "trialing" && plan.status !== "active") {
      await s.subscriptions.cancel(plan.id);
      changed = true;
      continue;
    }
    const end = plan.trial_end && plan.status === "trialing" ? plan.trial_end : plan.items.data[0]?.current_period_end;
    if (end) endsAt = new Date(end * 1000).toISOString();
    if (plan.cancel_at_period_end) continue;
    await s.subscriptions.update(plan.id, { cancel_at_period_end: true });
    changed = true;
  }
  return { ok: true, changed, endsAt };
}

const FAMILY_DELETE_REQUEST = { timeout: 8000, maxNetworkRetries: 1 };

/**
 * Every plan of the customer that is not over, for the family delete (#556). Any state other than the two ends counts,
 * a state Stripe adds later too. Throws when it cannot read the whole list.
 */
export async function runningPlans(s: Stripe, customer: string): Promise<string[]> {
  const all = await customerSubscriptions(s, customer, FAMILY_DELETE_REQUEST);
  return all.filter((x) => x.status !== "canceled" && x.status !== "incomplete_expired").map((x) => x.id);
}

/**
 * The family delete ends a plan now, not at the end of the month, because the family's data is about to go. No refund
 * and no last invoice: nothing is prorated. Stripe stops collecting the customer's open invoices when a plan is cancelled.
 */
export async function stopPlanNow(s: Stripe, plan: string): Promise<void> {
  await s.subscriptions.cancel(plan, { invoice_now: false, prorate: false }, FAMILY_DELETE_REQUEST);
}
