import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardLayout from "./layout";
import AccountSettings from "./settings/page";
import { BillingSection } from "@/components/account-billing-section";
import { memoryBilling, type MemoryBillingChild } from "@/lib/billing-memory";
import { formatInZone, familyZone } from "@/lib/family-time";
import type { PlanOwner } from "@/lib/plan-state";
import { memoryPlanStates } from "@/lib/plan-state-memory";
import type { ParentDashboard } from "@/lib/parent-dashboard-server";
import type { ChildView } from "@/lib/parent-view";

vi.mock("server-only", () => ({}));
const nav = vi.hoisted(() => ({ path: "/account", query: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useSearchParams: () => nav.query,
  useRouter: () => ({}),
  redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); },
}));
const state = vi.hoisted(() => ({ dashboard: null as ParentDashboard | null, parent: "p1" as string | null, card: true }));
vi.mock("@/lib/parent-dashboard-server", () => ({ parentDashboard: async () => state.dashboard }));
const billing = vi.hoisted(() => ({ seams: vi.fn(() => null as unknown) }));
vi.mock("@/lib/billing-server", () => ({ liveFamilyBilling: billing.seams }));
vi.mock("@/lib/supabase-auth", () => ({
  parentId: async () => state.parent,
  sessionClient: async () => ({
    from: (table: string) => ({
      select: () => {
        const data = table === "card_setups" ? [{ card_saved_at: state.card ? "2026-11-01T00:00:00Z" : null }] : [{ province: "BC", created_at: "2026-01-01", id: "c1" }];
        const query = { order: () => query, maybeSingle: async () => ({ data: { postal: null, time_zone: "America/Vancouver" } }), then: (resolve: (r: { data: unknown[] }) => unknown) => resolve({ data }) };
        return query;
      },
    }),
  }),
}));

const child = (over: Partial<ChildView> = {}): ChildView => ({ id: "c1", firstName: "Leah", schoolGrade: 3, stage: "no_test", opensOn: "start_test", tabs: ["assessment", "account"], readOnly: false, currentWorkbook: null, reportIds: [], ...over });
const family = (over: Partial<ParentDashboard> = {}): ParentDashboard => ({ children: [child()], remembered: null, pinSet: true, timeZoneSaved: true, ...over });
const page = createElement("p", null, "the page");
const settings = (card?: string) => AccountSettings({ params: Promise.resolve({}), searchParams: Promise.resolve(card ? { card } : {}) });
const render = async () => renderToStaticMarkup(createElement("div", null, await DashboardLayout({ children: page })));

beforeEach(() => { billing.seams.mockReset(); billing.seams.mockReturnValue(null); state.dashboard = family(); state.parent = "p1"; state.card = true; nav.path = "/account"; nav.query = new URLSearchParams(); });

it("adds nothing around the page for a family the switch does not open to", async () => {
  state.dashboard = null;
  expect(await render()).toBe("<div><p>the page</p></div>");
});

it("shows the child, with no dropdown for one child, and no desk before the first shipped workbook", async () => {
  const out = await render();
  expect(out).toContain("Leah");
  expect(out).toContain("Grade 3");
  expect(out).not.toContain("<details");
  expect(out).not.toContain("/api/desk/open");
  expect(out).toContain("<p>the page</p>");
});

it("has a dropdown for two children, opens on the last child viewed, and links each child", async () => {
  state.dashboard = family({ children: [child(), child({ id: "c2", firstName: "Omar", schoolGrade: 0 })], remembered: "c2" });
  const out = await render();
  expect(out).toContain("<details");
  expect(out).toContain('href="/account?child=c1"');
  expect(out).toContain('href="/account?child=c2"');
  expect(out).toContain('aria-label="Omar. Change child"');
});

it("follows a page that belongs to one child, over the last child viewed", async () => {
  state.dashboard = family({ children: [child({ reportIds: ["r1"] }), child({ id: "c2", firstName: "Omar" })], remembered: "c2" });
  nav.path = "/account/report/r1";
  expect(await render()).toContain('aria-label="Leah. Change child"');
});

it("opens the desk from the first shipped workbook, as a form to the desk route, and asks for a PIN first", async () => {
  state.dashboard = family({ children: [child({ currentWorkbook: { number: 2 } })] });
  const open = await render();
  expect(open).toContain('action="/api/desk/open"');
  expect(open).toContain('name="child" value="c1"');
  expect(open).toContain("Workbook 2");
  state.dashboard = family({ children: [child({ currentWorkbook: { number: 2 } })], pinSet: false });
  const noPin = await render();
  expect(noPin).not.toContain("/api/desk/open");
  expect(noPin).toContain('href="/account/pin?desk=1"');
});

it("shows only tabs with a page, a top bar for Assessment and Account, and no bottom bar", async () => {
  const out = await render();
  expect(out).toContain('class="pd-top-links"');
  expect(out).not.toContain('class="pd-bar"');
  expect(out).not.toContain("Workbooks");
  expect(out).not.toContain("Progress");
});

it("has the bottom bar once the child has more tabs, and marks the current page", async () => {
  state.dashboard = family({ children: [child({ stage: "first_book_coming", opensOn: "overview", tabs: ["overview", "workbooks", "assessment", "account"] })] });
  const out = await render();
  expect(out).toContain('class="pd-bar"');
  expect(out).not.toContain('class="pd-top-links"');
  expect(out).toContain('aria-current="page" href="/account?child=c1"');
  expect(out).toContain('href="/account/workbooks/c1"><svg');
  expect(out).not.toContain("Progress");
});

