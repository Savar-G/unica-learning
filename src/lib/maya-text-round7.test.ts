import { describe, expect, it } from "vitest";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession } from "@/lib/maya-text";
import { checkTrace, traceCounts } from "@/lib/maya-trace";

const T0 = Date.UTC(2026, 10, 1);
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const accept = { version: 2, act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [{ value: { type: "number", value: 66 }, step: "result", verdict: "right" }] } };
const options = () => ({ callId: "round7", package: SAMPLE_PACKAGES["add-27-39"], model: ruleMayaModel(), clock: () => T0 });
async function until(check: () => boolean) {
  for (let i = 0; i < 200; i++) { if (check()) return; await Promise.resolve(); }
  throw new Error("boundary was not reached");
}

describe("round 7 regressions", () => {
  it("R424-18: consumes a received answer before asking an offline provider", async () => {
    const opts = options(), s = createTextSession(opts);
    await s.start(); await s.child("56.");
    const child = s.child("66.");
    let saved = await s.saved();
    for (let i = 0; i < 200 && saved.log?.at(-1)?.kind !== "response"; i++) saved = await s.saved();
    expect(saved.log?.at(-1)?.kind).toBe("response");
    let calls = 0;
    const resumed = createTextSession({ ...opts, resume: json(saved), model: { ...opts.model, propose: async () => { calls++; throw new Error("offline"); } } });
    const out = await resumed.start();
    expect(out.say).toEqual((await child).say);
    expect(resumed.session.solved).toBe("child"); expect(calls).toBe(0);
  });
  it("R424-19: tick cannot deliver a buffered opening during a partial", async () => {
    const opts = options(), s = createTextSession(opts);
    const opening = s.start(); await until(() => s.session.opened);
    await s.partial("Wait"); await opening;
    const resumed = createTextSession({ ...opts, resume: json(await s.saved()) });
    for (const target of [s, resumed]) {
      const out = await target.tick(); expect(out.say).toEqual([]); expect(out.board).toEqual([]);
      expect((await target.child("66.")).say.length).toBeGreaterThan(0);
      expect(checkTrace(target.trace())).toMatchObject({ ok: true });
    }
  });
  it("R424-20: cancelled terminal output agrees with the restored controller", async () => {
    const opts = options(), s = createTextSession(opts); await s.start(); await s.child("56.");
    const closing = s.child("I want to stop.");
    let partial: ReturnType<typeof s.partial> | undefined;
    for (let i = 0; i < 200; i++) { await Promise.resolve(); if (s.session.outcome) { partial = s.partial("Wait"); break; } }
    expect(partial).toBeDefined(); await partial; await closing;
    expect(s.session.outcome).toBeNull();
    const resumed = createTextSession({ ...opts, resume: json(await s.saved()) });
    expect((await resumed.start()).ended).toBeNull(); expect(resumed.trace().outcome).toBeNull();
  });
  it.each(["model", "review"])("R424-21: approval preserves a pending %s request", async (boundary) => {
    const opts = options(), entered = Promise.withResolvers<void>(), late = Promise.withResolvers<unknown>();
    let holding = false, calls = 0;
    const model = { ...opts.model, propose: async (...args: Parameters<typeof opts.model.propose>) => {
      if (holding) {
        calls++; if (calls > 1) throw new Error("replacement provider failed");
        if (boundary === "model") { entered.resolve(); return late.promise; }
        return { version: 2, act: "redirect", reading: { offTopic: true }, parts: [{ talk: "Thanks for telling me." }] };
      }
      return opts.model.propose(...args);
    } };
    const reviewer = { id: "held", promptVersion: "test", review: async () => { entered.resolve(); await late.promise; return { verdict: "pass" as const }; } };
    const s = createTextSession({ ...opts, model, reviewer, freeTalk: true });
    const opening = await s.start(); holding = true;
    const response = s.child(boundary === "model" ? "66." : "I like cats."); await entered.promise;
    const report = s.mayaSaid(opening.say[0]);
    late.resolve(accept);
    expect((await response).cancelled).toBe(false); expect((await report).cancelled).toBe(false);
    expect(calls).toBe(1); if (boundary === "model") expect(s.session.solved).toBe("child");
  });
  it("R424-23: cancelled output cannot approve a late utterance after resume", async () => {
    const opts = options(), s = createTextSession(opts); await s.start();
    const example = await s.child("I don't know how to start."); expect(example.say.length).toBeGreaterThan(1);
    await s.mayaSaid(example.say[0]); await s.partial("Wait");
    const resumed = createTextSession({ ...opts, resume: json(await s.saved()) });
    const out = await resumed.mayaSaid(example.say[1]);
    expect(out.cancelled).toBe(true); expect(resumed.session.state).toBe("REPAIR_MAYA");
    expect(out.say).toEqual([]);
  });
  it("R424-16: rejects service by a check-in before the child input", async () => {
    let now = T0;
    const s = createTextSession({ ...options(), clock: () => now }); await s.start(); now += 20000; await s.tick(); await s.child("56.");
    const trace = json(s.trace()), ci = trace.turns.findIndex((t) => t.kind === "child");
    trace.turns = trace.turns.slice(0, ci + 1); trace.board = [];
    trace.obligations!.find((o) => o.kind === "child_turn_pending")!.servedBy = trace.turns.findIndex((t) => t.kind === "maya" && t.output?.act === "check_in");
    trace.counts = traceCounts(trace.turns);
    expect(checkTrace(trace).ok).toBe(false);
  });
  it("R424-22: keeps the board and ignores old request ids across checkpoints", async () => {
    const opts = options(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<unknown>();
    let hold = false;
    const model = { ...opts.model, propose: async (...args: Parameters<typeof opts.model.propose>) => {
      if (hold) { hold = false; entered.resolve(); return release.promise; }
      return opts.model.propose(...args);
    } };
    const s = createTextSession({ ...opts, model }); await s.start();
    await s.child("I don't know how to start.");
    expect(s.trace().board.length).toBeGreaterThan(0);
    hold = true; const response = s.child("56."); await entered.promise;
    for (let i = 0; i < 100; i++) await s.partial("Wait");
    await response;
    const saved = json(await s.saved()); expect(saved.checkpoint).toBeDefined();
    const resumed = createTextSession({ ...opts, model, resume: saved });
    expect(await resumed.child("66.")).toEqual(await s.child("66."));
    const trace = s.trace();
    release.resolve({ version: 2, act: "safety", parts: [], reading: { safety: "immediate" } });
    for (let i = 0; i < 40; i++) await Promise.resolve();
    expect(s.trace()).toEqual(trace); expect(s.session.safety.flagged).toBe(false);
    expect(resumed.trace()).toEqual(trace); expect(checkTrace(trace)).toMatchObject({ ok: true });
  });
  it("R424-22: closes when the history budget is full and bounds the saved record", async () => {
    const opts = options(), s = createTextSession(opts); await s.start();
    let count = 0;
    while (!s.ended && count < 4000) { await s.partial("Wait ".repeat(50)); count++; }
    expect(s.session.outcome?.reason).toBe("technical_issue");
    const saved = json(await s.saved());
    expect(Buffer.byteLength(JSON.stringify(saved))).toBeLessThan(1000000);
    const resumed = createTextSession({ ...opts, resume: saved });
    expect((await resumed.start()).ended).toEqual(s.session.outcome);
    expect(checkTrace(resumed.trace())).toMatchObject({ ok: true });
  });
  it("R424-22: resumes 1000 partials in a ten-minute call under 200 ms with a bounded tail", async () => {
    let now = T0;
    const opts = { ...options(), clock: () => now }, s = createTextSession(opts); await s.start();
    for (let i = 0; i < 1000; i++) { now += 590; await s.partial(`No, I meant ${i}`); }
    const saved = json(await s.saved());
    const bytes = Buffer.byteLength(JSON.stringify(saved));
    const started = performance.now();
    const resumed = createTextSession({ ...opts, resume: saved }); const out = await resumed.start();
    const ms = performance.now() - started;
    process.stdout.write(JSON.stringify({ finding: "R424-22", partials: 1000, durationMs: now - T0, resumeMs: ms, bytes, logCount: saved.log!.length }) + "\n");
    expect(ms).toBeLessThan(200); expect(saved.log!.length).toBeLessThanOrEqual(128); expect(bytes).toBeLessThan(500000);
    expect(out.say).toEqual([]); expect(checkTrace(resumed.trace())).toMatchObject({ ok: true });
  }, 60000);
});
