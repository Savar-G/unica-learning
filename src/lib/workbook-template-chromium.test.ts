import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { chromiumPrintEngine, findChromium } from "@/lib/print-engine-chromium";
import { proofPages, renderWorkbook, type DraftPage, type WorkbookDraft } from "@/lib/workbook-render";
import { sampleBook } from "@/lib/workbook-sample-book";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";
import { curriculumFor } from "@/lib/workbook-curriculum";

// The workbook templates (#310) laid out in real Chromium: one page of each type from sample books at U2 (parent-led),
// U6, U12, U22 and a level's last book fits its content area, prints its number and QR code, and stores a box for
// every question inside its page; a page given more questions than its slot takes fails, naming the page, the slot and
// the question pushed out, and its proof image shows the failure. Runs where a Chromium is found; skipped elsewhere.
// `node scripts/render-workbook-templates.mjs` renders whole sample books to look at.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const chromium = await findChromium();
const engine = chromiumPrintEngine();
const template = chromium ? workbookTemplate(await fixedTemplateFonts()) : workbookTemplate();
const book = (level: string, n: number, testWorkbook = false) =>
  sampleBook({ level, workbookId: `55555555-5555-4555-8555-00000000001${n}`, childId: CHILD, child: "Mateo", number: 2, testWorkbook }).draft;

