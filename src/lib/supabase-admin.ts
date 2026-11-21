import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { SUPABASE_URL } from "@/lib/supabase-public";

let admin: SupabaseClient<Database> | null = null;

/**
 * Server writes. The secret key skips row-level security, so it never leaves the server. Null when the key is not set.
 * With `retry: false` the client never retries a request: a caller with a deadline sets it, because the SDK retries a
 * GET that failed with a TimeoutError (not an AbortError) after 1, 2 and 4 seconds, past the signal.
 */
export function adminClient(signal?: AbortSignal, options: { retry?: boolean } = {}): SupabaseClient<Database> | null {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    console.error("[account] SUPABASE_SECRET_KEY is not set");
    return null;
  }
  if (signal) return createClient<Database>(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(options.retry === false ? { db: { retry: false } } : {}),
    global: {
      fetch: (input, init) => fetch(input, {
        ...init,
        signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : []), ...(input instanceof Request ? [input.signal] : [])]),
      }),
    },
  });
  admin ??= createClient<Database>(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
