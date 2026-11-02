import { describe, expect, it } from "vitest";
import { SAFETY_GUIDANCE } from "@/lib/maya";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession, type SavedTextSession, type TextSession } from "@/lib/maya-text";
import { checkTrace, redactTrace, type MayaTrace } from "@/lib/maya-trace";

const T0 = Date.UTC(2026, 10, 1);
const pkg = SAMPLE_PACKAGES["add-27-39"];
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

// This model knows input rules only. It does not import controller ordering, offers, or fallbacks.
class Obligations {
  severity: "concern" | "immediate" | null = null;
  repairs: string[] = [];
  content: string[] = [];
  speaking = false;
  safetyAtTurn = 0;
  private recorded = new Map<number, { kind: string; status: string; servedBy?: number; reason?: string }>();
  acceptSafety(severity: "concern" | "immediate", turn: number) {
    this.safetyAtTurn = turn;
    if (this.severity !== "immediate") this.severity = severity;
  }
  report(text: string) { this.repairs.push(text); }
  assertSaved(saved: SavedTextSession) {
    const ledger = saved.obligations!;
    for (const [id, before] of this.recorded) {
      const after = ledger.find((o) => o.id === id);
      expect(after?.kind).toBe(before.kind);
      if (before.status !== "pending") expect(after).toMatchObject(before);
    }
    for (const o of ledger) this.recorded.set(o.id, { kind: o.kind, status: o.status, ...(o.servedBy !== undefined ? { servedBy: o.servedBy } : {}), ...(o.reason !== undefined ? { reason: o.reason } : {}) });
    if (this.severity) {
      expect(saved.session.safety).toMatchObject({ flagged: true, severity: this.severity });
      if (!saved.session.safety.guided) expect(saved.obligations).toContainEqual(expect.objectContaining({ kind: "safety_due", severity: this.severity, status: "pending" }));
    }
    for (const text of this.repairs) expect(saved.obligations).toContainEqual(expect.objectContaining({ kind: "repair_due", text }));
    for (const text of this.content) expect(saved.obligations).toContainEqual(expect.objectContaining({ kind: "content_problem", text }));
    expect(saved.childState).toBe(this.speaking ? "child_speaking" : "listening");
  }
  assertDelivered(trace: MayaTrace) {
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    const responses = trace.turns.flatMap((t) => t.kind === "maya" && t.output ? [t.output] : []);
    if (this.severity) {
      expect(responses.flatMap((o) => o.say)).toContain(SAFETY_GUIDANCE[this.severity]);
      const afterAcceptance = trace.turns.slice(this.safetyAtTurn).flatMap((t) => t.kind === "maya" && t.output ? [t.output.act] : []);
      expect(afterAcceptance.every((act) => act === "safety" || act === "close")).toBe(true);
      const safety = responses.findIndex((o) => o.act === "safety");
      expect(safety).toBeGreaterThanOrEqual(0);
      expect(responses.slice(safety + 1).every((o) => o.act === "safety" || o.act === "close")).toBe(true);
      expect(trace.outcome).toMatchObject({ reason: "safety", safetyFlag: true, safetySeverity: this.severity });
    }
    if (this.content.length && !this.severity) expect(trace.outcome?.reason).toBe("content_issue");
    for (const text of this.repairs) {
      const obligation = trace.obligations!.find((o) => o.kind === "repair_due" && o.text === text);
      expect(obligation).toBeDefined();
      // A higher-priority safety/content close may explicitly drop a repair. It may never disappear.
      if (obligation?.status === "dropped") {
        expect(this.severity !== null || this.content.length > 0).toBe(true);
        expect(obligation.reason).toBeTruthy();
      } else {
        expect(obligation?.status).toBe("served");
        const received = trace.turns.findIndex((t) => t.kind === "maya_said" && t.text === text);
        const beforeRepair = trace.turns.slice(received + 1, obligation!.servedBy).flatMap((t) => t.kind === "maya" && t.output ? [t.output.act] : []);
        expect(beforeRepair.every((act) => act === "safety" || act === "close")).toBe(true);
      }
    }
  }
}

