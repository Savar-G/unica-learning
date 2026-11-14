import { afterEach, describe, expect, it, vi } from "vitest";
import { aiClient, NO_GOOGLE_PROVIDER } from "@/lib/ai-client";
import { profileAiClient } from "@/lib/learner-profile-ai";
import { childProfileAiClient } from "@/lib/child-profile-ai";
import { aiReviewer } from "@/lib/work-review";

// #900 (D-337): a request that can carry a child's work, report facts or profile never goes to a Google endpoint. Google
// Cloud's terms do not allow its generative AI services in a service likely to be used by people under 18.

const env = { OPENROUTER_API_KEY: "test-key", AI_MODEL: "anthropic/claude-sonnet-5.5", NODE_ENV: "test" };
const request = { name: "t", system: "s", content: [{ type: "text" as const, text: "x" }], schema: { type: "object" } };
const signal = () => new AbortController().signal;

let bodies: Array<{ provider?: unknown }> = [];
function capture() {
  bodies = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{}" } }], usage: { cost: 0.001 } }), { status: 200 });
  }));
}
afterEach(() => vi.unstubAllGlobals());

async function sent(step: () => Promise<unknown>) {
  bodies = [];
  await step().catch(() => {});
  expect(bodies).toHaveLength(1);
  return bodies[0].provider;
}

describe("the AI client's default route (no Google endpoints, #900)", () => {
  it("leaves out both Google endpoints and keeps the request's parameters", () => {
    expect(NO_GOOGLE_PROVIDER).toEqual({ ignore: ["google-vertex", "google-ai-studio"], require_parameters: true });
  });

  it("is sent by the learner profile, the child profile and the work review", async () => {
    capture();
    expect(await sent(() => profileAiClient(env)!.json(request, signal()))).toEqual(NO_GOOGLE_PROVIDER);
    expect(await sent(() => childProfileAiClient(env)!.json(request, signal()))).toEqual(NO_GOOGLE_PROVIDER);
    // The work review drives the client through its own request; only the route matters here.
    await aiReviewer(env)!.review({ kind: "typed", question: "1 + 1", answer: "2", steps: [], text: "2" } as never, signal()).catch(() => {});
    expect(bodies.length).toBeGreaterThan(0);
    for (const b of bodies) expect(b.provider).toEqual(NO_GOOGLE_PROVIDER);
  });

  it("keeps a route a feature sets itself", async () => {
    capture();
    const own = { only: ["anthropic"], require_parameters: true as const };
    expect(await sent(() => aiClient(env, undefined, { provider: own })!.json(request, signal()))).toEqual(own);
  });
});
