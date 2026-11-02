import { describe, expect, it } from "vitest";
import { SAFETY_GUIDANCE } from "@/lib/maya";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession } from "@/lib/maya-text";
import { checkTrace, redactTrace } from "@/lib/maya-trace";

const T0 = Date.UTC(2026, 10, 1);
const pkg = SAMPLE_PACKAGES["add-27-39"];
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

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
