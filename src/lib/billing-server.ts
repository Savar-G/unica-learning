import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import type { BillingProvider, BillingStore, CardUpdates, FamilyBillingSeams, ProviderInvoice } from "@/lib/billing";
import { supabaseCardLocks } from "@/lib/card-lock-server";
import type { Database } from "@/lib/database";
import { stripePlanProvider, supabasePlanStore } from "@/lib/plan-state-server";
import { stripe } from "@/lib/stripe";
import { writeCardDefault } from "@/lib/stripe-subscriptions";
import { adminClient } from "@/lib/supabase-auth";

// The billing module's seams (src/lib/billing.ts) for the live site: card_setups and children in Supabase, read with the
// secret key and always filtered on the signed-in parent, because parents may not read stripe_customer_id; and Stripe.

/** Marks a Checkout Session as a card update, so no other setup session can make a card the default. */
export const CARD_UPDATE_SOURCE = "card_update";

/** More invoices than these pages hold is not a list this page can show whole: the read throws. */
const INVOICE_PAGES = 12;
const READ = { timeout: 4000, maxNetworkRetries: 1 };

const idOf = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : value?.id ?? null);

/** The receipt link, only when it is Stripe's own https page: the page puts it in an href. */
function receiptUrl(invoice: Stripe.Invoice): string | null {
  const link = invoice.hosted_invoice_url ?? invoice.invoice_pdf;
  if (!link) return null;
  try {
    const url = new URL(link);
    return url.protocol === "https:" && url.hostname.endsWith(".stripe.com") ? link : null;
  } catch {
    return null;
  }
}

const providerInvoice = (invoice: Stripe.Invoice): ProviderInvoice => ({
  id: invoice.id, customer: idOf(invoice.customer), status: invoice.status, created: invoice.created, paidAt: invoice.status_transitions?.paid_at ?? null,
  amountPaid: invoice.amount_paid, amountDue: invoice.amount_due, total: invoice.total, currency: invoice.currency, receiptUrl: receiptUrl(invoice),
});

/** Stripe as the billing provider. Without a key it cannot tell, so every call throws. */
export function stripeBillingProvider(client: Stripe | null): BillingProvider {
  const s = () => {
    if (!client) throw new Error("No Stripe key");
    return client;
  };
  return {
    async invoices(customer) {
      const invoices: ProviderInvoice[] = [];
      let after: string | undefined;
      for (let page = 0; page < INVOICE_PAGES; page++) {
        const list = await s().invoices.list({ customer, limit: 100, starting_after: after }, READ);
        if (typeof list.has_more !== "boolean") throw new Error("Invoice pagination unreadable");
        invoices.push(...list.data.map(providerInvoice));
        if (!list.has_more) return invoices;
        const next = list.data.at(-1)?.id;
        if (!next || next === after) throw new Error("Invoice pagination did not advance");
        after = next;
      }
      throw new Error("Too many invoices");
    },
    async createCardUpdate({ ref, customer, parentId, childId, returnUrl, cancelUrl }) {
      const metadata = { ref, source: CARD_UPDATE_SOURCE, parent_id: parentId, child_id: childId };
      // client_reference_id and metadata.ref are the row's, as on the first card: saved-card's check still reads this
      // customer's sessions, and keeps the first card saved for the row.
      const session = await s().checkout.sessions.create({
        mode: "setup",
        currency: "cad",
        // Cards only: the plan start charges only a card. Stripe refuses payment_method_types here (checked in test mode, 2026-11-05).
        allowed_payment_method_types: ["card"],
        customer,
        client_reference_id: ref,
        metadata,
        setup_intent_data: { description: "Card update", metadata },
        custom_text: { submit: { message: "We use this card for your plan's next charge." } },
        success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
      }, { timeout: 15_000, maxNetworkRetries: 0 });
      return session.url;
    },
    async readCardUpdate(id) {
      let session: Stripe.Checkout.Session;
      try {
        session = await s().checkout.sessions.retrieve(id, { expand: ["setup_intent"] }, READ);
      } catch (e) {
        if (e instanceof Stripe.errors.StripeError && e.statusCode === 404) return null;
        throw e;
      }
      const customer = idOf(session.customer);
      const ref = session.metadata?.ref;
      if (session.mode !== "setup" || session.metadata?.source !== CARD_UPDATE_SOURCE || !customer || !ref) return null;
      const intent = session.setup_intent;
      // A SetupIntent on another customer saved no card for this one.
      const saved = session.status === "complete" && intent && typeof intent !== "string" && intent.status === "succeeded" && idOf(intent.customer) === customer;
      return { id: session.id, ref, customer, created: session.created, paymentMethod: saved ? idOf(intent.payment_method) : null };
    },
    async setCardDefault(customer, paymentMethod, canWrite) {
      await writeCardDefault(s(), customer, paymentMethod, canWrite);
    },
  };
}

/** card_setups and children as the billing store. */
export function supabaseBillingStore(db: SupabaseClient<Database>): BillingStore {
  return {
    ...supabaseCardLocks(db),
    async family(parentId) {
      const [children, cards] = await Promise.all([
        db.from("children").select("id, first_name").eq("parent_id", parentId).order("created_at").order("id"),
        db.from("card_setups").select("id, child_id, stripe_customer_id, card_saved_at").eq("parent_id", parentId),
      ]);
      if (children.error) throw new Error(`children read: ${children.error.message}`);
      if (cards.error) throw new Error(`cards read: ${cards.error.message}`);
      return children.data.map((child) => {
        const card = cards.data.find((c) => c.child_id === child.id);
        return { childId: child.id, firstName: child.first_name, cardId: card?.id ?? null, customer: card?.stripe_customer_id ?? null, cardSaved: !!card?.card_saved_at };
      });
    },
    async card(parentId, cardId) {
      const { data, error } = await db.from("card_setups").select("id, child_id, stripe_customer_id, card_saved_at").eq("id", cardId).eq("parent_id", parentId).maybeSingle();
      if (error) throw new Error(`card read: ${error.message}`);
      return data && { cardId: data.id, childId: data.child_id, customer: data.stripe_customer_id, cardSaved: !!data.card_saved_at };
    },
  };
}

/** The card update's seams on the live site, or null without the secret key or the Stripe key. */
export function liveCardUpdates(): CardUpdates | null {
  const db = adminClient();
  const client = stripe();
  if (!db || !client) return null;
  return { store: supabaseBillingStore(db), provider: stripeBillingProvider(client) };
}

/** The module's seams on the live site, or null without the secret key or the Stripe key. */
export function liveFamilyBilling(): FamilyBillingSeams | null {
  const db = adminClient();
  const client = stripe();
  if (!db || !client) return null;
  return { store: supabaseBillingStore(db), provider: stripeBillingProvider(client), plans: { store: supabasePlanStore(db), provider: stripePlanProvider(client) } };
}
