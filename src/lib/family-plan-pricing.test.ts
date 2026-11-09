import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryBilling, type MemoryBillingChild } from "@/lib/billing-memory";
import { startPlan } from "@/lib/stripe";
import { stripePauses } from "@/lib/plan-pause-stripe";
import { customerPlan } from "@/lib/parent-plan-server";
import { pauseQuote } from "@/lib/plan-pause";
import { planPrice } from "@/lib/subscription-plan";

vi.mock("server-only", () => ({}));
const START = new Date("2026-11-10T18:00:00Z");
const END = "2026-12-10T18:00:00.000Z";
function fixture(count = 3) {
  const children: MemoryBillingChild[] = Array.from({ length: count }, (_, i) => i + 1).map(n => ({ parentId: "family", childId: `child-${n}`, firstName: `Child ${n}`, card: { id: `card-${n}`, customer: `cus_${n}`, saved: true } }));
  const billing = memoryBilling({ children });
  const writes: URLSearchParams[] = [], priceWrites: URLSearchParams[] = [];
  const plans: Record<string, Record<string, unknown>[]> = {};
  const prices = new Map<string, { id: string; unit_amount: number; lookup_key: string; currency: string; product: string; recurring: { interval: string; interval_count: number; usage_type: string } }>();
  let lose = false, refuse = false, providerCreated: number | null = null;
  const client = new Stripe("sk_test_family_terms", { maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient(async (input, init) => {
    const u = new URL(String(input)), method = init?.method ?? "GET", b = new URLSearchParams(String(init?.body ?? ""));
    const json = (value: unknown, status = 200) => Response.json(value, { status });
    if (u.pathname.startsWith("/v1/products/")) return json({ id: "unica_math" });
    if (u.pathname === "/v1/prices") {
      if (method === "GET") return json({ data: [...prices.values()].filter(p => p.lookup_key === u.searchParams.get("lookup_keys[0]")), has_more: false });
      priceWrites.push(b);
      const p = { id: `price_${b.get("unit_amount")}`, unit_amount: Number(b.get("unit_amount")), lookup_key: b.get("lookup_key")!, currency: "cad", product: "unica_math", active: true, recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } };
      prices.set(p.lookup_key, p); return json(p);
    }
    if (u.pathname.startsWith("/v1/customers/")) return json({ id: u.pathname.split("/").at(-1), invoice_settings: { default_payment_method: { id: "pm_card", type: "card" } } });
    if (u.pathname === "/v1/subscriptions" && method === "GET") return json({ data: plans[u.searchParams.get("customer")!] ?? [], has_more: false });
    if (u.pathname === "/v1/subscriptions" && method === "POST") {
      writes.push(b);
      if (lose) throw Error("Synthetic lost create");
      if (refuse) return json({ error: { type: "card_error", code: "card_declined", message: "Synthetic refusal" } }, 402);
      const trial = Number(b.get("trial_end")) || (b.has("trial_period_days") ? Date.now() / 1000 + 30 * 86400 : null);
      const p = { id: `sub_${writes.length}`, status: trial ? "trialing" : "active", created: providerCreated ?? Math.floor(Date.now() / 1000), customer: b.get("customer"), trial_end: trial, default_payment_method: "pm_card", cancel_at_period_end: false, collection_method: "charge_automatically", schedule: null, metadata: Object.fromEntries([...b.entries()].filter(([k]) => k.startsWith("metadata[")).map(([k, v]) => [k.slice(9, -1), v])), items: { data: [{ quantity: 1, price: { currency: "cad", unit_amount: Number(b.get("items[0][price]")?.replace("price_", "")), recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } } }] } };
      (plans[String(p.customer)] ??= []).push(p); return json(p);
    }
    if (u.pathname.startsWith("/v1/subscriptions/") && method === "POST") {
      const p = Object.values(plans).flat().find(p => p.id === u.pathname.split("/").at(-1))!;
      p.trial_end = Number(b.get("trial_end")); p.metadata = { ...(p.metadata as object), plan_pause_key: b.get("metadata[plan_pause_key]") };
      return json(p);
    }
    throw Error(`Unexpected ${method} ${u.pathname}`);
  }) });
  const start = (n: number, purpose: "initial" | "restart" = "initial", price = 79.99) => startPlan(client, { cardSetup: `card-${n}`, customer: `cus_${n}`, price, deliveryConfirmed: true, purpose }, new Date(), billing.store);
  const amounts = () => writes.map(b => Number(b.get("items[0][price]")?.replace("price_", "") ?? b.get("items[0][price_data][unit_amount]")));
  return { client, start, writes, priceWrites, amounts, plans, billing, createdAt: (at: string) => { providerCreated = Date.parse(at) / 1000; }, lose: () => { lose = true; }, refuse: () => { refuse = true; } };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(START); });