it("has the account page's links, add a child and sign out for a family the switch opens to", async () => {
  const out = renderToStaticMarkup(await settings());
  for (const text of ['href="/account/plan"', 'href="/account/password"', 'href="/account/pin"', "Add another child", "Sign out"]) expect(out).toContain(text);
  state.card = false;
  expect(renderToStaticMarkup(await settings())).not.toContain('href="/account/plan"');
});

it("sends everyone else away from the new account page", async () => {
  state.dashboard = null;
  await expect(settings()).rejects.toThrow("REDIRECT /account");
  expect(billing.seams).not.toHaveBeenCalled();
  state.parent = null;
  await expect(settings()).rejects.toThrow("REDIRECT /sign-in?next=/account/settings");
});

describe("billing on the Account tab", () => {
  const zone = familyZone({ timeZone: "America/Vancouver", postal: null, province: "BC" });
  const leah: MemoryBillingChild = { parentId: "p1", childId: "c1", firstName: "Leah", card: { id: "11111111-1111-4111-8111-111111111111", customer: "cus_1", saved: true } };
  const invoice = { id: "in_1", customer: "cus_1", status: "paid", created: 1_800_000_000, paidAt: 1_800_000_000, amountPaid: 7999, amountDue: 7999, total: 7999, currency: "cad", receiptUrl: "https://invoice.stripe.com/i/1" };
  const live = (over: { children?: MemoryBillingChild[]; subscriptions?: Parameters<typeof memoryPlanStates>[0]["subscriptions"] } = {}) => {
    const children = over.children ?? [leah];
    const money = memoryBilling({ children, invoices: { cus_1: [invoice] } });
    const cards: PlanOwner[] = children.flatMap((c) => (c.card?.customer ? [{ parentId: c.parentId, childId: c.childId, customer: c.card.customer, cardSaved: c.card.saved }] : []));
    const plans = memoryPlanStates({ cards, subscriptions: over.subscriptions ?? {} });
    billing.seams.mockReturnValue({ store: money.store, provider: money.provider, plans });
    return { money, plans };
  };
  const section = async () => renderToStaticMarkup(await BillingSection({ parent: "p1", zone }));
  const paying = { status: "active", cancelAtPeriodEnd: false, trialEnd: null, periodEnd: 1_800_000_000, cents: 7999, created: 1 };

  it("shows each child's next charge, the invoice with its receipt link, and the card button", async () => {
    live({ subscriptions: { cus_1: [paying] } });
    const out = await section();
    const day = formatInZone(new Date(1_800_000_000_000).toISOString(), zone, { year: "numeric", month: "long", day: "numeric" });
    expect(out).toContain("Leah");
    expect(out).toContain(`Next charge: ${day}.`);
    expect(out).toContain("CAD 79.99");
    expect(out).toContain('href="https://invoice.stripe.com/i/1"');
    expect(out).toContain("Update card");
    expect(out).not.toContain("cus_1");
  });

  it("fills a missing plan row on the load, and the next load asks Stripe nothing", async () => {
    const { plans } = live({ subscriptions: { cus_1: [paying] } });
    await section();
    expect(plans.rows).toHaveLength(1);
    await section();
    expect(plans.calls.plan).toBe(1);
  });

  it("says we cannot load billing now, and claims nothing, with no seams", async () => {
    const out = await section();
    expect(out).toContain("We cannot load billing now");
    for (const claim of ["No invoices yet", "Next charge", "Update card", "No plan yet"]) expect(out).not.toContain(claim);
  });

  it("makes no claim about a plan or invoices when Stripe fails", async () => {
    const { money, plans } = live();
    plans.fail.plan = new Error("Stripe down");
    money.failInvoicesOf.add("cus_1");
    const out = await section();
    expect(out).toContain("We cannot load this plan now.");
    expect(out).toContain("We cannot load billing now, so your invoices do not show.");
    for (const claim of ["No invoices yet", "Next charge", "Update card", "nothing has been charged", "We will not charge"]) expect(out).not.toContain(claim);
  });

  it("offers no card button once the plan cannot charge", async () => {
    live({ subscriptions: { cus_1: [{ ...paying, status: "canceled", endedAt: 1_700_000_000 }] } });
    const out = await section();
    expect(out).toContain("This plan has ended.");
    expect(out).not.toContain("Update card");
  });

  it("has no plan and no card button for a child with no saved card", async () => {
    live({ children: [{ ...leah, card: null }] });
    const out = await section();
    expect(out).toContain("No plan yet.");
    expect(out).toContain("No invoices yet.");
    expect(out).not.toContain("Update card");
  });

  it.each([["updated", "Your new card is saved."], ["unchanged", "Your card did not change."], ["failed", "We could not update your card."]])("says what happened after Stripe's page: %s", async (card, text) => {
    expect(renderToStaticMarkup(await settings(card))).toContain(text);
  });

  it("says nothing about the card for another value in the address", async () => {
    const out = renderToStaticMarkup(await settings("<script>"));
    for (const text of ["Your new card", "did not change", "could not update", "<script>"]) expect(out).not.toContain(text);
  });
});
