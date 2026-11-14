import { describe, expect, it, vi } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { memorySpendSeam } from "@/lib/maya-spend-seam";
import { normalizeTurn } from "@/lib/maya-prepared";
import { checkTrace } from "@/lib/maya-trace";
import type { MayaModel, TurnBrief } from "@/lib/maya-model";

const pkg = SAMPLE_PACKAGES["subtract-52-28"];
const response = () => reply("Let's look at the ones. What is 12 minus 8?", "guide", { step: "ones", level: 2 });
function setup(more: Partial<Parameters<typeof createTextSession>[0]> = {}) {
  const model = conversationalFake({ answer: response });
  const spend = memorySpendSeam(100);
  const session = createTextSession({ callId: "prepared", package: pkg, clock: () => 1000, model, spend, prepareExpected: false, reviewer: fakeTalkReviewer(), ...more });
  return { session, model, spend };
}

describe("prepare then commit", () => {
  it("changes no saved state and sends no speech before final, then reuses one checked request", async () => {
    const spoken: string[] = [];
    const { session, model } = setup({ onSayPart: (text) => spoken.push(text) });
    await session.start();
    spoken.length = 0;
    const before = await session.saved();
    expect(session.prepare("6")).toBe(true);
    expect(await session.saved()).toEqual(before);
    expect(spoken).toEqual([]);
    expect(session.session.done).toEqual([]);
    const out = await session.child("6");
    expect(out.prepared).toBe("hit");
    expect(model.briefs).toHaveLength(1);
    expect(out.say).toEqual(["Let's look at the ones. What is 12 minus 8?"]);
    const saved = await session.saved();
    expect(saved.log?.filter((e) => e.kind === "request")).toHaveLength(1);
    expect(saved.log?.filter((e) => e.kind === "response")).toHaveLength(1);
    expect(session.trace().preparations).toMatchObject([{ status: "used", kind: "interim" }]);
    expect(checkTrace(session.trace()).ok).toBe(true);
    expect(checkTrace({ ...session.trace(), preparations: [{ kind: "interim", status: "used", leadMs: 0, childText: "private" }] }).ok).toBe(false);
  });
  it("calls live on a different final value and aborts the unused request", async () => {
    const { session, model } = setup();
    await session.start();
    expect(session.prepare("6")).toBe(true);
    const out = await session.child("5");
    expect(out.prepared).toBe("miss");
    expect(model.briefs.length).toBeGreaterThanOrEqual(2);
    expect(session.trace().preparations).toMatchObject([{ status: "discarded" }]);
  });
  it.each(["6 no 5", "6?", "6 and I have a dog", "6 stop", "6 help", "6 I am sad", "6 I want to die"])("does not use a prepared reply for %s", async (text) => {
    const { session } = setup();
    await session.start();
    expect(session.prepare("6")).toBe(true);
    const out = await session.child(text);
    expect(out.prepared).not.toBe("hit");
    expect(session.trace().preparations?.some((x) => x.status === "used")).toBe(false);
  });
  it("checks a prepared answer leak on the real commit and repairs it", async () => {
    const model = conversationalFake({ answer: (_brief, n) => n === 0 ? reply("The answer is 24.", "guide", { step: "ones", level: 0 }) : response() });
    const { session } = setup({ model });
    await session.start();
    session.prepare("6");
    const out = await session.child("6");
    expect(out.prepared).toBe("hit");
    expect(out.say.join(" ")).not.toContain("24");
    expect(session.trace().counts.sayRefusals?.reveals_answer).toBe(1);
    expect(model.briefs).toHaveLength(2);
  });
  it("has no prepares without a budget seam and respects a refused take", async () => {
    for (const spend of [undefined, memorySpendSeam(0)]) {
      const { session, model } = setup({ spend });
      await session.start();
      expect(session.prepare("6")).toBe(false);
      expect(model.briefs).toHaveLength(0);
    }
  });
  it.each([false, true])("keeps destination-first assignments out of a prepared hit, stream=%s", async (stream) => {
    const bad = "Write the tens digit as 2. Write the ones digit as 4. What is the whole answer?";
    const spoken: string[] = [];
    const model = conversationalFake({ answer: (brief) => /12 minus 8/.test(brief.childTurn ?? "")
      ? reply("Yes, 12 minus 8 is 4. What is 4 minus 2?", "guide", { step: "tens", reading: { answers: [{ value: { type: "number", value: 4 }, step: "ones", problem: "target", verdict: "right" }] } })
      : reply(bad, "guide", { step: "tens" }), ...(stream ? { stream: { chunk: 5 } } : {}) });
    const { session } = setup({ model, ...(stream ? { onSayPart: (text) => spoken.push(text) } : {}) });
    await session.start();
    await session.child("12 minus 8 is 4.");
    spoken.length = 0;
    expect(session.prepare("5")).toBe(true);
    const out = await session.child("5");
    expect(out.prepared).toBe("hit");
    expect(out.say.join(" ")).not.toContain(bad);
    expect(spoken.join(" ")).not.toMatch(/tens digit as 2/);
    expect(session.session.done).toEqual(["ones"]);
    await session.finish();
  });
  it("starts at most three requests in one turn and shares equal keys", async () => {
    const { session, model } = setup();
    await session.start();
    expect(session.prepare("6")).toBe(true);
    expect(session.prepare("six")).toBe(false);
    expect(session.prepare("5")).toBe(true);
    expect(session.prepare("3")).toBe(true);
    expect(session.prepare("2")).toBe(false);
    expect(model.briefs).toHaveLength(3);
    await session.finish();
  });
  it("keeps prepared requests out of resumed sessions and never reuses a prior turn", async () => {
    const { session, model } = setup();
    await session.start();
    session.prepare("6");
    const resume = await session.saved();
    const other = setup({ resume, model }).session;
    expect((await other.child("6")).prepared).toBe("none");
    const out = await session.child("6");
    expect(out.prepared).toBe("hit");
    expect((await session.child("6")).prepared).toBe("none");
  });
  it("prepares expected and known-wrong values after delivery, and credits only at commit", async () => {
    const model = conversationalFake({ answer: (brief) => {
      if (brief.childTurn === "hi") return reply("Let's look at the ones. What is 12 minus 8?", "guide", { step: "ones", level: 2 });
      const right = brief.childTurn === "4";
      return reply(right ? "4 is right for the ones. What is 4 minus 2?" : "6 is 8 minus 2. What is 12 minus 8?", "guide", { step: right ? "tens" : "ones", level: right ? 0 : 2, reading: { answers: [{ value: { type: "number", value: right ? 4 : 6 }, step: "ones", problem: "target", verdict: right ? "right" : "wrong" }] } });
    } });
    const { session } = setup({ model, prepareExpected: true });
    await session.start();
    const before = session.session.done;
    expect(model.briefs.map((b) => b.childTurn)).toEqual(["4", "6"]);
    expect(before).toEqual([]);
    const out = await session.child("4");
    expect(out).toMatchObject({ prepared: "hit", preparedKind: "expected" });
    expect(session.session.done).toContain("ones");
  });
  it("normalization keeps meaning-bearing punctuation and words", () => {
    expect(normalizeTurn("four")).toBe(normalizeTurn("4."));
    for (const text of ["-4", "4.5", "four no six", "not four", "four?", "wait four", "like four", "4=", "4%", "4/", "(4)"]) expect(normalizeTurn(text)).not.toBe(normalizeTurn("four"));
  });
  it("settles an abort-ignoring request once with its actual cost and never speaks its late reply", async () => {
    let complete!: (reply: unknown) => void;
    let cost!: (usd: number) => void;
    const signals: AbortSignal[] = [];
    const spend = memorySpendSeam(10);
    const settled: { used?: boolean }[] = [];
    const seam = { ...spend, settle: (handle: Parameters<typeof spend.settle>[0], usd: number, how?: { used?: boolean }) => { spend.settle(handle, usd); settled.push(how ?? {}); } };
    const fake = conversationalFake({ answer: response });
    let n = 0;
    const model: MayaModel = { ...fake, propose: (brief, signal, onText, onCost) => {
      signals.push(signal);
      if (n++ === 0) { cost = onCost!; return new Promise((resolve) => { complete = resolve; }); }
      return fake.propose(brief, signal, onText, onCost);
    } };
    const { session } = setup({ model, spend: seam });
    await session.start();
    session.prepare("6");
    await session.child("5");
    expect(signals[0].aborted).toBe(true);
    cost(0.123);
    complete(response());
    await Promise.resolve(); await Promise.resolve();
    expect(spend.settled).toHaveLength(1);
    expect(spend.settled[0].usd).toBe(0.123);
    expect(settled).toEqual([{ used: false }]);
  });
  it("keeps the full reservation when an aborted provider never reports a bill", async () => {
    vi.useFakeTimers();
    try {
      const amounts: number[] = [];
      const model: MayaModel = { id: "unresponsive", promptVersion: "test", output: 3, propose: () => new Promise(() => {}) };
      const { session } = setup({ model, spend: { take: (kind) => ({ kind, micros: 50_000 }), settle: (_handle, usd) => { amounts.push(usd); }, giveBack: () => { throw new Error("sent attempt must not be refunded"); } } });
      await session.start();
      session.prepare("6");
      await session.finish();
      expect(amounts).toEqual([]);
      await vi.advanceTimersByTimeAsync(6_000);
      expect(amounts).toHaveLength(1);
      expect(amounts[0]).toBeGreaterThanOrEqual(0.05);
      expect(session.trace().preparations).toMatchObject([{ status: "discarded", estimated: true }]);
    } finally { vi.useRealTimers(); }
  });
  it("settles an expired equal-key prepare once and calls the live model", async () => {
    vi.useFakeTimers();
    try {
      const spend = memorySpendSeam(20);
      const live = conversationalFake({ answer: response });
      let requests = 0;
      const model: MayaModel = { ...live, propose: (brief, signal, onText, onCost) => requests++ === 0
        ? new Promise(() => {}) : live.propose(brief, signal, onText, onCost) };
      const { session } = setup({ model, spend });
      await session.start();
      expect(session.prepare("6")).toBe(true);
      await vi.advanceTimersByTimeAsync(6_001);
      const out = await session.child("6");
      expect(out.prepared).toBe("miss");
      expect(requests).toBe(2);
      expect(spend.settled).toHaveLength(1);
      expect(spend.settled[0].usd).toBeGreaterThan(0);
      expect(spend.givenBack).toEqual([]);
      await session.finish();
      expect(spend.settled).toHaveLength(1);
      expect(session.trace().preparations).toMatchObject([{ status: "discarded", reason: "stale", estimated: true }]);
    } finally { vi.useRealTimers(); }
  });
  it("does not prepare while child runs; concurrent input cancels a prepared hit without late output", async () => {
    let complete!: (reply: unknown) => void;
    const brief: TurnBrief[] = [];
    const signals: AbortSignal[] = [];
    const model: MayaModel = { id: "pending", promptVersion: "pending", output: 3, propose: (input, signal) => {
      brief.push(input as unknown as TurnBrief); signals.push(signal);
      return brief.length === 1 ? new Promise((resolve) => { complete = resolve; }) : Promise.resolve(response());
    } };
    const spoken: string[] = [];
    const { session } = setup({ model, onSayPart: (text) => spoken.push(text) });
    await session.start(); spoken.length = 0;
    session.prepare("6");
    const first = session.child("6");
    await Promise.resolve(); await Promise.resolve();
    expect(session.prepare("5")).toBe(false);
    const second = session.child("stop");
    complete(reply("The answer is 24.", "guide", { step: "ones", level: 0 }));
    await Promise.all([first, second]);
    expect(signals[0].aborted).toBe(true);
    expect(spoken.join(" ")).not.toContain("24");
  });
});
