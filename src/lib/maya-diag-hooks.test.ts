// Controller diagnostic hooks (voice audit follow-up): prepareHandleId, onPreparation, withModelAttempt and the trace
// field diagnosticHandleId (version 11). Public interfaces only: createTextSession, checkTrace. Fake models and spend.
import { describe, expect, it } from "vitest";
import { AsyncLocalStorage } from "node:async_hooks";
import { createTextSession } from "@/lib/maya-text";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { memorySpendSeam, type SpendHandle } from "@/lib/maya-spend-seam";
import { checkTrace, TRACE_VERSION } from "@/lib/maya-trace";
import type { MayaModel } from "@/lib/maya-model";

const pkg = SAMPLE_PACKAGES["subtract-52-28"];
const good = () => reply("Let's look at the ones. What is 12 minus 8?", "guide", { step: "ones", level: 2 });
const leak = () => reply("The answer is 24.", "guide", { step: "ones", level: 0 });

/** The one call-local getter the voice worker supplies: a WeakMap on the handle object (no Handle mutation). */
function idGetter() {
  const ids = new WeakMap<SpendHandle, string>();
  let n = 0;
  return (handle: SpendHandle) => { let id = ids.get(handle); if (id === undefined) { id = `h-${++n}`; ids.set(handle, id); } return id; };
}
type Opts = Partial<Parameters<typeof createTextSession>[0]>;
function setup(more: Opts = {}) {
  const model = conversationalFake({ answer: good });
  const spend = memorySpendSeam(100);
  const session = createTextSession({ callId: "diag", package: pkg, clock: () => 1000, model, spend, prepareExpected: false, reviewer: fakeTalkReviewer(), ...more });
  return { session, model, spend };
}
const settledAll = (spend: ReturnType<typeof memorySpendSeam>) => expect(spend.settled.length + spend.givenBack.length).toBe(spend.taken.length);
/** A prepareModel factory that tags the physical request with the same getter result, as the voice worker's does. */
function factory(idOf: (h: SpendHandle) => string, seen: { handle: SpendHandle; id: string }[]) {
  return (handle: SpendHandle): MayaModel => { seen.push({ handle, id: idOf(handle) }); return conversationalFake({ answer: good }); };
}

describe("prepareHandleId and the used/discarded record", () => {
  it("copies the id the factory saw on the same handle object into a used record, with no speech or trace change before final", async () => {
    const idOf = idGetter(); const seen: { handle: SpendHandle; id: string }[] = []; const spoken: string[] = [];
    const { session, spend } = setup({ prepareHandleId: idOf, prepareModel: factory(idOf, seen), onSayPart: (t: string) => spoken.push(t) });
    await session.start(); spoken.length = 0;
    const before = await session.saved(); const traceBefore = session.trace().preparations;
    expect(session.prepare("6")).toBe(true);
    expect(await session.saved()).toEqual(before); expect(session.trace().preparations).toEqual(traceBefore); expect(spoken).toEqual([]);
    const out = await session.child("6");
    expect(out.prepared).toBe("hit");
    expect(seen).toHaveLength(1);
    expect(spend.taken[spend.taken.length - 1 - 0]).toBeDefined();
    const rec = session.trace().preparations!;
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ status: "used", diagnosticHandleId: seen[0].id });
    expect(checkTrace(session.trace()).ok).toBe(true);
    await session.finish(); settledAll(spend);
  });
  it("gives distinct handles distinct ids, and a discarded record carries its own handle's id", async () => {
    const idOf = idGetter(); const seen: { handle: SpendHandle; id: string }[] = [];
    const { session, spend } = setup({ prepareHandleId: idOf, prepareModel: factory(idOf, seen) });
    await session.start();
    expect(session.prepare("6")).toBe(true); expect(session.prepare("7")).toBe(true);
    expect(seen).toHaveLength(2); expect(seen[0].id).not.toBe(seen[1].id);
    await session.child("6");
    const recs = session.trace().preparations!;
    expect(recs.map((r) => r.status).sort()).toEqual(["discarded", "used"]);
    expect(new Set(recs.map((r) => r.diagnosticHandleId)).size).toBe(2);
    for (const r of recs) expect(seen.map((s) => s.id)).toContain(r.diagnosticHandleId);
    await session.finish(); settledAll(spend);
  });
  it("a used record is selection, not acceptance: a leaking prepared reply still fails normal validation", async () => {
    const idOf = idGetter(); const seen: { handle: SpendHandle; id: string }[] = [];
    const { session, spend } = setup({ prepareHandleId: idOf, prepareModel: (h: SpendHandle) => { seen.push({ handle: h, id: idOf(h) }); return conversationalFake({ answer: leak }); } });
    await session.start(); session.prepare("6");
    const out = await session.child("6");
    expect(out.say.join(" ")).not.toContain("24");
    expect(session.trace().preparations?.[0]).toMatchObject({ status: "used", diagnosticHandleId: seen[0].id });
    await session.finish(); settledAll(spend);
  });
  it("a throwing or invalid getter leaves the id missing and the flow, record and exactly-once settlement normal", async () => {
    for (const getter of [() => { throw new Error("boom"); }, () => "", () => 7 as unknown as string, () => "has space"]) {
      const { session, spend } = setup({ prepareHandleId: getter });
      await session.start(); expect(session.prepare("6")).toBe(true);
      const out = await session.child("6");
      expect(out.prepared).toBe("hit");
      const rec = session.trace().preparations![0];
      expect(rec.status).toBe("used"); expect("diagnosticHandleId" in rec).toBe(false);
      expect(checkTrace(session.trace()).ok).toBe(true);
      await session.finish(); settledAll(spend);
      expect(new Set(spend.taken).size).toBe(spend.taken.length);
    }
  });
});

