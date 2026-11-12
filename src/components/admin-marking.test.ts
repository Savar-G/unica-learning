import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PageBars, WaitingCard } from "@/components/admin-marking";
import { pagesByBook, teamGroups } from "@/lib/admin-marking";

it("draws each book's bar with words for screen readers and a link that shows only that book", () => {
  const books = pagesByBook([
    { childId: "c1", childName: "Asha", workbookId: "w1", book: 2, status: "ready" },
    { childId: "c1", childName: "Asha", workbookId: "w1", book: 2, status: "review" },
  ]);
  const html = renderToStaticMarkup(createElement(PageBars, { books, href: (id: string) => `/admin/scans?workbook=${id}` }));
  expect(html).toContain('role="img" aria-label="Asha, Book 2: 1 of 2 pages marked, 1 our team is checking"');
  expect(html).toContain('href="/admin/scans?workbook=w1"');
});

it("lists a scanned page's waiting answers with the action it is given", () => {
  const [group] = teamGroups([
    { item: "i1", parent: "p1", child: "c1", childName: "Asha", book: 1, page: 4, question: 2, photo: "ph", since: "2026-11-09T10:00:00Z", testFamily: false, read: "12", issue: null },
    { item: "i2", parent: "p1", child: "c1", childName: "Asha", book: 1, page: 4, question: 5, photo: "ph", since: "2026-11-09T11:00:00Z", testFamily: false, read: "", issue: null },
  ]);
  const html = renderToStaticMarkup(createElement(WaitingCard, { group, test: false, since: "Nov 9, 2:00 a.m.", reason: () => "Waiting for a person to mark it.", action: createElement("a", { href: "/admin/scans/ph" }, "Open scan to mark") }));
  expect(html).toContain("Asha · Book 1, page 4");
  expect(html).toContain("2 answers");
  expect(html).toContain("Question 2");
  expect(html).toContain("<q>Empty</q>");
  expect(html).toContain('href="/admin/scans/ph"');
});
