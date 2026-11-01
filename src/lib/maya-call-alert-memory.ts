import type { AlertKey, AlertLedger } from "@/lib/maya-call-alert";
import { shownAlert, type AlertState, type FlagLevel } from "@/lib/maya-call";

// The alert ledger of Maya's call alerts (src/lib/maya-call-alert.ts, #333) in memory, for tests. It keeps the
// database's rules (migration add_maya_call_flags): one row per call and flag level, claimed again only when its send
// was refused. A claim left "sending" is never claimed again (R393-1-1): its email may have gone, so after
// STALE_ALERT_MS it is shown as unknown (shownAlert), the same as an unknown send (#143).

export interface MemoryAlertRow extends AlertState {
  callId: string;
  parentId: string;
  emailId: string | null;
  subject: string | null;
  text: string | null;
}

export function memoryAlertLedger({ now = Date.now }: { now?: () => number } = {}): AlertLedger<string> & { rows(): MemoryAlertRow[] } {
  const rows = new Map<string, MemoryAlertRow>();
  const id = (k: { callId: string; level: FlagLevel }) => `${k.callId}:${k.level}`;
  const copy = (r: MemoryAlertRow): MemoryAlertRow => ({ ...r });
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return {
    async claim(key: AlertKey) {
      await tick();
      const held = rows.get(id(key));
      const at = now();
      const free = !held || held.status === "refused";
      if (!free) return null;
      rows.set(id(key), {
        callId: key.callId, parentId: key.parentId, level: key.level, status: "sending", claimedAt: new Date(at).toISOString(),
        error: held?.error ?? null, emailId: null, subject: held?.subject ?? null, text: held?.text ?? null,
      });
      return id(key);
    },
    async sent(h, emailId) {
      await tick();
      Object.assign(rows.get(h)!, { status: "sent", emailId, error: null });
    },
    async refused(h, error) {
      await tick();
      Object.assign(rows.get(h)!, { status: "refused", error });
    },
    async unknown(h, error) {
      await tick();
      Object.assign(rows.get(h)!, { status: "unknown", error });
    },
    async keepCopy(h, _key, kept) {
      await tick();
      Object.assign(rows.get(h)!, { subject: kept.message.subject, text: kept.message.text });
    },
    async list(callId) {
      await tick();
      return [...rows.values()].filter((r) => r.callId === callId).map(({ level, status, claimedAt, error }) => shownAlert({ level, status, claimedAt, error }, now()));
    },
    rows: () => [...rows.values()].map(copy),
  };
}
