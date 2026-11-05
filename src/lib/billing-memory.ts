// The billing module's store and provider (src/lib/billing.ts) in memory, for tests. The store keeps the database's
// guards: every read is filtered by the signed-in parent, and the card order and lock are the rules of take_card_lock,
// finish_card_lock and release_card_lock, on the clock of Date.now. The provider keeps Stripe's rules as the live provider reads them: invoices belong to a customer, a
// read of a whole list either answers or throws, a card update session names the row and the customer it was made for, and
// only a plan that can still charge takes a new default card. `stripe` is a real Stripe client over the same memory, so
// startPlan (src/lib/stripe.ts) runs on what a card update left behind.
import Stripe from "stripe";
import { CARD_LOCK_SECONDS } from "@/lib/card-lock";
import { RUNNING_PLAN } from "@/lib/parent-plan";
import type { BillingProvider, BillingStore, CardUpdateRequest, CardUpdateSession, ProviderInvoice } from "@/lib/billing";

export interface MemoryBillingChild {
  parentId: string;
  childId: string;
  firstName: string;
  /** The child's card_setups row, or null when the parent never chose a plan for this child. */
  card: { id: string; customer: string | null; saved: boolean } | null;
}

export interface MemorySubscription {
  id: string;
  customer: string;
  status: string;
  defaultCard: string | null;
}

/** A saved payment method of a customer. Stripe lists the newest first. */
export interface MemoryPaymentMethod {
  id: string;
  type: string;
}

type Operation = "family" | "card" | "invoices" | "create" | "read" | "setDefault" | "take" | "finish" | "release";

/** One child_card_updates row. */
export interface MemoryCardRow {
  sessionId: string | null;
  created: number | null;
  paymentMethod: string | null;
  applied: boolean;
  needsRepair: boolean;
  token: string | null;
  expiresAt: number | null;
}

