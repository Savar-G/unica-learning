// The AI request observer (docs/sentry.md): openRouterClient runs each request through `observeAiCall`. By default it
// only runs the request. The Next.js server registers the Sentry observer (src/lib/ai-observe-sentry.ts, from
// src/instrumentation.ts), so this file imports no Sentry: the Maya voice worker, the Mac workbook worker and the
// scripts reach openRouterClient without the Sentry SDK in their dependencies.
import type { OpenRouterUsage } from "@/lib/ai-openrouter";

export interface AiCall { model: string; feature: string; provider: string }
/** Runs one AI request; `run` gets the usage hook that the adapter calls once per answer. */
export type AiObserver = <T>(call: AiCall, run: (onUsage: (u: OpenRouterUsage) => void) => Promise<T>) => Promise<T>;

const passThrough: AiObserver = (_call, run) => run(() => {});
// Held on globalThis: the bundler can give the instrumentation file and each route its own copy of this module.
const holder = globalThis as typeof globalThis & { __unicaAiObserver?: AiObserver };

/** Sets the observer of every later AI request; null restores the pass-through. */
export function setAiObserver(next: AiObserver | null): void {
  holder.__unicaAiObserver = next ?? undefined;
}

export function observeAiCall<T>(call: AiCall, run: (onUsage: (u: OpenRouterUsage) => void) => Promise<T>): Promise<T> {
  return (holder.__unicaAiObserver ?? passThrough)(call, run);
}
