import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { checkFamilyPayments, type FamilyPaymentStore, type PaymentProgress } from "@/lib/assessment";

// The retention worker's Stripe reads (#191). The real Stripe SDK runs against a fake network, so the test checks the
// requests that leave and the facts that come back: every subscription with its status and Stripe's end date.
vi.mock("server-only", () => ({}));
const { readCustomerPayments, verifyRetentionKey } = await import("@/lib/retention-stripe");

type Route = (url: URL) => { status?: number; body: unknown };
function stripeWith(route: Route) {
  const calls: URL[] = [];
  const fetchFn: typeof fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url);
    const answer = route(url);
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200, headers: { "content-type": "application/json" } });
  };
  const s = new Stripe("rk_live_test_only", { maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient(fetchFn) });
  return { s, calls };
}
const list = (data: unknown[], hasMore = false) => ({ object: "list", data, has_more: hasMore, url: "/v1/list" });
const sub = (id: string, customer: string, status: string, endedAt: string | null) =>
  ({ id, object: "subscription", customer, status, livemode: true, ended_at: endedAt === null ? null : Date.parse(endedAt) / 1000 });
const options = () => ({ timeout: 5_000, maxNetworkRetries: 0 });
const forbidden = { status: 403, body: { error: { type: "invalid_request_error", message: "The provided key does not have the required permissions" } } };

describe("Stripe facts for one customer", () => {
  it("reads every subscription page with its status and end date, and finds a saved card", async () => {
    const { s, calls } = stripeWith((url) => {
      if (url.pathname === "/v1/subscriptions") return url.searchParams.get("starting_after") === "sub_new"
        ? { body: list([sub("sub_old", "cus_1", "incomplete_expired", "2021-03-01T00:00:00Z")]) }
        : { body: list([sub("sub_new", "cus_1", "canceled", "2026-04-16T12:00:00Z")], true) };
      if (url.pathname === "/v1/payment_methods") return { body: list([{ id: "pm_1", object: "payment_method", customer: "cus_1" }]) };
      return { body: list([]) };
    });
    expect(await readCustomerPayments(s, "cus_1", options)).toEqual({ savedCard: true, subscriptions: [
      { status: "canceled", endedAt: "2026-04-16T12:00:00.000Z" },
      { status: "incomplete_expired", endedAt: "2021-03-01T00:00:00.000Z" },
    ] });
    const subscriptions = calls.filter((u) => u.pathname === "/v1/subscriptions");
    expect(subscriptions.map((u) => [u.searchParams.get("customer"), u.searchParams.get("status"), u.searchParams.get("starting_after")]))
      .toEqual([["cus_1", "all", null], ["cus_1", "all", "sub_new"]]);
  });

  it("counts a finished Checkout as a saved card, and nothing as no card", async () => {
    const finished = stripeWith((url) => url.pathname === "/v1/checkout/sessions" && url.searchParams.get("status") === "complete"
      ? { body: list([{ id: "cs_1", object: "checkout.session", customer: "cus_1", status: "complete" }]) } : { body: list([]) });
    expect(await readCustomerPayments(finished.s, "cus_1", options)).toEqual({ savedCard: true, subscriptions: [] });
    const nothing = stripeWith(() => ({ body: list([]) }));
    expect(await readCustomerPayments(nothing.s, "cus_1", options)).toEqual({ savedCard: false, subscriptions: [] });
  });

  it("fails when a read is refused, a list belongs to another customer, or paging does not advance", async () => {
    const refused = stripeWith((url) => url.pathname === "/v1/subscriptions" ? forbidden : { body: list([]) });
    await expect(readCustomerPayments(refused.s, "cus_1", options)).rejects.toThrow();
    const foreign = stripeWith((url) => url.pathname === "/v1/subscriptions" ? { body: list([sub("sub_x", "cus_2", "active", null)]) } : { body: list([]) });
    await expect(readCustomerPayments(foreign.s, "cus_1", options)).rejects.toThrow();
    const stuck = stripeWith((url) => url.pathname === "/v1/subscriptions" ? { body: list([], true) } : { body: list([]) });
    await expect(readCustomerPayments(stuck.s, "cus_1", options)).rejects.toThrow();
  });

  describe.each([1, 2])("payment read %i", (invalidRead) => {
    it.each([undefined, null, 0, 1, "", "false", [], {}])("keeps a former customer unknown with invalid subscription pagination %j", async (hasMore) => {
      let paymentReads = 0;
      let progress: PaymentProgress | null = null;
      const mutations: string[] = [];
      const { s } = stripeWith((url) => {
        if (url.pathname !== "/v1/subscriptions") return { body: list([]) };
        if (url.searchParams.has("starting_after")) return { body: list([]) };
        const page = list([sub("sub_old", "cus_1", "canceled", "2020-01-01T00:00:00Z")]);
        return { body: paymentReads === invalidRead ? { ...page, has_more: hasMore } : page };
      });
      const store: FamilyPaymentStore = {
        async pending() { return []; },
        async reconcile() { throw Error("No pending operations"); },
        async current(customer) { paymentReads++; return readCustomerPayments(s, customer, options); },
        async openSessions() { return []; },
        async intents() { return { data: [], more: false }; },
        async progress() { return progress; },
        async saveProgress(_customer, value) { progress = value; },
        async expire(_customer, id) { mutations.push(id); return "clear"; },
        async cancel(_customer, id) { mutations.push(id); return "clear"; },
      };
      expect(await checkFamilyPayments(store, {
        lastTestAt: "2020-01-01T00:00:00Z", cards: [{ customer: "cus_1", saved: true }],
      }, Date.parse("2026-10-16T12:00:00Z"))).toEqual({ action: "unknown" });
      expect(mutations).toEqual([]);
    });
  });

  it.each([undefined, null, "false"])("rejects invalid pagination %j on a later subscription page", async (hasMore) => {
    const { s } = stripeWith((url) => {
      if (url.pathname !== "/v1/subscriptions") return { body: list([]) };
      return { body: url.searchParams.has("starting_after")
        ? { ...list([]), has_more: hasMore }
        : list([sub("sub_old", "cus_1", "canceled", "2020-01-01T00:00:00Z")], true) };
    });
    await expect(readCustomerPayments(s, "cus_1", options)).rejects.toThrow();
  });
});

describe("Stripe key preflight", () => {
  it("proves that the key reads Checkout Sessions and Subscriptions in live mode", async () => {
    const live = stripeWith(() => ({ body: list([sub("sub_1", "cus_1", "active", null)]) }));
    await expect(verifyRetentionKey(live.s)).resolves.toBeUndefined();
    expect(live.calls.map((u) => u.pathname).sort()).toEqual(["/v1/checkout/sessions", "/v1/subscriptions"]);
    const noSubscriptions = stripeWith((url) => url.pathname === "/v1/subscriptions" ? forbidden : { body: list([]) });
    await expect(verifyRetentionKey(noSubscriptions.s)).rejects.toThrow();
    const test = stripeWith(() => ({ body: list([{ ...sub("sub_1", "cus_1", "active", null), livemode: false }]) }));
    await expect(verifyRetentionKey(test.s)).rejects.toThrow();
  });
});
