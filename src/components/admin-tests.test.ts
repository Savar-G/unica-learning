import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TestRow, WorkbookDetail } from "@/lib/admin-store";
import { NO_FILTERS } from "@/lib/admin-view";
import type { WorkbookStatus } from "@/lib/workbook-content";
import { TestsTable } from "@/components/admin";
import { TestsSummaryTiles } from "@/components/admin-tests";
import { AdminWorkbook } from "@/components/admin-workbook";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }), usePathname: () => "/admin", useSearchParams: () => new URLSearchParams() }));
// The frame reads the request (the test families switch, the sidebar counts); these tests check the page inside it.
vi.mock("@/components/admin-frame", () => ({ AdminFrame: ({ children, actions }: { children: unknown; actions?: unknown }) => [actions, children] }));

const visible = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, "\"").replace(/\s+/g, " ");

const row = (o: Partial<TestRow> = {}): TestRow => ({
  id: "t1", created_at: "2026-11-01T20:00:00Z", status: "completed", grade: 3, province: "BC", child_id: "c1", parent_id: "p1",
  started_at: "2026-11-01T20:00:00Z", completed_at: "2026-11-01T20:30:00Z", last_answer_at: "2026-11-01T20:29:00Z", route: "stay", stage3_route: null,
  help: "no", placement: null, answered: 42, reviews: { total: 0, low: 0 }, flags: [], child: null, parent: null, reportId: "r1", ...o,
});

describe("tests table", () => {
  it("puts status and answers in one Result cell and flags and AI reviews as chips", () => {
    const html = renderToStaticMarkup(createElement(TestsTable, { tests: [
      row(),
      row({ id: "t2", flags: [{ kind: "helped", answer: "yes" }], help: "yes", reviews: { total: 3, low: 1 } }),
      row({ id: "t3", status: "in_progress", flags: null, help: null, reportId: null }),
    ] }));
    const text = visible(html);
    expect(text).toContain("Result");
    expect(text).toContain("42 answered");
    expect(text).toContain("Help likely");
    expect(text).toContain("1 low AI of 3");
    expect(text).toContain("Did anyone help? Yes");
    // a test that has not finished shows no help answer
    expect(text.split("Did anyone help?")).toHaveLength(3);
    expect(html).not.toMatch(/<th[^>]*>(Answered|Level|Help\?)<\/th>/);
  });

  it("keeps the family table without the parent column", () => {
    const html = renderToStaticMarkup(createElement(TestsTable, { tests: [row()], family: true }));
    expect(html).not.toContain(">Parent<");
  });
});

describe("tests summary tiles", () => {
  it("links each tile to its filter and turns an active filter off", () => {
    const html = renderToStaticMarkup(createElement(TestsSummaryTiles, {
      summary: { started: 5, finished: 3, inProgress: 1, expired: 1, help: 1, lowAi: 0 },
      filters: { ...NO_FILTERS, grade: 3, status: "completed" }, action: "/admin/tests", scope: "Counts every test.",
    }));
    expect(html).toContain('href="/admin/tests?grade=3"');
    expect(html).toContain('href="/admin/tests?status=in_progress&amp;grade=3"');
    expect(html).toContain('href="/admin/tests?status=completed&amp;grade=3&amp;flag=help"');
    expect(html).toContain('aria-label="3 finished, 1 in progress, 1 expired"');
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
  });
});

describe("workbook page", () => {
  const at = "2026-11-01T20:00:00.000Z";
  const detail = (status: WorkbookStatus, delivered = false): WorkbookDetail => ({
    workbook: { id: "w1", parentId: "p1", childId: "c1", number: 2, levels: [3], status, pdfPath: "p1/w1/book.pdf", profileBuild: null, createdAt: at,
      approvedAt: status === "draft" ? null : at, printedAt: status === "printed" || status === "shipped" ? at : null, shippedAt: status === "shipped" ? at : null,
      pages: [{ number: 1, dayLabel: "Monday", type: "practice", image: null, qrToken: "qr", questions: [], printContract: null }],
      pdfSha256: null, printManifest: null, printedRevision: null },
    delivery: delivered ? { workbookId: "w1", parentId: "p1", childId: "c1", number: 2, deliveredAt: at, localTime: "2026-11-01T12:00", timeZone: "America/Vancouver", recordedAt: at, actorId: "a", auditId: 1 } : null,
    deliveryZone: "America/Vancouver", child: null, images: {}, audit: [], runId: "run1", firstShipped: false,
  });
  const page = (d: WorkbookDetail) => renderToStaticMarkup(createElement(AdminWorkbook, { email: "admin@example.com", detail: d }));

  it.each([
    ["approved", "Mark printed", 'id="print-and-ship"'],
    ["printed", "Mark shipped", 'id="print-and-ship"'],
    ["shipped", "Confirm workbook delivered", 'id="workbook-delivery"'],
  ] as const)("keeps the %s book's action and the anchor Production links to", (status, action, anchor) => {
    const html = page(detail(status));
    expect(html).toContain(action);
    expect(html).toContain(anchor);
    expect(html).toContain("Download PDF for print");
    expect(html.match(/aria-current="step"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("marks a delivered book done on every step", () => {
    const html = page(detail("shipped", true));
    expect(html).toContain("Delivery confirmed");
    expect(html).toContain('aria-label="Stage: Delivered"');
    expect(html).not.toContain("To do now");
  });

  it("puts the question tables in a closed section per page", () => {
    const html = page(detail("approved"));
    expect(html).toMatch(/<details class="adm-fold" id="page-1">/);
    expect(html).toContain('href="#page-1"');
  });
});
