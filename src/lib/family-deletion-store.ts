import "server-only";
import { randomUUID } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkFamilyPayments, deleteFamily, withDeletionHeartbeat, type FamilyDeletionResult, type FamilyDeletionStore, type FamilyPaymentStore, type PaymentOperation, type PaymentProgress, type RetentionCardState } from "@/lib/assessment";
import { stripe } from "@/lib/stripe";
import { WORK_BUCKET } from "@/lib/work-store";

/** Missing migration permits the existing card path, but no other failure does. Deletion itself never falls back. */
export async function beginCardOperation(db: SupabaseClient, parent: string, token: string): Promise<boolean> {
  const { error } = await db.rpc("begin_family_card_operation", { p: parent, token });
  if (error?.code === "PGRST202") return false;
  if (error) throw new Error("Card operation unavailable");
  return true;
}

export async function endCardOperation(db: SupabaseClient, token: string): Promise<void> {
  const { error } = await db.rpc("end_family_card_operation", { token });
  if (error) console.error("[deletion] card hold release failed", error.code);
}

async function rpc<T>(db: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`Deletion dependency: ${name} (${error.code})`);
  return data as T;
}

export async function deletionCursor(db: SupabaseClient): Promise<string | null> {
  return rpc(db, "family_deletion_cursor", {});
}

export async function advanceDeletionCursor(db: SupabaseClient, parent: string): Promise<void> {
  await rpc(db, "advance_family_deletion_cursor", { p: parent });
}

export interface FamilyDeletionExecution {
  signal: AbortSignal;
  renewEveryMs: number;
  paymentRequestTimeoutMs: number;
  abortWork(): void;
  payments: Stripe;
}

function timeRemaining(deadline: number, execution?: FamilyDeletionExecution) {
  execution?.signal.throwIfAborted();
  const timeout = deadline - Date.now();
  if (timeout <= 0) throw new Error("Deletion time limit");
  return timeout;
}

function paymentOptions(deadline: number, execution?: FamilyDeletionExecution) {
  return { timeout: Math.min(timeRemaining(deadline, execution), execution?.paymentRequestTimeoutMs ?? Infinity), maxNetworkRetries: 0 };
}

/** Stable keyset RPC paging, including jobs whose Auth deletion succeeded before the worker stopped. */
export async function deletionCandidates(db: SupabaseClient): Promise<string[]> {
  const ids: string[] = [];
  let after: string | null = null;
  for (;;) {
    const page: { parent_id: string }[] = await rpc(db, "family_deletion_candidates", { after_id: after, page_size: 100 });
    if (page.length === 0) return ids;
    ids.push(...page.map((r) => r.parent_id));
    const next = page.at(-1)!.parent_id;
    if (next === after) throw new Error("Deletion pagination did not advance");
    after = next;
  }
}

/** Run after freezing and settling app card operations. Remote journal and canceled-intent traversal are durable.
 * Fresh current-state reads remain mandatory; unknown results keep the checking job and its fence. */
