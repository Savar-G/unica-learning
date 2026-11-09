import Stripe from "stripe";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { memoryBilling, type MemoryBillingChild } from "@/lib/billing-memory";
import { PLAN_ANSWER_MS, PLAN_KEY_MS, checkCustomerCard, type CardCheckSeams } from "@/lib/card-reconcile";
import { requestFamilyDelete, DELETE_WORD } from "@/lib/family-delete";
import { memoryDeleteStore, memoryFamily, memoryPlans, type MemoryFamily } from "@/lib/family-delete-memory";
import { stripeCards } from "@/lib/stripe-subscriptions";

// Review round 5 of PR #593, finding 1. The start route lets go of the family's card hold after startPlan answers "unconfirmed", and
// Stripe's create can still land. These tests run the real start route, the real startPlan and the real Stripe SDK over a request
// that is lost and lands when the test says so, then the real deletion core. The return path is what a timeout takes: nothing throws.
// The stores are the memory stores, with the rules of the database functions; supabase/tests/plan_start_holds_deletion.sql proves
// those rules on the database.

const h = vi.hoisted(() => ({ rows: null as unknown, client: null as unknown, service: null as unknown, session: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-store", () => ({ adminSession: async () => h.session }));
vi.mock("@/lib/card-reconcile-server", async (original) => ({ ...(await original<typeof import("@/lib/card-reconcile-server")>()), liveCardRows: () => h.rows }));
vi.mock("@/lib/stripe", async (original) => ({ ...(await original<typeof import("@/lib/stripe")>()), stripe: () => h.client }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => h.service }));
vi.mock("@/lib/workbook-delivery-store", () => ({ workbookDeliveryStore: () => ({ receipt: async () => ({ workbookId: CARD, childId: "c1", parentId: PARENT, number: 1 }) }) }));
vi.mock("@/lib/workbook-store", () => ({ workbookStore: () => ({ childWorkbooks: async () => [{ id: CARD, childId: "c1", parentId: PARENT, number: 1, status: "shipped" }] }) }));
vi.mock("@/lib/workbook-email-server", () => ({ sendPlanStartEmail: vi.fn(async () => ({ status: "sent", emailId: "email-1" })) }));
import { POST } from "@/app/api/admin/cards/[id]/start/route";
import { endStuckPlanStart } from "@/lib/stripe";

const CARD = "00000000-0000-4000-8000-000000000001";
const PARENT = "11111111-1111-4111-8111-111111111111";
const child: MemoryBillingChild = { parentId: PARENT, childId: "c1", firstName: "Leah", card: { id: CARD, customer: "cus_1", saved: true } };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const NOW = 5_000_000_000;

/** One customer behind the real SDK. A create has no answer, and stays out there until `land()`. */
function stripeFake(family: MemoryFamily, { noCreate = false, refused = false, permissionRefused = false } = {}) {
  const plans: Record<string, unknown>[] = [];
  const out: (() => void)[] = [];
  const client = new Stripe("sk_test_synthetic", { maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (url.pathname === "/v1/prices") return Response.json({data:[{id:"price_7999",active:true,currency:"cad",product:"unica_math",unit_amount:7999,recurring:{interval:"month",interval_count:1,usage_type:"licensed"}}],has_more:false});
    if (url.pathname.startsWith("/v1/products/")) return json({ id: "unica_math" });
    if (method === "GET" && url.pathname === "/v1/subscriptions") return json({ object: "list", has_more: false, data: plans });
    if (method === "GET" && url.pathname.startsWith("/v1/customers/")) return json({ id: "cus_1", invoice_settings: { default_payment_method: { id: "pm_1", type: "card" } } });
    if (method === "POST" && url.pathname === "/v1/subscriptions") {
      if (permissionRefused) return Response.json({ error: { type: "invalid_request_error", message: "Raw provider permission error" } }, { status: 403 });
      if (refused) return Response.json({ error: { type: "card_error", code: "card_declined", message: "Raw provider refusal" } }, { status: 402 });
      const key = new Headers(init?.headers).get("Idempotency-Key");
      if (!noCreate) out.push(() => {
        plans.push({ id: "sub_late", status: "trialing", default_payment_method: "pm_1", metadata: { start_key: key }, trial_end: 1_900_000_000 });
        (family.plans.cus_1 ??= []).push("sub_late");
      });
      throw new Error("Synthetic connection lost");
    }
    throw new Error(`Unexpected ${method} ${url.pathname}`);
  }) });
  return { client, land: () => { for (const landing of out.splice(0)) landing(); } };
}

