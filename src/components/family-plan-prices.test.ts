import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PlanText } from "@/components/plan-text";
import { ParentPlanView } from "@/components/parent-plan-view";
import { CardsTable } from "@/components/admin-records";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({}), usePathname: () => "/account/plan" }));
const plan = { kind: "free_month", firstCharge: "2026-12-10T18:00:00Z", monthly: 59.99 } as const;
it("shows the sibling price and shared first charge in the Account tab's existing text", () => {
  const html = renderToStaticMarkup(createElement(PlanText, { plan, zone: "America/Vancouver", cardUpdate: "here" }));
  expect(html).toContain("CAD 59.99"); expect(html).toContain("December 10, 2026"); expect(html).not.toContain("79.99");
});
it("shows the same real terms on the plan page", () => {
  const html = renderToStaticMarkup(createElement(ParentPlanView, { plans: [{ cardId: "card", childName: "Kai", plan }], zone: "America/Vancouver", controls: false }));
  expect(html).toContain("CAD 59.99"); expect(html).toContain("December 10, 2026"); expect(html).not.toContain("79.99");
});
it("shows admitted terms on the admin card instead of the saved ceiling price", () => {
  const html = renderToStaticMarkup(createElement(CardsTable, { cards: [{ id: "card", created_at: "2026-11-10", updated_at: "2026-11-10", parent_id: "family", child_id: "child", report_id: null, plan: "one", price: 79.99, stripe_customer_id: null, card_saved_at: null, planMonthly: 59.99, planFirstCharge: plan.firstCharge }] }));
  expect(html).toContain("59.99"); expect(html).toContain("First charge"); expect(html).toContain("2026-12-10"); expect(html).not.toContain("79.99");
});

it("shows the actual first charge for an immediate paid sibling on both parent surfaces", () => {
  const paid = { kind: "paying", nextCharge: null, monthly: 59.99, firstCharge: "2026-12-13T18:00:00Z" } as const;
  for (const element of [createElement(PlanText, { plan: paid, zone: "America/Vancouver" }), createElement(ParentPlanView, { plans: [{ cardId: "card", childName: "Kai", plan: paid }], zone: "America/Vancouver", controls: false })]) {
    const html = renderToStaticMarkup(element);
    expect(html).toContain("CAD 59.99"); expect(html).toContain("First charge: December 13, 2026");
  }
});
