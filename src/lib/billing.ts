import type { ParentPlan } from "@/lib/parent-plan";
import { fillChildPlan, type PlanStates } from "@/lib/plan-state";

// The family's billing on the Account tab (#554, spec #544). Stripe holds one Customer per child, so one Customer Portal
// session cannot show a family's invoices: this list is ours.
//
// Plans come from the stored rows (plan-state.ts), and a load of Account fills a missing row. Invoices load live, here and
// nowhere else. Every read starts from the signed-in parent's id, so a parent reaches only their own customers, and no
// customer id reaches the page. A list is whole or it is not shown: a part of it would read as all of it.
//
// The card update is Stripe's hosted page: Checkout in setup mode, then the new card becomes the default of the plan that
// can still charge. Cancel stays in the current flow (D-222). The store (card_setups) and the provider (Stripe) are the
// seams: billing-server.ts holds Supabase and Stripe, billing-memory.ts holds both in memory for tests.

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

export interface BillingStore {
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

/** A Checkout Session this module made. `paymentMethod` is set only once Stripe has saved the card. */
export interface CardUpdateSession {
  id: string;
  ref: string;
  customer: string;
  paymentMethod: string | null;
}

export interface BillingProvider {
  /** All of one customer's invoices. Throws when it cannot read the whole list. */
  invoices(customer: string): Promise<ProviderInvoice[]>;
  /** Stripe's hosted page to save a new card, or null when Stripe gives no page. Throws when Stripe fails. */
  createCardUpdate(request: CardUpdateRequest): Promise<string | null>;
  /** The session, or null when there is no such card update session. Throws when Stripe fails. */
  readCardUpdate(id: string): Promise<CardUpdateSession | null>;
  /** The card becomes the default of each of the customer's subscriptions that can still charge. Throws when Stripe fails. */
  setCardDefault(customer: string, paymentMethod: string): Promise<void>;
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
}

export type FamilyBilling = { state: "loaded"; plans: ChildBilling[]; invoices: InvoiceList } | { state: "unavailable" };

/** Only a plan that can still charge the card, or one that has not started, has a card worth updating. */
export const canUpdateCard = (plan: ParentPlan) => plan.kind === "not_started" || plan.kind === "free_month" || plan.kind === "paying" || plan.kind === "payment_failed";

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
    Promise.all(children.map(async ({ childId, firstName, cardId, cardSaved }): Promise<ChildBilling> => (
      cardSaved && cardId
        ? { childId, firstName, cardId, plan: await fillChildPlan({ parentId, childId }, plans) }
        : { childId, firstName, cardId: null, plan: null }
    ))),
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

export type CardUpdateFinish = "updated" | "incomplete" | "not_found" | "failed";

/**
 * The parent came back from Stripe's page. The session must name this parent's row and that row's customer before anything
 * is written. Safe to run twice: the same card becomes the default again.
 */
export async function finishCardUpdate(parentId: string, sessionId: string, { store, provider }: CardUpdates): Promise<CardUpdateFinish> {
  try {
    const session = await provider.readCardUpdate(sessionId);
    if (!session) return "not_found";
    const card = await store.card(parentId, session.ref);
    if (!card?.customer || card.customer !== session.customer) return "not_found";
    if (!session.paymentMethod) return "incomplete";
    await provider.setCardDefault(card.customer, session.paymentMethod);
    return "updated";
  } catch (e) {
    console.error("[billing] card update finish failed", e instanceof Error ? e.message : "failed");
    return "failed";
  }
}
