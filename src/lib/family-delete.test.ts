import { describe, expect, it } from "vitest";
import { DELETE_POLICY, DELETE_WORD, requestFamilyDelete } from "@/lib/family-delete";
import { memoryDeleteStore, memoryFamily, memoryPlans, type MemoryFamily } from "@/lib/family-delete-memory";
import type { ProvePassword } from "@/lib/parent-pin";

const PARENT = "11111111-1111-4111-8111-111111111111";
const right: ProvePassword = async (password) => (password === "right password" ? "ok" : "wrong");
const form = (password = "right password", confirm: unknown = DELETE_WORD) => ({ password, confirm });

function harness(over: Partial<MemoryFamily> = {}) {
  const family = memoryFamily(over);
  let time = 1_000_000;
  const seams = { store: memoryDeleteStore(family), plans: memoryPlans(family), now: () => time };
  return {
    family,
    advance: (ms: number) => { time += ms; },
    send: (input: unknown = form(), prove = right) => requestFamilyDelete(PARENT, input, prove, seams),
    get now() { return time; },
  };
}

describe("the deliberate form", () => {
  it.each([
    [{ password: "right password" }],
    [{ password: "right password", confirm: "delete" }],
    [{ password: "", confirm: DELETE_WORD }],
    [{ password: 7, confirm: DELETE_WORD }],
    [{ password: "x".repeat(1001), confirm: DELETE_WORD }],
    [null],
  ])("refuses %j and costs no try", async (input) => {
    const h = harness({ plans: { cus_1: ["sub_1"] } });
    expect(await h.send(input)).toEqual({ ok: false, error: "invalid" });
    expect(h.family.attempts.failed).toBe(0);
    expect(h.family.plans.cus_1).toEqual(["sub_1"]);
    expect(h.family.fenced).toBe(false);
  });
});

describe("the password check", () => {
  it("refuses a wrong password, counts it, and changes nothing else", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] } });
    expect(await h.send(form("wrong"))).toEqual({ ok: false, error: "wrong_password", attemptsLeft: 4 });
    expect(h.family.plans.cus_1).toEqual(["sub_1"]);
    expect(h.family.fenced).toBe(false);
  });
  it("allows 5 tries, then locks for 15 minutes, even for the right password", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] } });
    const left: unknown[] = [];
    for (let i = 0; i < 4; i++) left.push(await h.send(form("wrong")));
    expect(left.map((r) => (r as { attemptsLeft: number }).attemptsLeft)).toEqual([4, 3, 2, 1]);
    const fifth = h.now + DELETE_POLICY.lockMs;
    expect(await h.send(form("wrong"))).toEqual({ ok: false, error: "locked", retryAt: fifth });
    let asked = 0;
    expect(await h.send(form(), async () => { asked++; return "ok"; })).toEqual({ ok: false, error: "locked", retryAt: fifth });
    expect(asked).toBe(0);
    expect(h.family.plans.cus_1).toEqual(["sub_1"]);
  });
  it("gives a fresh count when the lock has ended", async () => {
    const h = harness();
    for (let i = 0; i < 5; i++) await h.send(form("wrong"));
    h.advance(DELETE_POLICY.lockMs + 1);
    expect(await h.send(form("wrong"))).toEqual({ ok: false, error: "wrong_password", attemptsLeft: 4 });
  });
  it("counts guesses sent together", async () => {
    const h = harness();
    const answers = await Promise.all(Array.from({ length: 7 }, () => h.send(form("wrong"))));
    expect(answers.filter((a) => !a.ok && a.error === "locked")).toHaveLength(3);
  });
  it("clears the count after the right password", async () => {
    const h = harness({ holds: 1 });
    await h.send(form("wrong"));
    await h.send();
    expect(h.family.attempts).toEqual({ failed: 0, lockedUntil: null });
  });
  it("changes nothing when Auth cannot answer", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] } });
    expect(await h.send(form(), async () => "unavailable")).toEqual({ ok: false, error: "unavailable" });
    expect(h.family.plans.cus_1).toEqual(["sub_1"]);
    expect(h.family.fenced).toBe(false);
  });
});

