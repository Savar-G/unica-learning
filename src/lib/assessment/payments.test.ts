import { expect, it } from "vitest";
import { checkFamilyPayments, type CustomerPayments, type FamilyPaymentStore, type PaymentOperation, type PaymentProgress } from "@/lib/assessment";

// The fresh payment check after a family is frozen (#78, #191). It returns the retention decision. A family that
// stays is never changed in Stripe: open card setups are closed only before a deletion.
const NOW = Date.parse("2026-10-16T12:00:00Z");
const NOTHING: CustomerPayments = { savedCard: false, subscriptions: [] };
const SAVED: CustomerPayments = { savedCard: true, subscriptions: [] };
const DELETE = { action: "delete", rule: "free_test" }, CUSTOMER = { action: "keep", reason: "customer" }, UNKNOWN = { action: "unknown" };
/** A free-test family: its last test is long past 12 months. Its Stripe customers are the ones given. */
const family = (customers: string[]) => ({ cards: customers.map(customer => ({ customer, saved: false })), lastTestAt: "2020-01-01T00:00:00Z" });
const former = (endedAt: string): CustomerPayments => ({ savedCard: true, subscriptions: [{ status: "canceled", endedAt }] });

function fixture() {
  const sessions = new Map<string, string[]>();
  const intents = new Map<string, { id: string; status: string }[]>();
  const pending = new Map<string, PaymentOperation>();
  const progress = new Map<string, PaymentProgress>();
  const expired: string[] = [], canceled: string[] = [], checked: string[] = [];
  let budget = Infinity;
  const step = () => { if (--budget < 0) throw Error("deadline"); };
  const store: FamilyPaymentStore = {
    async pending() { step(); return [...pending.values()]; },
    async reconcile(operation) { step(); pending.delete(operation.id); return "clear"; },
    async openSessions(customer) { step(); return (sessions.get(customer) ?? []).slice(0, 100); },
    async expire(customer, id) { step(); pending.set(id, { kind: "session", customer, id }); expired.push(id); sessions.set(customer, sessions.get(customer)!.filter(s => s !== id)); pending.delete(id); return "clear"; },
    async current(customer) { step(); checked.push(customer); return NOTHING; },
    async progress(customer) { step(); return progress.get(customer) ?? null; },
    async intents(customer, after) { step(); const all = intents.get(customer) ?? []; const start = after ? all.findIndex(i => i.id === after) + 1 : 0; const data = all.slice(start, start + 37).map(i => ({ ...i })); return { data, more: start + data.length < all.length }; },
    async cancel(customer, id) { step(); pending.set(id, { kind: "intent", customer, id }); canceled.push(id); intents.get(customer)!.find(i => i.id === id)!.status = "canceled"; pending.delete(id); return "clear"; },
    async saveProgress(customer, value) { step(); progress.set(customer, { ...value }); },
  };
  return { store, sessions, intents, pending, progress, expired, canceled, checked, budget: (n: number) => { budget = n; } };
}

it("keeps a customer and changes nothing in Stripe, even with an open card page", async () => {
  const f = fixture();
  f.sessions.set("customer", ["open"]);
  f.intents.set("customer", [{ id: "unused", status: "requires_payment_method" }]);
  f.store.current = async () => ({ savedCard: true, subscriptions: [{ status: "active", endedAt: null }] });
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual(CUSTOMER);
  f.store.current = async () => SAVED; // A saved card that waits for the first workbook.
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual(CUSTOMER);
  expect(f.expired).toEqual([]);
  expect(f.canceled).toEqual([]);
});

it("keeps the site's record of a saved card, with or without a Stripe customer", async () => {
  const f = fixture();
  expect(await checkFamilyPayments(f.store, { cards: [{ customer: "customer", saved: true }], lastTestAt: "2020-01-01T00:00:00Z" }, NOW)).toEqual(CUSTOMER);
  expect(await checkFamilyPayments(f.store, { cards: [{ customer: null, saved: true }], lastTestAt: "2020-01-01T00:00:00Z" }, NOW)).toEqual(CUSTOMER);
  expect(f.expired).toEqual([]);
});

it("deletes a former customer 6 months after the end, after closing open card setups; the finished card setup is history", async () => {
  const f = fixture();
  f.sessions.set("customer", ["open"]);
  // Stripe lists the newest first: an unused setup from a later visit, then the setup that saved the card.
  f.intents.set("customer", [{ id: "unused", status: "requires_payment_method" }, { id: "saved", status: "succeeded" }]);
  f.store.current = async () => former("2026-04-16T12:00:00Z");
  const decision = { action: "delete", rule: "former_customer", endedAt: "2026-04-16T12:00:00.000Z" };
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual(decision);
  expect(f.expired).toEqual(["open"]);
  expect(f.canceled).toEqual(["unused"]);
  // A later attempt resumes from the saved progress. The succeeded setup does not reset it.
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual(decision);
  expect(f.progress.get("customer")?.done).toBe(true);
  expect(f.canceled).toEqual(["unused"]);
});

