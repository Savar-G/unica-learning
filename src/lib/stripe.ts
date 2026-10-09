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
  /** Site origin for the return URLs, e.g. https://pagewiselearning.vercel.app */
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
  const metadata = { ref: p.ref, plan: p.plan, subject: p.subject, grade: String(p.grade), price: String(p.price), curriculum: p.curriculum, postal: p.postal };
  const description = `${p.subject}, grade ${p.grade}, CAD ${p.price}/month from the first workbook`;
  const customer = await s.customers.create({ email: p.email, name: p.name, description, metadata });
  const session = await s.checkout.sessions.create({
    mode: "setup",
    currency: "cad",
    customer: customer.id,
    client_reference_id: p.ref,
    metadata,
    setup_intent_data: { description, metadata },
    custom_text: { submit: { message: cardTerms(p.price) } },
    success_url: `${p.origin}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${p.origin}/?card=cancelled`,
  });
  return session.url;
}
