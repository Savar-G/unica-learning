import type { RetentionCardState } from "./deletion";

export interface PaymentOperation { kind: "session" | "intent"; customer: string; id: string }
export interface PaymentProgress { head: string | null; after: string | null; done: boolean }
export interface FamilyPaymentStore {
  pending(): Promise<PaymentOperation[]>;
  reconcile(operation: PaymentOperation): Promise<RetentionCardState>;
  openSessions(customer: string): Promise<string[]>;
  expire(customer: string, id: string): Promise<RetentionCardState>;
  current(customer: string): Promise<RetentionCardState>;
  progress(customer: string): Promise<PaymentProgress | null>;
  intents(customer: string, after: string | null): Promise<{ data: { id: string; status: string }[]; more: boolean }>;
  cancel(customer: string, id: string): Promise<RetentionCardState>;
  saveProgress(customer: string, progress: PaymentProgress): Promise<void>;
}

/** Stop scheduling after an uncertainty or saved result. Await every operation already started. */
async function checkTogether<T>(items: readonly T[], check: (item: T) => Promise<RetentionCardState>): Promise<RetentionCardState> {
  let next = 0, stopped = false;
  const results: RetentionCardState[] = [];
  await Promise.allSettled(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (!stopped && next < items.length) {
      const item = items[next++];
      let state: RetentionCardState;
      try { state = await check(item); } catch { state = "unknown"; }
      results.push(state);
      if (state !== "clear") stopped = true;
    }
  }));
  return results.includes("unknown") ? "unknown" : results.includes("saved") ? "saved" : "clear";
}

/** Only immutable canceled intents are checkpointed. A customer/card clear result is never persisted. */
async function checkIntents(store: FamilyPaymentStore, customer: string): Promise<RetentionCardState> {
  const first = await store.intents(customer, null);
  const head = first.data[0]?.id ?? null;
  let progress = await store.progress(customer);
  if (!progress || progress.head !== head || first.data.some(i => i.status !== "canceled")) {
    progress = { head, after: null, done: false };
    await store.saveProgress(customer, progress);
  }
  let page = progress.after ? await store.intents(customer, progress.after) : first;
  while (!progress.done) {
    const state = await checkTogether(page.data, async intent => {
      if (intent.status === "canceled") return "clear";
      if (intent.status === "succeeded") return "saved";
      if (!["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status)) return "unknown";
      return store.cancel(customer, intent.id);
    });
    if (state !== "clear") return state;
    const after: string | null = page.data.at(-1)?.id ?? progress.after;
    if (page.more && (!after || after === progress.after)) return "unknown";
    progress = { head, after, done: !page.more };
    await store.saveProgress(customer, progress);
    if (!progress.done) page = await store.intents(customer, progress.after);
  }
  // A new head invalidates this traversal. Never turn a partial or changed history into a clear result.
  const latest = await store.intents(customer, null);
  if ((latest.data[0]?.id ?? null) !== head || latest.data.some(i => i.status !== "canceled")) {
    await store.saveProgress(customer, { head: latest.data[0]?.id ?? null, after: null, done: false });
    return "unknown";
  }
  return "clear";
}

/** Frozen families resume physical Checkout expiry and canceled-intent traversal across bounded attempts. */
export async function checkFamilyPayments(store: FamilyPaymentStore, customerIds: readonly string[], knownSaved = false): Promise<RetentionCardState> {
  try {
    const pending = await checkTogether(await store.pending(), operation => store.reconcile(operation));
    if (pending !== "clear") return pending;
    if (knownSaved) return "saved";
    return await checkTogether([...new Set(customerIds)], async customer => {
      const current = await store.current(customer);
      if (current !== "clear") return current;
      for (;;) {
        const sessions = await store.openSessions(customer);
        if (!sessions.length) break;
        const state = await checkTogether([...new Set(sessions)], id => store.expire(customer, id));
        if (state !== "clear") return state;
      }
      const intents = await checkIntents(store, customer);
      return intents === "clear" ? store.current(customer) : intents;
    });
  } catch { return "unknown"; }
}
