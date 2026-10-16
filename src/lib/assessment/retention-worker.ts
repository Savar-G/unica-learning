import { copyFieldNames, copyPreview } from "./anonymous-copy";
import type { FamilyDeletionResult } from "./deletion";
import { readFamilyPayments } from "./payments";
import { retentionDecision, type BookingLink, type CustomerPayments, type RetentionFamily } from "./retention";

export type WorkerConfiguration = { kind: "help" } | { kind: "disabled" } | {
  kind: "run"; mode: "dry" | "delete"; url: string; secret: string; stripeKey?: string;
};

/** Format checks are followed by authenticated, read-only transport preflight before any claim. */
export function workerConfiguration(args: readonly string[], env: Record<string, string | undefined>): WorkerConfiguration {
  if (args.length === 1 && args[0] === "--help") return { kind: "help" };
  if (args.length && (args.length !== 2 || args[0] !== "--mode" || !["dry", "delete"].includes(args[1]))) throw Error("Invalid worker arguments");
  const mode = args[1] === "delete" ? "delete" : "dry";
  if (mode === "delete" && env.RETENTION_WORKER_ENABLED !== "on") return { kind: "disabled" };
  const invalid = (value: string) => /sensitive|placeholder|changeme|example|dummy|fake/i.test(value);
  const url = env.SUPABASE_URL ?? "", secret = env.SUPABASE_SECRET_KEY ?? "", stripeKey = env.STRIPE_SECRET_KEY ?? "";
  // Delete mode needs the restricted live key. Dry mode uses it when given (Stripe reads only) and refuses any other key.
  const stripeNeeded = mode === "delete" || stripeKey !== "";
  if (url !== "https://cdjobwsyzndtltzfpyqa.supabase.co" || !/^sb_secret_[A-Za-z0-9_-]{20,200}$/.test(secret) || invalid(secret)
    || (stripeNeeded && (!/^rk_live_[A-Za-z0-9_]{24,200}$/.test(stripeKey) || invalid(stripeKey)))) throw Error("Worker credentials unavailable");
  return { kind: "run", mode, url, secret, stripeKey: stripeNeeded ? stripeKey : undefined };
}

/** A family the database lists: in the deletion queue, due by the free-test rule, or with Stripe history to check. */
export interface RetentionCandidate extends RetentionFamily {
  id: string;
  /** Already in the deletion queue (a request, or a retention check that started earlier). */
  queued: boolean;
}

/** What the database must check again before it freezes a family. `endedAt`: the former customer's Stripe end date. */
export interface RetentionClaim { endedAt: string | null }

export interface RetentionWorkerStore {
  candidates(): Promise<RetentionCandidate[]>;
  verifyPayments(): Promise<void>;
  /** Read-only Stripe facts for one customer. A failure means unknown. */
  customerPayments(customer: string): Promise<CustomerPayments>;
  bookingCustomers?(booking: BookingLink): Promise<string[]>;
  cursor(): Promise<string | null>;
  advance(parent: string): Promise<void>;
  run(parent: string, limitMs: number, claim: RetentionClaim): Promise<FamilyDeletionResult>;
  /** Dry mode (#201): the family's tests as the copy without names reads them (family_copy_sources). Read only. */
  copySources(parent: string): Promise<unknown[]>;
}

/**
 * Retry queued work before unrelated Stripe reads. In delete mode, save each candidate's position before reading or
 * claiming it, and finish that candidate before scheduling another. A claim freezes the family; the fresh check
 * after the freeze decides again. Dry mode changes nothing; for each family a delete run would claim, it builds the
 * copy without names that the deletion would write (#201) and shows its counts and field names. Output: counts and
 * field names only, never ids or values.
 */
