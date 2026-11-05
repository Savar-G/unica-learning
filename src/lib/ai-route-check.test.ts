import { describe, expect, it, vi } from "vitest";
import { AI_DEFAULT_MODEL, AI_SOLVE_DEFAULT_MODEL } from "@/lib/ai-client";
import { checkAiRoute, routeCheckModels } from "@/lib/ai-route-check";
import { REVIEW_DEFAULT_MODEL } from "@/lib/maya-talk-review";

// The route check (D-282) with fetch faked: one fixed request with no child data, through the real adapter.

const signal = () => new AbortController().signal;

function fakeFetch(status: number, body: unknown) {
  const sent: Record<string, unknown>[] = [];
  const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, sent };
}

const answered = {
  model: "anthropic/claude-sonnet-5.5",
  provider: "Google",
  choices: [{ finish_reason: "stop", native_finish_reason: "end_turn", message: { role: "assistant", content: JSON.stringify({ answer: "85" }) } }],
};

describe("the route check (D-282)", () => {
  it("reports the status, the model and the provider that answered", async () => {
    const { fetch } = fakeFetch(200, answered);
    await expect(checkAiRoute({ apiKey: "sk-or-test", model: AI_DEFAULT_MODEL, fetch, signal: signal() })).resolves.toEqual({
      ok: true,
      requested: AI_DEFAULT_MODEL,
      status: 200,
      model: "anthropic/claude-sonnet-5.5",
      provider: "Google",
    });
  });

  it("sends the real route, once, with fixed words", async () => {
    const { fetch, sent } = fakeFetch(200, answered);
    await checkAiRoute({ apiKey: "sk-or-test", model: AI_DEFAULT_MODEL, fetch, signal: signal() });
    expect(sent).toHaveLength(1);
    expect(sent[0].provider).toEqual({ order: ["google-vertex"], only: ["google-vertex"], allow_fallbacks: false, require_parameters: true, zdr: true, data_collection: "deny" });
    expect(JSON.stringify(sent[0].messages)).toContain("80 + 5");
  });

  it("reports a refusal plainly and does not try again", async () => {
    const { fetch, sent } = fakeFetch(404, { error: { code: 404, message: "No endpoints found matching your data policy" } });
    const result = await checkAiRoute({ apiKey: "sk-or-test", model: AI_DEFAULT_MODEL, fetch, signal: signal() });
    expect(result).toMatchObject({ ok: false, requested: AI_DEFAULT_MODEL, status: 404, provider: null });
    expect(result.error).toContain("No endpoints found");
    expect(sent).toHaveLength(1);
  });

  it("does not count a good status with no valid output as a pass", async () => {
    const { fetch } = fakeFetch(200, { ...answered, choices: [{ finish_reason: "stop", message: { role: "assistant", content: "not json" } }] });
    const result = await checkAiRoute({ apiKey: "sk-or-test", model: AI_DEFAULT_MODEL, fetch, signal: signal() });
    expect(result).toMatchObject({ ok: false, status: 200, provider: "Google" });
  });

  it("does not count another provider as a pass, when the model is a Claude model", async () => {
    const { fetch } = fakeFetch(200, { ...answered, provider: "Anthropic" });
    const result = await checkAiRoute({ apiKey: "sk-or-test", model: AI_DEFAULT_MODEL, fetch, signal: signal() });
    expect(result).toMatchObject({ ok: false, status: 200, provider: "Anthropic" });
    expect(result.error).toContain("Anthropic");
  });

  it("checks each model this deployment uses, each once", () => {
    expect(routeCheckModels({})).toEqual([AI_DEFAULT_MODEL, AI_SOLVE_DEFAULT_MODEL]);
    expect(REVIEW_DEFAULT_MODEL).toBe(AI_SOLVE_DEFAULT_MODEL);
    expect(routeCheckModels({ AI_MODEL: "anthropic/claude-opus-5.5", AI_SOLVE_MODEL: "anthropic/claude-sonnet-5.5", MAYA_REVIEW_MODEL: "anthropic/claude-sonnet-5.5" })).toEqual(["anthropic/claude-opus-5.5", "anthropic/claude-sonnet-5.5"]);
  });
});
