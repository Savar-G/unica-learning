import { CardWriteRefused, settleNewestCard, writeWindow, type CardRows, type CardStripe } from "@/lib/card-reconcile";
import type { ParentPlan } from "@/lib/parent-plan";
import { fillChildPlan, type PlanStates } from "@/lib/plan-state";

// The family's billing on the Account tab (#554, spec #544). Stripe holds one Customer per child, so one Customer Portal
// session cannot show a family's invoices: this list is ours.
//
// Plans come from the stored rows (plan-state.ts), and a load of Account fills a missing row. Invoices load live, here and
// nowhere else. Every read starts from the signed-in parent's id, so a parent reaches only their own customers, and no
// customer id reaches the page. A list is whole or it is not shown: a part of it would read as all of it.
//
// The card update is Stripe's hosted page: Checkout in setup mode, for cards only. The new card then becomes the Customer's
// default, which a later plan start uses, and the default of the plan that can still charge. Only the newest update counts:
// a return of an update that is not newer than the last one changes nothing (child_card_updates), and Stripe follows that row
// (card-reconcile.ts). Cancel stays in the current flow (D-222). The store (card_setups,
// child_card_updates) and the provider (Stripe) are the seams: billing-server.ts holds Supabase and Stripe, billing-memory.ts
// holds both in memory for tests.

/** One child of the family, with its card_setups row when there is one. */
export interface BillingChild {
  childId: string;
  firstName: string;
  cardId: string | null;
  customer: string | null;
  cardSaved: boolean;
}

/** One card_setups row of the signed-in parent. */
export interface BillingCard {
  cardId: string;
  childId: string;
  customer: string | null;
  cardSaved: boolean;
}

export interface BillingStore extends CardRows {
  /** Apply confirmed private pause dates to a stored plan without another provider call. */
  pendingControl?(parentId: string, cardId: string): Promise<"pause" | "restart" | "cancel" | null>;
  adjustedPlan?(parentId: string, cardId: string, plan: ParentPlan): Promise<ParentPlan>;
  /** The parent's children, oldest first. Throws when the read fails. */
  family(parentId: string): Promise<BillingChild[]>;
  /** The parent's card row, or null: another family's row reads as none. Throws when the read fails. */
  card(parentId: string, cardId: string): Promise<BillingCard | null>;
}

/** The Stripe fields the list uses. Times are Unix seconds. */
export interface ProviderInvoice {
  id: string;
  customer: string | null;
  status: string | null;
  created: number;
  paidAt: number | null;
  amountPaid: number;
  amountDue: number;
  total: number;
  currency: string;
  receiptUrl: string | null;
}

export interface CardUpdateRequest {
  ref: string;
  customer: string;
  parentId: string;
  childId: string;
  returnUrl: string;
  cancelUrl: string;
}

/** A Checkout Session this module made. `created` is in Unix seconds. `paymentMethod` is set only once Stripe has saved the card. */
export interface CardUpdateSession {
  id: string;
  ref: string;
  customer: string;
  created: number;
  paymentMethod: string | null;
}

export interface BillingProvider extends CardStripe {
  /** All of one customer's invoices. Throws when it cannot read the whole list. */
  invoices(customer: string): Promise<ProviderInvoice[]>;
  /** Stripe's hosted page to save a new card, or null when Stripe gives no page. Throws when Stripe fails. */
  createCardUpdate(request: CardUpdateRequest): Promise<string | null>;
  /** The session, or null when there is no such card update session. Throws when Stripe fails. */
  readCardUpdate(id: string): Promise<CardUpdateSession | null>;
}

export interface CardUpdates {
  store: BillingStore;
  provider: BillingProvider;
}

export interface FamilyBillingSeams extends CardUpdates {
  plans: PlanStates;
}

export type InvoiceStatus = "paid" | "no_charge" | "due" | "not_paid" | "cancelled";

/** One row of the list: only these fields reach the page. */
export interface FamilyInvoice {
  id: string;
  childId: string;
  childName: string;
  /** ISO time: when it was paid, else when it was made. */
  at: string;
  cents: number;
  currency: string;
  status: InvoiceStatus;
  receiptUrl: string | null;
}

export type InvoiceList = { state: "loaded"; invoices: FamilyInvoice[] } | { state: "unavailable" };

export interface ChildBilling {
  childId: string;
  firstName: string;
  /** Null when the child has no saved card; such a child has no plan to show or card to update. */
  cardId: string | null;
  plan: ParentPlan | null;
  pending?: "pause" | "restart" | "cancel";
}

export type FamilyBilling = { state: "loaded"; plans: ChildBilling[]; invoices: InvoiceList } | { state: "unavailable" };

/** A current plan, an initial start, or a paid Restart can need a corrected card. */
export const canUpdateCard = (plan: ParentPlan) => plan.kind === "not_started" || plan.kind === "free_month" || plan.kind === "paying" || plan.kind === "payment_failed" || plan.kind === "paused" || plan.kind === "ended";

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

/** What a parent sees of an invoice; null for one that is not an invoice yet (a draft). */
function invoiceFacts({ status, amountPaid, amountDue, total }: ProviderInvoice): { status: InvoiceStatus; cents: number } | null {
  switch (status) {
    case "paid": return { status: amountPaid === 0 ? "no_charge" : "paid", cents: amountPaid };
    case "open": return { status: "due", cents: amountDue };
    case "uncollectible": return { status: "not_paid", cents: amountDue };
    case "void": return { status: "cancelled", cents: total };
    default: return null;
  }
}

