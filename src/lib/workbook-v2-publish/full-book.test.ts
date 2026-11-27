import { describe, expect, it } from "vitest";
import { COVER_PAGES, MAX_TOTAL_PAGES } from "@/lib/workbook-v2/assemble/plan-book";
import { planBook, wholeBookFindings } from "@/lib/workbook-v2/build/build-book";
import { validateSnapshot } from "@/lib/workbook-v2/bank/snapshot";
import { FULL_BOOK_SHEETS, FULL_BOOK_SNAPSHOT, fullBookPlan } from "./full-book";
import { bookInput, requestProblem } from "./input";
import { request } from "./publish.fixtures";

// The full-size invented book (F1): a valid Level 3 snapshot and a whole book of 112 pages with its cover and 1,378 questions.

const tokens = (count: number) => Array.from({ length: 2 * count }, (_, i) => `token${String(i).padStart(19, "0")}`);
const planned = (region = "CA", sheets = fullBookPlan()) => {
  const plan = planBook({ snapshot: structuredClone(FULL_BOOK_SNAPSHOT), book: bookInput(request({ sheets, region }), "book-1", tokens(sheets.length)) });
  if (!plan.ok) throw new Error(plan.problems.join("\n"));
  return plan;
};

describe("the full-size invented book", () => {
  it("has a snapshot that the engine accepts", () => {
    const result = validateSnapshot(structuredClone(FULL_BOOK_SNAPSHOT));
    expect(result.ok ? [] : result.problems).toEqual([]);
  });

  it("plans 54 sheets: 9 days of 6, each day started by its first sheet, repeats first, with no sheet and attempt twice", () => {
    const plan = fullBookPlan();
    expect(plan).toHaveLength(FULL_BOOK_SHEETS);
    expect(plan.filter((s) => s.startsDay).map((s) => s.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(new Set(plan.map((s) => `${s.sheetId}/${s.attempt}`)).size).toBe(FULL_BOOK_SHEETS);
    expect(plan.map((s) => s.attempt)).toEqual([...Array<number>(12).fill(2), ...Array<number>(42).fill(1)]);
    expect(requestProblem(request({ sheets: plan }))).toBeNull();
  });

  it("is a whole book: at most 120 pages with its cover in sheets of 4, in level order with repeats first, 12 pages a day", () => {
    const plan = planned();
    expect(plan.pages.length + COVER_PAGES).toBe(112);
    expect(plan.pages.length + COVER_PAGES).toBeLessThanOrEqual(MAX_TOTAL_PAGES);
    expect(wholeBookFindings(plan, 12)).toEqual([]);
    for (const sheets of [2, 4, 6, 12, 48]) expect(wholeBookFindings(planned("CA", fullBookPlan(sheets)), 2 * Math.min(sheets, 6))).toEqual([]);
  });

  it("makes a book of 108 pages and 1,378 questions of every template and both answer kinds of it, in both region packs", () => {
    for (const region of ["CA", "US"]) {
      const plan = planned(region);
      expect(plan.pages).toHaveLength(108);
      expect(plan.items).toHaveLength(1378);
      expect(new Set(plan.pages.map((p) => p.template))).toEqual(new Set(["facts-2x10", "brackets-2x6", "columns-2x4", "figures-1x4", "stories-1x3"]));
      expect(new Set(plan.items.flatMap((i) => i.answer.parts.map((p) => p.kind)))).toEqual(new Set(["whole-number", "quantity"]));
      expect(plan.pages.filter((p) => p.captures.length > 0)).toHaveLength(9);
    }
  });

  it("prints a fraction in a word problem", () => {
    const texts = planned("US").items.filter((i) => i.face.kind === "story").map((i) => JSON.stringify(i.face));
    expect(texts.some((t) => t.includes("½"))).toBe(true);
  });

  it("keeps fewer sheets of the plan in its order", () => {
    expect(fullBookPlan(4)).toEqual(fullBookPlan().slice(0, 4));
  });
});
