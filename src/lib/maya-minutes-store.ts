import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { MinutesStore } from "@/lib/maya-minutes";

// The minutes store (src/lib/maya-minutes.ts, #330) in Supabase. `grant` calls grant_maya_minutes with the secret key
// (one transaction under a lock per child, migration add_maya_minutes). `used` calls maya_minutes_used, which answers
// the server, or a parent for their own family with their own session (another caller is refused). Tests use
// src/lib/maya-minutes-memory.ts.

export function mayaMinutesStore(db: SupabaseClient<Database>): MinutesStore {
  return {
    async grant(r) {
      const { data, error } = await db.rpc("grant_maya_minutes", {
        p_call: r.callId, p_parent: r.parentId, p_child: r.childId, p_kind: r.kind, p_period: r.period,
        p_period_seconds: r.periodSeconds, p_call_seconds: r.callSeconds, p_min_seconds: r.minSeconds,
      });
      if (error) throw new Error(`maya minutes grant failed: ${error.message}`);
      const row = data?.[0];
      if (!row) throw new Error("maya minutes grant failed: no answer");
      return { seconds: row.granted, usedSeconds: row.used_before };
    },
    async used(q) {
      const { data, error } = await db.rpc("maya_minutes_used", { p_parent: q.parentId, p_child: q.childId, p_kind: q.kind, p_period: q.period });
      if (error) throw new Error(`maya minutes read failed: ${error.message}`);
      return data;
    },
  };
}
