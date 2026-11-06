import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finishCardUpdate, type CardUpdates } from "@/lib/billing";
import { memoryBilling, type MemoryBillingChild, type MemorySubscription } from "@/lib/billing-memory";
import { stripeBillingProvider } from "@/lib/billing-server";
import { CARD_WATCH_MS, PLAN_ANSWER_MS, PLAN_KEY_MS, PLAN_RETRY_MS, checkCustomerCard, sweepCards, type CardCheckSeams } from "@/lib/card-reconcile";
import { memoryLedger, memoryTransport } from "@/lib/email-delivery-memory";
import { sendEmailOnce } from "@/lib/email-delivery";
import { resendTransport } from "@/lib/email-resend";
import { sendPlanStartAlert } from "@/lib/card-plan-alert";
import { endStuckPlanStart, startPlan } from "@/lib/stripe";
import { stripeCards } from "@/lib/stripe-subscriptions";

vi.mock("server-only", () => ({}));

// Review round 3 of PR #593. A client timeout leaves a Stripe request's outcome unknown, and the request can land later. The first
// two groups are the review's two reproductions through the real Stripe SDK: a request that is lost, and that lands when the test
// says so. The store is the memory store, with the rules of the database functions.

const SENT = { status: "sent", emailId: "email-1" } as const;
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
  const alerts: number[] = [];
  const seams: CardCheckSeams = {
    rows: b.store, stripe: stripeCards(stripe.client), canWrite: () => true,
    announcePlan: async (_row, start) => { announced.push(start.subscription!); return SENT; },
    planEmailClaim: async () => "sent",
    alertTeam: async (_row, start) => { alerts.push(start.generation); return SENT; },
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
  const start = (purpose: "initial" | "restart" = "initial") => startPlan(stripe.client, { purpose, cardSetup: "card-1", customer: "cus_1", price: 79.99, deliveryConfirmed: true }, undefined, b.store);
  return { b, stripe, seams, updates, announced, alerts, deliver, sweep, start };
}
const dropEvents = (f: ReturnType<typeof family>) => f.stripe.events.splice(0);
const later = (ms: number) => vi.setSystemTime(Date.now() + ms);
const row = (f: ReturnType<typeof family>) => f.b.updates.get("c1")!;
const record = (f: ReturnType<typeof family>) => f.b.planStarts.get("card-1")?.at(-1);

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
    expect(record(f)).toMatchObject({ state: "open", generation: 1, card: "pm_old", key: expect.stringMatching(/^start-plan-card-1-/) });
    expect(await finishCardUpdate("p1", "cs_test_b", f.updates)).toBe("updated");
    expect(f.stripe.state.customerDefault).toBe("pm_b");
    expect(row(f)).toMatchObject({ needsRepair: false });
    expect(record(f)).toMatchObject({ state: "open", card: "pm_old" });
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
    expect(row(f)).toMatchObject({ needsRepair: false });
    expect(record(f)).toMatchObject({ state: "started", subscription: "sub_made_1", email: "sent" });
    expect(f.announced).toEqual(["sub_made_1"]);
  });

  it("corrects the card at once, and leaves the record while the start may still be answering for itself", async () => {
    const f = await creationLandsLate();
    await f.deliver();
    expect(plans(f).map((p) => p.default)).toEqual(["pm_b"]);
    expect(record(f)?.state).toBe("open");
    expect(f.announced).toEqual([]);
    later(PLAN_ANSWER_MS + 1);
    expect(await f.sweep()).toMatchObject({ plans: 1, failed: 0 });
    expect(record(f)?.state).toBe("started");
    expect(f.announced).toEqual(["sub_made_1"]);
  });

  it("is resolved by the sweep when the event never arrives", async () => {
    const f = await creationLandsLate();
    dropEvents(f);
    later(PLAN_ANSWER_MS + 1);
    expect(await f.sweep()).toMatchObject({ corrected: 1, plans: 1, failed: 0 });
    expect(plans(f).map((p) => p.default)).toEqual(["pm_b"]);
    expect(record(f)?.state).toBe("started");
    expect(f.announced).toEqual(["sub_made_1"]);
  });

  it("closes the record when the parent cannot be told yet, and a later sweep tells them", async () => {
    const f = await creationLandsLate();
    dropEvents(f);
    later(PLAN_ANSWER_MS + 1);
    f.seams.announcePlan = async () => { throw new Error("Email down"); };
    expect(await f.sweep()).toMatchObject({ plans: 1, failed: 1, emails: 0 });
    expect(record(f)).toMatchObject({ state: "started", email: "pending" });
    f.seams.announcePlan = async (_row, start) => { f.announced.push(start.subscription!); return SENT; };
    // The record closed just now, and a start's own route may be sending, so the next sweep waits.
    expect(await f.sweep()).toMatchObject({ plans: 0, failed: 0, emails: 0 });
    expect(f.announced).toEqual([]);
    later(PLAN_ANSWER_MS + 1);
    expect(await f.sweep()).toMatchObject({ plans: 0, failed: 0, emails: 1 });
    expect(record(f)?.email).toBe("sent");
    expect(f.announced).toEqual(["sub_made_1"]);
  });

  it("before 24 hours: a sweep that finds nothing keeps the record, and a retry sends the same key and the same card", async () => {
    let lost = true;
    const f = family({ stripe: stripeFake({ lose: (w) => w.kind === "create" && lost }) });
    expect(await f.start()).toEqual({ ok: false, error: "unconfirmed" });
    const first = record(f)?.key;
    later(PLAN_RETRY_MS - 1000);
    expect(await f.sweep()).toMatchObject({ plans: 0, failed: 0 });
    expect(record(f)).toMatchObject({ key: first, state: "open" });
    // The parent changes the card meanwhile. The retry still sends the first card, as Stripe refuses a key with other fields, and the plan is then corrected.
    expect(await finishCardUpdate("p1", "cs_test_b", f.updates)).toBe("updated");
    lost = false;
    expect((await f.start()).ok).toBe(true);
    const creates = f.stripe.creates();
    expect(creates).toHaveLength(2);
    expect(creates[1]).toEqual(creates[0]);
    expect(creates[0]).toMatchObject({ card: "pm_old" });
    expect(plans(f).map((p) => p.default)).toEqual(["pm_b"]);
    expect(record(f)).toMatchObject({ key: first, state: "started" });
    expect(await f.start()).toEqual({ ok: false, error: "already" });
    expect(f.stripe.creates()).toHaveLength(2);
  });

  it("before 24 hours: a retry after the creation landed answers that plan's start and creates nothing, so the route can send the email", async () => {
    const f = await creationLandsLate();
    dropEvents(f);
    const answer = await f.start();
    expect(answer).toEqual({ ok: true, subscription: "sub_made_1", firstChargeAt: new Date(1_900_000_000_000).toISOString(), generation: 1 });
    expect(f.stripe.creates()).toHaveLength(1);
    expect(plans(f).map((p) => p.default)).toEqual(["pm_b"]);
    expect(record(f)?.state).toBe("started");
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
    expect(record(f)?.state).toBe("started");
    expect(await f.start()).toEqual({ ok: false, error: "already" });
    expect(f.stripe.creates()).toHaveLength(1);
  });

  it("after 24 hours: a sweep that cannot read Stripe keeps the record", async () => {
    const f = family({ stripe: stripeFake({ lose: (w) => w.kind === "create" }) });
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("updated");
    expect(await f.start()).toEqual({ ok: false, error: "unconfirmed" });
    later(PLAN_KEY_MS + 1);
    f.seams.stripe = { ...f.seams.stripe, cardState: async () => { throw new Error("Stripe down"); } };
    expect(await f.sweep()).toMatchObject({ plans: 0, failed: 1 });
    expect(record(f)?.state).toBe("open");
    expect(f.alerts).toEqual([]);
    expect(row(f).needsRepair).toBe(true);
  });

  it("a creation Stripe refused closes the record, and the next press opens a new generation with a new key", async () => {
    let refuse = true;
    const f = family({ stripe: stripeFake({ refuse: (w) => w.kind === "create" && refuse }) });
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("updated");
    await expect(f.start()).rejects.toThrow("Synthetic refusal");
    expect(record(f)).toMatchObject({ generation: 1, state: "refused" });
    refuse = false;
    expect((await f.start()).ok).toBe(true);
    const [one, two] = f.stripe.creates();
    expect(one).not.toEqual(two);
    expect(plans(f)).toHaveLength(1);
    expect(record(f)).toMatchObject({ generation: 2, state: "started" });
  });

  it("a double click sends one key", async () => {
    const f = family();
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("updated");
    const [one, two] = await Promise.all([f.start(), f.start()]);
    expect(plans(f)).toHaveLength(1);
    expect([one, two].filter((a) => a.ok).length).toBeGreaterThanOrEqual(1);
    expect([...new Set(f.stripe.creates().map((c) => (c as { key: string }).key))]).toHaveLength(1);
  });

  it("refuses a second running plan and keeps an unrelated open request unresolved", async () => {
    const f = family({ stripe: stripeFake({ plans: ["sub_live"] }) });
    expect(await f.start()).toEqual({ ok: false, error: "already" });
    expect(f.stripe.creates()).toEqual([]);
    await f.b.store.admitPlanStart("card-1", 1, "key-old", "pm_old");
    expect(await f.start()).toEqual({ ok: false, error: "already" });
    expect(record(f)).toMatchObject({ state: "open", subscription: null });
  });

  it("keeps the original request open during normal recovery and alerts the team after 24 hours", async () => {
    const f = family({ stripe: stripeFake({ plans: ["sub_live"] }) });
    await f.b.store.admitPlanStart("card-1", 1, "key-old", "pm_old");
    later(PLAN_ANSWER_MS + 1);
    expect(await checkCustomerCard("cus_1", f.seams, Date.now())).toMatchObject({ plan: "waiting", failure: null });
    expect(record(f)).toMatchObject({ state: "open", subscription: null });
    expect(f.alerts).toEqual([]);
    later(PLAN_KEY_MS);
    expect(await f.sweep()).toMatchObject({ needsTeam: 1, failed: 0 });
    expect(record(f)).toMatchObject({ state: "open", subscription: null });
    expect(f.alerts).toEqual([1]);
    expect(f.announced).toEqual([]);
    expect(f.stripe.creates()).toEqual([]);
  });
});

