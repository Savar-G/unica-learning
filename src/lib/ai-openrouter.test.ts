import { describe, expect, it, vi } from "vitest";
import type { AiJsonRequest } from "@/lib/ai-client";
import { openRouterClient } from "@/lib/ai-openrouter";

// The OpenRouter adapter with fetch faked: no network. Checks what goes to OpenRouter and what comes back.

interface Sent {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown> & { messages: { role: string; content: unknown }[] };
}

type Reply = { status?: number; body: unknown; raw?: string } | "hang" | "network";

/** A fetch that records each request and answers with the given replies, one per call (the last one repeats). */
function fakeFetch(...replies: Reply[]) {
  const sent: Sent[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    sent.push({ url, method: init?.method ?? "GET", headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    const reply = replies[Math.min(sent.length - 1, replies.length - 1)];
    if (reply === "network") throw new TypeError("fetch failed");
    if (reply === "hang") {
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) reject(signal.reason);
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    }
    return new Response(reply.raw ?? JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "content-type": "application/json" } });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, sent };
}

/** A chat completion as OpenRouter returns it (non-streaming). */
const completion = (content: string | null, extra: { finish_reason?: string; native_finish_reason?: string; refusal?: string | null } = {}) => ({
  body: {
    id: "gen-test",
    object: "chat.completion",
    created: 1,
    model: "anthropic/claude-sonnet-5.5",
    choices: [
      {
        finish_reason: extra.finish_reason ?? "stop",
        native_finish_reason: extra.native_finish_reason ?? "end_turn",
        message: { role: "assistant", content, ...(extra.refusal !== undefined ? { refusal: extra.refusal } : {}) },
      },
    ],
    usage: { prompt_tokens: 1200, completion_tokens: 80, total_tokens: 1280 },
  },
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7]);
const SCHEMA = { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false };
const request = (extra: Partial<AiJsonRequest> = {}): AiJsonRequest => ({
  name: "work_review",
  system: "You review one piece of work.",
  content: [
    { type: "text", text: "Question: 47 + 38 = ?" },
    { type: "image", mediaType: "image/png", data: PNG },
  ],
  schema: SCHEMA,
  effort: "medium",
  ...extra,
});
const signal = () => new AbortController().signal;
const client = (fetch: typeof globalThis.fetch, extra: { maxRetries?: number; timeout?: number } = {}) =>
  openRouterClient({ apiKey: "sk-or-test", model: "anthropic/claude-sonnet-5.5", fetch, ...extra });

