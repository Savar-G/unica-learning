import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { checkCustomerCard, sweepCards, type CardCheckSeams } from "@/lib/card-reconcile";
import { supabaseCardRows } from "@/lib/card-reconcile-server";
import { runFamilyDeletion } from "@/lib/family-deletion-store";
import { endStuckPlanStart } from "@/lib/stripe";
import { stripeCards } from "@/lib/stripe-subscriptions";
import { sendPlanStartAlert } from "@/lib/card-plan-alert";
import { memoryTransport } from "@/lib/email-delivery-memory";

vi.mock("server-only", () => ({}));

const PARENT = "11111111-1111-4111-8111-111111111111";
const CARD = "22222222-2222-4222-8222-222222222222";
const NOW = Date.UTC(2026, 10, 5, 22);

/** The real clients use a synthetic database and provider. Every unexpected write fails. */
function world({ made = false, phase = "checking", cancelFails = false, readFails = false }:
  { made?: boolean; phase?: "checking" | "deleting"; cancelFails?: boolean; readFails?: boolean } = {}) {
  const log: string[] = [];
  const row = {
    card_id: CARD, customer: "cus_recovery", session_id: "cs_new", payment_method_id: "pm_new", needs_repair: true,
    deletion_queued: true, start_generation: 1, start_key: "start-recovery", start_card: "pm_old",
    start_at: new Date(NOW - 25 * 3_600_000).toISOString(), start_state: "open", start_subscription: null as string | null,
    start_first_charge: null as string | null, start_finished_at: null as string | null, start_email: "none", start_alert: null as string | null,
  };
  const plans = made ? [{ id: "sub_recovery", customer: row.customer, status: "trialing", default_payment_method: "pm_old", metadata: { start_key: row.start_key }, trial_end: 1_900_000_000 }] : [];
  const db = createClient("https://database.example.invalid", "synthetic-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const name = url.pathname.startsWith("/rest/v1/rpc/") ? url.pathname.split("/").at(-1)! : `${init?.method ?? "GET"} ${url.pathname}`;
      log.push(name);
      const args = JSON.parse(String(init?.body ?? "{}"));
      switch (name) {
        // The old reader hides the fenced family. The recovery reader admits only its open start.
        case "card_check_rows": return Response.json([]);
        case "card_recovery_rows": return Response.json(row.start_state === "open" ? [{ ...row }] : []);
        case "finish_plan_start":
          row.start_state = args.p_state; row.start_subscription = args.p_subscription;
          row.start_first_charge = args.p_first_charge; row.start_finished_at = new Date(NOW).toISOString();
          row.start_email = args.p_email ? "pending" : "none";
          return Response.json(true);
        case "team_end_plan_start": row.start_state = "team_ended"; row.start_finished_at = new Date(NOW).toISOString(); return Response.json(true);
        case "claim_plan_start_alert": row.start_alert = "sending"; return Response.json(true);
        case "note_plan_start_alert": row.start_alert = args.p_state; return Response.json(true);
        case "claim_family_deletion": return Response.json(row.start_state === "open" ? { state: "plan_start" } : { state: "ready", reason: "request", phase });
        case "family_deletion_start_customers": return Response.json([{ customer: row.customer }]);
        case "pending_family_payment_operations": return Response.json([]);
        case "decide_family_deletion": case "renew_family_deletion": case "confirm_family_copies": case "complete_family_deletion": return Response.json(true);
        case "family_copy_sources": return Response.json([]);
        case "release_family_deletion": return Response.json(null);
        case `DELETE /auth/v1/admin/users/${PARENT}`: return Response.json({});
        default:
          if (name.startsWith("POST /storage/v1/object/list/")) return Response.json([]);
          throw new Error(`Unexpected database write: ${name}`);
      }
    } },
  });
  const client = new Stripe("sk_test_synthetic", { maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    log.push(`${method} ${url.pathname}`);
    if (method === "GET" && url.pathname.startsWith("/v1/customers/")) return Response.json({ id: row.customer, invoice_settings: { default_payment_method: "pm_old" } });
    if (method === "GET" && url.pathname === "/v1/subscriptions") {
      if (readFails) return Response.json({ error: { type: "api_error", message: "Synthetic read failure" } }, { status: 503 });
      return Response.json({ object: "list", has_more: false, data: plans });
    }
    if (method === "DELETE" && url.pathname.startsWith("/v1/subscriptions/")) {
      if (cancelFails) return Response.json({ error: { type: "invalid_request_error", message: "Synthetic cancellation refusal" } }, { status: 400 });
      const plan = plans.find(p => p.id === url.pathname.split("/").at(-1));
      if (!plan) throw new Error("Unknown synthetic subscription");
      plan.status = "canceled";
      return Response.json(plan);
    }
    throw new Error(`Unexpected Stripe write: ${method} ${url.pathname}`);
  }) });
  const rows = supabaseCardRows(db);
  const transport = memoryTransport();
  const announcePlan = vi.fn(async () => ({ status: "sent" as const, emailId: "parent-email" }));
  const seams: CardCheckSeams = {
    rows, stripe: stripeCards(client), canWrite: () => true, announcePlan,
    planEmailClaim: async () => { throw new Error("A fenced family has no parent email"); },
    alertTeam: (r, start) => sendPlanStartAlert(rows, r, start, { to: "team@example.invalid", origin: "https://example.invalid", transport: transport.transport }),
  };
  const remove = () => runFamilyDeletion(db, PARENT, db, Date.now() + 30_000, {
    signal: new AbortController().signal, renewEveryMs: 60_000, paymentRequestTimeoutMs: 100, abortWork() {}, payments: client,
  });
  return { row, rows, client, seams, log, announcePlan, transport, remove, plans };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("keeps a queued deletion open, reads Stripe without card writes, and alerts the team about the queued deletion", async () => {
  const w = world();
  expect(await w.remove()).toEqual({ state: "plan_start" });
  const result = await sweepCards(w.seams, { now: Date.now, startBy: NOW + 30_000 });
  expect(result).toMatchObject({ checked: 1, failed: 0, needsTeam: 1, corrected: 0 });
  expect(w.row.start_state).toBe("open");
  expect(w.log).not.toContain("note_card_checked");
  expect(w.log).not.toContain("settle_card_update");
  expect(w.announcePlan).not.toHaveBeenCalled();
  expect(w.transport.delivered).toHaveLength(1);
  expect(w.transport.delivered[0].text).toContain("deletion is already queued");
});

