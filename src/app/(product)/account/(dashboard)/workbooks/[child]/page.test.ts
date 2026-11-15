import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { memoryParentViewReaders, type MemoryParentViewTables } from "@/lib/parent-view-memory";

const fake = vi.hoisted(() => ({ parent: "parent" as string | null, dashboard: true, scans: true, marking: true, reader: null as unknown, days: vi.fn(), access: vi.fn(), schedule: "ready" as "ready" | "waiting" | "unavailable", scansUnknown: false, history: vi.fn(), review: vi.fn(), reviewCount: 0 as number | null }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/account/workbooks/child", redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error("not-found"); } }));
vi.mock("@/lib/supabase-auth", () => ({ sessionClient: async () => ({}), parentId: async () => fake.parent, adminClient: () => ({}) }));
vi.mock("@/lib/parent-dashboard-server", () => ({ parentDashboard: async () => fake.dashboard }));
vi.mock("@/lib/parent-view-server", () => ({ parentViewReader: () => fake.reader }));
vi.mock("@/lib/scan-pages-access", () => ({ scanChildAccess: async () => fake.scans }));
vi.mock("@/lib/scan-marking-server", () => ({ markingAccess: async () => { fake.access(); return fake.marking; } }));
// The live day list loads over the network: here it renders the same presentation with no pages and no loader.
vi.mock("@/components/workbook-days", async importOriginal => {
  const actual = await importOriginal<typeof import("@/components/workbook-days")>();
  return { ...actual, WorkbookDays: (props: { parent: string; child: string; book: string; open: boolean; openDay?: number | null; checking?: number; weeks: import("@/lib/workbook-days").DayRow[][] }) => {
    fake.days({ parent: props.parent, child: props.child, book: props.book, open: props.open, openDay: props.openDay ?? null });
    return createElement(actual.WorkbookDaysView, { book: props.book, weeks: props.weeks as never, openDay: props.openDay, state: props.open ? "ready" : "unavailable", pages: [], checking: props.checking });
  } };
});
// The plain page list a book falls back to when its plan cannot be read: here a marker with the props it got.
vi.mock("@/components/scan-history", async importOriginal => {
  const actual = await importOriginal<typeof import("@/components/scan-history")>();
  return { ...actual, ScanHistory: (props: { parent: string; child: string; books?: readonly string[] }) => { fake.history(props); return createElement("section", { className: "scan-history" }, "Page history"); } };
});
// The pages our team is checking: one server read, with the largest limit.
vi.mock("@/lib/scan-history-reader", () => ({ scanHistoryStore: () => ({}) }));
vi.mock("@/lib/scan-history", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/scan-history")>(),
  readScanHistory: async (...args: unknown[]) => { fake.review(...args); return fake.reviewCount === null ? null : { pages: Array.from({ length: fake.reviewCount }, () => ({})) }; } }));
