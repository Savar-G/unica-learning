import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { AlertKey, AlertLedger } from "@/lib/maya-call-alert";
import type { AlertState } from "@/lib/maya-call";

// The alert ledger of Maya's call alerts (src/lib/maya-call-alert.ts, #333) in Supabase: public.maya_call_alerts with
// the secret key (only the server writes; admins read with their own session). The row is the claim: one per call and
// flag level (a unique key). It is claimed again only when its send was refused, or when a claim was left "sending"
// for longer than 10 minutes by a run that stopped. Tests use src/lib/maya-call-alert-memory.ts.

const STALE_ALERT_MS = 10 * 60_000;
type Row = Database["public"]["Tables"]["maya_call_alerts"]["Row"];
type Update = Database["public"]["Tables"]["maya_call_alerts"]["Update"];

/** A claim: the row and the claim's own time, so a late write from a run whose claim was taken over changes nothing. */
interface AlertClaim {
  id: string;
  claimedAt: string;
}

/** An alert row as the admin call page shows it. */
export const alertState = (r: Pick<Row, "level" | "status" | "claimed_at" | "error">): AlertState => ({ level: r.level, status: r.status, claimedAt: r.claimed_at, error: r.error });

export function mayaAlertLedger(admin: SupabaseClient<Database>): AlertLedger<AlertClaim> {
  /** Writes an outcome while this claim still holds the row. Never throws: the email already went or failed. */
  async function write(claim: AlertClaim, fields: Update) {
    try {
      const { data, error } = await admin.from("maya_call_alerts").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", claim.id).eq("claimed_at", claim.claimedAt).select("id");
      if (error) console.error("[maya alert] row update failed", claim.id, error.message);
      else if (!data?.length) console.error("[maya alert] row update matched no row: another run holds the claim", claim.id);
    } catch (e) {
      console.error("[maya alert] row update failed", claim.id, e instanceof Error ? e.message : e);
    }
  }

  return {
    async claim(key: AlertKey) {
      const claimedAt = new Date().toISOString();
      const inserted = await admin
        .from("maya_call_alerts")
        .insert({ call_id: key.callId, parent_id: key.parentId, level: key.level, status: "sending", claimed_at: claimedAt })
        .select("id")
        .maybeSingle();
      if (!inserted.error && inserted.data) return { id: inserted.data.id, claimedAt };
      // 23505: the call already has this alert. Take it again only when it was refused, or its claim is stale.
      if (inserted.error?.code !== "23505") throw new Error(`maya alert claim: ${inserted.error?.message ?? "no row"}`);
      const stale = new Date(Date.parse(claimedAt) - STALE_ALERT_MS).toISOString();
      const { data, error } = await admin
        .from("maya_call_alerts")
        .update({ status: "sending", claimed_at: claimedAt, updated_at: claimedAt })
        .eq("call_id", key.callId)
        .eq("level", key.level)
        .or(`status.eq.refused,and(status.eq.sending,claimed_at.lt."${stale}")`)
        .select("id");
      if (error) throw new Error(`maya alert claim: ${error.message}`);
      return data?.length ? { id: data[0].id, claimedAt } : null;
    },
    async sent(claim, emailId) {
      await write(claim, { status: "sent", email_id: emailId.slice(0, 100), error: null });
    },
    async refused(claim, error) {
      await write(claim, { status: "refused", error: error.slice(0, 500) });
    },
    async unknown(claim, error) {
      await write(claim, { status: "unknown", error: error.slice(0, 500) });
    },
    // The email as it was sent (D-103), on the alert row: no child words, no link token.
    async keepCopy(claim, _key, copy) {
      await write(claim, { subject: copy.message.subject.slice(0, 500), text_body: copy.message.text.slice(0, 5000) });
    },
    async list(callId) {
      const { data, error } = await admin.from("maya_call_alerts").select("level, status, claimed_at, error").eq("call_id", callId).order("created_at");
      if (error) throw new Error(`maya alerts load: ${error.message}`);
      return (data ?? []).map(alertState);
    },
  };
}
