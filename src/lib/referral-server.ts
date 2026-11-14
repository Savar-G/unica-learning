import "server-only";
import type Stripe from "stripe";
import { adminClient } from "@/lib/supabase-auth";
import { stripe, stripeWithin } from "@/lib/stripe";
import { referralStore } from "@/lib/referral-store";
import { stripeReferrals, referralPages } from "@/lib/referral-stripe";
import { reconcileReferralInvoice, recoverReferrals, referralStarts, type Referrals } from "@/lib/referrals";
import { sendReferralRewards } from "@/lib/referral-email";
import type { MailTransport } from "@/lib/email-delivery";

export const REFERRAL_EVENTS: ReadonlySet<string> = new Set([
  "invoice.created", "invoice.updated", "invoice.finalized", "invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed", "invoice.voided", "invoice.marked_uncollectible",
  "charge.refunded", "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed", "charge.dispute.funds_reinstated", "charge.dispute.funds_withdrawn",
]);
const idOf = (x: string | { id: string } | null | undefined) => typeof x === "string" ? x : x?.id ?? null;
export function liveReferrals(client = stripe(), signal?: AbortSignal): Referrals | null {
  const db = adminClient(signal);
  if (!db || !client) return null;
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  // An explicit key prefix decides mode. Unknown/restricted keys need an explicit verified setting.
  const mode = process.env.STRIPE_REFERRAL_MODE;
  const live = mode === "live" || (!mode && /^(?:sk|rk)_live_/.test(key));
  if (mode !== "live" && mode !== "test" && !/^(?:sk|rk)_(live|test)_/.test(key)) throw new Error("STRIPE_REFERRAL_MODE is required for an unknown key format");
  return { store: referralStore(db), provider: stripeReferrals(client, live) };
}
export function liveReferralStarts(client: Stripe) {
  return {
    async reserve(input: Parameters<ReturnType<typeof referralStarts>["reserve"]>[0]) {
      const services = liveReferrals(client);
      if (!services) throw new Error("Referral start unavailable");
      return referralStarts(services).reserve(input);
    },
    async refused(reservation: Parameters<ReturnType<typeof referralStarts>["refused"]>[0]) {
      const services = liveReferrals(client);
      if (!services) throw new Error("Referral start unavailable");
      await referralStarts(services).refused(reservation);
    },
  };
}

/** Signature verification stays in the route, before this function or any service read. */
export async function handleReferralEvent(event: Stripe.Event): Promise<void> {
  if (!REFERRAL_EVENTS.has(event.type)) return;
  const endAt = Date.now() + 40_000;
  const signal = AbortSignal.timeout(40_000);
  const s = stripeWithin(signal);
  const services = liveReferrals(s, signal);
  if (!services || !s) throw new Error("Referral services unavailable");
  if (event.type.startsWith("invoice.")) {
    const object = event.data.object as Stripe.Invoice;
    await reconcileReferralInvoice(object.id, services);
    return;
  }
  const object = event.data.object as Stripe.Charge | Stripe.Dispute;
  const chargeId = object.object === "charge" ? object.id : idOf(object.charge);
  if (!chargeId) throw new Error("Referral dispute charge missing");
  const charge = await s.charges.retrieve(chargeId);
  const customer = idOf(charge.customer);
  if (!customer) return;
  if (!await services.store.owner(customer)) return;
  // Modern Stripe charges do not carry an invoice property. Follow every current invoice payment.
  const invoices = await services.provider.invoices(customer);
  const intent = idOf(charge.payment_intent);
  for (const invoice of invoices) {
    const payments = await referralPages(after => s.invoicePayments.list({ invoice: invoice.id, limit: 100, ...(after ? { starting_after: after } : {}) }));
    if (payments.some(p => p.payment.type === "charge" ? idOf(p.payment.charge) === charge.id : p.payment.type === "payment_intent" && idOf(p.payment.payment_intent) === intent)) {
      await reconcileReferralInvoice(invoice.id, services);
      const recovery = await recoverReferrals(services, () => !signal.aborted && Date.now() < endAt);
      if (recovery.failed) throw new Error("Referral risk recovery incomplete");
    }
  }
}

export async function recoverReferralsNow(startedAt: number, origin: string, transport: MailTransport) {
  const left = Math.max(1, startedAt + 48_000 - Date.now());
  const signal = AbortSignal.timeout(left), client = stripeWithin(signal);
  try {
    const services = liveReferrals(client, signal);
    if (!services) return { error: "unavailable" };
    const result = await recoverReferrals(services, () => Date.now() < startedAt + 40_000);
    const emails = await sendReferralRewards(services.store, transport, origin, () => Date.now() < startedAt + 45_000);
    return { ...result, emails };
  } catch { return { error: "run_failed" }; }
}