describe("two presses, and a record that stays", () => {
  /** Press B reads its list, then waits before admission until the test lets it go. */
  const delayedPress = (f: ReturnType<typeof family>) => {
    let reached!: () => void;
    let go!: () => void;
    const atAdmission = new Promise<void>((r) => { reached = r; });
    const released = new Promise<void>((r) => { go = r; });
    const rows = { ...f.b.store, admitPlanStart: async (...args: Parameters<typeof f.b.store.admitPlanStart>) => { reached(); await released; return f.b.store.admitPlanStart(...args); } };
    const answer = startPlan(f.stripe.client, { cardSetup: "card-1", customer: "cus_1", price: 79.99, deliveryConfirmed: true }, undefined, rows);
    return { answer, atAdmission, go };
  };

  it("the delayed second admission: B read an empty list, A created and finished, and B then creates nothing", async () => {
    const f = family();
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("updated");
    const b = delayedPress(f);
    await b.atAdmission;
    expect(await f.start()).toMatchObject({ ok: true, subscription: "sub_made_1" });
    expect(record(f)).toMatchObject({ generation: 1, state: "started" });
    b.go();
    expect(await b.answer).toEqual({ ok: false, error: "already" });
    expect(f.stripe.creates()).toHaveLength(1);
    expect(Object.keys(f.stripe.state.plans)).toEqual(["sub_made_1"]);
    expect(f.b.planStarts.get("card-1")).toHaveLength(1);
  });

  it("the delayed second admission while A's answer is lost: B gets A's key, so Stripe answers one plan", async () => {
    let lost = true;
    const f = family({ stripe: stripeFake({ lose: (w) => w.kind === "create" && lost }) });
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("updated");
    const b = delayedPress(f);
    await b.atAdmission;
    expect(await f.start()).toEqual({ ok: false, error: "unconfirmed" });
    lost = false;
    f.stripe.land();
    b.go();
    expect(await b.answer).toMatchObject({ ok: true, subscription: "sub_made_1" });
    const creates = f.stripe.creates();
    expect(creates).toHaveLength(2);
    expect(creates[1]).toEqual(creates[0]);
    expect(Object.keys(f.stripe.state.plans)).toEqual(["sub_made_1"]);
  });

  it("a finished record answers already, even when Stripe's list does not show its plan", async () => {
    const f = family();
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("updated");
    expect((await f.start()).ok).toBe(true);
    const finished = { ...record(f) };
    delete f.stripe.state.plans.sub_made_1;
    expect(await f.start()).toEqual({ ok: false, error: "already" });
    expect(f.stripe.creates()).toHaveLength(1);
    expect(record(f)).toEqual(finished);
  });

  it("opens a new generation only when the record's plan has really ended in Stripe", async () => {
    const f = family();
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("updated");
    expect((await f.start()).ok).toBe(true);
    const first = record(f);
    for (const status of ["trialing", "active", "past_due", "unpaid", "paused", "incomplete"]) {
      f.stripe.state.plans.sub_made_1.status = status;
      expect(await f.start()).toEqual({ ok: false, error: "already" });
    }
    expect(f.stripe.creates()).toHaveLength(1);
    f.stripe.state.plans.sub_made_1.status = "canceled";
    expect(await f.start()).toEqual({ ok: false, error: "restart_required" });
    expect(await f.start("restart")).toMatchObject({ ok: true, subscription: "sub_made_2" });
    expect(record(f)).toMatchObject({ generation: 2, state: "started", subscription: "sub_made_2" });
    expect(record(f)?.key).not.toBe(first?.key);
    expect(f.b.planStarts.get("card-1")?.[0]).toEqual(first);
    expect(await f.start()).toEqual({ ok: false, error: "already" });
    expect(f.stripe.creates()).toHaveLength(2);
  });

  it("one generation holds one key: a second admission gets the first key and card, and a stale generation opens nothing", async () => {
    const f = family();
    const first = await f.b.store.admitPlanStart("card-1", 1, "key-a", "pm_a");
    expect(await f.b.store.admitPlanStart("card-1", 1, "key-b", "pm_b")).toMatchObject({ key: "key-a", card: "pm_a", generation: 1 });
    expect(await f.b.store.admitPlanStart("card-1", 2, "key-c", "pm_c")).toEqual(first);
    await f.b.store.finishPlanStart("card-1", 1, { state: "started", subscription: "sub_1", firstCharge: null, email: false });
    expect(await f.b.store.admitPlanStart("card-1", 1, "key-d", "pm_d")).toMatchObject({ key: "key-a", state: "started" });
    expect(f.b.planStarts.get("card-1")).toHaveLength(1);
  });
});

