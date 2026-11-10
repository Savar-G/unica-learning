import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminScanProgress, ScanHold, scanTotals } from "@/components/admin-scan-progress";

describe("admin scan display", () => {
  it("shows the delivery action even when the manifest is unavailable", () => {
    const html = renderToStaticMarkup(createElement(AdminScanProgress, { workbookId: "book", view: null, missingDelivery: true }));
    expect(html).toContain("Delivery not confirmed");
    expect(html).toContain("/admin/workbooks/book");
    expect(html).toContain("Scan progress is unavailable");
  });
  it("does not call an unknown delivery missing", () => {
    const html = renderToStaticMarkup(createElement(AdminScanProgress, { workbookId: "book", view: null, missingDelivery: null }));
    expect(html).not.toContain("Delivery not confirmed");
    expect(html).toContain("Scan progress is unavailable");
  });
  it("names the next book and the action for a hold", () => {
    const html = renderToStaticMarkup(createElement(ScanHold, { number: 1 }));
    expect(html).toContain("No pages scanned by day 21: book 2 is on hold until the family scans.");
    expect(html).toContain("Ask the family to scan their pages.");
  });
  it("uses the plain words for the day 7 snapshot and the day 21 deadline", () => {
    const view = { number: 1, delivery: "confirmed", backstop: "Nov 30, 2026, 4:00 p.m. PST", claim: { reason: "day7_scanned", at: "Nov 21, 2026, 7:12 p.m. PST" }, held: false, days: [] };
    const html = renderToStaticMarkup(createElement(AdminScanProgress, { workbookId: "book", view: view as never, missingDelivery: null }));
    expect(html).toContain("Day 7 snapshot: taken Nov 21, 2026, 7:12 p.m. PST");
    expect(html).toContain("Day 21 deadline: Nov 30, 2026, 4:00 p.m. PST");
    expect(html).not.toContain("trigger");
    expect(html).not.toContain("backstop");
    const none = renderToStaticMarkup(createElement(AdminScanProgress, { workbookId: "book", view: { ...view, claim: null } as never, missingDelivery: null }));
    expect(none).toContain("Day 7 snapshot: not taken yet");
  });
  it("counts accepted scans of the required pages for the bar, and keeps the day table in a fold", () => {
    const days = [{ day: 1, required: [1, 2], accepted: [1], gaps: [2], pages: [] }, { day: 2, required: [3, 4], accepted: [3, 4, 9], gaps: [], pages: [] }];
    expect(scanTotals({ days })).toEqual({ accepted: 3, required: 4, percent: 75 });
    expect(scanTotals({ days: [] })).toEqual({ accepted: 0, required: 0, percent: 0 });
    const view = { number: 2, delivery: "confirmed", backstop: null, claim: null, held: false, days };
    const html = renderToStaticMarkup(createElement(AdminScanProgress, { workbookId: "book", view: view as never, missingDelivery: null }));
    expect(html).toContain('aria-label="3 of 4 pages scanned"');
    expect(html).toContain("<summary>Pages by day</summary>");
    expect(html).toContain("Workbook 2 scanned pages");
  });
});
