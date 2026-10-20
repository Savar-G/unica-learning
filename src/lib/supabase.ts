import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

// With no session, row-level security lets the publishable key insert into public.signup_heard and call public.ping().
// Booking admission uses the service-only begin_booking_signup RPC so its hold commits before Stripe starts.
// A signed-in parent also reads their own parents and children rows (src/lib/supabase-auth.ts).
const URL = process.env.SUPABASE_URL ?? SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? SUPABASE_PUBLISHABLE_KEY;

let client: SupabaseClient<Database> | null = null;

export function supabase(): SupabaseClient<Database> {
  client ??= createClient<Database>(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
