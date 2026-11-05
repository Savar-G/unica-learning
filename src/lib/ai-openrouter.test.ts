import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_DEFAULT_MODEL, AI_SOLVE_DEFAULT_MODEL, aiClient, type AiJsonRequest } from "@/lib/ai-client";
import { inspect } from "node:util";
import { CHILD_DATA_MODELS, costingFetch, isClaudeModel, openRouterClient, providerWords } from "@/lib/ai-openrouter";
import { aiMayaModel } from "@/lib/maya-model";
import { PROPOSAL_SCHEMA } from "@/lib/maya/proposal";
import { REVIEW_DEFAULT_MODEL } from "@/lib/maya-talk-review";
import { ITEMS_SCHEMA } from "@/lib/workbook-generator-items";
import { workbookAi } from "@/lib/workbook-ai";

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
      provider: { order: ["google-vertex"], only: ["google-vertex"], allow_fallbacks: false, require_parameters: true, zdr: true, data_collection: "deny" },
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
    let entered!: () => void;
    const dispatch = new Promise<void>((resolve) => { entered = resolve; });
    const startedFetch: typeof fetch = (...args) => { entered(); return fetch(...args); };
    const controller = new AbortController();
    const pending = client(startedFetch).json(request(), controller.signal);
    await dispatch;
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(sent).toHaveLength(1);
  });
});

// D-283: children's data on OpenRouter goes only to Claude on Google Vertex, with zero data retention and no training.
describe("the pinned route (D-283), for every AI feature on this client", () => {
  const PINNED = { order: ["google-vertex"], only: ["google-vertex"], allow_fallbacks: false, require_parameters: true, zdr: true, data_collection: "deny" };
  afterEach(() => vi.unstubAllGlobals());

  it("pins every Anthropic model to Google Vertex, with no fallback, zero data retention and no training", async () => {
    for (const model of [AI_DEFAULT_MODEL, AI_SOLVE_DEFAULT_MODEL, REVIEW_DEFAULT_MODEL]) {
      const { fetch, sent } = fakeFetch(completion(JSON.stringify({ answer: "85" })));
      await openRouterClient({ apiKey: "sk-or-test", model, fetch }).json(request(), signal());
      expect(sent[0].body.provider).toEqual(PINNED);
    }
  });

  it("carries the route for the features on aiClient (work review, report text, profiles, call notes, Maya and her review)", async () => {
    const { fetch, sent } = fakeFetch(completion(JSON.stringify({ answer: "85" })));
    vi.stubGlobal("fetch", fetch);
    const env = { OPENROUTER_API_KEY: "sk-or-test" };
    await aiClient(env)!.json(request(), signal());
    await aiClient({ ...env, AI_MODEL: AI_SOLVE_DEFAULT_MODEL })!.json(request(), signal());
    await aiClient(env, REVIEW_DEFAULT_MODEL)!.json(request({ name: "talk_review" }), signal());
    expect(sent.map((s) => s.body.model)).toEqual([AI_DEFAULT_MODEL, AI_SOLVE_DEFAULT_MODEL, REVIEW_DEFAULT_MODEL]);
    for (const s of sent) expect(s.body.provider).toEqual(PINNED);
  });

  it("carries the route for the workbook generator and its solve check on the API, cost accounting included", async () => {
    const { fetch, sent } = fakeFetch(completion(JSON.stringify({ answer: "85" })));
    const { ai } = workbookAi({ OPENROUTER_API_KEY: "sk-or-test", WORKBOOK_AI_PRIMARY: "api" }, { subscription: false, fetch });
    await ai!.json(request({ name: "day_page" }), signal());
    await openRouterClient({ apiKey: "sk-or-test", model: AI_SOLVE_DEFAULT_MODEL, fetch: costingFetch(() => {}, fetch) }).json(request({ name: "solve" }), signal());
    expect(sent).toHaveLength(2);
    for (const s of sent) {
      expect(s.body.provider).toEqual(PINNED);
      expect(s.body.usage).toEqual({ include: true });
    }
  });

  it("a model of another maker, in a tool with no child data, still gets zero data retention and no training, never the pin of a Claude model", async () => {
    const { fetch, sent } = fakeFetch(completion(JSON.stringify({ answer: "85" })));
    await openRouterClient({ apiKey: "sk-or-test", model: "openai/gpt-6", fetch, childData: false }).json(request(), signal());
    expect(sent[0].body.provider).toEqual({ require_parameters: true, zdr: true, data_collection: "deny" });
  });

  it("fails plainly, once and on OpenRouter only, when no allowed endpoint can serve the request", async () => {
    const { fetch, sent } = fakeFetch({ status: 404, body: { error: { code: 404, message: "No endpoints found matching your data policy (Zero data retention)." } } });
    const failed = openRouterClient({ apiKey: "sk-or-test", model: AI_DEFAULT_MODEL, fetch }).json(request(), signal());
    const e = await failed.catch((x: unknown) => x);
    expect((e as Error).message).toBe("OpenRouter has no endpoint for this request on the allowed route (Google Vertex only, zero data retention, no training): 404");
    expect(providerWords(e)).toContain("No endpoints found");
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const other = fakeFetch({ status: 404, body: { error: { code: 404, message: "No endpoints found" } } });
    await expect(openRouterClient({ apiKey: "sk-or-test", model: "openai/gpt-6", fetch: other.fetch, childData: false }).json(request(), signal())).rejects.toThrow("on the allowed route (zero data retention, no training): 404");
  });
});

