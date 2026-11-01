import { describe, expect, it } from "vitest";
import { fakePrintEngine } from "@/lib/print-engine-fake";
import { packageItem } from "@/lib/question-package";
import { workbookProblem } from "@/lib/workbook-content";
import { renderWorkbook, type DraftPage, type WorkbookDraft } from "@/lib/workbook-render";
import { sampleBook } from "@/lib/workbook-sample-book";
import { workbookTemplate } from "@/lib/workbook-template";

// The workbook templates (#310) through the renderer with the fake print engine: every page type of the sample books
// has a layout and prints its number and QR code, the rendered book is one the store takes, and the template's fit
// check fails a page whose content overflows a slot, a slot holding more than it takes, or writing space smaller than
// DESIGN.md allows, naming the page, the slot and the question. src/lib/workbook-template-chromium.test.ts lays the same
// pages out in real Chromium.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const WORKBOOK = "55555555-5555-4555-8555-000000000002";
const book = (level: string, testWorkbook = false) =>
  sampleBook({ level, workbookId: WORKBOOK, childId: CHILD, child: "Mateo", number: 2, testWorkbook }).draft;
const render = (draft: WorkbookDraft, engine = fakePrintEngine()) => renderWorkbook({ draft, parentId: PARENT, template: workbookTemplate(), engine });
/** A book of one page. */
const only = (draft: WorkbookDraft, p: DraftPage): WorkbookDraft => ({ ...draft, pages: [p] });
const first = (draft: WorkbookDraft, type: string) => draft.pages.find((p) => p.type === type)!;
/** The content area where DESIGN.md puts it: 688 by 720 under the header. */
const AREA = { "1 slot-content": { x: 64, y: 210, width: 688, height: 720 } };

