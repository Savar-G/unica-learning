import { referralCode, type ReferralError, type ReferralOverview, type ReferralResult } from "@/lib/referral-contract";

export const REFERRAL_RISKS = ["clear", "hold", "revoke"] as const;
export const REFERRAL_OPERATION_STATES = ["reserved", "applied", "used", "absent"] as const;
export const REFERRAL_REWARD_KINDS = ["incoming", "earned"] as const;
export const REFERRAL_EMAIL_STATES = ["sending", "sent", "unknown"] as const;

/** Financial state belongs to the store. Every command is atomic, including two-family admissions. */
export interface ReferralCommand {
  action: "deletion_history" | "child_operations" | "attempt" | "tried" | "overview" | "apply" | "history" | "paid" | "risk" | "reserve" | "finish" | "start" | "start_result" | "due" | "checked" | "preview" | "correct" | "email_claim" | "email_result" | "email_admit" | "email_copy";
  parent?: string; code?: string; customer?: string; child?: string | null; invoice?: string; subscription?: string;
  key?: string; coupon?: string; product?: string; cents?: number; paidAt?: number; readOrder?: number;
  risk?: "clear" | "hold" | "revoke"; children?: string[]; customers?: string[]; paid?: boolean; complete?: boolean;
  operation?: string; result?: "applied" | "used" | "absent" | "refused" | "detached";
  actor?: string; reason?: string; preview?: string; reward?: string; token?: string;
  emailState?: "sent" | "refused" | "unknown"; emailId?: string; copy?: unknown;
  recipient?: string;
  limit?: number; now?: number;
}
export interface ReferralReservation {
  id: string; key: string; parent: string; child: string; customer: string;
  invoice: string | null; subscription: string | null; coupon: string; product: string; cents: number;
  qualification?: string | null;
  allowed: boolean;
  policy: "clear" | "hold" | "revoke";
  state: "reserved" | "applied" | "used" | "absent"; startKey: string | null; createdAt: number;
}
export interface ReferralOwner { parent: string; child: string | null; customer: string }
export interface ReferralEmail { reward: string; parent: string; email: string }
export interface ReferralDue {
  riskInvoices?: string[]; customers: ReferralOwner[]; reservations: ReferralReservation[]; emails: ReferralEmail[];
}
export interface ReferralReply {
  ok: boolean; error?: "invalid" | "self_referral" | "already_paid" | "already_applied" | "unavailable" | "family_unavailable" | "rate_limited" | "email_pending";
  overview?: ReferralOverview; reservation?: ReferralReservation | null; due?: ReferralDue;
  preview?: { token: string; before: string | null; after: string; used: number; unused: number; paid: boolean };
  financial?: { needed: boolean; customers: string[] };
  token?: string | null; admitted?: boolean;
}
export interface ReferralStore {
  command(command: ReferralCommand): Promise<ReferralReply>;
  owner(customer: string): Promise<ReferralOwner | null>;
  customers(parent: string): Promise<string[]>;
  readOrder(): Promise<number>;
}
function parentError(reply: ReferralReply): ReferralError {
  return reply.error === "email_pending" ? "unavailable" : reply.error ?? "unavailable";
}
export interface ReferralInvoice {
  id: string; customer: string; subscription: string | null; startKey?: string | null; child?: string;
  status: "draft" | "open" | "paid" | "void" | "uncollectible";
  cents: number; paidCents: number; paidAt: number | null;
  /** Only provider-confirmed successful card payment, never a zero/manual/out-of-band payment. */
  actualPayment: boolean; modeMatches: boolean; program: boolean; monthly: boolean; renewal: boolean;
  risk: "clear" | "hold" | "revoke"; couponIds: string[]; otherDiscount: boolean;
}
export interface ReferralProvider {
  familyCustomers?(parent: string): Promise<string[]>;
  retire?(reservation: ReferralReservation): Promise<"used" | "absent" | "pending">;
  enrolled?(customer: string): Promise<boolean>;
  startAllowed?(customer: string): Promise<boolean>;
  /** A finalized invoice has already committed its discount. Preserve its receivable and track payment. */
  withdraw?(invoice: ReferralInvoice, reservation: ReferralReservation): Promise<"committed" | void>;
  invoices(customer: string): Promise<ReferralInvoice[]>;
  invoice(id: string): Promise<ReferralInvoice>;
  coupon(): Promise<{ id: string; product: string }>;
  apply(invoice: ReferralInvoice, reservation: ReferralReservation): Promise<void>;
  startResult(reservation: ReferralReservation): Promise<{ invoice: ReferralInvoice | null; absent: boolean }>;
}
export interface Referrals { store: ReferralStore; provider: ReferralProvider }