// The provider's own words stay inside the process: they can repeat request text, so no message or log line carries them.
describe("the provider's words on a refusal", () => {
  const refusal = { status: 400, body: { error: { code: 400, message: "Provider returned error", metadata: { provider_name: "Google", raw: "{\"error\":{\"message\":\"Schema is too complex: the child wrote 12\"}}" } } } };
  const failed = async (...replies: Parameters<typeof fakeFetch>) => {
    const { fetch } = fakeFetch(...replies);
    return openRouterClient({ apiKey: "sk-or-test", model: AI_DEFAULT_MODEL, fetch, maxRetries: 0 }).json(request(), signal()).then(() => { throw new Error("no failure"); }, (e: Error) => e);
  };

  it("keeps them where only providerWords reads them", async () => {
    const e = await failed(refusal);
    expect(providerWords(e)).toContain("Schema is too complex");
    expect(providerWords(e)).toContain("Google");
  });

  it("keeps them out of the message and of what a log line prints", async () => {
    const e = await failed(refusal);
    expect(e.message).toBe("OpenRouter answered 400");
    expect(inspect(e, { showHidden: true, depth: 5 })).not.toContain("the child wrote");
    expect(JSON.stringify(e)).not.toContain("the child wrote");
    expect(JSON.stringify(Object.getOwnPropertyDescriptors(e))).not.toContain("the child wrote");
  });

  it("keeps them on a 5xx after its retry too, and reads an object as text", async () => {
    const { fetch } = fakeFetch({ status: 503, body: { error: { message: "Provider returned error", metadata: { raw: { reason: "overloaded" } } } } });
    const e = await openRouterClient({ apiKey: "sk-or-test", model: AI_DEFAULT_MODEL, fetch, maxRetries: 0 }).json(request(), signal()).catch((x: Error) => x) as Error;
    expect(providerWords(e)).toContain("overloaded");
  });

  it("has none for an error with none, and bounds their size", async () => {
    expect(providerWords(await failed({ status: 400, body: { error: { code: 400 } } }))).toBeNull();
    expect(providerWords(await failed({ status: 400, body: { error: { message: "Bad" } } }))).toBe("Bad");
    expect(providerWords(new Error("other"))).toBeNull();
    const long = await failed({ status: 400, body: { error: { message: "Bad", metadata: { raw: "x".repeat(50_000) } } } });
    expect(providerWords(long)!.length).toBeLessThanOrEqual(2_000);
  });
});

