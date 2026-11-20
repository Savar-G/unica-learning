import { describe, expect, it } from "vitest";
import { SAFETY_GUIDANCE } from "@/lib/maya";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { createTextSession } from "@/lib/maya-text";
import { checkTrace } from "@/lib/maya-trace";
import { accept, describeSeedBatches, flush, folded, historyLimitSeed, InputOracle, json, pkg, safety, seedRun, T0 } from "@/lib/maya-text-log-harness";

async function goodTrace() {
  const base = ruleMayaModel();
  let active = false;
  const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => active && args[0].state !== "SAFETY" ? safety("immediate") : base.propose(...args) };
  const s = createTextSession({ callId: "oracle", package: pkg, model, clock: () => T0 });
  await s.start(); active = true; await s.child("Someone hurts me.");
  const oracle = new InputOracle();
  oracle.add({ kind: "start" }); oracle.add({ kind: "child", text: "Someone hurts me." }); oracle.add({ kind: "safety", severity: "immediate" });
  return { trace: json(s.trace()), oracle };
}

describe("R424-16: independent oracle rejects all five invalid cases", () => {
  it("R424-16: rejects an earlier check-in as service of a later child", async () => {
    let now = T0;
    const s = createTextSession({ callId: "causal-oracle", package: pkg, model: ruleMayaModel(), clock: () => now });
    await s.start(); now += 20000; await s.tick(); await s.child("56.");
    const trace = json(s.trace()), oracle = new InputOracle();
    oracle.add({ kind: "start" }); oracle.add({ kind: "child", text: "56." }); oracle.assert(trace);
    const ci = trace.turns.findIndex((t) => t.kind === "child");
    trace.turns = trace.turns.slice(0, ci + 1); trace.board = [];
    trace.obligations!.find((o) => o.kind === "child_turn_pending")!.servedBy = trace.turns.findIndex((t) => t.kind === "maya" && t.output?.act === "check_in");
    expect(() => oracle.assert(trace)).toThrow();
  });
  it.each(["missing child", "invalid drop", "teaching after partial", "duplicate safety", "close before safety"])("rejects %s", async (mutation) => {
    const { trace, oracle } = await goodTrace();
    oracle.assert(trace);
    const child = trace.obligations!.find((o) => o.kind === "child_turn_pending")!;
    const guide = trace.turns.find((t) => t.kind === "maya" && t.output?.act === "open")!;
    const safetyTurn = trace.turns.find((t) => t.kind === "maya" && t.output?.act === "safety")!;
    if (mutation === "missing child") trace.obligations = trace.obligations!.filter((o) => o !== child);
    if (mutation === "invalid drop") { child.status = "dropped"; child.reason = "bug"; delete child.servedBy; }
    if (mutation === "teaching after partial") trace.turns.splice(2, 0, { kind: "partial", at: T0, text: "Wait", cancelled: true }, { ...json(guide), ...{ kind: "maya", output: { act: "guide", say: ["A hint"], board: [] } } } as never);
    if (mutation === "duplicate safety") trace.turns.splice(trace.turns.indexOf(safetyTurn) + 1, 0, json(safetyTurn));
    if (mutation === "close before safety") {
      const end = trace.turns.find((t) => t.kind === "maya" && t.output?.act === "close")!;
      trace.turns.splice(trace.turns.indexOf(safetyTurn), 0, json(end));
    }
    expect(() => oracle.assert(trace)).toThrow();
  });
});

// Seeds 1..500 run here; seeds 501..2000 run in parallel in maya-text-log-seeds-{2,3,4}.test.ts.
describeSeedBatches([1, 101, 201, 301, 401]);

describe("reported public-interface reproductions", () => {
  it.each(["concern", "immediate"] as const)("returns %s safety guidance without waiting for a provider after the history limit", async (severity) => {
    const base = ruleMayaModel();
    let armed = false, calls = 0;
    const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => {
      calls++;
      if (!armed) return base.propose(...args);
      if (calls === 2) return safety(severity);
      return new Promise<never>(() => {});
    } };
    const s = createTextSession({ callId: "history-no-wait", package: pkg, model, clock: () => T0, random: 7 });
    await s.start();
    const remaining = async () => {
      const saved = await s.saved();
      return 262144 - (saved.checkpoint?.historyBytes ?? 0) - saved.log!.reduce((bytes, e) => bytes + Buffer.byteLength(JSON.stringify(e)), 0);
    };
    const overhead = [
      { kind: "input", at: T0, event: { type: "child_turn", at: T0, text: "", final: false } },
      { kind: "cancelled", at: T0 },
    ].reduce((bytes, event) => bytes + Buffer.byteLength(JSON.stringify(event)), 0);
    while (await remaining() > 430) {
      const padding = Math.min(1000, await remaining() - 430 - overhead);
      expect(padding).toBeGreaterThanOrEqual(0);
      await s.partial("x".repeat(padding));
    }
    expect(await remaining()).toBe(430);
    expect(s.ended).toBe(false);
    armed = true;

    const out = await s.child("Someone hurts me right now.");

    expect(out.say).toEqual([SAFETY_GUIDANCE[severity]]);
    expect(out.board).toEqual([]);
    expect(out.ended).toMatchObject({ reason: "safety", safetyFlag: true, safetySeverity: severity });
    expect(out.safetyMessage).toBe(SAFETY_GUIDANCE[severity]);
    expect(s.ended).toBe(true);
    expect(calls).toBe(2);
    expect(s.trace().obligations).toContainEqual(expect.objectContaining({ kind: "safety_due", status: "served" }));
    expect(checkTrace(s.trace())).toMatchObject({ ok: true });
  });

  it.each([0, 1])("R424-25: safety at the history limit, seed %i", async (seed) => {
    await historyLimitSeed(seed, new Map());
  });
  it.each([
    { finding: "R424-13: technical failure retains pending safety speech", seed: 8 },
    { finding: "R424-14: writing completion follows the pending correct answer", seed: 1 },
    { finding: "R424-15: stop survives a saved retry and failed provider", seed: 2 },
  ])("$finding", async ({ seed }) => { await seedRun(seed, new Map()); });
});

