import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

// Project "pagewise" (org pagewise). With no session, row-level security lets the publishable key INSERT into
// public.signups and public.signup_heard, and call public.ping(), nothing else. Reads happen in the dashboard.
// A signed-in parent also reads their own parents and children rows (src/lib/supabase-auth.ts).
const URL = process.env.SUPABASE_URL ?? SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? SUPABASE_PUBLISHABLE_KEY;

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  client ??= createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
