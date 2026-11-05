import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finishCardUpdate, type CardUpdates } from "@/lib/billing";
import { memoryBilling, type MemoryBillingChild, type MemorySubscription } from "@/lib/billing-memory";
import { stripeBillingProvider } from "@/lib/billing-server";
import { CARD_WATCH_MS, PLAN_ANSWER_MS, PLAN_KEY_MS, PLAN_RETRY_MS, checkCustomerCard, sweepCards, type CardCheckSeams } from "@/lib/card-reconcile";
import { startPlan } from "@/lib/stripe";
import { stripeCards } from "@/lib/stripe-subscriptions";

vi.mock("server-only", () => ({}));

// Review round 3 of PR #593. A client timeout leaves a Stripe request's outcome unknown, and the request can land later. The first
// two groups are the review's two reproductions through the real Stripe SDK: a request that is lost, and that lands when the test
// says so. The store is the memory store, with the rules of the database functions.

const child: MemoryBillingChild = { parentId: "p1", childId: "c1", firstName: "Leah", card: { id: "card-1", customer: "cus_1", saved: true } };
const session = (id: string, created: number, method: string) => ({
  id, mode: "setup", status: "complete", created, customer: "cus_1", metadata: { source: "card_update", ref: "card-1" },
  setup_intent: { status: "succeeded", customer: "cus_1", payment_method: method },
});
const SESSIONS = { cs_test_a: session("cs_test_a", 100, "pm_a"), cs_test_b: session("cs_test_b", 200, "pm_b") };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const NOW = 5_000_000_000;

type StripeWrite = { kind: "customer" | "subscription"; card: string; subscription?: string } | { kind: "create"; card: string; key: string };

/**
 * One customer behind the real SDK. A write that `lose` matches has no answer: the SDK throws, and the write stays out there until
 * `land()`. Each subscription change that lands raises an event, as Stripe does; a write to the Customer raises none we listen to.
 * The same key always answers the same subscription, as Stripe's idempotency does, until `forgetKeys()`.
 */
function stripeFake({ customerDefault = "pm_old", plans = [] as string[], lose, refuse }: { customerDefault?: string; plans?: string[]; lose?: (write: StripeWrite) => boolean; refuse?: (write: StripeWrite) => boolean } = {}) {
  const state = { customerDefault, plans: Object.fromEntries(plans.map((id) => [id, { default: "pm_old", status: "active", startKey: null as string | null }])) };
  const events: { type: string; customer: string }[] = [];
  const log: StripeWrite[] = [];
  const out: (() => void)[] = [];
  const byKey = new Map<string, string>();
  let count = 0;
  const makePlan = (card: string, key: string) => {
    const known = byKey.get(key);
    if (known) return known;
    const id = `sub_made_${++count}`;
    byKey.set(key, id);
    state.plans[id] = { default: card, status: "trialing", startKey: key };
    events.push({ type: "customer.subscription.created", customer: "cus_1" });
    return id;
  };
  const planBody = (id: string) => ({ id, status: state.plans[id].status, default_payment_method: state.plans[id].default, metadata: state.plans[id].startKey ? { start_key: state.plans[id].startKey } : {}, trial_end: 1_900_000_000 });
  const client = new Stripe("sk_test_synthetic", { maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = new URLSearchParams(String(init?.body ?? ""));
    const id = url.pathname.split("/").at(-1)!;
    if (url.pathname.startsWith("/v1/checkout/sessions/")) return json(SESSIONS[id as keyof typeof SESSIONS]);
    if (url.pathname.startsWith("/v1/products/")) return json({ id: "unica_math" });
    if (method === "GET" && url.pathname === "/v1/subscriptions") return json({ object: "list", has_more: false, data: Object.keys(state.plans).map(planBody) });
    if (method === "GET" && url.pathname.startsWith("/v1/customers/")) return json({ id, invoice_settings: { default_payment_method: url.search.includes("expand") ? { id: state.customerDefault, type: "card" } : state.customerDefault } });
    if (method !== "POST") throw new Error(`Unexpected ${method} ${url.pathname}`);
    let write: StripeWrite;
    let land: () => Response;
    if (url.pathname.startsWith("/v1/customers/")) {
      const card = body.get("invoice_settings[default_payment_method]")!;
      write = { kind: "customer", card };
      land = () => { state.customerDefault = card; return json({ id }); };
    } else if (url.pathname === "/v1/subscriptions") {
      const card = body.get("default_payment_method")!;
      const key = new Headers(init?.headers).get("Idempotency-Key")!;
      write = { kind: "create", card, key };
      land = () => json(planBody(makePlan(card, key)));
    } else if (url.pathname.startsWith("/v1/subscriptions/")) {
      const card = body.get("default_payment_method")!;
      write = { kind: "subscription", card, subscription: id };
      land = () => {
        state.plans[id].default = card;
        events.push({ type: "customer.subscription.updated", customer: "cus_1" });
        return json(planBody(id));
      };
    } else throw new Error(`Unexpected POST ${url.pathname}`);
    log.push(write);
    if (refuse?.(write)) return json({ error: { type: "invalid_request_error", message: "Synthetic refusal" } }, 400);
    if (lose?.(write)) {
      out.push(() => { land(); });
      throw new Error("Synthetic connection lost");
    }
    return land();
  }) });
  return {
    client, state, events, log,
    writes: () => log.filter((w) => w.kind !== "create").length,
    creates: () => log.filter((w) => w.kind === "create"),
    /** Every write still out there lands now, in order. */
    land: () => { for (const write of out.splice(0)) write(); },
    forgetKeys: () => byKey.clear(),
  };
}

