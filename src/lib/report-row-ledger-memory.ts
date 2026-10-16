import { memoryLedger } from "@/lib/email-delivery-memory";
import { countRead } from "@/lib/report-loading-memory";
import { reportClaimTakeOver, type ReportEmailKey, type ReportLedger } from "@/lib/report-row-ledger";

// The report row ledger in memory, for tests (#151): the in-memory ledger of the delivery module with the report row's
// take-over rule (src/lib/report-row-ledger.ts). The report job runs on it in its tests.

/**
 * `now`: the clock for claim times. Default: Date.now. `reads`: a read counter (countRead) where the ledger counts its
 * reads of the report row, one for each database request; its claims and outcomes are writes.
 */
export function memoryReportLedger({ now, reads = {} }: { now?: () => number; reads?: Record<string, number> } = {}) {
  const book = memoryLedger<ReportEmailKey>({
    keyOf: (key) => `${key.email}:${key.report}`,
    now,
    canTakeOver: (held, key, at) =>
      reportClaimTakeOver(key, { claimedAt: held.claimedAt, emailId: held.emailId, unsubscribeHash: held.fields.unsubscribe_hash ?? null }, at),
  });
  const ledger: ReportLedger<string> = {
    ...book.ledger,
    async parentEmailSent(report) {
      countRead(reads, "reports");
      return book.entry({ report, email: "parent" })?.state === "sent";
    },
  };
  return { ledger, entry: book.entry };
}
