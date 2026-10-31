import { describe, expect, it } from "vitest";
import { checkQuestionPackage } from "@/lib/question-package";
import { pageSlots, type PlannedSlot } from "@/lib/workbook-page";
import type { PlannedPage, PlannedPart } from "@/lib/workbook-plan";
import { sampleBook } from "@/lib/workbook-sample-book";

// Workbook pages and their slots (#310): the planner's parts map into named slots per page type, and a book is
// assembled in order (cover, How + Plan, the ten days, back cover, blank pages to a multiple of 4) with page IDs, page
// numbers from the cover and question numbers from 1 on each page. Driven through sampleBook, which plans with the real
// planner and fills every slot.

const CHILD = "22222222-2222-4222-8222-222222222222";
const book = (level: string, o: { number?: number; testWorkbook?: boolean } = {}) =>
  sampleBook({ level, workbookId: "55555555-5555-4555-8555-000000000001", childId: CHILD, child: "Leah", number: o.number ?? 2, testWorkbook: o.testWorkbook });

const part = (kind: PlannedPart["kind"], items: number, over: Partial<PlannedPart> = {}): PlannedPart =>
  ({ kind, unit: null, step: null, skills: ["3.3-add-within-1000"], items, hints: true, ...over });
const page = (type: PlannedPage["type"], parts: PlannedPart[]): PlannedPage => ({ number: 3, type, unit: "A", instructions: "text", parts });
const names = (slots: PlannedSlot[]) => slots.map((s) => `${s.slot}:${s.items}`);

describe("assembleBook", () => {
  it.each([["U12", 84], ["U22", 64], ["U6", 84], ["U2", 60]])("puts a %s book in order and pads it to a multiple of 4 (%i pages)", (level, total) => {
    const { draft, plan } = book(level);
    const types = draft.pages.map((p) => p.type);
    const dayPages = plan.days.reduce((n, d) => n + d.pages.length, 0);

    expect(types[0]).toBe("cover");
    expect(types[1]).toBe("how-plan");
    expect(types[2 + dayPages]).toBe("back-cover");
    expect(types.slice(3 + dayPages).every((t) => t === "blank")).toBe(true);
    expect(draft.pages.length).toBe(total);
    expect(draft.pages.length % 4).toBe(0);
    expect(draft.pages.map((p) => p.number)).toEqual(draft.pages.map((_, i) => i + 1));
  });

  it("prints each page's ID and keeps the plan page's page ranges true to the book", () => {
    const { draft } = book("U12");
    const ids = draft.pages.map((p) => p.content!.id);
    expect(ids.slice(0, 4)).toEqual(["UL·LEAH·W02·COVER", "UL·LEAH·W02·HOW+PLAN", "UL·LEAH·W02·D01·P1", "UL·LEAH·W02·D01·P2"]);
    expect(ids[82]).toBe("UL·LEAH·W02·BACK");
    expect(ids[83]).toBe("UL·LEAH·W02·BLANK");

    const plan = draft.pages[1].content!;
    if (plan.kind !== "how-plan") throw new Error("not the plan page");
    for (const row of plan.rows) {
      const [first, last] = row.pages;
      const day = (n: number) => draft.pages[n - 1].content;
      expect(day(first)).toMatchObject({ kind: "day", day: row.day, page: 1 });
      expect(day(last)).toMatchObject({ kind: "day", day: row.day, page: last - first + 1, pages: last - first + 1 });
    }
  });

  it("numbers questions from 1 on each page, gives each package its place, and every slot names only its page's questions", () => {
    const { draft } = book("U12");
    for (const p of draft.pages) {
      expect(p.questions.map((q) => q.number)).toEqual(p.questions.map((_, i) => i + 1));
      for (const q of p.questions) {
        expect(q.package.ref).toEqual({ source: "workbook", workbookId: draft.id, page: p.number, question: q.number });
        expect(checkQuestionPackage(q.package).status).not.toMatch(/failed|unsupported/);
      }
      const c = p.content!;
      if (c.kind === "day") expect(c.blocks.flatMap((b) => b.items).sort((a, b) => a - b)).toEqual(p.questions.map((q) => q.number));
    }
  });

  it("covers every page type of a day across the sample levels and a level's last book", () => {
    const types = new Set([book("U2"), book("U6"), book("U12"), book("U22"), book("U12", { testWorkbook: true })].flatMap((b) => b.draft.pages.map((p) => p.type)));
    expect([...types].sort()).toEqual([
      "back-cover", "blank", "challenge", "cover", "friday-5", "how-plan", "level-test", "math-in-the-world", "new-idea", "parent-led",
      "practice", "practice-2", "remember-these", "remember-these-mixed-set", "show-what-you-know", "unit-b", "warm-up", "word-problems",
    ]);
  });

  it("gives a workbook 2 Fix it boxes and a first workbook none", () => {
    const slots = (b: ReturnType<typeof book>) => b.draft.pages.flatMap((p) => (p.content?.kind === "day" ? p.content.blocks.map((x) => x.slot) : []));
    expect(slots(book("U12", { number: 2 }))).toContain("fix-it");
    expect(slots(book("U12", { number: 1 }))).not.toContain("fix-it");
  });

  it("is deterministic", () => {
    expect(JSON.stringify(book("U22").draft)).toBe(JSON.stringify(book("U22").draft));
  });
});