afterEach(() => vi.useRealTimers());
describe("family pricing through startPlan", () => {
  it.each([2, 3, 12])("starts %i children with one full price and one shared window", async count => {
    const f = fixture(count);
    for (let n = 1; n <= count; n++) expect(await f.start(n)).toMatchObject({ ok: true, firstChargeAt: END });
    expect(f.amounts()).toEqual([7999, ...Array(count - 1).fill(5999)]);
    expect(f.writes.map(b => b.get("trial_end"))).toEqual(Array(count).fill(String(Date.parse(END) / 1000)));
    expect(f.writes.every(b => !b.has("trial_period_days"))).toBe(true);
    expect(f.priceWrites.map(b => b.get("lookup_key"))).toEqual(["unica_math_cad_monthly_7999", "unica_math_cad_monthly_5999"].slice(0, count));
  });
  it("gives a late sibling only the rest of the family window", async () => {
    const f = fixture(); await f.start(1); vi.setSystemTime(new Date("2026-11-20T18:00:00Z"));
    expect(await f.start(2)).toMatchObject({ ok: true, firstChargeAt: END });
    expect(f.amounts()).toEqual([7999, 5999]);
  });
  it("charges a sibling immediately after the window", async () => {
    const f = fixture(); await f.start(1); vi.setSystemTime(new Date("2026-12-11T18:00:00Z"));
    expect(await f.start(2)).toMatchObject({ ok: true, firstChargeAt: new Date().toISOString() });
    expect(f.amounts()).toEqual([7999, 5999]);
    expect(f.writes[1].has("trial_end")).toBe(false); expect(f.writes[1].has("trial_period_days")).toBe(false);
    expect(f.writes[1].get("payment_behavior")).toBe("error_if_incomplete");
  });
  it.each(["initial", "restart"] as const)("uses Stripe creation time for an immediate %s charge", async purpose => {
    const f = fixture(); await f.start(1);
    if (purpose === "restart") { await f.start(2); f.plans.cus_2[0].status = "canceled"; }
    vi.setSystemTime(new Date("2026-12-11T18:00:00Z"));
    const actualCharge = "2026-12-13T18:00:00.000Z";
    f.createdAt(actualCharge);
    expect(await f.start(2, purpose)).toMatchObject({ ok: true, monthlyPrice: 59.99, firstChargeAt: actualCharge });
    expect(f.billing.planStarts.get("card-2")?.at(-1)).toMatchObject({ firstCharge: actualCharge, email: purpose === "restart" ? "none" : "pending" });
    expect(await customerPlan(f.client, "cus_2")).toMatchObject({ kind: "paying", monthly: 59.99, firstCharge: actualCharge });
  });
  it("keeps sibling prices after the first plan ends and on Restart", async () => {
    const f = fixture(); await f.start(1); await f.start(2);
    f.plans.cus_1[0].status = "canceled"; f.plans.cus_2[0].status = "canceled";
    vi.setSystemTime(new Date("2026-12-11T18:00:00Z"));
    await f.start(2, "restart"); await f.start(3); await f.start(1, "restart");
    expect(f.amounts()).toEqual([7999, 5999, 5999, 5999, 7999]);
    expect(f.writes.slice(2).every(b => !b.has("trial_end") && !b.has("trial_period_days"))).toBe(true);
  });
  it("retains the first reservation on an uncertain create and admits no sibling", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fixture(); f.lose();
    expect(await f.start(1)).toEqual({ ok: false, error: "unconfirmed" });
    expect(await f.start(2)).toEqual({ ok: false, error: "unconfirmed" });
    expect(f.writes).toHaveLength(1);
    expect(f.billing.planStarts.get("card-1")?.[0].state).toBe("open");
    expect(f.billing.planStarts.get("card-2")).toBeUndefined();
  });
  it("a pause moves only that child's trial, while a later sibling keeps the family end", async () => {
    const f = fixture(); await f.start(1); await f.start(2);
    const provider = stripePauses(f.client, async (parent, card) => parent === "family" ? `cus_${card}` : null);
    const plan = await provider.plan("family", "1"); expect(plan?.kind).toBe("trial");
    if (!plan) throw Error("Missing trial plan");
    const q = pauseQuote({ weeks: 2, used: 0, now: Date.now(), zone: "America/Vancouver", book: { id: "book", number: 1, shippedAt: "2026-11-08T18:00:00Z", deliveredAt: START.toISOString() }, plan });
    if (!q.ok) throw Error(q.error);
    expect(await provider.apply("family", "1", { id: "pause-one-child", state: "open", send: true, quote: q.quote })).toBe("applied");
    expect(await customerPlan(f.client, "cus_1")).toMatchObject({ kind: "free_month", firstCharge: "2026-12-24T18:00:00.000Z", monthly: 79.99 });
    expect(await customerPlan(f.client, "cus_2")).toMatchObject({ kind: "free_month", firstCharge: END, monthly: 59.99 });
    expect(await f.start(3)).toMatchObject({ ok: true, firstChargeAt: END });
  });
  it.each([2, 3])("%i concurrent first starts reserve the full price at most once, then siblings retry at 59.99", async count => {
    const f = fixture();
    const results = await Promise.all(Array.from({ length: count }, (_, n) => f.start(n + 1)));
    expect(results.filter(r => r.ok)).toHaveLength(1);
    for (let n = 0; n < count; n++) if (!results[n].ok) expect(await f.start(n + 1)).toMatchObject({ ok: true, firstChargeAt: END });
    expect(f.amounts().sort()).toEqual([...Array(count - 1).fill(5999), 7999]);
  });
  it("keeps an older agreed price when it is below the sibling price", async () => {
    const f = fixture(); await f.start(1);
    await f.start(2, "initial", planPrice(49, "one"));
    expect(f.amounts()).toEqual([7999, 4900]);
    expect(f.writes[1].get("trial_end")).toBe(String(Date.parse(END) / 1000));
  });
});
