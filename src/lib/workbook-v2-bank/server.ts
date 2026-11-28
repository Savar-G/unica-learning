import "server-only";
import { adminClient } from "@/lib/supabase-admin";
import { supabaseBankStore } from "./supabase-store";
import type { BankStore } from "./types";

// The bank store on the server: Supabase with the secret key (the bank tables are service-only).

/** The store, or null when the secret key is not set. */
export function bankServerStore(): BankStore | null {
  const db = adminClient();
  return db ? supabaseBankStore(db) : null;
}
