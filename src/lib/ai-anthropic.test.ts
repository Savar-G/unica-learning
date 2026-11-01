import { describe, expect, it } from "vitest";
import { anthropicClient, type AnthropicUsage } from "@/lib/ai-anthropic";
import type { AiJsonRequest } from "@/lib/ai-client";

const request: AiJsonRequest = {
  name: "page",
  system: "Write one question.",
  content: [
    { type: "text", text: "Level U3" },
    { type: "image", mediaType: "image/png", data: new Uint8Array([1, 2, 3]) },
  ],
  schema: { type: "object", additionalProperties: false, required: ["q"], properties: { q: { type: "string" } } },
  effort: "low",
  maxTokens: 900,
};

function answer(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function message(extra: Record<string, unknown> = {}) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text: '{"q":"3 + 4 = ?"}' }],
    stop_reason: "end_turn",
    usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    ...extra,
  };
}

function client(reply: () => Response) {
  const sent: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const usage: AnthropicUsage[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return reply();
  }) as typeof globalThis.fetch;
  const ai = anthropicClient({ apiKey: "sk-ant-test", fetch, maxRetries: 0, onUsage: (u) => usage.push(u) });
  return { ai, sent, usage };
}

const signal = () => new AbortController().signal;

describe("anthropicClient", () => {
  it("sends the schema, the image, the effort and the fallback, and returns the parsed JSON", async () => {
    const { ai, sent, usage } = client(() => answer(message()));
    await expect(ai.json(request, signal())).resolves.toEqual({ q: "3 + 4 = ?" });
    expect(ai.model).toBe("claude-sonnet-5-5");
    const { url, headers, body } = sent[0];
    expect(url).toContain("/v1/messages");
    expect(`${headers.get("x-api-key") ?? ""} ${headers.get("authorization") ?? ""}`).toContain("sk-ant-test");
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(body).toMatchObject({
      model: "claude-sonnet-5-5",
      max_tokens: 900,
      system: "Write one question.",
      thinking: { type: "adaptive" },
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: request.schema } },
    });
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Level U3" },
          { type: "image", source: { type: "base64", media_type: "image/png", data: "AQID" } },
        ],
      },
    ]);
    expect(usage).toEqual([{ model: "claude-sonnet-5-5", inputTokens: 120, outputTokens: 30, cacheReadTokens: 0, cacheWriteTokens: 0 }]);
  });

  it("leaves the effort out when the request has none", async () => {
    const { ai, sent } = client(() => answer(message()));
    await ai.json({ ...request, effort: undefined }, signal());
    expect(sent[0].body.output_config).toEqual({ format: { type: "json_schema", schema: request.schema } });
  });

  it("throws on a refusal, and still counts its tokens", async () => {
    const { ai, usage } = client(() => answer(message({ stop_reason: "refusal", content: [] })));
    await expect(ai.json(request, signal())).rejects.toThrow("the model refused");
    expect(usage).toHaveLength(1);
  });

  it("throws when the answer is cut off", async () => {
    const { ai } = client(() => answer(message({ stop_reason: "max_tokens" })));
    await expect(ai.json(request, signal())).rejects.toThrow("the model stopped: max_tokens");
  });

  it("throws when the output is not JSON", async () => {
    const { ai } = client(() => answer(message({ content: [{ type: "text", text: "not json" }] })));
    await expect(ai.json(request, signal())).rejects.toThrow("the output is not valid JSON");
  });

  it("puts the schema in the instructions when the API refuses it, and keeps doing so for that request name", async () => {
    let n = 0;
    const { ai, sent } = client(() =>
      n++ === 0
        ? answer({ type: "error", error: { type: "invalid_request_error", message: "Schemas contains too many parameters with union types (69 parameters)" } }, 400)
        : answer(message({ content: [{ type: "text", text: 'Here it is: {"q":"5 + 2 = ?"}' }] })),
    );
    await expect(ai.json(request, signal())).resolves.toEqual({ q: "5 + 2 = ?" });
    await expect(ai.json(request, signal())).resolves.toEqual({ q: "5 + 2 = ?" });
    expect(sent).toHaveLength(3);
    expect((sent[0].body.output_config as Record<string, unknown>).format).toBeDefined();
    for (const later of sent.slice(1)) {
      expect(later.body.output_config).toEqual({ effort: "low" });
      expect(String(later.body.system)).toContain(JSON.stringify(request.schema));
    }
  });

  it("reports an HTTP error with its status and no key", async () => {
    const { ai } = client(() => answer({ type: "error", error: { type: "invalid_request_error", message: "bad schema" } }, 400));
    const error = await ai.json(request, signal()).catch((e: Error) => e);
    expect(String(error)).toContain("Anthropic answered 400");
    expect(String(error)).not.toContain("sk-ant-test");
  });
});
