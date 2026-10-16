import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { findSavedCard, recordSavedCard } from "@/lib/saved-card";
import { memorySavedCards } from "@/lib/saved-card-memory";

// The Stripe side of the saved-card module (#66): which Checkout Session proves a saved card, and how the provider
// reads a customer's sessions. Stripe is the system boundary: a fake client answers the list and update calls.
vi.mock("server-only", () => ({}));
const { checkoutEvidence, stripeCardProvider } = await import("@/lib/saved-card-server");

const CREATED = 1792087200; // 2026-10-15T18:00:00Z
const ROW = { id: "card-a", stripe_customer_id: "cus_1" };

type Fake = Record<string, unknown>;
const session = (over: Fake = {}, intent: Fake = {}) => ({
  id: "cs_1", object: "checkout.session", mode: "setup", status: "complete", created: CREATED, customer: "cus_1",
  client_reference_id: "card-a", metadata: { ref: "card-a", plan: "one", price: "99", source: "report" },
  setup_intent: { id: "seti_1", status: "succeeded", customer: "cus_1", ...intent }, ...over,
}) as unknown as Stripe.Checkout.Session;

/** A Stripe client whose session list answers these pages in turn; every page after the last repeats it. */
function fakeStripe(pages: { data: Stripe.Checkout.Session[]; has_more?: boolean }[] | Error) {
  const list = vi.fn(async (params: Fake, options: Fake) => {
    void params; void options;
    if (pages instanceof Error) throw pages;
    const page = pages[Math.min(list.mock.calls.length - 1, pages.length - 1)];
    return { data: page.data, has_more: page.has_more ?? false };
  });
  const update = vi.fn(async () => ({}));
  return { client: { checkout: { sessions: { list } }, customers: { update } } as unknown as Stripe, list, update };
}

describe("a Checkout Session as proof of a saved card", () => {
  it("is a finished setup whose SetupIntent succeeded, on the plan and price of its metadata, at its start", () => {
    expect(checkoutEvidence(session())).toEqual({
      ref: "card-a", customer: "cus_1", savedFor: { plan: "one", price: 99 }, savedAt: "2026-10-15T18:00:00.000Z",
      metadata: { ref: "card-a", plan: "one", price: "99", source: "report" },
    });
  });

  it("takes the time it is given: the thank-you page passes the moment the parent came back", () => {
    expect(checkoutEvidence(session(), new Date("2026-10-15T18:07:00Z"))?.savedAt).toBe("2026-10-15T18:07:00.000Z");
  });

  it("is no proof while the session is open, or when its SetupIntent did not succeed", () => {
    expect(checkoutEvidence(session({ status: "open" }))).toBeNull();
    expect(checkoutEvidence(session({ status: "expired" }))).toBeNull();
    expect(checkoutEvidence(session({}, { status: "requires_payment_method" }))).toBeNull();
    expect(checkoutEvidence(session({ setup_intent: "seti_1" }))).toBeNull();
    expect(checkoutEvidence(session({ mode: "payment" }))).toBeNull();
  });

  it("is no proof when the ref does not match, or the SetupIntent is on another customer", () => {
    expect(checkoutEvidence(session({ client_reference_id: "card-b" }))).toBeNull();
    expect(checkoutEvidence(session({ metadata: {} }))).toBeNull();
    expect(checkoutEvidence(session({}, { customer: "cus_2" }))).toBeNull();
    expect(checkoutEvidence(session({ customer: null }))).toBeNull();
  });

  it("is proof with the session's customer when the SetupIntent names none", () => {
    expect(checkoutEvidence(session({}, { customer: null }))?.customer).toBe("cus_1");
  });

  it("has no plan when the metadata has no plan from the site, and the plan's price when the price is unreadable", () => {
    expect(checkoutEvidence(session({ metadata: { ref: "card-a", plan: "both", price: "229" } }))?.savedFor).toBeNull();
    expect(checkoutEvidence(session({ metadata: { ref: "card-a", plan: "one", price: "?" } }))?.savedFor).toEqual({ plan: "one", price: 99 });
  });
});

