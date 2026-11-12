import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

/** The visitor's own session, from their cookies. Reads through it obey row-level security. */
export async function sessionClient(signal?: AbortSignal): Promise<SupabaseClient<Database>> {
  const store = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    ...(signal ? { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
      ...init, signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : []), ...(input instanceof Request ? [input.signal] : [])]),
    }) } } : {}),
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Server Components cannot set cookies. src/proxy.ts refreshes the session before they render.
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {}
      },
    },
  });
}

/** The signed-in parent's id (their auth user id), or null. */
export async function parentId(client: SupabaseClient<Database>): Promise<string | null> {
  const { data } = await client.auth.getClaims();
  return typeof data?.claims.sub === "string" ? data.claims.sub : null;
}

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
