// The AI usage ledger's writer (D-330, public.ai_usage_events). Each adapter of the AI client reports one reading for
// each call that came back (the provider, the model, the tokens, the cost in US dollars when the provider gave one, the
// generation id); the caller's tag says which feature made the call and for whom. `recordAiUsage` stores the reading.
//
// Rules: it never throws and never waits. It starts the write and returns, so a failed or slow write never reaches the
// caller (a child's request included). Nothing about a child but the ids goes in: no name, no prompt, no answer.
// A call with no family has no parent id (team tools, sample runs). A write that fails is logged without data.
// The ledger is for the admin overview (/admin/ai); the older ledgers keep their own jobs (Maya's cap, marking's cap).
// For the server and the workbook worker. No "server-only" import, so that its tests can run.
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

/** The live sink: one insert with the server's secret key. With no key, nothing is written. */
const supabaseSink: AiUsageSink = async (row) => {
  // No key (a local run) or a test run: no write, and no log line from adminClient. Tests give their own sink.
  if (!process.env.SUPABASE_SECRET_KEY || process.env.VITEST) return;
  // Loaded here, not at the top: supabase-auth is server only, and the tests of every AI adapter import this file.
  const { adminClient } = await import("@/lib/supabase-auth");
  const db = adminClient(AbortSignal.timeout(WRITE_LIMIT_MS), { retry: false });
  if (!db) return;
  const { error } = await db.from("ai_usage_events").insert(row);
  // A repeated generation id (23505) is the same call again: nothing to say.
  if (error && error.code !== "23505") console.error(`[ai-usage] write failed: ${error.code ?? "error"}`);
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