describe("what must be true before any plan stops", () => {
  it.each([
    [{ admin: true }, "protected"],
    [{ gone: true }, "not_found"],
    [{ holds: 1 }, "busy"],
  ] as const)("%j answers %s, with every plan still running", async (over, error) => {
    const h = harness({ plans: { cus_1: ["sub_1"] }, ...over });
    expect(await h.send()).toEqual({ ok: false, error });
    expect(h.family.plans.cus_1).toEqual(["sub_1"]);
    expect(h.family.fenced).toBe(false);
  });
  it("leaves the family untouched when a customer cannot be found, such as an old booking", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] }, fail: { customers: true } });
    expect(await h.send()).toEqual({ ok: false, error: "unavailable" });
    expect(h.family.plans.cus_1).toEqual(["sub_1"]);
    expect(h.family.fenced).toBe(false);
  });
  it("reads every customer before it stops any plan, so a failed read stops nothing", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"], cus_2: ["sub_2"] }, fail: { read: true } });
    expect(await h.send()).toEqual({ ok: false, error: "unavailable" });
    expect(h.family.plans).toEqual({ cus_1: ["sub_1"], cus_2: ["sub_2"] });
    expect(h.family.fenced).toBe(false);
  });
});

describe("stopping the plans, then queueing", () => {
  it("stops every plan of every child before it queues the deletion", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"], cus_2: ["sub_2", "sub_3"] } });
    expect(await h.send()).toEqual({ ok: true, plansStopped: 3 });
    expect(h.family.log).toEqual(["claim", "stop sub_1", "stop sub_2", "stop sub_3", "queued"]);
    expect(h.family.plans).toEqual({ cus_1: [], cus_2: [] });
    expect(h.family.fenced).toBe(true);
  });
  it("queues a family with no plan", async () => {
    const h = harness();
    expect(await h.send()).toEqual({ ok: true, plansStopped: 0 });
    expect(h.family.fenced).toBe(true);
  });
  it("leaves the family untouched when the only stop fails", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] }, fail: { stop: ["sub_1"] } });
    expect(await h.send()).toEqual({ ok: false, error: "not_finished", plansStopped: 0 });
    expect(h.family.plans.cus_1).toEqual(["sub_1"]);
    expect(h.family.fenced).toBe(false);
  });
  it("says how many plans stopped when a later stop fails, queues nothing, and finishes on a retry", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"], cus_2: ["sub_2"] }, fail: { stop: ["sub_2"] } });
    expect(await h.send()).toEqual({ ok: false, error: "not_finished", plansStopped: 1 });
    expect(h.family.fenced).toBe(false);
    h.family.fail = {};
    expect(await h.send()).toEqual({ ok: true, plansStopped: 1 });
    expect(h.family.plans).toEqual({ cus_1: [], cus_2: [] });
    expect(h.family.fenced).toBe(true);
  });
  it("goes on when a stop worked but its answer was lost: the second read decides", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] }, fail: { stopLost: ["sub_1"] } });
    expect(await h.send()).toEqual({ ok: true, plansStopped: 1 });
    expect(h.family.fenced).toBe(true);
  });
  it("queues nothing when the read after the stops fails", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] }, fail: { readAfterStop: true } });
    expect(await h.send()).toEqual({ ok: false, error: "not_finished", plansStopped: 1 });
    expect(h.family.fenced).toBe(false);
  });
  it("queues nothing when a plan started during the stops, and a retry stops it too", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] } });
    const plans = memoryPlans(h.family);
    let reads = 0;
    const late = { ...plans, async running(customer: string) { if (++reads === 2) h.family.plans.cus_1.push("sub_late"); return plans.running(customer); } };
    expect(await requestFamilyDelete(PARENT, form(), right, { store: memoryDeleteStore(h.family), plans: late, now: () => 1 })).toEqual({ ok: false, error: "not_finished", plansStopped: 1 });
    expect(h.family.fenced).toBe(false);
    expect(await h.send()).toEqual({ ok: true, plansStopped: 1 });
    expect(h.family.plans.cus_1).toEqual([]);
  });
  it("reports plans stopped and nothing queued when a card hold appears at the last step; a retry finishes", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] }, holdBeforeRequest: true });
    expect(await h.send()).toEqual({ ok: false, error: "not_finished", plansStopped: 1 });
    expect(h.family.fenced).toBe(false);
    h.family.holds = 0;
    expect(await h.send()).toEqual({ ok: true, plansStopped: 0 });
    expect(h.family.fenced).toBe(true);
  });
  it("reports plans stopped when the queue write fails; a retry finishes", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] }, fail: { request: true } });
    expect(await h.send()).toEqual({ ok: false, error: "not_finished", plansStopped: 1 });
    h.family.fail = {};
    expect(await h.send()).toEqual({ ok: true, plansStopped: 0 });
    expect(h.family.fenced).toBe(true);
  });
  it("answers again after a lost answer: the request is the same request", async () => {
    const h = harness({ fenced: true });
    expect(await h.send()).toEqual({ ok: true, plansStopped: 0 });
    expect(h.family.fenced).toBe(true);
  });
});