function accepted(reply: ReferralReply): ReferralReply {
  if (!reply.ok) throw new Error(`Referral command refused: ${reply.error ?? "unavailable"}`);
  return reply;
}

/** All pages must complete before eligibility can change. Failures retain unknown history. */
export async function refreshReferralHistory(parent: string, { store, provider }: Referrals): Promise<void> {
  const historyOrder = await store.readOrder();
  const current = await store.customers(parent);
  const customers = [...new Set([...current, ...await (provider.familyCustomers?.(parent) ?? Promise.resolve([]))])].sort();
  const invoices: ReferralInvoice[] = [];
  for (const customer of customers) invoices.push(...await provider.invoices(customer));
  let paid = false;
  for (const invoice of invoices) {
    // Any nonzero paid invoice makes a family ineligible, including out-of-band and legacy products.
    if (invoice.modeMatches && invoice.status === "paid" && invoice.paidCents > 0) paid = true;
    if (!invoice.modeMatches) throw new Error("Referral provider mode mismatch");
  }
  accepted(await store.command({ action: "history", parent, customers, paid, complete: true }));
  // Record the lifetime receipt before child deletion can remove its card setup.
  for (const invoice of invoices.filter(i => i.status === "paid").sort((a, b) => (a.paidAt ?? 0) - (b.paidAt ?? 0))) {
    await recordReferralInvoice(invoice, { store, provider }, historyOrder);
  }
}

export async function referralOverview(parent: string, services: Referrals, origin: string): Promise<ReferralResult> {
  try {
    await refreshReferralHistory(parent, services);
    const reply = await services.store.command({ action: "overview", parent });
    if (!reply.ok || !reply.overview) return { ok: false, error: parentError(reply) };
    return { ok: true, overview: { ...reply.overview, shareUrl: new URL(`/start?referral=${reply.overview.code}`, origin).href } };
  } catch { return { ok: false, error: "unavailable" }; }
}

export async function applyReferral(parent: string, input: unknown, services: Referrals, origin: string): Promise<ReferralResult> {
  const code = referralCode(input);
  try {
    const attempt = await services.store.command({ action: "attempt", parent });
    if (!attempt.ok) return { ok: false, error: parentError(attempt) };
    // Count invalid attempts too. The atomic admission below also checks history and payment reservations.
    if (!code) {
      return { ok: false, error: "invalid" };
    }
    await refreshReferralHistory(parent, services);
    const result = await services.store.command({ action: "apply", parent, code });
    if (!result.ok) return { ok: false, error: parentError(result) };
    return referralOverview(parent, services, origin);
  } catch { return { ok: false, error: "unavailable" }; }
}

