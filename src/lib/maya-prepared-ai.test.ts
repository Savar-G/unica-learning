import { describe, expect, it, vi } from "vitest";
import { openRouterClient } from "@/lib/ai-openrouter";
import { preparedAi } from "@/lib/maya-prepared-ai";
import { createBudget, type Handle } from "@/lib/maya-spend-block";
import { createTextSession } from "@/lib/maya-text";
import { conversationalMayaModel } from "@/lib/maya-model";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import type { AiJsonRequest } from "@/lib/ai-client";

const request: AiJsonRequest = { name: "test", system: "s", content: [{ type: "text", text: "t" }], schema: {} };
const response = () => reply("Let's look at the ones. What is 12 minus 8?", "guide", { step: "ones", level: 2 });
const signal = () => new AbortController().signal;
function setup() {
  let id = 0;
  const reserved: number[] = [];
  const settled: number[] = [];
  const budget = createBudget({ modelMicros: 50_000, reviewMicros: 10_000, clock: () => 1000, newId: () => String(++id),
    usdToMicros: (usd) => Math.ceil(usd * 1_000_000), reserve: async (_id, micros) => { reserved.push(micros); return { ok: true }; },
    settle: async (_id, micros) => { settled.push(micros); } });
  return { budget, reserved, settled };
}
const make = (hooks: Parameters<Parameters<typeof preparedAi>[0]>[0]) => openRouterClient({ apiKey: "fake", model: "anthropic/claude-sonnet-5.5", ...hooks });
const stream = (usd: number) => {
  const text = JSON.stringify(response());
  return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { cost: usd } })}\n\ndata: [DONE]\n\n`,
    { headers: { "content-type": "text/event-stream" } });
};

describe("one prepared request uses one existing budget handle", () => {
  it("does not dispatch a retry or a second request on the same handle", async () => {
    const t = setup(); await t.budget.open();
    const handle = t.budget.seam.take("speculative")!;
    const net = vi.fn(async () => new Response("unavailable", { status: 503 }));
    const client = preparedAi(make, t.budget, handle, net);
    await expect(client.json(request, signal())).rejects.toThrow();
    await expect(client.json(request, signal())).rejects.toThrow();
    expect(net).toHaveBeenCalledTimes(1);
    expect(t.reserved).toHaveLength(1);
    t.budget.seam.settle(handle, 0.05, { used: false });
    await t.budget.stop();
    expect(t.settled).toEqual([50_000]);
  });
  it("checks ownership again if stop occurs after onRequest but before fetch", async () => {
    const t = setup(); await t.budget.open();
    const handle = t.budget.seam.take("speculative")!;
    const net = vi.fn(async () => stream(0.0042));
    const costs: number[] = [];
    const client = preparedAi((hooks) => ({ model: "fake", json: async () => {
      await hooks.onRequest();
      void t.budget.stop();
      return hooks.fetch("https://unused.invalid");
    } }), t.budget, handle, net);
    await expect(client.json({ ...request, onCost: (usd) => costs.push(usd) }, signal())).rejects.toThrow();
    expect(net).not.toHaveBeenCalled();
    expect(costs).toEqual([0]);
    t.budget.seam.settle(handle, 0, { used: false });
    await t.budget.stop();
    expect(t.settled).toEqual([0]);
  });
  it("keeps concurrent request handles separate", async () => {
    const t = setup(); await t.budget.open();
    const a = t.budget.seam.take("speculative")!;
    const b = t.budget.seam.take("speculative")!;
    const seen: Handle[] = [];
    const client = (handle: Handle) => preparedAi(make, { canSend: (given) => { expect(given).toBe(handle); return t.budget.canSend(given); } }, handle,
      async () => { seen.push(handle); return stream(0.0042); });
    await Promise.all([client(a).json({ ...request, onText: () => {} }, signal()), client(b).json({ ...request, onText: () => {} }, signal())]);
    expect(seen).toEqual([a, b]);
    expect(t.reserved).toHaveLength(1);
    expect(t.budget.seam.take("speculative")).toBeNull();
    t.budget.seam.settle(a, 0.0042, { used: true });
    t.budget.seam.settle(b, 0.0042, { used: false });
    await t.budget.stop();
    expect(t.budget.totals()).toMatchObject({ speculative: 8400, speculativeUsed: 4200, model: 0 });
  });
  it.each([true, false])("waits for the final use decision after stream completion, used=%s", async (used) => {
    const t = setup(); await t.budget.open();
    const parts: string[] = [];
    const normal = conversationalFake({ answer: response });
    let reported!: () => void;
    const costSeen = new Promise<void>((resolve) => { reported = resolve; });
    const net = vi.fn(async () => stream(0.0042));
    const session = createTextSession({ callId: "prepared-budget", package: SAMPLE_PACKAGES["subtract-52-28"], model: normal,
      clock: () => 1000, spend: t.budget.seam, prepareExpected: false, reviewer: fakeTalkReviewer(), onSayPart: (part) => parts.push(part),
      prepareModel: (handle) => {
        const model = conversationalMayaModel(preparedAi(make, t.budget, handle, net));
        return { ...model, propose: (input, abort, onText, onCost) => model.propose(input, abort, onText, (usd) => { onCost?.(usd); reported(); }) };
      } });
    await session.start(); parts.length = 0;
    const before = await session.saved();
    expect(session.prepare("6")).toBe(true);
    await costSeen;
    expect(t.budget.totals().speculative).toBe(0);
    expect(await session.saved()).toEqual(before);
    expect(parts).toEqual([]);
    const out = await session.child(used ? "6" : "5");
    expect(out.prepared).toBe(used ? "hit" : "miss");
    expect(net).toHaveBeenCalledTimes(1);
    if (used) expect(normal.briefs).toHaveLength(0);
    else expect(normal.briefs.length).toBeGreaterThan(0);
    await session.finish(); await t.budget.stop();
    expect(t.reserved).toHaveLength(1);
    expect(t.settled).toEqual([4200]);
    expect(t.budget.totals()).toMatchObject({ speculative: 4200, speculativeUsed: used ? 4200 : 0, model: 0 });
  });
  it("returns an unsent handle if the request-bound model is unavailable", async () => {
    const t = setup(); await t.budget.open();
    const normal = conversationalFake({ answer: response });
    const session = createTextSession({ callId: "no-model", package: SAMPLE_PACKAGES["subtract-52-28"], model: normal,
      clock: () => 1000, spend: t.budget.seam, prepareExpected: false, prepareModel: () => null });
    await session.start();
    expect(session.prepare("6")).toBe(false);
    expect(t.budget.attempts()).toBe(4);
    expect(normal.briefs).toHaveLength(0);
    await session.finish(); await t.budget.stop();
    expect(t.settled).toEqual([0]);
  });
  it("discards a completed preparation before stopping, with no used charge", async () => {
    const t = setup(); await t.budget.open();
    let reported!: () => void;
    const costSeen = new Promise<void>((resolve) => { reported = resolve; });
    const normal = conversationalFake({ answer: response });
    const session = createTextSession({ callId: "stop-prepare", package: SAMPLE_PACKAGES["subtract-52-28"], model: normal,
      clock: () => 1000, spend: t.budget.seam, prepareExpected: false,
      prepareModel: (handle) => {
        const model = conversationalMayaModel(preparedAi(make, t.budget, handle, async () => stream(0.0042)));
        return { ...model, propose: (input, abort, onText, onCost) => model.propose(input, abort, onText, (usd) => { onCost?.(usd); reported(); }) };
      } });
    await session.start();
    expect(session.prepare("6")).toBe(true);
    await costSeen;
    session.cancelPending();
    expect(session.prepare("5")).toBe(false);
    await session.finish(); await t.budget.stop();
    expect(t.budget.totals()).toMatchObject({ speculative: 4200, speculativeUsed: 0 });
    expect(t.settled).toEqual([4200]);
  });
});
