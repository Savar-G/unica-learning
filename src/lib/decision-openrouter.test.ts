import { describe, expect, it, vi } from "vitest";
import { DecisionError, decisionClient, requestCostBound, type DecisionQuestion, type DecisionRequest } from "@/lib/decision-client";
import { openRouterDecisionClient } from "@/lib/decision-openrouter";

// The OpenRouter decision adapter with fetch faked: no network. Checks what goes to OpenRouter and what comes back.

interface Sent {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown> & { state: unknown[]; questions: Record<string, Record<string, unknown>> };
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

/** A Decisions answer as OpenRouter returns it. */
const decided = (answers: Record<string, unknown>, cost: number | null = 0.0000124) => ({
  body: { model: "typesafe/jev-1.14-20261014", answers, usage: { input_tokens: 295, output_tokens: 0, ...(cost === null ? {} : { cost }) }, id: "gen-dec-1", provider: "TypeSafe" },
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const QUESTIONS: Record<string, DecisionQuestion> = {
  shows: { type: "noul", instructions: "Does this box show 48?", yes: "The box holds exactly 48.", no: "Anything else." },
  team: { type: "choice", instructions: "Which team?", options: { a: "The A team", b: "The B team" } },
  level: { type: "score", instructions: "How hard?", levels: ["easy", "right", "hard"] },
};
const request = (extra: Partial<DecisionRequest> = {}): DecisionRequest => ({
  input: [{ type: "text", text: "One answer box." }, { type: "image", mediaType: "image/jpeg", data: JPEG }],
  questions: QUESTIONS,
  signal: new AbortController().signal,
  ...extra,
});
const ALL = {
  shows: { type: "noul", noul: 0.97 },
  team: { type: "choice", choice: "b", probabilities: { a: 0.2, b: 0.8 }, confidence: 0.75 },
  level: { type: "score", score: 1.2, probabilities: { "0": 0.1, "1": 0.6, "2": 0.3 }, confidence: 0.6 },
};
const client = (fetch: typeof globalThis.fetch, extra: { maxRetries?: number; timeout?: number } = {}) =>
  openRouterDecisionClient({ apiKey: "sk-or-test", model: "typesafe/jev-1.14", provider: "typesafe", fetch, ...extra });

async function kindOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e instanceof DecisionError ? e.kind : `not a DecisionError: ${String(e)}`;
  }
  return "no error";
}

describe("the OpenRouter decision client (#851), fetch faked", () => {
  it("sends one Decisions request with the key, the pinned model and provider, the text and the image, and each typed question", async () => {
    const { fetch, sent } = fakeFetch(decided(ALL));
    await client(fetch).decide(request());

    expect(sent).toHaveLength(1);
    const [req] = sent;
    expect(req.url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(req.method).toBe("POST");
    expect(req.headers.get("authorization")).toBe("Bearer sk-or-test");
    expect(req.body.model).toBe("typesafe/jev-1.14");
    expect(req.body.provider).toEqual({ only: ["typesafe"], order: ["typesafe"], allow_fallbacks: false, data_collection: "deny", zdr: true });
    expect(req.body.state).toEqual(["One answer box.", { type: "image_url", image_url: { url: `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}` } }]);
    expect(req.body.questions).toEqual({
      shows: { type: "noul", instructions: "Does this box show 48?", criteria: { true: "The box holds exactly 48.", false: "Anything else." } },
      team: { type: "choice", instructions: "Which team?", criteria: { a: "The A team", b: "The B team" } },
      level: { type: "score", instructions: "How hard?", criteria: ["easy", "right", "hard"] },
    });
  });

  it("reads each typed answer, the cost from the HTTP usage, the provider and the id; a yes/no confidence that Jev leaves out is max(p, 1 - p)", async () => {
    const { fetch } = fakeFetch(decided(ALL));
    const out = await client(fetch).decide(request());

    expect(out.answers).toEqual({
      shows: { type: "noul", yes: 0.97, confidence: 0.97 },
      team: { type: "choice", choice: "b", probabilities: { a: 0.2, b: 0.8 }, confidence: 0.75 },
      level: { type: "score", score: 1.2, probabilities: [0.1, 0.6, 0.3], confidence: 0.6 },
    });
    expect(out.usd).toBe(0.0000124);
    expect(out.provider).toBe("TypeSafe");
    expect(out.id).toBe("gen-dec-1");

    const low = await client(fakeFetch(decided({ ...ALL, shows: { type: "noul", noul: 0.1 } })).fetch).decide(request());
    expect(low.answers.shows).toEqual({ type: "noul", yes: 0.1, confidence: 0.9 });
    const given = await client(fakeFetch(decided({ ...ALL, shows: { type: "noul", noul: 0.988, confidence: 0.988 } })).fetch).decide(request());
    expect(given.answers.shows).toEqual({ type: "noul", yes: 0.988, confidence: 0.988 });
  });

  it("gives a null cost when the usage has none", async () => {
    const out = await client(fakeFetch(decided(ALL, null)).fetch).decide(request());
    expect(out.usd).toBeNull();
  });

  it("refused: a question's answer is a refusal; the cost of that answer stays on the error", async () => {
    const { fetch } = fakeFetch(decided({ ...ALL, team: { type: "refusal" } }));
    const error = await client(fetch).decide(request()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DecisionError);
    expect((error as DecisionError).kind).toBe("refused");
    expect((error as DecisionError).usd).toBe(0.0000124);
  });

  it("blocked: a provider safety block, as an HTTP error or inside a 200 answer; not tried again", async () => {
    const http = fakeFetch({ status: 403, body: { error: { code: 403, message: "Your input was flagged by moderation" } } });
    expect(await kindOf(client(http.fetch).decide(request()))).toBe("blocked");
    expect(http.sent).toHaveLength(1);
    const inside = fakeFetch({ body: { error: { code: 400, message: "Provider returned error", metadata: { reason: "SAFETY" } } } });
    expect(await kindOf(client(inside.fetch).decide(request()))).toBe("blocked");
  });

  it("malformed: a missing answer, a wrong type, a probability out of range, an option or level not asked, or a body that is not JSON", async () => {
    const cases = [
      { shows: ALL.shows, team: ALL.team },
      { ...ALL, shows: { type: "choice", choice: "a" } },
      { ...ALL, shows: { type: "noul", noul: 1.4 } },
      { ...ALL, shows: { type: "noul" } },
      { ...ALL, team: { type: "choice", choice: "c" } },
      { ...ALL, team: { type: "choice", choice: "a", probabilities: { a: 0.5, z: 0.5 } } },
      { ...ALL, level: { type: "score", score: 3 } },
      { ...ALL, level: { type: "score", score: 1, probabilities: { "5": 1 } } },
    ];
    for (const answers of cases) expect(await kindOf(client(fakeFetch(decided(answers)).fetch).decide(request()))).toBe("malformed");
    expect(await kindOf(client(fakeFetch({ body: null, raw: "<html>" }).fetch).decide(request()))).toBe("malformed");
    expect(await kindOf(client(fakeFetch({ body: { model: "m", usage: {} } }).fetch).decide(request()))).toBe("malformed");
  });

  it("unavailable: a 400 or 402 is not tried again; a 429, a 5xx or a lost connection is tried once more, then fails", async () => {
    const bad = fakeFetch({ status: 400, body: { error: { code: 400, message: "capability mismatch" } } });
    expect(await kindOf(client(bad.fetch).decide(request()))).toBe("unavailable");
    expect(bad.sent).toHaveLength(1);
    const credits = fakeFetch({ status: 402, body: { error: { code: 402, message: "Insufficient credits" } } });
    expect(await kindOf(client(credits.fetch).decide(request()))).toBe("unavailable");
    for (const reply of [{ status: 429, body: { error: { message: "Rate limit exceeded" } } }, { status: 503, body: {} }, "network" as const]) {
      const f = fakeFetch(reply);
      expect(await kindOf(client(f.fetch).decide(request()))).toBe("unavailable");
      expect(f.sent).toHaveLength(2);
    }
    const recovered = fakeFetch({ status: 502, body: {} }, decided(ALL));
    expect((await client(recovered.fetch).decide(request())).answers.shows).toEqual({ type: "noul", yes: 0.97, confidence: 0.97 });
    expect(recovered.sent).toHaveLength(2);
  });

  it("timeout: no answer within the time limit (tried once more), or the caller's signal stops it (not tried again)", async () => {
    const slow = fakeFetch("hang");
    expect(await kindOf(client(slow.fetch, { timeout: 20 }).decide(request()))).toBe("timeout");
    expect(slow.sent).toHaveLength(2);

    const stopped = fakeFetch("hang");
    const controller = new AbortController();
    const pending = client(stopped.fetch, { timeout: 10_000 }).decide(request({ signal: controller.signal }));
    setTimeout(() => controller.abort(), 10);
    expect(await kindOf(pending)).toBe("timeout");
    expect(stopped.sent).toHaveLength(1);
    expect(await kindOf(client(fakeFetch(decided(ALL)).fetch).decide(request({ signal: AbortSignal.abort() })))).toBe("timeout");
  });

  it("is on only with DECISIONS_OPENROUTER_API_KEY, takes DECISION_MODEL, refuses a model that is not in the pinned table, and bounds a request by its pinned prices", async () => {
    expect(decisionClient({})).toBeNull();
    expect(decisionClient({ OPENROUTER_API_KEY: "sk-or-other", SCAN_MARKING_OPENROUTER_API_KEY: "sk-or-scan" })).toBeNull();
    expect(decisionClient({ DECISIONS_OPENROUTER_API_KEY: "sk-or-d" })?.model).toBe("typesafe/jev-1.14");
    // One retry: two attempts, each at most the whole context of 262,144 tokens at the prompt price.
    expect(decisionClient({ DECISIONS_OPENROUTER_API_KEY: "sk-or-d" })!.maxAttempts).toBe(2);
    expect(requestCostBound(decisionClient({ DECISIONS_OPENROUTER_API_KEY: "sk-or-d" })!)).toBeCloseTo(2 * 262_144 * 0.042 / 1e6, 12);
    expect(requestCostBound(decisionClient({ DECISIONS_OPENROUTER_API_KEY: "sk-or-d", DECISION_MODEL: "google/gemini-decision-1" })!)).toBeCloseTo(2 * 262_144 * 0.1 / 1e6, 12);
    const { fetch, sent } = fakeFetch(decided(ALL));
    const gemini = decisionClient({ DECISIONS_OPENROUTER_API_KEY: "sk-or-d", DECISION_MODEL: "google/gemini-decision-1" }, undefined, { fetch });
    await gemini!.decide(request());
    expect(sent[0].body.model).toBe("google/gemini-decision-1");
    expect(sent[0].body.provider).toEqual({ only: ["google-ai-studio"], order: ["google-ai-studio"], allow_fallbacks: false, data_collection: "deny", zdr: true });
    expect(sent[0].headers.get("authorization")).toBe("Bearer sk-or-d");
    expect(() => decisionClient({ DECISIONS_OPENROUTER_API_KEY: "sk-or-d", DECISION_MODEL: "someone/other-model" })).toThrow(/not in the pinned model table/);
  });

  it("malformed: a choice or score answer without a probability from 0 to 1 for every option or level, or a yes/no answer without one; nothing is filled in (review finding 2)", async () => {
    // The reviewers' input: a two-level score answer with a score and no probability map (was read as [0, 0]).
    const twoLevels = request({ questions: { level: { type: "score", instructions: "How hard?", levels: ["easy", "hard"] } } });
    expect(await kindOf(client(fakeFetch(decided({ level: { type: "score", score: 1 } })).fetch).decide(twoLevels))).toBe("malformed");
    const cases = [
      { ...ALL, level: { type: "score", score: 1, probabilities: { "0": 0.4, "1": 0.6 } } },
      { ...ALL, level: { type: "score", score: 1, probabilities: { "0": 0.1, "1": 0.6, "2": "0.3" } } },
      { ...ALL, team: { type: "choice", choice: "b" } },
      { ...ALL, team: { type: "choice", choice: "b", probabilities: { b: 0.8 } } },
      { ...ALL, team: { type: "choice", choice: "b", probabilities: { a: 0.2, b: 1.2 } } },
      { ...ALL, team: { type: "choice", choice: "b", probabilities: [0.2, 0.8] } },
      { ...ALL, shows: { type: "noul", noul: "0.97" } },
      { ...ALL, shows: { type: "noul", noul: null } },
    ];
    for (const answers of cases) expect(await kindOf(client(fakeFetch(decided(answers)).fetch).decide(request()))).toBe("malformed");
  });

  it("reports the cost of every attempt: a charged failed attempt and the retry, summed (review finding 4)", async () => {
    // The reviewers' input: a failed attempt costing USD 0.04, then a success costing USD 0.03.
    const retried = fakeFetch({ status: 503, body: { error: { code: 503, message: "Provider returned error" }, usage: { cost: 0.04 } } }, decided(ALL, 0.03));
    const out = await client(retried.fetch).decide(request());
    expect(retried.sent).toHaveLength(2);
    expect(out.usd).toBeCloseTo(0.07, 12);

    // Both attempts fail: the error carries both costs.
    const failed = fakeFetch({ status: 503, body: { usage: { cost: 0.04 } } }, { status: 503, body: { usage: { cost: 0.02 } } });
    const error = await client(failed.fetch).decide(request()).catch((e: unknown) => e);
    expect((error as DecisionError).kind).toBe("unavailable");
    expect((error as DecisionError).usd).toBeCloseTo(0.06, 12);

    // A charged failed attempt, then a refused answer: the error carries both costs.
    const refused = fakeFetch({ status: 502, body: { usage: { cost: 0.04 } } }, decided({ ...ALL, team: { type: "refusal" } }, 0.01));
    const refusal = await client(refused.fetch).decide(request()).catch((e: unknown) => e);
    expect((refusal as DecisionError).kind).toBe("refused");
    expect((refusal as DecisionError).usd).toBeCloseTo(0.05, 12);

    // Re-check B: an HTTP 503 with no usage.cost, then a success at USD 0.03. The first charge is unknown, not 0: the result
    // keeps the known USD 0.03 and is marked incomplete.
    const unknownFirst = fakeFetch({ status: 503, body: {} }, decided(ALL, 0.03));
    const partial = await client(unknownFirst.fetch).decide(request());
    expect(partial).toMatchObject({ usd: 0.03, unpricedAttempts: 1, costKnown: false });
    // A known charge, then a last attempt with no cost: also incomplete.
    const unknownLast = fakeFetch({ status: 503, body: { usage: { cost: 0.04 } } }, decided(ALL, null));
    expect(await client(unknownLast.fetch).decide(request())).toMatchObject({ usd: 0.04, unpricedAttempts: 1, costKnown: false });
    // Two time-outs: both attempts were sent and neither gave a cost.
    const hung = await client(fakeFetch("hang").fetch, { timeout: 20 }).decide(request()).catch((e: unknown) => e);
    expect(hung).toMatchObject({ kind: "timeout", usd: null, unpricedAttempts: 2, costKnown: false });
    // Every attempt priced: complete.
    expect(await client(fakeFetch(decided(ALL)).fetch).decide(request())).toMatchObject({ unpricedAttempts: 0, costKnown: true });
  });
});