function provider() {
  const base = ruleMayaModel();
  let hold: "any" | "close" | null = null;
  let fail = false;
  let severity: "concern" | "immediate" | null = null;
  const waiting: { response: PromiseWithResolvers<unknown>; proposal: unknown }[] = [];
  const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => {
    if (fail) throw new Error("provider unavailable");
    let proposal: unknown;
    if (severity && args[0].childTurn && args[0].state !== "SAFETY") {
      proposal = { version: 2, act: "safety", parts: [], reading: { safety: severity } };
      severity = null;
    } else proposal = await base.propose(...args);
    if (hold === "any" || (hold === "close" && args[0].state === "SAFETY")) {
      hold = null;
      const response = Promise.withResolvers<unknown>();
      waiting.push({ response, proposal });
      return response.promise;
    }
    return proposal;
  } };
  return { model, waiting, arm: (at: "any" | "close") => { hold = at; }, safety: (value: "concern" | "immediate") => { severity = value; }, offline: (value: boolean) => { fail = value; }, settle: (reject: boolean) => {
    for (const { response, proposal } of waiting.splice(0)) {
      if (reject) response.reject(new Error("late provider failure"));
      else response.resolve(proposal);
    }
  } };
}

// Two independent sessions receive the same schedule. Only the second is replaced after every input.
// At a held request, both originals are also compared with a saved continuation, before any cancellation.
async function interleaving(seed: number, scenario: "safety" | "repair", coverage: Map<string, number>) {
  let rng = seed;
  const random = (n: number) => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) % n; };
  const hit = (key: string) => coverage.set(key, (coverage.get(key) ?? 0) + 1);
  let now = T0;
  const left = provider(), right = provider();
  const options = { callId: `seed-${seed}`, package: pkg, clock: () => now, random: seed };
  const a = createTextSession({ ...options, model: left.model });
  let b = createTextSession({ ...options, model: right.model });
  const reference = new Obligations();
  const checkpoint = async (replace = true) => {
    const saved = json(await a.saved());
    reference.assertSaved(saved);
    expect(json(await b.saved())).toEqual(saved);
    if (replace) b = createTextSession({ ...options, model: right.model, resume: saved });
    hit(a.ended ? "ended_checkpoint" : "live_checkpoint");
    return saved;
  };
  const input = async (invoke: (s: TextSession) => Promise<unknown>) => {
    const x = invoke(a), y = invoke(b);
    // The input must exist even before a queued response callback starts.
    await checkpoint(false);
    expect(await y).toEqual(await x);
    await checkpoint();
  };
  await input((s) => s.start());
  for (let index = 0; index < 4 + random(5); index++) {
    now += random(4000);
    if (random(3) === 0) {
      reference.speaking = true;
      await input((s) => s.partial("No, I meant"));
      await input((s) => s.tick());
      hit("partial_tick");
    }
    reference.speaking = false;
    const fail = random(4) === 0;
    left.offline(fail); right.offline(fail);
    await input((s) => s.child(index === 0 ? "56." : "I am trying."));
    if (fail) hit("ordinary_provider_failure");
    left.offline(false); right.offline(false);
  }
  // Compare reported speech only against approvals that actually reached the caller.
  const approved = (await a.saved()).approved?.[0];
  if (approved && random(2) === 0) { await input((s) => s.mayaSaid(approved)); hit("approved_report"); }
  if (scenario === "safety") {
    const severity = random(2) === 0 ? "concern" : "immediate";
    left.safety(severity); right.safety(severity);
    left.arm("close"); right.arm("close");
    const x = a.child("Someone hurts me right now."), y = b.child("Someone hurts me right now.");
    await flush();
    expect(left.waiting).toHaveLength(1); expect(right.waiting).toHaveLength(1);
    reference.acceptSafety(severity, a.trace().turns.length);
    const saved = await checkpoint(false); // R424-10: accepted reading, unreturned guidance, pending close.
    hit(`${severity}_pending_close`);
    const offline = random(2) === 0;
    left.offline(offline); right.offline(offline);
    const restored = createTextSession({ ...options, model: right.model, resume: saved });
    const replay = await restored.start();
    reference.assertDelivered(restored.trace());
    // Restart the held model with the same failure mode. Draft cancellation cannot change obligations.
    reference.speaking = true;
    await Promise.all([a.partial("Wait"), b.partial("Wait")]);
    expect(await y).toEqual(await x);
    await checkpoint();
    const original = await a.start();
    expect(await b.start()).toEqual(original);
    expect(original).toEqual(replay);
    expect(restored.session).toEqual(a.session);
    reference.assertDelivered(a.trace());
    hit(offline ? "safety_resume_failure" : "safety_resume_success");
  } else {
    left.arm("any"); right.arm("any");
    const x = a.child("I am trying."), y = b.child("I am trying.");
    await flush();
    expect(left.waiting).toHaveLength(1); expect(right.waiting).toHaveLength(1);
    const text = "Seven plus nine is fifteen.";
    reference.report(text);
    const reportA = a.mayaSaid(text), reportB = b.mayaSaid(text);
    const saveA = a.saved(), saveB = b.saved(); // R424-11: save at receipt, before cancelling.
    reference.speaking = true;
    await Promise.all([a.partial("Wait"), b.partial("Wait")]);
    const saved = json(await saveA);
    expect(json(await saveB)).toEqual(saved);
    for (const text of reference.repairs) expect(saved.obligations).toContainEqual(expect.objectContaining({ kind: "repair_due", text, status: "pending" }));
    hit("report_during_request");
    const offline = random(2) === 0;
    left.offline(offline); right.offline(offline);
    const restored = createTextSession({ ...options, model: right.model, resume: saved });
    await restored.partial("Wait");
    expect(await y).toEqual(await x);
    expect(await reportB).toEqual(await reportA);
    await checkpoint();
    reference.speaking = false;
    const out = await a.child("That is wrong.");
    expect(await b.child("That is wrong.")).toEqual(out);
    expect(await restored.child("That is wrong.")).toEqual(out);
    expect(restored.session).toEqual(a.session);
    expect(restored.trace()).toEqual(a.trace());
    expect(a.trace().obligations!.find((o) => o.kind === "repair_due")?.status).toBe("served");
    hit(offline ? "repair_resume_failure" : "repair_resume_success");
    left.offline(false); right.offline(false);
    if (random(2) === 0) {
      const detail = "the worked steps disagree";
      reference.content.push(detail);
      left.arm("any"); right.arm("any");
      const pendingA = a.child("Can you help?"), pendingB = b.child("Can you help?");
      await flush();
      const holdA = a.contentProblem(detail), holdB = b.contentProblem(detail);
      const contentSaved = await checkpoint(false);
      const resumed = createTextSession({ ...options, model: right.model, resume: contentSaved });
      const failed = random(2) === 0;
      left.offline(failed); right.offline(failed);
      const resumedOut = await resumed.start();
      left.settle(false); right.settle(false);
      const continued = await pendingA;
      expect(await pendingB).toEqual(continued);
      expect(await holdB).toEqual(await holdA);
      expect(resumedOut).toEqual(continued);
      expect(resumed.session).toEqual(a.session);
      expect(resumed.trace()).toEqual(a.trace());
      hit(failed ? "content_resume_failure" : "content_resume_success");
    }
    reference.assertDelivered(a.trace());
  }
  left.settle(random(2) === 0); right.settle(random(2) === 0);
  const before = a.trace();
  await flush();
  expect(a.trace()).toEqual(before);
  hit("late_settlement");
  await checkpoint();
}

