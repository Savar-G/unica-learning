import type { RetentionCardState } from "./deletion";
import { retentionDecision, type BookingLink, type CustomerPayments, type FamilyCard, type RetentionDecision, type RetentionFamily } from "./retention";

export interface PaymentOperation { kind: "session" | "intent"; customer: string; id: string }
export interface PaymentProgress { head: string | null; after: string | null; done: boolean }
export interface FamilyPaymentStore {
  bookingCustomers?(booking: BookingLink): Promise<string[]>;
  pending(): Promise<PaymentOperation[]>;
  reconcile(operation: PaymentOperation): Promise<RetentionCardState>;
  openSessions(customer: string): Promise<string[]>;
  expire(customer: string, id: string): Promise<RetentionCardState>;
  /** Fresh reads of what Stripe holds for one customer now. A failure means unknown. */
  current(customer: string): Promise<CustomerPayments>;
  progress(customer: string): Promise<PaymentProgress | null>;
  intents(customer: string, after: string | null): Promise<{ data: { id: string; status: string }[]; more: boolean }>;
  cancel(customer: string, id: string): Promise<RetentionCardState>;
  saveProgress(customer: string, progress: PaymentProgress): Promise<void>;
}

const UNKNOWN: RetentionDecision = { action: "unknown" };
/** A card was saved during the check (a Checkout finished, or a setup succeeded): the family stays. */
const SAVED_NOW: RetentionDecision = { action: "keep", reason: "customer" };

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

const customersOf = (cards: readonly FamilyCard[]) => [...new Set(cards.flatMap((c) => (c.customer ? [c.customer] : [])))];

/** Resolve booking references on every decision. An absent reader, missing link or incomplete result is unknown. */
async function resolveCards(cards: readonly FamilyCard[], resolve?: (booking: BookingLink) => Promise<string[]>): Promise<FamilyCard[] | "unknown"> {
  const result: FamilyCard[] = [];
  try {
    for (const card of cards) {
      if (card.booking === undefined) { result.push(card); continue; }
      if (!card.booking || !resolve) return "unknown";
      const customers = await resolve(card.booking);
      if (!customers.length || customers.some(c => typeof c !== "string" || !c)) return "unknown";
      result.push(...customers.map(customer => ({ customer, saved: false })));
    }
    return result;
  } catch { return "unknown"; }
}

/**
 * Read every Stripe customer of the family, four at a time, and add the site's record of a saved card. One failed read
 * makes the whole family unknown: no later customer is started, and every started read is awaited.
 */
export async function readFamilyPayments(cards: readonly FamilyCard[], read: (customer: string) => Promise<CustomerPayments>, resolve?: (booking: BookingLink) => Promise<string[]>): Promise<CustomerPayments[] | "unknown"> {
  const linked = await resolveCards(cards, resolve);
  if (linked === "unknown") return "unknown";
  cards = linked;
  const customers = customersOf(cards);
  const facts = new Map<string, CustomerPayments>();
  let next = 0, failed = false;
  await Promise.allSettled(Array.from({ length: Math.min(4, customers.length) }, async () => {
    while (!failed && next < customers.length) {
      const customer = customers[next++];
      try { facts.set(customer, await read(customer)); } catch { failed = true; }
    }
  }));
  if (failed) return "unknown";
  const siteSaved = (customer: string) => cards.some((c) => c.customer === customer && c.saved);
  return [
    ...customers.map((customer) => {
      const f = facts.get(customer)!;
      return { savedCard: f.savedCard || siteSaved(customer), subscriptions: [...f.subscriptions] };
    }),
    // The site saw a saved card, but the row has no Stripe customer: count it as a card that waits.
    ...cards.filter((c) => !c.customer && c.saved).map((): CustomerPayments => ({ savedCard: true, subscriptions: [] })),
  ];
}

/**
 * Card setups that can no longer change are progress. A canceled setup is always settled. A succeeded setup is a card
 * saved in the past: settled history for a former customer, and a saved card for any other family.
 */
const settledBy = (history: boolean) => (status: string) => status === "canceled" || (history && status === "succeeded");

