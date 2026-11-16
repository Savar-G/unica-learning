// Reads for /admin/ai (D-330): the database function admin_ai_usage with the admin's own session, and the one OpenRouter
// check. Server only (the page imports it). The page makes one or two function calls and at most one request to
// OpenRouter for each distinct key, all at once, with no polling and no prefetch (2026-11-06: a database stall).
import { PACIFIC_ZONE, localDateTime } from "@/lib/family-time";
import type { AdminSession } from "@/lib/admin-store";
import { accountCredits, keyMonthUsage, parseUsage, safeKeyLabel, type OpenRouterAccount, type OpenRouterBilling, type OpenRouterCheck, type Period, type UsageView } from "@/lib/admin-ai-usage";
import { keyAlias, keyIdentity } from "@/lib/ai-usage-context";
import { AI_PRODUCTS } from "@/lib/ai-product-keys";

/** The usage of a period. Throws with the database's message when the function fails. */
export async function readAiUsage(a: AdminSession, period: Pick<Period, "from" | "to" | "days">, withTests: boolean, usdToCad: number): Promise<UsageView> {
  // The start of each day by the site's zone rules: the function groups the daily cost by them.
  const dayStarts = period.days.map((d) => new Date(localDateTime(d, PACIFIC_ZONE)).toISOString());
  const { data, error } = await a.db.rpc("admin_ai_usage", { p_from: period.from.toISOString(), p_to: period.to.toISOString(), p_with_tests: withTests, p_cad_per_usd: usdToCad, p_day_starts: dayStarts });
  if (error) throw new Error(`AI usage: ${error.message}`);
  if (!data || typeof data !== "object" || !("totals" in data)) throw new Error("AI usage: no totals returned");
  const totals = data.totals;
  const cost = totals && typeof totals === "object" && "cost_usd" in totals ? totals.cost_usd : null;
  if (cost === null || cost === undefined || (typeof cost !== "number" && typeof cost !== "string") || (typeof cost === "string" && !cost.trim()) || !Number.isFinite(Number(cost)) || Number(cost) < 0) throw new Error("AI usage: no totals returned");
  return parseUsage(data);
}

/** The time limit of the OpenRouter check. */
export const OPENROUTER_CHECK_MS = 5_000;
export const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key";
export const OPENROUTER_CREDITS_URL = "https://openrouter.ai/api/v1/credits";

export async function openRouterAccount(env: Readonly<Record<string, string | undefined>> = process.env, fetchImpl: typeof globalThis.fetch = globalThis.fetch): Promise<OpenRouterAccount> {
  const billing = env.OPENROUTER_BILLING_API_KEY?.trim();
  const key = billing || env.OPENROUTER_API_KEY?.trim();
  const empty: OpenRouterAccount = { source: key ? billing ? "billing" : "main" : null, keyId: key ? keyIdentity(key) : null, status: key ? "unavailable" : "no-key", spentUsd: null, creditsUsd: null, balanceUsd: null };
  if (!key) return empty;
  try {
    // One selected account only. Different keys can belong to the same account; never add their credit balances.
    const res = await fetchImpl(OPENROUTER_CREDITS_URL, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(OPENROUTER_CHECK_MS), cache: "no-store" });
    if (!res.ok) return empty;
    const values = accountCredits(await res.json());
    return { ...empty, ...values, status: values.spentUsd !== null && values.creditsUsd !== null ? "ok" : values.spentUsd !== null || values.creditsUsd !== null ? "partial" : "unavailable" };
  } catch { return empty; }
}

export async function openRouterBilling(env: Readonly<Record<string, string | undefined>> = process.env, fetchImpl: typeof globalThis.fetch = globalThis.fetch): Promise<OpenRouterBilling> {
  const [account, month] = await Promise.all([openRouterAccount(env, fetchImpl), openRouterMonthCheck(env, fetchImpl)]);
  return { checkedAt: new Date().toISOString(), account, month };
}

/** The six product credentials. Historical shared credentials are excluded. */
export function openRouterKeys(env: Readonly<Record<string, string | undefined>> = process.env): string[] {
  const names = Object.values(AI_PRODUCTS);
  return [...new Set(names.map((n) => env[n]?.trim()).filter((k): k is string => !!k))];
}

/**
 * What OpenRouter says this month's usage is: GET /api/v1/key for each distinct key, once, all at once, each with a
 * 5 second limit, summed. "no-key" when no key is set; null when no key answered (the page then says so). A key that fails counts in
 * `asked` but not in `answered`, so the page can say the sum is partial. Never throws, and never returns a key.
 */
export async function openRouterMonthCheck(env: Readonly<Record<string, string | undefined>> = process.env, fetchImpl: typeof globalThis.fetch = globalThis.fetch): Promise<OpenRouterCheck | "no-key" | null> {
  const keys = openRouterKeys(env);
  if (keys.length === 0) return "no-key";
  const answers = await Promise.all(keys.map(async (key) => {
    try {
      const res = await fetchImpl(OPENROUTER_KEY_URL, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(OPENROUTER_CHECK_MS), cache: "no-store" });
      if (!res.ok) return null;
      return keyMonthUsage(await res.json());
    } catch {
      return null;
    }
  }));
  const got = answers.filter((v): v is number => v !== null);
  return got.length === 0 ? null : { monthUsd: got.reduce((s, v) => s + v, 0), asked: keys.length, answered: got.length,
    keys: keys.map((key, i) => ({ label: safeKeyLabel(keyAlias(key, env), keyIdentity(key)), monthUsd: answers[i] })) };
}
