import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

let client: SupabaseClient<Database> | null = null;

/** The browser's Supabase client: the publishable key and the parent's own session, kept in cookies the server can read. */
export function browserClient(): SupabaseClient<Database> {
  client ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return client;
}
