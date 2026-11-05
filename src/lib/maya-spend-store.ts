import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { MICROS_PER_CAD, type SpendStore } from "@/lib/maya-spend";

// The spending ledger's store (src/lib/maya-spend.ts, D-290) in Supabase, with the secret key: reserve_maya_spend (one
// transaction under one lock for all of Maya, migration add_maya_spend), settle_maya_spend, maya_spend_used and
// claim_maya_spend_alert. Every call throws when the database does not answer, so the ledger refuses new paid work.
// Tests use src/lib/maya-spend-memory.ts. No "server-only" import: Maya's voice worker uses it too (maya-call-seams).

/** Micro-units within the database's bounds (CAD 100 a request). */
const MAX_MICROS = 100 * MICROS_PER_CAD;

export function mayaSpendStore(db: SupabaseClient<Database>): SpendStore {
  return {
    async reserve(r) {
      const { data, error } = await db.rpc("reserve_maya_spend", {
        p_id: r.id, p_charge: r.charge, p_parent: r.parentId, p_child: r.childId, p_call: r.callId, p_what: r.what,
        p_week: r.week, p_week_cap: r.charge === "child" ? r.weekMicros : null, p_month: r.month, p_month_cap: r.monthMicros,
        p_micros: Math.min(MAX_MICROS, r.micros), p_force: r.force,
      });
      if (error) throw new Error(`maya spend reserve failed: ${error.message}`);
      const row = data?.[0];
      if (!row) throw new Error("maya spend reserve failed: no answer");
      if (row.ok) return { ok: true };
      if (row.over !== "week" && row.over !== "month") throw new Error("maya spend reserve failed: an unknown answer");
      return { ok: false, over: row.over };
    },
    async settle(id, micros) {
      const { error } = await db.rpc("settle_maya_spend", { p_id: id, p_cost: micros === null ? null : Math.min(MAX_MICROS, micros) });
      if (error) throw new Error(`maya spend settle failed: ${error.message}`);
    },
    async used(q) {
      const { data, error } = await db.rpc("maya_spend_used", { p_child: q.childId, p_week: q.week, p_month: q.month });
      if (error) throw new Error(`maya spend read failed: ${error.message}`);
      const row = data?.[0];
      if (!row) throw new Error("maya spend read failed: no answer");
      return { week: Number(row.week_micros), month: Number(row.month_micros) };
    },
    async claimAlert(month) {
      const { data, error } = await db.rpc("claim_maya_spend_alert", { p_month: month });
      if (error) throw new Error(`maya spend alert claim failed: ${error.message}`);
      return data === true;
    },
  };
}
