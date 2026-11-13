// The workbook generator's AI and where it runs (D-200). One place reads the settings:
// - WORKBOOK_RUNNER: "mac" (the default) or "server". With "mac", "Prepare next workbook" only queues the run and the
//   workbook worker on Savar's Mac (scripts/workbook-worker.ts, docs/workbook-worker.md) makes it. With "server", the
//   site makes it on Vercel with the API, as before D-200.
// - WORKBOOK_AI_PRIMARY: "subscription" (the default) or "api": which provider goes first where both exist (the Mac).
//   Set it to "api" when there are many more customers: one setting, no code change.
// - The subscription (`claude -p`, src/lib/ai-claude-cli.ts): WORKBOOK_CLAUDE_MODEL (default claude-sonnet-5-5) for the
//   page writer, WORKBOOK_CLAUDE_SOLVE_MODEL (default claude-haiku-5-5) for the solve check, WORKBOOK_CLAUDE_CONFIG_DIR
//   (CLAUDE_CONFIG_DIR: which Claude account; default the normal ~/.claude login), WORKBOOK_CLAUDE_COMMAND (default
//   "claude") and WORKBOOK_CLAUDE_TIMEOUT_MS (default 300000).
// - WORKBOOK_SUBSCRIPTION_PROVIDER: "claude" (default) or "codex". Codex requires WORKBOOK_CODEX_HOME, an explicit
//   absolute account directory. It fixes both models to gpt-6.1-sol with high effort and ChatGPT auth. It never uses
//   the API, even with WORKBOOK_AI_PRIMARY=api or API keys present. The worker checks local availability before claims.
// - The API (OpenRouter): OPENROUTER_API_KEY, AI_MODEL and AI_SOLVE_MODEL, as for every other AI feature.
// In Claude mode, the run's model name (the frame's model check and the draft's model) does not depend on which provider answers: it
// is the API model id when the subscription model is the same model (the defaults), so a run can go on with the
// fallback, or on the server, and still pass the check that its model did not change.
// No "server-only" import: the worker and the sample script (plain Node) use it too.
import { AI_DEFAULT_MODEL, AI_SOLVE_DEFAULT_MODEL, type AiClient } from "@/lib/ai-client";
import { CLAUDE_CLI_DEFAULT_MODEL, CLAUDE_CLI_SOLVE_DEFAULT_MODEL, CLAUDE_CLI_TIMEOUT_MS, claudeCliClient, type Spawner } from "@/lib/ai-claude-cli";
import { CODEX_SUBSCRIPTION_MODEL, codexCliClient, codexCliPreflight } from "@/lib/ai-codex-cli";
import { isAbsolute } from "node:path";
import { fallbackAiClient, newGate, type AiCallRecord, type AiProvider, type ProviderGate } from "@/lib/ai-fallback";
import { costingFetch, openRouterClient } from "@/lib/ai-openrouter";
import { recordAiUsage, type AiFeature, type AiUsageTag } from "@/lib/ai-usage";
import { aiSolver, type SolveLog, type Solver } from "@/lib/workbook-solve-check";

type Env = Record<string, string | undefined>;

export type WorkbookRunner = "mac" | "server";

/** Where "Prepare next workbook" makes a run: WORKBOOK_RUNNER, "mac" unless it says "server". */
export const workbookRunner = (env: Env = process.env): WorkbookRunner => (env.WORKBOOK_RUNNER?.trim().toLowerCase() === "server" ? "server" : "mac");

/** An explicit unknown provider must not silently select a different account or provider. */
export function workbookSubscriptionProvider(env: Env = process.env): "claude" | "codex" {
  const provider = env.WORKBOOK_SUBSCRIPTION_PROVIDER?.trim().toLowerCase() ?? "claude";
  if (provider !== "claude" && provider !== "codex") throw new Error("WORKBOOK_SUBSCRIPTION_PROVIDER must be claude or codex");
  if (provider === "codex" && !isAbsolute(env.WORKBOOK_CODEX_HOME?.trim() ?? "")) {
    throw new Error("WORKBOOK_CODEX_HOME must be an explicit absolute Codex account directory");
  }
  return provider;
}

/** Check before startup and before each worker claim. This sends no model request. */
export async function workbookAiPreflight(env: Env = process.env, options: { spawn?: Spawner; signal?: AbortSignal } = {}): Promise<void> {
  if (workbookSubscriptionProvider(env) === "codex") {
    await codexCliPreflight({ configDir: env.WORKBOOK_CODEX_HOME!.trim(), env, ...options });
  }
}

/** Which provider goes first: WORKBOOK_AI_PRIMARY, "subscription" unless it says "api". */
export const workbookAiPrimary = (env: Env = process.env): AiProvider => (workbookSubscriptionProvider(env) !== "codex" && env.WORKBOOK_AI_PRIMARY?.trim().toLowerCase() === "api" ? "api" : "subscription");

