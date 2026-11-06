import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import Workbooks from "./page";
import { memoryParentViewReaders, type MemoryParentViewTables } from "@/lib/parent-view-memory";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ signedIn: true, dashboard: true, reader: null as unknown }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/parent-dashboard-server", () => ({ parentDashboard: async () => state.dashboard ? {} : null }));
vi.mock("@/lib/parent-view-server", () => ({ signedInParentView: async () => state.signedIn ? state.reader : null }));
const own = { parentId: "p1", childId: "c1" };
const render = async (extra: Partial<MemoryParentViewTables> = {}, child = "c1") => {
  state.reader = memoryParentViewReaders({ children: [{ ...own, id: "c1", firstName: "Leah", grade: 3, createdAt: "2026-01-01" }], cards: [{ ...own, cardSavedAt: "2026-10-01" }], ...extra }).parent("p1");
  return renderToStaticMarkup(await Workbooks({ params: Promise.resolve({ child }) } as never));
};
beforeEach(() => { state.signedIn = true; state.dashboard = true; });

it("keeps sign-in, dashboard and family checks before the extracted view", async () => {
  state.signedIn = false;
  await expect(render()).rejects.toThrow("REDIRECT /sign-in");
  state.signedIn = true; state.dashboard = false;
  await expect(render()).rejects.toThrow("NOT_FOUND");
  state.dashboard = true;
  await expect(render({}, "another-family-child")).rejects.toThrow("NOT_FOUND");
  await expect(render({ cards: [] })).rejects.toThrow("NOT_FOUND");
});

it("keeps the first-book empty state and real download and tracking links on the normal parent route", async () => {
  expect(await render()).toContain("first workbook is on its way");
  const html = await render({ workbooks: [{ ...own, id: "wb-1", number: 1, status: "shipped", shippedAt: "2026-11-01T20:00:00Z", pdfPath: "private/book.pdf" }], dispatches: [{ ...own, number: 1, delivery: { method: "mail", carrier: "Canada Post", trackingNumber: "7023 1234", trackingUrl: "https://www.canadapost-postescanada.ca/track" } }] });
  expect(html).toContain('href="/api/account/workbooks/wb-1/pdf"');
  expect(html).toContain('href="https://www.canadapost-postescanada.ca/track"');
  expect(html).toContain("7023 1234");
});
