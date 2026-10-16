// The AI client (#183): one interface for every AI feature (the work review and the report text of #68, and the learner
// profile's AI parts of #197, src/lib/learner-profile-ai.ts). Text and images go in; JSON that matches a schema comes out. The live adapter is OpenRouter
// (src/lib/ai-openrouter.ts), so any model on OpenRouter works with one setting; tests use the fake
// (src/lib/ai-client-fake.ts).
// Behind a switch: on only when OPENROUTER_API_KEY is set. Off, there is no client, so no AI call can happen.
// For the server only. No "server-only" import so that its tests can run, as src/lib/sign-in-link.ts.
import { openRouterClient } from "@/lib/ai-openrouter";

/** The model when AI_MODEL is not set: an OpenRouter model id with image input, structured output and reasoning. */
export const AI_DEFAULT_MODEL = "anthropic/claude-sonnet-5.5";

/** One part of what the model reads: text, or an image as bytes. */
export type AiPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/png" | "image/jpeg" | "image/webp"; data: Uint8Array };

/** One request for JSON output. */
export interface AiJsonRequest {
  /** A short name for the output, such as "work_review": letters, digits, "_" and "-" only. */
  name: string;
  /** The instructions. */
  system: string;
  /** What the model reads: the facts, the child's work. */
  content: AiPart[];
  /** A JSON Schema for the output: an object, with additionalProperties false and every property required. */
  schema: Record<string, unknown>;
  /** How much the model thinks first; omitted means the model's default. */
  effort?: "low" | "medium" | "high";
  /** The most output tokens, thinking included. */
  maxTokens?: number;
}

export interface AiClient {
  /** The model id, stored with each result ("fake" for the fake). */
  readonly model: string;
  /**
   * The parsed JSON output. Throws when there is none: a time-out, an HTTP error, a refusal, a cut-off answer or output
   * that is not JSON. The caller checks the output's shape.
   */
  json(request: AiJsonRequest, signal: AbortSignal): Promise<unknown>;
}

/** The client, or null when the AI is off (no OPENROUTER_API_KEY). The model comes from AI_MODEL. */
export function aiClient(env: Record<string, string | undefined> = process.env): AiClient | null {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;
  return openRouterClient({ apiKey, model: env.AI_MODEL?.trim() || AI_DEFAULT_MODEL });
}

/**
 * Runs one AI request with a time limit: the request's signal aborts after `ms`, and the result rejects with "time is
 * up" then, also when the request does not stop on its signal.
 */
export async function withTimeLimit<T>(ms: number, request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeUp = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("time is up"));
    }, ms);
  });
  try {
    return await Promise.race([request(controller.signal), timeUp]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