describe("durable input interleavings against independent obligation rules", () => {
  const batches = (["safety", "repair"] as const).flatMap((scenario) => Array.from({ length: 10 }, (_, batch) => ({ scenario, first: batch * 100 + 1 })));
  it.each(batches)("100 deterministic seeds: $scenario, from $first", async ({ scenario, first }) => {
    const coverage = new Map<string, number>();
    for (let seed = first; seed < first + 100; seed++) {
      try { await interleaving(seed, scenario, coverage); }
      catch (error) { throw new Error(`${scenario} seed ${seed}`, { cause: error }); }
    }
    const required = scenario === "safety" ? ["immediate_pending_close", "concern_pending_close", "safety_resume_failure", "safety_resume_success"] : ["report_during_request", "repair_resume_failure", "repair_resume_success", "content_resume_failure", "content_resume_success"];
    for (const key of [...required, "ordinary_provider_failure", "partial_tick", "approved_report", "late_settlement", "live_checkpoint"]) expect(coverage.get(key), key).toBeGreaterThan(0);
    process.stdout.write(`${JSON.stringify({ scenario, first, seeds: 100, coverage: Object.fromEntries(coverage) })}\n`);
  }, 60000);
});

describe("input receipt snapshots", () => {
  it.each(["repair", "content"] as const)("replays the complete %s output from the receipt snapshot", async (kind) => {
    const options = { callId: "receipt-replay", package: pkg, model: ruleMayaModel(), clock: () => T0 };
    const s = createTextSession(options);
    await s.start();
    await s.child("56.");
    const response = kind === "repair" ? s.mayaSaid("Seven plus nine is fifteen.") : s.contentProblem("the worked steps disagree");
    const saved = json(await s.saved());
    const resumed = createTextSession({ ...options, resume: saved });
    expect(await resumed.start()).toEqual(await response);
    expect(resumed.session).toEqual(s.session);
    expect(resumed.trace()).toEqual(s.trace());
  });
  it("retains a content input at every microtask before terminal output delivery", async () => {
    let accepted = 0;
    for (let delay = 0; delay < 24; delay++) {
      const base = ruleMayaModel();
      let hold: Promise<unknown> | undefined;
      let beforeDelivery = false;
      let arm = false;
      const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => {
        if (arm) {
          arm = false;
          void (async () => {
            for (let i = 0; i < delay; i++) await Promise.resolve();
            beforeDelivery = !s.ended;
            hold = s.contentProblem("the worked steps disagree");
          })();
        }
        return base.propose(...args);
      } };
      const s = createTextSession({ callId: `terminal-${delay}`, package: pkg, model, clock: () => T0 });
      await s.start();
      await s.child("56.");
      arm = true;
      await s.child("I want to stop.");
      await flush();
      await hold;
      if (beforeDelivery) {
        accepted++;
        expect(s.session.outcome?.reason, `delay ${delay}`).toBe("content_issue");
        expect(s.trace().turns.some((t) => t.kind === "content_problem")).toBe(true);
      }
    }
    expect(accepted).toBeGreaterThan(0);
  });
  it("keeps committed approval when speech is reported during a pending request", async () => {
    const model = provider();
    const s = createTextSession({ callId: "approved-pending", package: pkg, model: model.model, clock: () => T0 });
    await s.start();
    const previous = await s.child("56.");
    model.arm("any");
    const child = s.child("I am trying.");
    await flush();
    const report = s.mayaSaid(previous.say[0]);
    const saved = s.saved();
    await s.partial("Wait");
    expect((await saved).turns.at(-1)).toMatchObject({ kind: "maya_said", text: previous.say[0], cancelled: false });
    expect((await saved).obligations!.some((o) => o.kind === "repair_due")).toBe(false);
    await Promise.all([child, report]);
    model.settle(true);
  });
  it("keeps an escalated safety obligation tied to the immediate guidance", async () => {
    const base = ruleMayaModel();
    const late = Promise.withResolvers<unknown>();
    const entered = Promise.withResolvers<void>();
    let stage = 0;
    const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => {
      if (args[0].childTurn && stage === 0) {
        stage++;
        return { version: 2, act: "safety", parts: [], reading: { safety: "concern" } };
      }
      if (args[0].state === "SAFETY" && stage === 1) {
        stage++;
        return { version: 2, act: "safety", parts: [], reading: { safety: "immediate" } };
      }
      const proposal = await base.propose(...args);
      if ((proposal as { act: string }).act === "close" && stage === 2) {
        stage++;
        entered.resolve();
        return late.promise;
      }
      return proposal;
    } };
    const options = { callId: "escalation", package: pkg, model, clock: () => T0 };
    const s = createTextSession(options);
    await s.start();
    const child = s.child("Someone hurts me.");
    await entered.promise;
    const saved = json(await s.saved());
    const resumed = createTextSession({ ...options, resume: saved });
    const replay = await resumed.start();
    late.resolve({ version: 2, act: "close", parts: [{ warm: "closing" }] });
    expect(await child).toEqual(replay);
    expect(s.session).toEqual(resumed.session);
    const obligation = s.trace().obligations!.find((o) => o.kind === "safety_due")!;
    expect(obligation).toMatchObject({ severity: "immediate", status: "served" });
    expect(s.trace().turns[obligation.servedBy!]).toMatchObject({ kind: "maya", output: { say: [SAFETY_GUIDANCE.immediate] } });
  });
  it("copies child alternatives when the complete input arrives", async () => {
    const s = createTextSession({ callId: "owned-alternatives", package: pkg, model: ruleMayaModel(), clock: () => T0 });
    await s.start();
    const alternatives = ["56."];
    const child = s.child("66.", { uncertain: true, alternatives });
    alternatives[0] = "changed after receipt";
    const saved = await s.saved();
    expect(saved.obligations!.at(-1)).toMatchObject({ kind: "child_turn_pending", uncertain: true, alternatives: ["56."] });
    await child;
  });
});

