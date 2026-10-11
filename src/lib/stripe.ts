import "server-only";
import Stripe from "stripe";

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
  postal: string;
  /** Site origin for the return URLs, e.g. https://unicalearning.com */
  origin: string;
}

/** What the parent agrees to on Stripe's page. Stripe requires the amount, timing and how to cancel. */
export const cardTerms = (price: number) =>
  `Nothing is charged today. When your first workbook ships, we charge CAD ${price}, then CAD ${price} every month until you cancel. Cancel before it ships and you pay nothing. Your 30-day money-back guarantee starts on the day of your first payment.`;

/**
 * Creates the Stripe customer and a hosted Checkout page in setup mode: it saves the card and charges nothing.
 * When the first workbook ships, start a CAD `price` monthly subscription on this customer (D-053).
 * Returns the Checkout page URL.
 */
export async function cardSetupUrl(s: Stripe, p: CardSetup): Promise<string | null> {
  const metadata = cardMetadata(p);
  const description = cardDescription(p);
  const customer = await s.customers.create({ email: p.email, name: p.name, description, metadata });
  return checkoutUrl(s, customer.id, p, metadata, description, {
    success: `${p.origin}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
    cancel: `${p.origin}/?card=cancelled`,
  });
}

/** The metadata keys every card setup carries; the report path adds its own (D-053). */
const cardMetadata = (p: CardSetup): Record<string, string> => ({
  ref: p.ref, plan: p.plan, subject: p.subject, grade: String(p.grade), price: String(p.price), curriculum: p.curriculum, postal: p.postal,
});
const cardDescription = (p: CardSetup) => `${p.subject}, grade ${p.grade}, CAD ${p.price}/month from the first workbook`;

/** A hosted Checkout page in setup mode for this customer. The parent sees cardTerms above the button. */
async function checkoutUrl(s: Stripe, customer: string, p: CardSetup, metadata: Record<string, string>, description: string, urls: { success: string; cancel: string }) {
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
  });
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

/** The plan of a card this customer already saved (from its SetupIntent), or null when no setup succeeded. */
export async function savedCardPlan(s: Stripe, customer: string): Promise<{ metadata: Record<string, string> } | null> {
  const intents = await s.setupIntents.list({ customer, limit: 20 });
  const saved = intents.data.find((i) => i.status === "succeeded");
  return saved ? { metadata: saved.metadata ?? {} } : null;
}

/**
 * After a card is saved: the customer's plan and description follow the setup that succeeded, so a later click on
 * another plan in a second tab cannot leave the customer on a plan the parent did not save the card for.
 */
export async function keepSavedPlan(s: Stripe, customer: string, metadata: Record<string, string>) {
  if (!metadata.plan || !metadata.price) return;
  const keys = ["plan", "price", "subject", "grade", "report_id", "assessment_id"].filter((k) => metadata[k]);
  await s.customers.update(customer, {
    description: `${metadata.subject}, grade ${metadata.grade}, CAD ${metadata.price}/month from the first workbook`,
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
