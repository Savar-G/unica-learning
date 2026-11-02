import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { startPlan } from "@/lib/stripe";

vi.mock("server-only", () => ({}));

const deliveredAt = new Date("2026-11-05T18:00:00Z");
const setup = { cardSetup: "card-1", customer: "cus_family", price: 79.99 };

function provider(alreadyStarted = false) {
  const requests: { method: string; path: string; body: URLSearchParams; key: string | null }[] = [];
  const client = new Stripe("sk_test_delivery", { httpClient: Stripe.createFetchHttpClient(async (input, init) => {
    const url = new URL(String(input)), method = init?.method ?? "GET";
    requests.push({ method, path: url.pathname, body: new URLSearchParams(String(init?.body ?? "")), key: new Headers(init?.headers).get("Idempotency-Key") });
    const data = url.pathname.endsWith("/subscriptions") && method === "GET" ? { data: alreadyStarted ? [{ id: "sub_existing", status: "trialing" }] : [], has_more: false }
      : url.pathname.endsWith("/payment_methods") ? { data: [{ id: "pm_card" }], has_more: false }
      : url.pathname.includes("/products/") ? { id: "unica_math" }
      : url.pathname.endsWith("/subscriptions") && method === "POST" ? { id: "sub_trial", trial_end: deliveredAt.getTime() / 1000 + 30 * 86400 }
      : null;
    if (!data) throw Error("Unexpected Stripe request");
    return new Response(JSON.stringify(data), { status: 200 });
  }) });
  return { client, requests };
}

describe("the free month starts after home delivery confirmation", () => {
  it("makes no Stripe request before an admin confirms delivery", async () => {
    const f = provider();
    expect(await startPlan(f.client, { ...setup, deliveryConfirmed: false }, deliveredAt)).toEqual({ ok: false, error: "not_delivered" });
    expect(f.requests).toEqual([]);
  });
  it("starts a full 30-day trial after delivery, with an audit reason and the existing send key", async () => {
    const f = provider();
    expect(await startPlan(f.client, { ...setup, deliveryConfirmed: true }, deliveredAt)).toEqual({ ok: true, subscription: "sub_trial", firstChargeAt: "2026-12-05T18:00:00.000Z" });
    const create = f.requests.filter((r) => r.path.endsWith("/subscriptions") && r.method === "POST");
    expect(create).toHaveLength(1);
    expect(create[0].body.get("trial_period_days")).toBe("30");
    expect(create[0].body.get("metadata[trial_start_reason]")).toBe("workbook_delivered");
    expect(create[0].body.get("metadata[delivery_confirmed]")).toBe("true");
    expect(create[0].key).toBe("start-plan-card-1");
    expect(f.requests.some((r) => /\/(charges|payment_intents)$/.test(r.path))).toBe(false);
  });
  it("does not start another trial for an existing plan", async () => {
    const f = provider(true);
    expect(await startPlan(f.client, { ...setup, deliveryConfirmed: true }, deliveredAt)).toEqual({ ok: false, error: "already" });
    expect(f.requests.some((r) => r.method === "POST")).toBe(false);
  });
});
