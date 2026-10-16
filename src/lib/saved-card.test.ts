import { describe, expect, it } from "vitest";
import { checkCard, chooseCardPlan, findSavedCard, recordSavedCard, type CardEvidence } from "@/lib/saved-card";
import { memorySavedCards, type MemoryCardRow } from "@/lib/saved-card-memory";

// The saved-card module (#66) through its public interface, over the in-memory store and provider. Stripe is the
// record of a saved card; card_setups.card_saved_at is the site's copy. "unknown" must never open a payment page.

const KEY = { parentId: "parent-1", childId: "child-1" };
const CHOICE = { reportId: "report-2", plan: "one" as const, price: 99 };
const SAVED_AT = "2026-10-15T18:00:00.000Z";

const row = (over: Partial<MemoryCardRow> = {}): MemoryCardRow => ({
  id: "card-a", ...KEY, reportId: "report-1", plan: "one", price: 99, stripe_customer_id: "cus_1", card_saved_at: null, ...over,
});
const card = (over: Partial<CardEvidence> = {}): CardEvidence => ({
  ref: "card-a", customer: "cus_1", savedFor: { plan: "one", price: 99 }, savedAt: SAVED_AT,
  metadata: { ref: "card-a", plan: "one", price: "99" }, ...over,
});

describe("the report's check", () => {
  it("shows a stored saved card at once, without Stripe, even when Stripe is down", async () => {
    const cards = memorySavedCards({ rows: [row({ price: 139, card_saved_at: SAVED_AT })] });
    cards.fail.find = new Error("Stripe is down");
    expect(await checkCard(KEY, cards)).toEqual({ state: "saved", plan: "one" });
    expect(cards.calls.find).toBe(0);
  });

  it("finds a card saved without a return to the thank-you page, and records it on the plan it was saved for", async () => {
    const cards = memorySavedCards({ rows: [row({ price: 139 })], saved: [card()] });
    expect(await checkCard(KEY, cards)).toEqual({ state: "saved", plan: "one" });
    expect(cards.rows[0]).toMatchObject({ card_saved_at: SAVED_AT, plan: "one", price: 99 });
    expect(cards.customerPlans.get("cus_1")).toBe("one");
    // The next open reads the stored copy.
    expect(await checkCard(KEY, cards)).toEqual({ state: "saved", plan: "one" });
    expect(cards.calls.find).toBe(1);
  });

  it("says no card when Stripe read everything and found none, and changes nothing", async () => {
    const cards = memorySavedCards({ rows: [row()] });
    expect(await checkCard(KEY, cards)).toEqual({ state: "absent" });
    expect(cards.rows[0].card_saved_at).toBeNull();
    expect(cards.calls.keepPlan).toBe(0);
  });

  it("says no card without asking Stripe for a child with no row, or a row that never reached the payment page", async () => {
    expect(await checkCard(KEY, memorySavedCards())).toEqual({ state: "absent" });
    const cards = memorySavedCards({ rows: [row({ stripe_customer_id: null })] });
    expect(await checkCard(KEY, cards)).toEqual({ state: "absent" });
    expect(cards.calls.find).toBe(0);
  });

  it("does not show another family's row", async () => {
    const cards = memorySavedCards({ rows: [row({ card_saved_at: SAVED_AT })] });
    expect(await checkCard({ parentId: "parent-2", childId: "child-1" }, cards)).toEqual({ state: "absent" });
  });

  it("is unknown when Stripe cannot answer, and records nothing", async () => {
    const cards = memorySavedCards({ rows: [row()], saved: [card()] });
    cards.fail.find = new Error("Stripe timed out");
    expect(await checkCard(KEY, cards)).toEqual({ state: "unknown" });
    expect(cards.rows[0].card_saved_at).toBeNull();
  });

  it("is unknown when the customer has a finished card setup that does not match the row", async () => {
    const cards = memorySavedCards({ rows: [row()], saved: [card({ ref: "card-z" })] });
    expect(await checkCard(KEY, cards)).toEqual({ state: "unknown" });
    expect(cards.rows[0].card_saved_at).toBeNull();
  });

  it("is unknown when the row cannot be read", async () => {
    const cards = memorySavedCards({ rows: [row({ card_saved_at: SAVED_AT })] });
    cards.fail.load = new Error("database down");
    expect(await checkCard(KEY, cards)).toEqual({ state: "unknown" });
  });

  it("is unknown when the card found in Stripe cannot be recorded, and the next check tries again", async () => {
    const cards = memorySavedCards({ rows: [row()], saved: [card()] });
    cards.fail.record = new Error("write failed");
    expect(await checkCard(KEY, cards)).toEqual({ state: "unknown" });
    expect(cards.rows[0].card_saved_at).toBeNull();
    delete cards.fail.record;
    expect(await checkCard(KEY, cards)).toEqual({ state: "saved", plan: "one" });
    expect(cards.rows[0].card_saved_at).toBe(SAVED_AT);
  });
});

