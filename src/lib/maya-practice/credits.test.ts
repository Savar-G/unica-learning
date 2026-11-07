import { describe, expect, it } from "vitest";
import { aiMayaModel } from "@/lib/maya-model";
import { aiTalkReviewer } from "@/lib/maya-talk-review";
import type { AiClient } from "@/lib/ai-client";
import { aiChildSimulator, aiJudge, aiValidityJudge, MAX_OUTPUT_TOKENS } from ".";
import { checkCredits, CREDITS_URL, DEFAULT_CONCURRENCY, inFlightNeed, OPENROUTER_CONCURRENCY, practiceConcurrency } from "./credits";

const KEY = "sk-or-secret-key-value";
const credits = (total: unknown, used: unknown, status = 200) => async () => new Response(JSON.stringify({ data: { total_credits: total, total_usage: used } }), { status });
const check = (fetch: unknown, estimateUsd = 10, inFlightUsd = 1) => checkCredits({ fetch: fetch as typeof globalThis.fetch, key: KEY, estimateUsd, inFlightUsd });

describe("the credit check before a paid run", () => {
  it("asks OpenRouter's credits route once, with the key in the header only", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const r = await check(async (url: string, init: RequestInit) => {
      seen.push({ url, auth: new Headers(init.headers).get("authorization") });
      return credits(15, 2)();
    });
    expect(seen).toEqual([{ url: CREDITS_URL, auth: `Bearer ${KEY}` }]);
    expect(r).toMatchObject({ ok: true, remainingUsd: 13 });
  });

  it("refuses when what is left is below the estimate plus the in-flight need, and prints all three", async () => {
    const r = await check(credits(15, 13.93));
    expect(r.ok).toBe(false);
    expect(r.remainingUsd).toBeCloseTo(1.07);
    for (const amount of ["USD 10.00", "USD 1.00", "USD 1.07"]) expect(r.message).toContain(amount);
  });

  it("counts the in-flight need: enough for the estimate alone is refused", async () => {
    expect((await check(credits(10.5, 0))).ok).toBe(false);
    expect((await check(credits(11, 0))).ok).toBe(true);
  });

  it.each([
    ["a refused key", credits(15, 0, 403)],
    ["an unauthorized key", credits(15, 0, 401)],
    ["a server error", credits(15, 0, 500)],
    ["no answer", async () => { throw new Error(`boom ${KEY}`); }],
    ["an answer that is not JSON", async () => new Response("<html>", { status: 200 })],
    ["no amounts", async () => new Response("{}", { status: 200 })],
    ["amounts that are not numbers", credits("15", "2")],
  ])("refuses on a failed read: %s", async (_name, fetch) => {
    const r = await check(fetch);
    expect(r).toMatchObject({ ok: false, remainingUsd: null });
    expect(r.message).toContain("could not be read");
  });

  it("names the management key when the credits route refuses the key", async () => {
    expect((await check(credits(15, 0, 403))).message).toContain("OPENROUTER_MANAGEMENT_KEY");
  });

  it("never prints the key", async () => {
    const answers = [credits(15, 0), credits(1, 0), credits(1, 0, 403), async () => { throw new Error(`boom ${KEY}`); }];
    for (const fetch of answers) expect((await check(fetch)).message).not.toContain(KEY);
  });

  it("needs one largest request for each run in flight", () => {
    expect(inFlightNeed(2, 0.25)).toBe(0.5);
  });
});

describe("runs at the same time", () => {
  it("defaults to fewer on paid OpenRouter calls only", () => {
    expect(OPENROUTER_CONCURRENCY).toBeLessThan(DEFAULT_CONCURRENCY);
    expect(practiceConcurrency("openrouter", false)).toBe(OPENROUTER_CONCURRENCY);
    expect(practiceConcurrency("openrouter", true)).toBe(DEFAULT_CONCURRENCY);
    expect(practiceConcurrency("anthropic", false)).toBe(DEFAULT_CONCURRENCY);
    expect(practiceConcurrency("subscription", false)).toBe(DEFAULT_CONCURRENCY);
  });
});

describe("the output limit the in-flight need uses", () => {
  it("is each role's real request limit", async () => {
    const asked: Record<string, number | undefined> = {};
    const client = (role: string): AiClient => ({ model: "x", json: async (request) => { asked[role] = request.maxTokens; throw new Error("no call"); } });
    const stop = new AbortController().signal;
    const quiet = async (run: () => Promise<unknown>) => { try { await run(); } catch { /* the client always fails */ } };
    await quiet(() => aiMayaModel(client("maya")).propose({} as never, stop));
    await quiet(() => aiChildSimulator(client("simulator")).next({ persona: {} } as never, stop));
    await quiet(() => aiValidityJudge(client("validity")).check({} as never, stop));
    await quiet(() => aiJudge(client("judge")).judge({ rubric: [] } as never, stop));
    await quiet(() => aiTalkReviewer(client("reviewer")).review({} as never, stop));
    expect(asked).toEqual(MAX_OUTPUT_TOKENS);
  });
});
