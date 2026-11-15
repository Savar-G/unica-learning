import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { chromiumPrintEngine, findChromium } from "@/lib/print-engine-chromium";
import { proofPages, renderWorkbook, type DraftPage, type MeasuredElement, type WorkbookDraft } from "@/lib/workbook-render";
import type { AnswerRegion, ItemFormat } from "@/lib/question-package";
import { WARM_UP_INSTRUCTION } from "@/lib/workbook-page-instructions";
import { sampleBook } from "@/lib/workbook-sample-book";
import { titleProblem, UNIT_TITLES } from "@/lib/workbook-titles";
import { SKILL_TITLES } from "@/lib/workbook-skill-titles";
import { pagePlan, workbookTemplate } from "@/lib/workbook-template";
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
  it("uses a full row for the third U16 lesson question without leaving a half row", async () => {
    const draft = book("U16", 1);
    const page = structuredClone(draft.pages.find(p => p.type === "practice")!);
    if (page.content?.kind !== "day") throw Error("not a day page");
    page.type = "new-idea";
    page.questions = page.questions.slice(0, 3);
    const questions = page.questions.map(q => q.number);
    page.content = { ...page.content, consistentLayout: true, blocks: [{ slot: "now-you", items: questions }] };
    let measured: MeasuredElement[] = [];
    const result = await renderWorkbook({ draft: { ...draft, pages: [page] }, parentId: PARENT, template,
      engine: { print: async job => { const output = await engine.print(job); measured = output.measured; return output; } },
    });
    expect(result.status === "failed" ? result.problems : []).toEqual([]);
    expect(pagePlan(page)?.incomplete).toEqual([]);
    const first = measured.find(m => m.name === `question-${questions[0]}`)!;
    const last = measured.find(m => m.name === `question-${questions[2]}`)!;
    expect(last.x).toBeCloseTo(first.x, 1);
    expect(last.width).toBeGreaterThan(first.width * 1.9);
    expect(last.y).toBeGreaterThan(first.y + first.height);
  }, 60_000);

  it("keeps Friday 5 at five questions with its last question across the full row (#759)", async () => {
    const draft = book("U16", 1);
    const page = structuredClone(draft.pages.find(p => p.type === "friday-5")!);
    if (page.content?.kind !== "day") throw Error("not a day page");
    page.content.consistentLayout = true;
    // The generated page reserves four short review questions beside the five Friday questions.
    const review = page.content.blocks.find(b => b.slot === "remember-these");
    if (review) review.items = review.items.slice(0, 4);
    const kept = new Set(page.content.blocks.flatMap(b => b.items));
    page.questions = page.questions.filter(q => kept.has(q.number));
    const questions = page.content.blocks.find(b => b.slot === "friday-5")!.items;
    expect(questions).toHaveLength(5);
    let measured: MeasuredElement[] = [];
    const result = await renderWorkbook({ draft: { ...draft, pages: [page] }, parentId: PARENT, template,
      engine: { print: async job => { const output = await engine.print(job); measured = output.measured; return output; } },
    });
    expect(result.status === "failed" ? result.problems : []).toEqual([]);
    const first = measured.find(m => m.name === `question-${questions[0]}`)!;
    const last = measured.find(m => m.name === `question-${questions[4]}`)!;
    expect(last.visible).toBe(true);
    expect(last.x).toBeCloseTo(first.x, 1);
    expect(last.width).toBeGreaterThan(first.width * 1.9);
    expect(last.y).toBeGreaterThan(first.y + first.height);
  }, 60_000);

  it.each(["U4", "U16"])("prints one whole-page Extra label and generated required minutes in %s", async level => {
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
    expect(badges.length).toBe(selected.filter(p => p.content?.kind === "day").length);
    expect(badges.every(m => m.name === "chipbadge-extra-page" && m.visible && m.text === "Extra page: optional" && m.width > 30 && m.height >= 15)).toBe(true);
    expect(printed.flatMap(p => p.measured).some(m => m.name.startsWith("slot-required-time-"))).toBe(true);
  }, 60_000);

  it.each(["U4", "U16"].flatMap(level => ["example", "split block", "none"].map(kind => [level, kind])))("keeps Extra scope clear in %s with %s optional", async (level, kind) => {
    const draft = book(level, 1);
    const page = structuredClone(draft.pages.find(p => p.type === "practice")!);
    if (page.content?.kind !== "day") throw new Error("not a day page");
    const slot = kind === "example" ? "watch-one" : kind === "split block" ? "on-your-own" : null;
    for (const b of page.content.blocks) {
      b.extra = b.slot === slot;
      if (kind === "split block" && b.extra) b.reviewFrom = b.items[Math.floor(b.items.length / 2)];
    }
    let measured: Awaited<ReturnType<typeof engine.print>>["measured"] = [];
    const result = await renderWorkbook({ draft: { ...draft, pages: [page] }, parentId: PARENT, template,
      engine: { print: async job => { const output = await engine.print(job); measured = output.measured; return output; } },
    });
    expect(result.status === "failed" ? result.problems : []).toEqual([]);
    if (result.status !== "rendered") throw new Error("page did not render");
    expect(result.workbook.pages[0].questions).toHaveLength(page.questions.length);
    const badges = measured.filter(m => m.name.startsWith("chipbadge-extra-"));
    expect(badges).toHaveLength(kind === "none" ? 0 : 1);
    if (kind === "none") return;
    const at = page.content.blocks.findIndex(b => b.extra);
    const boundary = measured.find(m => m.name === `${kind === "example" ? "panel" : "block"}-${at}`)!;
    const inside = (m: typeof boundary) => m.x >= boundary.x - .5 && m.y >= boundary.y - .5 && m.x + m.width <= boundary.x + boundary.width + .5 && m.y + m.height <= boundary.y + boundary.height + .5;
    expect(badges[0].visible && inside(badges[0])).toBe(true);
    const optional = page.content.blocks[at].items;
    for (const q of page.questions) expect(inside(measured.find(m => m.name === `question-${q.number}`)!)).toBe(optional.includes(q.number));
    if (kind === "split block") expect(inside(measured.find(m => m.name === `review-${at}`)!)).toBe(true);
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
    expect(planText).toContain("then choose Scan pages");
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

  // (The review of 42bd5a6d: a 60-character name with U18's level name ran the "Made for" line to a third line.)
  it.each([20, 40, 60])("fits the cover's Made for line in two lines at U18 with a %s-character name", async (n) => {
    const child = "Alexandra Maximiliano Wilhelmina Bartholomew Montgomery Fitz".slice(0, n);
    const draft = sampleBook({ level: "U18", workbookId: "55555555-5555-4555-8555-000000000018", childId: CHILD, child, number: 1 }).draft;
    let line = "";
    const result = await renderWorkbook({ draft: { ...draft, pages: [draft.pages[0]] }, parentId: PARENT,
      template: { ...template, page: (p, parts) => template.page(p, parts, draft) },
      engine: { print: async job => { const out = await engine.print(job); line = out.measured.find(m => m.name === "slot-made-for")?.text ?? ""; return out; } } });
    expect(result.status === "failed" ? result.problems : []).toEqual([]);
    expect(line).toBe(`Made for ${child} · Level U18${n === 20 ? " · Decimals to thousandths and moving shapes" : ""}`);
  }, 60_000);

  // (The review of 42bd5a6d: the warm-up sentence and "Circle yes or no." ran to 733 px of 688 at U8 and U9.)
  it.each([["U8", 1], ["U8", 2], ["U9", 1], ["U9", 2]] as const)("prints a %s workbook %s warm-up page with a circle and a tick question: the warm-up sentence alone, a cue on each", async (level, number) => {
    const draft = sampleBook({ level, workbookId: `55555555-5555-4555-8555-00000000008${number}`, childId: CHILD, child: "Mateo", number }).draft;
    const warm = draft.pages.find(p => p.content?.kind === "day" && p.content.blocks.some(b => b.slot === "warm-up"))!;
    if (warm.content?.kind !== "day") throw new Error("no warm-up page");
    const fact = warm.questions[0];
    const ask = (n: number, text: string, regions: AnswerRegion[], format: ItemFormat) => ({ ...fact, number: n,
      package: { ...fact.package, id: `${fact.package.id}-c${n}`, ref: { ...fact.package.ref, question: n } as typeof fact.package.ref, text, operation: null,
        item: { format, scorable: true, parentChecked: false, error: null, checks: [], regions } } });
    const yesNo: Extract<AnswerRegion, { kind: "choice" }> = { id: "right", kind: "choice", mark: "circle", label: null, choices: ["Yes", "No"], answer: "Yes" };
    const fixIt = warm.content.blocks.find(b => b.slot === "fix-it");
    const next = Math.max(...warm.questions.map(q => q.number)) + 1;
    const added = [ask(next, "7 + 6 = 13", [{ ...yesNo, choices: ["true", "false"], answer: "true" }], "circle"), ask(next + 1, "9 + 4 = 12", [{ ...yesNo, mark: "tick", label: "Is it right?" }], "tick-one")];
    const blocks = fixIt ? warm.content.blocks.map(b => b === fixIt ? { ...b, items: added.map(q => q.number) } : b)
      : [...warm.content.blocks, { slot: "fix-it" as const, items: added.map(q => q.number) }];
    const kept = new Set(blocks.flatMap(b => b.items));
    // As a stored book holds it: the choice words after the warm-up sentence. (The sample's own layout: on the measured
    // layout a choice card in Fix it fails the beside-the-first-line check with or without a cue, a separate issue.)
    const page: DraftPage = { ...warm, questions: [...warm.questions, ...added].filter(q => kept.has(q.number)),
      content: { ...warm.content, subtitle: `${WARM_UP_INSTRUCTION} Circle true or false.`, blocks } };
    let measured: MeasuredElement[] = [];
    let png: Uint8Array | null = null;
    const result = await renderWorkbook({ draft: { ...draft, pages: [page] }, parentId: PARENT,
      template: { ...template, page: (p, parts) => template.page(p, parts, draft) },
      engine: { print: async job => { const out = await engine.print(job); measured = out.measured; png = out.images[0].png; return out; } } });
    await mkdir("/tmp/ui-review/warm-up-cues", { recursive: true });
    if (png) await writeFile(`/tmp/ui-review/warm-up-cues/${level}-wb${number}.png`, png);
    expect(result.status === "failed" ? result.problems : []).toEqual([]);
    const subtitle = measured.find(m => m.name === "slot-subtitle")!;
    expect(subtitle.text).toBe(WARM_UP_INSTRUCTION);
    expect(subtitle.scrollWidth).toBeLessThanOrEqual(subtitle.clientWidth + 1);
    const text = (n: number) => measured.find(m => m.name === `question-${n}`)?.text ?? "";
    expect(text(next)).toContain("Circle one");
    expect(text(next + 1)).toContain("Tick one");
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
