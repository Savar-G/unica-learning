import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finishCardUpdate, type CardUpdates } from "@/lib/billing";
import { memoryBilling, type MemoryBillingChild, type MemorySubscription } from "@/lib/billing-memory";
import { stripeBillingProvider } from "@/lib/billing-server";
import { CARD_LOCK_SECONDS } from "@/lib/card-lock";
import { startPlan } from "@/lib/stripe";

vi.mock("server-only", () => ({}));

// Review round 2 of PR #593. The two races first ran through the real Stripe SDK over a fake transport; these tests are those
// reproductions with the outcome the review asked for. The store is the memory store, with the rules of the database functions.

const child: MemoryBillingChild = { parentId: "p1", childId: "c1", firstName: "Leah", card: { id: "card-1", customer: "cus_1", saved: true } };
const latch = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
};
const session = (id: string, created: number, method: string) => ({
  id, mode: "setup", status: "complete", created, customer: "cus_1", metadata: { source: "card_update", ref: "card-1" },
  setup_intent: { status: "succeeded", customer: "cus_1", payment_method: method },
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const refused = () => json({ error: { type: "invalid_request_error", message: "Synthetic subscription write refused" } }, 400);

/** A customer on Stripe's side, behind the real SDK, whose requests a test can stall or refuse. */
function stripeFake({ customerDefault = "pm_old", subscriptions = [] as string[], sessions = {} as Record<string, ReturnType<typeof session>>, onCustomerWrite, onSubscriptionWrite, onProductRead }: {
  customerDefault?: string;
  subscriptions?: string[];
  sessions?: Record<string, ReturnType<typeof session>>;
  onCustomerWrite?: (card: string) => Promise<void> | void;
  onSubscriptionWrite?: (card: string) => Response | null;
  onProductRead?: () => Promise<void> | void;
}) {
  const state = { customerDefault, subscriptionDefault: {} as Record<string, string> };
  for (const id of subscriptions) state.subscriptionDefault[id] = "pm_old";
  const created: { card: string | null }[] = [];
  const client = new Stripe("sk_test_synthetic", { maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient(async (input, init) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? "GET";
    const body = new URLSearchParams(String(init?.body ?? ""));
    const id = path.split("/").at(-1)!;
    if (path.startsWith("/v1/checkout/sessions/")) return json(sessions[id]);
    if (path === "/v1/subscriptions" && method === "GET") return json({ data: subscriptions.map((sub) => ({ id: sub, status: "active" })), has_more: false });
    if (path === "/v1/subscriptions" && method === "POST") {
      const card = body.get("default_payment_method");
      created.push({ card });
      state.subscriptionDefault.sub_new = card!;
      return json({ id: "sub_new", trial_end: 1_900_000_000 });
    }
    if (path.startsWith("/v1/subscriptions/") && method === "POST") {
      const next = body.get("default_payment_method")!;
      const answer = onSubscriptionWrite?.(next);
      if (answer) return answer;
      state.subscriptionDefault[id] = next;
      return json({ id });
    }
    if (path === "/v1/customers/cus_1" && method === "GET") return json({ id: "cus_1", invoice_settings: { default_payment_method: { id: state.customerDefault, type: "card" } } });
    if (path === "/v1/customers/cus_1" && method === "POST") {
      const next = body.get("invoice_settings[default_payment_method]")!;
      await onCustomerWrite?.(next);
      state.customerDefault = next;
      return json({ id: "cus_1" });
    }
    if (path.startsWith("/v1/products/")) { await onProductRead?.(); return json({ id: "unica_math" }); }
    throw new Error(`Unexpected ${method} ${path}`);
  }) });
  return { client, state, created };
}

const SESSIONS = { cs_test_a: session("cs_test_a", 100, "pm_a"), cs_test_b: session("cs_test_b", 200, "pm_b") };

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); });

