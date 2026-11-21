import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

export { adminClient } from "@/lib/supabase-admin";

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
