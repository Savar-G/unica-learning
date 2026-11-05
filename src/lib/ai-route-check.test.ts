import { describe, expect, it, vi } from "vitest";
import { AI_DEFAULT_MODEL, AI_SOLVE_DEFAULT_MODEL } from "@/lib/ai-client";
import { checkAiRoute, routeCheckModels, routeChecks } from "@/lib/ai-route-check";
import { PROPOSAL_SCHEMA } from "@/lib/maya/proposal";
import { ITEMS_SCHEMA } from "@/lib/workbook-generator-items";
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
    await expect(checkAiRoute({ apiKey: "sk-or-test", model: AI_DEFAULT_MODEL, fetch, signal: signal() })).resolves.toMatchObject({
      ok: true,
      shape: "small",
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

  // The real-size requests: what a small request could not prove (the features' schemas, an image, their reasoning).
  const reply = (content: unknown) => ({ ...answered, choices: [{ finish_reason: "stop", native_finish_reason: "end_turn", message: { role: "assistant", content: JSON.stringify(content) } }] });
  const sentBody = (sent: Record<string, unknown>[]) => sent[0] as { messages: { content: unknown }[]; response_format: { json_schema: { schema: unknown; strict: boolean } }; reasoning: unknown; max_tokens: number };

  it("sends the largest schema we send, whole and strict, with a synthetic image and the writer's reasoning", async () => {
    const { fetch, sent } = fakeFetch(200, reply({ items: [] }));
    const result = await checkAiRoute({ apiKey: "sk-or-test", model: AI_DEFAULT_MODEL, shape: "largest_schema_image", fetch, signal: signal() });
    expect(result).toMatchObject({ ok: true, shape: "largest_schema_image", schemaBytes: JSON.stringify(ITEMS_SCHEMA).length, provider: "Google" });
    const body = sentBody(sent);
    expect(body.response_format.json_schema).toMatchObject({ strict: true, schema: ITEMS_SCHEMA });
    expect(body.reasoning).toEqual({ effort: "medium", exclude: true });
    expect(JSON.stringify(body.messages)).toContain("data:image/png;base64,iVBORw0KGgo");
  });

  it("sends Maya's proposal schema as she sends it, with her reasoning and limit", async () => {
    const { fetch, sent } = fakeFetch(200, reply({ version: 1 }));
    const result = await checkAiRoute({ apiKey: "sk-or-test", model: AI_DEFAULT_MODEL, shape: "maya_proposal", fetch, signal: signal() });
    expect(result).toMatchObject({ ok: true, shape: "maya_proposal" });
    const body = sentBody(sent);
    const { $schema: _s, title: _t, ...strict } = PROPOSAL_SCHEMA as unknown as Record<string, unknown>;
    void _s;
    void _t;
    expect(body.response_format.json_schema.schema).toEqual(strict);
    expect(body.reasoning).toEqual({ effort: "low", exclude: true });
    expect(body.max_tokens).toBe(4000);
  });

  it("passes the image check only when the model read the colour of the image", async () => {
    const seen = fakeFetch(200, reply({ answer: "Red" }));
    expect(await checkAiRoute({ apiKey: "sk-or-test", model: AI_DEFAULT_MODEL, shape: "image_read", fetch: seen.fetch, signal: signal() })).toMatchObject({ ok: true, shape: "image_read" });
    expect(sentBody(seen.sent).reasoning).toEqual({ effort: "medium", exclude: true });
    const blind = fakeFetch(200, reply({ answer: "I cannot see an image" }));
    const result = await checkAiRoute({ apiKey: "sk-or-test", model: AI_DEFAULT_MODEL, shape: "image_read", fetch: blind.fetch, signal: signal() });
    expect(result).toMatchObject({ ok: false, status: 200 });
    expect(result.error).toContain("not what the request asked");
  });

  it("does not count output of the wrong shape as a pass on the largest schema", async () => {
    const { fetch } = fakeFetch(200, reply({ answer: "85" }));
    const result = await checkAiRoute({ apiKey: "sk-or-test", model: AI_DEFAULT_MODEL, shape: "largest_schema_image", fetch, signal: signal() });
    expect(result).toMatchObject({ ok: false, status: 200 });
  });

  it("reports a refused schema plainly and does not try again", async () => {
    const { fetch, sent } = fakeFetch(400, { error: { code: 400, message: "Schema is too complex" } });
    const result = await checkAiRoute({ apiKey: "sk-or-test", model: AI_DEFAULT_MODEL, shape: "maya_proposal", fetch, signal: signal() });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(result.error).toContain("Schema is too complex");
    expect(sent).toHaveLength(1);
  });

  it("shows an admin the provider's words on a refusal", async () => {
    const { fetch } = fakeFetch(400, { error: { code: 400, message: "Provider returned error", metadata: { provider_name: "Google", raw: "too many union types" } } });
    const result = await checkAiRoute({ apiKey: "sk-or-test", model: AI_DEFAULT_MODEL, shape: "maya_proposal", fetch, signal: signal() });
    expect(result.providerWords).toContain("too many union types");
    expect(result.error).not.toContain("union types");
  });

  it("compares Maya's schema on today's route: no pin, no retention rule, any provider that answers", async () => {
    const { fetch, sent } = fakeFetch(200, { ...reply({ version: 1 }), provider: "Anthropic" });
    const result = await checkAiRoute({ apiKey: "sk-or-test", model: AI_DEFAULT_MODEL, shape: "maya_proposal_main_route", fetch, signal: signal() });
    expect(sent[0].provider).toEqual({ require_parameters: true });
    expect(result).toMatchObject({ ok: true, shape: "maya_proposal_main_route", provider: "Anthropic" });
  });

  it("runs the small check on each model, and the real-size checks on the model of the features that send them", () => {
    expect(routeChecks({})).toEqual([
      { model: AI_DEFAULT_MODEL, shape: "small" },
      { model: AI_SOLVE_DEFAULT_MODEL, shape: "small" },
      { model: AI_DEFAULT_MODEL, shape: "largest_schema_image" },
      { model: AI_DEFAULT_MODEL, shape: "maya_proposal" },
      { model: AI_DEFAULT_MODEL, shape: "image_read" },
      { model: AI_DEFAULT_MODEL, shape: "maya_proposal_main_route" },
    ]);
    expect(routeChecks({ AI_MODEL: "anthropic/claude-opus-5.5" }).filter((c) => c.shape !== "small").map((c) => c.model)).toEqual(Array(4).fill("anthropic/claude-opus-5.5"));
  });

  it("checks each model this deployment uses, each once", () => {
    expect(routeCheckModels({})).toEqual([AI_DEFAULT_MODEL, AI_SOLVE_DEFAULT_MODEL]);
    expect(REVIEW_DEFAULT_MODEL).toBe(AI_SOLVE_DEFAULT_MODEL);
    expect(routeCheckModels({ AI_MODEL: "anthropic/claude-opus-5.5", AI_SOLVE_MODEL: "anthropic/claude-sonnet-5.5", MAYA_REVIEW_MODEL: "anthropic/claude-sonnet-5.5" })).toEqual(["anthropic/claude-opus-5.5", "anthropic/claude-sonnet-5.5"]);
  });
});
