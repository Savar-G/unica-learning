// The billing module's store and provider (src/lib/billing.ts) in memory, for tests. The store keeps the database's
// guards: every read is filtered by the signed-in parent, and the card order and the plan record are the rules of
// record_card_update, settle_card_update, card_check_rows and the plan start functions of migration plan_starts, on the clock of Date.now. The
// provider keeps Stripe's rules as the live provider reads them: invoices belong to a customer, a read of a whole list either
// answers or throws, a card update session names the row and the customer it was made for, and only a plan that can still charge
// takes a new default card. `stripe` is a real Stripe client over the same memory, so startPlan (src/lib/stripe.ts) runs on what a
// card update left behind.
import Stripe from "stripe";
import { CardWriteRefused, PLAN_KEY_MS, type CardRow, type CardState, type PlanStart } from "@/lib/card-reconcile";
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
  startKey?: string | null;
}

/** A saved payment method of a customer. Stripe lists the newest first. */
export interface MemoryPaymentMethod {
  id: string;
  type: string;
}

type Operation = "family" | "card" | "invoices" | "create" | "read" | "state" | "setDefault" | "record" | "settle" | "rows" | "note" | "admit" | "finish" | "planEmail" | "alert";

/** One child_card_updates row. */
export interface MemoryCardRow {
  sessionId: string | null;
  created: number | null;
  paymentMethod: string | null;
  applied: boolean;
  needsRepair: boolean;
  /** When the card changed: updated_at. */
  changedAt: number;
  /** When the sweep last looked: reconciled_at. */
  checkedAt: number | null;
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
  /** public.plan_starts: each card setup's records, oldest generation first. Never cleared. */
  const planStarts = new Map<string, PlanStart[]>();
  /** Who closed a record: plan_starts.ended_by. */
  const endedBy = new Map<string, string>();
  const newestStart = (cardId: string) => planStarts.get(cardId)?.at(-1) ?? null;
  const startOf = (cardId: string, generation: number) => planStarts.get(cardId)?.find((s) => s.generation === generation);
  /** A Customer's card writes are counted. */
  const calls: Record<Operation, number> = { family: 0, card: 0, invoices: 0, create: 0, read: 0, state: 0, setDefault: 0, record: 0, settle: 0, rows: 0, note: 0, admit: 0, finish: 0, planEmail: 0, alert: 0 };
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
  const newRow = (): MemoryCardRow => ({ sessionId: null, created: null, paymentMethod: null, applied: false, needsRepair: false, changedAt: Date.now(), checkedAt: null });
  const cardRowOf = (child: MemoryBillingChild, row: MemoryCardRow): CardRow => ({
    cardId: child.card!.id, customer: child.card!.customer!, session: row.sessionId, paymentMethod: row.paymentMethod, needsRepair: row.needsRepair,
    planStart: newestStart(child.card!.id) && { ...newestStart(child.card!.id)! },
  });
  const rowWhere = (test: (c: MemoryBillingChild) => boolean) => {
    const child = children.find((c) => c.card?.customer && test(c));
    const row = child && updates.get(child.childId);
    return child && row ? cardRowOf(child, row) : null;
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
    async recordCard(cardId, card) {
      begin("record");
      const child = childOfCard(card.parentId, cardId);
      if (!child) return { state: "no_match" };
      let row = updates.get(child.childId);
      if (!row) updates.set(child.childId, row = newRow());
      let recorded = false;
      if (row.sessionId === null || row.created === null || card.created > row.created || (card.created === row.created && card.session > row.sessionId)) {
        Object.assign(row, { sessionId: card.session, created: card.created, paymentMethod: card.paymentMethod, applied: false, needsRepair: true, changedAt: Date.now() });
        recorded = true;
      }
      return { state: "row", session: row.sessionId, paymentMethod: row.paymentMethod, needsRepair: row.needsRepair, recorded };
    },
    async settleCard(cardId, session, confirmed) {
      begin("settle");
      const row = rowOfCard(cardId);
      if (!row) return { state: "newer", session: null, paymentMethod: null };
      if (row.sessionId !== session) return { state: "newer", session: row.sessionId, paymentMethod: row.paymentMethod };
      if (confirmed) {
        Object.assign(row, { needsRepair: false, applied: row.sessionId !== null });
        return { state: "settled" };
      }
      if (row.paymentMethod) row.needsRepair = true;
      return { state: "flagged" };
    },
    async cardRow(cardId) {
      begin("rows");
      return rowWhere((c) => c.card?.id === cardId);
    },
    async cardRowOfCustomer(customer) {
      begin("rows");
      return rowWhere((c) => c.card?.customer === customer);
    },
    async dueCardRows(changedAfter, limit) {
      begin("rows");
      return children.flatMap((c) => {
        const row = updates.get(c.childId);
        const start = c.card && newestStart(c.card.id);
        return row && c.card?.customer && (start?.state === "open" || start?.email === "pending" || (row.paymentMethod && (row.needsRepair || row.changedAt > changedAfter))) ? [{ child: c, row }] : [];
      }).sort((a, b) => (a.row.checkedAt ?? -1) - (b.row.checkedAt ?? -1)).slice(0, limit).map(({ child, row }) => cardRowOf(child, row));
    },
    async noteCardChecked(cardId) {
      begin("note");
      const row = rowOfCard(cardId);
      if (row) row.checkedAt = Date.now();
    },
    async admitPlanStart(cardId, generation, key, card, terms) {
      begin("admit");
      const child = children.find((c) => c.card?.id === cardId);
      if (!child) throw new Error("plan_start_no_card_setup");
      if (!updates.has(child.childId)) updates.set(child.childId, newRow());
      const latest = newestStart(cardId);
      if ((latest?.generation ?? 0) === generation - 1 && latest?.state !== "open") {
        const start: PlanStart = { ...terms, generation, key, card, at: Date.now(), state: "open", subscription: null, firstCharge: null, finished: null, email: "none", alert: null };
        planStarts.set(cardId, [...(planStarts.get(cardId) ?? []), start]);
        return { ...start };
      }
      if (!latest) throw new Error("plan_start_generation_gap");
      return { ...latest };
    },
    async finishPlanStart(cardId, generation, outcome) {
      begin("finish");
      const start = startOf(cardId, generation);
      if (start?.state !== "open") return;
      Object.assign(start, {
        state: outcome.state, finished: Date.now(),
        subscription: outcome.state === "refused" ? null : outcome.subscription,
        firstCharge: outcome.state === "started" ? outcome.firstCharge : null,
        email: outcome.state === "started" && outcome.email ? "pending" : "none",
      });
    },
    async notePlanEmail(cardId, generation, state) {
      begin("planEmail");
      const start = startOf(cardId, generation);
      if (start?.email === "pending") start.email = state;
    },
    async claimPlanAlert(cardId, generation) {
      begin("alert");
      const start = startOf(cardId, generation);
      if (start?.state !== "open" || start.alert !== null || Date.now() - start.at < PLAN_KEY_MS) return false;
      start.alert = "sending";
      return true;
    },
    async notePlanAlert(cardId, generation, note) {
      begin("alert");
      const start = startOf(cardId, generation);
      if (start?.alert === "sending") start.alert = note.state === "released" ? null : note.state;
    },
    async teamEndPlanStart(cardId, generation, admin) {
      begin("finish");
      const start = startOf(cardId, generation);
      if (start?.state !== "open" || Date.now() - start.at < PLAN_KEY_MS) return false;
      Object.assign(start, { state: "team_ended", finished: Date.now() });
      endedBy.set(`${cardId}:${generation}`, admin);
      return true;
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
    async cardState(customer): Promise<CardState> {
      begin("state");
      return {
        gone: false, customerDefault: customerDefaults[customer] ?? null,
        plans: subscriptions.filter((s) => s.customer === customer).map((s) => ({ id: s.id, status: s.status, defaultCard: s.defaultCard, startKey: s.startKey ?? null, firstCharge: new Date(1_900_000_000_000).toISOString() })),
      };
    },
    async setSubscriptionCard(id, card) {
      if (fail.setDefault) throw fail.setDefault;
      const during = duringNextWrite;
      duringNextWrite = null;
      await during?.();
      if (refuseOnSubscription.has(card)) throw new CardWriteRefused("Stripe refused the subscription write");
      const subscription = subscriptions.find((s) => s.id === id && RUNNING_PLAN.has(s.status));
      if (subscription) subscription.defaultCard = card;
    },
    async setCustomerCard(customer, card) {
      begin("setDefault");
      const during = duringNextWrite;
      duringNextWrite = null;
      await during?.();
      customerDefaults[customer] = card;
    },
  };

  const stripe = new Stripe("sk_test_memory", { maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const answer = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url.pathname === "/v1/subscriptions" && method === "GET") {
      return answer({ object: "list", has_more: false, data: subscriptions.filter((s) => s.customer === url.searchParams.get("customer")).map((s) => ({ id: s.id, status: s.status, default_payment_method: s.defaultCard, metadata: { ...(s.startKey ? { start_key: s.startKey } : {}) }, trial_end: 1_900_000_000 })) });
    }
    if (url.pathname === "/v1/subscriptions" && method === "POST") {
      const form = new URLSearchParams(String(init?.body ?? ""));
      const id = `sub_memory_${subscriptions.length + 1}`;
      subscriptions.push({ id, customer: form.get("customer")!, status: "trialing", defaultCard: form.get("default_payment_method"), startKey: form.get("metadata[start_key]") });
      return answer({ id, status: "trialing", default_payment_method: form.get("default_payment_method"), metadata: { start_key: form.get("metadata[start_key]") }, trial_end: 1_900_000_000 });
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
    planStarts,
    endedBy,
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