const TOPICS = ["Hundreds, tens and ones", "Comparing numbers", "Adding with regrouping", "Subtracting across a zero", "Review", "Rounding", "Word problems", "Patterns", "Even and odd", "Review"];
vi.mock("@/lib/parent-schedule-server", () => ({ parentSchedule: async (parent: string, child: string, book: string) => {
  if (fake.schedule !== "ready") return { kind: fake.schedule, child: null };
  return { kind: "ready", child: { id: child, parentId: parent, firstName: "Leah" }, book: { id: book, number: 1 }, dailyTime: "about 19 minutes", minutes: { min: 19, max: 19 }, scansUnknown: fake.scansUnknown,
    rows: TOPICS.map((topic, i) => ({ day: i + 1, topic, second: "", pages: [3 + i * 8, 10 + i * 8], requiredMinutes: 19, extra: false, requiredPages: Array.from({ length: 8 }, (_, k) => 3 + i * 8 + k),
      scan: i === 0 ? { kind: "known", accepted: 8, required: 8, missing: [] } : { kind: "unknown" }, marks: { kind: "none", marked: 0, total: 8 } })) };
} }));
import Workbooks from "./page";
import WorkbookBook from "./book/[workbook]/page";
const page = (child = "child", query: Record<string, string> = {}) => Workbooks({ params: Promise.resolve({ child }), searchParams: Promise.resolve(query) });
const bookPage = (child: string, workbook: string, query: Record<string, string> = {}) => WorkbookBook({ params: Promise.resolve({ child, workbook }), searchParams: Promise.resolve(query) });
beforeEach(() => {
  Object.assign(fake, { parent: "parent", dashboard: true, scans: true, marking: true }); fake.days.mockClear(); fake.access.mockClear(); fake.history.mockClear(); fake.review.mockClear(); fake.schedule = "ready"; fake.scansUnknown = false; fake.reviewCount = 0;
  fake.reader = memoryParentViewReaders({
    children: [{ id: "child", parentId: "parent", firstName: "Leah", grade: 3, createdAt: "2026-01-01" }, { id: "sibling", parentId: "parent", firstName: "Kai", grade: 2, createdAt: "2026-02-01" }, { id: "foreign", parentId: "other-parent", firstName: "Foreign", grade: 3, createdAt: "2026-01-01" }],
    cards: ["child", "sibling"].map(childId => ({ childId, parentId: "parent", cardSavedAt: "2026-10-01" })),
    workbooks: [{ id: "own-book", parentId: "parent", childId: "child", number: 2, status: "shipped", pdfPath: null, shippedAt: "2026-10-01" }, { id: "past-book", parentId: "parent", childId: "child", number: 1, status: "shipped", pdfPath: null, shippedAt: "2026-09-01" }, { id: "sibling-book", parentId: "parent", childId: "sibling", number: 1, status: "shipped", pdfPath: null, shippedAt: "2026-10-01" }],
    deliveries: [{ parentId: "parent", childId: "child", workbookId: "past-book", deliveredAt: "2026-09-02" }],
  }).parent("parent");
});
it("shows the current book's 10 days for only the selected child, with the older and in-the-mail books as rows", async () => {
  const html = renderToStaticMarkup(await page());
  // The current book is the newest delivered one (Workbook 1): Workbook 2 is still in the mail.
  expect(fake.days).toHaveBeenLastCalledWith({ parent: "parent", child: "child", book: "past-book", open: true, openDay: null });
  expect(html).toContain("Workbook 1");
  expect(html).toContain("Day 1 · Hundreds, tens and ones");
  // The scan screen's "See all pages" link lands here (#915).
  expect(html).toMatch(/id="page-history"[^>]*>[^]*Day 10 · Review/);
  expect(html).toContain('href="/account/workbooks/child/answers/past-book"');
  expect(html).not.toContain('href="/account/workbooks/child/answers/own-book"');
  expect(html).toContain('href="/account/workbooks/child/book/own-book"');
  expect(html).not.toContain("sibling-book");
  renderToStaticMarkup(await page("sibling"));
  expect(fake.days).toHaveBeenLastCalledWith({ parent: "parent", child: "sibling", book: "sibling-book", open: true, openDay: null });
});
it("opens the day the address names, and ignores one that is not a day", async () => {
  expect(renderToStaticMarkup(await page("child", { day: "4" }))).toMatch(/<details class="wd-row[^"]*" id="day-4" open="">/);
  expect(fake.days).toHaveBeenLastCalledWith(expect.objectContaining({ openDay: 4 }));
  for (const day of ["0", "11", "x", "3 "]) expect(renderToStaticMarkup(await page("child", { day }))).not.toContain(' open=""');
});
it.each(["scans", "marking"] as const)("a closed %s gate renders the days with a useful state in each, and no saved results", async gate => {
  fake[gate] = false;
  const html = renderToStaticMarkup(await page());
  expect(html).toContain("Page history is not available here");
  expect(html).not.toContain("Loading page history");
  expect(fake.days).toHaveBeenLastCalledWith(expect.objectContaining({ open: false }));
  expect(html).toContain('href="/account/workbooks/child/answers/past-book"');
});
it("shows the cover and no days when the book's printed plan cannot be read", async () => {
  for (const kind of ["waiting", "unavailable"] as const) {
    fake.schedule = kind;
    const html = renderToStaticMarkup(await page());
    expect(html).toContain("Workbook 1");
    expect(html).not.toContain("wd-row");
    expect(html).not.toContain("How to follow");
    expect(fake.days).not.toHaveBeenCalled();
  }
});
it("a book whose plan cannot be read keeps its page results as the plain list scoped to that book, where the Scan tab's link lands", async () => {
  fake.schedule = "unavailable";
  const html = renderToStaticMarkup(await page());
  expect(html).toMatch(/<div id="page-history"><section class="scan-history">Page history<\/section><\/div>/);
  expect(fake.history).toHaveBeenLastCalledWith({ parent: "parent", child: "child", books: ["past-book"] });
  renderToStaticMarkup(await bookPage("child", "own-book"));
  expect(fake.history).toHaveBeenLastCalledWith({ parent: "parent", child: "child", books: ["own-book"] });
  // With the page results closed to the family there is nothing to list, and no link to it.
  fake.history.mockClear(); fake.marking = false;
  expect(renderToStaticMarkup(await page())).not.toContain("page-history");
  expect(fake.history).not.toHaveBeenCalled();
});
it("says once, above the weeks, how many pages our team is checking, and nothing for none or a closed gate", async () => {
  fake.reviewCount = 2;
  const html = renderToStaticMarkup(await page());
  expect(html).toMatch(/id="page-history"[^>]*><p class="wd-check" role="status">Our team is checking 2 pages<\/p><section/);
  expect(fake.review).toHaveBeenCalledWith(expect.anything(), { child: "child", workbook: "past-book", status: "review", scannedOnly: true }, expect.any(Number), 100);
  fake.reviewCount = 1;
  expect(renderToStaticMarkup(await page())).toContain("Our team is checking 1 page<");
  for (const count of [0, null]) { fake.reviewCount = count; expect(renderToStaticMarkup(await page())).not.toContain("Our team is checking"); }
  fake.reviewCount = 3; fake.marking = false; fake.review.mockClear();
  expect(renderToStaticMarkup(await page())).not.toContain("Our team is checking");
  expect(fake.review).not.toHaveBeenCalled();
});
it("when the scan records cannot be read the page says so and shows no scan statuses", async () => {
  fake.scansUnknown = true;
  const html = renderToStaticMarkup(await page());
  expect(html).toContain("Scan status unavailable right now.");
  expect(html).not.toMatch(/wd-st|still to scan|pages scanned/);
});
it("the current book's cover says the number Home says: saved, unexpired photos over its day pages", async () => {
  const own = { parentId: "parent", workbookId: "past-book" };
  fake.reader = memoryParentViewReaders({
    children: [{ id: "child", parentId: "parent", firstName: "Leah", grade: 3, createdAt: "2026-01-01" }], cards: [{ childId: "child", parentId: "parent", cardSavedAt: "2026-10-01" }],
    workbooks: [{ id: "past-book", parentId: "parent", childId: "child", number: 1, status: "shipped", pdfPath: null, shippedAt: "2026-09-01" }],
    deliveries: [{ parentId: "parent", childId: "child", workbookId: "past-book", deliveredAt: "2026-09-02" }],
    pages: [{ ...own, id: "a", dayLabel: "Day 1" }, { ...own, id: "b", dayLabel: "Day 1" }, { ...own, id: "c", dayLabel: "Day 2" }, { ...own, id: "cover", dayLabel: null }],
    scans: [{ parentId: "parent", childId: "child", workbookId: "past-book", pageId: "a", state: "saved", expiresAt: "2099-01-01T00:00:00Z" }],
  }).parent("parent");
  // The printed plan's own count is 8 of 80; Home's is 1 of 3.
  const html = renderToStaticMarkup(await page());
  expect(html).toContain("1 of 3 pages scanned");
  expect(html).toContain('aria-valuenow="33"');
});
it("opens an older book as the same page, and refuses another family's, a sibling's and an unknown book", async () => {
  const html = renderToStaticMarkup(await bookPage("child", "own-book", { day: "2" }));
  expect(html).toContain('<a class="wb-back" href="/account/workbooks/child">');
  expect(html).toContain("Day 2 · Comparing numbers");
  expect(fake.days).toHaveBeenLastCalledWith({ parent: "parent", child: "child", book: "own-book", open: true, openDay: 2 });
  for (const [child, book] of [["child", "sibling-book"], ["child", "missing"], ["foreign", "own-book"], ["missing", "own-book"]]) await expect(bookPage(child, book)).rejects.toThrow("not-found");
  fake.parent = null; await expect(bookPage("child", "own-book")).rejects.toThrow("redirect:/sign-in");
  fake.parent = "parent"; fake.dashboard = false; await expect(bookPage("child", "own-book")).rejects.toThrow("not-found");
});
it("refuses a foreign or missing child before the schedule or history access", async () => {
  for (const child of ["foreign", "missing"]) await expect(page(child)).rejects.toThrow("not-found");
  expect(fake.days).not.toHaveBeenCalled(); expect(fake.access).not.toHaveBeenCalled();
});
it("preserves sign-in and dashboard access", async () => {
  fake.parent = null; await expect(page()).rejects.toThrow("redirect:/sign-in");
  fake.parent = "parent"; fake.dashboard = false; await expect(page()).rejects.toThrow("not-found");
  expect(fake.days).not.toHaveBeenCalled();
});

