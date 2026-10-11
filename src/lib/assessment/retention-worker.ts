import { runRetentionBatch, type RetentionBatchStore } from "./deletion";

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
  if (url !== "https://cdjobwsyzndtltzfpyqa.supabase.co" || !/^sb_secret_[A-Za-z0-9_-]{20,200}$/.test(secret) || invalid(secret)
    || (mode === "delete" && (!/^rk_live_[A-Za-z0-9_]{24,200}$/.test(stripeKey) || invalid(stripeKey)))) throw Error("Worker credentials unavailable");
  return { kind: "run", mode, url, secret, stripeKey: mode === "delete" ? stripeKey : undefined };
}

export interface RetentionWorkerStore extends RetentionBatchStore {
  candidates(): Promise<string[]>;
  verifyPayments(): Promise<void>;
}

/** Dry mode performs only the paged candidate read. Clear permission is never stored by this runner. */
export async function runRetentionWorker(config: WorkerConfiguration, store: RetentionWorkerStore, remainingMs: () => number) {
  if (config.kind !== "run") return { ok: true, disabled: true };
  if (config.mode === "delete") await store.verifyPayments();
  const ids = await store.candidates();
  if (config.mode === "dry") return { ok: true, dry: true, eligible: ids.length };
  const counts = await runRetentionBatch(ids, store, remainingMs, 600_000);
  return { ok: counts.failed === 0, ...counts };
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
