import { runRetentionBatch, type FamilyDeletionResult } from "./deletion";
import { readFamilyPayments } from "./payments";
import { retentionDecision, type CustomerPayments, type RetentionFamily } from "./retention";

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
  cursor(): Promise<string | null>;
  advance(parent: string): Promise<void>;
  run(parent: string, limitMs: number, claim: RetentionClaim): Promise<FamilyDeletionResult>;
}

/**
 * Decide every candidate from read-only reads, then (delete mode only) claim the families the rules delete. A claim
 * freezes the family, and the fresh check after the freeze decides again. Dry mode and every keep or unknown decision
 * change nothing. Output: counts only, never ids.
 */
export async function runRetentionWorker(config: WorkerConfiguration, store: RetentionWorkerStore, remainingMs: () => number, now: number) {
  if (config.kind !== "run") return { ok: true, disabled: true };
  if (config.stripeKey) await store.verifyPayments();
  const candidates = await store.candidates();
  const decisions = { queued: 0, delete_free_test: 0, delete_former_customer: 0, keep_customer: 0, keep_former_customer: 0, keep_free_test: 0, keep_no_test: 0, unknown: 0 };
  const claims = new Map<string, RetentionClaim>();
  const read = (customer: string) => config.stripeKey ? store.customerPayments(customer) : Promise.reject(Error("No Stripe key"));
  for (const family of candidates) {
    if (family.queued) { decisions.queued++; claims.set(family.id, { endedAt: null }); continue; }
    const decision = retentionDecision({ lastTestAt: family.lastTestAt, payments: await readFamilyPayments(family.cards, read) }, now);
    if (decision.action === "unknown") decisions.unknown++;
    else if (decision.action === "keep") decisions[`keep_${decision.reason}`]++;
    else {
      decisions[`delete_${decision.rule}`]++;
      claims.set(family.id, { endedAt: decision.rule === "former_customer" ? decision.endedAt : null });
    }
  }
  // An unknown family is kept, and the run reports it as not ok so that someone looks.
  const ok = decisions.unknown === 0;
  if (config.mode === "dry") return { ok, dry: true, eligible: claims.size, ...decisions };
  const ids = candidates.flatMap((c) => (claims.has(c.id) ? [c.id] : []));
  const counts = await runRetentionBatch(ids, {
    cursor: () => store.cursor(),
    advance: (id) => store.advance(id),
    run: (id, limitMs) => store.run(id, limitMs, claims.get(id)!),
  }, remainingMs, 600_000);
  return { ok: ok && counts.failed === 0, ...counts, ...decisions };
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
