import { EXPLANATION_CAP_MICROS, EXPLANATION_MAX_BYTES, EXPLANATION_MAX_TOKENS, EXPLANATION_MODEL } from "@/lib/parent-problem-explanation";
import type { Json } from "@/lib/database.types";

export const EXPLANATION_PRICE_REFRESH_MS = 23 * 60 * 60 * 1000;
export const EXPLANATION_PRICE_MODELS_URL = "https://openrouter.ai/api/v1/models";
export const EXPLANATION_PRICE_ENDPOINTS_URL = `${EXPLANATION_PRICE_MODELS_URL}/${EXPLANATION_MODEL}/endpoints`;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const rate = (value: unknown) => typeof value === "string" && /^\d+(\.\d+)?$/.test(value) && Number.isFinite(Number(value)) ? Number(value) : NaN;

export interface ExplanationPrice {
  enabled: boolean; verified_at: string | null; protocol: string; max_input_bytes: number; max_tokens: number; maximum_micros: number | null;
}
export function explanationPriceReady(price: ExplanationPrice | null, now: number): boolean {
  const verified = price?.verified_at ? Date.parse(price.verified_at) : NaN;
  return !!price?.enabled && Number.isFinite(verified) && verified <= now && verified > now - 86_400_000
    && price.protocol === "parent-problem-v1" && price.max_input_bytes === EXPLANATION_MAX_BYTES && price.max_tokens === EXPLANATION_MAX_TOKENS
    && Number.isSafeInteger(price.maximum_micros) && price.maximum_micros! > 0 && price.maximum_micros! <= EXPLANATION_CAP_MICROS;
}
const json = (value: unknown): value is Json => value === null || typeof value === "string" || typeof value === "boolean"
  || (typeof value === "number" && Number.isFinite(value)) || (Array.isArray(value) ? value.every(json) : object(value) && Object.values(value).every(json));
function safePricing(value: unknown): value is Record<string, Json> {
  if (!json(value)) return false;
  if (!object(value) || !(rate(value.prompt) <= 0.000001) || !(rate(value.completion) <= 0.000003)
    || (value.request !== undefined && rate(value.request) !== 0)) return false;
  for (const key of ["input_cache_read", "input_cache_write", "input_cache_write_1h"]) {
    if (value[key] !== undefined && !(rate(value[key]) <= 0.000002)) return false;
  }
  if (value.overrides === undefined) return true;
  return Array.isArray(value.overrides) && value.overrides.every(override => object(override)
    && typeof override.min_prompt_tokens === "number" && override.min_prompt_tokens > 0 && safePricing(override));
}
export function explanationPriceMetadata(models: unknown, endpoints: unknown) {
  if (!object(models) || !Array.isArray(models.data) || !object(endpoints) || !object(endpoints.data)
    || endpoints.data.id !== EXPLANATION_MODEL || !Array.isArray(endpoints.data.endpoints)) return null;
  const model = models.data.find(entry => object(entry) && entry.id === EXPLANATION_MODEL);
  const providers = endpoints.data.endpoints.filter(entry => object(entry) && entry.tag === "anthropic");
  if (!object(model) || providers.length !== 1 || !object(providers[0])) return null;
  const provider = providers[0];
  const parameters = provider.supported_parameters;
  const required = ["reasoning", "max_tokens", "response_format", "structured_outputs"];
  if (!safePricing(model.pricing) || !safePricing(provider.pricing) || provider.provider_name !== "Anthropic"
    || typeof provider.context_length !== "number" || provider.context_length < EXPLANATION_MAX_TOKENS || provider.context_length > 1_000_000
    || typeof provider.max_completion_tokens !== "number" || provider.max_completion_tokens < EXPLANATION_MAX_TOKENS
    || !Array.isArray(parameters) || !required.every(parameter => parameters.includes(parameter))) return null;
  return { model: EXPLANATION_MODEL, provider: "anthropic", modelPricing: model.pricing, providerPricing: provider.pricing,
    contextLength: provider.context_length, maxCompletionTokens: provider.max_completion_tokens };
}