describe("an older partial write overtaken by a newer update (the review's first race)", () => {
  it("ends with the Customer and the plan on the newest card, with no return opened again", async () => {
    const olderReached = latch();
    const releaseOlder = latch();
    const b = memoryBilling({ children: [child] });
    const stripe = stripeFake({
      subscriptions: ["sub_1"], sessions: SESSIONS,
      onCustomerWrite: async (card) => { if (card === "pm_a") { olderReached.release(); await releaseOlder.promise; } },
      onSubscriptionWrite: (card) => (card === "pm_a" ? refused() : null),
    });
    const seams: CardUpdates = { store: b.store, provider: stripeBillingProvider(stripe.client), pause: b.pause };
    const older = finishCardUpdate("p1", "cs_test_a", seams);
    await olderReached.promise;
    // The newer return finds the older one holding the lock, so it records its card and cannot say it took effect.
    expect(await finishCardUpdate("p1", "cs_test_b", seams)).toBe("unconfirmed");
    expect(stripe.state.customerDefault).toBe("pm_old");
    releaseOlder.release();
    // The older return lands on the Customer, is refused on the plan, and then writes the newer card it finds in the row.
    expect(await older).toBe("stale");
    expect(stripe.state).toEqual({ customerDefault: "pm_b", subscriptionDefault: { sub_1: "pm_b" } });
    expect(b.updates.get("c1")).toMatchObject({ sessionId: "cs_test_b", paymentMethod: "pm_b", needsRepair: false, token: null, applied: true });
    // Neither address says more, and neither brings the older card back.
    expect(await finishCardUpdate("p1", "cs_test_a", seams)).toBe("stale");
    expect(await finishCardUpdate("p1", "cs_test_b", seams)).toBe("stale");
    expect(stripe.state.customerDefault).toBe("pm_b");
  });

  it("is repaired by the newer address when the older holder dies after its Customer write", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const b = memoryBilling({ children: [child] });
    const stripe = stripeFake({ subscriptions: ["sub_1"], sessions: SESSIONS, onSubscriptionWrite: (card) => (card === "pm_a" ? refused() : null) });
    const seams: CardUpdates = { store: b.store, provider: stripeBillingProvider(stripe.client), pause: b.pause };
    // The holder's store goes away, so it neither finishes nor lets go: the row looks as it does after a crash.
    b.fail.finish = new Error("Process gone");
    b.fail.release = new Error("Process gone");
    expect(await finishCardUpdate("p1", "cs_test_a", seams)).toBe("failed");
    delete b.fail.finish;
    delete b.fail.release;
    expect(stripe.state).toEqual({ customerDefault: "pm_a", subscriptionDefault: { sub_1: "pm_old" } });
    expect(await finishCardUpdate("p1", "cs_test_b", seams)).toBe("unconfirmed");
    expect(b.updates.get("c1")).toMatchObject({ sessionId: "cs_test_b", needsRepair: true });
    vi.setSystemTime(1_000_000 + CARD_LOCK_SECONDS * 1000 + 1);
    expect(await finishCardUpdate("p1", "cs_test_b", seams)).toBe("updated");
    expect(stripe.state).toEqual({ customerDefault: "pm_b", subscriptionDefault: { sub_1: "pm_b" } });
  });

  it("is repaired by the older address, which writes the newest card and does not say updated", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const b = memoryBilling({ children: [child] });
    const stripe = stripeFake({ subscriptions: ["sub_1"], sessions: SESSIONS, onSubscriptionWrite: (card) => (card === "pm_b" ? refused() : null) });
    const seams: CardUpdates = { store: b.store, provider: stripeBillingProvider(stripe.client), pause: b.pause };
    expect(await finishCardUpdate("p1", "cs_test_b", seams)).toBe("failed");
    expect(b.updates.get("c1")).toMatchObject({ needsRepair: true, token: null });
    const fixed = stripeFake({ customerDefault: "pm_b", subscriptions: ["sub_1"], sessions: SESSIONS });
    expect(await finishCardUpdate("p1", "cs_test_a", { ...seams, provider: stripeBillingProvider(fixed.client) })).toBe("stale");
    expect(fixed.state).toEqual({ customerDefault: "pm_b", subscriptionDefault: { sub_1: "pm_b" } });
    expect(b.updates.get("c1")).toMatchObject({ sessionId: "cs_test_b", needsRepair: false });
  });
});