function family({ stripe = stripeFake(), children = [child] }: { stripe?: ReturnType<typeof stripeFake>; children?: MemoryBillingChild[] } = {}) {
  const b = memoryBilling({ children });
  const announced: string[] = [];
  const seams: CardCheckSeams = {
    rows: b.store, stripe: stripeCards(stripe.client), canWrite: () => true,
    announcePlan: async (_row, plan) => { announced.push(plan.id); },
  };
  const updates: CardUpdates = { store: b.store, provider: stripeBillingProvider(stripe.client) };
  /** Stripe delivers every event raised so far, including those that a delivery raises. */
  const deliver = async () => {
    let delivered = 0;
    while (stripe.events.length > 0) {
      const event = stripe.events.shift()!;
      delivered++;
      await checkCustomerCard(event.customer, seams, Date.now());
      if (delivered > 20) throw new Error("The events never end");
    }
    return delivered;
  };
  const sweep = () => sweepCards(seams, { now: () => Date.now(), startBy: Date.now() + 25_000 });
  const start = () => startPlan(stripe.client, { cardSetup: "card-1", customer: "cus_1", price: 79.99, deliveryConfirmed: true }, undefined, b.store);
  return { b, stripe, seams, updates, announced, deliver, sweep, start };
}
const dropEvents = (f: ReturnType<typeof family>) => f.stripe.events.splice(0);
const later = (ms: number) => vi.setSystemTime(Date.now() + ms);
const row = (f: ReturnType<typeof family>) => f.b.updates.get("c1")!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("an older card's write lands late (the review's first case)", () => {
  /** A's Customer write is lost. B then finishes, and answers updated. Then A's write lands. */
  const customerLandsLate = async () => {
    const f = family({ stripe: stripeFake({ plans: ["sub_1"], lose: (w) => w.kind === "customer" && w.card === "pm_a" }) });
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("unconfirmed");
    expect(row(f)).toMatchObject({ sessionId: "cs_test_a", needsRepair: true });
    expect(await finishCardUpdate("p1", "cs_test_b", f.updates)).toBe("updated");
    expect(f.stripe.state.customerDefault).toBe("pm_b");
    expect(row(f)).toMatchObject({ sessionId: "cs_test_b", needsRepair: false });
    f.stripe.land();
    expect(f.stripe.state.customerDefault).toBe("pm_a");
    expect(f.stripe.state.plans.sub_1.default).toBe("pm_b");
    return f;
  };

  it("leaves no return able to bring the older card back, and neither address opened again says more", async () => {
    const f = await customerLandsLate();
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("stale");
    expect(await finishCardUpdate("p1", "cs_test_b", f.updates)).toBe("stale");
  });

  it("is corrected by the sweep, as the Customer's write raises no event we listen to", async () => {
    const f = await customerLandsLate();
    dropEvents(f);
    expect(await f.sweep()).toMatchObject({ checked: 1, corrected: 1, failed: 0 });
    expect(f.stripe.state.customerDefault).toBe("pm_b");
    expect(f.stripe.state.plans.sub_1.default).toBe("pm_b");
    expect(row(f)).toMatchObject({ needsRepair: false });
  });

  it("is corrected by the next subscription event too", async () => {
    const f = await customerLandsLate();
    dropEvents(f);
    f.stripe.events.push({ type: "customer.subscription.updated", customer: "cus_1" });
    await f.deliver();
    expect(f.stripe.state.customerDefault).toBe("pm_b");
  });

  /** A's plan write is lost, then B finishes, then A's write lands, so the plan would charge the older card. */
  const planLandsLate = async () => {
    const f = family({ stripe: stripeFake({ plans: ["sub_1"], lose: (w) => w.kind === "subscription" && w.card === "pm_a" }) });
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("unconfirmed");
    expect(await finishCardUpdate("p1", "cs_test_b", f.updates)).toBe("updated");
    dropEvents(f);
    f.stripe.land();
    expect(f.stripe.state.plans.sub_1.default).toBe("pm_a");
    return f;
  };

  it("is corrected by the webhook when the plan's write lands late, and the correction's own event changes nothing", async () => {
    const f = await planLandsLate();
    const before = f.stripe.writes();
    // The late write's event, then the correction's event.
    expect(await f.deliver()).toBe(2);
    expect(f.stripe.state.plans.sub_1.default).toBe("pm_b");
    expect(f.stripe.state.customerDefault).toBe("pm_b");
    expect(f.stripe.writes()).toBe(before + 1);
    expect(row(f)).toMatchObject({ needsRepair: false });
  });

  it("is corrected by the sweep when the event never arrives, and the next sweep writes nothing", async () => {
    const f = await planLandsLate();
    dropEvents(f);
    expect(await f.sweep()).toMatchObject({ corrected: 1, failed: 0 });
    expect(f.stripe.state.plans.sub_1.default).toBe("pm_b");
    const writes = f.stripe.writes();
    expect(await f.sweep()).toMatchObject({ checked: 1, corrected: 0, failed: 0 });
    expect(f.stripe.writes()).toBe(writes);
  });

  it("answers updated to a write that Stripe confirmed, and unconfirmed only to one whose outcome is unknown", async () => {
    const lost = family({ stripe: stripeFake({ lose: (w) => w.kind === "customer" }) });
    expect(await finishCardUpdate("p1", "cs_test_b", lost.updates)).toBe("unconfirmed");
    const refused = family({ stripe: stripeFake({ refuse: (w) => w.kind === "customer" }) });
    expect(await finishCardUpdate("p1", "cs_test_b", refused.updates)).toBe("failed");
    const fine = family();
    expect(await finishCardUpdate("p1", "cs_test_b", fine.updates)).toBe("updated");
  });
});

