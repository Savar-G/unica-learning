// Who a model request belongs to, for the voice worker's telemetry (worker/maya-voice/src/telemetry.ts). One async
// context carries three closed facts across the awaits between the code that knows them and the fetch that sends the
// request: the request's source, the worker turn that owns it, and the hint that prepared it. Nothing here is text, and
// nothing here changes a request or its timing. No Next.js import: the worker runs outside Next.
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Where a physical model request came from, when the code that makes it knows. `model`: a turn's own request (the first
 * try or a repair: the text controller does not say which, so they are told apart by the order in the turn).
 */
export type RequestSource = "model" | "prepared_interim" | "prepared_expected" | "review" | "repair";

export interface RequestContext {
  /** Absent: the code that made the request did not say. */
  source?: RequestSource;
  /** The worker turn that owns the request. `null`: no turn is known (a prepared request before the final). */
  turnId?: string | null;
  /** The worker's id of the interim hint that prepared the request. */
  prepareId?: string | null;
}

const store = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with `patch` over the current context. Its async work keeps the context. */
export function withRequestContext<T>(patch: RequestContext, fn: () => T): T {
  return store.run({ ...store.getStore(), ...patch }, fn);
}

export function requestContext(): RequestContext {
  return store.getStore() ?? {};
}
