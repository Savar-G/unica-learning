// The Anthropic adapter of the AI client (#183): the Claude Messages API, through the official SDK, with structured
// output (output_config.format, a JSON schema) and image input. For local tools only (the sample workbooks, #363), with
// an Anthropic API key, such as one paid by the monthly API credits of Savar's Max plan. The live site stays on
// OpenRouter (src/lib/ai-client.ts), because a key on monthly credits stops when the credits run out.
// API: https://platform.claude.com/docs/en/build-with-claude/structured-outputs (read 2026-10-31).
// fallbacks "default" (beta server-side-fallback-2026-07-01): a request the model declines is re-run on Anthropic's
// recommended fallback model inside the same call.
import Anthropic from "@anthropic-ai/sdk";
import type { AiClient, AiJsonRequest, AiPart } from "@/lib/ai-client";

/** The model when none is given: Claude Sonnet 5.5, the model the live site uses through OpenRouter. */
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 16_000;

/** The tokens of one answer, for the caller's cost count. */
export interface AnthropicUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

function part(p: AiPart): Anthropic.Beta.BetaContentBlockParam {
  if (p.type === "text") return { type: "text", text: p.text };
  return { type: "image", source: { type: "base64", media_type: p.mediaType, data: Buffer.from(p.data).toString("base64") } };
}

const short = (s: unknown) => String(s ?? "").slice(0, 160);

export function anthropicClient({
  apiKey,
  model = ANTHROPIC_DEFAULT_MODEL,
  fetch,
  maxRetries = 2,
  timeout = 200_000,
  onUsage,
}: {
  apiKey: string;
  model?: string;
  /** For tests: the fetch the SDK uses. */
  fetch?: typeof globalThis.fetch;
  /** Tries after the first for a lost connection, a 408, 409, 429 or 5xx (the SDK's rule). */
  maxRetries?: number;
  timeout?: number;
  /** Called once for each answer that has usage, also when its output is refused or cut off. */
  onUsage?: (usage: AnthropicUsage) => void;
}): AiClient {
  const client = new Anthropic({ apiKey, maxRetries, timeout, ...(fetch ? { fetch } : {}) });
  return {
    model,
    async json(request: AiJsonRequest, signal: AbortSignal) {
      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await client.beta.messages.create(
          {
            model,
            max_tokens: request.maxTokens ?? MAX_TOKENS,
            system: request.system,
            messages: [{ role: "user", content: request.content.map(part) }],
            thinking: { type: "adaptive" },
            output_config: { format: { type: "json_schema", schema: request.schema }, ...(request.effort ? { effort: request.effort } : {}) },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          },
          { signal },
        );
      } catch (e) {
        if (signal.aborted) throw new Error("time is up");
        if (e instanceof Anthropic.APIError) throw new Error(`Anthropic answered ${e.status ?? "no status"}: ${short(e.message)}`);
        throw new Error(`Anthropic could not be reached: ${short(e instanceof Error ? e.message : e)}`);
      }
      const u = message.usage;
      onUsage?.({
        model: message.model,
        inputTokens: u?.input_tokens ?? 0,
        outputTokens: u?.output_tokens ?? 0,
        cacheReadTokens: u?.cache_read_input_tokens ?? 0,
        cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
      });
      if (message.stop_reason === "refusal") throw new Error("the model refused");
      if (message.stop_reason !== "end_turn") throw new Error(`the model stopped: ${short(message.stop_reason)}`);
      const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      if (!text.trim()) throw new Error("no output");
      try {
        return JSON.parse(text);
      } catch {
        throw new Error("the output is not valid JSON");
      }
    },
  };
}