/** Events are hints. The current invoice and current risk state determine every write. */
export async function recordReferralInvoice(invoice: ReferralInvoice, { store }: Referrals, order?: number): Promise<void> {
  if (!invoice.modeMatches) throw new Error("Referral provider mode mismatch");
  const owner = await store.owner(invoice.customer);
  const readOrder = order ?? await store.readOrder();
  // Bind a definitive unused creation directly as absent. A renewal never owns its subscription's creation key.
  const release = invoice.status === "void" || (invoice.status === "paid" && (invoice.paidCents === 0 || !invoice.couponIds.length));
  if (owner && invoice.startKey && !invoice.renewal && (invoice.couponIds.length || release)) accepted(await store.command({ action: "start_result", ...owner, key: invoice.startKey, invoice: invoice.id, subscription: invoice.subscription ?? "", result: release ? "absent" : "applied" }));
  if (invoice.status === "void" || (invoice.status === "paid" && invoice.paidCents === 0)) {
    accepted(await store.command({ action: "finish", invoice: invoice.id, result: "absent" }));
    return;
  }
  if (!owner) {
    accepted(await store.command({ action: "risk", invoice: invoice.id, risk: invoice.risk, readOrder }));
    return;
  }
  if (invoice.status === "paid" && invoice.paidCents > 0) {
    accepted(await store.command({ action: "paid", ...owner, invoice: invoice.id, subscription: invoice.subscription ?? "", cents: invoice.paidCents, risk: invoice.risk,
      paidAt: invoice.paidAt ?? 0, paid: invoice.actualPayment && invoice.program && invoice.monthly && !!invoice.subscription, readOrder }));
  }
  accepted(await store.command({ action: "risk", ...owner, invoice: invoice.id, risk: invoice.risk, readOrder }));
  if (invoice.status === "paid" && invoice.paidCents > 0 && invoice.couponIds.length) {
    accepted(await store.command({ action: "finish", ...owner, invoice: invoice.id, coupon: invoice.couponIds[0], result: "used" }));
  } else if (invoice.status === "paid" && invoice.paidCents > 0) {
    // Payment without our coupon is decisive. A pending coupon write can no longer change this invoice.
    accepted(await store.command({ action: "finish", ...owner, invoice: invoice.id, result: "absent" }));
  }
}



async function currentReservation(reservation: ReferralReservation, services: Referrals): Promise<ReferralReservation> {
  if (reservation.qualification) {
    const readOrder = await services.store.readOrder();
    const source = await services.provider.invoice(reservation.qualification);
    if (!source.modeMatches) throw new Error("Referral qualification mode mismatch");
    accepted(await services.store.command({ action: "risk", invoice: source.id, risk: source.risk, readOrder }));
    const reply = accepted(await services.store.command({ action: reservation.startKey ? "start" : "reserve", parent: reservation.parent, child: reservation.child,
      customer: reservation.customer, invoice: reservation.invoice ?? undefined, key: reservation.startKey ?? undefined,
      subscription: reservation.subscription ?? undefined, cents: reservation.cents, coupon: reservation.coupon, product: reservation.product }));
    if (!reply.reservation) throw new Error("Referral reservation disappeared");
    return reply.reservation;
  }
  return reservation;
}

async function enrolledReferralChildren(parent: string, services: Referrals): Promise<string[]> {
  if (!services.provider.enrolled) return [];
  const children: string[] = [];
  for (const customer of await services.store.customers(parent)) {
    const owner = await services.store.owner(customer);
    if (owner?.parent === parent && owner.child && await services.provider.enrolled(customer)) children.push(owner.child);
  }
  return children;
}

export async function reconcileReferralInvoice(id: string, services: Referrals): Promise<void> {
  const order = await services.store.readOrder();
  const invoice = await services.provider.invoice(id);
  if (!invoice.modeMatches) throw new Error("Referral provider mode mismatch");
  const ownerForHistory = invoice.status === "paid" && invoice.paidCents > 0 ? await services.store.owner(invoice.customer) : null;
  if (ownerForHistory) await refreshReferralHistory(ownerForHistory.parent, services);
  else await recordReferralInvoice(invoice, services, order);
  if (!["draft", "open", "uncollectible"].includes(invoice.status) || invoice.cents <= 0 || !invoice.program || !invoice.monthly || !invoice.renewal || !invoice.subscription) return;
  const owner = await services.store.owner(invoice.customer);
  if (!owner) return;
  // Never replace or combine unrelated discounts. An already attached referral is reconciled below.

  const children = await enrolledReferralChildren(owner.parent, services);
  const coupon = await services.provider.coupon();
  const reply = accepted(await services.store.command({ action: "reserve", ...owner, invoice: invoice.id, subscription: invoice.subscription,
    children, paid: invoice.status === "draft" && !invoice.otherDiscount, cents: invoice.cents, coupon: coupon.id, product: coupon.product }));
  let reservation = reply.reservation;
  if (!reservation || reservation.state === "used" || reservation.state === "absent") return;
  // The provider call uses only frozen reservation fields. A lost response retains the same reservation and key.
  reservation = await currentReservation(reservation, services);
  if (!reservation.allowed) {
    if (!services.provider.withdraw) throw new Error("Referral withdrawal unavailable");
    const result = await services.provider.withdraw(invoice, reservation);
    accepted(await services.store.command({ action: "finish", operation: reservation.id, result: result === "committed" ? "applied" : "detached" }));
    return;
  }
  await services.provider.apply(invoice, reservation);
  accepted(await services.store.command({ action: "finish", operation: reservation.id, result: "applied" }));
}

