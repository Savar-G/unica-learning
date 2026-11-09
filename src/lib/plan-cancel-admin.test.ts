import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { checkOpenCancel } from "@/lib/plan-cancel-admin-server";
import { cancelPlan } from "@/lib/stripe";
vi.mock("server-only", () => ({}));
const NOW = Date.UTC(2026, 10, 9, 12);
const END = 1_900_000_000;
const ending = (over: Record<string, unknown> = {}) => ({
  id: "sub", status: "active", cancel_at_period_end: true, cancel_at: END,
  trial_end: END - 100, items: { data: [{ current_period_end: END }] },
  schedule: null, pause_collection: null, ...over,
});
function world(plans: unknown[], { failRead = false, fenced = false, recent = false, wrongFamily = false } = {}) {
  const log: string[] = [];
  let open = true;
  let closedState: string | null = null;
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
      expect(["applied", "refused"]).toContain(args.p_state);
      closedState = args.p_state; open = false; return Response.json(true);
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
  return { check: () => checkOpenCancel(db, stripe, "parent", "operation", NOW), log, isOpen: () => open, closedState: () => closedState };
}
for (const plan of [
  { id: "sub", status: "canceled" },
  ...["active", "trialing"].flatMap(status => [
    ending({ status, trial_end: END, cancel_at: null }),
    ending({ status, trial_end: END }),
    ending({ status, trial_end: END, cancel_at_period_end: false }),
  ]),
]) {
  it(`closes as applied when Stripe shows ${JSON.stringify(plan)}`, async () => {
    const w = world([plan]);
    expect(await w.check()).toEqual({ ok: true, state: "applied" }); expect(w.isOpen()).toBe(false);
    expect(w.closedState()).toBe("applied");
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

it("refuses an active plan that can renew before its later cancel_at", async () => {
  const w = world([{ id: "sub", status: "active", current_period_end: 1_900_000_000,
    items: { data: [{ current_period_end: 1_900_000_000 }] },
    cancel_at: 1_905_000_000, cancel_at_period_end: false }]);
  expect(await w.check()).toEqual({ ok: true, state: "refused" });
  expect(w.isOpen()).toBe(false);
});
it("refuses a past_due plan that still permits collection until period end", async () => {
  const w = world([{ id: "sub", status: "past_due", cancel_at_period_end: true }]);
  expect(await w.check()).toEqual({ ok: true, state: "refused" });
  expect(w.isOpen()).toBe(false);
});

it.each(["trialing", "active", "past_due", "unpaid", "incomplete", "paused"])(
  "accepts the result of the public Cancel command for %s", async status => {
    const before = ending({ status, trial_end: END, cancel_at: null, cancel_at_period_end: false });
    let after = before;
    const writes: string[] = [];
    const stripe = new Stripe("sk_test_cancel_then_recover", { maxNetworkRetries: 0,
      httpClient: Stripe.createFetchHttpClient(async (_input, init) => {
        const method = init?.method ?? "GET";
        if (method === "GET") return Response.json({ data: [before], has_more: false });
        writes.push(method);
        if (method === "DELETE") after = { ...before, status: "canceled" };
        else {
          expect(String(init?.body)).toBe("cancel_at_period_end=true");
          after = { ...before, cancel_at_period_end: true, cancel_at: END };
        }
        return Response.json(after);
      }),
    });
    expect(await cancelPlan(stripe, "cus")).toMatchObject({ ok: true, changed: true });
    expect(writes).toEqual([status === "active" || status === "trialing" ? "POST" : "DELETE"]);
    const w = world([after]);
    expect(await w.check()).toEqual({ ok: true, state: "applied" });
    expect(w.closedState()).toBe("applied");
  },
);
it.each(["past_due", "unpaid", "incomplete", "paused", "new_status"])(
  "refuses %s even with an exact future cancellation and period-end flag", async status => {
    const w = world([ending({ status })]);
    expect(await w.check()).toEqual({ ok: true, state: "refused" });
    expect(w.closedState()).toBe("refused");
  },
);
it.each([END - 100, END + 100])("refuses a conflicting cancel_at %s even with the period-end flag", async cancel_at => {
  expect(await world([ending({ cancel_at })]).check()).toEqual({ ok: true, state: "refused" });
});
it("uses the trial end rather than the paid period end for a free month", async () => {
  const trial = ending({ status: "trialing", trial_end: END + 100 });
  expect(await world([trial]).check()).toEqual({ ok: true, state: "refused" });
  expect(await world([{ ...trial, cancel_at: END + 100 }]).check()).toEqual({ ok: true, state: "applied" });
});
it("uses the paid period end rather than the old trial end for an active month", async () => {
  expect(await world([ending()]).check()).toEqual({ ok: true, state: "applied" });
  expect(await world([ending({ cancel_at: END - 100 })]).check()).toEqual({ ok: true, state: "refused" });
});
it("refuses a period-end flag without a readable promised end", async () => {
  expect(await world([ending({ items: { data: [] }, cancel_at: null })]).check()).toEqual({ ok: true, state: "refused" });
});
it.each([
  "schedule",
  { id: "schedule", status: "active", pause_schedules: [{
    pause: { pause_at: END, status: { type: "scheduled" } },
    resume: { resume_at: END + 604_800, status: { type: "scheduled" } },
  }] },
])("refuses a controlling schedule or scheduled pause until Cancel releases it: %j", async schedule => {
  const w = world([ending({ schedule })]);
  expect(await w.check()).toEqual({ ok: true, state: "refused" });
  expect(w.closedState()).toBe("refused");
  expect(w.log.filter(x => x.startsWith("POST"))).toEqual(["POST close_plan_cancel"]);
});
it("refuses a collection pause that can resume after the promised end", async () => {
  const w = world([ending({ pause_collection: { behavior: "void", resumes_at: END + 604_800 } })]);
  expect(await w.check()).toEqual({ ok: true, state: "refused" });
});
it.each([false, true])("requires both running subscriptions to meet Cancel, second cancelled: %s", async cancelled => {
  const w = world([ending(), ending({ id: "sub_2", cancel_at_period_end: cancelled,
    cancel_at: cancelled ? END + 100 : END + 200,
    items: { data: [{ current_period_end: END + 100 }] } })]);
  const state = cancelled ? "applied" : "refused";
  expect(await w.check()).toEqual({ ok: true, state });
  expect(w.closedState()).toBe(state);
});