describe("a plan creation lands late (the review's second case)", () => {
  /** The creation is lost, with the old card. B then updates the card, and answers updated. Then the creation lands. */
  const creationLandsLate = async () => {
    const f = family({ stripe: stripeFake({ lose: (w) => w.kind === "create" }) });
    expect(await f.start()).toEqual({ ok: false, error: "unconfirmed" });
    expect(row(f)).toMatchObject({ pendingCard: "pm_old", pendingKey: expect.stringMatching(/^start-plan-card-1-/) });
    expect(await finishCardUpdate("p1", "cs_test_b", f.updates)).toBe("updated");
    expect(f.stripe.state.customerDefault).toBe("pm_b");
    expect(row(f)).toMatchObject({ needsRepair: false, pendingCard: "pm_old" });
    f.stripe.land();
    expect(Object.values(f.stripe.state.plans).map((p) => p.default)).toEqual(["pm_old"]);
    return f;
  };
  const plans = (f: ReturnType<typeof family>) => Object.values(f.stripe.state.plans);

  it("is resolved by the webhook: the plan moves to the newest card, the record ends and the parent hears once", async () => {
    const f = await creationLandsLate();
    later(PLAN_ANSWER_MS + 1);
    // The creation's event, then the correction's event.
    expect(await f.deliver()).toBe(2);
    expect(plans(f).map((p) => p.default)).toEqual(["pm_b"]);
    expect(row(f)).toMatchObject({ needsRepair: false, pendingKey: null });
    expect(f.announced).toEqual(["sub_made_1"]);
  });

  it("corrects the card at once, and leaves the record while the start may still be answering for itself", async () => {
    const f = await creationLandsLate();
    await f.deliver();
    expect(plans(f).map((p) => p.default)).toEqual(["pm_b"]);
    expect(row(f).pendingKey).not.toBeNull();
    expect(f.announced).toEqual([]);
    later(PLAN_ANSWER_MS + 1);
    expect(await f.sweep()).toMatchObject({ plans: 1, failed: 0 });
    expect(row(f).pendingKey).toBeNull();
    expect(f.announced).toEqual(["sub_made_1"]);
  });

  it("is resolved by the sweep when the event never arrives", async () => {
    const f = await creationLandsLate();
    dropEvents(f);
    later(PLAN_ANSWER_MS + 1);
    expect(await f.sweep()).toMatchObject({ corrected: 1, plans: 1, failed: 0 });
    expect(plans(f).map((p) => p.default)).toEqual(["pm_b"]);
    expect(row(f).pendingKey).toBeNull();
    expect(f.announced).toEqual(["sub_made_1"]);
  });

  it("keeps the record when the parent cannot be told, and the next sweep tells them", async () => {
    const f = await creationLandsLate();
    dropEvents(f);
    later(PLAN_ANSWER_MS + 1);
    f.seams.announcePlan = async () => { throw new Error("Email down"); };
    expect(await f.sweep()).toMatchObject({ plans: 0, failed: 1 });
    expect(row(f).pendingKey).not.toBeNull();
    f.seams.announcePlan = async (_row, plan) => { f.announced.push(plan.id); };
    expect(await f.sweep()).toMatchObject({ plans: 1, failed: 0 });
    expect(f.announced).toEqual(["sub_made_1"]);
  });

  it("before 24 hours: a sweep that finds nothing keeps the record, and a retry sends the same key and the same card", async () => {
    let lost = true;
    const f = family({ stripe: stripeFake({ lose: (w) => w.kind === "create" && lost }) });
    expect(await f.start()).toEqual({ ok: false, error: "unconfirmed" });
    const first = row(f).pendingKey;
    later(PLAN_RETRY_MS - 1000);
    expect(await f.sweep()).toMatchObject({ plans: 0, failed: 0 });
    expect(row(f).pendingKey).toBe(first);
    // The parent changes the card meanwhile. The retry still sends the first card, as Stripe refuses a key with other fields, and the plan is then corrected.
    expect(await finishCardUpdate("p1", "cs_test_b", f.updates)).toBe("updated");
    lost = false;
    expect((await f.start()).ok).toBe(true);
    const creates = f.stripe.creates();
    expect(creates).toHaveLength(2);
    expect(creates[1]).toEqual(creates[0]);
    expect(creates[0]).toMatchObject({ card: "pm_old" });
    expect(plans(f).map((p) => p.default)).toEqual(["pm_b"]);
    expect(row(f).pendingKey).toBeNull();
    expect(await f.start()).toEqual({ ok: false, error: "already" });
    expect(f.stripe.creates()).toHaveLength(2);
  });

  it("before 24 hours: a retry after the creation landed answers that plan's start and creates nothing, so the route can send the email", async () => {
    const f = await creationLandsLate();
    dropEvents(f);
    const answer = await f.start();
    expect(answer).toEqual({ ok: true, subscription: "sub_made_1", firstChargeAt: new Date(1_900_000_000_000).toISOString() });
    expect(f.stripe.creates()).toHaveLength(1);
    expect(plans(f).map((p) => p.default)).toEqual(["pm_b"]);
    expect(row(f).pendingKey).toBeNull();
    expect(await f.start()).toEqual({ ok: false, error: "already" });
  });

  it("near the key's end: a press neither retries nor starts anew", async () => {
    const f = family({ stripe: stripeFake({ lose: (w) => w.kind === "create" }) });
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("updated");
    expect(await f.start()).toEqual({ ok: false, error: "unconfirmed" });
    later(PLAN_RETRY_MS);
    expect(await f.start()).toEqual({ ok: false, error: "unconfirmed" });
    expect(f.stripe.creates()).toHaveLength(1);
  });

  it("after 24 hours: the sweep finds the plan by listing, corrects it, and the admin cannot start a second one", async () => {
    const f = await creationLandsLate();
    dropEvents(f);
    f.stripe.forgetKeys();
    later(PLAN_KEY_MS + 1);
    expect(await f.sweep()).toMatchObject({ plans: 1, failed: 0 });
    expect(plans(f).map((p) => p.default)).toEqual(["pm_b"]);
    expect(row(f).pendingKey).toBeNull();
    expect(await f.start()).toEqual({ ok: false, error: "already" });
    expect(f.stripe.creates()).toHaveLength(1);
  });

  it("after 24 hours: with no plan found, the record ends, and the next press starts one plan with a new key", async () => {
    let lost = true;
    const f = family({ stripe: stripeFake({ lose: (w) => w.kind === "create" && lost }) });
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("updated");
    expect(await f.start()).toEqual({ ok: false, error: "unconfirmed" });
    const first = f.stripe.creates()[0];
    later(PLAN_KEY_MS + 1);
    expect(await f.sweep()).toMatchObject({ plans: 1, failed: 0 });
    expect(row(f).pendingKey).toBeNull();
    expect(f.announced).toEqual([]);
    lost = false;
    expect((await f.start()).ok).toBe(true);
    const creates = f.stripe.creates();
    expect(creates).toHaveLength(2);
    expect(creates[1]).not.toEqual(first);
    expect(plans(f)).toHaveLength(1);
  });

  it("after 24 hours: a sweep that cannot read Stripe keeps the record", async () => {
    const f = family({ stripe: stripeFake({ lose: (w) => w.kind === "create" }) });
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("updated");
    expect(await f.start()).toEqual({ ok: false, error: "unconfirmed" });
    later(PLAN_KEY_MS + 1);
    f.seams.stripe = { ...f.seams.stripe, cardState: async () => { throw new Error("Stripe down"); } };
    expect(await f.sweep()).toMatchObject({ plans: 0, failed: 1 });
    expect(row(f).pendingKey).not.toBeNull();
    expect(row(f).needsRepair).toBe(true);
  });

  it("a creation Stripe refused ends the record, and the next press uses a new key", async () => {
    let refuse = true;
    const f = family({ stripe: stripeFake({ refuse: (w) => w.kind === "create" && refuse }) });
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("updated");
    await expect(f.start()).rejects.toThrow("Synthetic refusal");
    expect(row(f).pendingKey).toBeNull();
    refuse = false;
    expect((await f.start()).ok).toBe(true);
    const [one, two] = f.stripe.creates();
    expect(one).not.toEqual(two);
    expect(plans(f)).toHaveLength(1);
  });

  it("a double click sends one key", async () => {
    const f = family();
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("updated");
    const [one, two] = await Promise.all([f.start(), f.start()]);
    expect(plans(f)).toHaveLength(1);
    expect([one, two].filter((a) => a.ok).length).toBeGreaterThanOrEqual(1);
    expect([...new Set(f.stripe.creates().map((c) => (c as { key: string }).key))]).toHaveLength(1);
  });

  it("refuses a second running plan, whatever the row says, and ends a record it finds beside one", async () => {
    const f = family({ stripe: stripeFake({ plans: ["sub_live"] }) });
    expect(await f.start()).toEqual({ ok: false, error: "already" });
    expect(f.stripe.creates()).toEqual([]);
    await f.b.store.beginPlanStart("card-1", "key-old", "pm_old");
    expect(await f.start()).toEqual({ ok: false, error: "already" });
    expect(row(f).pendingKey).toBeNull();
  });
});

