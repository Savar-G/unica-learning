// Reads for /admin/ai (D-330): the database function admin_ai_usage with the admin's own session, and the one OpenRouter
// check. Server only (the page imports it). The page makes one or two function calls and at most one request to
// OpenRouter for each distinct key, all at once, with no polling and no prefetch (2026-11-06: a database stall).
import { PACIFIC_ZONE, localDateTime } from "@/lib/family-time";
import type { AdminSession } from "@/lib/admin-store";
import { keyMonthUsage, parseUsage, type OpenRouterCheck, type Period, type UsageView } from "@/lib/admin-ai-usage";

/** The usage of a period. Throws with the database's message when the function fails. */
export async function readAiUsage(a: AdminSession, period: Pick<Period, "from" | "to" | "days">, withTests: boolean, usdToCad: number): Promise<UsageView> {
  // The start of each day by the site's zone rules: the function groups the daily cost by them.
  const dayStarts = period.days.map((d) => new Date(localDateTime(d, PACIFIC_ZONE)).toISOString());
  const { data, error } = await a.db.rpc("admin_ai_usage", { p_from: period.from.toISOString(), p_to: period.to.toISOString(), p_with_tests: withTests, p_cad_per_usd: usdToCad, p_day_starts: dayStarts });
  if (error) throw new Error(`AI usage: ${error.message}`);
  return parseUsage(data);
}

/** The time limit of the OpenRouter check. */
export const OPENROUTER_CHECK_MS = 5_000;
export const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key";

/** The server's OpenRouter keys that make AI calls: the main key and the keys of marking, explanations and decisions. */
export function openRouterKeys(env: Readonly<Record<string, string | undefined>> = process.env): string[] {
  const names = ["OPENROUTER_API_KEY", "SCAN_MARKING_OPENROUTER_API_KEY", "PARENT_EXPLANATION_API_KEY", "DECISIONS_OPENROUTER_API_KEY"];
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
  return got.length === 0 ? null : { monthUsd: got.reduce((s, v) => s + v, 0), asked: keys.length, answered: got.length };
}
