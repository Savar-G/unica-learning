import type { PlanId } from "@/lib/site";

// Saved cards from the report (#66). Stripe is the record of a saved card; card_setups.card_saved_at is the site's copy
// of it. Once the copy is written it stays: a later confirmation never changes its plan, price or time, and a Stripe
// outage cannot hide it. Without the copy, the site asks Stripe, and a read that cannot finish is "unknown", never "no
// card": an unknown answer must not open a second payment page. The store (card_setups) and the provider (Stripe) are
// the seams: saved-card-server.ts holds Supabase and Stripe, saved-card-memory.ts holds both in memory for tests.

/** One child's row of public.card_setups. */
export interface CardRecord {
  id: string;
  plan: PlanId;
  price: number;
  stripe_customer_id: string | null;
  card_saved_at: string | null;
}

/** Stripe's proof of a saved card: a finished setup Checkout Session whose SetupIntent succeeded. */
export interface CardEvidence {
  /** card_setups.id, from the session's metadata. */
  ref: string;
  customer: string;
  /** The plan and price the card was saved for, or null when the session's metadata has no plan from the site. */
  savedFor: { plan: PlanId; price: number } | null;
  /** ISO time. */
  savedAt: string;
  /** The session's metadata: the customer's plan in Stripe follows it. */
  metadata: Record<string, string>;
}

/** What the site can tell a parent: a card saved on this plan, no saved card, or that it could not tell. */
export type CardCheck = { state: "saved"; plan: PlanId } | { state: "absent" } | { state: "unknown" };

/** A plan click: a saved card, an unknown answer, a write that failed, or the unsaved row with this choice on it. */
export type CardStart = CardCheck | { state: "failed" } | { state: "chosen"; row: CardRecord };

/** What Stripe says about one row. */
export type StripeAnswer = { state: "saved"; evidence: CardEvidence } | { state: "absent" } | { state: "unknown" };

/** A child's row, for the parent signed in: every read and write is filtered by both. */
export interface CardKey {
  parentId: string;
  childId: string;
}

/** A plan chosen on a report. */
export interface CardChoice {
  reportId: string;
  plan: PlanId;
  price: number;
}

export interface CardStore {
  /** The child's row, or null when there is none. Throws when the read fails. */
  load(key: CardKey): Promise<CardRecord | null>;
  /**
   * Adds the child's row with this choice, or puts the choice on the unsaved row. A saved row stays as it is. Returns
   * the row after the write. Throws when the write fails.
   */
  choose(key: CardKey, choice: CardChoice): Promise<CardRecord>;
  /**
   * In one statement: marks the unsaved row with the evidence's ref and customer saved, at its time and on its plan
   * when it has one. Returns that row after the write and whether this call marked it, or null when no row has that
   * ref and customer. Throws when the write fails.
   */
  record(evidence: CardEvidence): Promise<{ row: CardRecord; recorded: boolean } | null>;
}

export interface CardProvider {
  /**
   * The first card saved for this row (its ref, on its customer), or null when a complete read finds none. Throws
   * when it cannot tell: a failed or unfinished read, or a finished setup that it cannot match to the row.
   */
  find(row: { id: string; customer: string }): Promise<CardEvidence | null>;
  /** The customer's plan in Stripe follows the card it saved, for the charge when the first workbook ships. */
  keepPlan(evidence: CardEvidence): Promise<void>;
}

export interface SavedCards {
  store: CardStore;
  provider: CardProvider;
}

/** What Stripe says about a row. Read only (the admin dashboard): nothing is written. */
export async function findSavedCard(row: { id: string; stripe_customer_id: string | null }, provider: CardProvider): Promise<StripeAnswer> {
  // A row without a customer never reached the payment page.
  if (!row.stripe_customer_id) return { state: "absent" };
  try {
    const evidence = await provider.find({ id: row.id, customer: row.stripe_customer_id });
    if (!evidence) return { state: "absent" };
    // Proof for another row or customer says nothing about this one.
    return evidence.ref === row.id && evidence.customer === row.stripe_customer_id ? { state: "saved", evidence } : { state: "unknown" };
  } catch {
    return { state: "unknown" };
  }
}

/** The report's check: the stored copy when there is one, else Stripe. A card found in Stripe is recorded. */
export async function checkCard(key: CardKey, cards: SavedCards): Promise<CardCheck> {
  let row: CardRecord | null;
  try {
    row = await cards.store.load(key);
  } catch {
    return { state: "unknown" };
  }
  if (!row) return { state: "absent" };
  if (row.card_saved_at) return { state: "saved", plan: row.plan };
  const answer = await findSavedCard(row, cards.provider);
  return answer.state === "saved" ? recordSavedCard(answer.evidence, cards) : answer;
}

/**
 * Stripe confirmed a card: the thank-you page, or a check that found it. The first record wins, and only that one
 * moves the customer's plan in Stripe. A record that cannot be written or read back is unknown.
 */
export async function recordSavedCard(evidence: CardEvidence, cards: SavedCards): Promise<CardCheck> {
  let result: Awaited<ReturnType<CardStore["record"]>>;
  try {
    result = await cards.store.record(evidence);
  } catch {
    return { state: "unknown" };
  }
  if (!result?.row.card_saved_at) return { state: "unknown" };
  // The card is saved either way; a customer that keeps an old plan is for Savar to fix by hand.
  if (result.recorded) await cards.provider.keepPlan(evidence).catch(() => {});
  return { state: "saved", plan: result.row.plan };
}

/**
 * A plan click. A saved card keeps its plan, and an unknown answer opens no payment page. Otherwise the choice goes on
 * the child's unsaved row; a confirmation that lands before that write wins over the click.
 */
export async function chooseCardPlan(key: CardKey, choice: CardChoice, cards: SavedCards): Promise<CardStart> {
  const checked = await checkCard(key, cards);
  if (checked.state !== "absent") return checked;
  let row: CardRecord;
  try {
    row = await cards.store.choose(key, choice);
  } catch {
    return { state: "failed" };
  }
  return row.card_saved_at ? { state: "saved", plan: row.plan } : { state: "chosen", row };
}