/** One page of each type (a parent-led page per first slot), with the book's own page numbers. */
function oneOfEach(draft: WorkbookDraft): WorkbookDraft {
  const seen = new Set<string>();
  const pages = draft.pages.filter((p: DraftPage) => {
    const c = p.content;
    const key = p.type === "parent-led" && c?.kind === "day" ? `parent-led:${c.blocks[0]?.slot}` : p.type;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ...draft, pages };
}

describe.skipIf(!chromium)("the workbook templates in Chromium", () => {
  it.each([["U2", 1, false], ["U6", 2, false], ["U12", 3, false], ["U22", 4, false], ["U12", 5, true]] as const)(
    "lay out one page of each type of a %s book (test book: %s) within its content area",
    async (level, n, test) => {
      const draft = oneOfEach(book(level, n, test));
      const result = await renderWorkbook({ draft, parentId: PARENT, template, engine });
      if (result.status !== "rendered") throw new Error(JSON.stringify(result.problems.slice(0, 6)));
      for (const page of result.workbook.pages) {
        expect(page.image).toMatchObject({ width: 1275, height: 1650 });
        for (const { box } of page.questions) {
          expect(box.x + box.width).toBeLessThanOrEqual(1275);
          expect(box.y + box.height).toBeLessThanOrEqual(1650);
        }
      }
    },
    120_000,
  );

  it("fails a box over its own text: the Fix it cards before R371-4 let the sum run under the box", async () => {
    const draft = book("U12", 8);
    const warm = draft.pages.find((p) => p.content?.kind === "day" && p.content.blocks.some((b) => b.slot === "fix-it"))!;
    const before = { ...template, css: template.css + ".q .qb{min-width:0}" };
    const result = await renderWorkbook({ draft: { ...draft, pages: [warm] }, parentId: PARENT, template: before, engine });
    expect(result.status === "failed" && result.problems).toContainEqual(expect.objectContaining({
      slot: "fix-it", reason: expect.stringMatching(/answer box covers its own text$/),
    }));
    // As laid out now, the box wraps under the sum.
    expect((await renderWorkbook({ draft: { ...draft, pages: [warm] }, parentId: PARENT, template, engine })).status).toBe("rendered");
  }, 60_000);

  it("wraps the longest step name to a second line on every day page type, and fails a title too long for two (R371-5)", async () => {
    const bc = curriculumFor("bc")!;
    const steps = bc.levels.flatMap((l) => (bc.levelSkills(l.id) ?? []).flatMap((k) => (bc.skillSteps(k.id) ?? []).map((x) => x.name)));
    const longest = steps.reduce((a, b) => (b.length > a.length ? b : a));
    const sentence = bc.levels.flatMap((l) => (bc.levelSkills(l.id) ?? []).map((k) => k.text)).reduce((a, b) => (b.length > a.length ? b : a));
    const titled = (draft: WorkbookDraft, title: string): WorkbookDraft => ({
      ...draft,
      pages: oneOfEach(draft).pages.filter((p) => p.content?.kind === "day").map((p) => ({ ...p, content: { ...p.content!, title, topic: title } as typeof p.content })),
    });
    const headerProblems = (r: Awaited<ReturnType<typeof renderWorkbook>>) =>
      r.status === "failed" ? r.problems.filter((x) => x.slot === "title" || x.slot === "day-label") : [];

    for (const [level, n] of [["U2", 1], ["U6", 2], ["U12", 3], ["U22", 4]] as const) {
      const fits = await renderWorkbook({ draft: titled(book(level, n), `More practice: ${longest}`), parentId: PARENT, template, engine });
      expect(headerProblems(fits)).toEqual([]);
      const long = titled(book(level, n), sentence);
      const fails = await renderWorkbook({ draft: long, parentId: PARENT, template, engine });
      expect(new Set(headerProblems(fails).filter((x) => x.slot === "title").map((x) => x.page))).toEqual(new Set(long.pages.map((p) => p.number)));
    }
  }, 240_000);

  it("fails a cover whose title runs to a third line, naming the slot", async () => {
    const draft = book("U12", 7);
    const cover = draft.pages[0];
    const content = cover.content!;
    if (content.kind !== "cover") throw new Error("not the cover");
    const long = { ...cover, content: { ...content, title: ["Fractions, measuring", "and time and much more besides"] as [string, string] } };
    const result = await renderWorkbook({ draft: { ...draft, pages: [long] }, parentId: PARENT, template, engine });
    expect(result.status === "failed" && result.problems).toEqual([{ page: 1, question: null, slot: "cover-title", reason: "the cover-title does not fit its space" }]);
  }, 60_000);

  it("fails a page given more questions than fit, naming the slot and the question pushed out, and shows it on a proof", async () => {
    const draft = book("U12", 6);
    const page = draft.pages.find((p) => p.type === "practice")!;
    const content = page.content!;
    if (content.kind !== "day") throw new Error("not a day page");
    const own = content.blocks.find((b) => b.slot === "on-your-own")!;
    const mine = page.questions.filter((q) => own.items.includes(q.number));
    const extra = [...mine, ...mine, ...mine, ...mine].map((q, k) => {
      const number = page.questions.length + k + 1;
      return { ...q, number, package: { ...q.package, id: `${q.package.id}-x${number}`, ref: { ...q.package.ref, question: number } as typeof q.package.ref } };
    });
    const crowded: DraftPage = {
      ...page,
      questions: [...page.questions, ...extra],
      content: { ...content, blocks: content.blocks.map((b) => (b === own ? { ...b, items: [...b.items, ...extra.map((q) => q.number)] } : b)) },
    };
    const one = { ...draft, pages: [crowded] };
    const result = await renderWorkbook({ draft: one, parentId: PARENT, template, engine });
    if (result.status !== "failed") throw new Error("the crowded page rendered");
    expect(result.problems).toContainEqual({ page: page.number, question: null, slot: "on-your-own", reason: "day 1 page 3 (practice): the on-your-own slot holds 25 items; it takes at most 8" });
    expect(result.problems).toContainEqual({ page: page.number, question: null, slot: "content", reason: "the content does not fit its space" });
    expect(result.problems).toContainEqual(expect.objectContaining({
      page: page.number, slot: "on-your-own", reason: expect.stringMatching(/question \d+ in the on-your-own slot runs \d+ px past the bottom of the content area$/),
    }));

    const [proof] = await proofPages({ draft: one, template, engine, problems: result.problems });
    expect(proof.page).toBe(page.number);
    // The red failure banner across the top of the page.
    const { data } = await sharp(proof.png).extract({ left: 0, top: 4, width: 40, height: 10 }).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([0xb4, 0x23, 0x18]);
  }, 120_000);
});