function world({ noCreate = false, refused = false, permissionRefused = false } = {}) {
  const billing = memoryBilling({ children: [child] });
  const family = memoryFamily({ openPlanStart: () => billing.planStarts.get(CARD)?.at(-1)?.state === "open" });
  const stripe = stripeFake(family, { noCreate, refused, permissionRefused });
  h.rows = billing.store;
  h.client = stripe.client;
  // The card hold's two database functions, with their rules.
  h.service = { rpc: async (name: string) => {
    if (name === "begin_family_card_operation") {
      if (family.fenced) return { error: { code: "55000" } };
      family.holds += 1;
      return { error: null };
    }
    if (name === "end_family_card_operation") { family.holds -= 1; return { error: null }; }
    throw new Error(`Unexpected rpc ${name}`);
  } };
  const select = { select: () => select, eq: () => select, maybeSingle: async () => ({ data: { id: CARD, child_id: "c1", parent_id: PARENT, card_saved_at: "2026-10-01", stripe_customer_id: "cus_1", price: 79.99, plan: "one" }, error: null }) };
  h.session = { db: { rpc: () => select } };
  const press = () => POST(new Request(`https://example.test/api/admin/cards/${CARD}/start`, { method: "POST", headers: { origin: "https://example.test", "content-type": "application/json" }, body: JSON.stringify({ deliveryConfirmed: true }) }), { params: Promise.resolve({ id: CARD }) } as never);
  const remove = () => requestFamilyDelete(PARENT, { code: "123456", confirm: DELETE_WORD }, async () => "ok", { store: memoryDeleteStore(family), plans: memoryPlans(family) });
  const seams: CardCheckSeams = {
    rows: billing.store, stripe: stripeCards(stripe.client), canWrite: () => true,
    announcePlan: async () => ({ status: "sent", emailId: "email-1" }), planEmailClaim: async () => "sent", alertTeam: async () => ({ status: "sent", emailId: "alert-1" }),
  };
  return { billing, family, stripe, press, remove, seams };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("a start that answered unconfirmed lets go of the card hold, and the record then refuses the family's deletion", async () => {
  const w = world();
  const pressed = await w.press();
  expect(pressed.status).toBe(409);
  expect(await pressed.json()).toEqual({ ok: false, error: "unconfirmed" });
  expect(w.family.holds).toBe(0);
  expect(w.billing.planStarts.get(CARD)?.at(-1)?.state).toBe("open");

  expect(await w.remove()).toEqual({ ok: false, error: "plan_start", plansStopped: 0 });
  expect(w.family.fenced).toBe(false);

  // The reviewer's sequence: Stripe finishes after the parent asked, and the plan must not outlive the family.
  w.stripe.land();
  vi.setSystemTime(NOW + PLAN_ANSWER_MS + 1000);
  await checkCustomerCard("cus_1", w.seams, Date.now());
  expect(w.billing.planStarts.get(CARD)?.at(-1)?.state).toBe("started");

  expect(await w.remove()).toEqual({ ok: true, plansStopped: 1 });
  expect(w.family.plans.cus_1).toEqual([]);
  expect(w.family.fenced).toBe(true);
});

it("stays refused while the record stays open, however old it is, until an admin closes it", async () => {
  const w = world({ noCreate: true });
  await w.press();
  vi.setSystemTime(NOW + PLAN_KEY_MS + 3_600_000);
  await checkCustomerCard("cus_1", w.seams, Date.now());
  expect(await w.remove()).toEqual({ ok: false, error: "plan_start", plansStopped: 0 });

  expect(await endStuckPlanStart(w.stripe.client, { cardSetup: CARD, customer: "cus_1", generation: 1, admin: "admin-1" }, w.billing.store)).toEqual({ ok: true });
  expect(await w.remove()).toEqual({ ok: true, plansStopped: 0 });
  expect(w.family.fenced).toBe(true);
});

it("changes nothing for a family that never reached a start", async () => {
  const w = world();
  expect(await w.remove()).toEqual({ ok: true, plansStopped: 0 });
  expect(w.family.fenced).toBe(true);
});

it("a refused initial start closes its record and releases the route hold, so deletion can proceed", async () => {
  const w = world({ refused: true });
  const response = await w.press();
  expect(w.billing.planStarts.get(CARD)?.at(-1)?.state).toBe("refused");
  expect(w.family.holds).toBe(0);
  expect(await response.json()).toEqual({ ok: false, error: "payment_refused" });
  expect(await w.remove()).toEqual({ ok: true, plansStopped: 0 });
});

it("keeps an open start when saving the refusal fails, but releases the route hold", async () => {
  const w = world({ refused: true });
  h.rows = { ...w.billing.store, finishPlanStart: async () => { throw new Error("Synthetic save failure"); } };
  const response = await w.press();
  expect(w.billing.planStarts.get(CARD)?.at(-1)?.state).toBe("open");
  expect(w.family.holds).toBe(0);
  expect(await response.json()).toEqual({ ok: false, error: "unconfirmed" });
  expect(await w.remove()).toEqual({ ok: false, error: "plan_start", plansStopped: 0 });
});

it("does not describe a Stripe permission error as a refused card, and still releases the route hold", async () => {
  const w = world({ permissionRefused: true });
  const response = await w.press();
  expect(w.billing.planStarts.get(CARD)?.at(-1)?.state).toBe("refused");
  expect(w.family.holds).toBe(0);
  expect(await response.json()).toEqual({ ok: false, error: "failed" });
});
