import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { chromiumPrintEngine, findChromium } from "@/lib/print-engine-chromium";
import { proofPages, renderWorkbook, type DraftPage, type WorkbookDraft } from "@/lib/workbook-render";
import { sampleBook } from "@/lib/workbook-sample-book";
import { titleProblem, UNIT_TITLES } from "@/lib/workbook-titles";
import { SKILL_TITLES } from "@/lib/workbook-skill-titles";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";

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
const book = (level: string, n: number, testWorkbook = false, title?: string) =>
  sampleBook({ level, workbookId: `55555555-5555-4555-8555-00000000001${n}`, childId: CHILD, child: "Mateo", number: 2, testWorkbook, title }).draft;

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
  it.each(["U4", "U16"])("prints whole-block Extra labels and generated required minutes in %s", async level => {
    const draft = book(level, 1);
    for (const p of draft.pages) if (p.content?.kind === "day") {
      p.content.requiredTimeTarget = 20;
      for (const b of p.content.blocks) if (["practice-2", "challenge"].includes(p.type)) b.extra = true;
    }
    const selected = draft.pages.filter(p => p.type === "how-plan" || p.content?.kind === "day" && p.content.day === 1 && ["practice-2", "challenge"].includes(p.type));
    expect(selected.length).toBeGreaterThan(1);
    const printed: Awaited<ReturnType<typeof engine.print>>[] = [];
    const result = await renderWorkbook({ draft: { ...draft, pages: selected }, parentId: PARENT,
      template: { ...template, page: (p, parts) => template.page(p, parts, draft) },
      engine: { print: async job => {
        const output = await engine.print(job);
        printed.push(output);
        return output;
      } },
    });
    expect(result.status === "failed" ? result.problems : []).toEqual([]);
    const badges = printed.flatMap(p => p.measured.filter(m => m.name.startsWith("chipbadge-extra-")));
    expect(badges.length).toBe(selected.reduce((n, p) => n + (p.content?.kind === "day" ? p.content.blocks.filter(b => b.extra).length : 0), 0));
    expect(badges.every(m => m.visible && m.text === "Extra" && m.width > 30 && m.height >= 15)).toBe(true);
    expect(printed.flatMap(p => p.measured).some(m => m.name.startsWith("slot-required-time-"))).toBe(true);
  }, 60_000);

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

  it("prints #479 headers, cover text and the error card with measured spacing", async () => {
    const draft = book("U4", 2);
    const pages = draft.pages.filter(p => [1,2,3,4,5,6,7].includes(p.number));
    const printed: Awaited<ReturnType<typeof engine.print>>[] = [];
    const html: string[] = [];
    const result = await renderWorkbook({ draft: { ...draft, pages }, parentId: PARENT, template,
      engine: { print: async job => { html.push(job.html); const out = await engine.print(job); printed.push(out); return out; } } });
    expect(result.status === "failed" ? result.problems : []).toEqual([]);
    expect(html[0]).toContain("SPOT THE ERROR");
    expect(html[0]).toContain("Is it right?");
    expect(html[0]).toContain("If it's not right, fix it:");
    expect(html[0]).toContain(">Yes</span>");
    expect(html[0]).toContain(">No</span>");
    expect(html[0]).not.toContain("Sam's work");
    const measured=printed[0].measured;
    const first=measured.find(m=>m.sheet===2 && m.name==="slot-name-date")!;
    const day=measured.find(m=>m.sheet===2 && m.name==="slot-day-label")!;
    expect(day.y-first.y-first.height).toBeGreaterThanOrEqual(18);
    expect(measured.some(m=>m.sheet===3 && m.name==="slot-name-date")).toBe(false);
    const coverText=measured.filter(m=>m.sheet===0).map(m=>m.text).join(" ");
    expect(coverText).toContain("Mateo will count, read and write numbers up to 20, and learn how numbers split into smaller parts.");
    expect(coverText).not.toContain("will learn to:");
    expect(coverText).not.toMatch(/This fortnight|How this works and your plan are next/);
    const planText=measured.filter(m=>m.sheet===1).map(m=>m.text).join(" ");
    expect(planText).toContain("Ask for help using Maya, the AI Teaching Assistant.");
    expect(planText).toContain("browser");
    await mkdir("/tmp/ui-review/479-layout",{recursive:true});
    for (const [i,p] of pages.entries()) await writeFile(`/tmp/ui-review/479-layout/p${p.number}.png`,printed[0].images[i].png);
  }, 60_000);

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

  it("fits the longest title code writes on one line on every day page type, and fails a title too long for one (D-201)", async () => {
    // The separate catalogue print checks every skill and unit title. Here the longest string also visits every page type.
    const titles = [...Object.values(SKILL_TITLES), ...Object.values(UNIT_TITLES), "Patterns and equations", "Fractions and decimals", "Shapes and measuring", "Number stories to 1000", "Review and Friday 5", "Show what you know", "Level U30 test"];
    const longest = titles.reduce((a, b) => (b.length > a.length ? b : a));
    expect(titleProblem(longest)).toBeNull();
    // The title goes in when the book is planned, as the generator's will.
    const titled = (level: string, n: number, title: string): WorkbookDraft => {
      const draft = oneOfEach(book(level, n, false, title));
      return { ...draft, pages: draft.pages.filter((p) => p.content?.kind === "day") };
    };
    const titleProblems = (r: Awaited<ReturnType<typeof renderWorkbook>>) => (r.status === "failed" ? r.problems.filter((x) => x.slot === "title") : []);

    for (const [level, n] of [["U2", 1], ["U6", 2], ["U12", 3], ["U22", 4]] as const) {
      const fits = await renderWorkbook({ draft: titled(level, n, longest), parentId: PARENT, template, engine });
      // The whole page must render (review R371-2-1).
      expect(fits.status === "failed" ? fits.problems : []).toEqual([]);
      // Four long words run past one line: the page fails, so the title is never printed.
      const long = titled(level, n, "Multiplications Subtractions Measurements Probabilities");
      const fails = await renderWorkbook({ draft: long, parentId: PARENT, template, engine });
      expect(new Set(titleProblems(fails).map((x) => x.page))).toEqual(new Set(long.pages.map((p) => p.number)));
    }
  }, 240_000);

  it("gives a written reason on a parent-led card its writing space when the question asks How do you know? itself (#380)", async () => {
    const { buildQuestion } = await import("@/lib/workbook-generator-items");
    const draft = book("U2", 1);
    const page = draft.pages.find((p) => p.content?.kind === "day" && p.type === "parent-led" && p.questions.length > 1)!;
    const q = page.questions[0];
    const built = buildQuestion({
      slot: "1.1", skill: "K1-how-many", difficulty: 1, text: "Do 3 and 3 make 5? How do you know?", format: "written-reason", operation: null, wrongAnswers: [], easier: null,
      shownWrong: null, figure: null, numbers: [], places: null, direction: null, sequence: null, pattern: null,
    }, { id: q.package.id, workbookId: draft.id, page: page.number, question: q.number, level: 2, skills: ["K1-how-many"] });
    const reason: DraftPage = { ...page, questions: [{ number: q.number, package: { ...built.package!, ref: q.package.ref } }, ...page.questions.slice(1)] };
    const result = await renderWorkbook({ draft: { ...draft, pages: [reason] }, parentId: PARENT, template, engine });
    expect(result.status === "failed" ? result.problems.filter((x) => x.question === q.number) : []).toEqual([]);
  }, 60_000);

  it("fits a parent-led page of six relation cards whose choices are words (#380)", async () => {
    const { buildQuestion } = await import("@/lib/workbook-generator-items");
    const num = (value: number) => ({ type: "number", value, numerator: null, denominator: null, whole: null, unit: null, hours: null, minutes: null, period: null, parts: [], text: null });
    const draft = book("U2", 1);
    const page = draft.pages.find((p) => p.content?.kind === "day" && p.type === "parent-led" && p.questions.length >= 6)!;
    const questions = page.questions.map((q, k) => {
      const built = buildQuestion({
        slot: "1.1", skill: "K3-benchmarks-5-10", difficulty: 1, text: `Is ${k + 6} close to 0 or 10?`, format: "relation", operation: null, wrongAnswers: [], easier: null,
        shownWrong: null, figure: null, numbers: [num(k + 6)], places: null, direction: null, sequence: null, pattern: null, relation: { kind: k % 2 ? "closer" : "less-than", to: k % 2 ? [0, 10] : [5], labels: [] }, figureShows: null,
      }, { id: q.package.id, workbookId: draft.id, page: page.number, question: q.number, level: 2, skills: ["K3-benchmarks-5-10"] });
      return { number: q.number, package: { ...built.package!, ref: q.package.ref } };
    });
    const result = await renderWorkbook({ draft: { ...draft, pages: [{ ...page, questions }] }, parentId: PARENT, template, engine });
    expect(result.status === "failed" ? result.problems : []).toEqual([]);
  }, 60_000);

  it("fills the level test and Show what you know pages to the bottom of their content area", async () => {
    for (const [level, n] of [["U2", 5], ["U12", 6], ["U24", 7]] as const) {
      const draft = book(level, n, true);
      for (const type of ["level-test", "show-what-you-know"]) {
        const page = draft.pages.find((p) => p.content?.kind === "day" && p.content.blocks.some((b) => b.slot === type))!;
        const html = `<!doctype html><html><head><style>@page{size:8.5in 11in;margin:0}html,body{margin:0}[data-sheet]{position:relative;width:816px;height:1056px;overflow:hidden}</style>`
          + `<style>${template.css}</style></head><body><section data-sheet="0" data-measure="sheet">${template.page(page, { qr: `<div data-measure="qr"></div>`, qrUrl: "x" }, draft)}</section></body></html>`;
        const { measured } = await engine.print({ html, sheets: 1, page: { width: 816, height: 1056 }, scale: 1 });
        const area = measured.find((m) => m.name === "slot-content")!;
        const content = page.content!;
        const i = content.kind === "day" ? content.blocks.findIndex((b) => b.slot === type) : -1;
        const block = measured.find((m) => m.name === `block-${i}`)!;
        // The slot's cards reach the bottom of the content area (within a gap), and nothing runs past it.
        expect(area.y + area.clientHeight - (block.y + block.height), `${level} ${type}`).toBeLessThan(16);
        expect(area.scrollHeight).toBeLessThanOrEqual(area.clientHeight + 1);
      }
    }
  }, 120_000);

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
