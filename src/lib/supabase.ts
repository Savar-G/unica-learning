import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Project "pagewise" (org pagewise). The publishable key is public by design: row-level security
// lets it INSERT into public.signups and call public.ping(), nothing else. Reads happen in the dashboard.
const URL = process.env.SUPABASE_URL ?? "https://cdjobwsyzndtltzfpyqa.supabase.co";
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_QkL33gGZ-E1gOVdnLJsUEg_RgrRyqUs";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  client ??= createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
