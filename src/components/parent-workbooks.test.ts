import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ParentWorkbookBook, ParentWorkbooks } from "@/components/parent-workbooks";
import { WorkbookDaysView } from "@/components/workbook-days";
import type { ScheduleRow } from "@/lib/parent-schedule";
import { readWorkbooks } from "@/lib/parent-view";
import { memoryParentViewReaders } from "@/lib/parent-view-memory";
import type { HistoryPage } from "@/lib/scan-history";
import { bookDays, type ReadySchedule } from "@/lib/workbook-days";
vi.mock("server-only", () => ({}));

const TOPICS = ["Hundreds, tens and ones", "Comparing numbers", "Adding with regrouping", "Subtracting across a zero", "Review", "Rounding", "Word problems", "Patterns", "Even and odd", "Review"];
function schedule(scans: Record<number, ScheduleRow["scan"]> = {}): ReadySchedule {
  return { kind: "ready", child: { id: "c1", parentId: "p1", firstName: "Leah" }, book: { id: "wb-2", number: 2 }, dailyTime: "about 19 minutes", minutes: { min: 19, max: 19 },
    rows: TOPICS.map((topic, i): ScheduleRow => ({ day: i + 1, topic, second: "", pages: [3 + i * 8, 10 + i * 8], requiredMinutes: 19, extra: false,
      requiredPages: Array.from({ length: 8 }, (_, k) => 3 + i * 8 + k), scan: scans[i + 1] ?? { kind: "unknown" }, marks: { kind: "none", marked: 0, total: 8 } })) };
}
const reader = (extra = {}) => memoryParentViewReaders({ children: [{ id: "c1", parentId: "p1", firstName: "Leah", grade: 3, createdAt: "2026-01-01" }], cards: [{ childId: "c1", parentId: "p1", cardSavedAt: "2026-10-01" }],
  workbooks: [{ id: "wb-2", number: 2, shippedAt: "2026-10-30T20:00:00Z" }, { id: "wb-1", number: 1, shippedAt: "2026-10-01T20:00:00Z" }].map(w => ({ ...w, parentId: "p1", childId: "c1", status: "shipped", pdfPath: "private/whole.pdf" })),
  deliveries: [{ parentId: "p1", childId: "c1", workbookId: "wb-1", deliveredAt: "2026-10-02T20:00:00Z" }, { parentId: "p1", childId: "c1", workbookId: "wb-2", deliveredAt: "2026-11-02T20:00:00Z" }], ...extra }).parent("p1");
const NOW = Date.parse("2026-11-04T20:00:00Z"); // a Wednesday: Day 3 of a book delivered Monday Nov 2
const page = (p: Partial<HistoryPage> & { pageNumber: number }): HistoryPage => ({ id: `h${p.pageNumber}`, childId: "c1", childName: "Leah", workbookId: "wb-2", book: 2, revision: "r", day: "Day 1", status: "ready", label: "Results ready", photo: `photo-${p.pageNumber}`, photoAvailable: true, failedJob: false,
  counts: { scored: 3, unscored: 0, teamChecks: 0, pending: 0 }, right: 3, wrong: 0, blank: 0, ...p } as HistoryPage);

