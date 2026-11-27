import { describe, expect, it } from "vitest";
import { planBook } from "@/lib/workbook-v2/build/build-book";
import { validateSnapshot } from "@/lib/workbook-v2/bank/snapshot";
import { FULL_BOOK_SNAPSHOT, fullBookPlan } from "./full-book";
import { bookInput, requestProblem } from "./input";
import { request } from "./publish.fixtures";

// The full-size invented book (F1): a valid Level 3 snapshot and a plan of 120 pages with about 2,000 questions.

describe("the full-size invented book", () => {
  it("has a snapshot that the engine accepts", () => {
    const result = validateSnapshot(structuredClone(FULL_BOOK_SNAPSHOT));
    expect(result.ok ? [] : result.problems).toEqual([]);
  });

  it("plans 60 sheets: 10 days of 6, each day started by its first sheet, with no sheet and attempt twice", () => {
    const plan = fullBookPlan();
    expect(plan).toHaveLength(60);
    expect(plan.filter((s) => s.startsDay).map((s) => s.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(plan.map((s) => `${s.sheetId}/${s.attempt}`)).size).toBe(60);
    expect(requestProblem(request({ sheets: plan }))).toBeNull();
  });

  it("makes a book of 120 pages and 1,990 questions of every template and both answer kinds of it, in both region packs", () => {
    for (const region of ["CA", "US"]) {
      const plan = planBook({ snapshot: structuredClone(FULL_BOOK_SNAPSHOT), book: bookInput(request({ sheets: fullBookPlan(), region }), "book-1", Array.from({ length: 120 }, (_, i) => `token${String(i).padStart(19, "0")}`)) });
      if (!plan.ok) throw new Error(plan.problems.join("\n"));
      expect(plan.pages).toHaveLength(120);
      expect(plan.items).toHaveLength(1990);
      expect(new Set(plan.pages.map((p) => p.template))).toEqual(new Set(["facts-2x10", "brackets-2x6", "columns-2x4", "figures-1x4", "stories-1x3"]));
      expect(new Set(plan.items.flatMap((i) => i.answer.parts.map((p) => p.kind)))).toEqual(new Set(["whole-number", "quantity"]));
      expect(plan.pages.filter((p) => p.captures.length > 0)).toHaveLength(10);
    }
  });

  it("prints a fraction in a word problem", () => {
    const plan = planBook({ snapshot: structuredClone(FULL_BOOK_SNAPSHOT), book: bookInput(request({ sheets: fullBookPlan() }), "book-1", Array.from({ length: 120 }, (_, i) => `token${String(i).padStart(19, "0")}`)) });
    if (!plan.ok) throw new Error(plan.problems.join("\n"));
    const texts = plan.items.filter((i) => i.face.kind === "story").map((i) => JSON.stringify(i.face));
    expect(texts.some((t) => t.includes("½"))).toBe(true);
  });

  it("keeps fewer sheets of the plan in its order", () => {
    expect(fullBookPlan(4)).toEqual(fullBookPlan().slice(0, 4));
  });
});