describe("the OpenRouter AI client (#183), fetch faked", () => {
  it("sends one chat completion with the key, the model, the system text, the text and the image, and a strict JSON schema", async () => {
    const { fetch, sent } = fakeFetch(completion(JSON.stringify({ answer: "85" })));
    const out = await client(fetch).json(request(), signal());

    expect(out).toEqual({ answer: "85" });
    expect(sent).toHaveLength(1);
    const [req] = sent;
    expect(req.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(req.method).toBe("POST");
    expect(req.headers.get("authorization")).toBe("Bearer sk-or-test");
    expect(req.headers.get("content-type")).toBe("application/json");
    expect(req.body).toMatchObject({
      model: "anthropic/claude-sonnet-5.5",
      stream: false,
      response_format: { type: "json_schema", json_schema: { name: "work_review", strict: true, schema: SCHEMA } },
      provider: { require_parameters: true },
      reasoning: { effort: "medium", exclude: true },
    });
    expect(req.body.max_tokens).toBeGreaterThan(0);
    expect(req.body.messages).toEqual([
      { role: "system", content: "You review one piece of work." },
      {
        role: "user",
        content: [
          { type: "text", text: "Question: 47 + 38 = ?" },
          { type: "image_url", image_url: { url: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}` } },
        ],
      },
    ]);
  });

  it("sends no reasoning setting when the request has no effort", async () => {
    const { fetch, sent } = fakeFetch(completion(JSON.stringify({ answer: "85" })));
    await client(fetch).json(request({ effort: undefined, content: [{ type: "text", text: "facts" }] }), signal());
    expect(sent[0].body).not.toHaveProperty("reasoning");
    expect(sent[0].body.messages[1]).toEqual({ role: "user", content: [{ type: "text", text: "facts" }] });
  });
});

describe("the OpenRouter AI client: no output is an error, never a result (#183)", () => {
  const good = JSON.stringify({ answer: "85" });

  it("a refusal is an error, in each shape OpenRouter can give it", async () => {
    for (const reply of [
      completion(good, { refusal: "I can't help with that." }),
      completion(good, { finish_reason: "content_filter", native_finish_reason: "refusal" }),
      completion(good, { finish_reason: "stop", native_finish_reason: "refusal" }),
    ]) {
      const { fetch, sent } = fakeFetch(reply);
      await expect(client(fetch).json(request(), signal())).rejects.toThrow(/refus|stopped/);
      expect(sent).toHaveLength(1);
    }
  });

  it("a cut-off answer is an error", async () => {
    const { fetch, sent } = fakeFetch(completion(good, { finish_reason: "length", native_finish_reason: "max_tokens" }));
    await expect(client(fetch).json(request(), signal())).rejects.toThrow(/stopped: length/);
    expect(sent).toHaveLength(1);
  });

  it("output that is not JSON, or no output, is an error, with no second try", async () => {
    for (const content of ["The answer is 85.", '{"answer": "85"', "", null]) {
      const { fetch, sent } = fakeFetch(completion(content));
      await expect(client(fetch).json(request(), signal()), String(content)).rejects.toThrow(/JSON|no output/);
      expect(sent).toHaveLength(1);
    }
  });

  it("an error inside a 200 answer is an error", async () => {
    const { fetch } = fakeFetch({ body: { error: { code: 502, message: "Provider returned error" } } });
    await expect(client(fetch, { maxRetries: 0 }).json(request(), signal())).rejects.toThrow(/502/);
    const inChoice = fakeFetch({ body: { ...completion(good).body, choices: [{ finish_reason: "error", message: { role: "assistant", content: "" }, error: { code: 500, message: "boom" } }] } });
    await expect(client(inChoice.fetch, { maxRetries: 0 }).json(request(), signal())).rejects.toThrow(/500/);
  });

  it("an HTTP error is an error; a 5xx or 429 gets one more try, a 4xx does not", async () => {
    const failing = fakeFetch({ status: 503, body: { error: { code: 503, message: "No available provider" } } });
    await expect(client(failing.fetch).json(request(), signal())).rejects.toThrow(/503/);
    expect(failing.sent).toHaveLength(2);

    const recovers = fakeFetch({ status: 429, body: { error: { code: 429, message: "Rate limited" } } }, completion(good));
    await expect(client(recovers.fetch).json(request(), signal())).resolves.toEqual({ answer: "85" });
    expect(recovers.sent).toHaveLength(2);

    for (const status of [400, 401, 402, 403]) {
      const { fetch, sent } = fakeFetch({ status, body: { error: { code: status, message: "no" } } });
      await expect(client(fetch).json(request(), signal())).rejects.toThrow(String(status));
      expect(sent).toHaveLength(1);
    }

    const html = fakeFetch({ status: 502, body: null, raw: "<html>Bad gateway</html>" });
    await expect(client(html.fetch, { maxRetries: 0 }).json(request(), signal())).rejects.toThrow(/502/);
  });

  it("a request that does not answer in time is an error, after one more try", async () => {
    const { fetch, sent } = fakeFetch("hang");
    const started = Date.now();
    await expect(client(fetch, { timeout: 20 }).json(request(), signal())).rejects.toThrow(/time/);
    expect(sent).toHaveLength(2);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("a lost connection gets one more try", async () => {
    const { fetch, sent } = fakeFetch("network", completion(good));
    await expect(client(fetch).json(request(), signal())).resolves.toEqual({ answer: "85" });
    expect(sent).toHaveLength(2);
  });

  it("stops at once, with no second try, when the caller's time is up", async () => {
    const { fetch, sent } = fakeFetch("hang");
    const controller = new AbortController();
    const pending = client(fetch).json(request(), controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(sent).toHaveLength(1);
  });
});
