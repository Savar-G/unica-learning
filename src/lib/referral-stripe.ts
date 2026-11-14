import "server-only";
import Stripe from "stripe";
import type { ReferralInvoice, ReferralProvider, ReferralReservation } from "@/lib/referrals";
import { PLAN_PRODUCT } from "@/lib/subscription-plan";
import { CARD_READ, CARD_WRITE, customerSubscriptions } from "@/lib/stripe-subscriptions";

export const REFERRAL_COUPON_ID = "unica-referral-half-v1";
const idOf = (x: string | { id: string } | null | undefined) => typeof x === "string" ? x : x?.id ?? null;

/** Complete pagination or an error. No truncation can prove billing eligibility or payment ownership. */
export async function referralPages<T extends { id: string }>(load: (after?: string) => Promise<{ data: T[]; has_more: boolean }>): Promise<T[]> {
  const all: T[] = []; let after: string | undefined;
  for (let page = 0; page < 100; page++) {
    const next = await load(after);
    if (typeof next.has_more !== "boolean" || !Array.isArray(next.data) || (next.has_more && next.data.length === 0)) throw new Error("Referral provider page unreadable");
    all.push(...next.data);
    if (!next.has_more) return all;
    const cursor = next.data.at(-1)!.id;
    if (cursor === after) throw new Error("Referral provider cursor repeated");
    after = cursor;
  }
  throw new Error("Referral provider list incomplete");
}