// D-283: Claude's constrained output refuses a schema with more than 16 union-type fields ("exponential compilation cost",
// the provider's words on 2026-11-05). Such a schema goes in the instructions, on the same route, and the caller's own
// checks judge the output.
describe("a schema over the limit of constrained output", () => {
  const nullable = { anyOf: [{ type: "string" }, { type: "null" }] };
  const withUnions = (count: number) => ({
    type: "object",
    properties: Object.fromEntries(Array.from({ length: count }, (_, i) => [`f${i}`, nullable])),
    required: Array.from({ length: count }, (_, i) => `f${i}`),
    additionalProperties: false,
  });
  const client = (fetch: typeof globalThis.fetch, model = AI_DEFAULT_MODEL) => openRouterClient({ apiKey: "sk-or-test", model, fetch, maxRetries: 0, childData: isClaudeModel(model) });
  const system = (s: Sent) => s.body.messages[0].content as string;
  const ok = completion(JSON.stringify({ answer: "85" }));

  it("is sent with no constrained decoding, the schema in the instructions, on the same route", async () => {
    const { fetch, sent } = fakeFetch(ok);
    await client(fetch).json(request({ schema: ITEMS_SCHEMA, effort: "medium" }), signal());
    expect(sent).toHaveLength(1);
    expect(sent[0].body.response_format).toBeUndefined();
    expect(system(sent[0])).toContain("You review one piece of work.");
    expect(system(sent[0])).toContain(JSON.stringify(ITEMS_SCHEMA));
    expect(sent[0].body.provider).toEqual({ order: ["google-vertex"], only: ["google-vertex"], allow_fallbacks: false, require_parameters: true, zdr: true, data_collection: "deny" });
    expect(sent[0].body.reasoning).toEqual({ effort: "medium", exclude: true });
  });

  it("keeps a small schema on constrained decoding, with its instructions as they are", async () => {
    const { fetch, sent } = fakeFetch(ok);
    await client(fetch).json(request({ schema: SCHEMA }), signal());
    expect(sent[0].body.response_format).toEqual({ type: "json_schema", json_schema: { name: "work_review", strict: true, schema: SCHEMA } });
    expect(system(sent[0])).toBe("You review one piece of work.");
  });

  it("decides at the limit: 16 union fields stay constrained, 17 do not", async () => {
    const at = fakeFetch(ok);
    await client(at.fetch).json(request({ schema: withUnions(16) }), signal());
    expect(at.sent[0].body.response_format).toBeDefined();
    const over = fakeFetch(ok);
    await client(over.fetch).json(request({ schema: withUnions(17) }), signal());
    expect(over.sent[0].body.response_format).toBeUndefined();
  });

  it("counts a list of types as a union, and more than 24 optional fields as over the limit", async () => {
    const types = fakeFetch(ok);
    const typed = { type: "object", properties: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`f${i}`, { type: ["string", "null"] }])), additionalProperties: false, required: Array.from({ length: 17 }, (_, i) => `f${i}`) };
    await client(types.fetch).json(request({ schema: typed }), signal());
    expect(types.sent[0].body.response_format).toBeUndefined();
    const optional = fakeFetch(ok);
    const open = { type: "object", properties: Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`f${i}`, { type: "string" }])), additionalProperties: false, required: [] };
    await client(optional.fetch).json(request({ schema: open }), signal());
    expect(optional.sent[0].body.response_format).toBeUndefined();
  });

  it("sends Maya's real proposal schema with no constrained decoding, her reasoning and her token limit", async () => {
    const { fetch, sent } = fakeFetch(ok);
    await aiMayaModel(client(fetch)).propose({} as never, signal());
    expect(sent[0].body.response_format).toBeUndefined();
    expect(system(sent[0])).toContain(JSON.stringify((PROPOSAL_SCHEMA as unknown as { properties: unknown }).properties));
    expect(sent[0].body.reasoning).toEqual({ effort: "low", exclude: true });
    expect(sent[0].body.max_tokens).toBe(4000);
  });

  it("leaves a model of another maker on constrained decoding: the limit is Claude's", async () => {
    const { fetch, sent } = fakeFetch(ok);
    await client(fetch, "openai/gpt-6").json(request({ schema: ITEMS_SCHEMA }), signal());
    expect(sent[0].body.response_format).toBeDefined();
  });

  it("reads the JSON object from the text, also inside a code fence or with words around it", async () => {
    for (const text of ['{"answer":"85"}', '```json\n{"answer":"85"}\n```', 'Here it is: {"answer":"85"} Done {x}.']) {
      const { fetch } = fakeFetch(completion(text));
      await expect(client(fetch).json(request({ schema: ITEMS_SCHEMA }), signal())).resolves.toEqual({ answer: "85" });
    }
  });

  it("gives a bad output to the caller as a failure, without the output's words", async () => {
    for (const text of ["I think the child wrote 12", '{"answer": the child wrote 12}']) {
      const { fetch, sent } = fakeFetch(completion(text));
      const failed = await client(fetch).json(request({ schema: ITEMS_SCHEMA }), signal()).catch((e: Error) => e) as Error;
      expect(failed.message).toBe("the output is not valid JSON");
      expect(sent).toHaveLength(1);
    }
  });

  it("gives a bad output to Maya's model as a failure, so her session's repair path takes it", async () => {
    const { fetch } = fakeFetch(completion("I think the child wrote 12"));
    await expect(aiMayaModel(client(fetch)).propose({} as never, signal())).rejects.toThrow("the output is not valid JSON");
  });

  it("gives JSON of the wrong shape to the caller as it came: the caller's check judges it", async () => {
    const { fetch } = fakeFetch(completion('{"wrong":true}'));
    await expect(client(fetch).json(request({ schema: ITEMS_SCHEMA }), signal())).resolves.toEqual({ wrong: true });
  });

  const tooComplex = { status: 400, body: { error: { code: 400, message: "Provider returned error", metadata: { provider_name: "Google", raw: "Schemas contains too many parameters with union types (17 parameters with type arrays or anyOf)." } } } };

  it("sends a schema the provider refused as too complex once more in the instructions, and that name so from then on", async () => {
    const { fetch, sent } = fakeFetch(tooComplex, ok);
    const c = client(fetch);
    await expect(c.json(request({ schema: withUnions(3) }), signal())).resolves.toEqual({ answer: "85" });
    expect(sent.map((s) => s.body.response_format !== undefined)).toEqual([true, false]);
    await c.json(request({ schema: withUnions(3) }), signal());
    expect(sent).toHaveLength(3);
    expect(sent[2].body.response_format).toBeUndefined();
    await c.json(request({ name: "other", schema: withUnions(3) }), signal());
    expect(sent[3].body.response_format).toBeDefined();
  });

  it("does not send again on any other 400, or when the instructions were refused too", async () => {
    const other = fakeFetch({ status: 400, body: { error: { message: "Provider returned error", metadata: { raw: "messages: too long" } } } });
    await expect(client(other.fetch).json(request({ schema: SCHEMA }), signal())).rejects.toThrow("400");
    expect(other.sent).toHaveLength(1);
    const twice = fakeFetch(tooComplex);
    await expect(client(twice.fetch).json(request({ schema: SCHEMA }), signal())).rejects.toThrow("400");
    expect(twice.sent).toHaveLength(2);
  });
});