describe("log boundaries and legacy records", () => {
  it("does not transfer a deferred writing event to a replacement transcript", async () => {
    const base = ruleMayaModel();
    const entered = Promise.withResolvers<void>(), late = Promise.withResolvers<unknown>();
    let held = false;
    const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => {
      if (args[0].childTurn === "66." && !held) { held = true; entered.resolve(); return late.promise; }
      return base.propose(...args);
    } };
    const options = { callId: "writing-owner", package: pkg, model, clock: () => T0 };
    const s = createTextSession(options); await s.start(); await s.child("56.");
    const answer = s.child("66."); await entered.promise;
    const writing = s.writing("done");
    const resumed = createTextSession({ ...options, resume: json(await s.saved()) });
    await s.partial("No, I meant"); await resumed.partial("No, I meant");
    await Promise.all([answer, writing]);
    expect(await resumed.child("No, I meant sixty-six.")).toEqual(await s.child("No, I meant sixty-six."));
    expect(s.session.solved).toBe("child"); expect(s.session.wrote).toBe(false);
    expect(resumed.session).toEqual(s.session);
    late.resolve(accept); await flush();
  });
  it("R424-17: an unchanged safety reading on every proposal gives guidance once and closes", async () => {
    const base = ruleMayaModel();
    let active = false;
    const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => active ? safety("immediate") : base.propose(...args) };
    const s = createTextSession({ callId: "repeated-safety", package: pkg, model, clock: () => T0 });
    await s.start(); active = true;
    const out = await s.child("Someone hurts me now.");
    expect(out.say.filter((text) => text === SAFETY_GUIDANCE.immediate)).toHaveLength(1);
    expect(out.ended?.reason).toBe("safety");
    expect(checkTrace(s.trace())).toMatchObject({ ok: true });
  });
  it.each(["resolve", "reject"])("logs a stale provider %s without changing the fold", async (settlement) => {
    const base = ruleMayaModel();
    const entered = Promise.withResolvers<void>(), late = Promise.withResolvers<unknown>();
    let hold = false;
    const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => { if (hold) { hold = false; entered.resolve(); return late.promise; } return base.propose(...args); } };
    const options = { callId: "stale-log", package: pkg, model, clock: () => T0 };
    const s = createTextSession(options);
    await s.start(); hold = true;
    const child = s.child("56."); await entered.promise;
    const request = (await s.saved()).log!.findLast((e) => e.kind === "request")!;
    await s.partial("No, I meant"); await child;
    await s.child("66.");
    const before = folded(await s.saved());
    if (settlement === "resolve") late.resolve(safety("immediate")); else late.reject(new Error("late failure"));
    await flush();
    const saved = json(await s.saved());
    expect(saved.log!.at(-1)).toMatchObject({ kind: "response", requestId: request.kind === "request" ? request.requestId : -1 });
    expect(folded(saved)).toEqual(before);
    // Cached fields are deliberately wrong. The constructor must derive state from the log.
    saved.session.solved = null;
    saved.session.safety.guided = false;
    saved.turns = []; saved.board = []; saved.obligations = [];
    const resumed = createTextSession({ ...options, resume: saved });
    expect(folded(await resumed.saved())).toEqual(before);
    expect(resumed.session.safety.flagged).toBe(false);
    // Every event boundary, including request, response, review and delivery, can be saved as plain JSON.
    for (let length = 0; length <= saved.log!.length; length++) {
      const prefix = json({ ...saved, log: saved.log!.slice(0, length) });
      const a = createTextSession({ ...options, resume: prefix });
      const b = createTextSession({ ...options, resume: json(await a.saved()) });
      expect(b.session).toEqual(a.session);
      expect(b.trace()).toEqual(a.trace());
    }
  });
  it("keeps the last speech approval in a legacy record without an approval list", async () => {
    const options = { callId: "legacy-approval", package: pkg, model: ruleMayaModel(), clock: () => T0 };
    const s = createTextSession(options); await s.start();
    const out = await s.child("56.");
    const saved = await s.saved(); saved.v = 1; delete saved.log; delete saved.initial; delete saved.approved;
    const resumed = createTextSession({ ...options, resume: saved });
    expect((await resumed.mayaSaid(out.say.at(-1)!)).cancelled).toBe(false);
  });
  it.each([1, 2, 3, 4, 5, 6] as const)("validates trace version %i", async (version) => {
    const s = createTextSession({ callId: "trace-versions", package: pkg, model: ruleMayaModel(), clock: () => T0 });
    await s.start(); await s.child("56.");
    const trace = json(await s.finish()); trace.version = version;
    if (version < 3) delete trace.reviewer;
    expect(checkTrace(trace)).toMatchObject({ ok: true });
  });
  it("reads a legacy saved session without a log", async () => {
    const options = { callId: "legacy", package: pkg, model: ruleMayaModel(), clock: () => T0 };
    const s = createTextSession(options); await s.start(); await s.child("56.");
    const saved = await s.saved(); saved.v = 1; delete saved.log; delete saved.initial;
    const resumed = createTextSession({ ...options, resume: saved });
    expect(await resumed.child("66.")).toEqual(await s.child("66."));
    expect(resumed.trace()).toEqual(s.trace());
  });
});