describe("the workbook templates", () => {
  it.each([["U2"], ["U6"], ["U12"], ["U22"]])("lay out every page of a %s sample book, and the book is one the store takes", async (level) => {
    const result = await render(book(level));
    if (result.status !== "rendered") throw new Error(JSON.stringify(result.problems.slice(0, 5)));
    expect(workbookProblem(result.workbook)).toBeNull();
    expect(result.workbook.pages.length % 4).toBe(0);
  });

  it("lays out a level's last book, with the level test", async () => {
    const draft = book("U12", true);
    expect(draft.pages.some((p) => p.type === "level-test")).toBe(true);
    expect((await render(draft)).status).toBe("rendered");
  });

  it("prints on every page its ID, its book page number, its QR code and four scan marks", () => {
    const draft = book("U12");
    const template = workbookTemplate();
    for (const p of [draft.pages[0], draft.pages[1], draft.pages[2], draft.pages.at(-2)!, draft.pages.at(-1)!]) {
      const html = template.page(p, { qr: `<div data-measure="qr"></div>`, qrUrl: "https://unicalearning.com/tutor/p/x" }, draft)!;
      expect(html).toContain(`data-measure="page-number">${p.number}<`);
      expect(html).toContain(p.content!.id);
      expect(html).toContain(`data-measure="qr"`);
      expect(html.match(/class="scan /g)).toHaveLength(4);
    }
  });

  it("has no layout for a page with no slot content", async () => {
    const draft = book("U12");
    const bare: DraftPage = { ...draft.pages[2], content: undefined };
    expect(await render(only(draft, bare))).toEqual({
      status: "failed", problems: [{ page: 3, question: null, reason: "the template has no layout for a warm-up page" }],
    });
  });
});

describe("the fit check", () => {
  const draft = book("U12");
  const practice = first(draft, "practice");
  const content = practice.content!;
  if (content.kind !== "day") throw new Error("not a day page");
  const own = content.blocks.find((b) => b.slot === "on-your-own")!;
  const last = own.items.at(-1)!;

  it("fails a page whose question runs past the content area, naming the page, the slot and the question", async () => {
    const engine = fakePrintEngine({
      rects: { "1 slot-content": { x: 64, y: 210, width: 688, height: 720 }, [`1 question-${last}`]: { x: 64, y: 900, width: 100, height: 80 } },
    });
    const result = await render(only(draft, practice), engine);
    expect(result).toEqual({
      status: "failed",
      problems: [{
        page: practice.number, question: last, slot: "on-your-own",
        reason: `day 1 page 3 (practice): question ${last} in the on-your-own slot runs 50 px past the bottom of the content area`,
      }],
    });
  });

  it("fails a slot holding more items than it takes", async () => {
    const extra = practice.questions.slice(0, 4).map((q, k) => {
      const number = practice.questions.length + k + 1;
      return { ...q, number, package: { ...q.package, id: `${q.package.id}-x`, ref: { ...q.package.ref, question: number } as typeof q.package.ref } };
    });
    const crowded: DraftPage = {
      ...practice,
      questions: [...practice.questions, ...extra],
      content: { ...content, blocks: content.blocks.map((b) => (b.slot === "on-your-own" ? { ...b, items: [...b.items, ...extra.map((q) => q.number)] } : b)) },
    };
    const result = await render(only(draft, crowded));
    expect(result.status === "failed" && result.problems).toEqual([
      { page: practice.number, question: null, slot: "on-your-own", reason: "day 1 page 3 (practice): the on-your-own slot holds 9 items; it takes at most 8" },
    ]);
  });

  it("fails an answer box smaller than the level band allows: 40 px from U10, 56 px at U1 to U3", async () => {
    const at = (n: number) => ({
      ...AREA, [`1 question-${n}`]: { x: 64, y: 290, width: 600, height: 80 },
      [`1 question-${n}-content`]: { x: 64, y: 300, width: 30, height: 20 }, [`1 question-${n}-answer`]: { x: 100, y: 300, width: 64, height: 44 },
    });
    const mid = first(draft, "warm-up");
    expect((await render(only(draft, mid), fakePrintEngine({ rects: at(1) }))).status).toBe("rendered");

    const early = book("U2");
    const boxed = (p: DraftPage) => p.questions.find((q) => packageItem(q.package).regions[0].kind === "box");
    const parent = early.pages.find((p) => p.type === "parent-led" && boxed(p))!;
    const n = boxed(parent)!.number;
    const result = await render(only(early, parent), fakePrintEngine({ rects: at(n) }));
    expect(result.status === "failed" && result.problems).toEqual([
      { page: parent.number, question: n, slot: expect.any(String), reason: expect.stringMatching(new RegExp(`question ${n}'s answer box height is 44 px; the design allows no less than 56$`)) },
    ]);
  });

  it("fails an answer box that covers its own question's text (R371-4)", async () => {
    const warm = first(draft, "warm-up");
    const c = warm.content!;
    if (c.kind !== "day") throw new Error("not a day page");
    const fix = c.blocks.find((b) => b.slot === "fix-it")!.items[0];
    const engine = fakePrintEngine({
      rects: {
        ...AREA,
        [`1 question-${fix}`]: { x: 100, y: 300, width: 180, height: 60 },
        [`1 question-${fix}-content`]: { x: 130, y: 310, width: 120, height: 22 },
        [`1 question-${fix}-answer`]: { x: 210, y: 305, width: 64, height: 44 },
      },
    });
    const result = await render(only(draft, warm), engine);
    expect(result.status === "failed" && result.problems).toEqual([
      { page: warm.number, question: fix, slot: "fix-it", reason: `day 1 page 1 (warm-up): question ${fix}'s answer box covers its own text` },
    ]);
  });

  it("fails writing lines closer than 36 px under their prompt and 34 px apart, and a work box under 44 px", async () => {
    const stories = first(draft, "word-problems");
    const c = stories.content!;
    if (c.kind !== "day") throw new Error("not a day page");
    const why = c.blocks.find((b) => b.slot === "how-do-you-know")!.items[0];
    const story = c.blocks.find((b) => b.slot === "word-problems")!.items[0];
    const engine = fakePrintEngine({
      rects: {
        ...AREA,
        [`1 question-${why}-answer`]: { x: 64, y: 700, width: 688, height: 60 },
        [`1 question-${why}`]: { x: 64, y: 690, width: 688, height: 80 },
        [`1 region-${story}-work`]: { x: 64, y: 300, width: 500, height: 30 },
      },
    });
    const result = await render(only(draft, stories), engine);
    expect(result.status === "failed" && result.problems.map((p) => [p.question, p.slot, p.reason.replace(/^.*: /, "")])).toEqual([
      [story, "word-problems", `question ${story}'s work box height is 30 px; the design allows no less than 44`],
      [why, "how-do-you-know", `question ${why}'s writing space is 60 px; the design allows no less than 70`],
    ]);
  });
});

describe("a sequence item", () => {
  it("prints its terms in order with its answer boxes in the blanks, on a parent-led card and in a line (#380)", async () => {
    const { buildQuestion } = await import("@/lib/workbook-generator-items");
    const num = (value: number) => ({ type: "number", value, numerator: null, denominator: null, whole: null, unit: null, hours: null, minutes: null, period: null, parts: [], text: null });
    for (const level of ["U2", "U12"]) {
      const draft = book(level);
      const page = draft.pages.find((p) => p.content?.kind === "day" && p.questions.length > 0)!;
      const q = page.questions[0];
      const built = buildQuestion({
        slot: "1.1", skill: "K1-number-sequence", difficulty: 1, text: "Fill the gap in the count.", format: "sequence", operation: null, wrongAnswers: [], easier: null,
        shownWrong: null, figure: null, numbers: [], places: null, direction: null, pattern: null, sequence: { start: num(3), step: num(1), terms: 5, blanks: [2, 4] },
      }, { id: q.package.id, workbookId: draft.id, page: page.number, question: q.number, level: 2, skills: ["K1-number-sequence"] });
      expect(built.check.status).toBe("checked");
      const seqPage: DraftPage = { ...page, questions: [{ number: q.number, package: { ...built.package!, ref: q.package.ref } }, ...page.questions.slice(1)] };
      const html = workbookTemplate().page(seqPage, { qr: "", qrUrl: "" }, draft)!;
      const seq = html.match(/<span class="seq">(.*?)<\/span><\/span>(?!<span class="qm">)/)?.[0] ?? "";
      const printed = [...seq.matchAll(/class="qm">([^<]*)</g)].map((m) => m[1]).filter((t) => t !== ",");
      expect(printed).toEqual(["3", "4", "6"]);
      expect(seq.match(/class="ab"/g)).toHaveLength(2);
      expect(seq).toContain(`data-measure="question-${q.number}-answer"`);
    }
  });
});

describe("an order item and a written reason on a parent-led card", () => {
  it("prints the numbers to put in order before the boxes, and the lines' label only when the question does not ask it (#380)", async () => {
    const { buildQuestion } = await import("@/lib/workbook-generator-items");
    const num = (value: number) => ({ type: "number", value, numerator: null, denominator: null, whole: null, unit: null, hours: null, minutes: null, period: null, parts: [], text: null });
    const draft = book("U2");
    const page = draft.pages.find((p) => p.content?.kind === "day" && p.questions.length > 1)!;
    const [a, b] = page.questions;
    const base = { slot: "1.1", skill: "K1-order-numerals", difficulty: 1, operation: null, wrongAnswers: [], easier: null, shownWrong: null, figure: null, places: null, sequence: null, pattern: null };
    const place = (q: typeof a) => ({ id: q.package.id, workbookId: draft.id, page: page.number, question: q.number, level: 2, skills: ["K1-order-numerals"] });
    const order = buildQuestion({ ...base, text: "Put in order, least first.", format: "order", numbers: [num(4), num(9), num(2)], direction: "up" }, place(a));
    const reason = buildQuestion({ ...base, text: "Is 3 more than 2? How do you know?", format: "written-reason", numbers: [], direction: null }, place(b));
    expect([order.check.status, reason.check.status]).toEqual(["checked", "not-checked"]);
    const html = workbookTemplate().page({
      ...page, questions: [{ number: a.number, package: { ...order.package!, ref: a.package.ref } }, { number: b.number, package: { ...reason.package!, ref: b.package.ref } }, ...page.questions.slice(2)],
    }, { qr: "", qrUrl: "" }, draft)!;
    expect(html).toContain(`<span class="seq"><span class="qm">4, 9, 2</span><span class="qm">→</span></span>`);
    expect(html.match(/How do you know\?/g)).toHaveLength(1);
  });
});

describe("a pattern item's choices", () => {
  it("are drawn as the shapes, not written as words (#380)", async () => {
    const { buildQuestion } = await import("@/lib/workbook-generator-items");
    const draft = book("U2");
    const page = draft.pages.find((p) => p.content?.kind === "day" && p.questions.length > 0)!;
    const q = page.questions[0];
    const built = buildQuestion({
      slot: "1.1", skill: "K4-extend-repeating", difficulty: 1, text: "What comes next?", format: "pattern", operation: null, wrongAnswers: [], easier: null,
      shownWrong: null, figure: null, numbers: [], places: null, direction: null, sequence: null, pattern: { core: ["circle", "triangle"], shapes: 6, blank: 5 },
    }, { id: q.package.id, workbookId: draft.id, page: page.number, question: q.number, level: 2, skills: ["K4-extend-repeating"] });
    expect(built.check.status).toBe("checked");
    const html = workbookTemplate().page({ ...page, questions: [{ number: q.number, package: { ...built.package!, ref: q.package.ref } }, ...page.questions.slice(1)] }, { qr: "", qrUrl: "" }, draft)!;
    const circ = html.match(/<span class="circ"[^>]*>(.*?)<\/span><\/span>/)?.[1] ?? "";
    expect(circ).toContain(`aria-label="circle"`);
    expect(circ).toContain(`aria-label="triangle"`);
    expect(circ).not.toMatch(/<span class="co">(circle|triangle)<\/span>/);
  });
});