describe("a plan start during a card update (the review's second race)", () => {
  const input = { cardSetup: "card-1", customer: "cus_1", price: 79.99, deliveryConfirmed: true };

  it("ends with the Customer and the new plan on the newer card, when the update arrives after the start read the old one", async () => {
    const productReached = latch();
    const releaseProduct = latch();
    const b = memoryBilling({ children: [child] });
    const stripe = stripeFake({ sessions: { cs_test_new: session("cs_test_new", 200, "pm_new") }, onProductRead: async () => { productReached.release(); await releaseProduct.promise; } });
    const seams: CardUpdates = { store: b.store, provider: stripeBillingProvider(stripe.client), pause: b.pause };
    const starting = startPlan(stripe.client, input, undefined, b.store);
    await productReached.promise;
    // The parent's return finds the start holding the lock, so it records the card and cannot say it took effect yet.
    expect(await finishCardUpdate("p1", "cs_test_new", seams)).toBe("unconfirmed");
    releaseProduct.release();
    expect(await starting).toMatchObject({ ok: true, subscription: "sub_new" });
    // The start created the plan on the card it read, then wrote the newer one on the Customer and on that plan.
    expect(stripe.created).toEqual([{ card: "pm_old" }]);
    expect(stripe.state).toEqual({ customerDefault: "pm_new", subscriptionDefault: { sub_new: "pm_new" } });
    expect(b.updates.get("c1")).toMatchObject({ sessionId: "cs_test_new", needsRepair: false, token: null });
    expect(await finishCardUpdate("p1", "cs_test_new", seams)).toBe("stale");
  });

  it("answers busy while an update holds the lock, starts nothing, and starts on the newest card after it", async () => {
    const writeReached = latch();
    const releaseWrite = latch();
    const b = memoryBilling({ children: [child] });
    const stripe = stripeFake({ sessions: { cs_test_new: session("cs_test_new", 200, "pm_new") }, onCustomerWrite: async () => { writeReached.release(); await releaseWrite.promise; } });
    const seams: CardUpdates = { store: b.store, provider: stripeBillingProvider(stripe.client), pause: b.pause };
    const update = finishCardUpdate("p1", "cs_test_new", seams);
    await writeReached.promise;
    expect(await startPlan(stripe.client, input, undefined, b.store)).toEqual({ ok: false, error: "busy" });
    expect(stripe.created).toEqual([]);
    releaseWrite.release();
    expect(await update).toBe("updated");
    expect((await startPlan(stripe.client, input, undefined, b.store)).ok).toBe(true);
    expect(stripe.created).toEqual([{ card: "pm_new" }]);
  });

  it("charges the row's newest card, even when the Customer's default says another", async () => {
    const b = memoryBilling({ children: [child] });
    const stripe = stripeFake({ sessions: { cs_test_new: session("cs_test_new", 200, "pm_new") } });
    expect(await finishCardUpdate("p1", "cs_test_new", { store: b.store, provider: stripeBillingProvider(stripe.client), pause: b.pause })).toBe("updated");
    stripe.state.customerDefault = "pm_other";
    expect((await startPlan(stripe.client, input, undefined, b.store)).ok).toBe(true);
    expect(stripe.created).toEqual([{ card: "pm_new" }]);
  });

  it("answers updated to a return that waited for the start to write its card", async () => {
    const productReached = latch();
    const releaseProduct = latch();
    const b = memoryBilling({ children: [child] });
    const stripe = stripeFake({ sessions: { cs_test_new: session("cs_test_new", 200, "pm_new") }, onProductRead: async () => { productReached.release(); await releaseProduct.promise; } });
    const starting = startPlan(stripe.client, input, undefined, b.store);
    await productReached.promise;
    let tries = 0;
    const update = finishCardUpdate("p1", "cs_test_new", { store: b.store, provider: stripeBillingProvider(stripe.client), pause: async () => { if (++tries === 1) { releaseProduct.release(); await starting; } } });
    expect(await update).toBe("updated");
    expect(stripe.state.customerDefault).toBe("pm_new");
    expect(stripe.state.subscriptionDefault.sub_new).toBe("pm_new");
  });
});

