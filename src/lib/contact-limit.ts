import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";

// The site-wide limit on the contact form (/api/contact): claim_contact_message (migration contact_message_limit) counts
// one accepted message in public.contact_message_claims under a lock, so messages sent together to different function
// instances cannot all pass. The table holds only a time: no IP address, no cookie, nothing of the message. With no
// secret key, or a failed call, it throws: the route sends no email.

/** Accepted messages for the whole site in one window. */
export const CONTACT_MAX = 20;
export const CONTACT_WINDOW_SECONDS = 60 * 60;

export interface ContactLimit {
  /** True when the message is counted and may be sent; false at the limit. Throws when it cannot count. */
  claim(): Promise<boolean>;
}

export function contactLimit(admin: SupabaseClient<Database> | null): ContactLimit {
  return {
    async claim() {
      if (!admin) throw new Error("contact limit: no secret key");
      const { data, error } = await admin.rpc("claim_contact_message", { p_max: CONTACT_MAX, p_window_seconds: CONTACT_WINDOW_SECONDS });
      if (error) throw new Error(`contact limit: ${error.message}`);
      return data === true;
    },
  };
}
