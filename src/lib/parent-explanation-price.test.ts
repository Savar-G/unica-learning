import { expect, it } from "vitest";
import { EXPLANATION_MODEL } from "@/lib/parent-problem-explanation";
import { explanationPriceMetadata, explanationPriceReady } from "@/lib/parent-explanation-price";

const pricing = { prompt: "0.0000001", completion: "0.0000005", input_cache_write: "0.000000125",
  overrides: [{ min_prompt_tokens: 100000, prompt: "0.0000005", completion: "0.0000025" }] };
const model = { id: EXPLANATION_MODEL, pricing };
const provider = { provider_name: "Anthropic", tag: "anthropic", pricing, context_length: 1_000_000, max_completion_tokens: 128000,
  supported_parameters: ["reasoning", "max_tokens", "response_format", "structured_outputs"] };
const metadata = (change = {}) => explanationPriceMetadata({ data: [model] }, { data: { id: EXPLANATION_MODEL, endpoints: [{ ...provider, ...change }] } });
it("reads the exact pinned public provider and keeps its price tiers as approval evidence", () => {
  expect(metadata()).toMatchObject({ model: EXPLANATION_MODEL, provider: "anthropic", modelPricing: pricing, providerPricing: pricing });
});
it.each([
  { pricing: { ...pricing, prompt: "0.0000011" } }, { pricing: { ...pricing, completion: "0.0000031" } },
  { pricing: { ...pricing, request: "0.01" } }, { pricing: { ...pricing, prompt: "-1" } },
  { pricing: { ...pricing, overrides: [{ min_prompt_tokens: 100000, prompt: "0.1", completion: "0.1" }] } },
  { pricing: { ...pricing, input_cache_write: "0.0000021" } }, { tag: "google-vertex" },
  { supported_parameters: ["max_tokens"] }, { context_length: 1_000_001 }, { max_completion_tokens: 767 },
])("refuses unsafe or incompatible metadata: %j", change => { expect(metadata(change)).toBeNull(); });
it("refuses missing models, duplicate endpoints and malformed public lists", () => {
  expect(explanationPriceMetadata({}, {})).toBeNull();
  expect(explanationPriceMetadata({ data: [] }, { data: { id: EXPLANATION_MODEL, endpoints: [provider] } })).toBeNull();
  expect(explanationPriceMetadata({ data: [model] }, { data: { id: EXPLANATION_MODEL, endpoints: [provider, provider] } })).toBeNull();
});
const now = Date.parse("2026-11-15T19:00:00Z");
const price = { enabled: true, verified_at: new Date(now - 1000).toISOString(), protocol: "parent-problem-v1", max_input_bytes: 16384, max_tokens: 768, maximum_micros: 2500000 };
it("matches admission freshness, future timestamp, protocol and cap boundaries", () => {
  expect(explanationPriceReady(price, now)).toBe(true);
  expect(explanationPriceReady(null, now)).toBe(false);
  for (const change of [{ enabled: false }, { verified_at: null }, { verified_at: "invalid" }, { verified_at: new Date(now + 1).toISOString() },
    { verified_at: new Date(now - 86_400_000).toISOString() }, { protocol: "parent-problem-v2" }, { max_tokens: 769 }, { max_input_bytes: 16385 },
    { maximum_micros: null }, { maximum_micros: 0 }, { maximum_micros: 10000001 }]) expect(explanationPriceReady({ ...price, ...change }, now)).toBe(false);
});
