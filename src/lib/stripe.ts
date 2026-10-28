import "server-only";
import Stripe from "stripe";
import { gradeName } from "@/lib/assessment/grades";
import { cad, priceWithOffer } from "@/lib/site";
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

export interface CardSetup {
  ref: string;
  name: string;
  email: string;
  plan: string;
  subject: string;
  grade: number;
  price: number;
  curriculum: string;
  /** Null when the parent signed up on a phone (D-134): the metadata then has no postal key. */
  postal: string | null;
  /** Site origin for the return URLs, e.g. https://unicalearning.com */
  origin: string;
}

/** What the parent agrees to on Stripe's page. Stripe requires the amount, timing and how to cancel. */
export const cardTerms = (price: number) =>
  `Nothing is charged today. Your first month is free, starting when your first workbook ships. On day 30 we charge CAD ${cad(price)}, then CAD ${cad(price)} every month until you cancel. We email you a reminder 7 days before the first charge, with a link to manage or cancel your plan. Cancel before day 30 and you pay nothing.`;

/**
 * Creates the Stripe customer and a hosted Checkout page in setup mode: it saves the card and charges nothing.
 * When the first workbook ships, start a CAD `price` monthly subscription on this customer with the free first month
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
    client_reference_id: p.ref,
    metadata,
    setup_intent_data: { description, metadata },
    custom_text: { submit: { message: cardTerms(p.price) } },
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
  | { ok: true; subscription: string; firstChargeAt: string }
  | { ok: false; error: "no_card" | "already" };

/** True when Stripe has no object with this id (a 404), so the caller creates it. */
const missing = (e: unknown) => e instanceof Stripe.errors.StripeError && e.statusCode === 404;

/** The plan's product, created once with a fixed id. */
async function planProduct(s: Stripe) {
  try {
    await s.products.retrieve(PLAN_PRODUCT.id);
  } catch (e) {
    if (!missing(e)) throw e;
    await s.products.create({ id: PLAN_PRODUCT.id, name: PLAN_PRODUCT.name }, { idempotencyKey: `product-${PLAN_PRODUCT.id}` });
  }
}

/**
 * D-139: starts the paid plan of a saved card when the first workbook ships. A monthly subscription at the card's
 * price on the child's customer, charged to the saved card: the free first month first (a 30-day trial, nothing
 * charged), then the full price on day 30 and each month after until the parent cancels. Refuses when the
 * customer already has a subscription that is not over, or no saved card. The card setup's id keys the create, so a
 * double click starts one subscription.
 */
export async function startPlan(s: Stripe, p: { cardSetup: string; customer: string; price: number }, now = new Date()): Promise<StartPlanOutcome> {
  const current = await s.subscriptions.list({ customer: p.customer, status: "all", limit: 20 });
  if (current.data.some((x) => x.status !== "canceled" && x.status !== "incomplete_expired")) return { ok: false, error: "already" };
  const cards = await s.paymentMethods.list({ customer: p.customer, type: "card", limit: 1 });
  const card = cards.data[0]?.id;
  if (!card) return { ok: false, error: "no_card" };
  const terms = planTerms(p.price);
  await planProduct(s);
  const created = await s.subscriptions.create({
    customer: p.customer,
    items: [{ price_data: { currency: "cad", product: PLAN_PRODUCT.id, unit_amount: terms.monthlyCents, recurring: { interval: "month" } } }],
    trial_period_days: terms.trialDays,
    default_payment_method: card,
    metadata: { card_setup: p.cardSetup, price: cad(p.price) },
  }, { idempotencyKey: `start-plan-${p.cardSetup}` });
  const end = created.trial_end ? new Date(created.trial_end * 1000) : firstChargeAt(now, terms.trialDays);
  return { ok: true, subscription: created.id, firstChargeAt: end.toISOString() };
}
