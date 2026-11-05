import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { memoryBilling } from "@/lib/billing-memory";
import { startPlan } from "@/lib/stripe";

vi.mock("server-only", () => ({}));

const deliveredAt = new Date("2026-11-05T18:00:00Z");
const setup = { cardSetup: "card-1", customer: "cus_family", price: 79.99 };
const locks = () => memoryBilling({ children: [{ parentId: "p", childId: "c", firstName: "Leah", card: { id: "card-1", customer: "cus_family", saved: true } }] }).store;

/** Stripe's answers to the subscription list in turn, one page each; the last repeats. */
function provider(alreadyStarted = false, pages: unknown[] = [{ data: alreadyStarted ? [{ id: "sub_existing", status: "trialing" }] : [], has_more: false }], customer: unknown = { id: "cus_family", invoice_settings: { default_payment_method: null } }) {
  const requests: { method: string; path: string; body: URLSearchParams; key: string | null; after: string | null }[] = [];
  let reads = 0;
  const client = new Stripe("sk_test_delivery", { maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient(async (input, init) => {
    const url = new URL(String(input)), method = init?.method ?? "GET";
    requests.push({ method, path: url.pathname, body: new URLSearchParams(String(init?.body ?? "")), key: new Headers(init?.headers).get("Idempotency-Key"), after: url.searchParams.get("starting_after") });
    if (url.pathname.endsWith("/subscriptions") && method === "GET" && pages[Math.min(reads, pages.length - 1)] === "fail") return new Response(JSON.stringify({ error: { message: "Stripe down" } }), { status: 500 });
    const data = url.pathname.endsWith("/subscriptions") && method === "GET" ? pages[Math.min(reads++, pages.length - 1)]
      : url.pathname.includes("/customers/") ? customer
      : url.pathname.endsWith("/payment_methods") ? { data: [{ id: "pm_card" }], has_more: false }
      : url.pathname.includes("/products/") ? { id: "unica_math" }
      : url.pathname.endsWith("/subscriptions") && method === "POST" ? { id: "sub_trial", trial_end: deliveredAt.getTime() / 1000 + 30 * 86400 }
      : null;
    if (!data) throw Error("Unexpected Stripe request");
    return new Response(JSON.stringify(data), { status: 200 });
  }) });
  return { client, requests };
}
const ended = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `sub_old_${i}`, status: "canceled" }));

describe("the free month starts after home delivery confirmation", () => {
  it("makes no Stripe request before an admin confirms delivery", async () => {
    const f = provider();
    expect(await startPlan(f.client, { ...setup, deliveryConfirmed: false }, deliveredAt, locks())).toEqual({ ok: false, error: "not_delivered" });
    expect(f.requests).toEqual([]);
  });
  it("starts a full 30-day trial after delivery, with an audit reason and a recorded send key", async () => {
    const f = provider();
    expect(await startPlan(f.client, { ...setup, deliveryConfirmed: true }, deliveredAt, locks())).toEqual({ ok: true, subscription: "sub_trial", firstChargeAt: "2026-12-05T18:00:00.000Z" });
    const create = f.requests.filter((r) => r.path.endsWith("/subscriptions") && r.method === "POST");
    expect(create).toHaveLength(1);
    expect(create[0].body.get("trial_period_days")).toBe("30");
    expect(create[0].body.get("metadata[trial_start_reason]")).toBe("workbook_delivered");
    expect(create[0].body.get("metadata[delivery_confirmed]")).toBe("true");
    expect(create[0].key).toMatch(/^start-plan-card-1-[0-9a-f-]{36}$/);
    expect(create[0].body.get("metadata[start_key]")).toBe(create[0].key);
    expect(f.requests.some((r) => /\/(charges|payment_intents)$/.test(r.path))).toBe(false);
  });
  it("charges the customer's newest card and writes only the plan, for a customer with no default card", async () => {
    const f = provider();
    await startPlan(f.client, { ...setup, deliveryConfirmed: true }, deliveredAt, locks());
    const list = f.requests.filter((r) => r.path.endsWith("/payment_methods"));
    expect(list).toHaveLength(1);
    const writes = f.requests.filter((r) => r.method === "POST");
    expect(writes.map((r) => r.path)).toEqual(["/v1/subscriptions"]);
    expect(writes[0].body.get("default_payment_method")).toBe("pm_card");
  });
  it("charges the customer's default card when a card update set one, and does not read the list", async () => {
    const f = provider(false, undefined, { id: "cus_family", invoice_settings: { default_payment_method: { id: "pm_chosen", type: "card" } } });
    await startPlan(f.client, { ...setup, deliveryConfirmed: true }, deliveredAt, locks());
    expect(f.requests.some((r) => r.path.endsWith("/payment_methods"))).toBe(false);
    expect(f.requests.find((r) => r.path.endsWith("/subscriptions") && r.method === "POST")?.body.get("default_payment_method")).toBe("pm_chosen");
  });
  it.each<[string, unknown]>([
    ["is not a card", { id: "cus_family", invoice_settings: { default_payment_method: { id: "pm_klarna", type: "klarna" } } }],
    ["was deleted", { id: "cus_family", deleted: true }],
  ])("falls back to the newest card when the customer's default %s", async (_case, customer) => {
    const f = provider(false, undefined, customer);
    await startPlan(f.client, { ...setup, deliveryConfirmed: true }, deliveredAt, locks());
    expect(f.requests.find((r) => r.path.endsWith("/subscriptions") && r.method === "POST")?.body.get("default_payment_method")).toBe("pm_card");
  });
  it("does not start another trial for an existing plan", async () => {
    const f = provider(true);
    expect(await startPlan(f.client, { ...setup, deliveryConfirmed: true }, deliveredAt, locks())).toEqual({ ok: false, error: "already" });
    expect(f.requests.some((r) => r.method === "POST")).toBe(false);
  });
  it("does not start another trial for a plan behind a full page of cancelled plans", async () => {
    const f = provider(false, [{ data: ended(100), has_more: true }, { data: [{ id: "sub_running", status: "active" }], has_more: false }]);
    expect(await startPlan(f.client, { ...setup, deliveryConfirmed: true }, deliveredAt, locks())).toEqual({ ok: false, error: "already" });
    expect(f.requests.filter((r) => r.path.endsWith("/subscriptions")).map((r) => r.after)).toEqual([null, "sub_old_99"]);
    expect(f.requests.some((r) => r.method === "POST")).toBe(false);
  });
  it.each<[string, unknown[], string | undefined]>([
    ["a later page fails", [{ data: ended(100), has_more: true }, "fail"], undefined],
    ["the answer does not say whether more pages follow", [{ data: ended(1) }], "pagination unreadable"],
    ["the list does not advance", [{ data: [], has_more: true }], "did not advance"],
    ["the list has more pages than it can read", Array.from({ length: 11 }, (_, page) => ({ data: [{ id: `sub_${page}`, status: "canceled" }], has_more: true })), "Too many subscriptions"],
  ])("starts nothing and throws when %s", async (_case, pages, message) => {
    const f = provider(false, pages);
    await expect(startPlan(f.client, { ...setup, deliveryConfirmed: true }, deliveredAt, locks())).rejects.toThrow(message);
    expect(f.requests.some((r) => r.method === "POST")).toBe(false);
  });
});
