import { createHash } from "node:crypto";
import type { EmailCopy } from "@/lib/email-delivery";
import type { DueMonthly, MonthlyChild, MonthlyLogEntry, MonthlyParent, MonthlyStore } from "@/lib/monthly-summary-email";
import type { DeliveryCorrectionRecord, DeliveryRecord } from "@/lib/parent-view";
import { MAX_SEND_ATTEMPTS } from "@/lib/reminders";

// The monthly summary email's store (src/lib/monthly-summary-email.ts, #563) in memory, for tests. It keeps the database's
// rules (migration monthly_summary_email): one monthly_summary row per parent per month, so a second claim is refused; a
// retry takes a failed row back only once and only before MAX_SEND_ATTEMPTS; refused marks the row failed, unknown keeps
// it claimed. `unsubscribe(token)` does what the unsubscribe link does (src/lib/reminder-store.ts): the token of this
// email turns off only this email. `logOther` adds another email's unsubscribe, which load leaves out, as the real one does.

type Row = Omit<MonthlyLogEntry, "kind"> & { kind: MonthlyLogEntry["kind"] | "unsubscribe" | "maya_unsubscribe"; hash: string | null; emailId: string | null; error: string | null };

export function memoryMonthlyStore(data: { parents: MonthlyParent[]; children: MonthlyChild[]; deliveries: DeliveryRecord[]; corrections: DeliveryCorrectionRecord[] }): MonthlyStore & {
  rows(): Row[];
  copies: { logId: string; parentId: string; copy: EmailCopy }[];
  unsubscribe(token: string): "unsubscribed" | "unknown";
  logOther(kind: "unsubscribe" | "maya_unsubscribe"): void;
  failClaimFor(parentId: string): void;
} {
  const rows: Row[] = [];
  const copies: { logId: string; parentId: string; copy: EmailCopy }[] = [];
  const failing = new Set<string>();
  const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  const row = (id: string) => rows.find((r) => r.id === id);
  return {
    async load() {
      return {
        parents: data.parents.map(copy),
        children: data.children.map(copy),
        deliveries: data.deliveries.map(copy),
        corrections: data.corrections.map(copy),
        log: rows.flatMap((r) => (r.kind === "monthly_summary" || r.kind === "monthly_summary_unsubscribe"
          ? [{ id: r.id, kind: r.kind, parentId: r.parentId, month: r.month, status: r.status, attempts: r.attempts }]
          : [])),
      };
    },
    ledger: {
      async claim(d: DueMonthly, { unsubscribe_hash }) {
        if (failing.has(d.parentId)) throw new Error("claim: the family is being deleted");
        if (d.retry) {
          const r = row(d.retry.logId);
          if (!r || r.status !== "failed" || r.attempts !== d.retry.attempts || r.attempts >= MAX_SEND_ATTEMPTS) return null;
          Object.assign(r, { status: "claimed", attempts: r.attempts + 1, hash: unsubscribe_hash, error: null });
          return r.id;
        }
        if (rows.some((r) => r.kind === "monthly_summary" && r.parentId === d.parentId && r.month === d.month)) return null;
        const id = `log-${rows.length + 1}`;
        rows.push({ id, kind: "monthly_summary", parentId: d.parentId, month: d.month, status: "claimed", attempts: 1, hash: unsubscribe_hash, emailId: null, error: null });
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
      if (!rows.some((x) => x.kind === "monthly_summary_unsubscribe" && x.parentId === r.parentId)) {
        rows.push({ id: `log-${rows.length + 1}`, kind: "monthly_summary_unsubscribe", parentId: r.parentId, month: null, status: null, attempts: 0, hash: null, emailId: null, error: null });
      }
      return "unsubscribed";
    },
    logOther(kind) {
      rows.push({ id: `log-${rows.length + 1}`, kind, parentId: data.parents[0].id, month: null, status: null, attempts: 0, hash: null, emailId: null, error: null });
    },
    failClaimFor(parentId) {
      failing.add(parentId);
    },
  };
}
