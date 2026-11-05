import { beforeEach, describe, expect, it, vi } from "vitest";
import { canUpdateCard, finishCardUpdate, loadFamilyBilling, startCardUpdate, type ProviderInvoice } from "@/lib/billing";
import { memoryBilling, type MemoryBillingChild } from "@/lib/billing-memory";
import type { PlanOwner } from "@/lib/plan-state";
import { memoryPlanStates } from "@/lib/plan-state-memory";
import { startPlan } from "@/lib/stripe";

vi.mock("server-only", () => ({}));

const leah: MemoryBillingChild = { parentId: "p1", childId: "c1", firstName: "Leah", card: { id: "card-1", customer: "cus_1", saved: true } };
const omar: MemoryBillingChild = { parentId: "p1", childId: "c2", firstName: "Omar", card: { id: "card-2", customer: "cus_2", saved: true } };
const other: MemoryBillingChild = { parentId: "p2", childId: "c9", firstName: "Sam", card: { id: "card-9", customer: "cus_9", saved: true } };
const owner = (c: MemoryBillingChild): PlanOwner => ({ parentId: c.parentId, childId: c.childId, customer: c.card!.customer!, cardSaved: c.card!.saved });

const invoice = (over: Partial<ProviderInvoice> = {}): ProviderInvoice => ({
  id: "in_1", customer: "cus_1", status: "paid", created: 1_800_000_000, paidAt: 1_800_000_100, amountPaid: 7999, amountDue: 7999, total: 7999, currency: "cad", receiptUrl: "https://invoice.stripe.com/i/1", ...over,
});
const running = (monthlyCents = 7999) => ({ status: "active", cancelAtPeriodEnd: false, trialEnd: null, periodEnd: 1_800_000_000, cents: monthlyCents, created: 1 });

