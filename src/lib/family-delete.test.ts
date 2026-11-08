import { describe, expect, it } from "vitest";
import { DELETE_POLICY, DELETE_WORD, requestFamilyDelete, type ProveCode } from "@/lib/family-delete";
import { HOLD_LEASE_MS, memoryDeleteStore, memoryFamily, memoryPlanStart, memoryPlans, type MemoryFamily } from "@/lib/family-delete-memory";

const PARENT = "11111111-1111-4111-8111-111111111111";
const RIGHT = "123456", WRONG = "000000";
const right: ProveCode = async (code) => (code === RIGHT ? "ok" : "wrong");
const form = (code = RIGHT, confirm: unknown = DELETE_WORD) => ({ code, confirm });

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
    [{ code: RIGHT }],
    [{ code: RIGHT, confirm: "delete" }],
    [{ code: "", confirm: DELETE_WORD }],
    [{ code: 123456, confirm: DELETE_WORD }],
    [{ code: "12345", confirm: DELETE_WORD }],
    [{ code: "1234567", confirm: DELETE_WORD }],
    [{ code: "12345a", confirm: DELETE_WORD }],
    [{ password: "right password", confirm: DELETE_WORD }],
    [null],
  ])("refuses %j and costs no try", async (input) => {
    const h = harness({ plans: { cus_1: ["sub_1"] } });
    expect(await h.send(input)).toEqual({ ok: false, error: "invalid" });
    expect(h.family.attempts.failed).toBe(0);
    expect(h.family.plans.cus_1).toEqual(["sub_1"]);
    expect(h.family.fenced).toBe(false);
  });
});

describe("an open plan start record (review round 5 of PR #593)", () => {
  it("refuses at the check, before any plan stops, and tells nothing else", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] }, openPlanStart: () => true });
    expect(await h.send()).toEqual({ ok: false, error: "plan_start", plansStopped: 0 });
    expect(h.family.plans.cus_1).toEqual(["sub_1"]);
    expect(h.family.fenced).toBe(false);
    expect(h.family.log).toEqual(["claim"]);
  });
  it("refuses at the hold when the record opened after the check, with the plans already stopped counted", async () => {
    let open = false;
    const h = harness({ plans: { cus_1: ["sub_1"] }, openPlanStart: () => open });
    const store = memoryDeleteStore(h.family);
    const seams = { plans: memoryPlans(h.family), store: { ...store, async hold(parent: string, token: string) { open = true; return store.hold(parent, token); } } };
    expect(await requestFamilyDelete(PARENT, form(), right, seams)).toEqual({ ok: false, error: "plan_start", plansStopped: 1 });
    expect(h.family.fenced).toBe(false);
    expect(h.family.deleteHold).toBeNull();
  });
  it("refuses at the request when the record opened after the last read, and lets go of the hold", async () => {
    let open = false;
    const h = harness({ openPlanStart: () => open });
    const store = memoryDeleteStore(h.family);
    const seams = { plans: memoryPlans(h.family), store: { ...store, async request(parent: string, token: string) { open = true; return store.request(parent, token); } } };
    expect(await requestFamilyDelete(PARENT, form(), right, seams)).toEqual({ ok: false, error: "plan_start", plansStopped: 0 });
    expect(h.family.fenced).toBe(false);
    expect(h.family.log).toContain("release");
  });
  it("works again once the record resolves", async () => {
    let open = true;
    const h = harness({ plans: { cus_1: ["sub_1"] }, openPlanStart: () => open });
    expect((await h.send()).ok).toBe(false);
    open = false;
    expect(await h.send()).toEqual({ ok: true, plansStopped: 1 });
    expect(h.family.fenced).toBe(true);
  });
});

describe("the code check", () => {
  it("refuses a wrong code, counts it, and changes nothing else", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] } });
    expect(await h.send(form(WRONG))).toEqual({ ok: false, error: "wrong_code", attemptsLeft: 4 });
    expect(h.family.plans.cus_1).toEqual(["sub_1"]);
    expect(h.family.fenced).toBe(false);
  });
  it("allows 5 tries, then locks for 15 minutes, even for the right code", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] } });
    const left: unknown[] = [];
    for (let i = 0; i < 4; i++) left.push(await h.send(form(WRONG)));
    expect(left.map((r) => (r as { attemptsLeft: number }).attemptsLeft)).toEqual([4, 3, 2, 1]);
    const fifth = h.now + DELETE_POLICY.lockMs;
    expect(await h.send(form(WRONG))).toEqual({ ok: false, error: "locked", retryAt: fifth });
    let asked = 0;
    expect(await h.send(form(), async () => { asked++; return "ok"; })).toEqual({ ok: false, error: "locked", retryAt: fifth });
    expect(asked).toBe(0);
    expect(h.family.plans.cus_1).toEqual(["sub_1"]);
  });
  it("gives a fresh count when the lock has ended", async () => {
    const h = harness();
    for (let i = 0; i < 5; i++) await h.send(form(WRONG));
    h.advance(DELETE_POLICY.lockMs + 1);
    expect(await h.send(form(WRONG))).toEqual({ ok: false, error: "wrong_code", attemptsLeft: 4 });
  });
  it("counts guesses sent together", async () => {
    const h = harness();
    const answers = await Promise.all(Array.from({ length: 7 }, () => h.send(form(WRONG))));
    expect(answers.filter((a) => !a.ok && a.error === "locked")).toHaveLength(3);
  });
  it("clears the count after the right code", async () => {
    const h = harness({ holds: 1 });
    await h.send(form(WRONG));
    await h.send();
    expect(h.family.attempts).toEqual({ failed: 0, lockedUntil: null });
  });
  it("says a code has ended, counts the try, and changes nothing else", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] } });
    expect(await h.send(form(), async () => "ended")).toEqual({ ok: false, error: "code_ended" });
    expect(h.family.attempts.failed).toBe(1);
    expect(h.family.plans.cus_1).toEqual(["sub_1"]);
    expect(h.family.fenced).toBe(false);
  });
  it("throws and changes nothing when the code cannot be read", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] } });
    await expect(h.send(form(), async () => { throw new Error("Database down"); })).rejects.toThrow("Database down");
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
    expect(h.family.log).toEqual(["claim", "stop sub_1", "stop sub_2", "stop sub_3", "hold", "queued"]);
    expect(h.family.plansStopped).toBe(true);
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

