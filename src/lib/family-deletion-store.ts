import "server-only";
import { randomUUID } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database";
import {
  checkFamilyPayments, deleteFamily, settlePaymentOperations, withDeletionHeartbeat,
  type FamilyCard, type FamilyDeletionResult, type FamilyDeletionStore, type FamilyPaymentStore, type PaymentOperation, type PaymentProgress,
  type RetentionCandidate, type RetentionCardState, type RetentionClaim, type RetentionFamily,
} from "@/lib/assessment";
import { readBookingCustomers, readCustomerPayments } from "@/lib/retention-stripe";
import { stripe } from "@/lib/stripe";

/** Missing migration permits the existing card path, but no other failure does. Deletion itself never falls back. */
export async function beginCardOperation(db: SupabaseClient<Database>, parent: string, token: string): Promise<boolean> {
  const { error } = await db.rpc("begin_family_card_operation", { p: parent, token });
  if (error?.code === "PGRST202") return false;
  if (error) throw new Error("Card operation unavailable");
  return true;
}

export async function endCardOperation(db: SupabaseClient<Database>, token: string): Promise<void> {
  const { error } = await db.rpc("end_family_card_operation", { token });
  if (error) console.error("[deletion] card hold release failed", error.code);
}

type Fns = Database["public"]["Functions"];
type FnName = keyof Fns;
/** A function's arguments, as the schema has them: none for a function without arguments. */
type ArgsOf<N extends FnName> = [Fns[N]["Args"]] extends [never] ? [] : [args: Fns[N]["Args"]];
/** The functions that take the family and the job's token (`p`, `token`). */
type GuardedName = { [N in FnName]: [Fns[N]["Args"]] extends [never] ? never : Fns[N]["Args"] extends { p: string; token: string } ? N : never }[FnName];

/**
 * Calls a database function; an error throws. The answer has the schema's type. The generated types never say that a
 * function can answer null, so a caller that can get null says so.
 */
async function rpc<N extends FnName>(db: SupabaseClient<Database>, name: N, ...args: ArgsOf<N>): Promise<Fns[N]["Returns"]> {
  // The schema checked the name and the arguments at the call; this one call cannot carry that pairing.
  const { data, error } = await db.rpc(name, (args[0] ?? {}) as never);
  if (error) throw new Error(`Deletion dependency: ${name} (${error.code})`);
  return data as Fns[N]["Returns"];
}

export async function deletionCursor(db: SupabaseClient<Database>): Promise<string | null> {
  return rpc(db, "family_deletion_cursor");
}

