import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { EXPLANATION_MODEL } from "@/lib/parent-problem-explanation";
import { explanationPriceMetadata, EXPLANATION_PRICE_ENDPOINTS_URL, EXPLANATION_PRICE_MODELS_URL, EXPLANATION_PRICE_REFRESH_MS } from "@/lib/parent-explanation-price";

export async function reverifyParentExplanationPrice(db: SupabaseClient<Database>, options: { fetch?: typeof globalThis.fetch; now?: number; signal?: AbortSignal } = {}) {
  const now = options.now ?? Date.now(), fetch = options.fetch ?? globalThis.fetch;
  const { data: price, error } = await db.from("parent_explanation_prices").select("enabled,verified_at,last_checked_at").eq("model", EXPLANATION_MODEL).maybeSingle();
  if (error) throw new Error("explanation_price_read");
  if (!price?.enabled) return "disabled";
  const checked = Date.parse(price.last_checked_at ?? price.verified_at ?? "");
  if (checked <= now && checked > now - EXPLANATION_PRICE_REFRESH_MS) return "not_due";
  let metadata: ReturnType<typeof explanationPriceMetadata> = null, failure = "";
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000);
  try {
    const models = await fetch(EXPLANATION_PRICE_MODELS_URL, { cache: "no-store", signal });
    if (!models.ok) throw new Error("http");
    const endpoints = await fetch(EXPLANATION_PRICE_ENDPOINTS_URL, { cache: "no-store", signal });
    if (!endpoints.ok) throw new Error("http");
    metadata = explanationPriceMetadata(await models.json(), await endpoints.json());
    if (!metadata) failure = "incompatible_metadata";
  } catch { failure = "public_price_read_failed"; }
  const result = await db.rpc("reverify_parent_explanation_price", { p_metadata: metadata, p_error: failure });
  if (result.error) throw new Error("explanation_price_write");
  return result.data;
}