describe("a creation that may land after 24 hours", () => {
  const stuck = async () => {
    const f = family({ stripe: stripeFake({ lose: (w) => w.kind === "create" }) });
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("updated");
    expect(await f.start()).toEqual({ ok: false, error: "unconfirmed" });
    dropEvents(f);
    return f;
  };
  const end = (f: ReturnType<typeof family>, generation = 1) => endStuckPlanStart(f.stripe.client, { cardSetup: "card-1", customer: "cus_1", generation, admin: "admin-1" }, f.b.store);

  it("stays open past 24 hours, alerts the team once, and a press answers that it needs the team", async () => {
    const f = await stuck();
    later(PLAN_KEY_MS - 1000);
    expect(await f.sweep()).toMatchObject({ plans: 0, needsTeam: 0 });
    expect(f.alerts).toEqual([]);
    expect(await f.start()).toEqual({ ok: false, error: "unconfirmed" });
    later(2000);
    expect(await f.sweep()).toMatchObject({ plans: 0, needsTeam: 1, failed: 0 });
    expect(f.alerts).toEqual([1]);
    expect(record(f)?.state).toBe("open");
    expect(await f.start()).toEqual({ ok: false, error: "needs_team" });
    expect(f.stripe.creates()).toHaveLength(1);
    // No time closes it. It stays due, and the sweep goes on looking.
    later(30 * PLAN_KEY_MS);
    expect((await f.sweep()).due).toBe(1);
    expect(await f.start()).toEqual({ ok: false, error: "needs_team" });
    expect(record(f)?.state).toBe("open");
  });

  it("a create that lands after the record is 24 hours old resolves as usual, and no second plan can start", async () => {
    const f = await stuck();
    later(PLAN_KEY_MS + 1);
    expect(await f.sweep()).toMatchObject({ needsTeam: 1 });
    expect(await f.start()).toEqual({ ok: false, error: "needs_team" });
    f.stripe.forgetKeys();
    f.stripe.land();
    dropEvents(f);
    later(3 * PLAN_KEY_MS);
    expect(await f.sweep()).toMatchObject({ plans: 1, needsTeam: 0, failed: 0 });
    expect(record(f)).toMatchObject({ generation: 1, state: "started", subscription: "sub_made_1", email: "sent" });
    expect(f.announced).toEqual(["sub_made_1"]);
    expect(await f.start()).toEqual({ ok: false, error: "already" });
    expect(f.stripe.creates()).toHaveLength(1);
    expect(Object.keys(f.stripe.state.plans)).toEqual(["sub_made_1"]);
  });

  it("a press finds a create that landed late, and answers that plan", async () => {
    const f = await stuck();
    later(PLAN_KEY_MS + 1);
    f.stripe.forgetKeys();
    f.stripe.land();
    expect(await f.start()).toMatchObject({ ok: true, subscription: "sub_made_1" });
    expect(record(f)?.state).toBe("started");
    expect(f.stripe.creates()).toHaveLength(1);
  });

  it("only an admin's press closes it, and the next press then starts one plan with a new key", async () => {
    const f = await stuck();
    const firstKey = record(f)?.key;
    expect(await end(f)).toEqual({ ok: false, error: "too_soon" });
    later(PLAN_KEY_MS + 1);
    expect(await end(f, 2)).toEqual({ ok: false, error: "changed" });
    expect(record(f)?.state).toBe("open");
    expect(await end(f)).toEqual({ ok: true });
    expect(record(f)).toMatchObject({ generation: 1, state: "team_ended" });
    expect(f.b.endedBy.get("card-1:1")).toBe("admin-1");
    expect(await end(f)).toEqual({ ok: false, error: "changed" });
    // A closed record stays as it is, and asks for no alert.
    await f.b.store.finishPlanStart("card-1", 1, { state: "refused" });
    expect(record(f)?.state).toBe("team_ended");
    expect(await f.sweep()).toMatchObject({ needsTeam: 0 });
    expect(f.alerts).toEqual([]);
    expect(firstKey).toBe(record(f)?.key);
  });

  it("the admin's press reads Stripe first: a plan it finds closes the record as started, and nothing else closes it on a failed read", async () => {
    const f = await stuck();
    later(PLAN_KEY_MS + 1);
    f.stripe.forgetKeys();
    f.stripe.land();
    expect(await end(f)).toEqual({ ok: false, error: "landed" });
    expect(record(f)).toMatchObject({ state: "started", email: "pending" });

    const down = await stuck();
    later(PLAN_KEY_MS + 1);
    const read = vi.spyOn(down.stripe.client.subscriptions, "list").mockRejectedValue(new Error("Stripe down"));
    await expect(end(down)).rejects.toThrow("Stripe down");
    read.mockRestore();
    expect(record(down)?.state).toBe("open");
  });

  it("after the admin closed it, a new start uses a new key", async () => {
    let lost = true;
    const f = family({ stripe: stripeFake({ lose: (w) => w.kind === "create" && lost }) });
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("updated");
    expect(await f.start()).toEqual({ ok: false, error: "unconfirmed" });
    const first = f.stripe.creates()[0];
    later(PLAN_KEY_MS + 1);
    expect(await end(f)).toEqual({ ok: true });
    lost = false;
    expect((await f.start()).ok).toBe(true);
    const creates = f.stripe.creates();
    expect(creates).toHaveLength(2);
    expect(creates[1]).not.toEqual(first);
    expect(record(f)).toMatchObject({ generation: 2, state: "started" });
  });

  it("the team's alert goes through the delivery module once: a refused send goes again, and an unknown one does not", async () => {
    const f = await stuck();
    later(PLAN_KEY_MS + 1);
    const mail = memoryTransport();
    f.seams.alertTeam = (row, start) => sendPlanStartAlert(f.b.store, row, start, { to: "team@example.test", origin: "https://example.test", transport: mail.transport });
    mail.answerNext("refuse");
    expect(await f.sweep()).toMatchObject({ needsTeam: 0, failed: 1 });
    expect(record(f)?.alert).toBeNull();
    expect(await f.sweep()).toMatchObject({ needsTeam: 1, failed: 0 });
    expect(mail.delivered).toHaveLength(1);
    expect(mail.delivered[0]).toMatchObject({ to: "team@example.test", subject: "A plan start needs the team" });
    expect(mail.delivered[0].text).toContain("card-1");
    expect(record(f)?.alert).toBe("sent");
    await f.sweep();
    expect(mail.delivered).toHaveLength(1);

    const g = await stuck();
    later(PLAN_KEY_MS + 1);
    const lost = memoryTransport();
    g.seams.alertTeam = (row, start) => sendPlanStartAlert(g.b.store, row, start, { to: "team@example.test", origin: "https://example.test", transport: lost.transport });
    lost.answerNext("lose_answer");
    await g.sweep();
    expect(record(g)?.alert).toBe("unknown");
    await g.sweep();
    expect(lost.delivered).toHaveLength(1);
  });
});