// Retain the pre-existing route regressions through the current session seam.
const own = { parentId: "parent", childId: "child" };
const render = async (extra: Partial<MemoryParentViewTables> = {}, child = "child") => {
  fake.reader = memoryParentViewReaders({ children: [{ ...own, id: "child", firstName: "Leah", grade: 3, createdAt: "2026-01-01" }], cards: [{ ...own, cardSavedAt: "2026-10-01" }], ...extra }).parent("parent");
  return renderToStaticMarkup(await page(child));
};
it("keeps sign-in, dashboard and family checks before the extracted view", async () => {
  fake.parent = null;
  await expect(render()).rejects.toThrow("redirect:/sign-in");
  fake.parent = "parent"; fake.dashboard = false;
  await expect(render()).rejects.toThrow("not-found");
  fake.dashboard = true;
  await expect(render({}, "another-family-child")).rejects.toThrow("not-found");
  await expect(render({ cards: [] })).rejects.toThrow("not-found");
});
it("keeps tracking and the first-book state but never exposes a parent PDF", async () => {
  expect(await render()).toContain("first workbook is on its way");
  const html = await render({ workbooks: [{ ...own, id: "wb-1", number: 1, status: "shipped", shippedAt: "2026-11-01T20:00:00Z", pdfPath: "private/book.pdf" }], dispatches: [{ ...own, number: 1, delivery: { method: "mail", carrier: "Canada Post", trackingNumber: "7023 1234", trackingUrl: "https://www.canadapost-postescanada.ca/track" } }] });
  expect(html).not.toMatch(/Download PDF|Print a page again|\/api\/account\/workbooks/);
  expect(html).toContain('href="https://www.canadapost-postescanada.ca/track"');
  expect(html).toContain("7023 1234");
});
