import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { sampleReportView } from "@/lib/sample-children";
import { ReportCard } from "@/components/report";
import type { FirstPagesView } from "@/components/report-first-pages";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

// "{child}'s first pages" on the report (docs/first-pages.md): the row, its place before the next step, and its action.

const pages: FirstPagesView = { pages: [
  { number: 1, kind: "cover", url: "https://x.test/p1.png?token=a", width: 1275, height: 1650 },
  { number: 4, kind: "lesson", url: "https://x.test/p4.png?token=b", width: 1275, height: 1650 },
  { number: 5, kind: "practice", url: "https://x.test/p5.png?token=c", width: 1275, height: 1650 },
  { number: 6, kind: "practice", url: "https://x.test/p6.png?token=d", width: 1275, height: 1650 },
] };
const start = (saved: boolean) => ({ src: "account" as const, asked: false, start: { saved: saved ? "one" as const : null, joined: false, cancelled: false } });

describe("the first pages on the report", () => {
  it("shows the four pages after 'What's in workbook 1' and before the next step, with 'Start your plan today'", () => {
    const view = { ...sampleReportView(), planOffer: { monthly: 79.99, window: "new" as const } };
    const html = renderToStaticMarkup(createElement(ReportCard, { view, next: start(false), firstPages: pages }));
    const name = view.childName;
    expect(html).toContain(`${name}&#x27;s first pages`);
    for (const p of pages.pages) expect(html).toContain(p.url.replace("?", "?").replace("&", "&amp;"));
    expect(html.match(/<img /g)?.length).toBeGreaterThanOrEqual(4);
    const row = html.indexOf('id="rpt-first-pages"');
    expect(row).toBeGreaterThan(html.indexOf('id="rpt-book-one"'));
    expect(row).toBeLessThan(html.indexOf('id="rpt-next"'));
    expect(html).toContain('href="#rpt-next">Start your plan today</a>');
    expect(html).toContain("Your family gets one free month. It starts when your first workbook arrives.");
  });

  it("leaves out the action once a card is saved, and on a read-only copy", () => {
    const view = sampleReportView();
    const saved = renderToStaticMarkup(createElement(ReportCard, { view, next: start(true), firstPages: pages }));
    expect(saved).toContain('id="rpt-first-pages"');
    expect(saved).not.toContain("Start your plan today");
    const readOnly = renderToStaticMarkup(createElement(ReportCard, { view, readOnly: true, firstPages: pages }));
    expect(readOnly).not.toContain("Start your plan today");
  });

  it("shows nothing without ready pages: the report is as it was", () => {
    const view = sampleReportView();
    const without = renderToStaticMarkup(createElement(ReportCard, { view, next: start(false) }));
    expect(without).not.toContain("rpt-first-pages");
    expect(without).toBe(renderToStaticMarkup(createElement(ReportCard, { view, next: start(false), firstPages: null })));
  });
});
