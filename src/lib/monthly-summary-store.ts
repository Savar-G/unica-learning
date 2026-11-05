import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { SUMMARY_TRIES, SUMMARY_WINDOW_MS, type SummaryQuota } from "@/lib/monthly-summary";

// The shared count of monthly summary tries (#562) on Supabase, with the secret key: claim_monthly_summary_render
// (migration monthly_summary_renders) counts one try in public.monthly_summary_renders under a per-parent lock, so tries
// sent together to different function instances cannot all pass the limit. With no secret key, or a failed call, it
// throws: the route answers 503 rather than render uncounted.

export function summaryQuota(admin: SupabaseClient<Database> | null): SummaryQuota {
  return {
    async claim(parent) {
      if (!admin) throw new Error("summary count: no secret key");
      const { data, error } = await admin.rpc("claim_monthly_summary_render", {
        p_parent: parent, p_max: SUMMARY_TRIES, p_window_seconds: SUMMARY_WINDOW_MS / 1000,
      });
      if (error) throw new Error(`summary count: ${error.message}`);
      return data === true;
    },
  };
}