function seams(children: MemoryBillingChild[], { invoices = {}, plans = {} }: { invoices?: Record<string, ProviderInvoice[]>; plans?: Parameters<typeof memoryPlanStates>[0]["subscriptions"] } = {}) {
  const billing = memoryBilling({ children, invoices });
  const planStates = memoryPlanStates({ cards: children.filter((c) => c.card?.customer).map(owner), subscriptions: plans });
  return { billing, planStates, all: { store: billing.store, provider: billing.provider, plans: planStates } };
}

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("the family's invoices", () => {
  it("lists invoices across every customer of the family, newest first, with the child's name and the receipt link", async () => {
    const { all } = seams([leah, omar], { invoices: {
      cus_1: [invoice({ id: "in_old", paidAt: 1_700_000_000 })],
      cus_2: [invoice({ id: "in_new", customer: "cus_2", paidAt: 1_800_000_000, receiptUrl: "https://invoice.stripe.com/i/2" })],
    } });
    const out = await loadFamilyBilling("p1", all);
    expect(out.state === "loaded" && out.invoices).toEqual({ state: "loaded", invoices: [
      { id: "in_new", childId: "c2", childName: "Omar", at: new Date(1_800_000_000_000).toISOString(), cents: 7999, currency: "cad", status: "paid", receiptUrl: "https://invoice.stripe.com/i/2" },
      { id: "in_old", childId: "c1", childName: "Leah", at: new Date(1_700_000_000_000).toISOString(), cents: 7999, currency: "cad", status: "paid", receiptUrl: "https://invoice.stripe.com/i/1" },
    ] });
  });

  it("reads a customer whose card setup never finished, because the family's list must be whole", async () => {
    const { all, billing } = seams([{ ...leah, card: { id: "card-1", customer: "cus_1", saved: false } }], { invoices: { cus_1: [invoice()] } });
    const out = await loadFamilyBilling("p1", all);
    expect(billing.calls.invoices).toBe(1);
    expect(out.state === "loaded" && out.invoices.state === "loaded" && out.invoices.invoices.map((i) => i.id)).toEqual(["in_1"]);
  });

  it("never reads or shows another family's customer", async () => {
    const { all, billing } = seams([leah, other], { invoices: { cus_1: [invoice()], cus_9: [invoice({ id: "in_other", customer: "cus_9" })] } });
    const out = await loadFamilyBilling("p1", all);
    expect(billing.calls.invoices).toBe(1);
    expect(JSON.stringify(out)).not.toContain("in_other");
    expect(JSON.stringify(out)).not.toContain("Sam");
  });

  it("shows nothing when Stripe hands back an invoice of another customer", async () => {
    const { all } = seams([leah], { invoices: { cus_1: [invoice(), invoice({ id: "in_other", customer: "cus_9" })] } });
    const out = await loadFamilyBilling("p1", all);
    expect(out.state === "loaded" && out.invoices).toEqual({ state: "unavailable" });
  });

  it("gives no customer id to the page", async () => {
    const { all } = seams([leah], { invoices: { cus_1: [invoice()] }, plans: { cus_1: [running()] } });
    expect(JSON.stringify(await loadFamilyBilling("p1", all))).not.toContain("cus_1");
  });

  it("says a read of no invoices only when every customer answered", async () => {
    const { all } = seams([leah, omar]);
    const out = await loadFamilyBilling("p1", all);
    expect(out.state === "loaded" && out.invoices).toEqual({ state: "loaded", invoices: [] });
  });

  it("shows no part of the list when one customer's read fails", async () => {
    const { all, billing } = seams([leah, omar], { invoices: { cus_1: [invoice()] } });
    billing.failInvoicesOf.add("cus_2");
    const out = await loadFamilyBilling("p1", all);
    expect(out.state === "loaded" && out.invoices).toEqual({ state: "unavailable" });
  });

  it("keeps a draft out, and names each other state plainly", async () => {
    const { all } = seams([leah], { invoices: { cus_1: [
      invoice({ id: "in_draft", status: "draft" }),
      invoice({ id: "in_none", status: null }),
      invoice({ id: "in_free", amountPaid: 0, amountDue: 0, total: 0, created: 5, paidAt: 5 }),
      invoice({ id: "in_due", status: "open", amountPaid: 0, amountDue: 7999, created: 4, paidAt: null }),
      invoice({ id: "in_lost", status: "uncollectible", amountPaid: 0, amountDue: 7999, created: 3, paidAt: null }),
      invoice({ id: "in_void", status: "void", amountPaid: 0, amountDue: 0, total: 7999, created: 2, paidAt: null }),
    ] } });
    const out = await loadFamilyBilling("p1", all);
    const rows = out.state === "loaded" && out.invoices.state === "loaded" ? out.invoices.invoices : [];
    expect(rows.map((r) => [r.id, r.status, r.cents])).toEqual([
      ["in_free", "no_charge", 0], ["in_due", "due", 7999], ["in_lost", "not_paid", 7999], ["in_void", "cancelled", 7999],
    ]);
  });
});

describe("each child's plan", () => {
  it("reads the stored row and asks Stripe nothing", async () => {
    const { all, planStates } = seams([leah], { plans: { cus_1: [running()] } });
    await loadFamilyBilling("p1", all);
    expect(planStates.calls.plan).toBe(1);
    await loadFamilyBilling("p1", all);
    expect(planStates.calls.plan).toBe(1);
  });

  it("fills a missing row on a load of Account, with its next charge", async () => {
    const { all, planStates } = seams([leah], { plans: { cus_1: [running()] } });
    const out = await loadFamilyBilling("p1", all);
    expect(planStates.rows).toHaveLength(1);
    expect(out.state === "loaded" && out.plans).toEqual([{ childId: "c1", firstName: "Leah", cardId: "card-1", plan: { kind: "paying", nextCharge: new Date(1_800_000_000_000).toISOString(), monthly: 79.99 } }]);
  });

  it("has no plan for a child with no saved card, and asks Stripe nothing about it", async () => {
    const { all, planStates } = seams([{ ...leah, card: null }, { ...omar, card: { id: "card-2", customer: "cus_2", saved: false } }]);
    const out = await loadFamilyBilling("p1", all);
    expect(planStates.calls.plan).toBe(0);
    expect(out.state === "loaded" && out.plans.map((p) => p.plan)).toEqual([null, null]);
  });

  it("is unknown when Stripe does not answer, and the invoices still have their own answer", async () => {
    const { all, planStates } = seams([leah], { invoices: { cus_1: [invoice()] } });
    planStates.fail.plan = new Error("Stripe down");
    const out = await loadFamilyBilling("p1", all);
    expect(out.state === "loaded" && out.plans[0].plan).toEqual({ kind: "unknown" });
    expect(out.state === "loaded" && out.invoices.state).toBe("loaded");
  });

  it("makes no claim at all when the family's rows cannot be read", async () => {
    const { all, billing } = seams([leah]);
    billing.fail.family = new Error("Database down");
    expect(await loadFamilyBilling("p1", all)).toEqual({ state: "unavailable" });
  });

  it("offers a card update only while a plan can charge the card, or has not started", () => {
    expect(canUpdateCard({ kind: "not_started" })).toBe(true);
    expect(canUpdateCard({ kind: "free_month", firstCharge: "2027-01-01T00:00:00Z", monthly: 79.99 })).toBe(true);
    expect(canUpdateCard({ kind: "paying", nextCharge: null, monthly: 79.99 })).toBe(true);
    expect(canUpdateCard({ kind: "payment_failed" })).toBe(true);
    expect(canUpdateCard({ kind: "ending", endsOn: null, free: false })).toBe(false);
    expect(canUpdateCard({ kind: "ended" })).toBe(false);
    expect(canUpdateCard({ kind: "unknown" })).toBe(false);
  });
});

