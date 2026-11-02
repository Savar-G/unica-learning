import { describe, expect, it } from "vitest";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession, type TextOutput, type TextSession } from "@/lib/maya-text";
import { checkTrace } from "@/lib/maya-trace";
import { SAFETY_GUIDANCE } from "@/lib/maya";

const T0 = Date.UTC(2026, 10, 1);
const pkg = SAMPLE_PACKAGES["add-27-39"];
function fixture(heldAct: string) {
  let now = T0;
  const base = ruleMayaModel();
  const entered = Promise.withResolvers<void>();
  const late = Promise.withResolvers<unknown>();
  let held = false;
  const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => {
    const proposal = await base.propose(...args);
    if (!held && (proposal as { act: string }).act === heldAct) {
      held = true;
      entered.resolve();
      return late.promise;
    }
    return proposal;
  } };
  const options = { callId: "obligations", package: pkg, model, clock: () => now, random: 7 };
  const session = createTextSession(options);
  return { session, options, entered, late, advance: (ms: number) => { now += ms; } };
}

describe("cancellation keeps pending work", () => {
  it("R424-6: a cancelled repair remains due, including after JSON resume", async () => {
    const { session, options, entered, late } = fixture("repair");
    await session.start();
    await session.child("56.");
    const repair = session.mayaSaid("Seven plus nine is fifteen.");
    await entered.promise;
    await session.partial("No, that is");
    expect((await repair).say).toEqual([]);
    const resumed = createTextSession({ ...options, resume: JSON.parse(JSON.stringify(await session.saved())) });
    const out = await session.child("That is wrong.");
    expect(await resumed.child("That is wrong.")).toEqual(out);
    const acts = session.trace().turns.flatMap((t) => t.kind === "maya" ? [t.output?.act] : []);
    expect(acts[2]).toBe("repair");
    const before = session.trace();
    late.resolve({ version: 2, act: "repair", parts: [{ line: "repair.sorry" }] });
    await Promise.resolve();
    expect(session.trace()).toEqual(before);
  });

  it("R424-7: a cancelled opening is delivered before the pending answer is judged", async () => {
    const { session, options, entered, late } = fixture("open");
    const start = session.start();
    await entered.promise;
    await session.partial("Sixty");
    await start;
    const resumed = createTextSession({ ...options, resume: JSON.parse(JSON.stringify(await session.saved())) });
    const out = await session.child("66.");
    expect(await resumed.child("66.")).toEqual(out);
    expect(out.say.join(" ")).toContain("AI");
    expect(session.session.solved).toBe("child");
    expect(checkTrace(session.trace()).ok).toBe(true);
    late.resolve({ version: 2, act: "open", parts: [{ line: "open.hello" }] });
  });

  it("R424-8: start followed immediately by partial cannot leave READY", async () => {
    const session = createTextSession({ callId: "immediate", package: pkg, model: ruleMayaModel(), clock: () => T0 });
    const start = session.start();
    expect((await session.partial("Hello")).cancelled).toBe(true);
    expect((await start).say).toEqual([]);
    expect(session.session.startedAt).toBe(T0);
    expect(session.session.state).not.toBe("READY");
    await session.child("66.");
    expect(session.session.solved).toBe("child");
  });

  it("R424-9: ticks at the silence boundary cannot answer a partial", async () => {
    const { session, advance, options } = fixture("unused");
    await session.start();
    await session.child("56.");
    advance(19000);
    await session.partial("No, I meant");
    advance(1000);
    const resumed = createTextSession({ ...options, resume: JSON.parse(JSON.stringify(await session.saved())) });
    const out = await session.tick();
    expect(out.say).toEqual([]);
    expect(out.board).toEqual([]);
    expect(await resumed.tick()).toEqual(out);
    await session.child("66.");
    expect(session.session.solved).toBe("child");
    expect(checkTrace(session.trace()).ok).toBe(true);
  });

  it("saves an in-flight opening as pending work, without saving its draft", async () => {
    const { session, options, entered, late } = fixture("open");
    const start = session.start();
    await entered.promise;
    const saved = JSON.parse(JSON.stringify(await session.saved()));
    expect(saved.session.opened).toBe(false);
    expect(saved.obligations).toContainEqual(expect.objectContaining({ kind: "opening_due", status: "pending" }));
    const resumed = createTextSession({ ...options, resume: saved });
    const replay = await resumed.start();
    late.resolve({ version: 2, act: "open", parts: [{ line: "open.hello" }] });
    expect((await start).say.length).toBeGreaterThan(0);
    expect(replay.say.length).toBeGreaterThan(0);
    expect(resumed.session.opened).toBe(true);
  });

  it.each([false, true])("safety precedes a replayed opening and a pending content close: %s", async (content) => {
    const base = ruleMayaModel();
    const entered = Promise.withResolvers<void>();
    const late = Promise.withResolvers<unknown>();
    let first = true;
    const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => {
      if (first) { first = false; entered.resolve(); return late.promise; }
      if (args[0].childTurn?.includes("hurts")) return { version: 2, act: "safety", parts: [], reading: { safety: "concern" } };
      return base.propose(...args);
    } };
    const session = createTextSession({ callId: "safety-priority", package: pkg, model, clock: () => T0 });
    const start = session.start();
    await entered.promise;
    const hold = content ? session.contentProblem("the worked steps disagree") : null;
    await session.partial("Someone");
    const child = session.child("Someone at home hurts me.");
    const outputs = await Promise.all([start, child, ...(hold ? [hold] : [])]);
    expect(outputs.flatMap((o) => o.say)).toContain(SAFETY_GUIDANCE.concern);
    expect(session.trace().outcome).toMatchObject({ reason: "safety" });
    expect(checkTrace(session.trace())).toMatchObject({ ok: true });
    late.resolve({ version: 2, act: "open", parts: [{ line: "open.hello" }] });
  });

  it("a new complete input is durable even before its queued callback runs", async () => {
    const { session, options, entered, late } = fixture("open");
    const start = session.start();
    await entered.promise;
    const child = session.child("66.");
    const saved = JSON.parse(JSON.stringify(await session.saved()));
    expect(saved.obligations).toContainEqual(expect.objectContaining({ kind: "child_turn_pending", text: "66.", status: "pending" }));
    const resumed = createTextSession({ ...options, resume: saved });
    const out = await child;
    expect(await resumed.start()).toEqual(out);
    expect((await start).say).toEqual([]);
    expect(session.session.solved).toBe("child");
    late.resolve({ version: 2, act: "open", parts: [{ line: "open.hello" }] });
  });

  it("the explicit call timeout ends child_speaking without speech", async () => {
    const { session, advance } = fixture("unused");
    await session.start();
    await session.partial("Wait");
    advance(600000);
    const out = await session.tick();
    expect(out).toMatchObject({ say: [], board: [], ended: { reason: "time_limit" } });
    expect(checkTrace(session.trace())).toMatchObject({ ok: true });
  });

  it("discarding a buffered opening for content keeps a received safety reading", async () => {
    const base = ruleMayaModel();
    const entered = Promise.withResolvers<void>();
    const late = Promise.withResolvers<unknown>();
    let calls = 0;
    const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => {
      if (++calls === 1) { entered.resolve(); return late.promise; }
      if (args[0].state === "ASSESS") {
        void session.contentProblem("the worked steps disagree");
        return { version: 2, act: "safety", parts: [], reading: { safety: "concern" } };
      }
      return base.propose(...args);
    } };
    const session = createTextSession({ callId: "buffered-safety", package: pkg, model, clock: () => T0 });
    const start = session.start();
    await entered.promise;
    await session.partial("Someone");
    await start;
    const out = await session.child("Someone at home hurts me.");
    expect(out.say).toContain(SAFETY_GUIDANCE.concern);
    expect(out.ended).toMatchObject({ reason: "safety" });
    expect(session.trace().turns.flatMap((t) => t.kind === "maya" ? [t.output?.act] : [])).toEqual(["safety", "close"]);
    expect(checkTrace(session.trace())).toMatchObject({ ok: true });
    late.resolve({ version: 2, act: "open", parts: [{ line: "open.hello" }] });
  });

  it("seeded interleavings preserve obligations, cancellation, and resume", async () => {
    const coverage = new Set<string>();
    for (let seed = 1; seed <= 32; seed++) {
      let rng = seed;
      const random = (n: number) => {
        rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5;
        return (rng >>> 0) % n;
      };
      let now = T0;
      const makeModel = () => {
        const base = ruleMayaModel();
        let hold = false;
        const waiting: { response: PromiseWithResolvers<unknown>; proposal: unknown }[] = [];
        return {
          model: { ...base, propose: async (...args: Parameters<typeof base.propose>) => {
            const proposal = await base.propose(...args);
            if (!hold) return proposal;
            hold = false;
            const response = Promise.withResolvers<unknown>();
            waiting.push({ response, proposal });
            return response.promise;
          } },
          arm: () => { hold = true; },
          clear: () => { hold = false; },
          waiting,
        };
      };
      const left = makeModel();
      const right = makeModel();
      const options = { callId: `seed-${seed}`, package: pkg, clock: () => now, random: seed };
      const session = createTextSession({ ...options, model: left.model });
      let resumed = createTextSession({ ...options, model: right.model });
      let speaking = false;
      const known = new Map<number, string>();
      const late: (() => void)[] = [];
      const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
      const actions = ["start", "partial", "child", "mayaSaid", "tick", "late", "contentProblem"];
      for (let index = 0; index < 24; index++) {
        now += random(21000);
        // Start first. Content holds come late enough to exercise active sessions in every seed.
        const action = index === 0 ? "start" : actions[random(index < 18 ? 6 : 7)];
        coverage.add(action);
        if (action === "late") {
          const before = session.trace();
          late.splice(random(Math.max(late.length, 1)), 1)[0]?.();
          await settle();
          expect(session.trace()).toEqual(before);
        } else {
          const text = action === "child" ? ["56.", "66.", "I don't know how to start."][random(3)] : "No, I meant";
          const invoke = (s: TextSession): Promise<TextOutput> => {
            switch (action) {
              case "start": return s.start();
              case "partial": return s.partial(text);
              case "child": return s.child(text);
              case "mayaSaid": return s.mayaSaid("Seven plus nine is fifteen.");
              case "contentProblem": return s.contentProblem("the worked steps disagree");
              default: return s.tick();
            }
          };
          const held = random(3) === 0 && !session.ended;
          if (held) { left.arm(); right.arm(); }
          if (action === "partial" && !session.ended) speaking = true;
          if (action === "child") speaking = false;
          const a = invoke(session);
          const b = invoke(resumed);
          let checkpoint: TextSession | null = null;
          await settle();
          if (left.waiting.length || right.waiting.length) {
            coverage.add("held_response");
            expect(left.waiting.length).toBe(right.waiting.length);
            // Snapshot while the provider is pending, before cancelling. This must not wait for the model.
            const saved = JSON.parse(JSON.stringify(await session.saved()));
            const other = JSON.parse(JSON.stringify(await resumed.saved()));
            expect({ ...saved, initial: undefined, log: undefined, checkpoint: undefined, nextRequestId: undefined }).toEqual({ ...other, initial: undefined, log: undefined, checkpoint: undefined, nextRequestId: undefined });
            checkpoint = createTextSession({ ...options, model: right.model, resume: saved });
            expect(session.session).toEqual((await session.saved()).session);
            const stop = await session.partial("Wait");
            expect(await resumed.partial("Wait")).toEqual(stop);
            expect(await checkpoint.partial("Wait")).toEqual(stop);
            speaking = true;
            const x = left.waiting.shift()!;
            const y = right.waiting.shift()!;
            const reject = random(2) === 0;
            late.push(() => {
              if (reject) { x.response.reject(new Error("late")); y.response.reject(new Error("late")); }
              else { x.response.resolve(x.proposal); y.response.resolve(y.proposal); }
            });
          }
          left.clear(); right.clear();
          const out = await a;
          expect(await b).toEqual(out);
          if (checkpoint) {
            expect(checkpoint.trace()).toEqual(resumed.trace());
            resumed = checkpoint;
          }
          const urgent = action === "contentProblem" || session.ended;
          if (speaking && !urgent) {
            expect(out.say, `seed ${seed}, action ${index}: ${action}`).toEqual([]);
            expect(out.board).toEqual([]);
          }
        }
        expect(session.session.state).not.toBe("READY");
        expect(checkTrace(session.trace()), `seed ${seed}, action ${index}`).toMatchObject({ ok: true });
        const ledger = session.trace().obligations!;
        for (const [id, kind] of known) expect(ledger).toContainEqual(expect.objectContaining({ id, kind }));
        for (const o of ledger) {
          known.set(o.id, o.kind);
          if (o.status === "dropped") expect(o.reason).toBeTruthy();
          if (session.ended) expect(o.status).not.toBe("pending");
        }
        expect(session.trace()).toEqual(resumed.trace());
        const saved = JSON.parse(JSON.stringify(await resumed.saved()));
        const live = JSON.parse(JSON.stringify(await session.saved()));
        // A resumed process records recovery and replacement requests. Compare the fold, not transport history.
        expect({ ...live, initial: undefined, log: undefined, checkpoint: undefined, nextRequestId: undefined }).toEqual({ ...saved, initial: undefined, log: undefined, checkpoint: undefined, nextRequestId: undefined });
        resumed = createTextSession({ ...options, model: right.model, resume: saved });
      }
      for (const release of late) release();
      await settle();
      const final = await session.finish({ reason: "child_stopped" });
      expect(await resumed.finish({ reason: "child_stopped" })).toEqual(final);
      expect(checkTrace(final)).toMatchObject({ ok: true });
      expect(final.obligations!.every((o) => o.status !== "pending")).toBe(true);
    }
    expect([...coverage].sort()).toEqual(["child", "contentProblem", "held_response", "late", "mayaSaid", "partial", "start", "tick"]);
  });
});