async function cardState(db: SupabaseClient, parent: string, token: string, deadline: number, retention: boolean, control: SupabaseClient, execution?: FamilyDeletionExecution): Promise<RetentionCardState> {
  const customers: string[] = [];
  let saved = false;
  for (let from = 0; retention; from += 100) {
    paymentOptions(deadline, execution);
    const { data, error } = await db.from("card_setups").select("id, stripe_customer_id, card_saved_at")
      .eq("parent_id", parent).order("id").range(from, from + 99);
    if (error) return "unknown";
    saved ||= data.some((r) => r.card_saved_at);
    customers.push(...data.flatMap((r) => r.stripe_customer_id ? [r.stripe_customer_id as string] : []));
    if (data.length < 100) break;
  }
  const s = execution?.payments ?? stripe();
  const args = { p: parent, token };
  const guarded = <T>(name: string, values: Record<string, unknown>) => { paymentOptions(deadline, execution); return rpc<T>(db, name, { ...args, ...values }); };
  const pending = async () => {
    const operations: PaymentOperation[] = [];
    let after: string | null = null;
    for (;;) {
      const page: { kind: "session" | "intent"; object_id: string; customer_id: string }[] = await guarded("pending_family_payment_operations", { after_id: after, page_size: 100 });
      if (!page.length) return operations;
      operations.push(...page.map(r => ({ kind: r.kind, id: r.object_id, customer: r.customer_id })));
      const next: string = `${page.at(-1)!.kind}:${page.at(-1)!.object_id}`;
      if (next === after) throw new Error("Payment operation pagination did not advance");
      after = next;
    }
  };
  const finish = async (operation: PaymentOperation, status: string): Promise<RetentionCardState> => {
    const clear = status === (operation.kind === "session" ? "expired" : "canceled");
    const knownSaved = status === (operation.kind === "session" ? "complete" : "succeeded");
    if (!clear && !knownSaved) return "unknown";
    await guarded("finish_family_payment_operation", { resource_kind: operation.kind, resource_id: operation.id, resource_state: status });
    return knownSaved ? "saved" : "clear";
  };
  const reconcile = async (operation: PaymentOperation) => {
    if (!s) return "unknown" as const;
    const remote = operation.kind === "session"
      ? await s.checkout.sessions.retrieve(operation.id, {}, paymentOptions(deadline, execution))
      : await s.setupIntents.retrieve(operation.id, {}, paymentOptions(deadline, execution));
    if (remote.customer !== operation.customer) throw new Error("Payment operation scope changed");
    return finish(operation, remote.status ?? "unknown");
  };
  const mutate = async (operation: PaymentOperation) => {
    if (!s) return "unknown" as const;
    const resource = { resource_kind: operation.kind, resource_id: operation.id };
    const abandon = () => rpc(control, "abandon_family_payment_operation", { ...args, ...resource });
    let fresh: boolean;
    try {
      fresh = await guarded<boolean>("begin_family_payment_operation", { ...resource, customer: operation.customer });
    } catch {
      // No remote method was invoked. The control deadline and origin token allow only this record to be removed.
      await abandon();
      return "unknown";
    }
    if (!fresh) return reconcile(operation); // Never repeat an uncertain remote mutation.
    let options: ReturnType<typeof paymentOptions>;
    try { options = paymentOptions(deadline, execution); } catch {
      await abandon();
      return "unknown";
    }
    try {
      const remote = operation.kind === "session"
        ? await s.checkout.sessions.expire(operation.id, {}, options)
        : await s.setupIntents.cancel(operation.id, {}, options);
      if (remote.customer !== operation.customer) throw new Error("Payment operation scope changed");
      return await finish(operation, remote.status ?? "unknown");
    } catch { return reconcile(operation); }
  };
  const store: FamilyPaymentStore = {
    pending, reconcile,
    async openSessions(customer) {
      if (!s) throw new Error("Payment provider unavailable");
      const page = await s.checkout.sessions.list({ customer, status: "open", limit: 100 }, paymentOptions(deadline, execution));
      if (page.data.some(r => r.customer !== customer || r.status !== "open")) throw new Error("Payment session scope changed");
      return page.data.map(r => r.id);
    },
    expire: (customer, id) => mutate({ kind: "session", customer, id }),
    cancel: (customer, id) => mutate({ kind: "intent", customer, id }),
    async current(customer) {
      if (!s) throw new Error("Payment provider unavailable");
      const loads = [
        () => s.checkout.sessions.list({ customer, status: "complete", limit: 1 }, paymentOptions(deadline, execution)),
        () => s.paymentMethods.list({ customer, limit: 1 }, paymentOptions(deadline, execution)),
        () => s.subscriptions.list({ customer, status: "all", limit: 1 }, paymentOptions(deadline, execution)),
      ];
      const results = await Promise.allSettled(loads.map(async load => load()));
      if (results.some(r => r.status === "rejected")) return "unknown";
      return results.some(r => r.status === "fulfilled" && r.value.data.length) ? "saved" : "clear";
    },
    progress: customer => guarded<PaymentProgress | null>("read_family_payment_progress", { customer }),
    async intents(customer, after) {
      if (!s) throw new Error("Payment provider unavailable");
      const page = await s.setupIntents.list({ customer, limit: 100, starting_after: after ?? undefined }, paymentOptions(deadline, execution));
      if (page.data.some(r => r.customer !== customer)) throw new Error("Payment intent scope changed");
      return { data: page.data.map(r => ({ id: r.id, status: r.status })), more: page.has_more };
    },
    saveProgress: (customer, progress) => guarded("save_family_payment_progress", { customer, head_id: progress.head, after_id: progress.after, finished: progress.done }),
  };
  return checkFamilyPayments(store, customers, saved);
}

