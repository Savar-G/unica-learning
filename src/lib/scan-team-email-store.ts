import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { ScanTeamEmailStore } from "@/lib/scan-team-email";

// The database side of the team's daily email (#718): migration 20261113075217_scan_team_daily_email.sql. It must be applied
// before this code ships. Until `npm run db:types` has run after the apply, the generated types do not know the function or the
// table, so this file reads the client through the small shape below; drop the cast when the types hold them.
interface Result { data: unknown; error: { code?: string; message: string } | null }
interface Rows {
  rpc(fn: "scan_team_waiting_count"): PromiseLike<Result>;
  from(table: "scan_team_email_days"): {
    insert(row: { day: string; waiting: number }): PromiseLike<Result>;
    update(row: Record<string, unknown>): { eq(column: "day", value: string): PromiseLike<Result> };
    delete(): { eq(column: "day", value: string): { eq(column: "state", value: "claimed"): PromiseLike<Result> } };
  };
}

export function scanTeamEmailStore(db: SupabaseClient<Database>): ScanTeamEmailStore {
  const rows = db as unknown as Rows;
  const days = () => rows.from("scan_team_email_days");
  const note = async (what: string, run: () => PromiseLike<Result>) => {
    try {
      const r = await run();
      if (r.error) console.error(`[scan team email] ${what} not saved; the claim stays held`, r.error.message);
    } catch (e) {
      console.error(`[scan team email] ${what} not saved; the claim stays held`, e instanceof Error ? e.message : "failed");
    }
  };
  return {
    async waitingCount() {
      const r = await rows.rpc("scan_team_waiting_count");
      if (r.error) throw new Error(`scan team count: ${r.error.message}`);
      const n = Number(r.data);
      if (!Number.isSafeInteger(n) || n < 0) throw new Error("scan team count: bad answer");
      return n;
    },
    async claimDay(day, waiting) {
      const r = await days().insert({ day, waiting });
      if (!r.error) return true;
      if (r.error.code === "23505") return false;
      throw new Error(`scan team claim: ${r.error.message}`);
    },
    sent: (day, emailId) => note("sent", () => days().update({ state: "sent", email_id: emailId, error: null, updated_at: new Date().toISOString() }).eq("day", day)),
    released: (day) => note("release", () => days().delete().eq("day", day).eq("state", "claimed")),
    unknown: (day, error) => note("unknown", () => days().update({ error: error.slice(0, 500), updated_at: new Date().toISOString() }).eq("day", day)),
  };
}