describe("recording a confirmed card", () => {
  it("keeps the first confirmation: a later one does not change the plan, price or time", async () => {
    const cards = memorySavedCards({ rows: [row()] });
    expect(await recordSavedCard(card(), cards)).toEqual({ state: "saved", plan: "one" });
    const later = card({ savedFor: { plan: "one", price: 139 }, savedAt: "2026-10-16T09:00:00.000Z", metadata: { ref: "card-a", plan: "one", price: "139" } });
    expect(await recordSavedCard(later, cards)).toEqual({ state: "saved", plan: "one" });
    expect(cards.rows[0]).toMatchObject({ card_saved_at: SAVED_AT, price: 99 });
    expect(cards.calls.keepPlan).toBe(1);
  });

  it("keeps the row's plan and price when the session has no plan from the site", async () => {
    const cards = memorySavedCards({ rows: [row({ price: 139 })] });
    expect(await recordSavedCard(card({ savedFor: null }), cards)).toEqual({ state: "saved", plan: "one" });
    expect(cards.rows[0]).toMatchObject({ card_saved_at: SAVED_AT, plan: "one", price: 139 });
  });

  it("is unknown when no row has the card's ref and customer, and changes no row", async () => {
    const cards = memorySavedCards({ rows: [row()] });
    expect(await recordSavedCard(card({ customer: "cus_other" }), cards)).toEqual({ state: "unknown" });
    expect(cards.rows[0].card_saved_at).toBeNull();
    expect(cards.calls.keepPlan).toBe(0);
  });

  it("still says saved when Stripe does not take the customer's plan", async () => {
    const cards = memorySavedCards({ rows: [row()] });
    cards.fail.keepPlan = new Error("Stripe is down");
    expect(await recordSavedCard(card(), cards)).toEqual({ state: "saved", plan: "one" });
    expect(cards.rows[0].card_saved_at).toBe(SAVED_AT);
  });

  it("records once when the thank-you page lands while the report's check is reading Stripe", async () => {
    const cards = memorySavedCards({ rows: [row()], saved: [card()] });
    const reading = cards.hold("find");
    const check = checkCard(KEY, cards);
    await reading.reached;
    const back = card({ savedAt: "2026-10-15T18:05:00.000Z" });
    expect(await recordSavedCard(back, cards)).toEqual({ state: "saved", plan: "one" });
    reading.release();
    expect(await check).toEqual({ state: "saved", plan: "one" });
    // The thank-you page wrote first, so its time stays; the customer's plan moved once.
    expect(cards.rows[0].card_saved_at).toBe("2026-10-15T18:05:00.000Z");
    expect(cards.calls.record).toBe(2);
    expect(cards.calls.keepPlan).toBe(1);
  });

  it("records once when two tabs check at the same moment", async () => {
    const cards = memorySavedCards({ rows: [row()], saved: [card()] });
    const answers = await Promise.all([checkCard(KEY, cards), checkCard(KEY, cards)]);
    expect(answers).toEqual([{ state: "saved", plan: "one" }, { state: "saved", plan: "one" }]);
    expect(cards.calls.find).toBe(2);
    expect(cards.calls.keepPlan).toBe(1);
  });
});

