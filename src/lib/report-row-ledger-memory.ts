import { memoryLedger } from "@/lib/email-delivery-memory";
import { reportClaimTakeOver, type ReportEmailKey, type ReportLedger } from "@/lib/report-row-ledger";

// The report row ledger in memory, for tests (#151): the in-memory ledger of the delivery module with the report row's
// take-over rule (src/lib/report-row-ledger.ts). The report job runs on it in its tests.

/** `now`: the clock for claim times. Default: Date.now. */
export function memoryReportLedger({ now }: { now?: () => number } = {}) {
  const book = memoryLedger<ReportEmailKey>({
    keyOf: (key) => `${key.email}:${key.report}`,
    now,
    canTakeOver: (held, key, at) =>
      reportClaimTakeOver(key, { claimedAt: held.claimedAt, emailId: held.emailId, unsubscribeHash: held.fields.unsubscribe_hash ?? null }, at),
  });
  const ledger: ReportLedger<string> = {
    ...book.ledger,
    parentEmailSent: async (report) => book.entry({ report, email: "parent" })?.state === "sent",
  };
  return { ledger, entry: book.entry };
}
