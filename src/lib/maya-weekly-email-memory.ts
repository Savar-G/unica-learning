import { createHash } from "node:crypto";
import type { EmailCopy } from "@/lib/email-delivery";
import type { CallNote } from "@/lib/maya-call-note";
import type { WeeklyCall, WeeklyChild, WeeklyLogEntry, WeeklyParent, WeeklyStore, DueWeekly } from "@/lib/maya-weekly-email";
import { MAX_SEND_ATTEMPTS } from "@/lib/reminders";

// The weekly Maya email's store (src/lib/maya-weekly-email.ts, #332) in memory, for tests. It keeps the database's rules
// (migration add_maya_weekly_email): one maya_weekly row per parent per week, so a second claim is refused; a retry takes a
// failed row back only once and only before MAX_SEND_ATTEMPTS; refused marks the row failed, unknown keeps it claimed.
// `unsubscribe(token)` does what the unsubscribe link does (src/lib/reminder-store.ts): the token of a weekly Maya
// email turns off only that email.

type Row = WeeklyLogEntry & { hash: string | null; emailId: string | null; error: string | null };

export function memoryWeeklyStore(data: { parents: WeeklyParent[]; children: WeeklyChild[]; notes: CallNote[]; calls?: WeeklyCall[] }): WeeklyStore & {
  rows(): Row[];
  copies: { logId: string; parentId: string; copy: EmailCopy }[];
  unsubscribe(token: string): "unsubscribed" | "unknown";
} {
  const rows: Row[] = [];
  const copies: { logId: string; parentId: string; copy: EmailCopy }[] = [];
  const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  const row = (id: string) => rows.find((r) => r.id === id);
  return {
    async load() {
      const calls = data.calls ?? data.notes.map((n) => ({ callId: n.callId, parentId: n.parentId, childId: n.childId, endedAt: n.callEndedAt, notePending: false }));
      const parentIds = new Set(calls.map((c) => c.parentId));
      return {
        parents: data.parents.filter((p) => parentIds.has(p.id)).map(copy),
        children: data.children.map(copy),
        calls: calls.map(copy),
        notes: data.notes.map(copy),
        log: rows.filter((r) => parentIds.has(r.parentId)).map(({ id, kind, parentId, weekStart, status, attempts }) => ({ id, kind, parentId, weekStart, status, attempts })),
      };
    },
    ledger: {
      async claim(d: DueWeekly, { unsubscribe_hash }) {
        if (d.retry) {
          const r = row(d.retry.logId);
          if (!r || r.status !== "failed" || r.attempts !== d.retry.attempts || r.attempts >= MAX_SEND_ATTEMPTS) return null;
          Object.assign(r, { status: "claimed", attempts: r.attempts + 1, hash: unsubscribe_hash, error: null });
          return r.id;
        }
        if (rows.some((r) => r.kind === "maya_weekly" && r.parentId === d.parentId && r.weekStart === d.weekStart)) return null;
        const id = `log-${rows.length + 1}`;
        rows.push({ id, kind: "maya_weekly", parentId: d.parentId, weekStart: d.weekStart, status: "claimed", attempts: 1, hash: unsubscribe_hash, emailId: null, error: null });
        return id;
      },
      async sent(id, emailId) {
        Object.assign(row(id)!, { status: "sent", emailId, error: null });
      },
      async refused(id, error) {
        Object.assign(row(id)!, { status: "failed", error });
      },
      async unknown(id, error) {
        Object.assign(row(id)!, { error });
      },
      async keepCopy(id, d, c) {
        const held = copies.findIndex((x) => x.logId === id);
        if (held >= 0) copies.splice(held, 1);
        copies.push({ logId: id, parentId: d.parentId, copy: copy(c) });
      },
    },
    rows: () => rows.map(copy),
    copies,
    unsubscribe(token) {
      const hash = createHash("sha256").update(token).digest("hex");
      const r = rows.find((x) => x.hash === hash);
      if (!r) return "unknown";
      if (!rows.some((x) => x.kind === "maya_unsubscribe" && x.parentId === r.parentId)) {
        rows.push({ id: `log-${rows.length + 1}`, kind: "maya_unsubscribe", parentId: r.parentId, weekStart: null, status: null, attempts: 0, hash: null, emailId: null, error: null });
      }
      return "unsubscribed";
    },
  };
}
