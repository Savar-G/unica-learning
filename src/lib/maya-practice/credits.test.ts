import { describe, expect, it } from "vitest";
import { aiMayaModel } from "@/lib/maya-model";
import { aiTalkReviewer } from "@/lib/maya-talk-review";
import type { AiClient } from "@/lib/ai-client";
import { aiChildSimulator, aiJudge, aiValidityJudge, estimateCost, MAX_OUTPUT_TOKENS, PRACTICE_CASES } from ".";
import { capProblem, checkCredits, CREDITS_URL, DEFAULT_CONCURRENCY, inFlightNeed, OPENROUTER_CONCURRENCY, practiceConcurrency } from "./credits";

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

  it("uses what is left, not the total: the first-ship run's start (total 15, used 9.55, need 12.74) is refused", async () => {
    const r = await check(credits(15, 9.55), 12.48, 0.26);
    expect(r.ok).toBe(false);
    expect(r.remainingUsd).toBeCloseTo(5.45);
    for (const amount of ["USD 12.48", "USD 0.26", "USD 5.45"]) expect(r.message).toContain(amount);
  });

  it.each([
    ["a missing price: the estimate is not a number", NaN, 1],
    ["a missing price: the in-flight need is not a number", 10, NaN],
    ["a variable price of -1: a negative estimate", -5, 1],
    ["a variable price of -1: a negative in-flight need", 10, -1],
    ["an endless estimate", Infinity, 1],
  ])("refuses %s", async (_name, estimate, inFlight) => {
    const r = await check(credits(1000, 0), estimate, inFlight);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("refused");
  });

  it.each([["negative credits", -1, 0], ["negative usage", 100, -5], ["endless credits", Infinity, 0]])("refuses %s from OpenRouter", async (_name, total, used) => {
    expect(await check(async () => new Response(JSON.stringify({ data: { total_credits: total, total_usage: used } }).replace("null", "1e999")))).toMatchObject({ ok: false, remainingUsd: null });
  });

  it("never prints the key", async () => {
    const answers = [credits(15, 0), credits(1, 0), credits(1, 0, 403), async () => { throw new Error(`boom ${KEY}`); }];
    for (const fetch of answers) expect((await check(fetch)).message).not.toContain(KEY);
  });

  it("needs one largest request for each run in flight", () => {
    expect(inFlightNeed(2, 0.25)).toBe(0.5);
  });
});

describe("the spending cap's check", () => {
  it("refuses an estimate above the cap, and one that is not a real amount", () => {
    expect(capProblem(12, 20)).toBeNull();
    expect(capProblem(20, 20)).toBeNull();
    expect(capProblem(21, 20)).toContain("above the cap");
    for (const estimate of [NaN, Infinity, -1]) expect(capProblem(estimate, 20)).toContain("not a real amount");
    expect(capProblem(1, NaN)).toContain("not a real amount");
  });
});

describe("an estimate with a price that is no amount", () => {
  const good = { input: 1e-6, output: 1e-6 };
  const models = { maya: "m", simulator: "s", validity: "v", judge: "j" };
  const one = PRACTICE_CASES.slice(0, 1);
  it.each([["a variable price of -1", -1], ["a missing price", NaN]])("is no amount at all with %s on one role, so both checks refuse it", async (_name, bad) => {
    const e = await estimateCost(one, 1, models, { maya: good, simulator: good, validity: good, judge: { input: bad, output: bad } });
    expect(e.usd).toBeNaN();
    expect(e.largestRequest.usd).toBeNaN();
    expect(capProblem(e.usd, 100)).toContain("not a real amount");
    expect((await check(credits(1000, 0), e.usd, inFlightNeed(2, e.largestRequest.usd))).ok).toBe(false);
  });
  it("stays a real amount with real prices", async () => {
    const e = await estimateCost(one, 1, models, { maya: good, simulator: good, validity: good, judge: good });
    expect(e.usd).toBeGreaterThan(0);
    expect(e.largestRequest.usd).toBeGreaterThan(0);
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