describe("pageSlots", () => {
  it("lays a faded practice part out as Watch one, Finish these and On your own", () => {
    expect(names(pageSlots(page("practice", [part("practice", 8, { faded: { watch: 1, finish: 2 } })]), 12)))
      .toEqual(["watch-one:0", "finish-these:2", "on-your-own:5"]);
  });

  it("keeps the 6-page Practice page to what it holds: 2 On your own items and no spare Remember these?", () => {
    const slots = pageSlots(page("practice", [
      part("practice", 8, { faded: { watch: 1, finish: 2 } }), part("solve-it-two-ways", 1), part("spot-the-error", 1), part("remember-these", 4),
    ]), 22);
    expect(names(slots)).toEqual(["watch-one:0", "finish-these:2", "on-your-own:2", "solve-it-two-ways:1", "spot-the-error:1"]);
  });

  it("puts Practice 2 in rows of four, fewer beside Solve it two ways and Spot the error", () => {
    expect(names(pageSlots(page("practice-2", [part("practice", 12)]), 12))).toEqual(["practice-row:4", "practice-row:4", "practice-row:4"]);
    expect(names(pageSlots(page("practice-2", [part("practice", 12), part("solve-it-two-ways", 1), part("spot-the-error", 1)]), 12)))
      .toEqual(["practice-row:4", "practice-row:4", "solve-it-two-ways:1", "spot-the-error:1"]);
  });

  it("gives a New idea part its worked example and a Now you card, with 2 items beside Spot the error", () => {
    expect(names(pageSlots(page("new-idea", [part("new-idea", 4)]), 12))).toEqual(["worked-example:0", "now-you:4"]);
    expect(names(pageSlots(page("new-idea", [part("new-idea", 4), part("spot-the-error", 1)]), 12))).toEqual(["worked-example:0", "now-you:2", "spot-the-error:1"]);
  });

  it("shows Unit B's new step as its worked example, then practice; a reminder panel on other days", () => {
    const b = { unit: "B" as const };
    expect(names(pageSlots(page("unit-b", [part("new-idea", 4, b), part("practice", 8, b)]), 12))).toEqual(["worked-example:0", "unit-b-practice:6"]);
    expect(names(pageSlots(page("unit-b", [part("practice", 8, b)]), 12))).toEqual(["reminder:0", "unit-b-practice:8"]);
  });

  it("adds a How do you know? to the stories and splits Math in the world into its plan, parts and final answer", () => {
    expect(names(pageSlots(page("word-problems", [part("word-problems", 3)]), 12))).toEqual(["word-problems:3", "how-do-you-know:1"]);
    expect(names(pageSlots(page("math-in-the-world", [part("math-in-the-world", 1)]), 22))).toEqual(["math-in-the-world:3"]);
  });

  it("shares a parent-led page's six cards among its slots in order", () => {
    const slots = pageSlots(page("parent-led", [part("remember-these", 6), part("fix-it", 3)]), 2);
    expect(names(slots)).toEqual(["remember-these:6"]);
    const taught = pageSlots(page("parent-led", [part("new-idea", 5), part("spot-the-error", 1)]), 2);
    expect(names(taught)).toEqual(["worked-example:0", "spot-the-error:1"]);
  });
});
