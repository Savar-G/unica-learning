import { expect, it } from "vitest";
import { confirmedWorkbookDelivery } from "@/lib/workbook-delivery-access";
import { readWorkbooks } from "@/lib/parent-view";
import { memoryParentViewReaders } from "@/lib/parent-view-memory";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
const NOW = Date.parse("2026-11-06T20:00:00Z");
const receipt = { childId: "c1", workbookId: "b1", deliveredAt: "2026-11-03T20:00:00Z" };
it("uses the greatest correction audit, denies a missing receipt or another child, and denies future effective times", () => {
  const changes = [
    { workbookId: "b1", deliveredAt: "2026-11-04T20:00:00Z", auditId: 9 },
    { workbookId: "b1", deliveredAt: "2026-11-02T20:00:00Z", auditId: 8 },
  ];
  expect(confirmedWorkbookDelivery([receipt], changes, "c1", "b1", NOW)).toBe(changes[0].deliveredAt);
  expect(confirmedWorkbookDelivery([], changes, "c1", "b1", NOW)).toBeNull();
  expect(confirmedWorkbookDelivery([receipt], changes, "c2", "b1", NOW)).toBeNull();
  expect(confirmedWorkbookDelivery([receipt], [...changes, { workbookId: "b1", deliveredAt: "2026-11-07T20:00:00Z", auditId: 10 }], "c1", "b1", NOW)).toBeNull();
  expect(confirmedWorkbookDelivery([receipt], [{ workbookId: "b1", deliveredAt: "bad date", auditId: 11 }], "c1", "b1", NOW)).toBeNull();
});
it("releases each old book independently and closes the list link after correction or retraction", async () => {
  const tables = { children: [{ id: "c1", parentId: "p1", firstName: "Leah", grade: 3, createdAt: "2026-01-01" }], cards: [{ parentId: "p1", childId: "c1", cardSavedAt: "2026-01-01" }],
    workbooks: [1, 2].map(number => ({ id: `b${number}`, childId: "c1", parentId: "p1", number, status: "shipped", shippedAt: "2026-10-01" })),
    deliveries: [{ ...receipt, parentId: "p1" }], corrections: [{ parentId: "p1", childId: "c1", workbookId: "b1", deliveredAt: "2026-11-04T20:00:00Z", auditId: 4 }],
  };
  const read = () => readWorkbooks(memoryParentViewReaders(tables).parent("p1"), "c1", NOW);
  expect((await read())?.books).toEqual([
    { id: "b2", number: 2, shippedOn: "2026-09-30", deliveredOn: null },
    { id: "b1", number: 1, shippedOn: "2026-09-30", deliveredOn: "2026-11-04" },
  ]);
  tables.corrections[0].deliveredAt = "2026-11-07T20:00:00Z";
  expect((await read())?.books.every(book => book.deliveredOn === null)).toBe(true);
  tables.deliveries = [];
  expect((await read())?.books.every(book => book.deliveredOn === null)).toBe(true);
});
