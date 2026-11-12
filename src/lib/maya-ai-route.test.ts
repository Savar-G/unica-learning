import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { aiClient } from "@/lib/ai-client";
import { callModel, callReviewer } from "@/lib/maya-call-seams";
import { noteAiClient } from "@/lib/maya-call-note";
import { meteredClient } from "@/lib/maya-spend-server";
import { createSpendLedger, spendConfig } from "@/lib/maya-spend";
import { memorySpendStore } from "@/lib/maya-spend-memory";
import { MAYA_PROVIDER } from "@/lib/maya-ai-route";

// D-337: every OpenRouter request that carries a child's words for Maya (her model, the safety read, the free-talk review
// and the call note) leaves out Google's endpoints. Other AI features keep the default route.

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
  const ledger = createSpendLedger({ store: memorySpendStore({ clock: () => now }), clock: () => now, config: spendConfig({}), zone: async () => "America/Vancouver", alert: async () => {} });
  return { ledger, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` };
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
  it("leaves out Google's endpoints and keeps the strict schema", () => {
    expect(MAYA_PROVIDER).toEqual({ ignore: ["google-vertex", "google-ai-studio"], require_parameters: true });
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

  it("sends it for the call note, plain and metered", async () => {
    capture();
    const m = meter();
    expect(await sent(() => noteAiClient(env)!.json(request, signal()))).toEqual(MAYA_PROVIDER);
    expect(await sent(() => meteredClient(env, m.ledger, { charge, callId: call.id, newId: m.newId }, "note")!.json(request, signal()))).toEqual(MAYA_PROVIDER);
  });

  it("leaves other AI features on the default route", async () => {
    capture();
    expect(await sent(() => aiClient(env)!.json(request, signal()))).toEqual({ require_parameters: true });
    expect(await sent(() => aiClient(env, "anthropic/claude-haiku-5.5")!.json(request, signal()))).toEqual({ require_parameters: true });
  });
});
