// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
import { PlansView, type PlanCard } from "@/components/admin-plans";
import type { Book1BaselineLoad } from "@/lib/admin-book1-baselines";

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
const RUN = "00000000-0000-4000-8000-0000000000aa";
const baselines: Book1BaselineLoad = { rows: [
  { draftId: "90559915-cc4b-46c6-bc00-d9ee80876b48", revision: 7, runId: RUN, parentId: pid(2), childId: "child-Waiting", childName: "Waiting", kind: "pending" as const, reason: "planned-on-another-build", tries: null, testFamily: false },
  { draftId: "11111111-cc4b-46c6-bc00-d9ee80876b48", revision: 2, runId: null, parentId: pid(3), childId: "child-Stuck", childName: "Stuck", kind: "failing" as const, reason: null, tries: 5, testFamily: false },
  { draftId: "22222222-cc4b-46c6-bc00-d9ee80876b48", revision: 3, runId: "00000000-0000-4000-8000-0000000000bb", parentId: pid(4), childId: "child-Mail", childName: "Mail", kind: "pending" as const, reason: "activity-before-boundary", tries: null, testFamily: false },
  { draftId: "44444444-cc4b-46c6-bc00-d9ee80876b48", revision: 2, runId: "00000000-0000-4000-8000-0000000000dd", parentId: pid(5), childId: "child-Free", childName: "Free", kind: "pending" as const, reason: "revision-changed", tries: null, testFamily: false },
], unavailable: false, more: false };
const none: Book1BaselineLoad = { rows: [], unavailable: false, more: false };
const render = (show: boolean, b = none) => renderToStaticMarkup(createElement(PlansView, { cards, waitlist: [], holds, baselines: b, show, isTest, now, cardsMore: false, waitMore: false }));
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
  // The section count leaves the test family's card out too (7 cards listed, 6 real).
  expect(html).toMatch(/id="pl-cards">All saved cards<\/h2><span class="adm-pl-count">6</);
});

it("names the child of a book on hold and links to it", () => {
  const html = render(false);
  expect(html).toContain("Waiting · Book 2");
  expect(html).toContain("Open child and workbook 1");
  expect(html).toContain("book 2 is on hold until the family scans");
});

const view = (b: Book1BaselineLoad, cardsIn: PlanCard[] = []) => renderToStaticMarkup(createElement(PlansView, { cards: cardsIn, waitlist: [], holds: { rows: [], unavailable: false, more: false }, baselines: b, show: false, isTest, now, cardsMore: false, waitMore: false }));

it("lists each Book 1 record the site could not save, with the child, the draft, the version and the exact command (#870)", () => {
  // Wrong if: a pending row or a failing revision is not on the page, or the command lacks its run id or --save.
  const html = render(false, baselines);
  expect(html).toContain("Book 1 starting records");
  expect(html).toContain(`npm run workbooks:book1-recover -- --run ${RUN} --save`);
  expect(html).toContain("Draft 90559915, version 7");
  expect(html).toContain("cannot prove it copies the planned steps");
  expect(html).toContain("Keeps failing");
  expect(html).toContain("The site tried 5 times to save this record and could not.");
  // A failing revision with no run found has no command; a book with marks cannot be saved, so it has none either.
  expect(count(html, "workbooks:book1-recover")).toBe(1);
  expect(html).toContain("Pages of this book were marked before the record was saved.");
  // revision-changed always means an old version: its words say to approve the newest, and it has no command.
  expect(html).toContain("Approve the newest version again");
  expect(html).toContain(`href="/admin/workbooks/runs/${RUN}"`);
});

it("counts the Book 1 records in Needs you and keeps the calm line only when there are none", () => {
  expect(view(none)).toContain("Nothing waits for us.");
  const one = view({ ...baselines, rows: [baselines.rows[0]] });
  expect(one).not.toContain("Nothing waits for us.");
  expect(one).toContain('aria-label="1 item"');
  expect(view({ rows: [], unavailable: true, more: false })).toContain("Some Book 1 records could not be read.");
  expect(view({ ...baselines, more: true })).toContain("More Book 1 records may need saving.");
});