describe("a crash at each step", () => {
  const urls = { returnUrl: "https://unica.test/return", cancelUrl: "https://unica.test/cancel" };
  const running = (): MemorySubscription[] => [{ id: "sub_live", customer: "cus_1", status: "active", defaultCard: "pm_old" }];
  const leaveNoTrace = (b: ReturnType<typeof memoryBilling>) => {
    b.fail.finish = new Error("Process gone");
    b.fail.release = new Error("Process gone");
  };
  const comeBack = (b: ReturnType<typeof memoryBilling>) => {
    delete b.fail.finish;
    delete b.fail.release;
    delete b.fail.setDefault;
    b.refuseOnSubscription.clear();
  };
  const pastTheLock = () => vi.setSystemTime(Date.now() + CARD_LOCK_SECONDS * 1000 + 1);
  const update = async (b: ReturnType<typeof memoryBilling>) => {
    await b.provider.createCardUpdate({ ref: "card-1", customer: "cus_1", parentId: "p1", childId: "c1", ...urls });
    b.complete("cs_test_1", "pm_new");
  };
  const steps: [string, (b: ReturnType<typeof memoryBilling>) => void, { customer?: string; subscription: string }][] = [
    ["before the Customer's write", (b) => { b.fail.setDefault = new Error("Process gone"); }, { subscription: "pm_old" }],
    ["between the Customer's write and the plan's", (b) => { b.refuseOnSubscription.add("pm_new"); }, { customer: "pm_new", subscription: "pm_old" }],
    ["after both writes, before the row is told", () => {}, { customer: "pm_new", subscription: "pm_new" }],
  ];

  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"], now: 5_000_000 }); });

  it.each(steps)("%s: says no card update happened, and the next return writes the card", async (_step, crash, left) => {
    const b = memoryBilling({ children: [child], subscriptions: running() });
    await update(b);
    leaveNoTrace(b);
    crash(b);
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("failed");
    expect(b.customerDefaults.cus_1).toBe(left.customer);
    expect(b.subscriptions[0].defaultCard).toBe(left.subscription);
    expect(b.updates.get("c1")).toMatchObject({ needsRepair: true });
    comeBack(b);
    // The lock is still held: nothing else may write yet, and this return does not claim anything.
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("unconfirmed");
    pastTheLock();
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("updated");
    expect(b.customerDefaults.cus_1).toBe("pm_new");
    expect(b.subscriptions[0].defaultCard).toBe("pm_new");
    expect(b.updates.get("c1")).toMatchObject({ needsRepair: false, token: null });
  });

  it.each(steps)("%s: the next update writes its own card everywhere", async (_step, crash) => {
    const b = memoryBilling({ children: [child], subscriptions: running() });
    await update(b);
    leaveNoTrace(b);
    crash(b);
    await finishCardUpdate("p1", "cs_test_1", b);
    comeBack(b);
    pastTheLock();
    await b.provider.createCardUpdate({ ref: "card-1", customer: "cus_1", parentId: "p1", childId: "c1", ...urls });
    b.complete("cs_test_2", "pm_next");
    expect(await finishCardUpdate("p1", "cs_test_2", b)).toBe("updated");
    expect(b.customerDefaults.cus_1).toBe("pm_next");
    expect(b.subscriptions[0].defaultCard).toBe("pm_next");
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("stale");
  });

  it.each(steps)("%s: a plan start repairs the card first, and starts on it", async (_step, crash) => {
    const b = memoryBilling({ children: [child] });
    await update(b);
    leaveNoTrace(b);
    crash(b);
    await finishCardUpdate("p1", "cs_test_1", b);
    comeBack(b);
    expect(await startPlan(b.stripe, { cardSetup: "card-1", customer: "cus_1", price: 79.99, deliveryConfirmed: true }, undefined, b.store)).toEqual({ ok: false, error: "busy" });
    pastTheLock();
    expect((await startPlan(b.stripe, { cardSetup: "card-1", customer: "cus_1", price: 79.99, deliveryConfirmed: true }, undefined, b.store)).ok).toBe(true);
    expect(b.customerDefaults.cus_1).toBe("pm_new");
    expect(b.subscriptions.map((s) => s.defaultCard)).toEqual(["pm_new"]);
    expect(b.updates.get("c1")).toMatchObject({ needsRepair: false, token: null });
  });

  it("repairs a running plan on the 'already' answer of a plan start, too", async () => {
    const b = memoryBilling({ children: [child], subscriptions: running() });
    await update(b);
    b.refuseOnSubscription.add("pm_new");
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("failed");
    comeBack(b);
    expect(await startPlan(b.stripe, { cardSetup: "card-1", customer: "cus_1", price: 79.99, deliveryConfirmed: true }, undefined, b.store)).toEqual({ ok: false, error: "already" });
    expect(b.subscriptions[0].defaultCard).toBe("pm_new");
    expect(b.updates.get("c1")).toMatchObject({ needsRepair: false, token: null });
  });

  it("a plan start that dies after it made the plan is settled by the next return", async () => {
    const b = memoryBilling({ children: [child] });
    b.paymentMethods.cus_1 = [{ id: "pm_old", type: "card" }];
    leaveNoTrace(b);
    // The plan started, so the answer says so even though the row could not be told.
    expect((await startPlan(b.stripe, { cardSetup: "card-1", customer: "cus_1", price: 79.99, deliveryConfirmed: true }, undefined, b.store)).ok).toBe(true);
    expect(b.updates.get("c1")).toMatchObject({ needsRepair: false, token: expect.any(String) });
    comeBack(b);
    await update(b);
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("unconfirmed");
    pastTheLock();
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("updated");
    expect(b.subscriptions.map((s) => s.defaultCard)).toEqual(["pm_new"]);
  });

  it("a plan start that fails before the plan exists lets go, keeps needs_repair, and throws", async () => {
    const b = memoryBilling({ children: [child] });
    await update(b);
    b.refuseOnSubscription.add("pm_new");
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("failed");
    const down = new Stripe("sk_test_down", { maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient(async () => json({ error: { type: "api_error", message: "down" } }, 500)) });
    await expect(startPlan(down, { cardSetup: "card-1", customer: "cus_1", price: 79.99, deliveryConfirmed: true }, undefined, b.store)).rejects.toThrow();
    expect(b.updates.get("c1")).toMatchObject({ needsRepair: true, token: null });
    expect(b.subscriptions).toEqual([]);
  });

  it("starts no plan without the lock's store, or for a card setup the lock does not know", async () => {
    const b = memoryBilling({ children: [] });
    await expect(startPlan(b.stripe, { cardSetup: "card-1", customer: "cus_1", price: 79.99, deliveryConfirmed: true }, undefined, null)).rejects.toThrow("No card lock");
    await expect(startPlan(b.stripe, { cardSetup: "card-1", customer: "cus_1", price: 79.99, deliveryConfirmed: true }, undefined, b.store)).rejects.toThrow("no card lock");
    expect(b.subscriptions).toEqual([]);
  });
});