describe("onPreparation", () => {
  it("gets a shallow copy after the record is stored; mutation cannot change the saved record", async () => {
    const got: Record<string, unknown>[] = [];
    const idOf = idGetter();
    const { session, spend } = setup({ prepareHandleId: idOf, onPreparation: (r: unknown) => { got.push(r as Record<string, unknown>); const x = r as Record<string, unknown>; x.status = "discarded"; x.leadMs = -5; x.extra = "words"; delete x.kind; } });
    await session.start(); session.prepare("6"); await session.child("6");
    expect(got).toHaveLength(1);
    expect(session.trace().preparations).toMatchObject([{ status: "used", kind: "interim" }]);
    expect(session.trace().preparations![0]).not.toHaveProperty("extra");
    expect(checkTrace(session.trace()).ok).toBe(true);
    await session.finish(); settledAll(spend);
  });
  it.each([
    ["sync throw", () => { throw new Error("sync"); }],
    ["async rejection", () => Promise.reject(new Error("async"))],
  ])("a %s changes no speech, record, credit or settlement", async (_n, hook) => {
    const base = setup(); await base.session.start(); base.session.prepare("6"); const want = await base.session.child("6");
    const { session, spend } = setup({ onPreparation: hook as never });
    await session.start(); session.prepare("6"); const out = await session.child("6");
    await new Promise((r) => setTimeout(r, 5));
    expect(out.say).toEqual(want.say); expect(out.prepared).toBe("hit");
    expect(session.trace().preparations).toEqual(base.session.trace().preparations);
    await session.finish(); settledAll(spend); expect(spend.settled).toHaveLength(spend.taken.length);
  });
});

