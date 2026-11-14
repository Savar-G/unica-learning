import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { ScanTeamEmailStore } from "@/lib/scan-team-email";

// The database side of the team's daily email (#718). Each request takes the runner's bounded signal.
interface Result { error: { code?: string; message: string } | null }

export function scanTeamEmailStore(db: SupabaseClient<Database>): ScanTeamEmailStore {
  const days = () => db.from("scan_team_email_days");
  const note = async (what: string, run: () => PromiseLike<Result>) => {
    try {
      const r = await run();
      if (r.error) console.error(`[scan team email] ${what} not saved; the claim stays held`, r.error.message);
      return !r.error;
    } catch (e) {
      console.error(`[scan team email] ${what} not saved; the claim stays held`, e instanceof Error ? e.message : "failed");
      return false;
    }
  };
  return {
    async waitingCount(signal) {
      const r = await db.rpc("scan_team_waiting_count").abortSignal(signal ?? AbortSignal.timeout(2_000));
      if (r.error) throw new Error(`scan team count: ${r.error.message}`);
      const n = Number(r.data);
      if (!Number.isSafeInteger(n) || n < 0) throw new Error("scan team count: bad answer");
      return n;
    },
    async claimDay(day, waiting, signal) {
      const r = await days().insert({ day, waiting }).abortSignal(signal ?? AbortSignal.timeout(2_000));
      if (!r.error) return true;
      if (r.error.code === "23505") return false;
      throw new Error(`scan team claim: ${r.error.message}`);
    },
    sent: async (day, emailId, signal) => { await note("sent", () => days().update({ state: "sent", email_id: emailId, error: null, updated_at: new Date().toISOString() }).eq("day", day).abortSignal(signal ?? AbortSignal.timeout(2_000))); },
    released: (day, _error, signal) => note("release", () => days().delete().eq("day", day).eq("state", "claimed").abortSignal(signal ?? AbortSignal.timeout(2_000))),
    unknown: async (day, error, signal) => { await note("unknown", () => days().update({ error: error.slice(0, 500), updated_at: new Date().toISOString() }).eq("day", day).abortSignal(signal ?? AbortSignal.timeout(2_000))); },
  };
}