describe("the card update", () => {
  const urls = { returnUrl: "https://unica.test/return", cancelUrl: "https://unica.test/cancel" };
  const withPlan = () => {
    const billing = memoryBilling({ children: [leah, other], subscriptions: [
      { id: "sub_live", customer: "cus_1", status: "active", defaultCard: "pm_old" },
      { id: "sub_over", customer: "cus_1", status: "canceled", defaultCard: "pm_old" },
      { id: "sub_other", customer: "cus_9", status: "active", defaultCard: "pm_theirs" },
    ] });
    return billing;
  };
  const defaults = (b: ReturnType<typeof withPlan>) => Object.fromEntries(b.subscriptions.map((s) => [s.id, s.defaultCard]));

  it("opens Stripe's page for this parent's card row, on its customer", async () => {
    const b = withPlan();
    expect(await startCardUpdate("p1", "card-1", urls, b)).toEqual({ ok: true, url: "https://checkout.stripe.test/cs_test_1" });
    expect(b.created).toEqual([{ ref: "card-1", customer: "cus_1", parentId: "p1", childId: "c1", ...urls }]);
  });

  it("refuses another family's card row, and opens nothing", async () => {
    const b = withPlan();
    expect(await startCardUpdate("p1", "card-9", urls, b)).toEqual({ ok: false, error: "not_found" });
    expect(b.calls.create).toBe(0);
  });

  it("refuses a row with no saved card, so it cannot read as the first saved card", async () => {
    const b = memoryBilling({ children: [{ ...leah, card: { id: "card-1", customer: "cus_1", saved: false } }] });
    expect(await startCardUpdate("p1", "card-1", urls, b)).toEqual({ ok: false, error: "not_found" });
    expect(b.calls.create).toBe(0);
  });

  it("answers failed when Stripe gives no page or fails", async () => {
    const b = withPlan();
    b.fail.create = new Error("Stripe down");
    expect(await startCardUpdate("p1", "card-1", urls, b)).toEqual({ ok: false, error: "failed" });
  });

  it("sets the new card as the default of the subscription that can still charge, and of no other", async () => {
    const b = withPlan();
    await startCardUpdate("p1", "card-1", urls, b);
    b.complete("cs_test_1", "pm_new");
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("updated");
    expect(defaults(b)).toEqual({ sub_live: "pm_new", sub_over: "pm_old", sub_other: "pm_theirs" });
  });

  it("leaves the card as it is when the parent did not finish Stripe's page", async () => {
    const b = withPlan();
    await startCardUpdate("p1", "card-1", urls, b);
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("incomplete");
    expect(defaults(b).sub_live).toBe("pm_old");
  });

  it("writes nothing for another family's session", async () => {
    const b = withPlan();
    b.addSession({ id: "cs_test_theirs", ref: "card-9", customer: "cus_9", created: 1_800_000_000, paymentMethod: "pm_x" });
    expect(await finishCardUpdate("p1", "cs_test_theirs", b)).toBe("not_found");
    expect(b.calls.setDefault).toBe(0);
    expect(defaults(b).sub_other).toBe("pm_theirs");
  });

  it("writes nothing for a session whose row and customer do not match", async () => {
    const b = withPlan();
    b.addSession({ id: "cs_test_mixed", ref: "card-1", customer: "cus_9", created: 1_800_000_000, paymentMethod: "pm_x" });
    expect(await finishCardUpdate("p1", "cs_test_mixed", b)).toBe("not_found");
    expect(b.calls.setDefault).toBe(0);
  });

  it("answers not_found for a session that does not exist, and failed when Stripe fails", async () => {
    const b = withPlan();
    expect(await finishCardUpdate("p1", "cs_test_none", b)).toBe("not_found");
    await startCardUpdate("p1", "card-1", urls, b);
    b.complete("cs_test_1", "pm_new");
    // Stripe gave no answer, so the outcome of the write is unknown. The row keeps the card for the sweep.
    b.fail.setDefault = new Error("Stripe down");
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("unconfirmed");
    expect(defaults(b).sub_live).toBe("pm_old");
    expect(b.updates.get("c1")).toMatchObject({ sessionId: "cs_test_1", paymentMethod: "pm_new", needsRepair: true });
  });

  it("answers failed when Stripe refuses the card", async () => {
    const b = withPlan();
    await startCardUpdate("p1", "card-1", urls, b);
    b.complete("cs_test_1", "pm_new");
    b.refuseOnSubscription.add("pm_new");
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("failed");
    expect(b.updates.get("c1")).toMatchObject({ needsRepair: true });
  });

  /** Two finished updates of one child, A then B, with Stripe's pages opened in that order. */
  const twoUpdates = async (b: ReturnType<typeof memoryBilling>) => {
    await startCardUpdate("p1", "card-1", urls, b);
    await startCardUpdate("p1", "card-1", urls, b);
    b.complete("cs_test_1", "pm_a");
    b.complete("cs_test_2", "pm_b");
  };

  it("keeps B when A, B, then A's return address again: the next charge stays on B", async () => {
    const b = withPlan();
    await twoUpdates(b);
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("updated");
    expect(defaults(b).sub_live).toBe("pm_a");
    expect(await finishCardUpdate("p1", "cs_test_2", b)).toBe("updated");
    expect(defaults(b).sub_live).toBe("pm_b");
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("stale");
    expect(defaults(b).sub_live).toBe("pm_b");
    expect(b.customerDefaults.cus_1).toBe("pm_b");
    expect(b.calls.setDefault).toBe(2);
  });

  it("changes nothing and says nothing new when the same return address opens again", async () => {
    const b = withPlan();
    await startCardUpdate("p1", "card-1", urls, b);
    b.complete("cs_test_1", "pm_new");
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("updated");
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("stale");
    expect(b.calls.setDefault).toBe(1);
  });

  it("does not apply an older update for the first time after a newer one applied", async () => {
    const b = withPlan();
    await twoUpdates(b);
    expect(await finishCardUpdate("p1", "cs_test_2", b)).toBe("updated");
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("stale");
    expect(defaults(b).sub_live).toBe("pm_b");
  });

  it("tries the same address again after Stripe failed, so a failed write does not lose the card", async () => {
    const b = withPlan();
    await startCardUpdate("p1", "card-1", urls, b);
    b.complete("cs_test_1", "pm_new");
    b.fail.setDefault = new Error("Stripe down");
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("unconfirmed");
    delete b.fail.setDefault;
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("updated");
    expect(defaults(b).sub_live).toBe("pm_new");
  });

  it("writes the newer card when a newer return arrives during this write, and each return says only what it knows", async () => {
    const b = withPlan();
    await twoUpdates(b);
    // B's return records its card and finishes first. A's write then lands, and A finds B newer in the row and writes B again.
    b.duringNextWrite(async () => { expect(await finishCardUpdate("p1", "cs_test_2", b)).toBe("updated"); });
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("stale");
    expect(defaults(b).sub_live).toBe("pm_b");
    expect(b.customerDefaults.cus_1).toBe("pm_b");
    expect(b.updates.get("c1")).toMatchObject({ sessionId: "cs_test_2", needsRepair: false });
  });

  it("answers failed when the card cannot be recorded, and writes nothing", async () => {
    const b = withPlan();
    await startCardUpdate("p1", "card-1", urls, b);
    b.complete("cs_test_1", "pm_new");
    b.fail.record = new Error("Database down");
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("failed");
    expect(b.calls.setDefault).toBe(0);
  });

  it("does not say updated when the row cannot say that this card is the newest", async () => {
    const b = withPlan();
    await startCardUpdate("p1", "card-1", urls, b);
    b.complete("cs_test_1", "pm_new");
    b.fail.settle = new Error("Database down");
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("unconfirmed");
    expect(b.updates.get("c1")).toMatchObject({ needsRepair: true });
  });

  it("keeps one child's order apart from another child's", async () => {
    const b = memoryBilling({ children: [leah, omar] });
    await startCardUpdate("p1", "card-1", urls, b);
    await startCardUpdate("p1", "card-2", urls, b);
    b.complete("cs_test_1", "pm_leah");
    b.complete("cs_test_2", "pm_omar");
    expect(await finishCardUpdate("p1", "cs_test_2", b)).toBe("updated");
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("updated");
    expect(b.customerDefaults).toEqual({ cus_1: "pm_leah", cus_2: "pm_omar" });
  });
});