export async function runRetentionWorker(config: WorkerConfiguration, store: RetentionWorkerStore, remainingMs: () => number, now: number) {
  if (config.kind !== "run") return { ok: true, disabled: true };
  if (config.stripeKey) await store.verifyPayments();
  const candidates = await store.candidates();
  const decisions = { queued: 0, delete_free_test: 0, delete_former_customer: 0, keep_customer: 0, keep_former_customer: 0, keep_free_test: 0, keep_no_test: 0, unknown: 0 };
  const counts = { eligible: 0, deleted: 0, busy: 0, excluded: 0, failed: 0, images: 0, copies: 0 };
  const copy = { families: 0, tests: 0, copied: 0, questions: 0, extraRounds: 0, facts: 0, profiles: 0, questionnaires: 0, failed: 0 };
  const dry = config.mode === "dry";
  const cursor = dry ? null : await store.cursor();
  const rotated = cursor === null ? candidates : [...candidates.filter((f) => f.id > cursor), ...candidates.filter((f) => f.id <= cursor)];
  const order = dry ? candidates : [...rotated.filter((f) => f.queued), ...rotated.filter((f) => !f.queued)];
  const budget = Math.min(600_000, remainingMs());
  let deferred = candidates.length, attempted = false;
  const read = (customer: string) => config.stripeKey ? store.customerPayments(customer) : Promise.reject(Error("No Stripe key"));
  for (const family of order) {
    const remaining = remainingMs();
    // Reserve a full attempt for later candidates. Do not restart a large read-only scan on every invocation.
    if (budget <= 0 || remaining <= 0 || (!dry && attempted && remaining < budget)) break;
    if (!dry) {
      await store.advance(family.id);
      if (remainingMs() <= 0) break;
    }
    attempted = true;
    deferred--;
    let claim: RetentionClaim;
    if (family.queued) {
      decisions.queued++;
      claim = { endedAt: null };
    } else {
      const decision = retentionDecision({ lastTestAt: family.lastTestAt, payments: await readFamilyPayments(family.cards, read, config.stripeKey ? store.bookingCustomers?.bind(store) : undefined) }, now);
      if (decision.action === "unknown") { decisions.unknown++; continue; }
      if (decision.action === "keep") { decisions[`keep_${decision.reason}`]++; continue; }
      decisions[`delete_${decision.rule}`]++;
      claim = { endedAt: decision.rule === "former_customer" ? decision.endedAt : null };
    }
    counts.eligible++;
    if (dry) {
      try {
        const preview = copyPreview(await store.copySources(family.id));
        copy.families++;
        for (const k of ["tests", "copied", "questions", "extraRounds", "facts", "profiles", "questionnaires"] as const) copy[k] += preview[k];
      } catch { copy.failed++; }
    } else {
      const limit = Math.min(budget, remainingMs());
      if (limit <= 0) { counts.failed++; break; }
      try {
        const result = await store.run(family.id, limit, claim);
        counts[result.state]++;
        if (result.state === "deleted") { counts.images += result.images; counts.copies += result.copies; }
      } catch { counts.failed++; }
    }
  }
  // Unknown or unprocessed candidates make an incomplete run visible to the operator. So does a copy that a deletion
  // could not write: that deletion would stop.
  const ok = decisions.unknown === 0 && counts.failed === 0 && deferred === 0 && copy.failed === 0;
  if (dry) return { ok, dry: true, eligible: counts.eligible, deferred, ...decisions, copy: { ...copy, fields: copyFieldNames() } };
  return { ok, ...counts, deferred, ...decisions };
}

export interface DeletionHeartbeatStore {
  wait(signal: AbortSignal): Promise<void>;
  renew(): Promise<boolean>;
  abort(): void;
}

/** The action owns all remote work. Stop and join the renewal loop before releasing its lease. */
export async function withDeletionHeartbeat<T>(store: DeletionHeartbeatStore, action: () => Promise<T>): Promise<T> {
  const stop = new AbortController();
  let lost = false;
  const heartbeat = (async () => {
    try {
      while (!stop.signal.aborted) {
        await store.wait(stop.signal);
        if (stop.signal.aborted) break;
        if (!await store.renew()) throw Error("Deletion lease lost");
      }
    } catch {
      if (!stop.signal.aborted) { lost = true; store.abort(); }
    }
  })();
  try {
    const result = await action();
    if (lost) throw Error("Deletion lease lost");
    return result;
  } finally { stop.abort(); await heartbeat; }
}