describe("a plan start with the row", () => {
  it("corrects a card that arrives during the start", async () => {
    const f = family();
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("updated");
    const real = f.b.store.beginPlanStart;
    f.b.store.beginPlanStart = async (...args) => {
      const held = await real(...args);
      expect(await finishCardUpdate("p1", "cs_test_b", f.updates)).toBe("updated");
      return held;
    };
    expect((await f.start()).ok).toBe(true);
    expect(f.stripe.creates()[0]).toMatchObject({ card: "pm_a" });
    expect(f.stripe.state.customerDefault).toBe("pm_b");
    expect(Object.values(f.stripe.state.plans).map((p) => p.default)).toEqual(["pm_b"]);
  });

  it("charges the row's newest card, even when the Customer's default says another", async () => {
    const f = family();
    expect(await finishCardUpdate("p1", "cs_test_b", f.updates)).toBe("updated");
    f.stripe.state.customerDefault = "pm_other";
    expect((await f.start()).ok).toBe(true);
    expect(f.stripe.creates()[0]).toMatchObject({ card: "pm_b" });
    expect(f.stripe.state.customerDefault).toBe("pm_b");
  });

  it("repairs a running plan on the 'already' answer", async () => {
    const fixed = family({ stripe: stripeFake({ plans: ["sub_live"] }) });
    expect(await finishCardUpdate("p1", "cs_test_b", fixed.updates)).toBe("updated");
    fixed.stripe.state.plans.sub_live.default = "pm_stray";
    expect(await fixed.start()).toEqual({ ok: false, error: "already" });
    expect(fixed.stripe.state.plans.sub_live.default).toBe("pm_b");
  });

  it("still answers that the plan started when the row cannot be told", async () => {
    const f = family();
    expect(await finishCardUpdate("p1", "cs_test_b", f.updates)).toBe("updated");
    f.b.fail.settle = new Error("Database down");
    f.b.fail.end = new Error("Database down");
    expect((await f.start()).ok).toBe(true);
    delete f.b.fail.settle;
    delete f.b.fail.end;
    // The record stayed, so the sweep finds the plan and ends it.
    dropEvents(f);
    later(PLAN_ANSWER_MS + 1);
    expect(await f.sweep()).toMatchObject({ plans: 1, failed: 0 });
    expect(row(f).pendingKey).toBeNull();
  });

  it("starts no plan without the row's store, or for a card setup that does not exist", async () => {
    const f = family({ children: [] });
    await expect(startPlan(f.stripe.client, { cardSetup: "card-1", customer: "cus_1", price: 79.99, deliveryConfirmed: true }, undefined, null)).rejects.toThrow("No card rows");
    await expect(f.start()).rejects.toThrow("plan_start_no_card_setup");
    expect(f.stripe.creates()).toEqual([]);
  });
});

