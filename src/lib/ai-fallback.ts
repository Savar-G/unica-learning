// The fallback AI client (D-200): the Claude subscription (`claude -p`, src/lib/ai-claude-cli.ts) and the paid API
// (OpenRouter, src/lib/ai-openrouter.ts) behind one AiClient, in the order `primary` gives (subscription first by
// default, WORKBOOK_AI_PRIMARY). Used only for workbook generation (the page writer and the solve check); the parent
// and child features stay on the API.
// - The subscription cannot take a call (a usage limit, no `claude`, not logged in, a crash, a request with an image):
//   the same call goes to the API. A usage limit, a missing CLI and a lost login last: the gate (shared by every client
//   of one run) keeps the rest of the run on the API instead of trying the subscription on every call.
// - The API cannot take a call (no key, or OpenRouter answers 401, 402, 403, 429 or 5xx, or cannot be reached) while
//   the subscription is second: the call goes to the subscription. A key or credit problem (401, 402, 403) lasts.
// - Any other failure (the output is not JSON or does not match the schema, a refusal, the time limit) is the caller's
//   to handle: the generator's retry and checks, as before. It is never sent to the other provider.
// Every call that reached a provider is reported to `onCall` with the provider, the model, the outcome, the time and
// the cost (0 on the subscription; OpenRouter's usage cost on the API, null when it did not say). No Node or network:
// the two clients are passed in.
import type { AiClient } from "@/lib/ai-client";
import { SubscriptionUnavailable } from "@/lib/ai-claude-cli";

export type AiProvider = "subscription" | "api";
export const AI_PROVIDERS: readonly AiProvider[] = ["subscription", "api"];

/** One AI call as a run records it (public.workbook_run_ai_calls). */
export interface AiCallRecord {
  id?: string;
  /** Physical requests for this logical provider call, including retries. */
  requests?: number;
  /** The request's name ("workbook_page", "solve_check"). */
  name: string;
  provider: AiProvider;
  model: string;
  /** answered: JSON came back; failed: the provider took the call but gave no usable output; unavailable: it could not take it. */
  outcome: "started" | "answered" | "failed" | "unavailable";
  ms: number;
  /** US dollars: 0 on the subscription; null when the API did not say. */
  usd: number | null;
  /** Why it failed or was unavailable (short). */
  note: string | null;
}

/**
 * Which providers a run may still use: a lasting failure turns one off for the rest of the run. One gate per run,
 * shared by the page writer's client and the solve check's, since a usage limit is the account's, not the model's.
 */
export interface ProviderGate {
  off: Partial<Record<AiProvider, string>>;
}

export const newGate = (): ProviderGate => ({ off: {} });

/** The API's failures that mean it cannot take the call (from the OpenRouter adapter's messages). */
const API_DOWN = /OpenRouter answered (401|402|403|408|429|5\d\d)|OpenRouter could not be reached/;
const API_LASTING = /OpenRouter answered (401|402|403)/;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const note = (e: unknown) => message(e).slice(0, 300);

export interface FallbackOptions {
  /** Which provider goes first. */
  primary: AiProvider;
  /** The subscription client; null where there is none (the server). */
  subscription: AiClient | null;
  /** Makes the API client for one call, reporting that call's cost; null with no API key. */
  api: ((onCost: (usd: number) => void, onRequest: () => Promise<void>) => AiClient) | null;
  /** The model name the run stores (the frame's model check, the draft's model): the same whichever provider answers. */
  model: string;
  gate?: ProviderGate;
  onCall?: (record: AiCallRecord) => unknown | Promise<unknown>;
  /** Durable intent, before the provider or each API retry. */
  onStart?: (record: AiCallRecord) => unknown | Promise<unknown>;
  onExclude?: (provider: AiProvider, reason: string) => unknown | Promise<unknown>;
  /** The clock, for each call's time. */
  now?: () => number;
}

export function fallbackAiClient(o: FallbackOptions): AiClient {
  const gate = o.gate ?? newGate();
  const now = o.now ?? (() => Date.now());
  const order: AiProvider[] = o.primary === "subscription" ? ["subscription", "api"] : ["api", "subscription"];
  const subscriptionModel = o.subscription?.model ?? o.model;
  return {
    model: o.model,
    async json(request, signal) {
      const usable = order.filter((p) => (p === "subscription" ? !!o.subscription : !!o.api) && !gate.off[p]);
      if (usable.length === 0) {
        const why = AI_PROVIDERS.flatMap((p) => (gate.off[p] ? [`${p === "subscription" ? "the subscription" : "the API"}: ${gate.off[p]}`] : []));
        throw new Error(`No AI provider can take the call${why.length ? ` (${why.join("; ")})` : ""}.`);
      }
      for (let i = 0; i < usable.length; i++) {
        const provider = usable[i];
        if (gate.off[provider]) continue;
        const last = i === usable.length - 1;
        if (signal.aborted) throw new Error("time is up");
        const started = now();
        const id = o.onStart ? crypto.randomUUID() : undefined;
        let usd: number | null = provider === "subscription" ? 0 : null;
        let model = subscriptionModel;
        let requests: number | undefined = o.onStart ? (provider === "api" ? 0 : 1) : undefined;
        const entry = (outcome: AiCallRecord["outcome"], detail: string | null): AiCallRecord => ({
          ...(id ? { id } : {}), ...(requests === undefined ? {} : { requests }),
          name: request.name, provider, model, outcome, ms: now() - started, usd, note: detail,
        });
        // Persistence errors must stop the call, rather than appear to be a provider failure.
        const beforeRequest = async () => {
          if (signal.aborted) throw new Error("time is up");
          requests = (requests ?? 0) + 1;
          await o.onStart?.(entry("started", null));
        };
        const client = provider === "subscription" ? o.subscription! : o.api!((c) => { usd = (usd ?? 0) + c; }, beforeRequest);
        model = client.model;
        await o.onStart?.(entry("started", null));
        if (signal.aborted) throw new Error("time is up");
        if (gate.off[provider]) continue;
        let out: unknown;
        let error: unknown;
        let failed = false;
        try {
          out = await client.json(request, signal);
        } catch (e) {
          failed = true;
          error = e;
        }
        if (!failed) {
          await o.onCall?.(entry("answered", null));
          return out;
        }
        const down = !signal.aborted && (provider === "subscription" ? error instanceof SubscriptionUnavailable : API_DOWN.test(message(error)));
        const lasting = down && (provider === "subscription" ? (error as SubscriptionUnavailable).lasting : API_LASTING.test(message(error)));
        if (lasting) {
          gate.off[provider] = note(error);
          await o.onExclude?.(provider, note(error));
        }
        await o.onCall?.(entry(down ? "unavailable" : "failed", signal.aborted ? "time is up" : note(error)));
        if (!down) throw error;
        if (last) {
          const other = provider === "subscription" ? "the API (no API key, or it is off for this run)" : "the subscription (none here, or it is off for this run)";
          throw new Error(`${message(error)}; no fallback: ${other}`);
        }
      }
      throw new Error("No AI provider answered.");
    },
  };
}