describe("the confirmation email's own state", () => {
  /** A late creation closed by the sweep, with the email sent through the delivery module and the live Resend adapter over `answer`. */
  const landed = async (answer: () => Response | Promise<Response>) => {
    const f = family({ stripe: stripeFake({ lose: (w) => w.kind === "create" }) });
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("updated");
    expect(await f.start()).toEqual({ ok: false, error: "unconfirmed" });
    f.stripe.land();
    dropEvents(f);
    later(PLAN_ANSWER_MS + 1);
    const memory = memoryLedger<string>();
    const ledger = memory.ledger;
    const requests = vi.fn(async () => answer());
    const transport = resendTransport({ fetch: requests });
    f.seams.announcePlan = (_row, start) => sendEmailOnce(ledger, `plan-start-${start.subscription}`, { sender: { to: "parent" }, to: "parent@example.test", subject: "Free month", text: "Started" }, { transport });
    f.seams.planEmailClaim = async () => {
      const state = memory.entry("plan-start-sub_made_1")?.state;
      return state === "sent" ? "sent" : state === "unknown" ? "unknown" : "pending";
    };
    return { f, requests, ledger };
  };

  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Unica Learning <contact@unicalearning.com>");
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("a definite refusal (HTTP 429) keeps the email pending while the record is closed, and the next sweep sends it", async () => {
    let status = 429;
    const { f, requests } = await landed(() => status === 429 ? new Response("rate limited", { status: 429 }) : Response.json({ id: "email-1" }));
    expect(await f.sweep()).toMatchObject({ plans: 1, emails: 0, failed: 1 });
    expect(record(f)).toMatchObject({ state: "started", email: "pending" });
    // Past its card's 7 days, the pending email alone keeps it due.
    later(CARD_WATCH_MS + 1);
    await f.b.store.settleCard("card-1", "cs_test_a", true);
    status = 200;
    expect(await f.sweep()).toMatchObject({ due: 1, emails: 1, failed: 0 });
    expect(record(f)?.email).toBe("sent");
    expect(requests).toHaveBeenCalledTimes(2);
    expect((await f.sweep()).due).toBe(0);
  });

  it("an unknown outcome (HTTP 500) is final: nothing sends it again, and the row is no longer due for it", async () => {
    const { f, requests } = await landed(() => new Response("boom", { status: 500 }));
    expect(await f.sweep()).toMatchObject({ plans: 1, emails: 1, failed: 0 });
    expect(record(f)?.email).toBe("unknown");
    later(CARD_WATCH_MS + 1);
    await f.b.store.settleCard("card-1", "cs_test_a", true);
    expect((await f.sweep()).due).toBe(0);
    expect(requests).toHaveBeenCalledTimes(1);
  });

  it("a busy send stays pending while another run holds the claim, and takes the claim's outcome when it has one", async () => {
    const { f, requests, ledger } = await landed(() => Response.json({ id: "email-1" }));
    const handle = await ledger.claim("plan-start-sub_made_1", {});
    expect(await f.sweep()).toMatchObject({ plans: 1, emails: 0, failed: 0 });
    expect(record(f)?.email).toBe("pending");
    expect(requests).not.toHaveBeenCalled();
    await ledger.sent(handle!, "email-other");
    later(PLAN_ANSWER_MS + 1);
    expect(await f.sweep()).toMatchObject({ emails: 1 });
    expect(record(f)?.email).toBe("sent");
    expect(requests).not.toHaveBeenCalled();
  });

  it("a claim that fails sends nothing and stays pending", async () => {
    const { f, requests, ledger } = await landed(() => Response.json({ id: "email-1" }));
    const claim = vi.spyOn(ledger, "claim").mockRejectedValueOnce(new Error("Database down"));
    expect(await f.sweep()).toMatchObject({ plans: 1, failed: 1 });
    claim.mockRestore();
    expect(record(f)?.email).toBe("pending");
    expect(requests).not.toHaveBeenCalled();
  });

  it("no email starts when `canWrite` says no, and it stays pending", async () => {
    const { f, requests } = await landed(() => Response.json({ id: "email-1" }));
    await f.b.store.finishPlanStart("card-1", 1, { state: "started", subscription: "sub_made_1", firstCharge: new Date(1_900_000_000_000).toISOString(), email: true });
    later(PLAN_ANSWER_MS + 1);
    f.seams.canWrite = () => false;
    await f.sweep();
    expect(record(f)?.email).toBe("pending");
    expect(requests).not.toHaveBeenCalled();
  });

  it("a press's own close waits for the route's email, and a plan already over asks for no email", async () => {
    const f = family();
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("updated");
    expect((await f.start()).ok).toBe(true);
    expect(record(f)?.email).toBe("pending");
    expect(await f.sweep()).toMatchObject({ emails: 0 });
    expect(f.announced).toEqual([]);
    later(PLAN_ANSWER_MS + 1);
    expect(await f.sweep()).toMatchObject({ emails: 1 });
    expect(f.announced).toHaveLength(1);

    const over = family({ stripe: stripeFake({ lose: (w) => w.kind === "create" }) });
    expect(await finishCardUpdate("p1", "cs_test_a", over.updates)).toBe("updated");
    await over.start();
    over.stripe.land();
    over.stripe.state.plans.sub_made_1.status = "canceled";
    later(PLAN_ANSWER_MS + 1);
    expect(await over.sweep()).toMatchObject({ plans: 1, emails: 0 });
    expect(record(over)).toMatchObject({ state: "started", email: "none" });
    expect(over.announced).toEqual([]);
  });
});

describe("a plan start with the row", () => {
  it("corrects a card that arrives during the start", async () => {
    const f = family();
    expect(await finishCardUpdate("p1", "cs_test_a", f.updates)).toBe("updated");
    const real = f.b.store.admitPlanStart;
    f.b.store.admitPlanStart = async (...args) => {
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
    f.b.fail.finish = new Error("Database down");
    expect((await f.start()).ok).toBe(true);
    delete f.b.fail.settle;
    delete f.b.fail.finish;
    // The record stayed open, so the sweep finds the plan and closes it.
    expect(record(f)?.state).toBe("open");
    dropEvents(f);
    later(PLAN_ANSWER_MS + 1);
    expect(await f.sweep()).toMatchObject({ plans: 1, failed: 0 });
    expect(record(f)?.state).toBe("started");
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
    await f.b.store.admitPlanStart("card-1", 1, "key-1", "pm_old");
    await f.b.store.finishPlanStart("card-1", 1, { state: "refused" });
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