describe("the webhook's part", () => {
  it("changes nothing for a customer with no row, and asks Stripe nothing", async () => {
    const f = family();
    const read = vi.fn(f.seams.stripe.cardState);
    f.seams.stripe = { ...f.seams.stripe, cardState: read };
    expect(await checkCustomerCard("cus_1", f.seams)).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(f.stripe.writes()).toBe(0);
  });

  it("leaves a row with no card alone, as it has no truth to enforce", async () => {
    const f = family({ stripe: stripeFake({ plans: ["sub_1"] }) });
    await f.b.store.beginPlanStart("card-1", "key-1", "pm_old");
    await f.b.store.endPlanStart("card-1", "key-1");
    expect(await checkCustomerCard("cus_1", f.seams)).toMatchObject({ wrote: 0, plan: "none", failure: null });
    expect(f.stripe.writes()).toBe(0);
  });

  it("flags the row and reports the failure when Stripe fails, so the sweep comes back past the 7 days", async () => {
    const f = family({ stripe: stripeFake({ plans: ["sub_1"] }) });
    expect(await finishCardUpdate("p1", "cs_test_b", f.updates)).toBe("updated");
    f.stripe.state.plans.sub_1.default = "pm_stray";
    f.seams.stripe = { ...f.seams.stripe, setSubscriptionCard: async () => { throw new Error("Stripe down"); } };
    expect((await checkCustomerCard("cus_1", f.seams))?.failure).toBeTruthy();
    expect(row(f).needsRepair).toBe(true);
    later(CARD_WATCH_MS + 1);
    f.seams.stripe = stripeCards(f.stripe.client);
    expect(await f.sweep()).toMatchObject({ corrected: 1, failed: 0 });
    expect(row(f).needsRepair).toBe(false);
    expect(f.stripe.state.plans.sub_1.default).toBe("pm_b");
  });

  it("throws when the row cannot be read, so Stripe sends the event again", async () => {
    const f = family();
    f.b.fail.rows = new Error("Database down");
    await expect(checkCustomerCard("cus_1", f.seams)).rejects.toThrow("Database down");
  });
});