describe("a plan click", () => {
  it("adds the child's row with the choice on the first click", async () => {
    const cards = memorySavedCards();
    expect(await chooseCardPlan(KEY, CHOICE, cards)).toEqual({ state: "chosen", row: { id: "card-1", plan: "one", price: 99, stripe_customer_id: null, card_saved_at: null } });
    expect(cards.rows).toHaveLength(1);
  });

  it("puts a later choice on the same unsaved row, after Stripe finds no card", async () => {
    const cards = memorySavedCards({ rows: [row({ price: 139 })] });
    const chosen = await chooseCardPlan(KEY, CHOICE, cards);
    expect(chosen).toMatchObject({ state: "chosen", row: { id: "card-a", price: 99, stripe_customer_id: "cus_1" } });
    expect(cards.rows).toHaveLength(1);
    expect(cards.rows[0].reportId).toBe("report-2");
    expect(cards.calls.find).toBe(1);
  });

  it("keeps a stored saved card on its plan and price", async () => {
    const cards = memorySavedCards({ rows: [row({ price: 139, card_saved_at: SAVED_AT })] });
    expect(await chooseCardPlan(KEY, CHOICE, cards)).toEqual({ state: "saved", plan: "one" });
    expect(cards.rows[0].price).toBe(139);
    expect(cards.calls.choose).toBe(0);
  });

  it("records a card found in Stripe instead of opening a payment page", async () => {
    const cards = memorySavedCards({ rows: [row({ price: 139 })], saved: [card()] });
    expect(await chooseCardPlan(KEY, CHOICE, cards)).toEqual({ state: "saved", plan: "one" });
    expect(cards.rows[0]).toMatchObject({ card_saved_at: SAVED_AT, price: 99 });
    expect(cards.calls.choose).toBe(0);
  });

  it("opens no payment page when Stripe cannot answer, and leaves the row as it was", async () => {
    const cards = memorySavedCards({ rows: [row({ price: 139 })] });
    cards.fail.find = new Error("Stripe timed out");
    expect(await chooseCardPlan(KEY, CHOICE, cards)).toEqual({ state: "unknown" });
    expect(cards.rows[0]).toMatchObject({ price: 139, reportId: "report-1" });
    expect(cards.calls.choose).toBe(0);
  });

  it("loses to a confirmation that lands while it reads Stripe: the saved plan and price stay", async () => {
    const saved = card({ savedFor: { plan: "one", price: 139 }, metadata: { ref: "card-a", plan: "one", price: "139" } });
    const cards = memorySavedCards({ rows: [row({ price: 139 })] });
    const reading = cards.hold("find");
    const click = chooseCardPlan(KEY, CHOICE, cards);
    await reading.reached;
    // Stripe answered "no card" just before the parent finished saving one in another tab.
    cards.saved.push(saved);
    await recordSavedCard(saved, cards);
    reading.release();
    expect(await click).toEqual({ state: "saved", plan: "one" });
    expect(cards.rows[0]).toMatchObject({ card_saved_at: SAVED_AT, price: 139, reportId: "report-1" });
  });

  it("is failed when the choice cannot be written", async () => {
    const cards = memorySavedCards({ rows: [row()] });
    cards.fail.choose = new Error("write failed");
    expect(await chooseCardPlan(KEY, CHOICE, cards)).toEqual({ state: "failed" });
  });
});

describe("the admin's read", () => {
  it("reports what Stripe says and writes nothing", async () => {
    const cards = memorySavedCards({ rows: [row()], saved: [card()] });
    expect(await findSavedCard(cards.rows[0], cards.provider)).toEqual({ state: "saved", evidence: card() });
    expect(cards.rows[0].card_saved_at).toBeNull();
    expect(cards.calls.record + cards.calls.keepPlan).toBe(0);
  });

  it("is unknown for proof of another row", async () => {
    const provider = { find: async () => card({ ref: "card-z" }), keepPlan: async () => {} };
    expect(await findSavedCard(row(), provider)).toEqual({ state: "unknown" });
  });
});
