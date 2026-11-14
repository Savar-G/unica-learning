import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { aiClient, NO_GOOGLE_PROVIDER } from "@/lib/ai-client";
import { callModel, callReviewer } from "@/lib/maya-call-seams";
import { noteAiClient } from "@/lib/maya-call-note";
import { meteredClient } from "@/lib/maya-spend-server";
import { createSpendLedger, spendConfig, usdToMicros } from "@/lib/maya-spend";
import { memorySpendStore } from "@/lib/maya-spend-memory";
import { MAYA_PROVIDER } from "@/lib/maya-ai-route";

// D-337: every OpenRouter request that carries a child's words for Maya (her model, the safety read, the free-talk review
// and the call note) goes only to Anthropic and Azure, never to Google. Other AI features use the client's default route, which also leaves Google out (#900).

const env = { OPENROUTER_API_KEY: "test-key", AI_MODEL: "anthropic/claude-sonnet-5.5", NODE_ENV: "test" };
const request = { name: "t", system: "s", content: [{ type: "text" as const, text: "x" }], schema: { type: "object" } };
const P = "00000000-0000-4000-8000-0000000000a1", C = "00000000-0000-4000-8000-0000000000c1";
const call = { id: "00000000-0000-4000-8000-0000000000f1", kind: "chat", parentId: P, childId: C };
const charge = { kind: "child" as const, parentId: P, childId: C };

let bodies: Array<{ provider?: unknown }> = [];
function capture() {
  bodies = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{}" } }], usage: { cost: 0.001 } }), { status: 200 });
  }));
}
afterEach(() => vi.unstubAllGlobals());

function meter() {
  let n = 0;
  const now = Date.parse("2026-11-12T18:00:00Z");
  const store = memorySpendStore({ clock: () => now });
  const ledger = createSpendLedger({ store, clock: () => now, config: spendConfig({}), zone: async () => "America/Vancouver", alert: async () => {} });
  return { ledger, store, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` };
}
const signal = () => new AbortController().signal;
/** The provider block of the one request a step sent. The answer's shape is not this test's concern. */
async function sent(step: () => Promise<unknown>) {
  bodies = [];
  await step().catch(() => {});
  expect(bodies).toHaveLength(1);
  return bodies[0].provider;
}

describe("Maya's OpenRouter route (no Google endpoints, D-337)", () => {
  it("sends Maya only to Anthropic and Azure (the companies the privacy page names), never to Google", () => {
    // Azure is tried first (measured once, 2026-11-13); the order names no company outside `only`.
    expect(MAYA_PROVIDER).toEqual({ only: ["anthropic", "azure"], order: ["azure", "anthropic"], require_parameters: true });
    expect(MAYA_PROVIDER.order!.every((p) => MAYA_PROVIDER.only!.includes(p))).toBe(true);
  });

  it("sends it for Maya's model, plain, metered and as a safety read", async () => {
    capture();
    const m = meter();
    expect(await sent(() => callModel(null, env)!.propose({} as never, signal()))).toEqual(MAYA_PROVIDER);
    expect(await sent(() => callModel(null, env, { ...m, call })!.propose({} as never, signal()))).toEqual(MAYA_PROVIDER);
    expect(await sent(() => callModel(null, env, { ...m, call, safetyRead: true })!.propose({} as never, signal()))).toEqual(MAYA_PROVIDER);
  });

  it("sends it for the free-talk review, plain and metered", async () => {
    capture();
    const m = meter();
    expect(await sent(() => callReviewer(env.AI_MODEL, env)!.review({} as never, signal()))).toEqual(MAYA_PROVIDER);
    expect(await sent(() => callReviewer(env.AI_MODEL, env, { ...m, call })!.review({} as never, signal()))).toEqual(MAYA_PROVIDER);
  });
  it("a prepared model keeps the route and uses its handle without a second ledger reservation", async () => {
    capture();
    const m = meter();
    const budget = m.ledger.block({ charge, callId: call.id, budgetKey: "prepared", newId: m.newId });
    await budget.open();
    const handle = budget.seam.take("speculative")!;
    const costs: number[] = [];
    const model = callModel(env.AI_MODEL, env, { ...m, call, prepared: { budget, handle } })!;
    await model.propose({} as never, signal(), undefined, (usd) => costs.push(usd));
    expect(bodies).toHaveLength(1);
    expect(bodies[0].provider).toEqual(MAYA_PROVIDER);
    expect(costs).toEqual([0.001]);
    expect(m.store.log().filter((op) => op === "reserve")).toHaveLength(1);
    expect(budget.totals().speculative).toBe(0);
    budget.seam.settle(handle, costs[0], { used: true });
    await budget.stop();
    expect(budget.totals()).toMatchObject({ model: 0, speculative: usdToMicros(0.001, m.ledger.config), speculativeUsed: usdToMicros(0.001, m.ledger.config) });
    expect(m.store.rows()).toHaveLength(1);
    expect(m.store.rows()[0].cost).toBe(usdToMicros(0.001, m.ledger.config));
  });
  it("an old prepared model cannot dispatch after a replacement owns the call budget", async () => {
    capture();
    const m = meter();
    const old = m.ledger.block({ charge, callId: call.id, budgetKey: "old", newId: m.newId });
    await old.open();
    const handle = old.seam.take("speculative")!;
    const model = callModel(env.AI_MODEL, env, { ...m, call, prepared: { budget: old, handle } })!;
    const fresh = m.ledger.block({ charge, callId: call.id, budgetKey: "fresh", newId: m.newId });
    await fresh.open();
    const costs: number[] = [];
    await expect(model.propose({} as never, signal(), undefined, (usd) => costs.push(usd))).rejects.toThrow();
    expect(bodies).toEqual([]);
    expect(costs).toEqual([0]);
    old.seam.settle(handle, 0, { used: false });
    expect(fresh.attempts()).toBe(4);
    const next = fresh.seam.take("speculative")!;
    await callModel(env.AI_MODEL, env, { ...m, call, prepared: { budget: fresh, handle: next } })!.propose({} as never, signal());
    expect(bodies).toHaveLength(1);
    fresh.seam.settle(next, 0.001, { used: true });
    await old.stop(); await fresh.stop();
    expect(old.totals().speculative).toBe(0);
    expect(fresh.totals().speculativeUsed).toBe(usdToMicros(0.001, m.ledger.config));
  });

  it("sends it for the call note, plain and metered", async () => {
    capture();
    const m = meter();
    expect(await sent(() => noteAiClient(env)!.json(request, signal()))).toEqual(MAYA_PROVIDER);
    expect(await sent(() => meteredClient(env, m.ledger, { charge, callId: call.id, newId: m.newId }, "note")!.json(request, signal()))).toEqual(MAYA_PROVIDER);
  });

  it("sends other AI features on the client's default route, which also leaves Google out (#900)", async () => {
    capture();
    expect(await sent(() => aiClient(env)!.json(request, signal()))).toEqual(NO_GOOGLE_PROVIDER);
    expect(await sent(() => aiClient(env, "anthropic/claude-haiku-5.5")!.json(request, signal()))).toEqual(NO_GOOGLE_PROVIDER);
  });
});
