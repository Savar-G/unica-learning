import "server-only";
import Stripe from "stripe";
import { cad, firstMonth, priceWithOffer } from "@/lib/site";

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
  `Nothing is charged today. Your first 2 weeks are free, starting when your first workbook ships. On day 14 we charge CAD ${cad(firstMonth(price))} for your first month, then CAD ${cad(price)} every month until you cancel. We email you a reminder a few days before the first charge. Cancel before day 14 and you pay nothing.`;

/**
 * Creates the Stripe customer and a hosted Checkout page in setup mode: it saves the card and charges nothing.
 * When the first workbook ships, start a CAD `price` monthly subscription on this customer with a 14-day free trial
 * (TRIAL_DAYS) and the first paid month at metadata first_month_price (CAD 50: a coupon for the difference, duration
 * "once"; D-053, D-139). Email the reminder a few days before the trial ends.
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
  first_month_price: cad(firstMonth(p.price)), curriculum: p.curriculum, ...(p.postal ? { postal: p.postal } : {}),
});
const cardDescription = (p: CardSetup) => `${p.subject}, grade ${p.grade}, ${priceWithOffer(p.price)} from the first workbook`;

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
  const price = metadata.first_month_price ? priceWithOffer(Number(metadata.price)) : `CAD ${metadata.price}/month`;
  await s.customers.update(customer, {
    description: `${metadata.subject}, grade ${metadata.grade}, ${price} from the first workbook`,
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