describe("trace v5 obligation payloads", () => {
  it.each([
    ["numeric alternative", { alternatives: [123] }],
    ["null alternative", { alternatives: [null] }],
    ["non-list alternatives", { alternatives: "66" }],
    ["string uncertainty", { uncertain: "yes" }],
    ["missing child text", { text: undefined }],
    ["pending delivery", { servedBy: 1 }],
    ["pending reason", { reason: "done" }],
    ["invalid severity", { severity: "high" }],
    ["irrelevant severity", { severity: "immediate" }],
    ["served reason", { status: "served", servedBy: 1, reason: "done" }],
    ["dropped delivery", { status: "dropped", reason: "done", servedBy: 1 }],
    ["empty drop reason", { status: "dropped", reason: "" }],
    ["missing safety severity", { kind: "safety_due" }],
    ["missing content text", { kind: "content_problem", text: undefined }],
  ])("rejects %s", async (_name, patch) => {
    const s = createTextSession({ callId: "validation", package: pkg, model: ruleMayaModel(), clock: () => T0 });
    await s.start();
    const trace = json(s.trace());
    trace.obligations!.push({ id: 100, kind: "child_turn_pending", at: T0, text: "66", status: "pending", ...patch } as never);
    expect(checkTrace(trace)).toMatchObject({ ok: false });
  });
  it.each([1, 2, 3, 4, 5] as const)("rejects unsafe optional ledgers in version %i", async (version) => {
    const s = createTextSession({ callId: "old-validation", package: pkg, model: ruleMayaModel(), clock: () => T0 });
    await s.start();
    const trace = json(s.trace());
    trace.version = version;
    if (version < 3) delete trace.reviewer;
    trace.obligations!.push({ id: 100, kind: "child_turn_pending", at: T0, text: "66", status: "pending", alternatives: [123] } as never);
    expect(checkTrace(trace)).toMatchObject({ ok: false });
  });
  it("all accepted obligation payloads can be redacted", async () => {
    const s = createTextSession({ callId: "redaction", package: pkg, model: ruleMayaModel(), clock: () => T0 });
    await s.start();
    await s.child("56.", { uncertain: false, alternatives: ["Ava says 66"] });
    await s.mayaSaid("Seven plus nine is fifteen.");
    await s.contentProblem("the worked steps disagree");
    const checked = checkTrace(json(s.trace()));
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(() => redactTrace(checked.trace, "Ava")).not.toThrow();
  });
});
