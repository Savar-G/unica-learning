import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { cancelPlan } from "@/lib/stripe";

vi.mock("server-only", () => ({}));

const end = 1_800_000_000;
const plan = (over: Record<string, unknown>) => ({ id: "sub_1", status: "trialing", cancel_at_period_end: false, trial_end: end, items: { data: [{ current_period_end: end }] }, ...over });

function provider(subscriptions: unknown[]) {
  const requests: { method: string; path: string; body: string }[] = [];
  const client = new Stripe("sk_test_cancel", { httpClient: Stripe.createFetchHttpClient(async (input, init) => {
    const url = new URL(String(input)), method = init?.method ?? "GET";
    requests.push({ method, path: url.pathname, body: String(init?.body ?? "") });
    const data = method === "GET" ? { data: subscriptions, has_more: false } : { id: "sub_1" };
    return new Response(JSON.stringify(data), { status: 200 });
  }) });
  return { client, writes: () => requests.filter((r) => r.method !== "GET") };
}

describe("the parent's cancel button", () => {
  it("stops a free month at its end, so the first charge never happens", async () => {
    const f = provider([plan({})]);
    expect(await cancelPlan(f.client, "cus_1")).toEqual({ ok: true, changed: true, endsAt: new Date(end * 1000).toISOString() });
    expect(f.writes()).toEqual([{ method: "POST", path: "/v1/subscriptions/sub_1", body: "cancel_at_period_end=true" }]);
  });
  it("stops a paid plan at the end of the paid month, not at the old trial end", async () => {
    const f = provider([plan({ status: "active", trial_end: 1, items: { data: [{ current_period_end: end + 100 }] } })]);
    expect(await cancelPlan(f.client, "cus_1")).toMatchObject({ ok: true, endsAt: new Date((end + 100) * 1000).toISOString() });
    expect(f.writes()[0].body).toBe("cancel_at_period_end=true");
  });
  it.each(["past_due", "unpaid", "paused", "incomplete"])("ends a plan in %s now, so Stripe does not try the card again", async (status) => {
    const f = provider([plan({ status })]);
    expect(await cancelPlan(f.client, "cus_1")).toEqual({ ok: true, changed: true, endsAt: null });
    expect(f.writes()).toEqual([{ method: "DELETE", path: "/v1/subscriptions/sub_1", body: "" }]);
  });
  it("changes nothing on a second press", async () => {
    const f = provider([plan({ cancel_at_period_end: true })]);
    expect(await cancelPlan(f.client, "cus_1")).toMatchObject({ ok: true, changed: false });
    expect(f.writes()).toEqual([]);
  });
  it.each([[[]], [[plan({ status: "canceled" })]], [[plan({ status: "incomplete_expired" })]]])("answers no_plan when no plan can charge the card", async (subscriptions) => {
    const f = provider(subscriptions);
    expect(await cancelPlan(f.client, "cus_1")).toEqual({ ok: false, error: "no_plan" });
    expect(f.writes()).toEqual([]);
  });
});