describe("no plan starts between the final plan read and the request (review of PR #602)", () => {
  /** The store, with the admin's start route run at one step of the delete. */
  function startAt(h: ReturnType<typeof harness>, step: "hold" | "request") {
    const store = memoryDeleteStore(h.family);
    const start = memoryPlanStart(h.family);
    const answers: string[] = [];
    const run = () => { answers.push(start("cus_1", "sub_new")); };
    const racing = {
      ...store,
      async hold(parent: string, token: string) { if (step === "hold") run(); return store.hold(parent, token); },
      async request(parent: string, token: string) { if (step === "request") run(); return store.request(parent, token); },
    };
    return { answers, send: () => requestFamilyDelete(PARENT, form(), right, { store: racing, plans: memoryPlans(h.family), now: () => h.now }) };
  }
  it("refuses the start route when it runs after the final read and before the write; the request is written and no plan runs", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] } });
    const race = startAt(h, "request");
    expect(await race.send()).toEqual({ ok: true, plansStopped: 1 });
    expect(race.answers).toEqual(["family_unavailable"]);
    expect(h.family.plans.cus_1).toEqual([]);
    expect(h.family.log).toEqual(["claim", "stop sub_1", "hold", "queued"]);
  });
  it("sees a plan the start route made just before the hold, and writes no request; a retry stops it", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] } });
    const race = startAt(h, "hold");
    expect(await race.send()).toEqual({ ok: false, error: "not_finished", plansStopped: 1 });
    expect(race.answers).toEqual(["started"]);
    expect(h.family.fenced).toBe(false);
    expect(h.family.deleteHold).toBeNull();
    expect(await h.send()).toEqual({ ok: true, plansStopped: 1 });
    expect(h.family.plans.cus_1).toEqual([]);
  });
  it("lets the plan start again once a failed delete has let go of its hold", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] }, fail: { readAfterStop: true } });
    expect(await h.send()).toEqual({ ok: false, error: "not_finished", plansStopped: 1 });
    expect(memoryPlanStart(h.family)("cus_1", "sub_2")).toBe("started");
  });
  it("refuses while another delete holds the family, and writes nothing", async () => {
    const h = harness({ deleteHold: { token: "other", until: HOLD_LEASE_MS } });
    expect(await h.send()).toEqual({ ok: false, error: "busy" });
    expect(h.family.fenced).toBe(false);
    expect(h.family.deleteHold?.token).toBe("other");
  });
  it("refuses another live hold at the write itself", async () => {
    const h = harness();
    const store = memoryDeleteStore(h.family);
    expect(await store.hold(PARENT, "mine")).toBe("held");
    expect(await store.hold(PARENT, "other")).toBe("busy");
    expect(await store.request(PARENT, "other")).toBe("busy");
    expect(await store.request(PARENT, "mine")).toBe("requested");
  });
  it("strands no family when the server dies while it holds: the lease ends, and the start route and a new delete work", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] } });
    const store = memoryDeleteStore(h.family);
    expect(await store.hold(PARENT, "dead server")).toBe("held");
    expect(memoryPlanStart(h.family)("cus_1", "sub_2")).toBe("family_unavailable");
    h.family.time += HOLD_LEASE_MS;
    expect(await store.request(PARENT, "dead server")).toBe("busy");
    expect(memoryPlanStart(h.family)("cus_1", "sub_2")).toBe("started");
    expect(await h.send()).toEqual({ ok: true, plansStopped: 2 });
    expect(h.family.plans.cus_1).toEqual([]);
  });
  it("writes no request when the lease ended before the write, since a plan may have started", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] } });
    const store = memoryDeleteStore(h.family);
    const slow = { ...store, async request(parent: string, token: string) { h.family.time += HOLD_LEASE_MS; return store.request(parent, token); } };
    expect(await requestFamilyDelete(PARENT, form(), right, { store: slow, plans: memoryPlans(h.family), now: () => h.now })).toEqual({ ok: false, error: "not_finished", plansStopped: 1 });
    expect(h.family.fenced).toBe(false);
  });
  it("lets go of its own hold only when the hold's answer was lost", async () => {
    const h = harness({ fail: { hold: true } });
    let made = 0;
    const store = memoryDeleteStore(h.family);
    const lost = { ...store, async hold(parent: string, token: string) { await store.hold(parent, token).catch(() => {}); h.family.fail = {}; h.family.deleteHold = { token, until: HOLD_LEASE_MS }; throw new Error("lost"); } };
    expect(await requestFamilyDelete(PARENT, form(), right, { store: lost, plans: memoryPlans(h.family), now: () => h.now, newToken: () => `t${++made}` })).toEqual({ ok: false, error: "not_finished", plansStopped: 0 });
    expect(h.family.deleteHold).toBeNull();
    expect(h.family.log).toContain("release");
  });
});