for (const phase of ["checking", "deleting"] as const) {
  it(`keeps the original start open beside a different subscription in ${phase}, then cancels both after the original lands`, async () => {
    const w = world({ phase });
    w.plans.push({ id: "sub_other", customer: w.row.customer, status: "trialing", default_payment_method: "pm_old", metadata: { start_key: "different-key" }, trial_end: 1_900_000_000 });
    expect(await checkCustomerCard(w.row.customer, w.seams, NOW)).toMatchObject({ plan: "needs_team", wrote: 0, email: "none", failure: null });
    expect(w.row.start_state).toBe("open");
    expect(w.log).not.toContain("finish_plan_start");
    expect(await w.remove()).toEqual({ state: "plan_start" });
    expect(w.plans[0].status).toBe("trialing");
    expect(w.log.some(x => x.includes("/storage/") || x.includes("/auth/"))).toBe(false);

    w.plans.push({ id: "sub_recovery", customer: w.row.customer, status: "trialing", default_payment_method: "pm_old", metadata: { start_key: w.row.start_key }, trial_end: 1_900_000_000 });
    expect(await checkCustomerCard(w.row.customer, w.seams, NOW)).toMatchObject({ plan: "started", wrote: 0, email: "none", failure: null });
    expect(await w.remove()).toEqual({ state: "deleted", images: 0, copies: 0 });
    expect(w.plans.map(p => p.status)).toEqual(["canceled", "canceled"]);
    const auth = w.log.indexOf(`DELETE /auth/v1/admin/users/${PARENT}`);
    for (const plan of w.plans) expect(w.log.indexOf(`DELETE /v1/subscriptions/${plan.id}`)).toBeLessThan(auth);
    expect(w.announcePlan).not.toHaveBeenCalled();
  });

  it(`resolves a created subscription by the webhook, then cancels it before the queued ${phase} phase deletes`, async () => {
    const w = world({ made: true, phase });
    expect(await w.remove()).toEqual({ state: "plan_start" });
    expect(await checkCustomerCard("cus_recovery", w.seams, NOW)).toMatchObject({ plan: "started", wrote: 0, email: "none", failure: null });
    expect(w.row.start_state).toBe("started");
    expect(w.row.start_email).toBe("none");
    expect(w.announcePlan).not.toHaveBeenCalled();
    expect(w.log.filter(x => /^(POST|DELETE) \/v1\//.test(x))).toEqual([]);
    expect(await w.remove()).toEqual({ state: "deleted", images: 0, copies: 0 });
    const cancel = w.log.indexOf("DELETE /v1/subscriptions/sub_recovery");
    const auth = w.log.indexOf(`DELETE /auth/v1/admin/users/${PARENT}`);
    expect(cancel).toBeGreaterThan(-1);
    expect(auth).toBeGreaterThan(cancel);
    expect(w.plans[0].status).toBe("canceled");
  });
}

it("an admin closes a queued start that never created a subscription, then deletion proceeds", async () => {
  const w = world();
  expect(await endStuckPlanStart(w.client, { cardSetup: CARD, customer: "cus_recovery", generation: 1, admin: PARENT }, w.rows)).toEqual({ ok: true });
  expect(w.row.start_state).toBe("team_ended");
  expect(await w.remove()).toEqual({ state: "deleted", images: 0, copies: 0 });
  expect(w.log.filter(x => /^(POST|DELETE) \/v1\//.test(x))).toEqual([]);
});

it("an admin finding only a different subscription leaves the original request unresolved", async () => {
  const w = world();
  w.plans.push({ id: "sub_other", customer: w.row.customer, status: "trialing", default_payment_method: "pm_old", metadata: { start_key: "different-key" }, trial_end: 1_900_000_000 });
  expect(await endStuckPlanStart(w.client, { cardSetup: CARD, customer: w.row.customer, generation: 1, admin: PARENT }, w.rows)).toEqual({ ok: false, error: "already" });
  expect(w.row.start_state).toBe("open");
  expect(await w.remove()).toEqual({ state: "plan_start" });
  expect(w.log).not.toContain("finish_plan_start");
  expect(w.log).not.toContain("team_end_plan_start");
});

it("an admin resolves a queued start that created a subscription without a parent email", async () => {
  const w = world({ made: true });
  expect(await endStuckPlanStart(w.client, { cardSetup: CARD, customer: "cus_recovery", generation: 1, admin: PARENT }, w.rows)).toEqual({ ok: false, error: "landed" });
  expect(w.row.start_state).toBe("started");
  expect(w.row.start_email).toBe("none");
  expect(w.announcePlan).not.toHaveBeenCalled();
});

for (const failure of ["cancel", "read"] as const) {
  it(`keeps a resolved family's data if the ${failure} fails before deletion`, async () => {
    const w = world({ made: true, cancelFails: failure === "cancel", readFails: failure === "read" });
    w.row.start_state = "started";
    await expect(w.remove()).rejects.toThrow();
    expect(w.log.some(x => x.includes("/storage/") || x.includes("/auth/"))).toBe(false);
    expect(w.log).toContain("release_family_deletion");
  });
}