describe("withModelAttempt", () => {
  const leakFirst = () => conversationalFake({ answer: (_b, n) => n === 0 ? leak() : good() });
  it("owns the result before synchronous model reentry and sends one request", async () => {
    let again: (() => unknown) | undefined;
    let reenter = false;
    const model = conversationalFake({ answer: () => { if (reenter) { reenter = false; again!(); } return good(); } });
    const { session } = setup({ model, modelRepair: false, withModelAttempt: <T,>(_source: "model" | "repair", run: () => T) => { again = run; return run(); } });
    await session.start();
    model.briefs.length = 0;
    reenter = true;
    await session.child("6");
    expect(model.briefs).toHaveLength(1);
  });
  it("labels the ordinary request model and the repair, one invocation each, and wraps no prepared use", async () => {
    const log: string[] = []; const model = leakFirst();
    const { session } = setup({ model, withModelAttempt: (<T,>(source: "model" | "repair", run: () => T) => { log.push(source); return run(); }) });
    await session.start(); log.length = 0; model.briefs.length = 0;
    await session.child("6");
    expect(log).toEqual(["model", "repair"]); expect(model.briefs).toHaveLength(2);
    const p = setup({ withModelAttempt: (<T,>(s: "model" | "repair", run: () => T) => { log.push("p:" + s); return run(); }) });
    await p.session.start(); log.length = 0; p.session.prepare("6"); await p.session.child("6");
    expect(log).toEqual([]);
  });
  it.each([
    ["calls run twice", (<T,>(_s: string, run: () => T) => { run(); return run(); })],
    ["throws before run", (() => { throw new Error("before"); })],
    ["throws after run", (<T,>(_s: string, run: () => T) => { run(); throw new Error("after"); })],
    ["never calls run", (() => undefined)],
    ["returns a rejected promise", (<T,>(_s: string, run: () => T) => { run(); return Promise.reject(new Error("late")); })],
  ])("sends exactly one request per attempt when the wrapper %s, and keeps the provider result", async (_n, wrap) => {
    const model = leakFirst();
    const { session } = setup({ model, withModelAttempt: wrap as never });
    await session.start(); model.briefs.length = 0;
    const out = await session.child("6");
    await new Promise((r) => setTimeout(r, 5));
    expect(model.briefs).toHaveLength(2);
    expect(out.say.join(" ")).not.toContain("24");
  });
  it("a synchronous throw from the model itself starts no second call", async () => {
    let calls = 0;
    const model: MayaModel = { id: "boom", promptVersion: "x", output: 3, propose: (() => { calls++; throw new Error("model"); }) as never };
    const { session } = setup({ model, withModelAttempt: (<T,>(_s: string, run: () => T) => run()) });
    await session.start(); calls = 0;
    await session.child("6").catch(() => undefined);
    const afterFirst = calls;
    expect(afterFirst).toBeGreaterThanOrEqual(1);
    const model2: MayaModel & { n: number } = { id: "boom", promptVersion: "x", output: 3, n: 0, propose: (() => { model2.n++; throw new Error("model"); }) as never };
    const t = setup({ model: model2, withModelAttempt: (<T,>(_s: string, run: () => T) => { try { return run(); } catch (e) { run(); throw e; } }) });
    await t.session.start(); model2.n = 0; await t.session.child("6").catch(() => undefined);
    const plain = { id: "boom", promptVersion: "x", output: 3 as const, n: 0, propose: (() => { plain.n++; throw new Error("model"); }) as never };
    const u = setup({ model: plain as MayaModel }); await u.session.start(); plain.n = 0; await u.session.child("6").catch(() => undefined);
    expect(model2.n).toBe(plain.n);
  });
  it("binds the source to the original async dispatch across awaits and two interleaved sessions (test-only AsyncLocalStorage)", async () => {
    const als = new AsyncLocalStorage<{ session: string; source: string }>();
    const seen: Record<string, string[]> = { A: [], B: [] };
    const gates: Record<string, (() => void)[]> = { A: [], B: [] };
    const make = (name: string) => {
      const model = conversationalFake({ answer: async (_b, n) => {
        seen[name].push(`call${n}:${als.getStore()?.session}/${als.getStore()?.source}`);
        await new Promise<void>((r) => gates[name].push(r));
        seen[name].push(`after${n}:${als.getStore()?.session}/${als.getStore()?.source}`);
        return n === 0 ? leak() : good();
      } });
      return setup({ model, withModelAttempt: (<T,>(source: "model" | "repair", run: () => T) => als.run({ session: name, source }, run)) });
    };
    const a = make("A"), b = make("B");
    await a.session.start(); await b.session.start();
    for (const k of ["A", "B"]) { seen[k].length = 0; gates[k].length = 0; }
    const pa = a.session.child("6"), pb = b.session.child("6");
    const flush = () => new Promise((r) => setTimeout(r, 5));
    await flush();
    gates.B.shift()!(); await flush(); gates.A.shift()!(); await flush(); gates.B.shift()?.(); gates.A.shift()?.(); await flush();
    for (let i = 0; i < 3; i++) { gates.A.shift()?.(); gates.B.shift()?.(); await flush(); }
    await Promise.all([pa, pb]);
    for (const k of ["A", "B"]) expect(seen[k]).toEqual([`call0:${k}/model`, `after0:${k}/model`, `call1:${k}/repair`, `after1:${k}/repair`]);
  });
});

describe("defaults and the trace contract", () => {
  it("with no hooks the records and speech are the default, and carry no id", async () => {
    const { session } = setup();
    await session.start(); session.prepare("6"); const out = await session.child("6");
    expect(out.prepared).toBe("hit");
    expect(session.trace().preparations![0]).not.toHaveProperty("diagnosticHandleId");
  });
  it("writes the current version and still reads versions 9 to 12", async () => {
    const { session } = setup(); await session.start(); session.prepare("6"); await session.child("6");
    const trace = session.trace();
    // Version 12 (two-layer true math, #1044) adds the math reviews, version 13 the voice repair's thinking phrase and
    // version 14 (B1) the board fates; this file's own field came in version 11.
    expect(TRACE_VERSION).toBe(14); expect(trace.version).toBe(14);
    expect(checkTrace(trace).ok).toBe(true);
    for (const v of [9, 10, 11, 12]) expect(checkTrace({ ...trace, version: v } as never).ok).toBe(true);
  });
  it("accepts diagnosticHandleId only as one short word-free token in version 11, and still refuses unknown fields", async () => {
    const idOf = idGetter(); const seen: { handle: SpendHandle; id: string }[] = [];
    const { session } = setup({ prepareHandleId: idOf, prepareModel: factory(idOf, seen) });
    await session.start(); session.prepare("6"); await session.child("6");
    const trace = session.trace(); const rec = trace.preparations![0];
    const with_ = (p: Record<string, unknown>, v: number = 11) => ({ ...trace, version: v, preparations: [{ ...rec, ...p }] }) as never;
    expect(checkTrace(with_({ diagnosticHandleId: "h-9" })).ok).toBe(true);
    for (const bad of ["", 5, null, "two words", "x".repeat(129)]) expect(checkTrace(with_({ diagnosticHandleId: bad })).ok).toBe(false);
    expect(checkTrace(with_({ diagnosticHandleId: "h-9" }, 10)).ok).toBe(false);
    expect(checkTrace(with_({ note: "words" })).ok).toBe(false);
    expect(checkTrace(with_({ childText: "private" })).ok).toBe(false);
  });
});