describe("a card update before the plan starts", () => {
  const urls = { returnUrl: "https://unica.test/return", cancelUrl: "https://unica.test/cancel" };
  const start = (b: ReturnType<typeof memoryBilling>) => startPlan(b.stripe, { cardSetup: "card-1", customer: "cus_1", price: 79.99, deliveryConfirmed: true }, undefined, b.store);
  const family = () => memoryBilling({ children: [leah], paymentMethods: { cus_1: [{ id: "pm_old", type: "card" }] } });

  it("charges the card the parent chose, even when a newer card is on the customer", async () => {
    const b = family();
    await startCardUpdate("p1", "card-1", urls, b);
    b.complete("cs_test_1", "pm_new");
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("updated");
    b.paymentMethods.cus_1.unshift({ id: "pm_later", type: "card" });
    expect((await start(b)).ok).toBe(true);
    expect(b.subscriptions.map((s) => s.defaultCard)).toEqual(["pm_new"]);
  });

  it("keeps B through A, B, A again, and then starts on B", async () => {
    const b = family();
    await startCardUpdate("p1", "card-1", urls, b);
    await startCardUpdate("p1", "card-1", urls, b);
    // Finished in the other order, so B is not the newest card on the customer.
    b.complete("cs_test_2", "pm_b");
    b.complete("cs_test_1", "pm_a");
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("updated");
    expect(await finishCardUpdate("p1", "cs_test_2", b)).toBe("updated");
    expect(await finishCardUpdate("p1", "cs_test_1", b)).toBe("stale");
    expect((await start(b)).ok).toBe(true);
    expect(b.subscriptions.map((s) => s.defaultCard)).toEqual(["pm_b"]);
  });

  it("starts on the customer's newest card, as it always did, with no card update", async () => {
    const b = memoryBilling({ children: [leah], paymentMethods: { cus_1: [{ id: "pm_newest", type: "card" }, { id: "pm_old", type: "card" }] } });
    expect((await start(b)).ok).toBe(true);
    expect(b.subscriptions.map((s) => s.defaultCard)).toEqual(["pm_newest"]);
  });

  it("does not charge a default that is not a card, and takes the newest card", async () => {
    const b = memoryBilling({ children: [leah], paymentMethods: { cus_1: [{ id: "pm_klarna", type: "klarna" }, { id: "pm_card", type: "card" }] }, customerDefaults: { cus_1: "pm_klarna" } });
    expect((await start(b)).ok).toBe(true);
    expect(b.subscriptions.map((s) => s.defaultCard)).toEqual(["pm_card"]);
  });

  it("answers no_card when the customer has no card at all", async () => {
    const b = memoryBilling({ children: [leah] });
    expect(await start(b)).toEqual({ ok: false, error: "no_card" });
    expect(b.subscriptions).toEqual([]);
  });
});