export interface StartReferral {
  reserve(input: { card: string; customer: string; key: string; cents: number }): Promise<ReferralReservation | null>;
  refused(reservation: ReferralReservation): Promise<void>;
}
export function referralStarts(services: Referrals): StartReferral {
  return {
    async reserve(input) {
      const owner = await services.store.owner(input.customer);
      if (!owner?.child) throw new Error("Referral start owner missing");
      const old = accepted(await services.store.command({ action: "child_operations", ...owner })).due;
      if (!old) throw new Error("Referral child operations unreadable");
      for (const operation of old.reservations) {
        if (operation.startKey === input.key) continue;
        if (!services.provider.retire) throw new Error("Referral previous invoice needs recovery");
        const result = await services.provider.retire(operation);
        if (result === "pending") throw new Error("Referral previous invoice is uncertain");
        accepted(await services.store.command({ action: "finish", operation: operation.id, result }));
      }
      const children = await enrolledReferralChildren(owner.parent, services);
      const allowed = await (services.provider.startAllowed?.(input.customer) ?? Promise.resolve(true));
      const coupon = await services.provider.coupon();
      const reply = accepted(await services.store.command({ action: "start", ...owner, key: input.key, children, paid: allowed, cents: input.cents, coupon: coupon.id, product: coupon.product }));
      return reply.reservation ? currentReservation(reply.reservation, services) : null;
    },
    async refused(reservation) { accepted(await services.store.command({ action: "start_result", operation: reservation.id, result: "refused" })); },
  };
}

/** Bounded candidates, complete provider pages per customer. Deferred work stays due. */
export async function recoverReferrals(services: Referrals, inTime: () => boolean): Promise<{ checked: number; failed: number }> {
  const due = accepted(await services.store.command({ action: "due", limit: 8 })).due;
  if (!due) throw new Error("Referral recovery read failed");
  let checked = 0, failed = 0;
  for (const id of due.riskInvoices ?? []) {
    if (!inTime()) break;
    try {
      const readOrder = await services.store.readOrder();
      const invoice = await services.provider.invoice(id);
      if (!invoice.modeMatches) throw new Error("Referral risk mode mismatch");
      accepted(await services.store.command({ action: "risk", invoice: id, risk: invoice.risk, readOrder })); checked++;
    } catch { failed++; }
  }
  for (const reservation of due.reservations) {
    if (!inTime()) break;
    try {
      if (reservation.invoice) await reconcileReferralInvoice(reservation.invoice, services);
      else {
        const result = await services.provider.startResult(reservation);
        if (result.invoice) {
          accepted(await services.store.command({ action: "start_result", operation: reservation.id, invoice: result.invoice.id, subscription: result.invoice.subscription ?? "", result: "applied" }));
          await recordReferralInvoice(result.invoice, services);
        }
        // Absence after a timeout is never proof of refusal. No automatic release.
      }
      checked++;
    } catch { failed++; }
  }
  for (const owner of due.customers) {
    if (!inTime()) break;
    try {
      accepted(await services.store.command({ action: "overview", parent: owner.parent }));
      accepted(await services.store.command({ action: "tried", customer: owner.customer }));
      const invoices = await services.provider.invoices(owner.customer);
      for (const invoice of invoices) {
        if (!inTime()) throw new Error("Referral recovery time limit");
        await reconcileReferralInvoice(invoice.id, services);
      }
      accepted(await services.store.command({ action: "checked", customer: owner.customer }));
      checked++;
    } catch { failed++; }
  }
  return { checked, failed };
}
