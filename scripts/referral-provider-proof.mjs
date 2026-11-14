// Synthetic Stripe test-mode proof. Never accepts a live key or sends a customer email.
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!/^(?:sk|rk)_test_/.test(key)) throw Error("A Stripe test key is required before any provider request");
// Use the same SDK module as the compiled adapter so instanceof checks retain their meaning.
const Stripe = createRequire(import.meta.url)("stripe");
const out = resolve(".workbook-sample/referral-provider-proof");
await mkdir(out, { recursive: true });
await build({ entryPoints: ["src/lib/referral-stripe.ts"], outfile: `${out}/adapter.cjs`, bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "server-only-proof", setup(b) { b.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "proof" })); b.onLoad({ filter: /.*/, namespace: "proof" }, () => ({ contents: "export {};" })); } }] });
const { stripeReferrals } = createRequire(import.meta.url)(`${out}/adapter.cjs`);
const stripe = new Stripe(key, { maxNetworkRetries: 0, timeout: 15000 });
const balance = await stripe.balance.retrieve();
if (balance.livemode) throw Error("Provider mode mismatch");
const provider = stripeReferrals(stripe, false);
const results = [];
const check = (name, condition, detail = {}) => { results.push({ name, pass: !!condition, ...detail }); if (!condition) throw Error(name); console.log(JSON.stringify(results.at(-1))); };
let clock;
try {
  try { await stripe.products.retrieve("unica_math"); }
  catch (e) { if (e.code !== "resource_missing") throw e; await stripe.products.create({ id: "unica_math", name: "Unica Learning math program" }); }
  const coupon = await provider.coupon();
  check("validated_50_percent_once_coupon", coupon.id === "unica-referral-half-v1");
  clock = await stripe.testHelpers.testClocks.create({ frozen_time: Math.floor(Date.now() / 1000), name: "Synthetic referral proof" });
  async function customer(balance) { return stripe.customers.create({ name: "Synthetic referral proof", test_clock: clock.id, payment_method: "pm_card_visa", invoice_settings: { default_payment_method: "pm_card_visa" }, ...(balance ? { balance } : {}), metadata: { referral_proof: "true" } }); }
  async function price(cents) { return stripe.prices.create({ product: "unica_math", currency: "cad", unit_amount: cents, recurring: { interval: "month" }, metadata: { referral_proof: "true" } }); }
  const first = await customer(), firstPrice = await price(7999);
  const trialEnd = clock.frozen_time + 30 * 86400;
  const subscription = await stripe.subscriptions.create({ customer: first.id, items: [{ price: firstPrice.id }], trial_end: trialEnd, metadata: { start_key: "synthetic-referral-proof-trial" } });
  const zero = await provider.invoice(typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice.id);
  check("trial_stays_free_without_consuming_coupon", zero.paidCents === 0 && !zero.actualPayment && zero.couponIds.length === 0);
  check("initial_invoice_retains_its_creation_key", zero.startKey === "synthetic-referral-proof-trial");
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: trialEnd });
  for (let attempt = 0; attempt < 100; attempt++) {
    const current = await stripe.testHelpers.testClocks.retrieve(clock.id);
    if (current.status === "ready") break;
    if (attempt === 99) throw Error("Test clock did not settle");
    await new Promise(r => setTimeout(r, 750));
  }
  const invoices = await stripe.invoices.list({ customer: first.id, subscription: subscription.id, limit: 100 });
  const renewal = invoices.data.find(i => i.billing_reason === "subscription_cycle" && i.status === "draft");
  if (!renewal) throw Error("The first paid renewal is not an editable draft");
  check("renewal_ignores_the_retained_subscription_creation_key", (await provider.invoice(renewal.id)).startKey === null);
  const reservation = { id: `proof-${clock.id}`, key: `proof-${clock.id}-first`, parent: "synthetic", child: "synthetic-first", customer: first.id, invoice: renewal.id, subscription: subscription.id, coupon: coupon.id, product: coupon.product, cents: 7999, allowed: true, policy: "clear", state: "reserved", startKey: null, createdAt: Date.now() };
  await provider.apply(await provider.invoice(renewal.id), reservation);
  await provider.apply(await provider.invoice(renewal.id), reservation);
  const finalized = await stripe.invoices.finalizeInvoice(renewal.id, { auto_advance: false });
  check("first_child_half_price_once", finalized.amount_due === 3999, { dueCents: finalized.amount_due, discountCents: finalized.total_discount_amounts.reduce((n, d) => n + d.amount, 0) });
  await provider.withdraw(await provider.invoice(renewal.id), { ...reservation, policy: "hold", allowed: false });
  const committed = await provider.withdraw(await provider.invoice(renewal.id), { ...reservation, key: reservation.key + "-revoked", policy: "revoke", allowed: false });
  const retained = await stripe.invoices.retrieve(renewal.id);
  check("revocation_keeps_the_finalized_monthly_receivable", committed === "committed" && retained.status === "open" && retained.amount_due === 3999 && retained.auto_advance === false);
  await stripe.invoices.pay(renewal.id);
  const paid = await provider.invoice(renewal.id);
  check("actual_nonzero_payment_confirmed", paid.actualPayment && paid.paidCents === 3999 && paid.risk === "clear");
  const payments = await stripe.invoicePayments.list({ invoice: renewal.id, limit: 100 });
  const intent = payments.data.find(p => p.payment.type === "payment_intent")?.payment.payment_intent;
  const intentId = typeof intent === "string" ? intent : intent?.id;
  if (!intentId) throw Error("Test payment intent is missing");
  await stripe.refunds.create({ payment_intent: intentId, amount: 100 });
  check("partial_refund_keeps_reward", (await provider.invoice(renewal.id)).risk === "clear");
  await stripe.refunds.create({ payment_intent: intentId });
  check("full_refund_revokes_unused_reward", (await provider.invoice(renewal.id)).risk === "revoke");
  const sibling = await customer(), siblingPrice = await price(5999);
  const siblingPlan = await stripe.subscriptions.create({ customer: sibling.id, items: [{ price: siblingPrice.id }], discounts: [{ coupon: coupon.id }], payment_behavior: "error_if_incomplete", billing_mode: { type: "flexible" }, metadata: { start_key: "synthetic-referral-proof-sibling" } });
  const siblingInvoice = await provider.invoice(typeof siblingPlan.latest_invoice === "string" ? siblingPlan.latest_invoice : siblingPlan.latest_invoice.id);
  check("immediate_sibling_payment_uses_existing_sibling_price", siblingInvoice.actualPayment && siblingInvoice.cents === 5999 && siblingInvoice.paidCents === 2999, { dueCents: siblingInvoice.paidCents });
  const credited = await customer(-7999);
  const creditPlan = await stripe.subscriptions.create({ customer: credited.id, items: [{ price: firstPrice.id }], discounts: [{ coupon: coupon.id }], payment_behavior: "error_if_incomplete", metadata: { start_key: "synthetic-referral-proof-zero" } });
  const creditInvoice = await provider.invoice(typeof creditPlan.latest_invoice === "string" ? creditPlan.latest_invoice : creditPlan.latest_invoice.id);
  check("credit_funded_initial_invoice_is_not_a_qualifying_payment", creditInvoice.paidCents === 0 && !creditInvoice.actualPayment);
  const nextPeriod = (await stripe.subscriptions.retrieve(subscription.id)).items.data[0].current_period_end;
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: nextPeriod });
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await stripe.testHelpers.testClocks.retrieve(clock.id)).status === "ready") break;
    if (attempt === 99) throw Error("Second test-clock advance did not settle");
    await new Promise(r => setTimeout(r, 750));
  }
  const laterInvoices = await stripe.invoices.list({ customer: first.id, subscription: subscription.id, limit: 100 });
  const later = laterInvoices.data.find(i => i.id !== renewal.id && i.billing_reason === "subscription_cycle");
  check("following_month_returns_to_full_price", !!later && later.total === 7999 && (await provider.invoice(later.id)).couponIds.length === 0);
} catch (e) {
  console.error(JSON.stringify({ error: e.type ?? e.name, code: e.code, message: e.message }));
  process.exitCode = 1;
} finally {
  if (clock) { await stripe.testHelpers.testClocks.del(clock.id); console.log("Synthetic test clock and its customers removed"); }
  await writeFile(`${out}/results.json`, JSON.stringify({ at: new Date().toISOString(), provider: "Stripe test mode", results, limits: ["Adapter-only provider proof", "No real customer, real charge or email", "SQL, browser and dispute evidence remain separate"] }, null, 2) + "\n");
}
