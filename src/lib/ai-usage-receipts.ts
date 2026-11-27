// Only receipts emitted by the recorder are eligible for replay. There is no reconstruction from account totals.
import { AI_FEATURES, AI_PROVIDERS, usageRow, type AiUsageRow } from "@/lib/ai-usage";
import { AI_KEY_ALIASES, AI_USAGE_CONTEXTS } from "@/lib/ai-usage-context";

export function parseUsageReceipt(raw: unknown): AiUsageRow {
  if (!raw || typeof raw !== "object") throw new Error("Invalid usage receipt");
  const r = raw as AiUsageRow;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const bounded = (value: unknown, max: number) => typeof value === "string" && value.length > 0 && value.length <= max;
  const count = (value: unknown) => value === null || (Number.isSafeInteger(value) && Number(value) >= 0);
  if (!uuid.test(r.receipt_id) || typeof r.created_at !== "string" || !Number.isFinite(Date.parse(r.created_at)) || Date.parse(r.created_at) > Date.now() + 300_000 ||
    !bounded(r.model, 200) || !count(r.input_tokens) || !count(r.output_tokens) || !Number.isSafeInteger(r.calls) || r.calls < 1 || r.calls > 1000 ||
    (r.parent_id !== null && !uuid.test(r.parent_id)) || (r.child_id !== null && (!uuid.test(r.child_id) || r.parent_id === null)) ||
    (r.generation_id !== null && !bounded(r.generation_id, 200)) ||
    ((r.source_kind === null) !== (r.source_id === null)) || (r.source_kind !== null && (!bounded(r.source_kind, 60) || !bounded(r.source_id, 200))) ||
    !AI_FEATURES.includes(r.feature) || !AI_PROVIDERS.includes(r.provider) ||
    !AI_USAGE_CONTEXTS.includes(r.usage_context) || !AI_KEY_ALIASES.includes(r.key_alias) ||
    !["provider", "estimate", "unknown"].includes(r.cost_basis) ||
    (r.key_id !== null && !/^[a-f0-9]{64}$/.test(r.key_id)) ||
    (r.run_id !== null && !uuid.test(r.run_id)) ||
    (r.cost_usd !== null && (typeof r.cost_usd !== "number" || !Number.isFinite(r.cost_usd) || r.cost_usd < 0 || r.cost_usd >= 1_000_000)) ||
    (r.provider === "subscription" && r.cost_usd !== null)) throw new Error("Invalid usage receipt");
  const clean = usageRow({ feature: r.feature, context: r.usage_context, parentId: r.parent_id, childId: r.child_id,
    source: r.source_kind && r.source_id ? { kind: r.source_kind, id: r.source_id } : null }, {
    provider: r.provider, model: r.model, costUsd: r.cost_usd, inputTokens: r.input_tokens, outputTokens: r.output_tokens,
    generationId: r.generation_id, calls: r.calls, keyAlias: r.key_alias, keyId: r.key_id ?? undefined, costBasis: r.cost_basis,
  });
  if (!clean) throw new Error("Invalid usage receipt");
  return { ...clean, receipt_id: r.receipt_id, created_at: r.created_at, run_id: r.run_id };
}