// Codex P2 on #642: a routing alias (openrouter/auto, a ":online" variant, "~...") names no Claude model, so it would get no
// Vertex pin. A feature with children's data names only an explicit model on the allowed list; anything else is refused
// before any request, with words an admin can act on.
describe("the allowed models for children's data (D-283)", () => {
  const REFUSED = ["openrouter/auto", "openrouter/free", "~anthropic/claude-sonnet-latest", "anthropic/claude-sonnet-5.5:online", "anthropic/claude-sonnet-5.5:nitro", "anthropic/claude-opus-5.5", "openai/gpt-6", "", "claude-sonnet-5-5"];
  afterEach(() => vi.unstubAllGlobals());

  it("allows only the explicit Claude models the route check proved on Vertex", () => {
    expect([...CHILD_DATA_MODELS]).toEqual([AI_DEFAULT_MODEL, AI_SOLVE_DEFAULT_MODEL]);
    expect(CHILD_DATA_MODELS).toContain(REVIEW_DEFAULT_MODEL);
  });

  it.each(REFUSED)("refuses %j before any request, and says what to set", async (model) => {
    const { fetch, sent } = fakeFetch(completion(JSON.stringify({ answer: "85" })));
    const failed = openRouterClient({ apiKey: "sk-or-test", model, fetch }).json(request(), signal());
    await expect(failed).rejects.toThrow(`The AI model ${JSON.stringify(model)} is not allowed for children's data. Use one of: anthropic/claude-sonnet-5.5, anthropic/claude-haiku-5.5 (AI_MODEL, AI_SOLVE_MODEL, MAYA_REVIEW_MODEL).`);
    expect(sent).toHaveLength(0);
  });

  it("refuses an alias set in AI_MODEL for every feature on aiClient, before any request", async () => {
    const { fetch, sent } = fakeFetch(completion(JSON.stringify({ answer: "85" })));
    vi.stubGlobal("fetch", fetch);
    await expect(aiClient({ OPENROUTER_API_KEY: "sk-or-test", AI_MODEL: "openrouter/auto" })!.json(request(), signal())).rejects.toThrow("not allowed for children's data");
    await expect(aiClient({ OPENROUTER_API_KEY: "sk-or-test" }, "openrouter/auto")!.json(request(), signal())).rejects.toThrow("not allowed for children's data");
    expect(sent).toHaveLength(0);
  });

  it("refuses an alias in the workbook generator on the API too", async () => {
    const { fetch, sent } = fakeFetch(completion(JSON.stringify({ answer: "85" })));
    const { ai } = workbookAi({ OPENROUTER_API_KEY: "sk-or-test", WORKBOOK_AI_PRIMARY: "api", AI_MODEL: "openrouter/auto" }, { subscription: false, fetch });
    await expect(ai!.json(request({ name: "day_page" }), signal())).rejects.toThrow("not allowed for children's data");
    expect(sent).toHaveLength(0);
  });

  it("lets a tool with no child data name another explicit model, but never an alias", async () => {
    const { fetch, sent } = fakeFetch(completion(JSON.stringify({ answer: "85" })));
    await openRouterClient({ apiKey: "sk-or-test", model: "openai/gpt-5.4", fetch, childData: false }).json(request(), signal());
    expect(sent).toHaveLength(1);
    for (const model of ["openrouter/auto", "openai/gpt-5.4:online", "~openai/gpt-latest"]) {
      await expect(openRouterClient({ apiKey: "sk-or-test", model, fetch, childData: false }).json(request(), signal())).rejects.toThrow(`The AI model ${JSON.stringify(model)} is not an explicit model id`);
    }
    expect(sent).toHaveLength(1);
  });
});