describe("the sweep", () => {
  const two: MemoryBillingChild[] = [child, { parentId: "p1", childId: "c2", firstName: "Omar", card: { id: "card-2", customer: "cus_2", saved: true } }];
  const recorded = async (f: ReturnType<typeof family>) => {
    await f.b.store.recordCard("card-1", { parentId: "p1", session: "cs_1", created: 1, paymentMethod: "pm_1" });
    await f.b.store.recordCard("card-2", { parentId: "p1", session: "cs_2", created: 1, paymentMethod: "pm_2" });
  };

  it("clears the flag only after a read confirms the state", async () => {
    const f = family();
    await f.b.store.recordCard("card-1", { parentId: "p1", session: "cs_1", created: 1, paymentMethod: "pm_b" });
    // A stray write lands between the sweep's write and its read.
    const real = f.seams.stripe.setCustomerCard;
    f.seams.stripe = { ...f.seams.stripe, setCustomerCard: async (customer, card) => { await real(customer, card); f.stripe.state.customerDefault = "pm_stray"; } };
    expect(await f.sweep()).toMatchObject({ corrected: 1, failed: 0 });
    expect(row(f).needsRepair).toBe(true);
    f.seams.stripe = stripeCards(f.stripe.client);
    expect(await f.sweep()).toMatchObject({ corrected: 1 });
    expect(f.stripe.state.customerDefault).toBe("pm_b");
    expect(row(f).needsRepair).toBe(false);
    // A read with nothing to write clears it too.
    await f.b.store.settleCard("card-1", "cs_1", false);
    expect(await f.sweep()).toMatchObject({ corrected: 0 });
    expect(row(f).needsRepair).toBe(false);
  });

  it("does not clear the flag for an older card when a newer one was recorded during the look", async () => {
    const f = family();
    await f.b.store.recordCard("card-1", { parentId: "p1", session: "cs_1", created: 1, paymentMethod: "pm_a" });
    const real = f.seams.stripe.setCustomerCard;
    let once = true;
    f.seams.stripe = { ...f.seams.stripe, setCustomerCard: async (customer, card) => {
      await real(customer, card);
      if (once) await f.b.store.recordCard("card-1", { parentId: "p1", session: "cs_2", created: 2, paymentMethod: "pm_b" });
      once = false;
    } };
    await f.sweep();
    expect(f.stripe.state.customerDefault).toBe("pm_b");
    expect(row(f)).toMatchObject({ sessionId: "cs_2", needsRepair: false });
  });

  it("stops looking at a clean row 7 days after its card changed, and keeps looking at a flagged one", async () => {
    const f = family();
    expect(await finishCardUpdate("p1", "cs_test_b", f.updates)).toBe("updated");
    expect((await f.sweep()).due).toBe(1);
    later(CARD_WATCH_MS + 1);
    expect((await f.sweep()).due).toBe(0);
    await f.b.store.settleCard("card-1", "cs_test_b", false);
    expect((await f.sweep()).due).toBe(1);
  });

  it("one row's failure stops only that row, and the next run starts with the row that was not looked at", async () => {
    const f = family({ children: two });
    await recorded(f);
    const read = f.seams.stripe.cardState;
    f.seams.stripe = { ...f.seams.stripe, cardState: async (customer) => { if (customer === "cus_1") throw new Error("Stripe down"); return { ...(await read("cus_1")) }; } };
    expect(await f.sweep()).toMatchObject({ due: 2, checked: 2, failed: 1, corrected: 1 });
    expect(f.b.updates.get("c1")).toMatchObject({ needsRepair: true });
  });

  it("starts no row after its time, and the row looked at longest ago comes first", async () => {
    const f = family({ children: two });
    await recorded(f);
    const start = Date.now();
    const seen: string[] = [];
    const seams: CardCheckSeams = { ...f.seams, stripe: { ...f.seams.stripe, cardState: async (customer) => { seen.push(customer); later(30_000); return f.seams.stripe.cardState("cus_1"); } } };
    expect(await sweepCards(seams, { now: () => Date.now(), startBy: start + 10_000 })).toMatchObject({ due: 2, checked: 1, outOfTime: true });
    expect(seen[0]).toBe("cus_1");
    seen.length = 0;
    await sweepCards(seams, { now: () => Date.now(), startBy: Date.now() + 10_000 });
    expect(seen[0]).toBe("cus_2");
  });

  it("starts no write when `canWrite` says no, and flags the row", async () => {
    const f = family();
    await f.b.store.recordCard("card-1", { parentId: "p1", session: "cs_1", created: 1, paymentMethod: "pm_b" });
    f.seams.canWrite = () => false;
    expect(await f.sweep()).toMatchObject({ corrected: 0, failed: 1 });
    expect(f.stripe.state.customerDefault).toBe("pm_old");
    expect(row(f).needsRepair).toBe(true);
  });

  it("clears the flag for a Customer that no longer exists, as nothing can charge", async () => {
    const f = family();
    await f.b.store.recordCard("card-1", { parentId: "p1", session: "cs_1", created: 1, paymentMethod: "pm_b" });
    f.seams.stripe = { ...f.seams.stripe, cardState: async () => ({ gone: true, customerDefault: null, plans: [] }) };
    expect(await f.sweep()).toMatchObject({ corrected: 0, failed: 0 });
    expect(row(f).needsRepair).toBe(false);
  });
});

