import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildBooks, type ProductionInput } from "@/lib/admin-production";
import type { WorkbookRun } from "@/lib/workbook-job";
import type { WorkbookSummary } from "@/lib/workbook-content";
import { ProductionBoard } from "@/components/admin-production";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }), usePathname: () => "/admin/workbooks", useSearchParams: () => new URLSearchParams() }));

const now = new Date("2026-11-10T20:00:00.000Z");
const ago = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const fam = () => ({ parentId: id(), childId: id() });

const run = (o: Partial<WorkbookRun> & { parentId: string; childId: string }): WorkbookRun => ({
  id: id(), createdAt: ago(600), number: 1, status: "done", step: null, attempts: 1, maxAttempts: 2, donePages: null, totalPages: null,
  heartbeatAt: ago(500), startedAt: ago(590), finishedAt: ago(500), error: null, errors: [], draftId: id(), draftKey: "k", resumes: 0,
  startedBy: { id: null, email: null }, runner: "mac", stoppedBy: null, ...o,
});
const book = (o: Partial<WorkbookSummary> & { parentId: string; childId: string }): WorkbookSummary => ({
  id: id(), number: 1, levels: [4], status: "approved", pdfPath: null, profileBuild: null, createdAt: ago(5000), approvedAt: ago(4000), printedAt: ago(3000), shippedAt: ago(2000), ...o,
});

const none = fam(), review = fam(), making = fam(), shipped = fam(), test = fam();
const reviewRun = run({ ...review, finishedAt: ago(30) });
const makingRun = run({ ...making, status: "running", step: "write", donePages: 26, totalPages: 40, heartbeatAt: ago(0.1), startedAt: ago(20), finishedAt: null, draftId: null });
const shippedBook = book({ ...shipped, status: "shipped" });
const data: ProductionInput = {
  runs: [
    { run: reviewRun, counts: { pages: 40, questions: 582, failed: 0, notChecked: 0, failedPages: 2 }, notRendered: 0, oldFormat: false },
    { run: makingRun },
    { run: run({ ...making, status: "failed", createdAt: ago(200), draftId: null, error: "The run cannot go on: the planned book (its pages, layouts or rooms) changed since it started (12fb23683921140e6f6cee107bbf then, 09da41e850d0b112c1c4e7f2e0c1 now). Start a new run." }) },
  ],
  workbooks: [shippedBook],
  deliveries: [],
  cards: [{ ...none, savedAt: ago(90) }, { ...test, savedAt: ago(90) }],
  plans: [],
  children: [
    { id: none.childId, parentId: none.parentId, firstName: "Ethan" }, { id: review.childId, parentId: review.parentId, firstName: "Mira" },
    { id: making.childId, parentId: making.parentId, firstName: "Theo" }, { id: shipped.childId, parentId: shipped.parentId, firstName: "Yusuf" },
    { id: test.childId, parentId: test.parentId, firstName: "Testkid" },
  ],
  parents: [{ id: review.parentId, name: "Priya Shah" }],
  tests: { show: true, isTest: (p) => p === test.parentId },
};
const html = (o: { stage?: "none" | "review" | null } = {}) =>
  renderToStaticMarkup(createElement(ProductionBoard, { books: buildBooks(data, now), now, runner: "mac" as const, ...o }));
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("the Production board", () => {
  it("counts real books in the tracker and marks the stages that need the team in words", () => {
    const t = text(html());
    expect(t).toContain("4 books by stage");
    expect(t.match(/Needs you/g)?.length).toBeGreaterThanOrEqual(3); // two tracker stages and the group heading
    expect(html()).toContain('href="/admin/workbooks?stage=review"');
  });

  it("gives each card one action at the place where it is done", () => {
    const h = html();
    expect(h).toContain(`href="/admin/workbooks/runs/${reviewRun.id}"`);
    expect(text(h)).toContain("Review draft");
    expect(text(h)).toContain("Prepare workbook");
    expect(h).toContain(`href="/admin/workbooks/runs/${makingRun.id}"`);
    expect(h).toContain(`href="/admin/workbooks/${shippedBook.id}#workbook-delivery"`);
    expect(text(h)).toContain("Confirm delivery");
  });

  it("shows checks, progress and earlier tries in plain words, with no hash", () => {
    const t = text(html());
    expect(t).toContain("2 pages do not fit");
    expect(t).toContain("Math check passed for all 582 questions");
    expect(t).toContain("65% done");
    expect(t).toContain("1 earlier try");
    expect(t).toContain("The book plan changed after this run started. Start a new run.");
    expect(t).not.toMatch(/12fb2368|09da41e8/);
    expect(html()).not.toMatch(/\u2014/);
  });

  it("tags a test family and leaves it out of the counts", () => {
    const t = text(html());
    expect(t).toContain("Testkid");
    expect(t).toMatch(/Needs you 2 /);
  });

  it("shows one stage with ?stage= and a way back to all", () => {
    const t = text(html({ stage: "review" }));
    expect(t).toContain("Mira");
    expect(t).not.toContain("Ethan");
    expect(t).toContain("Show all");
  });
});