// Codex P2 on #642: OpenRouter reports a provider's refusal in more than one place. Each one is read into the private
// words, so a schema refusal anywhere sends the request once more in the instructions.
describe("a schema refusal, wherever OpenRouter puts it", () => {
  const withUnions = (count: number) => ({
    type: "object",
    properties: Object.fromEntries(Array.from({ length: count }, (_, i) => [`f${i}`, { anyOf: [{ type: "string" }, { type: "null" }] }])),
    required: Array.from({ length: count }, (_, i) => `f${i}`),
    additionalProperties: false,
  });
  const ok = completion(JSON.stringify({ answer: "85" }));
  const words = "Schemas contains too many parameters with union types (17 parameters with type arrays or anyOf). The child wrote 12.";
  const FORMS: [string, Reply][] = [
    ["the top-level message of a 400", { status: 400, body: { error: { code: 400, message: words } } }],
    ["the choice's metadata in a 200", { body: { choices: [{ finish_reason: "error", error: { code: 400, message: "Provider returned error", metadata: { provider_name: "Google", raw: words } } }] } }],
    ["the choice's message in a 200", { body: { choices: [{ finish_reason: "error", error: { code: 400, message: words } }] } }],
    ["the error's metadata in a 200", { body: { error: { code: 400, message: "Provider returned error", metadata: { raw: { error: { message: words } } } } } }],
  ];

  it.each(FORMS)("is read from %s, and the request goes once more in the instructions", async (_, refusal) => {
    const { fetch, sent } = fakeFetch(refusal, ok);
    await expect(openRouterClient({ apiKey: "sk-or-test", model: AI_DEFAULT_MODEL, fetch, maxRetries: 0 }).json(request({ schema: withUnions(3) }), signal())).resolves.toEqual({ answer: "85" });
    expect(sent.map((s) => s.body.response_format !== undefined)).toEqual([true, false]);
  });

  it.each(FORMS)("keeps the words of %s in providerWords only, never in the message", async (_, refusal) => {
    const { fetch } = fakeFetch(refusal);
    const e = await openRouterClient({ apiKey: "sk-or-test", model: AI_DEFAULT_MODEL, fetch, maxRetries: 0 }).json(request({ schema: SCHEMA }), signal()).catch((x: unknown) => x);
    expect(providerWords(e)).toContain("too many parameters with union types");
    expect((e as Error).message).not.toContain("The child wrote 12");
    expect(JSON.stringify(e)).not.toContain("The child wrote 12");
  });
});
