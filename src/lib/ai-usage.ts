// The AI usage ledger's writer (D-330, public.ai_usage_events). Each adapter of the AI client reports one reading for
// each call that came back (the provider, the model, the tokens, the cost in US dollars when the provider gave one, the
// generation id); the caller's tag says which feature made the call and for whom. `recordAiUsage` stores the reading.
//
// Rules: it never throws and never waits. It starts the write and returns, so a failed or slow write never reaches the
// caller (a child's request included). Nothing about a child but the ids goes in: no name, no prompt, no answer.
// A call with no family has no parent id (team tools, sample runs). A write that fails is logged without data.
// The ledger is for the admin overview (/admin/ai); the older ledgers keep their own jobs (Maya's cap, marking's cap).
// For the server and the workers. No "server-only" import and no Supabase client, so that its tests can run and the
// workers stay small.
import { SUPABASE_URL } from "@/lib/supabase-public";
/** What made the call. Matches the check on ai_usage_events.feature. */
export const AI_FEATURES = [
  "workbook", "solve_check", "workbook_gate", "maya", "maya_review", "maya_note", "maya_speech", "child_profile",
  "learner_profile", "report", "work_review", "marking", "explain", "photo_check", "other",
] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export type AiProviderKind = "openrouter" | "anthropic" | "subscription";

/** Who and what a call is for. Ids only. */
export interface AiUsageTag {
  feature: AiFeature;
  parentId?: string | null;
  childId?: string | null;
  /** The thing that made the call, such as "workbook_run" and its id, or "maya_call" and its id. */
  source?: { kind: string; id: string } | null;
}

/** What an adapter knows about one call that came back. */
export interface AiUsageReading {
  provider: AiProviderKind;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  /** US dollars; null when the provider gave none (the subscription, or an answer with no cost). */
  costUsd?: number | null;
  generationId?: string | null;
  /** More than one provider request in one reading (a decision call with retries). Default 1. */
  calls?: number;
}

/** One row of the ledger, as the sink gets it. */
export interface AiUsageRow {
  feature: AiFeature;
  provider: AiProviderKind;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  calls: number;
  generation_id: string | null;
  parent_id: string | null;
  child_id: string | null;
  source_kind: string | null;
  source_id: string | null;
}

export type AiUsageSink = (row: AiUsageRow) => Promise<void>;

/** The write stops after this long, so a slow database never holds a process open. */
const WRITE_LIMIT_MS = 5_000;

const count = (n: unknown): number | null => (typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null);
const money = (n: unknown): number | null => (typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 1_000_000 ? Math.round(n * 1e8) / 1e8 : null);
const text = (s: unknown, max: number): string | null => (typeof s === "string" && s.length > 0 ? s.slice(0, max) : null);

/** The row of one reading. Null when the reading cannot be stored (no model name). */
export function usageRow(tag: AiUsageTag, reading: AiUsageReading): AiUsageRow | null {
  const model = text(reading.model, 200);
  if (!model) return null;
  const parentId = text(tag.parentId, 64);
  const source = tag.source && text(tag.source.kind, 60) && text(tag.source.id, 200) ? tag.source : null;
  return {
    feature: (AI_FEATURES as readonly string[]).includes(tag.feature) ? tag.feature : "other",
    provider: reading.provider,
    model,
    input_tokens: count(reading.inputTokens),
    output_tokens: count(reading.outputTokens),
    cost_usd: reading.provider === "subscription" ? null : money(reading.costUsd),
    calls: Math.min(1000, Math.max(1, Math.trunc(reading.calls ?? 1))),
    generation_id: text(reading.generationId, 200),
    parent_id: parentId,
    // The ledger holds a child only with the family.
    child_id: parentId ? text(tag.childId, 64) : null,
    source_kind: source ? source.kind.slice(0, 60) : null,
    source_id: source ? source.id.slice(0, 200) : null,
  };
}

/**
 * One insert through PostgREST with the server's secret key. No Supabase client: this file is bundled into the workbook
 * worker and the voice worker, which must not pull in cookie-based auth or more packages. A repeated generation id (409,
 * unique index) is the same call again: nothing to say.
 */
export async function insertUsageRow(row: AiUsageRow, o: { url: string; key: string; fetch?: typeof globalThis.fetch }): Promise<void> {
  const res = await (o.fetch ?? globalThis.fetch)(`${o.url}/rest/v1/ai_usage_events`, {
    method: "POST",
    headers: { apikey: o.key, authorization: `Bearer ${o.key}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(WRITE_LIMIT_MS),
  });
  // 409 is a repeated generation id (the same call again), and also a foreign key that does not hold (a wrong tag, a
  // family deleted meanwhile): only a row with a generation id can be the first, so only then is it quiet.
  if (!res.ok && !(res.status === 409 && row.generation_id)) console.error(`[ai-usage] write failed: ${res.status}`);
}

let configured: { url: string; key: string } | null = null;
/**
 * For a process that gets its secret key some other way than the environment (the workbook worker on the Mac reads it
 * from the Keychain and the Management API, and never puts it in process.env): the url and key the live sink uses.
 */
export function configureAiUsage(target: { url: string; key: string } | null): void {
  configured = target;
}

/** The live sink. With no secret key (a local run) or in a test run, nothing is written. Tests give their own sink. */
const supabaseSink: AiUsageSink = async (row) => {
  if (process.env.VITEST) return;
  const key = configured?.key ?? process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key) return;
  await insertUsageRow(row, { url: configured?.url ?? (process.env.SUPABASE_URL?.trim() || SUPABASE_URL), key });
};

const pending = new Set<Promise<void>>();

/**
 * Stores one reading and returns at once. Never throws. `sink` is for tests.
 * With no SUPABASE_SECRET_KEY the live sink writes nothing (and logs nothing more than adminClient does).
 */
export function recordAiUsage(tag: AiUsageTag | null | undefined, reading: AiUsageReading, sink: AiUsageSink = supabaseSink): void {
  try {
    const row = usageRow(tag ?? { feature: "other" }, reading);
    if (!row) return;
    const write: Promise<void> = Promise.resolve()
      .then(() => sink(row))
      .catch(() => { console.error("[ai-usage] write failed"); })
      .finally(() => { pending.delete(write); });
    pending.add(write);
  } catch {
    // Recording is never the caller's problem.
  }
}

/** Waits for the writes in flight, for a script or a worker that is about to exit. Never throws. */
export async function flushAiUsage(): Promise<void> {
  await Promise.allSettled([...pending]);
}
