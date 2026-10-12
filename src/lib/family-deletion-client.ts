import "server-only";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

/** Both SDKs use this fetch boundary. Work aborts never cancel the separate control client. */
export function deletionFetch(signal: AbortSignal, requestMs: number): typeof fetch {
  return (input, init) => fetch(input, {
    ...init,
    signal: AbortSignal.any([signal, AbortSignal.timeout(requestMs),
      ...(init?.signal ? [init.signal] : []), ...(input instanceof Request ? [input.signal] : [])]),
  });
}

export function deletionClient(url: string, key: string, signal: AbortSignal, requestMs: number) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: deletionFetch(signal, requestMs) },
  });
}

export function deletionPayments(key: string, signal: AbortSignal) {
  return new Stripe(key, { maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient(deletionFetch(signal, 30_000)) });
}
