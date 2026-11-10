// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
import { PlansView, type PlanCard } from "@/components/admin-plans";

const at = "2026-11-01T18:00:00Z";
const now = new Date("2026-11-10T18:00:00Z");
const pid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function card(n: number, name: string, over: Partial<PlanCard> = {}): PlanCard {
  return {
    id: `card-${name}`, created_at: at, updated_at: at, parent_id: pid(n), child_id: `child-${name}`, report_id: null, plan: "one", price: 79.99,
    stripe_customer_id: `cus_${name}`, card_saved_at: at, planMonthly: 79.99, planFirstCharge: null, planPriceUnread: false, workbookEmails: [], workbookEmailsReadAt: now.getTime(),
    planStarted: false, stuckPlanStart: null, planKind: null, firstWorkbook: { id: `wb-${name}`, delivered: false }, familyWindow: "new",
    parent: { id: pid(n), name: `Family ${name}`, email: `${name}@example.invalid` } as PlanCard["parent"],
    child: { id: `child-${name}`, parent_id: pid(n), first_name: name } as PlanCard["child"], ...over,
  };
}
const cards = [
  card(1, "Due", { firstWorkbook: { id: "wb-due", delivered: true } }),
  card(2, "Waiting"),
  card(3, "Stuck", { stuckPlanStart: 1 }),
  card(4, "Mail", { planStarted: true, planKind: "paying", workbookEmails: [{ id: "e1", kind: "dispatch", workbook_number: 1, status: "failed", claimed_at: null, sent_at: null, delivery: {}, subject: null, text_body: null }] }),
  card(5, "Free", { planStarted: true, planKind: "free_month", planFirstCharge: "2026-12-01T18:00:00Z" }),
  // an email to check on a card whose book 1 has not arrived: the card in Needs you keeps why it cannot start yet
  card(6, "Early", { firstWorkbook: { id: "wb-early", delivered: false }, workbookEmails: [{ id: "e2", kind: "welcome", workbook_number: 0, status: "unknown", claimed_at: null, sent_at: null, delivery: {}, subject: null, text_body: null }] }),
  card(9, "Tested", { firstWorkbook: { id: "wb-t", delivered: true } }),
];
const holds = { rows: [{ workbookId: "wb-h", childId: "child-Waiting", parentId: pid(2), number: 1, testFamily: false }], unavailable: false, more: false };
const isTest = (id: string) => id === pid(9);
const render = (show: boolean) => renderToStaticMarkup(createElement(PlansView, { cards, waitlist: [], holds, show, isTest, now, cardsMore: false, waitMore: false }));
const count = (html: string, text: string) => html.split(text).length - 1;

it("shows each card's plan start and workbook emails once: in Needs you when it is there, else in its row", () => {
  const html = render(true);
  // the due card and the tagged test family's due card: one start button each, in Needs you
  expect(count(html, ">Workbook delivered: start plan</button>")).toBe(2);
  expect(count(html, ">I checked Stripe: close this start</button>")).toBe(1);
  // five cards in Needs you (due, test due, stuck, mail, early), each with its own workbook emails; two rows hold theirs
  expect(count(html, "In Needs you above")).toBe(5);
  expect(count(html, "<summary>Workbook emails</summary>")).toBe(7);
  // the card whose book 1 has not arrived: the receipt sentence and the link, in its row
  expect(html).toContain("Open this child&#x27;s workbook 1 and confirm its delivery.");
  expect(html).toContain('href="/admin/workbooks/wb-Waiting"');
  expect(html).toContain('href="/admin/workbooks/wb-early"');
  expect(html).toContain("Welcome email: delivery uncertain");
  expect(html).toContain("Workbook 1 delivery email: not sent");
});

it("counts real families only, with test families tagged while shown", () => {
  const html = render(true);
  // Needs you: due, stuck, the hold and two emails; the test family's due card shows, tagged, but is not counted
  expect(html).toMatch(/id="pl-you">Needs you<\/h2><span class="adm-pl-count">5</);
  expect(html).toContain("Family Tested");
  expect(html).toContain("is-test");
  expect(html).toContain('aria-label="6 families with a card: Card saved 4, Free month 1, Paying 1, Cancelled 0. 0 families on the waitlist."');
});

it("names the child of a book on hold and links to it", () => {
  const html = render(false);
  expect(html).toContain("Waiting · Book 2");
  expect(html).toContain("Open child and workbook 1");
  expect(html).toContain("book 2 is on hold until the family scans");
});
