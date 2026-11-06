import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ParentWorkbooks } from "@/components/parent-workbooks";
import { readWorkbooks } from "@/lib/parent-view";
import { memoryParentViewReaders } from "@/lib/parent-view-memory";
vi.mock("server-only", () => ({}));
it("offers only delivered books' answer keys and no parent workbook PDF, including before delivery", async () => {
  const reader = memoryParentViewReaders({ children: [{ id: "c1", parentId: "p1", firstName: "Leah", grade: 3, createdAt: "2026-01-01" }], cards: [{ childId: "c1", parentId: "p1", cardSavedAt: "2026-10-01" }],
    workbooks: [1, 2].map(number => ({ id: `wb-${number}`, parentId: "p1", childId: "c1", number, status: "shipped", pdfPath: "private/whole.pdf", shippedAt: "2026-11-01T20:00:00Z" })),
    deliveries: [{ parentId: "p1", childId: "c1", workbookId: "wb-1", deliveredAt: "2026-11-02T20:00:00Z" }],
  }).parent("p1");
  const view = await readWorkbooks(reader, "c1", Date.parse("2026-11-06T20:00:00Z"));
  const html = renderToStaticMarkup(createElement(ParentWorkbooks, view!));
  expect(html).toContain('href="/account/workbooks/c1/answers/wb-1"');
  expect(html).not.toContain('href="/account/workbooks/c1/answers/wb-2"');
  expect(html).toContain("Available after delivery");
  expect(html).not.toMatch(/Print a page again|Download PDF|\/api\/account\/workbooks|private\/whole/);
});