/** Only settled intents are checkpointed. A customer/card clear result is never persisted. */
async function checkIntents(store: FamilyPaymentStore, customer: string, history: boolean): Promise<RetentionCardState> {
  const settled = settledBy(history);
  const first = await store.intents(customer, null);
  const head = first.data[0]?.id ?? null;
  let progress = await store.progress(customer);
  if (!progress || progress.head !== head || first.data.some(i => !settled(i.status))) {
    progress = { head, after: null, done: false };
    await store.saveProgress(customer, progress);
  }
  let page = progress.after ? await store.intents(customer, progress.after) : first;
  while (!progress.done) {
    const state = await checkTogether(page.data, async intent => {
      if (settled(intent.status)) return "clear";
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
  return "clear";
}

/** A cleanup checkpoint only skips settled history. Every customer needs fresh open/head and payment reads. */
async function verifyPrepared(store: FamilyPaymentStore, customer: string, history: boolean): Promise<RetentionCardState> {
  const settled = settledBy(history);
  const progress = await store.progress(customer);
  if (!progress?.done) return "unknown";
  const results = await Promise.allSettled([
    (async () => store.openSessions(customer))(),
    (async () => store.intents(customer, null))(),
  ]);
  const [sessions, intents] = results;
  if (sessions.status !== "fulfilled" || intents.status !== "fulfilled") return "unknown";
  const first = intents.value.data;
  const head = first[0]?.id ?? null;
  if (sessions.value.length || head !== progress.head || first.some(i => !settled(i.status))) {
    await store.saveProgress(customer, { head, after: null, done: false });
    return first.some(i => i.status === "succeeded") && first.every(i => ["canceled", "succeeded"].includes(i.status)) ? "saved" : "unknown";
  }
  return "clear";
}

/** Uncertain remote mutations from an earlier attempt. Any unresolved one blocks every decision, including a request. */
export async function settlePaymentOperations(store: FamilyPaymentStore): Promise<RetentionCardState> {
  try {
    return await checkTogether(await store.pending(), operation => store.reconcile(operation));
  } catch { return "unknown"; }
}

/**
 * The retention decision for a frozen family, from fresh Stripe reads. It reads first and changes nothing in Stripe
 * unless the rules say delete. Then it closes open card setups (resumable across attempts), checks that none came
 * back, and decides again from a second complete set of fresh reads. No clear result is stored between attempts.
 */
export async function checkFamilyPayments(store: FamilyPaymentStore, family: RetentionFamily, now: number): Promise<RetentionDecision> {
  const decide = async (cards: FamilyCard[]) => retentionDecision({ lastTestAt: family.lastTestAt, payments: await readFamilyPayments(cards, c => store.current(c)) }, now);
  try {
    const pending = await settlePaymentOperations(store);
    if (pending !== "clear") return pending === "saved" ? SAVED_NOW : UNKNOWN;
    const cards = await resolveCards(family.cards, store.bookingCustomers?.bind(store));
    if (cards === "unknown") return UNKNOWN;
    const customers = customersOf(cards);
    const first = await decide(cards);
    if (first.action !== "delete") return first;
    const history = first.rule === "former_customer";
    const prepared = await checkTogether(customers, async customer => {
      if ((await store.progress(customer))?.done) return "clear";
      for (;;) {
        const sessions = await store.openSessions(customer);
        if (!sessions.length) break;
        const state = await checkTogether([...new Set(sessions)], id => store.expire(customer, id));
        if (state !== "clear") return state;
      }
      return checkIntents(store, customer, history);
    });
    if (prepared !== "clear") return prepared === "saved" ? SAVED_NOW : UNKNOWN;
    const verified = await checkTogether(customers, customer => verifyPrepared(store, customer, history));
    if (verified !== "clear") return verified === "saved" ? SAVED_NOW : UNKNOWN;
    const freshCards = await resolveCards(family.cards, store.bookingCustomers?.bind(store));
    if (freshCards === "unknown") return UNKNOWN;
    const final = await decide(freshCards);
    if (final.action === "delete" && customersOf(freshCards).sort().join("\n") !== [...customers].sort().join("\n")) return UNKNOWN;
    // The cleanup above followed the first rule. A different rule now is a state change: decide on a later attempt.
    if (final.action === "delete" && final.rule !== first.rule) return UNKNOWN;
    return final;
  } catch { return UNKNOWN; }
}