describe("Stripe as the card provider", () => {
  it("finds the first card across pages of the customer's sessions", async () => {
    const newer = session({ id: "cs_new", created: CREATED + 600 });
    const older = session({ id: "cs_old" });
    const stripe = fakeStripe([
      { data: [session({ id: "cs_open", status: "open", setup_intent: { status: "requires_payment_method" } }), newer], has_more: true },
      { data: [older] },
    ]);
    const answer = await findSavedCard(ROW, stripeCardProvider(stripe.client));
    expect(answer).toMatchObject({ state: "saved", evidence: { savedAt: "2026-10-15T18:00:00.000Z" } });
    expect(stripe.list).toHaveBeenCalledTimes(2);
    expect(stripe.list.mock.calls[0][0]).toEqual({ customer: "cus_1", limit: 100, expand: ["data.setup_intent"] });
    expect(stripe.list.mock.calls[1][0]).toMatchObject({ starting_after: "cs_new" });
  });

  it("finds no card when every setup is open or expired, and payment sessions do not count", async () => {
    const stripe = fakeStripe([{ data: [
      session({ status: "open", setup_intent: { status: "requires_payment_method" } }),
      session({ status: "expired", setup_intent: { status: "canceled" } }),
      session({ mode: "payment", setup_intent: null }),
    ] }]);
    expect(await findSavedCard(ROW, stripeCardProvider(stripe.client))).toEqual({ state: "absent" });
  });

  it("cannot tell when a finished setup on the customer is for another row, or a card is still being saved", async () => {
    const other = fakeStripe([{ data: [session({ client_reference_id: "card-z", metadata: { ref: "card-z", plan: "one", price: "99" } })] }]);
    expect(await findSavedCard(ROW, stripeCardProvider(other.client))).toEqual({ state: "unknown" });
    const saving = fakeStripe([{ data: [session({ status: "open" }, { status: "processing" })] }]);
    expect(await findSavedCard(ROW, stripeCardProvider(saving.client))).toEqual({ state: "unknown" });
  });

  it("finds the row's card even when the customer also has a setup that does not add up", async () => {
    const stripe = fakeStripe([{ data: [session({ id: "cs_odd", client_reference_id: "card-z" }), session()] }]);
    expect(await findSavedCard(ROW, stripeCardProvider(stripe.client))).toMatchObject({ state: "saved", evidence: { ref: "card-a" } });
  });

  it("cannot tell when Stripe fails, when there is no key, or when the pages do not end", async () => {
    expect(await findSavedCard(ROW, stripeCardProvider(fakeStripe(new Error("timeout")).client))).toEqual({ state: "unknown" });
    expect(await findSavedCard(ROW, stripeCardProvider(null))).toEqual({ state: "unknown" });
    const endless = fakeStripe([{ data: [session({ id: "cs_open", status: "open", setup_intent: { status: "requires_payment_method" } })], has_more: true }]);
    expect(await findSavedCard(ROW, stripeCardProvider(endless.client))).toEqual({ state: "unknown" });
    expect(endless.list).toHaveBeenCalledTimes(5);
  });

  it("moves the customer's plan to the saved card's when the site records it, and only then", async () => {
    const stripe = fakeStripe([]);
    const { store } = memorySavedCards({ rows: [{ id: "card-a", parentId: "p", childId: "c", reportId: "r", plan: "one", price: 139, stripe_customer_id: "cus_1", card_saved_at: null }] });
    const seams = { store, provider: stripeCardProvider(stripe.client) };
    const metadata = { ref: "card-a", plan: "one", price: "99", first_month_price: "69.30", subject: "Math", grade: "4", report_id: "r", assessment_id: "t", source: "report" };
    const evidence = checkoutEvidence(session({ metadata }))!;
    expect(await recordSavedCard(evidence, seams)).toEqual({ state: "saved", plan: "one" });
    expect(await recordSavedCard(evidence, seams)).toEqual({ state: "saved", plan: "one" });
    expect(stripe.update).toHaveBeenCalledTimes(1);
    expect(stripe.update.mock.calls[0]).toEqual(["cus_1", {
      description: expect.stringMatching(/^Math, grade 4, /),
      metadata: { plan: "one", price: "99", first_month_price: "69.30", subject: "Math", grade: "4", report_id: "r", assessment_id: "t" },
    }]);
  });
});