export async function advanceDeletionCursor(db: SupabaseClient<Database>, parent: string): Promise<void> {
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
export async function deletionCandidates(db: SupabaseClient<Database>): Promise<string[]> {
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

const isFamilyCard = (c: unknown): c is FamilyCard => typeof c === "object" && c !== null
  && (typeof (c as FamilyCard).customer === "string" || (c as FamilyCard).customer === null) && typeof (c as FamilyCard).saved === "boolean"
  && ((c as FamilyCard).booking === undefined || (c as FamilyCard).booking === null
    || (typeof (c as FamilyCard).booking?.email === "string" && !!(c as FamilyCard).booking?.email
      && typeof (c as FamilyCard).booking?.ref === "string" && !!(c as FamilyCard).booking?.ref));

/** Every family the worker decides (#191): the queue, due free-test families, and every family with Stripe history. */
export async function retentionCandidates(db: SupabaseClient<Database>): Promise<RetentionCandidate[]> {
  const families: RetentionCandidate[] = [];
  let after: string | null = null;
  for (;;) {
    const page: { parent_id: string; queued: boolean; last_activity: string | null; cards: unknown }[] =
      await rpc(db, "family_retention_candidates", { after_id: after, page_size: 100 });
    if (page.length === 0) return families;
    for (const r of page) {
      if (typeof r.parent_id !== "string" || typeof r.queued !== "boolean" || !(r.last_activity === null || typeof r.last_activity === "string")
        || !Array.isArray(r.cards) || !r.cards.every(isFamilyCard)) throw new Error("Retention candidate unreadable");
      families.push({ id: r.parent_id, queued: r.queued, lastTestAt: r.last_activity, cards: r.cards });
    }
    const next = page.at(-1)!.parent_id;
    if (next === after) throw new Error("Deletion pagination did not advance");
    after = next;
  }
}

/** The database half of the retention facts for a frozen family. The fence keeps both parts from changing. */
async function frozenFamily(db: SupabaseClient<Database>, parent: string, deadline: number, execution?: FamilyDeletionExecution): Promise<RetentionFamily | null> {
  paymentOptions(deadline, execution);
  const cards: unknown = await rpc(db, "family_retention_cards", { p: parent });
  if (!Array.isArray(cards) || !cards.every(isFamilyCard)) return null;
  paymentOptions(deadline, execution);
  const lastTestAt: string | null = await rpc(db, "family_last_activity", { p: parent });
  return { cards, lastTestAt };
}

/** Run after freezing and settling app card operations. Remote journal and canceled-intent traversal are durable.
 * Fresh current-state reads remain mandatory; unknown results keep the checking job and its fence. */
function paymentStore(db: SupabaseClient<Database>, parent: string, token: string, deadline: number, control: SupabaseClient<Database>, execution?: FamilyDeletionExecution): FamilyPaymentStore {
  const s = execution?.payments ?? stripe();
  const args = { p: parent, token };
  const guarded = <N extends GuardedName>(name: N, values: Omit<Fns[N]["Args"], "p" | "token">) => {
    paymentOptions(deadline, execution);
    return rpc(db, name, ...([{ ...args, ...values }] as ArgsOf<N>));
  };
  const pending = async () => {
    const operations: PaymentOperation[] = [];
    let after: string | null = null;
    for (;;) {
      const page = await guarded("pending_family_payment_operations", { after_id: after, page_size: 100 });
      if (!page.length) return operations;
      // A check constraint limits kind to session and intent.
      operations.push(...page.map(r => ({ kind: r.kind as PaymentOperation["kind"], id: r.object_id, customer: r.customer_id })));
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
      fresh = await guarded("begin_family_payment_operation", { ...resource, customer: operation.customer });
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
    async bookingCustomers(booking) {
      if (!s) throw new Error("Payment provider unavailable");
      return readBookingCustomers(s, booking, () => paymentOptions(deadline, execution));
    },
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
      return readCustomerPayments(s, customer, () => paymentOptions(deadline, execution));
    },
    // jsonb: the progress object the function stores, or null.
    progress: customer => guarded("read_family_payment_progress", { customer }).then((p) => p as PaymentProgress | null),
    async intents(customer, after) {
      if (!s) throw new Error("Payment provider unavailable");
      const page = await s.setupIntents.list({ customer, limit: 100, starting_after: after ?? undefined }, paymentOptions(deadline, execution));
      if (page.data.some(r => r.customer !== customer)) throw new Error("Payment intent scope changed");
      return { data: page.data.map(r => ({ id: r.id, status: r.status })), more: page.has_more };
    },
    saveProgress: (customer, progress) => guarded("save_family_payment_progress", { customer, head_id: progress.head, after_id: progress.after, finished: progress.done }),
  };
  return store;
}

/**
 * Every test of a family as the copy without names reads it (#201), with `copied` when its copy is saved. Service only
 * and read only, so the dry run uses it too. The function selects no name, email, postal code, drawing, stroke, typed
 * working or free text; the assessment core's allowlist then picks the copy's fields. A missing function (the
 * migration is not applied) throws, so no deletion runs without its copy.
 */
export async function familyCopySources(db: SupabaseClient<Database>, parent: string): Promise<unknown[]> {
  const sources: unknown = await rpc(db, "family_copy_sources", { p: parent.toLowerCase() });
  if (!Array.isArray(sources)) throw new Error("Copy source unreadable");
  return sources;
}

function deletionStore(db: SupabaseClient<Database>, parent: string, token: string, deadline: number, execution?: FamilyDeletionExecution): FamilyDeletionStore {
  const args = { p: parent, token };
  return {
    // #201: under the deleting lease. The save writes the copy and its link to the test in one transaction, so a lost
    // answer leaves either both or neither; the retry sees the link and writes no second copy.
    async copySources() {
      timeRemaining(deadline, execution);
      return familyCopySources(db, parent);
    },
    async saveCopy(test, copy) {
      timeRemaining(deadline, execution);
      // The copy's profile is the stored jsonb profile, passed on unread (unknown), so toJson cannot check its shape.
      return rpc(db, "save_family_test_copy", { ...args, test_id: test, test_copy: copy as unknown as Json });
    },
    async confirmCopies() {
      timeRemaining(deadline, execution);
      return rpc(db, "confirm_family_copies", args);
    },
    async renew() {
      timeRemaining(deadline, execution);
      const renewed: boolean = await rpc(db, "renew_family_deletion", args);
      if (!renewed) throw new Error("Deletion lease lost");
    },
    async listImages(prefix, offset, limit, bucket) {
      timeRemaining(deadline, execution);
      const { data, error } = await db.storage.from(bucket).list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });
      if (error || !data) throw new Error("Storage listing failed");
      return data.map((r) => ({ name: r.name, folder: r.id === null }));
    },
    async removeImages(paths, bucket) {
      timeRemaining(deadline, execution);
      const { error } = await db.storage.from(bucket).remove(paths);
      if (error) throw new Error("Storage removal failed");
    },
    async removeAuth() {
      timeRemaining(deadline, execution);
      const { error } = await db.auth.admin.deleteUser(parent);
      if (error && error.code !== "user_not_found") throw new Error("Auth removal failed");
    },
    async complete() {
      timeRemaining(deadline, execution);
      const completed: boolean = await rpc(db, "complete_family_deletion", args);
      if (!completed) throw new Error("Deletion verification failed");
    },
  };
}

