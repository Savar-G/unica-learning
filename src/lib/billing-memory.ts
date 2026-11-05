// The billing module's store and provider (src/lib/billing.ts) in memory, for tests. The store keeps the database's
// guard: every read is filtered by the signed-in parent. The provider keeps Stripe's rules as the live provider reads
// them: invoices belong to a customer, a read of a whole list either answers or throws, a card update session names the
// row and the customer it was made for, and only a plan that can still charge takes a new default card.
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

type Operation = "family" | "card" | "invoices" | "create" | "read" | "setDefault";

export function memoryBilling({ children, invoices = {}, subscriptions = [] }: { children: MemoryBillingChild[]; invoices?: Record<string, ProviderInvoice[]>; subscriptions?: MemorySubscription[] }) {
  const sessions = new Map<string, CardUpdateSession>();
  const created: CardUpdateRequest[] = [];
  const calls: Record<Operation, number> = { family: 0, card: 0, invoices: 0, create: 0, read: 0, setDefault: 0 };
  /** Set an operation's error to make every call of it throw, as a database or Stripe error would. */
  const fail: Partial<Record<Operation, Error>> = {};
  /** Customers whose invoice read throws, as one customer's page failing would. */
  const failInvoicesOf = new Set<string>();
  const begin = (operation: Operation) => {
    calls[operation]++;
    if (fail[operation]) throw fail[operation];
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
      const child = children.find((c) => c.parentId === parentId && c.card?.id === cardId);
      return child?.card ? { cardId: child.card.id, childId: child.childId, customer: child.card.customer, cardSaved: child.card.saved } : null;
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
      sessions.set(id, { id, ref: request.ref, customer: request.customer, paymentMethod: null });
      return `https://checkout.stripe.test/${id}`;
    },
    async readCardUpdate(id) {
      begin("read");
      return sessions.get(id) ?? null;
    },
    async setCardDefault(customer, paymentMethod) {
      begin("setDefault");
      for (const s of subscriptions) if (s.customer === customer && RUNNING_PLAN.has(s.status)) s.defaultCard = paymentMethod;
    },
  };

  return {
    store,
    provider,
    calls,
    fail,
    failInvoicesOf,
    created,
    subscriptions,
    /** The parent finishes Stripe's page: the session now holds the card. */
    complete(id: string, paymentMethod: string) {
      const session = sessions.get(id);
      if (!session) throw new Error("No such session");
      session.paymentMethod = paymentMethod;
    },
    /** A session made by someone else, on another customer. */
    addSession(session: CardUpdateSession) {
      sessions.set(session.id, session);
    },
  };
}
