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
  /** The request's name ("workbook_page", "solve_check"). */
  name: string;
  provider: AiProvider;
  model: string;
  /** answered: JSON came back; failed: the provider took the call but gave no usable output; unavailable: it could not take it. */
  outcome: "answered" | "failed" | "unavailable";
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
  api: ((onCost: (usd: number) => void) => AiClient) | null;
  /** The model name the run stores (the frame's model check, the draft's model): the same whichever provider answers. */
  model: string;
  gate?: ProviderGate;
  onCall?: (record: AiCallRecord) => void;
  /** The clock, for each call's time. */
  now?: () => number;
}

export function fallbackAiClient(o: FallbackOptions): AiClient {
  const gate = o.gate ?? newGate();
  const now = o.now ?? (() => Date.now());
  const order: AiProvider[] = o.primary === "subscription" ? ["subscription", "api"] : ["api", "subscription"];
  const record = (r: AiCallRecord) => {
    try {
      o.onCall?.(r);
    } catch {
      // A record that cannot be kept never fails the call.
    }
  };
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
        const last = i === usable.length - 1;
        const started = now();
        let usd: number | null = provider === "subscription" ? 0 : null;
        let model = subscriptionModel;
        try {
          let out: unknown;
          if (provider === "subscription") out = await o.subscription!.json(request, signal);
          else {
            const client = o.api!((c) => { usd = (usd ?? 0) + c; });
            model = client.model;
            out = await client.json(request, signal);
          }
          record({ name: request.name, provider, model, outcome: "answered", ms: now() - started, usd, note: null });
          return out;
        } catch (e) {
          const ms = now() - started;
          if (signal.aborted) {
            record({ name: request.name, provider, model, outcome: "failed", ms, usd, note: "time is up" });
            throw e;
          }
          const down = provider === "subscription" ? e instanceof SubscriptionUnavailable : API_DOWN.test(message(e));
          if (!down) {
            record({ name: request.name, provider, model, outcome: "failed", ms, usd, note: note(e) });
            throw e;
          }
          record({ name: request.name, provider, model, outcome: "unavailable", ms, usd: provider === "subscription" ? 0 : usd, note: note(e) });
          const lasting = provider === "subscription" ? (e as SubscriptionUnavailable).lasting : API_LASTING.test(message(e));
          if (lasting) gate.off[provider] = note(e);
          if (last) {
            const other = provider === "subscription" ? "the API (no API key, or it is off for this run)" : "the subscription (none here, or it is off for this run)";
            throw new Error(`${message(e)}; no fallback: ${other}`);
          }
        }
      }
      throw new Error("No AI provider answered.");
    },
  };
}
