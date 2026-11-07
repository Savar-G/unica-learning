import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { memoryParentViewReaders, type MemoryParentViewTables } from "@/lib/parent-view-memory";

const fake = vi.hoisted(() => ({ parent: "parent" as string | null, dashboard: true, scans: true, marking: true, reader: null as unknown, history: vi.fn(), access: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/account/workbooks/child", redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error("not-found"); } }));
vi.mock("@/lib/supabase-auth", () => ({ sessionClient: async () => ({}), parentId: async () => fake.parent, adminClient: () => ({}) }));
vi.mock("@/lib/parent-dashboard-server", () => ({ parentDashboard: async () => fake.dashboard }));
vi.mock("@/lib/parent-view-server", () => ({ parentViewReader: () => fake.reader }));
vi.mock("@/lib/scan-pages-access", () => ({ scanPagesAccess: async () => fake.scans }));
vi.mock("@/lib/scan-marking-server", () => ({ markingAccess: async () => { fake.access(); return fake.marking; } }));
vi.mock("@/components/scan-history", async importOriginal => {
  const actual = await importOriginal<typeof import("@/components/scan-history")>();
  return { ...actual, ScanHistory: (props: { parent: string; child: string; books: string[] }) => {
    fake.history(props);
    return createElement("div", { "data-history-child": props.child }, "Selected page history");
  } };
});
import Workbooks from "./page";
const page = (child = "child") => Workbooks({ params: Promise.resolve({ child }), searchParams: Promise.resolve({}) });
beforeEach(() => {
  Object.assign(fake, { parent: "parent", dashboard: true, scans: true, marking: true }); fake.history.mockClear(); fake.access.mockClear();
  fake.reader = memoryParentViewReaders({
    children: [{ id: "child", parentId: "parent", firstName: "Leah", grade: 3, createdAt: "2026-01-01" }, { id: "sibling", parentId: "parent", firstName: "Kai", grade: 2, createdAt: "2026-02-01" }, { id: "foreign", parentId: "other-parent", firstName: "Foreign", grade: 3, createdAt: "2026-01-01" }],
    cards: ["child", "sibling"].map(childId => ({ childId, parentId: "parent", cardSavedAt: "2026-10-01" })),
    workbooks: [{ id: "own-book", parentId: "parent", childId: "child", number: 2, status: "shipped", pdfPath: null, shippedAt: "2026-10-01" }, { id: "past-book", parentId: "parent", childId: "child", number: 1, status: "shipped", pdfPath: null, shippedAt: "2026-09-01" }, { id: "sibling-book", parentId: "parent", childId: "sibling", number: 1, status: "shipped", pdfPath: null, shippedAt: "2026-10-01" }],
    deliveries: [{ parentId: "parent", childId: "child", workbookId: "past-book", deliveredAt: "2026-09-02" }],
  }).parent("parent");
});
it("composes history for only the selected child and its current and past shipped books", async () => {
  const html = renderToStaticMarkup(await page());
  expect(fake.history).toHaveBeenLastCalledWith({ parent: "parent", child: "child", books: ["own-book", "past-book"] });
  expect(html).toContain("Selected page history");
  expect(html).toContain('href="/account/workbooks/child/answers/past-book"');
  expect(html).not.toContain('href="/account/workbooks/child/answers/own-book"');
  expect(html).not.toContain("sibling-book");
  renderToStaticMarkup(await page("sibling"));
  expect(fake.history).toHaveBeenLastCalledWith({ parent: "parent", child: "sibling", books: ["sibling-book"] });
});
it.each(["scans", "marking"] as const)("a closed %s gate renders a useful state without mounting history", async gate => {
  fake[gate] = false;
  const html = renderToStaticMarkup(await page());
  expect(html).toContain("Page history is not available here");
  expect(html).not.toContain("Loading page history");
  expect(fake.history).not.toHaveBeenCalled();
  expect(html).toContain('href="/account/workbooks/child/answers/past-book"');
});
it("refuses a foreign or missing child before history access", async () => {
  for (const child of ["foreign", "missing"]) await expect(page(child)).rejects.toThrow("not-found");
  expect(fake.history).not.toHaveBeenCalled(); expect(fake.access).not.toHaveBeenCalled();
});
it("preserves sign-in and dashboard access", async () => {
  fake.parent = null; await expect(page()).rejects.toThrow("redirect:/sign-in");
  fake.parent = "parent"; fake.dashboard = false; await expect(page()).rejects.toThrow("not-found");
  expect(fake.history).not.toHaveBeenCalled();
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
