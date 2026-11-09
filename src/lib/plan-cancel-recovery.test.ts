import Stripe from "stripe";
import { beforeEach, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ db: null as unknown, stripe: null as unknown, email: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => f.db }));
vi.mock("@/lib/stripe", async original => ({ ...await original<typeof import("@/lib/stripe")>(), stripe: () => f.stripe }));
vi.mock("@/lib/email-delivery", () => ({ sendEmail: f.email }));
import { cancelFamilyPlan } from "@/lib/parent-plan-server";

function fixture() {
  let open = false, cancelled = false, failRead = false, failWrite = false, failFinish = false, writes = 0;
  let releaseRead: (() => void) | undefined;
  let readGate: Promise<void> | undefined;
  const finishes: string[] = [];
  const client = new Stripe("sk_test_cancel_recovery", { maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient(async (input, init) => {
    const url = new URL(String(input));
    if ((init?.method ?? "GET") === "GET" && url.pathname === "/v1/subscriptions") {
      if (readGate) await readGate;
      if (failRead) throw new Error("read failed");
      return Response.json({ data: [{ id: "sub", status: "active", cancel_at_period_end: cancelled, trial_end: null, items: { data: [{ current_period_end: 1900000000 }] } }], has_more: false });
    }
    if (url.pathname === "/v1/subscriptions/sub") {
      writes++;
      if (failWrite) throw new Error("write response lost");
      cancelled = true;
      return Response.json({ id: "sub", status: "active", cancel_at_period_end: true });
    }
    throw new Error(`unexpected request ${url.pathname}`);
  }) });
  f.stripe = client;
  f.db = {
    from: () => { const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { stripe_customer_id: "cus", child: { first_name: "Iris" } }, error: null }) }; return chain; },
    rpc: async (name: string, args: { p_state?: string }) => {
      if (name === "admit_plan_cancel") { if (open) return { data: null, error: null }; open = true; return { data: "operation", error: null }; }
      if (name === "finish_plan_control") { if (failFinish) return { error: { message: "database down" } }; open = false; finishes.push(args.p_state!); return { error: null }; }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
  return { setRead: (v: boolean) => { failRead = v; }, setWrite: () => { failWrite = true; }, setFinish: (v: boolean) => { failFinish = v; }, isOpen: () => open, writes: () => writes, finishes,
    blockRead: () => { readGate = new Promise<void>(resolve => { releaseRead = resolve; }); }, releaseRead: () => releaseRead?.() };
}
beforeEach(() => { f.email.mockReset().mockResolvedValue({ status: "sent" }); vi.stubEnv("SIGNUP_NOTIFY_EMAIL", "team@example.test"); });

it("releases a read failure and lets the next cancellation succeed", async () => {
  const b = fixture(); b.setRead(true);
  await expect(cancelFamilyPlan("parent", "card")).rejects.toThrow();
  expect(b.isOpen()).toBe(false); expect(b.finishes).toEqual(["refused"]); expect(b.writes()).toBe(0); expect(f.email).not.toHaveBeenCalled();
  b.setRead(false);
  expect(await cancelFamilyPlan("parent", "card")).toMatchObject({ ok: true, changed: true });
  expect(b.writes()).toBe(1); expect(b.isOpen()).toBe(false);
});
it("keeps an uncertain write open and alerts the team", async () => {
  const b = fixture(); b.setWrite();
  await expect(cancelFamilyPlan("parent", "card")).rejects.toThrow();
  expect(b.isOpen()).toBe(true); expect(b.finishes).toEqual([]); expect(b.writes()).toBe(1); expect(f.email).toHaveBeenCalledOnce();
  expect(f.email.mock.calls[0][0].text).toContain("Operation: operation");
  expect(await cancelFamilyPlan("parent", "card")).toEqual({ ok: false, error: "pending" });
});
it("admits only one of two concurrent cancellations", async () => {
  const b = fixture(); b.blockRead();
  const first = cancelFamilyPlan("parent", "card");
  await vi.waitFor(() => expect(b.isOpen()).toBe(true));
  const second = cancelFamilyPlan("parent", "card");
  expect(await second).toEqual({ ok: false, error: "pending" });
  b.releaseRead(); expect(await first).toMatchObject({ ok: true }); expect(b.writes()).toBe(1);
});
it("alerts the team when a read failure cannot be released", async () => {
  const b = fixture(); b.setRead(true); b.setFinish(true);
  await expect(cancelFamilyPlan("parent", "card")).rejects.toThrow();
  expect(b.isOpen()).toBe(true); expect(b.writes()).toBe(0); expect(f.email).toHaveBeenCalledOnce();
  b.setRead(false); b.setFinish(false);
  expect(await cancelFamilyPlan("parent", "card")).toEqual({ ok: false, error: "pending" });
});
