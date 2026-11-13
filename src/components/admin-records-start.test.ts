import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }), usePathname: () => "/admin/next-steps" }));
import { CardsTable } from "@/components/admin-records";
import type { CardSetupRow } from "@/lib/admin-store";
import { familyPlanWords } from "@/lib/family-plan-words";
import { DELIVERY_RECEIPT_TEXT } from "@/lib/plan-start-errors";

// #810 (review of PR #807): the start button shows only with workbook 1's delivery receipt. firstWorkbook is what the page
// reads with the start route's own firstDelivery, so a sibling's receipt, a later book's receipt and an unshipped workbook 1
// all arrive here as "not delivered" (src/lib/workbook-delivery.test.ts pins that rule).
const card = (firstWorkbook: CardSetupRow["firstWorkbook"]) => ({
  id: "card-1", parent_id: "p1", child_id: "c1", plan: "one", price: 79.99, stripe_customer_id: "cus_1", card_saved_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z", created_at: "2026-11-01T00:00:00Z", planStarted: false, stuckPlanStart: null, firstWorkbook, familyWindow: null,
  parent: { id: "p1", name: "Priya", email: "parent@example.com" }, child: { id: "c1", first_name: "Asha" },
}) as unknown as CardSetupRow & { parent: never; child: never };
const table = (c: ReturnType<typeof card>) => renderToStaticMarkup(createElement(CardsTable, { cards: [c] }));

it("shows the start button only when workbook 1 has its delivery receipt", () => {
  expect(table(card({ id: "w1", delivered: true }))).toContain(familyPlanWords.adminAction);
  const waiting = table(card({ id: "w1", delivered: false }));
  expect(waiting).not.toContain(familyPlanWords.adminAction);
  expect(waiting).toContain(DELIVERY_RECEIPT_TEXT.replace(/'/g, "&#x27;"));
  expect(waiting).toContain("Open workbook 1");
  const unread = table(card(null));
  expect(unread).not.toContain(familyPlanWords.adminAction);
  expect(unread).toContain("We could not read the delivery of workbook 1. Reload this page.");
});
