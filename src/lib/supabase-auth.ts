import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/account";

/** The visitor's own session, from their cookies. Reads through it obey row-level security. */
export async function sessionClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
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
export async function parentId(client: SupabaseClient): Promise<string | null> {
  const { data } = await client.auth.getClaims();
  return typeof data?.claims.sub === "string" ? data.claims.sub : null;
}

let admin: SupabaseClient | null = null;

/** Server writes. The secret key skips row-level security, so it never leaves the server. Null when the key is not set. */
export function adminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  admin ??= createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
