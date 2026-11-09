import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { checkOpenCancel } from "@/lib/plan-cancel-admin-server";
vi.mock("server-only", () => ({}));
const NOW = Date.UTC(2026, 10, 9, 12);
function world(plans: unknown[], { failRead = false, fenced = false, recent = false, wrongFamily = false } = {}) {
  const log: string[] = [];
  let open = true;
  const db = createClient<Database>("https://db.invalid", "synthetic", { global: { fetch: async (input, init) => {
    const url = new URL(String(input)), name = url.pathname.split("/").at(-1)!;
    log.push(`${init?.method ?? "GET"} ${name}`);
    if (name === "plan_control_operations") {
      expect(url.searchParams.get("parent_id")).toBe("eq.parent");
      expect(url.searchParams.get("kind")).toBe("eq.cancel"); expect(url.searchParams.get("state")).toBe("eq.open");
      return Response.json(wrongFamily ? null : { id: "operation", parent_id: "parent", card_setup_id: "card", created_at: new Date(NOW - (recent ? 1 : 11) * 60_000).toISOString() });
    }
    if (name === "card_setups") { expect(url.searchParams.get("parent_id")).toBe("eq.parent"); return Response.json({ stripe_customer_id: "cus" }); }
    if (name === "close_plan_cancel") {
      const args = JSON.parse(String(init?.body));
      expect(args.p_parent).toBe("parent"); expect(args.p_id).toBe("operation");
      open = false; return Response.json(true);
    }
    if (fenced) throw Error(`A fenced family must not write ${name}`);
    throw Error(`Unexpected database operation ${name}`);
  } } });
  const stripe = new Stripe("sk_test_synthetic", { httpClient: Stripe.createFetchHttpClient(async (input, init) => {
    const url = new URL(String(input)); log.push(`${init?.method ?? "GET"} ${url.pathname}`);
    expect(init?.method ?? "GET").toBe("GET"); expect(url.searchParams.get("customer")).toBe("cus");
    if (failRead) return Response.json({ error: { type: "invalid_request_error", message: "Cannot read Stripe" } }, { status: 403 });
    return Response.json({ data: plans, has_more: false });
  }) });
  return { check: () => checkOpenCancel(db, stripe, "parent", "operation", NOW), log, isOpen: () => open };
}
for (const plan of [{ status: "canceled" }, { status: "active", cancel_at: 1_900_000_000 }, { status: "active", cancel_at_period_end: true }]) {
  it(`closes as applied when Stripe shows ${JSON.stringify(plan)}`, async () => {
    const w = world([{ id: "sub", ...plan }]);
    expect(await w.check()).toEqual({ ok: true, state: "applied" }); expect(w.isOpen()).toBe(false);
    expect(w.log.indexOf("GET /v1/subscriptions")).toBeLessThan(w.log.indexOf("POST close_plan_cancel"));
  });
}
it("closes as refused for a running plan without a cancellation, including an older cancelled plan", async () => {
  const w = world([{ id: "old", status: "canceled" }, { id: "sub", status: "active", cancel_at: null, cancel_at_period_end: false }]);
  expect(await w.check()).toEqual({ ok: true, state: "refused" }); expect(w.isOpen()).toBe(false);
});
it("closes as refused when admission never reached Stripe and there is no plan", async () => {
  expect(await world([]).check()).toEqual({ ok: true, state: "refused" });
});
it("keeps the operation open when Stripe cannot be read", async () => {
  const w = world([], { failRead: true });
  expect(await w.check()).toEqual({ ok: false, error: "stripe_unavailable" }); expect(w.isOpen()).toBe(true);
  expect(w.log).not.toContain("POST close_plan_cancel");
});
it("closes only the open cancel for a fenced family without card or parent writes", async () => {
  const w = world([{ id: "sub", status: "canceled" }], { fenced: true });
  expect(await w.check()).toEqual({ ok: true, state: "applied" });
  expect(w.log.filter(x => x.startsWith("POST"))).toEqual(["POST close_plan_cancel"]);
});
it("does not close a cancel while the original request can still run", async () => {
  const w = world([{ id: "sub", status: "active" }], { recent: true });
  expect(await w.check()).toEqual({ ok: false, error: "too_soon" }); expect(w.isOpen()).toBe(true);
  expect(w.log).toEqual(["GET plan_control_operations"]);
});
it("cannot close an operation of a different family", async () => {
  const w = world([], { wrongFamily: true });
  expect(await w.check()).toEqual({ ok: false, error: "not_found" });
  expect(w.log).toEqual(["GET plan_control_operations"]);
});