export function stripeReferrals(s: Stripe, live: boolean): ReferralProvider {
  const checkMode = (mode: boolean) => { if (mode !== live) throw new Error("Referral provider mode mismatch"); };
  async function snapshot(raw: Stripe.Invoice): Promise<ReferralInvoice> {
    checkMode(raw.livemode);
    const customer = idOf(raw.customer);
    if (!customer) throw new Error("Referral invoice customer missing");
    const subscription = idOf(raw.parent?.subscription_details?.subscription);
    const plan = subscription ? await s.subscriptions.retrieve(subscription, {}, CARD_READ) : null;
    if (plan) { checkMode(plan.livemode); if (idOf(plan.customer) !== customer) throw new Error("Referral subscription owner mismatch"); }
    const lines = await referralPages(after => s.invoices.listLineItems(raw.id, { limit: 100, ...(after ? { starting_after: after } : {}) }, CARD_READ));
    const priceIds = [...new Set(lines.map(l => l.pricing?.price_details?.price).filter((id): id is string => !!id))];
    const prices = await Promise.all(priceIds.map(id => s.prices.retrieve(id, {}, CARD_READ)));
    for (const p of prices) checkMode(p.livemode);
    const program = prices.length > 0 && prices.every(p => idOf(p.product) === PLAN_PRODUCT.id) && lines.every(l => !!l.pricing?.price_details?.price);
    const monthly = prices.every(p => p.recurring?.interval === "month" && p.recurring.interval_count === 1) && lines.every(l => !l.parent?.subscription_item_details?.proration);
    let actualPayment = false, risk: ReferralInvoice["risk"] = "clear";
    if (raw.status === "paid" && raw.amount_paid > 0) {
      const payments = await referralPages(after => s.invoicePayments.list({ invoice: raw.id, limit: 100, ...(after ? { starting_after: after } : {}) }, CARD_READ));
      let actualCents = 0, refunded = 0, hasHold = false, lost = false;
      for (const payment of payments.filter(p => p.status === "paid" && (p.amount_paid ?? 0) > 0)) {
        let charge: Stripe.Charge | null = null;
        if (payment.payment.type === "payment_intent") {
          const intentId = idOf(payment.payment.payment_intent);
          if (!intentId) throw new Error("Referral payment intent missing");
          const intent = await s.paymentIntents.retrieve(intentId, {}, CARD_READ);
          checkMode(intent.livemode);
          if (idOf(intent.customer) !== customer) throw new Error("Referral payment owner mismatch");
          if (intent.status === "succeeded" && intent.amount_received > 0 && intent.latest_charge) charge = await s.charges.retrieve(idOf(intent.latest_charge)!, {}, CARD_READ);
        } else if (payment.payment.type === "charge") {
          const chargeId = idOf(payment.payment.charge);
          if (chargeId) charge = await s.charges.retrieve(chargeId, {}, CARD_READ);
        }
        // Payment records and manually marked paid invoices are not card payments.
        if (!charge) continue;
        checkMode(charge.livemode);
        if (idOf(charge.customer) !== customer || !charge.paid || charge.status !== "succeeded" || !charge.captured || charge.amount_captured <= 0) continue;
        actualCents += Math.min(payment.amount_paid ?? 0, charge.amount_captured);
        refunded += Math.min(payment.amount_paid ?? 0, charge.amount_refunded);
        // Current charge.disputed is not enough for a resolved lost dispute. Read all current disputes for this charge.
        const disputes = await referralPages(after => s.disputes.list({ charge: charge.id, limit: 100, ...(after ? { starting_after: after } : {}) }, CARD_READ));
        for (const dispute of disputes) {
          checkMode(dispute.livemode);
          if (dispute.status === "lost") lost = true;
          else if (dispute.status !== "won" && dispute.status !== "warning_closed") hasHold = true;
        }
      }
      actualPayment = actualCents > 0;
      risk = lost || (actualCents > 0 && refunded >= actualCents) ? "revoke" : hasHold ? "hold" : "clear";
    }
    const customerRow = await s.customers.retrieve(customer, {}, CARD_READ);
    if (!customerRow.deleted) checkMode(customerRow.livemode);
    const discounts = raw.discounts;
    const invoiceDiscountIds = new Set(discounts.map(d => typeof d === "string" ? d : d.id));
    const inheritedDiscount = (!customerRow.deleted && !!customerRow.discount && !invoiceDiscountIds.has(customerRow.discount.id)) || !!plan?.discounts?.some(d => !invoiceDiscountIds.has(typeof d === "string" ? d : d.id));
    const itemDiscount = lines.some(l => l.discounts.some(d => !invoiceDiscountIds.has(typeof d === "string" ? d : d.id)));
    const couponIds = discounts.flatMap(d => typeof d !== "string" && !d.deleted && d.source.type === "coupon" ? [idOf(d.source.coupon)].filter((x): x is string => !!x) : []);
    if (discounts.some(d => typeof d === "string")) throw new Error("Referral discounts not expanded");
    if (!["draft", "open", "paid", "void", "uncollectible"].includes(raw.status ?? "")) throw new Error("Referral invoice status unreadable");
    return { id: raw.id, customer, subscription, startKey: raw.billing_reason === "subscription_create" ? plan?.metadata.start_key ?? null : null, status: raw.status as ReferralInvoice["status"], cents: raw.subtotal,
      paidCents: raw.amount_paid, paidAt: raw.status_transitions.paid_at ? raw.status_transitions.paid_at * 1000 : null,
      actualPayment, modeMatches: true, program, monthly, renewal: raw.billing_reason === "subscription_cycle",
      risk, couponIds: couponIds.filter(id => id === REFERRAL_COUPON_ID), otherDiscount: inheritedDiscount || itemDiscount || discounts.length > couponIds.filter(id => id === REFERRAL_COUPON_ID).length };
  }
  async function invoice(id: string) { return snapshot(await s.invoices.retrieve(id, { expand: ["discounts"] }, CARD_READ)); }
  return {
    invoice,
    async familyCustomers(parent) {
      const all = await referralPages(after => s.customers.list({ limit: 100, ...(after ? { starting_after: after } : {}) }, CARD_READ));
      for (const c of all) checkMode(c.livemode);
      return all.filter(c => c.metadata.parent_id === parent).map(c => c.id);
    },
    async retire(reservation) {
      if (!reservation.invoice) return "pending";
      let current: ReferralInvoice;
      try { current = await invoice(reservation.invoice); }
      catch (e) {
        if (e instanceof Stripe.errors.StripeInvalidRequestError && e.code === "resource_missing") return "absent";
        throw e;
      }
      if (current.customer !== reservation.customer || current.subscription !== reservation.subscription) throw new Error("Referral retirement owner mismatch");
      if (current.status === "paid") return current.paidCents > 0 && current.couponIds.includes(reservation.coupon) ? "used" : "absent";
      if (current.status === "void") return "absent";
      if (!current.subscription || !current.program || !current.monthly || current.otherDiscount || current.cents !== reservation.cents) throw new Error("Referral retirement invoice mismatch");
      const plan = await s.subscriptions.retrieve(current.subscription, {}, CARD_READ);
      checkMode(plan.livemode);
      if (idOf(plan.customer) !== reservation.customer || !["canceled","incomplete_expired"].includes(plan.status)) return "pending";
      if (current.status === "draft") await s.invoices.del(current.id, {}, { ...CARD_WRITE, idempotencyKey: reservation.key + "-retire-draft" });
      else if (current.status === "open" || current.status === "uncollectible") await s.invoices.voidInvoice(current.id, {}, { ...CARD_WRITE, idempotencyKey: reservation.key + "-retire" });
      else return "pending";
      return "absent";
    },
    async enrolled(customer) {
      const subscriptions = await customerSubscriptions(s, customer, CARD_READ);
      for (const plan of subscriptions) {
        checkMode(plan.livemode);
        if (idOf(plan.customer) !== customer || plan.items.has_more) throw new Error("Referral enrollment unreadable");
      }
      return subscriptions.some(p => p.items.data.some(item => idOf(item.price.product) === PLAN_PRODUCT.id));
    },
    async startAllowed(customer) {
      const c = await s.customers.retrieve(customer, {}, CARD_READ);
      if (c.deleted) throw new Error("Referral customer deleted");
      checkMode(c.livemode);
      return !c.discount;
    },
    async withdraw(_read, reservation) {
      const raw = await s.invoices.retrieve(reservation.invoice!, { expand: ["discounts"] }, CARD_READ);
      checkMode(raw.livemode);
      if (idOf(raw.customer) !== reservation.customer) throw new Error("Referral withdrawal owner mismatch");
      const retained = raw.discounts.filter(d => typeof d === "string" || d.deleted || idOf(d.source.coupon) !== reservation.coupon);
      if (retained.length === raw.discounts.length) return;
      if (raw.status === "paid") return "committed";
      if (raw.status === "open" || raw.status === "uncollectible") {
        // Finalization commits the discount to this period. Revocation cannot cancel the whole monthly debt.
        if (reservation.policy === "revoke") {
          if (raw.metadata?.referral_hold === reservation.id) {
            const previous = raw.metadata.referral_restore_auto;
            if (previous !== "true" && previous !== "false") throw new Error("Referral collection setting unavailable");
            await s.invoices.update(raw.id, { auto_advance: previous === "true", metadata: { referral_hold: "", referral_restore_auto: "" } }, { ...CARD_WRITE, idempotencyKey: reservation.key + "-retain-finalized" });
          }
          return "committed";
        }
        await s.invoices.update(raw.id, { auto_advance: false, metadata: { referral_hold: reservation.id, referral_restore_auto: raw.metadata?.referral_restore_auto ?? String(raw.auto_advance) } }, { ...CARD_WRITE, idempotencyKey: reservation.key + "-hold" });
        return;
      }
      if (raw.status !== "draft") return;
      await s.invoices.update(raw.id, { discounts: retained.length ? retained.map(d => ({ discount: typeof d === "string" ? d : d.id })) : "" }, { ...CARD_WRITE, idempotencyKey: reservation.key + "-withdraw" });
    },
    async invoices(customer) {
      const raw = await referralPages(after => s.invoices.list({ customer, limit: 100, expand: ["data.discounts"], ...(after ? { starting_after: after } : {}) }, CARD_READ));
      const invoices: ReferralInvoice[] = [];
      for (const item of raw) {
        if (idOf(item.customer) !== customer) throw new Error("Referral invoice ownership mismatch");
        invoices.push(await snapshot(item));
      }
      return invoices;
    },
    async coupon() {
      let coupon: Stripe.Coupon;
      try { coupon = await s.coupons.retrieve(REFERRAL_COUPON_ID, { expand: ["applies_to"] }, CARD_READ); }
      catch (e) {
        if (!(e instanceof Stripe.errors.StripeInvalidRequestError) || e.code !== "resource_missing") throw e;
        coupon = await s.coupons.create({ id: REFERRAL_COUPON_ID, name: "Family referral: one paid month", percent_off: 50, duration: "once", applies_to: { products: [PLAN_PRODUCT.id] }, expand: ["applies_to"] }, { ...CARD_WRITE, idempotencyKey: "referral-coupon-half-v1" });
      }
      checkMode(coupon.livemode);
      if (!coupon.valid || coupon.percent_off !== 50 || coupon.amount_off !== null || coupon.duration !== "once" || coupon.redeem_by !== null || coupon.max_redemptions !== null
        || coupon.applies_to?.products.length !== 1 || coupon.applies_to.products[0] !== PLAN_PRODUCT.id) throw new Error("Referral coupon mismatch");
      return { id: coupon.id, product: PLAN_PRODUCT.id };
    },
    async apply(_read, reservation) {
      const current = await invoice(reservation.invoice!);
      if (current.customer !== reservation.customer || current.subscription !== reservation.subscription || current.cents !== reservation.cents || !current.modeMatches || !current.program || !current.monthly) throw new Error("Referral frozen invoice mismatch");
      if (current.couponIds.includes(reservation.coupon)) {
        const raw = await s.invoices.retrieve(current.id, {}, CARD_READ);
        if ((raw.status === "open" || raw.status === "uncollectible") && raw.metadata?.referral_hold === reservation.id) {
          await s.invoices.update(raw.id, { auto_advance: raw.metadata.referral_restore_auto === "true", metadata: { referral_hold: "", referral_restore_auto: "" } }, { ...CARD_WRITE, idempotencyKey: reservation.key + "-restore" });
        }
        return;
      }
      if (current.status !== "draft" || current.otherDiscount || current.paidCents > 0) throw new Error("Referral invoice is not editable");
      // This write cannot charge or finalize. It preserves Stripe's existing finalization setting.
      await s.invoices.update(current.id, { discounts: [{ coupon: reservation.coupon }] }, { ...CARD_WRITE, idempotencyKey: reservation.key });
      const confirmed = await invoice(current.id);
      if (!confirmed.couponIds.includes(reservation.coupon)) throw new Error("Referral discount unconfirmed");
    },
    async startResult(reservation: ReferralReservation) {
      const subscriptions = await customerSubscriptions(s, reservation.customer, CARD_READ);
      const found = subscriptions.find(p => p.metadata.start_key === reservation.startKey);
      if (!found) return { invoice: null, absent: true };
      checkMode(found.livemode);
      if (idOf(found.customer) !== reservation.customer) throw new Error("Referral subscription owner mismatch");
      const invoices = await referralPages(after => s.invoices.list({ subscription: found.id, limit: 100, expand: ["data.discounts"], ...(after ? { starting_after: after } : {}) }, CARD_READ));
      const initial = invoices.filter(i => i.billing_reason === "subscription_create").sort((a,b) => a.created-b.created)[0];
      if (!initial) throw new Error("Referral start invoice missing");
      const result = await snapshot(initial);
      if (!result.couponIds.includes(reservation.coupon)) throw new Error("Referral start discount missing");
      return { invoice: result, absent: false };
    },
  };
}