function deletionStore(db: SupabaseClient, parent: string, token: string, deadline: number, execution?: FamilyDeletionExecution): FamilyDeletionStore {
  const args = { p: parent, token };
  return {
    async renew() {
      timeRemaining(deadline, execution);
      if (!await rpc<boolean>(db, "renew_family_deletion", args)) throw new Error("Deletion lease lost");
    },
    async listImages(prefix, offset, limit) {
      timeRemaining(deadline, execution);
      const { data, error } = await db.storage.from(WORK_BUCKET).list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });
      if (error || !data) throw new Error("Storage listing failed");
      return data.map((r) => ({ name: r.name, folder: r.id === null }));
    },
    async removeImages(paths) {
      timeRemaining(deadline, execution);
      const { error } = await db.storage.from(WORK_BUCKET).remove(paths);
      if (error) throw new Error("Storage removal failed");
    },
    async removeAuth() {
      timeRemaining(deadline, execution);
      const { error } = await db.auth.admin.deleteUser(parent);
      if (error && error.code !== "user_not_found") throw new Error("Auth removal failed");
    },
    async complete() {
      timeRemaining(deadline, execution);
      if (!await rpc<boolean>(db, "complete_family_deletion", args)) throw new Error("Deletion verification failed");
    },
  };
}

/** An explicit request and the scheduled job share the same durable, retryable process. No analytics or email. */
export async function runFamilyDeletion(db: SupabaseClient, parent: string, control: SupabaseClient = db, deadline = Date.now() + 45_000, execution?: FamilyDeletionExecution): Promise<FamilyDeletionResult> {
  if (execution && (!Number.isFinite(execution.renewEveryMs) || execution.renewEveryMs <= 0
    || !Number.isFinite(execution.paymentRequestTimeoutMs) || execution.paymentRequestTimeoutMs <= 0)) throw Error("Invalid execution policy");
  timeRemaining(deadline, execution);
  parent = parent.toLowerCase();
  const token = randomUUID();
  const args = { p: parent, token };
  const claim = await rpc<{ state: "ready" | "busy" | "excluded"; reason?: "request" | "retention"; phase?: "checking" | "deleting" }>(db, "claim_family_deletion", args);
  if (claim.state !== "ready") return { state: claim.state };
  const action = async (): Promise<FamilyDeletionResult> => {
    if (claim.phase === "checking") {
      const state = await cardState(db, parent, token, deadline, claim.reason === "retention", control, execution);
      if (state === "unknown") throw new Error("Payment check incomplete");
      const keep = claim.reason === "retention" && state === "saved";
      timeRemaining(deadline, execution);
      if (!await rpc<boolean>(db, "decide_family_deletion", { ...args, keep_family: keep })) throw new Error("Deletion decision lost");
      if (keep) return { state: "excluded" };
    }
    timeRemaining(deadline, execution);
    return { state: "deleted" as const, ...await deleteFamily(deletionStore(db, parent, token, deadline, execution), parent) };
  };
  try {
    if (!execution) return await action();
    return await withDeletionHeartbeat({
      wait: signal => wait(execution.renewEveryMs, undefined, { signal }),
      renew: () => rpc<boolean>(control, "renew_family_deletion_work", args),
      abort: () => execution.abortWork(),
    }, action);
  } finally {
    // No fence is removed on failure. Another run resumes after release (or lease expiry after a crash).
    await rpc(control, "release_family_deletion", args);
  }
}