/**
 * An explicit request and the scheduled job share the same durable, retryable process. No analytics or email.
 * `retention`: the Node worker's claim (#191). Without it, the claim is the #78 one (queue or free-test rule).
 */
export async function runFamilyDeletion(db: SupabaseClient<Database>, parent: string, control: SupabaseClient<Database> = db, deadline = Date.now() + 45_000, execution?: FamilyDeletionExecution, retention?: RetentionClaim): Promise<FamilyDeletionResult> {
  if (execution && (!Number.isFinite(execution.renewEveryMs) || execution.renewEveryMs <= 0
    || !Number.isFinite(execution.paymentRequestTimeoutMs) || execution.paymentRequestTimeoutMs <= 0)) throw Error("Invalid execution policy");
  timeRemaining(deadline, execution);
  parent = parent.toLowerCase();
  const token = randomUUID();
  const args = { p: parent, token };
  type Claim = { state: "ready" | "busy" | "excluded"; reason?: "request" | "retention"; phase?: "checking" | "deleting" };
  // jsonb: the claim object each function builds, read on its own, so a change of either answer type fails the build.
  const claim = retention
    ? (await rpc(db, "claim_family_retention", { ...args, subscription_ended_at: retention.endedAt })) as Claim
    : (await rpc(db, "claim_family_deletion", args)) as Claim;
  if (claim.state !== "ready") return { state: claim.state };
  const action = async (): Promise<FamilyDeletionResult> => {
    if (claim.phase === "checking") {
      const payments = paymentStore(db, parent, token, deadline, control, execution);
      let keep = false;
      if (claim.reason === "retention") {
        // The rules decide again from fresh reads after the freeze. Only a delete answer moves on. A keep answer
        // unfreezes the family. Unknown keeps the request and its fence for a later run.
        const family = await frozenFamily(db, parent, deadline, execution);
        const decision = family ? await checkFamilyPayments(payments, family, Date.now()) : { action: "unknown" as const };
        if (decision.action === "unknown") throw new Error("Payment check incomplete");
        keep = decision.action === "keep";
      } else if (await settlePaymentOperations(payments) === "unknown") throw new Error("Payment check incomplete");
      timeRemaining(deadline, execution);
      const decided: boolean = await rpc(db, "decide_family_deletion", { ...args, keep_family: keep });
      if (!decided) throw new Error("Deletion decision lost");
      if (keep) return { state: "excluded" };
    }
    timeRemaining(deadline, execution);
    return { state: "deleted" as const, ...await deleteFamily(deletionStore(db, parent, token, deadline, execution), parent) };
  };
  try {
    if (!execution) return await action();
    return await withDeletionHeartbeat({
      wait: signal => wait(execution.renewEveryMs, undefined, { signal }),
      renew: () => rpc(control, "renew_family_deletion_work", args),
      abort: () => execution.abortWork(),
    }, action);
  } finally {
    // No fence is removed on failure. Another run resumes after release (or lease expiry after a crash).
    await rpc(control, "release_family_deletion", args);
  }
}
