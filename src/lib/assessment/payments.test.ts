import { expect, it } from "vitest";
import { checkFamilyPayments, type FamilyPaymentStore, type PaymentOperation, type PaymentProgress } from "@/lib/assessment";

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
    async current(customer) { step(); checked.push(customer); return "clear"; },
    async progress(customer) { step(); return progress.get(customer) ?? null; },
    async intents(customer, after) { step(); const all = intents.get(customer) ?? []; const start = after ? all.findIndex(i => i.id === after) + 1 : 0; const data = all.slice(start, start + 37).map(i => ({ ...i })); return { data, more: start + data.length < all.length }; },
    async cancel(customer, id) { step(); pending.set(id, { kind: "intent", customer, id }); canceled.push(id); intents.get(customer)!.find(i => i.id === id)!.status = "canceled"; pending.delete(id); return "clear"; },
    async saveProgress(customer, value) { step(); progress.set(customer, { ...value }); },
  };
  return { store, sessions, intents, pending, progress, expired, canceled, checked, budget: (n: number) => { budget = n; } };
}

it("covers eight distinct customers and deduplicates before limiting concurrent customer checks", async () => {
  const f = fixture();
  const ids = Array.from({ length: 8 }, (_, i) => `customer${i}`);
  let active = 0, maximum = 0;
  f.store.current = async customer => { active++; maximum = Math.max(maximum, active); await Promise.resolve(); active--; f.checked.push(customer); return "clear"; };
  expect(await checkFamilyPayments(f.store, [...ids, ...ids])).toBe("clear");
  expect(maximum).toBe(4);
  expect(f.checked.slice().sort()).toEqual([...ids, ...ids].sort());
});

it("resumes completed cleanup for 32 customers and requires a complete fresh decision on every retry", async () => {
  const f = fixture();
  const ids = Array.from({ length: 32 }, (_, i) => `customer${i}`);
  let result: string = "unknown", attempts = 0;
  while (result === "unknown" && attempts++ < 4) {
    f.budget(220);
    result = await checkFamilyPayments(f.store, ids);
  }
  expect(result).toBe("clear");
  expect(attempts).toBeGreaterThan(1);
  expect(f.checked.slice(-32).sort()).toEqual(ids.slice().sort());
  f.budget(220);
  f.store.current = async customer => customer === "customer31" ? "saved" : "clear";
  expect(await checkFamilyPayments(f.store, ids)).toBe("saved");
  f.store.current = async () => "unknown";
  expect(await checkFamilyPayments(f.store, ids)).toBe("unknown");
});

it("preserves 1007 session and corresponding intent removals across short pages and repeated limits", async () => {
  const f = fixture();
  const sessionIds = Array.from({ length: 1007 }, (_, i) => `session${i}`);
  const intentIds = Array.from({ length: 1007 }, (_, i) => `intent${i}`);
  f.sessions.set("customer", sessionIds.slice());
  f.intents.set("customer", intentIds.map(id => ({ id, status: "requires_payment_method" })));
  let result: string = "unknown", attempts = 0;
  while (result === "unknown" && attempts++ < 30) {
    f.budget(200);
    result = await checkFamilyPayments(f.store, ["customer"]);
  }
  expect(result).toBe("clear");
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
  expect(await checkFamilyPayments(f.store, ["customer"])).toBe("unknown");
  expect(f.pending.size).toBe(1);
  expect(await checkFamilyPayments(f.store, ["customer"])).toBe("clear");
  expect(mutations).toBe(1);
});

it("keeps unresolved operations and unknown reads, and detects a session completed before expiration", async () => {
  const f = fixture();
  f.pending.set("session", { kind: "session", customer: "customer", id: "session" });
  f.store.reconcile = async () => "unknown";
  expect(await checkFamilyPayments(f.store, ["customer"])).toBe("unknown");
  expect(f.expired).toHaveLength(0);
  f.pending.clear(); f.sessions.set("customer", ["session"]);
  f.store.expire = async () => "saved";
  expect(await checkFamilyPayments(f.store, ["customer"])).toBe("saved");
});

it("rechecks current cards after retry and does not cache a customer clear result", async () => {
  const f = fixture();
  expect(await checkFamilyPayments(f.store, ["customer"])).toBe("clear");
  f.store.current = async () => "saved";
  expect(await checkFamilyPayments(f.store, ["customer"])).toBe("saved");
  f.store.current = async () => { throw Error("remote unavailable"); };
  expect(await checkFamilyPayments(f.store, ["customer"])).toBe("unknown");
});

it("invalidates completed cleanup when a new open session appears and never deletes from its checkpoint", async () => {
  const f = fixture();
  expect(await checkFamilyPayments(f.store, ["customer"])).toBe("clear");
  f.sessions.set("customer", ["new-session"]);
  expect(await checkFamilyPayments(f.store, ["customer"])).toBe("unknown");
  expect(f.expired).toHaveLength(0);
  expect(f.progress.get("customer")?.done).toBe(false);
  expect(await checkFamilyPayments(f.store, ["customer"])).toBe("clear");
  expect(f.expired).toEqual(["new-session"]);
});

it("checks new intent history after progress and preserves succeeded and processing protections", async () => {
  const f = fixture();
  f.intents.set("customer", [{ id: "old", status: "canceled" }]);
  expect(await checkFamilyPayments(f.store, ["customer"])).toBe("clear");
  f.intents.get("customer")!.unshift({ id: "new", status: "processing" });
  expect(await checkFamilyPayments(f.store, ["customer"])).toBe("unknown");
  f.intents.get("customer")![0].status = "succeeded";
  expect(await checkFamilyPayments(f.store, ["customer"])).toBe("saved");
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
    return "unknown";
  };
  let finished = false;
  const result = checkFamilyPayments(f.store, Array.from({ length: 8 }, (_, i) => `customer${i}`)).then(r => { finished = true; return r; });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(started).toHaveLength(4);
  expect(finished).toBe(false);
  waiting.forEach(resolve => resolve());
  expect(await result).toBe("unknown");
  expect(started).toHaveLength(4);
});
