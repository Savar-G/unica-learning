import { describe, expect, it, vi } from "vitest";
import { DecisionError } from "@/lib/decision-client";
import { fakeDecisionClient, noul } from "@/lib/decision-client-fake";
import { ENDPOINTS_URL, PRICE_CHECK_TTL_MS, PRICE_RETRY_MS, priceGuard, priceVerdict, withPriceGuard } from "@/lib/decision-price";

// The live price check (#855 comment): a decision request goes only while the pinned endpoint bills at or below the
// pinned prices. The shapes below are OpenRouter's endpoint list as read on 2026-11-11.
const list = (tag: string, pricing: Record<string, string>) => ({ data: { id: "m", endpoints: [{ tag, pricing }] } });
const JEV = list("typesafe", { prompt: "0.000000042", completion: "0", discount: "0" });
const GEMINI = list("google-ai-studio", { prompt: "0.0000001", completion: "0", web_search: "0.014", discount: "0" });

const fetchOf = (answers: unknown[]) => {
  const calls: string[] = [];
  const fetch = vi.fn(async (url: string | URL | Request) => {
    calls.push(String(url));
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (a === "network") throw new TypeError("fetch failed");
    return Response.json(a);
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
};

describe("the decision price check", () => {
  it("passes the live prices of 2026-11-11 for both pinned models; web search is not counted", () => {
    expect(priceVerdict("typesafe/jev-1.14", JEV)).toEqual({ ok: true });
    expect(priceVerdict("google/gemini-decision-1", GEMINI)).toEqual({ ok: true });
  });

  it("refuses a higher prompt or completion price, a price the bound does not count, a missing endpoint, and an unreadable answer", () => {
    // Disproved if any of these lets a request go.
    expect(priceVerdict("typesafe/jev-1.14", list("typesafe", { prompt: "0.000000043", completion: "0" }))).toMatchObject({ ok: false, reason: "above" });
    expect(priceVerdict("typesafe/jev-1.14", list("typesafe", { prompt: "0.000000042", completion: "0.000001" }))).toMatchObject({ ok: false, reason: "above" });
    expect(priceVerdict("typesafe/jev-1.14", list("typesafe", { prompt: "0.000000042", completion: "0", image: "0.0001" }))).toMatchObject({ ok: false, reason: "unbounded" });
    expect(priceVerdict("typesafe/jev-1.14", list("typesafe", { prompt: "0.000000042", completion: "0", request: "0.001" }))).toMatchObject({ ok: false, reason: "unbounded" });
    expect(priceVerdict("typesafe/jev-1.14", list("other", { prompt: "0", completion: "0" }))).toMatchObject({ ok: false, reason: "missing" });
    expect(priceVerdict("typesafe/jev-1.14", { error: "x" })).toMatchObject({ ok: false, reason: "unreadable" });
    expect(priceVerdict("typesafe/jev-1.14", list("typesafe", { prompt: "free", completion: "0" }))).toMatchObject({ ok: false, reason: "unreadable" });
  });

  it("checks once per model, again after a day; a failed check refuses with kind price and is tried again after a minute", async () => {
    let now = 0;
    const { fetch, calls } = fetchOf(["network", JEV]);
    const guard = priceGuard({ fetch, now: () => now });
    const error = await guard("typesafe/jev-1.14").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DecisionError);
    expect((error as DecisionError).kind).toBe("price");
    // Within the minute the failed answer holds: no second read.
    await expect(guard("typesafe/jev-1.14")).rejects.toThrow(/pinned price/);
    expect(calls).toHaveLength(1);
    now += PRICE_RETRY_MS;
    await guard("typesafe/jev-1.14");
    expect(calls).toEqual([ENDPOINTS_URL("typesafe/jev-1.14"), ENDPOINTS_URL("typesafe/jev-1.14")]);
    now += PRICE_CHECK_TTL_MS - 1;
    await guard("typesafe/jev-1.14");
    expect(calls).toHaveLength(2);
    now += 1;
    await guard("typesafe/jev-1.14");
    expect(calls).toHaveLength(3);
  });

  it("a client behind the guard sends nothing when the price is above the pinned one", async () => {
    const { fetch } = fetchOf([list("typesafe", { prompt: "0.000001", completion: "0" })]);
    const inner = fakeDecisionClient({ answer: () => ({ q: noul(0.9) }) });
    const client = withPriceGuard(inner, priceGuard({ fetch }));
    const error = await client.decide({ input: [{ type: "text", text: "x" }], questions: { q: { type: "noul", instructions: "?" } }, signal: new AbortController().signal }).catch((e: unknown) => e);
    expect((error as DecisionError).kind).toBe("price");
    expect(inner.requests).toHaveLength(0);
  });

  it("a caller whose signal stops while the check waits gets a time-out; the shared check goes on", async () => {
    let release: (v: Response) => void = () => {};
    const fetch = vi.fn(() => new Promise<Response>((r) => { release = r; })) as unknown as typeof globalThis.fetch;
    const guard = priceGuard({ fetch });
    const stop = new AbortController();
    const waiting = guard("typesafe/jev-1.14", stop.signal).catch((e: unknown) => e);
    stop.abort();
    expect(((await waiting) as DecisionError).kind).toBe("timeout");
    release(Response.json(JEV));
    await guard("typesafe/jev-1.14");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