describe("the memory store and the provider's rules", () => {
  const running = (): MemorySubscription[] => [{ id: "sub_live", customer: "cus_1", status: "active", defaultCard: "pm_old" }];

  it("refuses another family's card, and records nothing", async () => {
    const b = memoryBilling({ children: [child] });
    expect(await b.store.recordCard("card-1", { parentId: "p2", session: "cs_test_x", created: 1, paymentMethod: "pm_x" })).toEqual({ state: "no_match" });
    expect(b.updates.size).toBe(0);
  });

  it("moves on to the newer card when Stripe refuses the older one", async () => {
    const b = memoryBilling({ children: [child], subscriptions: running() });
    b.addSession({ id: "cs_1", ref: "card-1", customer: "cus_1", created: 1, paymentMethod: "pm_bad" });
    b.refuseOnSubscription.add("pm_bad");
    b.duringNextWrite(async () => { await b.store.recordCard("card-1", { parentId: "p1", session: "cs_2", created: 2, paymentMethod: "pm_good" }); });
    expect(await finishCardUpdate("p1", "cs_1", b)).toBe("stale");
    expect(b.subscriptions[0].defaultCard).toBe("pm_good");
    expect(b.updates.get("c1")).toMatchObject({ sessionId: "cs_2", needsRepair: false });
  });
});
