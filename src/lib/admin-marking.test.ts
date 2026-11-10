import { describe, expect, it } from "vitest";
import { pagesByBook, teamGroups } from "@/lib/admin-marking";

const item = (over: Partial<Parameters<typeof teamGroups>[0][number]> & { item: string }) => ({
  parent: "p1", child: "c1", childName: "Asha", book: 1, page: 3, question: 1, photo: "ph1", since: "2026-11-09T10:00:00Z", testFamily: false, ...over,
});

describe("teamGroups", () => {
  it("puts the answers of one scanned page together, oldest wait first", () => {
    const groups = teamGroups([
      item({ item: "a", question: 2, since: "2026-11-09T10:00:00Z" }),
      item({ item: "b", photo: "ph2", page: 4, since: "2026-11-08T10:00:00Z" }),
      item({ item: "c", question: 5, since: "2026-11-07T10:00:00Z" }),
    ]);
    expect(groups.map((g) => [g.photo, g.items.map((i) => i.item), g.since])).toEqual([
      ["ph1", ["a", "c"], "2026-11-07T10:00:00Z"],
      ["ph2", ["b"], "2026-11-08T10:00:00Z"],
    ]);
  });
  it("keeps each answer with no saved photo on its own", () => {
    const groups = teamGroups([item({ item: "a", photo: null }), item({ item: "b", photo: null })]);
    expect(groups.map((g) => g.items.map((i) => i.item))).toEqual([["a"], ["b"]]);
  });
});

describe("pagesByBook", () => {
  const page = (workbookId: string, status: Parameters<typeof pagesByBook>[0][number]["status"], childId = "c1") => ({ childId, childName: "Asha", workbookId, book: workbookId === "w1" ? 1 : 2, status });
  it("counts each book's shown pages by state", () => {
    const books = pagesByBook([page("w1", "ready"), page("w1", "blank"), page("w1", "review"), page("w2", "pending"), page("w2", "failed"), page("w2", "never-scanned"), page("w2", "unscored")]);
    expect(books.map((b) => [b.workbookId, b.total, b.n])).toEqual([
      ["w1", 3, { marked: 2, checking: 1, waiting: 0, failed: 0, none: 0 }],
      ["w2", 4, { marked: 1, checking: 0, waiting: 1, failed: 1, none: 1 }],
    ]);
  });
  it("never counts an uncounted child's pages", () => {
    expect(pagesByBook([page("w1", "ready", "test"), page("w2", "ready")], new Set(["test"])).map((b) => b.workbookId)).toEqual(["w2"]);
  });
});