it("keeps a former customer before the deadline and changes nothing in Stripe", async () => {
  const f = fixture();
  f.sessions.set("customer", ["open"]);
  f.store.current = async () => former("2026-04-16T12:00:01Z");
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual({ action: "keep", reason: "former_customer" });
  expect(f.expired).toEqual([]);
});

it("keeps a family whose payments Stripe cannot read, and changes nothing", async () => {
  const f = fixture();
  f.sessions.set("customer", ["open"]);
  f.store.current = async () => { throw Error("Stripe unavailable"); };
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual(UNKNOWN);
  f.store.current = async () => ({ savedCard: false, subscriptions: [{ status: "canceled", endedAt: null }] });
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual(UNKNOWN);
  expect(f.expired).toEqual([]);
});

it("covers eight distinct customers and deduplicates before limiting concurrent customer checks", async () => {
  const f = fixture();
  const ids = Array.from({ length: 8 }, (_, i) => `customer${i}`);
  let active = 0, maximum = 0;
  f.store.current = async customer => { active++; maximum = Math.max(maximum, active); await Promise.resolve(); active--; f.checked.push(customer); return NOTHING; };
  expect(await checkFamilyPayments(f.store, family([...ids, ...ids]), NOW)).toEqual(DELETE);
  expect(maximum).toBe(4);
  expect(f.checked.slice().sort()).toEqual([...ids, ...ids].sort());
});

it("resumes completed cleanup for 32 customers and requires a complete fresh decision on every retry", async () => {
  const f = fixture();
  const ids = Array.from({ length: 32 }, (_, i) => `customer${i}`);
  let result: unknown = UNKNOWN, attempts = 0;
  while ((result as { action: string }).action === "unknown" && attempts++ < 4) {
    f.budget(220);
    result = await checkFamilyPayments(f.store, family(ids), NOW);
  }
  expect(result).toEqual(DELETE);
  expect(attempts).toBeGreaterThan(1);
  expect(f.checked.slice(-32).sort()).toEqual(ids.slice().sort());
  f.budget(220);
  f.store.current = async customer => customer === "customer31" ? SAVED : NOTHING;
  expect(await checkFamilyPayments(f.store, family(ids), NOW)).toEqual(CUSTOMER);
  f.store.current = async () => { throw Error("unknown"); };
  expect(await checkFamilyPayments(f.store, family(ids), NOW)).toEqual(UNKNOWN);
});

it("preserves 1007 session and corresponding intent removals across short pages and repeated limits", async () => {
  const f = fixture();
  const sessionIds = Array.from({ length: 1007 }, (_, i) => `session${i}`);
  const intentIds = Array.from({ length: 1007 }, (_, i) => `intent${i}`);
  f.sessions.set("customer", sessionIds.slice());
  f.intents.set("customer", intentIds.map(id => ({ id, status: "requires_payment_method" })));
  let result: unknown = UNKNOWN, attempts = 0;
  while ((result as { action: string }).action === "unknown" && attempts++ < 30) {
    f.budget(200);
    result = await checkFamilyPayments(f.store, family(["customer"]), NOW);
  }
  expect(result).toEqual(DELETE);
  expect(attempts).toBeGreaterThan(2);
  expect(f.expired.slice().sort()).toEqual(sessionIds.slice().sort());
  expect(f.canceled.slice().sort()).toEqual(intentIds.slice().sort());
  expect(new Set(f.expired).size).toBe(1007);
  expect(new Set(f.canceled).size).toBe(1007);
  expect(f.pending.size).toBe(0);
  expect(f.progress.get("customer")?.done).toBe(true);
});

it("reconciles a lost expiration result through fresh reads without another mutation", async () => {
  const f = fixture();
  f.sessions.set("customer", ["session"]);
  let mutations = 0, remote = "open";
  f.store.expire = async (customer, id) => { mutations++; f.pending.set(id, { kind: "session", customer, id }); remote = "expired"; f.sessions.set(customer, []); throw Error("lost response"); };
  f.store.reconcile = async operation => { expect(remote).toBe("expired"); f.pending.delete(operation.id); return "clear"; };
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual(UNKNOWN);
  expect(f.pending.size).toBe(1);
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual(DELETE);
  expect(mutations).toBe(1);
});

it("keeps unresolved operations and unknown reads, and detects a session completed before expiration", async () => {
  const f = fixture();
  f.pending.set("session", { kind: "session", customer: "customer", id: "session" });
  f.store.reconcile = async () => "unknown";
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual(UNKNOWN);
  expect(f.expired).toHaveLength(0);
  f.pending.clear(); f.sessions.set("customer", ["session"]);
  f.store.expire = async () => "saved";
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual(CUSTOMER);
});