/** "anthropic/claude-sonnet-5.5" and "claude-sonnet-5-5" name the same model. */
const sameModel = (cli: string, api: string) => api.replace(/^anthropic\//, "").replace(/\./g, "-") === cli;

/** The run's model name for a subscription model and an API model: the API id when both are the same model. */
export const runModelName = (cli: string, api: string) => (sameModel(cli, api) ? api : `${cli} or ${api}`);

/** The models the settings give. */
export function workbookModels(env: Env = process.env) {
  const cli = env.WORKBOOK_CLAUDE_MODEL?.trim() || CLAUDE_CLI_DEFAULT_MODEL;
  const cliSolve = env.WORKBOOK_CLAUDE_SOLVE_MODEL?.trim() || CLAUDE_CLI_SOLVE_DEFAULT_MODEL;
  const api = env.AI_MODEL?.trim() || AI_DEFAULT_MODEL;
  const apiSolve = env.AI_SOLVE_MODEL?.trim() || AI_SOLVE_DEFAULT_MODEL;
  if (workbookSubscriptionProvider(env) === "codex") {
    return { cli: CODEX_SUBSCRIPTION_MODEL, cliSolve: CODEX_SUBSCRIPTION_MODEL, api, apiSolve, write: CODEX_SUBSCRIPTION_MODEL, solve: CODEX_SUBSCRIPTION_MODEL };
  }
  return { cli, cliSolve, api, apiSolve, write: runModelName(cli, api), solve: runModelName(cliSolve, apiSolve) };
}

export type AiCallKind = "write" | "solve";

/** One run's AI: the page writer's client and the solve check with each check's cost, sharing one provider gate. */
export interface WorkbookAi {
  /** Null when no provider is set up (no subscription here and no API key). */
  ai: AiClient | null;
  solve: { solver: Solver; cost(log: SolveLog): number | null } | null;
  gate: ProviderGate;
}

export interface WorkbookAiOptions {
  /** Whether a subscription CLI may run here: true on the Mac, false on the server. */
  subscription: boolean;
  /** Exactly one provider request per ledger dispatch for edit batches. */
  singleDispatch?: boolean;
  /** Overrides WORKBOOK_AI_PRIMARY (the sample script's --api). */
  primary?: AiProvider;
  /** For tests: the process seam of `claude -p`. */
  spawn?: Spawner;
  /** For tests: the fetch under the API client. */
  fetch?: typeof globalThis.fetch;
  /** Each AI call, with what made it. */
  onCall?: (kind: AiCallKind, record: AiCallRecord) => unknown | Promise<unknown>;
  onStart?: (kind: AiCallKind, record: AiCallRecord) => unknown | Promise<unknown>;
  onExclude?: (provider: AiProvider, reason: string) => unknown | Promise<unknown>;
  gate?: ProviderGate;
  now?: () => number;
  /** Whose run this is, for the AI usage ledger (D-330). Without it the calls are stored with no family. */
  usage?: { parentId: string | null; childId: string | null; runId: string; kind?: "workbook_run" | "first_pages" };
}

/** The API's time limit for one workbook call: the page writer's calls can be long. */
const API_TIMEOUT_MS = 200_000;
const API_SOLVE_TIMEOUT_MS = 60_000;

/**
 * The generator's AI for one run, from the settings. On the server (`subscription: false`) it is the API only; on the
 * Mac, Claude and the API follow WORKBOOK_AI_PRIMARY. Explicit Codex mode is subscription only and refuses the server.
 * Each solve check's cost is the cost of its own calls.
 */
export function workbookAi(env: Env, o: WorkbookAiOptions): WorkbookAi {
  const codex = workbookSubscriptionProvider(env) === "codex";
  if (codex && !o.subscription) throw new Error("The selected Codex subscription cannot run here; API fallback is disabled");
  const models = workbookModels(env);
  const gate = o.gate ?? newGate();
  const primary = codex ? "subscription" : o.primary ?? workbookAiPrimary(env);
  const apiKey = codex ? undefined : env.OPENROUTER_API_KEY?.trim();
  const base = o.fetch ?? globalThis.fetch;
  const timeout = Number(env.WORKBOOK_CLAUDE_TIMEOUT_MS) > 0 ? Number(env.WORKBOOK_CLAUDE_TIMEOUT_MS) : CLAUDE_CLI_TIMEOUT_MS;
  const tagOf = (feature: AiFeature): AiUsageTag => ({ feature, parentId: o.usage?.parentId, childId: o.usage?.childId, source: o.usage ? { kind: o.usage.kind ?? "workbook_run", id: o.usage.runId } : null });
  const cli = (model: string, feature: AiFeature) => o.subscription
    ? codex
      ? codexCliClient({ configDir: env.WORKBOOK_CODEX_HOME!.trim(), spawn: o.spawn, env })
      : claudeCliClient({ model, command: env.WORKBOOK_CLAUDE_COMMAND?.trim() || "claude", spawn: o.spawn, env, configDir: env.WORKBOOK_CLAUDE_CONFIG_DIR, timeout,
          onUsage: (u) => recordAiUsage(tagOf(feature), { provider: "subscription", model, inputTokens: u.inputTokens, outputTokens: u.outputTokens }) })
    : null;
  const api = (model: string, ms: number, feature: AiFeature) => apiKey
    ? (onCost: (usd: number) => void, onRequest: () => Promise<void>, onDispatch: () => void) => openRouterClient({ apiKey, model, fetch: costingFetch(onCost, base), timeout: ms, maxRetries: o.singleDispatch ? 0 : 1, onRequest, onDispatch,
        onUsage: (u) => recordAiUsage(tagOf(feature), { provider: "openrouter", model, inputTokens: u.inputTokens, outputTokens: u.outputTokens, costUsd: u.costUsd, generationId: u.id }) })
    : null;
  const writeCli = cli(models.cli, "workbook");
  const writeApi = api(models.api, API_TIMEOUT_MS, "workbook");
  if (!writeCli && !writeApi) return { ai: null, solve: null, gate };
  const ai = fallbackAiClient({
    primary, singleDispatch: o.singleDispatch, subscription: writeCli, api: writeApi, model: models.write, gate, now: o.now,
    onCall: (r) => o.onCall?.("write", r),
    ...(o.onStart ? { onStart: (r: AiCallRecord) => o.onStart!("write", r) } : {}),
    onExclude: o.onExclude,
  });
  const solveCli = cli(models.cliSolve, "solve_check");
  const solveApi = api(models.apiSolve, API_SOLVE_TIMEOUT_MS, "solve_check");
  // Each check's cost (#312 round 3), kept until the job asks for it with the check's log, matched by what the reader
  // was shown: a check that was late gets none (its answer's cost goes to the next check of the same words, or none).
  const costs = new Map<string, number[]>();
  const keyOf = (questions: SolveLog["questions"]) => JSON.stringify(questions);
  const solver: Solver = {
    model: models.solve,
    async solve(request, signal) {
      let usd: number | null = null;
      const client = fallbackAiClient({
        primary, singleDispatch: o.singleDispatch, subscription: solveCli, api: solveApi, model: models.solve, gate, now: o.now,
        ...(o.onStart ? { onStart: (r: AiCallRecord) => o.onStart!("solve", r) } : {}),
        onExclude: o.onExclude,
        onCall: async (r) => {
          if (r.usd !== null) usd = (usd ?? 0) + r.usd;
          await o.onCall?.("solve", r);
        },
      });
      try {
        return await aiSolver(client).solve(request, signal);
      } finally {
        if (usd !== null) {
          const key = keyOf(request.questions);
          costs.set(key, [...(costs.get(key) ?? []), usd]);
        }
      }
    },
  };
  return {
    ai, gate,
    solve: {
      solver,
      cost(log) {
        const key = keyOf(log.questions);
        const [first, ...rest] = costs.get(key) ?? [];
        if (first === undefined) return null;
        if (rest.length) costs.set(key, rest);
        else costs.delete(key);
        return first;
      },
    },
  };
}

/** A run's AI calls by provider (the admin run page): calls that reached it, how many failed, and the API's cost. */
export interface AiCallSummary {
  subscription: { calls: number; failed: number };
  incomplete: number;
  retries: number;
  api: { calls: number; failed: number; usd: number; noCost: number };
  /** Calls a provider could not take (then sent to the other), with the last reason. */
  unavailable: { subscription: number; api: number; last: string | null };
}

export function summarizeAiCalls(rows: { provider: AiProvider; outcome: AiCallRecord["outcome"]; usd: number | null; note: string | null; requests?: number | null }[]): AiCallSummary {
  const s: AiCallSummary = { incomplete: 0, retries: 0, subscription: { calls: 0, failed: 0 }, api: { calls: 0, failed: 0, usd: 0, noCost: 0 }, unavailable: { subscription: 0, api: 0, last: null } };
  for (const r of rows) {
    s.retries += Math.max(0, (r.requests ?? 1) - 1);
    if (r.provider === "api") {
      if (r.usd === null) s.api.noCost++;
      else s.api.usd += r.usd;
    }
    if (r.outcome === "started") { s.incomplete++; continue; }
    if (r.outcome === "unavailable") {
      s.unavailable[r.provider]++;
      s.unavailable.last = r.note;
      continue;
    }
    const p = s[r.provider];
    p.calls++;
    if (r.outcome === "failed") p.failed++;
  }
  return s;
}
