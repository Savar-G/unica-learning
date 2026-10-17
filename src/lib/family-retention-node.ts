import "server-only";
import { runRetentionWorker, workerConfiguration } from "@/lib/assessment";
import { deletionClient, deletionPayments } from "./family-deletion-client";
import { advanceDeletionCursor, deletionCursor, familyCopySources, retentionCandidates, runFamilyDeletion } from "./family-deletion-store";
import { readBookingCustomers, readCustomerPayments, verifyRetentionKey } from "./retention-stripe";

export const RETENTION_WORK_MS = 14 * 60_000;
export const RETENTION_CONTROL_MS = 30_000;

/** No Next request context, environment file loader, email or analytics. Output contains aggregates only. */
export async function runNodeRetention(args: readonly string[], env: Record<string, string | undefined>, shutdown: AbortSignal) {
  const config = workerConfiguration(args, env);
  if (config.kind === "help") return { help: true };
  if (config.kind === "disabled") return { ok: true, disabled: true };
  const stopAt = Date.now() + RETENTION_WORK_MS;
  const work = AbortSignal.any([shutdown, AbortSignal.timeout(RETENTION_WORK_MS)]);
  const db = deletionClient(config.url, config.secret, work, 30_000);
  // Read-only Stripe client for the key check and the decisions before any claim (also in dry mode).
  const reads = config.stripeKey ? deletionPayments(config.stripeKey, work) : null;
  const result = await runRetentionWorker(config, {
    candidates: () => retentionCandidates(db),
    cursor: () => deletionCursor(db),
    // Dry mode only: the copy each deletion would write, counted, never printed (#201).
    async copySources(id) { work.throwIfAborted(); return familyCopySources(db, id); },
    async advance(id) { work.throwIfAborted(); await advanceDeletionCursor(db, id); },
    async verifyPayments() {
      // Authenticate the real live-mode key through the read permissions the rules use, before any claim.
      work.throwIfAborted();
      await verifyRetentionKey(reads!);
    },
    async bookingCustomers(booking) {
      work.throwIfAborted();
      return readBookingCustomers(reads!, booking, () => ({ timeout: 30_000, maxNetworkRetries: 0 }));
    },
    async customerPayments(customer) {
      work.throwIfAborted();
      return readCustomerPayments(reads!, customer, () => ({ timeout: 30_000, maxNetworkRetries: 0 }));
    },
    async run(id, limitMs, claim) {
      work.throwIfAborted();
      const stopped = new AbortController();
      const signal = AbortSignal.any([work, stopped.signal, AbortSignal.timeout(limitMs)]);
      const worker = deletionClient(config.url, config.secret, signal, 30_000);
      // This control signal survives work/shutdown abort. Every call has its own ten-second limit.
      const control = deletionClient(config.url, config.secret, AbortSignal.timeout(limitMs + RETENTION_CONTROL_MS), 10_000);
      try {
        return await runFamilyDeletion(worker, id, control, Date.now() + limitMs, {
          signal, renewEveryMs: 60_000, paymentRequestTimeoutMs: 30_000,
          abortWork: () => stopped.abort(), payments: deletionPayments(config.stripeKey!, signal),
        }, claim);
      } finally { stopped.abort(); }
    },
  }, () => work.aborted ? 0 : stopAt - Date.now(), Date.now());
  return shutdown.aborted ? { ...result, ok: false, interrupted: true } : result;
}
