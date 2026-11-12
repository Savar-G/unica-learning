// The live price check of the decision models (the #855 comment, from the PR #863 review). The cost bound of a request
// (requestCostBound in src/lib/decision-client.ts) holds only while the provider bills at the prices pinned in
// DECISION_MODELS. Before a process sends its first decision request to a model, and again once a day, this reads the live
// prices of the model's pinned endpoint from OpenRouter's public endpoint list (GET /api/v1/models/<id>/endpoints, no key).
// A price above the pinned one, a price the bound does not count (per request, per image), a missing endpoint, or a check
// that fails or does not answer in time refuses the request ("price"). Never a pass by default.
import { DecisionError, decisionModelTerms, type DecisionClient } from "@/lib/decision-client";

export const ENDPOINTS_URL = (model: string) => `https://openrouter.ai/api/v1/models/${model}/endpoints`;
/** How long a good price check holds. */
export const PRICE_CHECK_TTL_MS = 24 * 60 * 60 * 1000;
/** How long a failed check holds before the next request checks again. */
export const PRICE_RETRY_MS = 60 * 1000;
/** The most one price check may take. */
export const PRICE_CHECK_TIMEOUT_MS = 2_000;
/** Prices that no request here uses, so the bound leaves them out: Gemini Decision 1 lists a web search price. */
const UNUSED_PRICES = new Set(["web_search", "discount"]);

export type PriceVerdict =
  | { ok: true }
  | { ok: false; reason: "above" | "unbounded" | "missing" | "unreadable"; detail: string };

const perMillion = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n * 1e6 : null;
};

/** The verdict on one answer of the endpoint list, for `model`. Pure: the tests give it the answer. */
export function priceVerdict(model: string, body: unknown): PriceVerdict {
  const terms = decisionModelTerms(model);
  const endpoints = (body as { data?: { endpoints?: unknown } } | null)?.data?.endpoints;
  if (!Array.isArray(endpoints)) return { ok: false, reason: "unreadable", detail: "no endpoint list" };
  const endpoint = endpoints.find((e) => e && typeof e === "object" && (e as { tag?: unknown }).tag === terms.provider) as { pricing?: Record<string, unknown> } | undefined;
  if (!endpoint) return { ok: false, reason: "missing", detail: `no ${terms.provider} endpoint` };
  const pricing = endpoint.pricing;
  if (!pricing || typeof pricing !== "object") return { ok: false, reason: "unreadable", detail: "no pricing" };
  const prompt = perMillion(pricing.prompt), completion = perMillion(pricing.completion);
  if (prompt === null || completion === null) return { ok: false, reason: "unreadable", detail: "no prompt or completion price" };
  // A small tolerance for the decimal strings: 0.000000042 * 1e6 is not exactly 0.042 in floating point.
  if (prompt > terms.promptUsdPerM + 1e-9) return { ok: false, reason: "above", detail: `prompt ${prompt} > ${terms.promptUsdPerM} per million` };
  if (completion > terms.completionUsdPerM + 1e-9) return { ok: false, reason: "above", detail: `completion ${completion} > ${terms.completionUsdPerM} per million` };
  for (const [key, value] of Object.entries(pricing)) {
    if (key === "prompt" || key === "completion" || UNUSED_PRICES.has(key)) continue;
    const n = perMillion(value);
    if (n === null) return { ok: false, reason: "unreadable", detail: `price ${key}` };
    if (n > 0) return { ok: false, reason: "unbounded", detail: `a ${key} price the cost bound does not count` };
  }
  return { ok: true };
}

/** Reads the live prices once. A failed read or an answer that is not the list is "unreadable". */
export async function checkDecisionPrice(model: string, o: { fetch?: typeof globalThis.fetch; signal?: AbortSignal } = {}): Promise<PriceVerdict> {
  const fetch = o.fetch ?? globalThis.fetch;
  try {
    const signal = o.signal ? AbortSignal.any([o.signal, AbortSignal.timeout(PRICE_CHECK_TIMEOUT_MS)]) : AbortSignal.timeout(PRICE_CHECK_TIMEOUT_MS);
    const res = await fetch(ENDPOINTS_URL(model), { signal, headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false, reason: "unreadable", detail: `HTTP ${res.status}` };
    return priceVerdict(model, await res.json());
  } catch (e) {
    return { ok: false, reason: "unreadable", detail: String(e instanceof Error ? e.name : e).slice(0, 80) };
  }
}

export type PriceGuard = (model: string, signal?: AbortSignal) => Promise<void>;

/**
 * A guard that checks a model's price once per process and again after PRICE_CHECK_TTL_MS. A failed check holds for
 * PRICE_RETRY_MS, so an outage does not send one check per request. Throws a DecisionError of kind "price".
 */
export function priceGuard(o: { fetch?: typeof globalThis.fetch; now?: () => number; ttlMs?: number; retryMs?: number } = {}): PriceGuard {
  const now = o.now ?? Date.now;
  const held = new Map<string, { verdict: Promise<PriceVerdict>; until: number }>();
  return async (model, signal) => {
    let entry = held.get(model);
    if (!entry || now() >= entry.until) {
      const at = now();
      // Shared by every request that waits for it, so no one caller's signal stops it: it has its own time limit.
      const verdict = checkDecisionPrice(model, { fetch: o.fetch });
      entry = { verdict, until: at + (o.ttlMs ?? PRICE_CHECK_TTL_MS) };
      held.set(model, entry);
      // A failed check holds only for the short time.
      void verdict.then((v) => { if (!v.ok && held.get(model) === entry) entry!.until = at + (o.retryMs ?? PRICE_RETRY_MS); });
    }
    const verdict = signal ? await Promise.race([entry.verdict, new Promise<never>((_, reject) => {
      if (signal.aborted) reject(new DecisionError("timeout", "time is up"));
      signal.addEventListener("abort", () => reject(new DecisionError("timeout", "time is up")), { once: true });
    })]) : await entry.verdict;
    if (!verdict.ok) throw new DecisionError("price", `the live price of ${model} was not checked as at or below the pinned price (${verdict.reason}: ${verdict.detail})`);
  };
}

/** The process's one guard, for the live client. */
export const livePriceGuard: PriceGuard = priceGuard();

/** The client, with the price guard before each request. */
export function withPriceGuard(client: DecisionClient, guard: PriceGuard): DecisionClient {
  return {
    model: client.model,
    maxAttempts: client.maxAttempts,
    async decide(request) {
      await guard(client.model, request.signal);
      return client.decide(request);
    },
  };
}