export function memoryBilling({ children, invoices = {}, subscriptions = [], paymentMethods = {}, customerDefaults = {} }: {
  children: MemoryBillingChild[];
  invoices?: Record<string, ProviderInvoice[]>;
  subscriptions?: MemorySubscription[];
  /** Each customer's saved payment methods, newest first. */
  paymentMethods?: Record<string, MemoryPaymentMethod[]>;
  /** Each customer's invoice_settings.default_payment_method. */
  customerDefaults?: Record<string, string>;
}) {
  const sessions = new Map<string, CardUpdateSession>();
  const created: CardUpdateRequest[] = [];
  /** One row per child: child_card_updates. */
  const updates = new Map<string, MemoryCardRow>();
  let tokens = 0;
  const calls: Record<Operation, number> = { family: 0, card: 0, invoices: 0, create: 0, read: 0, setDefault: 0, take: 0, finish: 0, release: 0 };
  /** Cards whose subscription write Stripe refuses, after the Customer's write landed. */
  const refuseOnSubscription = new Set<string>();
  /** Set an operation's error to make every call of it throw, as a database or Stripe error would. */
  const fail: Partial<Record<Operation, Error>> = {};
  /** Customers whose invoice read throws, as one customer's page failing would. */
  const failInvoicesOf = new Set<string>();
  /** Runs inside the next card write, before it lands, as a second return that overtakes this write would. */
  let duringNextWrite: (() => Promise<void>) | null = null;
  const begin = (operation: Operation) => {
    calls[operation]++;
    if (fail[operation]) throw fail[operation];
  };
  const childOfCard = (parentId: string, cardId: string) => children.find((c) => c.parentId === parentId && c.card?.id === cardId);
  const rowOfCard = (cardId: string) => {
    const child = children.find((c) => c.card?.id === cardId);
    return child && updates.get(child.childId);
  };

  const store: BillingStore = {
    async family(parentId) {
      begin("family");
      return children.filter((c) => c.parentId === parentId).map((c) => ({
        childId: c.childId, firstName: c.firstName, cardId: c.card?.id ?? null, customer: c.card?.customer ?? null, cardSaved: c.card?.saved ?? false,
      }));
    },
    async card(parentId, cardId) {
      begin("card");
      const child = childOfCard(parentId, cardId);
      return child?.card ? { cardId: child.card.id, childId: child.childId, customer: child.card.customer, cardSaved: child.card.saved } : null;
    },
    async takeCardLock(cardId, card) {
      begin("take");
      const child = card ? childOfCard(card.parentId, cardId) : children.find((c) => c.card?.id === cardId);
      if (!child) return { state: "no_match" };
      let row = updates.get(child.childId);
      if (!row) updates.set(child.childId, row = { sessionId: null, created: null, paymentMethod: null, applied: false, needsRepair: false, token: null, expiresAt: null });
      let recorded = false;
      if (card) {
        if (row.sessionId === null || row.created === null || card.created > row.created || (card.created === row.created && card.session > row.sessionId)) {
          Object.assign(row, { sessionId: card.session, created: card.created, paymentMethod: card.paymentMethod, applied: false, needsRepair: true });
          recorded = true;
        }
        if (!row.needsRepair) return { state: "clean", session: row.sessionId, recorded: false };
      }
      if (row.token && row.expiresAt !== null && row.expiresAt > Date.now()) return { state: "busy", session: row.sessionId, recorded };
      row.token = `lock-${++tokens}`;
      row.expiresAt = Date.now() + CARD_LOCK_SECONDS * 1000;
      return { state: "taken", token: row.token, session: row.sessionId, paymentMethod: row.paymentMethod, needsRepair: row.needsRepair, recorded };
    },
    async finishCardLock(cardId, token, session, wrote) {
      begin("finish");
      const row = rowOfCard(cardId);
      if (!row || row.token !== token) return { state: "lost" };
      if (row.sessionId !== session) return { state: "newer", session: row.sessionId, paymentMethod: row.paymentMethod };
      if (!wrote) return { state: "unchanged" };
      Object.assign(row, { needsRepair: false, token: null, expiresAt: null, applied: row.sessionId !== null });
      return { state: "done" };
    },
    async releaseCardLock(cardId, token) {
      begin("release");
      const row = rowOfCard(cardId);
      if (row?.token === token) Object.assign(row, { token: null, expiresAt: null });
    },
  };

  const provider: BillingProvider = {
    async invoices(customer) {
      begin("invoices");
      if (failInvoicesOf.has(customer)) throw new Error("Stripe down");
      return invoices[customer] ?? [];
    },
    async createCardUpdate(request) {
      begin("create");
      created.push(request);
      const id = `cs_test_${created.length}`;
      sessions.set(id, { id, ref: request.ref, customer: request.customer, created: 1_800_000_000 + created.length * 60, paymentMethod: null });
      return `https://checkout.stripe.test/${id}`;
    },
    async readCardUpdate(id) {
      begin("read");
      return sessions.get(id) ?? null;
    },
    async setCardDefault(customer, paymentMethod, canWrite) {
      begin("setDefault");
      const during = duringNextWrite;
      duringNextWrite = null;
      await during?.();
      if (!canWrite()) throw new Error("The card lock is about to end");
      customerDefaults[customer] = paymentMethod;
      if (refuseOnSubscription.has(paymentMethod)) throw new Error("Stripe refused the subscription write");
      for (const s of subscriptions) if (s.customer === customer && RUNNING_PLAN.has(s.status)) s.defaultCard = paymentMethod;
    },
  };

  const stripe = new Stripe("sk_test_memory", { maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const answer = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url.pathname === "/v1/subscriptions" && method === "GET") {
      return answer({ object: "list", has_more: false, data: subscriptions.filter((s) => s.customer === url.searchParams.get("customer")).map((s) => ({ id: s.id, status: s.status })) });
    }
    if (url.pathname === "/v1/subscriptions" && method === "POST") {
      const form = new URLSearchParams(String(init?.body ?? ""));
      const id = `sub_memory_${subscriptions.length + 1}`;
      subscriptions.push({ id, customer: form.get("customer")!, status: "trialing", defaultCard: form.get("default_payment_method") });
      return answer({ id, trial_end: 1_900_000_000 });
    }
    if (url.pathname.startsWith("/v1/subscriptions/") && method === "POST") {
      const form = new URLSearchParams(String(init?.body ?? ""));
      const id = url.pathname.split("/").at(-1)!;
      const subscription = subscriptions.find((s) => s.id === id);
      const card = form.get("default_payment_method")!;
      if (!subscription || refuseOnSubscription.has(card)) return new Response(JSON.stringify({ error: { type: "invalid_request_error", message: "Refused" } }), { status: 400 });
      subscription.defaultCard = card;
      return answer({ id });
    }
    if (url.pathname.startsWith("/v1/customers/") && method === "POST") {
      const form = new URLSearchParams(String(init?.body ?? ""));
      const customer = url.pathname.split("/").at(-1)!;
      customerDefaults[customer] = form.get("invoice_settings[default_payment_method]")!;
      return answer({ id: customer });
    }
    if (url.pathname.startsWith("/v1/customers/") && method === "GET") {
      const customer = url.pathname.split("/").at(-1)!;
      const chosen = customerDefaults[customer];
      const saved = chosen ? paymentMethods[customer]?.find((m) => m.id === chosen) ?? { id: chosen, type: "card" } : null;
      return answer({ id: customer, invoice_settings: { default_payment_method: saved } });
    }
    if (url.pathname === "/v1/payment_methods") {
      const of = paymentMethods[url.searchParams.get("customer")!] ?? [];
      return answer({ object: "list", has_more: false, data: of.filter((m) => m.type === url.searchParams.get("type")).slice(0, 1) });
    }
    if (url.pathname.startsWith("/v1/products/")) return answer({ id: url.pathname.split("/").at(-1) });
    throw new Error(`Unexpected Stripe request ${method} ${url.pathname}`);
  }) });

  return {
    store,
    provider,
    stripe,
    calls,
    fail,
    failInvoicesOf,
    created,
    subscriptions,
    paymentMethods,
    customerDefaults,
    refuseOnSubscription,
    updates,
    /** No real wait between tries of a busy lock. */
    pause: async () => {},
    /** The parent finishes Stripe's page: the session now holds the card, and it is the customer's newest. */
    complete(id: string, paymentMethod: string, type = "card") {
      const session = sessions.get(id);
      if (!session) throw new Error("No such session");
      session.paymentMethod = paymentMethod;
      (paymentMethods[session.customer] ??= []).unshift({ id: paymentMethod, type });
    },
    /** A session made by someone else, on another customer. */
    addSession(session: CardUpdateSession) {
      sessions.set(session.id, session);
    },
    duringNextWrite(run: () => Promise<void>) {
      duringNextWrite = run;
    },
  };
}