async function render(scans: Record<number, ScheduleRow["scan"]>, o: { scanOpen?: boolean; pages?: HistoryPage[]; state?: "ready" | "unavailable"; openDay?: number | null; days?: boolean } = {}) {
  const view = (await readWorkbooks(reader(), "c1", NOW))!;
  const days = o.days === false ? null : bookDays(schedule(scans), { start: "2026-11-02", today: view.today, ended: false });
  const list = days && createElement(WorkbookDaysView, { book: "wb-2", weeks: days.weeks, openDay: o.openDay ?? null, state: o.state ?? "ready", pages: o.pages ?? [] });
  return renderToStaticMarkup(createElement(ParentWorkbooks, { view, days, list, scanOpen: o.scanOpen ?? true }));
}
const done: ScheduleRow["scan"] = { kind: "known", accepted: 8, required: 8, missing: [] };
const text = (html: string) => html.replace(/<[^>]+>/g, "|").replace(/&#x27;/g, "'").replace(/\|+/g, "|");

it("shows a book midway: the cover card, one line of facts, the next book, the Scan row and the day rows", async () => {
  const html = await render({ 1: done, 2: done, 3: { kind: "known", accepted: 3, required: 8, missing: [22, 23, 24, 25, 26] } });
  const t = text(html);
  expect(t).toContain("|Workbook 2|Day 3 of 10 · Adding with regrouping|");
  expect(t).toContain("19 of 80 pages scanned");
  expect(html).toContain('aria-valuenow="24"');
  expect(t).toContain("About 19 min a day · 5 days a week · Days 1–10 in order");
  expect(t).toContain("Day 3 still to scan|Pages 22–26|");
  expect(html).toContain('href="/account/scan?w=wb-2&amp;p=22"');
  expect(t).toMatch(/Week 1\|[^]*Day 1 · Hundreds, tens and ones\|Pages 3–10\|Scanned[^]*Day 3 · Adding with regrouping\|Pages 19–26\|To scan[^]*Day 4 · Subtracting across a zero\|Pages 27–34\|Next[^]*Day 5 · Review\|Pages 35–42\|›[^]*Week 2\|/);
  expect(html.match(/<details/g)).toHaveLength(11); // ten days and the guide
  expect(html.match(/class="wd-row is-ok"/g)).toHaveLength(2);
  expect(html.match(/is-now/g)).toHaveLength(1);
  expect(html).not.toContain("Pages still to scan");
});

it("puts the guide in one card that opens in place, with no second box", async () => {
  const html = await render({});
  const guide = html.match(/<details class="pa-card wb-guide">[^]*?<\/details>/)![0];
  expect(guide).toMatch(/<summary><b>How to follow the 10 days<\/b>/);
  expect(guide.match(/<p>/g)).toHaveLength(1);
  expect(text(guide)).toContain("Pick 5 days a week that work for your family, for example Monday to Friday, and do the days in order. The days off are for rest. Extra practice is optional.");
  expect(guide).not.toContain(" open");
  expect(html).not.toContain("Schedule from page 2");
});

it("a book not started has no orange row, and a book with every day scanned has none either", async () => {
  const fresh = await render({});
  expect(fresh).not.toContain("still to scan");
  expect(text(fresh)).toContain("0 of 80 pages scanned");
  const all = await render(Object.fromEntries(TOPICS.map((_, i) => [i + 1, done])));
  expect(all).not.toContain("still to scan");
  expect(text(all)).toContain("80 of 80 pages scanned");
  expect(text(all)).toContain("Day 10 of 10 · Review");
  expect(all.match(/class="wd-row is-ok/g)).toHaveLength(10);
  expect(all).not.toContain(">Next<");
});

it("keeps the Scan row off when the family has no Scan tab", async () => {
  expect(await render({ 3: { kind: "known", accepted: 3, required: 8, missing: [22] } }, { scanOpen: false })).not.toContain("still to scan");
});

it("opens one day when asked and lists its pages with each page's state words and results link", async () => {
  const html = await render({ 3: { kind: "known", accepted: 2, required: 8, missing: [24, 25, 26] } }, {
    openDay: 3, pages: [page({ pageNumber: 19 }), page({ pageNumber: 20, status: "review", label: "Our team is checking", counts: { scored: 0, unscored: 0, teamChecks: 1, pending: 0 }, right: 0 }), page({ pageNumber: 21, status: "pending", label: "Not marked yet", right: 0 })] });
  const open = html.match(/<details class="wd-row is-now" id="day-3" open="">[^]*?<\/details>/)![0];
  expect(text(open)).toContain("Page 19|: Results ready · 3 of 3 right|View page results");
  expect(text(open)).toContain("Page 20|: 1 answer for our team to check");
  expect(text(open)).toContain("Page 21|: Not marked yet");
  expect(text(open)).toContain("Page 24|: No photo yet");
  expect(open).toContain('href="/account/scan/results/photo-19"');
  expect(html.match(/ open=""/g)).toHaveLength(1);
});

it("says so inside a day when saved page results are closed to the family", async () => {
  expect(text(await render({}, { state: "unavailable", openDay: 1 }))).toContain("Page history is not available here.");
});

it("shows the next workbook as one line under the cover card, and the answer keys and older books after it", async () => {
  const html = await render({});
  expect(text(html)).toContain("Next workbook: about Nov 13 – Nov 30");
  expect(html).not.toContain("An estimate. We will email you");
  expect(html).toContain('href="/account/workbooks/c1/answers/wb-2"');
  expect(html).toContain('aria-label="View the answer key for workbook 2" href="/account/workbooks/c1/answers/wb-2">View</a>');
  expect(text(html)).toContain("Each answer key opens after we confirm that workbook has arrived.");
  expect(text(html)).toContain("Older workbooks|Book 1|Workbook 1|Delivered Oct 2|›");
  expect(html).toContain('href="/account/workbooks/c1/book/wb-1"');
  expect(html).not.toMatch(/Download PDF|Print a page again|\/api\/account\/workbooks|private\/whole/);
});

it("an older book opens the same page with a way back, no calendar and no Day line on the cover", async () => {
  const view = (await readWorkbooks(reader(), "c1", NOW))!;
  const book = view.books.find(b => b.id === "wb-1")!;
  const days = bookDays({ ...schedule({ 1: done }), book: { id: "wb-1", number: 1 } }, null);
  const html = renderToStaticMarkup(createElement(ParentWorkbookBook, { child: view.child, book, days, list: createElement(WorkbookDaysView, { book: "wb-1", weeks: days.weeks, state: "ready", pages: [] }), scanOpen: true, current: false }));
  expect(html).toContain('<a class="wb-back" href="/account/workbooks/c1">');
  expect(text(html)).toContain("Workbook 1|Delivered Oct 2|");
  expect(html).not.toMatch(/Day \d of 10/);
  expect(html).not.toContain("Next workbook");
});

it("a book whose plan cannot be read shows its cover and no days", async () => {
  const html = await render({}, { days: false });
  expect(html).toContain("Workbook 2");
  expect(html).not.toContain("wd-row");
  expect(html).not.toContain("How to follow");
});

it("before the first workbook ships it says so, with no days", async () => {
  const view = (await readWorkbooks(memoryParentViewReaders({ children: [{ id: "c1", parentId: "p1", firstName: "Leah", grade: 3, createdAt: "2026-01-01" }], cards: [{ childId: "c1", parentId: "p1", cardSavedAt: "2026-10-01" }] }).parent("p1"), "c1", NOW))!;
  const html = renderToStaticMarkup(createElement(ParentWorkbooks, { view, days: null, list: null, scanOpen: true }));
  expect(html).toContain("first workbook is on its way");
  expect(html).not.toContain("Answer keys");
});

it("offers only delivered books' answer keys, and keeps tracking for a book in the mail", async () => {
  const view = (await readWorkbooks(reader({ deliveries: [{ parentId: "p1", childId: "c1", workbookId: "wb-1", deliveredAt: "2026-10-02T20:00:00Z" }],
    dispatches: [{ parentId: "p1", childId: "c1", number: 2, delivery: { method: "mail", carrier: "Canada Post", trackingNumber: "7023 1234", trackingUrl: "https://www.canadapost-postescanada.ca/track" } }] }), "c1", NOW))!;
  const html = renderToStaticMarkup(createElement(ParentWorkbooks, { view, days: null, list: null, scanOpen: true }));
  expect(html).toContain('href="/account/workbooks/c1/answers/wb-1"');
  expect(html).not.toContain('href="/account/workbooks/c1/answers/wb-2"');
  expect(html).toContain("Available after delivery");
  expect(html).toContain('href="https://www.canadapost-postescanada.ca/track"');
  expect(html).toContain("7023 1234");
});