it("rechecks current cards after retry and does not cache a customer clear result", async () => {
  const f = fixture();
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual(DELETE);
  f.store.current = async () => SAVED;
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual(CUSTOMER);
  f.store.current = async () => { throw Error("remote unavailable"); };
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual(UNKNOWN);
});

it("invalidates completed cleanup when a new open session appears and never deletes from its checkpoint", async () => {
  const f = fixture();
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual(DELETE);
  f.sessions.set("customer", ["new-session"]);
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual(UNKNOWN);
  expect(f.expired).toHaveLength(0);
  expect(f.progress.get("customer")?.done).toBe(false);
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual(DELETE);
  expect(f.expired).toEqual(["new-session"]);
});

it("checks new intent history after progress and preserves succeeded and processing protections", async () => {
  const f = fixture();
  f.intents.set("customer", [{ id: "old", status: "canceled" }]);
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual(DELETE);
  f.intents.get("customer")!.unshift({ id: "new", status: "processing" });
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual(UNKNOWN);
  // A family with no subscription that once saved a card is not a free-test family.
  f.intents.get("customer")![0].status = "succeeded";
  expect(await checkFamilyPayments(f.store, family(["customer"]), NOW)).toEqual(CUSTOMER);
  expect(f.canceled).toHaveLength(0);
});

it("awaits every started check after a failure and stops scheduling more customers", async () => {
  const f = fixture();
  const waiting: (() => void)[] = [];
  const started: string[] = [];
  f.store.current = async customer => {
    started.push(customer);
    if (customer === "customer0") throw Error("deadline");
    await new Promise<void>(resolve => waiting.push(resolve));
    throw Error("unknown");
  };
  let finished = false;
  const result = checkFamilyPayments(f.store, family(Array.from({ length: 8 }, (_, i) => `customer${i}`)), NOW).then(r => { finished = true; return r; });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(started).toHaveLength(4);
  expect(finished).toBe(false);
  waiting.forEach(resolve => resolve());
  expect(await result).toEqual(UNKNOWN);
  expect(started).toHaveLength(4);
});

it("keeps an unresolved historical booking unknown instead of treating it as a free test", async () => {
  const f = fixture();
  const booked = { cards: [{ customer: null, saved: false, booking: null }], lastTestAt: "2020-01-01T00:00:00Z" };
  expect(await checkFamilyPayments(f.store, booked, NOW)).toEqual(UNKNOWN);
  expect(f.expired).toEqual([]);
  expect(f.canceled).toEqual([]);
});

for (const [name, payments] of [
  ["waiting saved card", SAVED],
  ["active subscription", { savedCard: false, subscriptions: [{ status: "active", endedAt: null }] }],
] as const) {
  it(`keeps a historical booking with a ${name} at the fresh frozen check`, async () => {
    const f = fixture();
    f.store.bookingCustomers = async () => ["booking_customer"];
    f.store.current = async customer => { expect(customer).toBe("booking_customer"); return { ...payments, subscriptions: [...payments.subscriptions] }; };
    const booked = { cards: [{ customer: null, saved: false, booking: { email: "parent@example.invalid", ref: "booking_ref" } }], lastTestAt: "2020-01-01T00:00:00Z" };
    expect(await checkFamilyPayments(f.store, booked, NOW)).toEqual(CUSTOMER);
    expect(f.expired).toEqual([]);
    expect(f.canceled).toEqual([]);
  });
}

it("rechecks booking links and keeps new cards, live subscriptions and unresolved links at the final read", async () => {
  const booked = { cards: [{ customer: null, saved: false, booking: { email: "parent@example.invalid", ref: "booking_ref" } }], lastTestAt: "2020-01-01T00:00:00Z" };
  for (const final of [SAVED, { savedCard: false, subscriptions: [{ status: "active", endedAt: null }] }]) {
    const f = fixture();
    let reads = 0;
    f.store.bookingCustomers = async () => ["booking_customer"];
    f.store.current = async () => ++reads === 1 ? NOTHING : final;
    expect(await checkFamilyPayments(f.store, booked, NOW)).toEqual(CUSTOMER);
  }
  for (const lastLink of [[], ["new_customer"]]) {
    const f = fixture();
    let links = 0;
    f.store.bookingCustomers = async () => ++links === 1 ? ["booking_customer"] : lastLink;
    expect(await checkFamilyPayments(f.store, booked, NOW)).toEqual(UNKNOWN);
  }
});

it("deletes a former booking customer at six months even with a later test", async () => {
  const f = fixture();
  f.store.bookingCustomers = async () => ["booking_customer"];
  f.store.current = async () => former("2026-01-01T00:00:00Z");
  expect(await checkFamilyPayments(f.store, { cards: [{ customer: null, saved: false, booking: { email: "parent@example.invalid", ref: "booking_ref" } }], lastTestAt: "2026-03-01T00:00:00Z" }, Date.parse("2026-07-01T00:00:00Z")))
    .toEqual({ action: "delete", rule: "former_customer", endedAt: "2026-01-01T00:00:00.000Z" });
});