describe("the lock", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"], now: 9_000_000 }); });

  it("answers unconfirmed after a short wait, and logs it, when another writer stays on the lock", async () => {
    const b = memoryBilling({ children: [child] });
    await b.store.takeCardLock("card-1");
    b.addSession({ id: "cs_test_x", ref: "card-1", customer: "cus_1", created: 1_800_000_000, paymentMethod: "pm_new" });
    const pause = vi.fn(async () => {});
    expect(await finishCardUpdate("p1", "cs_test_x", { store: b.store, provider: b.provider, pause })).toBe("unconfirmed");
    expect(pause).toHaveBeenCalledTimes(12);
    expect(pause.mock.calls.flat()).toSatisfy((waits: number[]) => waits.reduce((a, w) => a + w, 0) === 6000);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("lock stayed busy"));
    expect(b.calls.setDefault).toBe(0);
    expect(b.updates.get("c1")).toMatchObject({ sessionId: "cs_test_x", needsRepair: true });
  });

  it("starts no Stripe write in the last part of the lock's time, and leaves needs_repair set", async () => {
    const b = memoryBilling({ children: [child] });
    b.addSession({ id: "cs_test_x", ref: "card-1", customer: "cus_1", created: 1_800_000_000, paymentMethod: "pm_new" });
    // A slow store: the time is nearly over before the first write.
    b.duringNextWrite(async () => { vi.setSystemTime(9_000_000 + (CARD_LOCK_SECONDS - 10) * 1000); });
    expect(await finishCardUpdate("p1", "cs_test_x", b)).toBe("failed");
    expect(b.customerDefaults.cus_1).toBeUndefined();
    expect(b.updates.get("c1")).toMatchObject({ needsRepair: true, token: null });
  });

  it("does not take over a lock before it ends, and an old holder's finish is told it lost", async () => {
    const b = memoryBilling({ children: [child] });
    const first = await b.store.takeCardLock("card-1");
    if (first.state !== "taken") throw new Error("Expected the lock");
    vi.setSystemTime(9_000_000 + CARD_LOCK_SECONDS * 1000 - 1);
    expect((await b.store.takeCardLock("card-1")).state).toBe("busy");
    vi.setSystemTime(9_000_000 + CARD_LOCK_SECONDS * 1000 + 1);
    const second = await b.store.takeCardLock("card-1");
    if (second.state !== "taken") throw new Error("Expected the lock");
    expect(await b.store.finishCardLock("card-1", first.token, null, true)).toEqual({ state: "lost" });
    await b.store.releaseCardLock("card-1", first.token);
    expect((await b.store.takeCardLock("card-1")).state).toBe("busy");
  });

  it("a holder that was told it lost answers failed, and writes nothing more", async () => {
    const b = memoryBilling({ children: [child] });
    b.addSession({ id: "cs_test_x", ref: "card-1", customer: "cus_1", created: 1_800_000_000, paymentMethod: "pm_new" });
    b.duringNextWrite(async () => {
      vi.setSystemTime(9_000_000 + CARD_LOCK_SECONDS * 1000 + 1);
      await b.store.takeCardLock("card-1");
    });
    expect(await finishCardUpdate("p1", "cs_test_x", b)).toBe("failed");
    expect(b.calls.setDefault).toBe(1);
    expect(b.updates.get("c1")).toMatchObject({ needsRepair: true });
  });

  it("gives a parent no 'updated' when the row cannot say so", async () => {
    const b = memoryBilling({ children: [child] });
    b.addSession({ id: "cs_test_x", ref: "card-1", customer: "cus_1", created: 1_800_000_000, paymentMethod: "pm_new" });
    b.fail.finish = new Error("Database down");
    expect(await finishCardUpdate("p1", "cs_test_x", b)).toBe("failed");
    expect(b.customerDefaults.cus_1).toBe("pm_new");
    expect(b.updates.get("c1")).toMatchObject({ needsRepair: true, token: null });
  });

  it("does not take another child's lock", async () => {
    const omar: MemoryBillingChild = { parentId: "p1", childId: "c2", firstName: "Omar", card: { id: "card-2", customer: "cus_2", saved: true } };
    const b = memoryBilling({ children: [child, omar] });
    await b.store.takeCardLock("card-1");
    expect((await b.store.takeCardLock("card-2")).state).toBe("taken");
  });

  it("refuses another family's card, and records nothing", async () => {
    const b = memoryBilling({ children: [child] });
    expect(await b.store.takeCardLock("card-1", { parentId: "p2", session: "cs_test_x", created: 1, paymentMethod: "pm_x" })).toEqual({ state: "no_match" });
    expect(b.updates.size).toBe(0);
  });
});