async function familyInvoices(children: readonly BillingChild[], provider: BillingProvider): Promise<InvoiceList> {
  const owners = new Map(children.flatMap((c) => (c.customer ? [[c.customer, c] as const] : [])));
  try {
    const lists = await Promise.all([...owners].map(async ([customer, child]) => (await provider.invoices(customer)).flatMap((invoice): FamilyInvoice[] => {
      // Proof for another customer says nothing about this one, and must never reach this parent.
      if (invoice.customer !== customer) throw new Error("An invoice names another customer");
      const facts = invoiceFacts(invoice);
      return facts ? [{ id: invoice.id, childId: child.childId, childName: child.firstName, at: iso(invoice.paidAt ?? invoice.created), currency: invoice.currency, receiptUrl: invoice.receiptUrl, ...facts }] : [];
    })));
    return { state: "loaded", invoices: lists.flat().sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id)) };
  } catch (e) {
    console.error("[billing] invoice read failed", e instanceof Error ? e.message : "failed");
    return { state: "unavailable" };
  }
}

/** Each child's plan and the family's invoices. A read that fails makes no claim: see the types above. */
export async function loadFamilyBilling(parentId: string, { store, provider, plans }: FamilyBillingSeams): Promise<FamilyBilling> {
  let children: BillingChild[];
  try {
    children = await store.family(parentId);
  } catch (e) {
    console.error("[billing] family read failed", e instanceof Error ? e.message : "failed");
    return { state: "unavailable" };
  }
  const [rows, invoices] = await Promise.all([
    Promise.all(children.map(async ({ childId, firstName, cardId, cardSaved }): Promise<ChildBilling> => {
      if (!cardSaved || !cardId) return { childId, firstName, cardId: null, plan: null };
      let plan = await fillChildPlan({ parentId, childId }, plans);
      if (store.adjustedPlan) {
        try { plan = await store.adjustedPlan(parentId, cardId, plan); }
        catch { plan = { kind: "unknown" }; }
      }
      const pending = store.pendingControl ? await store.pendingControl(parentId, cardId).catch(() => null) : null;
      return { childId, firstName, cardId, plan, ...(pending ? { pending } : {}) };
    })),
    familyInvoices(children, provider),
  ]);
  return { state: "loaded", plans: rows, invoices };
}

export type CardUpdateStart = { ok: true; url: string } | { ok: false; error: "not_found" | "failed" };

/** Stripe's page to save a new card for this parent's row. A row with no saved card is not this flow: that is the report's. */
export async function startCardUpdate(parentId: string, cardId: string, urls: { returnUrl: string; cancelUrl: string }, { store, provider }: CardUpdates): Promise<CardUpdateStart> {
  try {
    const card = await store.card(parentId, cardId);
    if (!card?.customer || !card.cardSaved) return { ok: false, error: "not_found" };
    const url = await provider.createCardUpdate({ ref: card.cardId, customer: card.customer, parentId, childId: card.childId, ...urls });
    return url ? { ok: true, url } : { ok: false, error: "failed" };
  } catch (e) {
    console.error("[billing] card update start failed", e instanceof Error ? e.message : "failed");
    return { ok: false, error: "failed" };
  }
}

/**
 * "updated": our own writes to Stripe answered, and this return's card is the row's newest.
 * "stale": this return changed nothing for this card, because this update or a newer one already took effect. It is not a failure.
 * "unconfirmed": a write's outcome is unknown. The card is recorded, and the sweep writes it.
 * "failed": nothing was recorded, or Stripe refused the card.
 */
export type CardUpdateFinish = "updated" | "stale" | "unconfirmed" | "incomplete" | "not_found" | "failed";

/**
 * The parent came back from Stripe's page. The session must name this parent's row and that row's customer before anything
 * is written. The row records this card when it is the child's newest, so a browser history entry or another tab cannot bring
 * an older card back. Then this return brings Stripe to the row's newest card, whichever return it is: an older address opened
 * again repairs a failed write of the newest card, and answers "stale". A later stray write is not this return's to catch: the
 * webhook or the sweep corrects it (card-reconcile.ts). The route's maxDuration is 60 seconds, and the writes keep inside it.
 */
export async function finishCardUpdate(parentId: string, sessionId: string, { store, provider }: CardUpdates): Promise<CardUpdateFinish> {
  let cardId: string;
  let customer: string;
  let first: { session: string | null; paymentMethod: string | null };
  const canWrite = writeWindow();
  try {
    const session = await provider.readCardUpdate(sessionId);
    if (!session) return "not_found";
    const card = await store.card(parentId, session.ref);
    if (!card?.customer || card.customer !== session.customer) return "not_found";
    if (!session.paymentMethod) return "incomplete";
    const recorded = await store.recordCard(card.cardId, { parentId, session: session.id, created: session.created, paymentMethod: session.paymentMethod });
    if (recorded.state === "no_match") return "not_found";
    if (!recorded.needsRepair) return "stale";
    cardId = card.cardId;
    customer = card.customer;
    first = recorded;
  } catch (e) {
    console.error("[billing] card update finish failed", e instanceof Error ? e.message : "failed");
    return "failed";
  }
  try {
    const done = await settleNewestCard(cardId, customer, first, { rows: store, stripe: provider, canWrite });
    if (done.failure) return done.failure instanceof CardWriteRefused ? "failed" : "unconfirmed";
    return done.session === sessionId ? "updated" : "stale";
  } catch (e) {
    // The writes may have worked, but the row cannot say that this card is the newest.
    console.error("[billing] card update not confirmed", e instanceof Error ? e.message : "failed");
    return "unconfirmed";
  }
}
