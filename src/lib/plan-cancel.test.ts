import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { cancelPlan } from "@/lib/stripe";

vi.mock("server-only", () => ({}));

const end = 1_800_000_000;
const plan = (over: Record<string, unknown>) => ({ id: "sub_1", status: "trialing", cancel_at_period_end: false, trial_end: end, items: { data: [{ current_period_end: end }] }, ...over });

/** Stripe with these subscriptions, or with these list answers in turn: one page each, the last repeats. */
function provider(subscriptions: unknown[], pages: unknown[] = [{ data: subscriptions, has_more: false }]) {
  const requests: { method: string; path: string; body: string; after: string | null }[] = [];
  const client = new Stripe("sk_test_cancel", { maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient(async (input, init) => {
    const url = new URL(String(input)), method = init?.method ?? "GET";
    const reads = requests.filter((r) => r.method === "GET").length;
    requests.push({ method, path: url.pathname, body: String(init?.body ?? ""), after: url.searchParams.get("starting_after") });
    if (method !== "GET") return new Response(JSON.stringify({ id: "sub_1" }), { status: 200 });
    const answer = pages[Math.min(reads, pages.length - 1)];
    return answer === "fail" ? new Response(JSON.stringify({ error: { message: "Stripe down" } }), { status: 500 }) : new Response(JSON.stringify(answer), { status: 200 });
  }) });
  return { client, reads: () => requests.filter((r) => r.method === "GET"), writes: () => requests.filter((r) => r.method !== "GET").map(({ method, path, body }) => ({ method, path, body })) };
}
const cancelled = (count: number, from = 0) => Array.from({ length: count }, (_, i) => plan({ id: `sub_old_${from + i}`, status: "canceled" }));

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

describe("the cancel button reads every subscription of the customer", () => {
  it("finds a plan behind a full page of cancelled plans, and stops it", async () => {
    const f = provider([], [{ data: cancelled(100), has_more: true }, { data: [plan({ id: "sub_running" })], has_more: false }]);
    expect(await cancelPlan(f.client, "cus_1")).toEqual({ ok: true, changed: true, endsAt: new Date(end * 1000).toISOString() });
    expect(f.reads().map((r) => r.after)).toEqual([null, "sub_old_99"]);
    expect(f.writes()).toEqual([{ method: "POST", path: "/v1/subscriptions/sub_running", body: "cancel_at_period_end=true" }]);
  });
  it("throws, never no_plan, when a later page fails", async () => {
    const f = provider([], [{ data: cancelled(100), has_more: true }, "fail"]);
    await expect(cancelPlan(f.client, "cus_1")).rejects.toThrow();
    expect(f.writes()).toEqual([]);
  });
  it("throws, never no_plan, when the answer does not say whether more pages follow", async () => {
    const f = provider([], [{ data: cancelled(1) }]);
    await expect(cancelPlan(f.client, "cus_1")).rejects.toThrow("pagination unreadable");
    expect(f.writes()).toEqual([]);
  });
  it("throws, never no_plan, when the list does not advance", async () => {
    const f = provider([], [{ data: [], has_more: true }]);
    await expect(cancelPlan(f.client, "cus_1")).rejects.toThrow("did not advance");
    expect(f.writes()).toEqual([]);
  });
  it("throws, never no_plan, when the list has more pages than it can read", async () => {
    const pages = Array.from({ length: 11 }, (_, i) => ({ data: cancelled(100, i * 100), has_more: true }));
    const f = provider([], pages);
    await expect(cancelPlan(f.client, "cus_1")).rejects.toThrow("Too many subscriptions");
    expect(f.reads()).toHaveLength(10);
    expect(f.writes()).toEqual([]);
  });
});
