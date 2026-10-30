import { mkdir, writeFile } from "node:fs/promises";
import jsQR from "jsqr";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { chromiumPrintEngine, findChromium } from "@/lib/print-engine-chromium";
import { renderWorkbook, type WorkbookDraft } from "@/lib/workbook-render";
import { sampleDraft } from "@/lib/workbook-sample";
import { fixedTemplate } from "@/lib/workbook-template-fixed";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";

// The renderer with real Chromium (#309): the sample book prints to the expected pages, each page image carries a QR
// code that reads back as the page's desk link, every question box lies inside its page image, and overflowing content
// fails the render. Runs where a Chromium is found (src/lib/print-engine-chromium.ts); skipped elsewhere. Set
// RENDER_OUT=<folder> to write the PDF and page images there, to look at them.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const WORKBOOK = "55555555-5555-4555-8555-555555555555";
const TOKENS = ["Xq3vR8kLm2NpT7wYzA4bCd", "Ht6sJ9uEo1GiK5lMnB8vFr", "Wp2cQ7xZa4DyS0eR3tUgLk"];

const chromium = await findChromium();
const draft = () => sampleDraft({ workbookId: WORKBOOK, childId: CHILD, qrTokens: TOKENS });
const render = async (book: WorkbookDraft, change?: (page: number, html: string) => string) => {
  const template = fixedTemplate(await fixedTemplateFonts());
  const changed = change ? { ...template, page: (...a: Parameters<typeof template.page>) => change(a[0].number, template.page(...a)!) } : template;
  return renderWorkbook({ draft: book, parentId: PARENT, template: changed, engine: chromiumPrintEngine() });
};

/** The text of the QR code in a PNG, or null. */
async function readQr(png: Uint8Array): Promise<string | null> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null;
}

describe.skipIf(!chromium)("renderWorkbook with Chromium", () => {
  it("prints the sample book: three PDF pages, a readable QR code on each page image, every box inside its image", async () => {
    const result = await render(draft());
    if (result.status !== "rendered") throw new Error(JSON.stringify(result));
    const [pdf, ...images] = result.files;

    expect(new TextDecoder("latin1").decode(pdf.bytes).match(/\/Type\s*\/Page\b/g)?.length).toBe(3);
    expect(await Promise.all(images.map((f) => readQr(f.bytes)))).toEqual(result.pages.map((p) => p.qrUrl));
    for (const [i, page] of result.workbook.pages.entries()) {
      expect(page.image).toMatchObject({ width: 1275, height: 1650 });
      expect(await sharp(images[i].bytes).metadata()).toMatchObject({ width: 1275, height: 1650 });
      for (const { box } of page.questions) {
        expect(box.x + box.width).toBeLessThanOrEqual(1275);
        expect(box.y + box.height).toBeLessThanOrEqual(1650);
        expect(box.width).toBeGreaterThan(400);
      }
    }

    if (process.env.RENDER_OUT) {
      await mkdir(process.env.RENDER_OUT, { recursive: true });
      for (const f of result.files) await writeFile(`${process.env.RENDER_OUT}/${f.path.split("/").pop()}`, f.bytes);
      await writeFile(`${process.env.RENDER_OUT}/boxes.json`, JSON.stringify(result.workbook.pages.map((p) => ({ page: p.number, boxes: p.questions.map((q) => q.box) })), null, 2));
    }
  }, 60_000);

  it("fails a page with more questions than fit, naming what was pushed off it, and a question whose numbers do not fit its box", async () => {
    const book = draft();
    const [first, second] = book.pages[1].questions;
    book.pages[1].questions.push({ ...first, number: 5 }, { ...second, number: 6 });
    const third = book.pages[2].questions[2];
    third.package = { ...third.package, operation: { kind: "subtract", operands: [8000000615, 349] } };
    expect(await render(book)).toEqual({
      status: "failed",
      problems: [
        { page: 2, question: null, reason: "the content does not fit the page" },
        { page: 2, question: null, reason: "the page number is not printed" },
        { page: 2, question: null, reason: "the QR code is smaller than 0.6 inches or not inside the page" },
        { page: 2, question: 5, reason: "question 5 is not inside the page" },
        { page: 2, question: 6, reason: "question 6 is not inside the page" },
        { page: 3, question: 3, reason: "question 3 does not fit its space" },
      ],
    });
  }, 60_000);

  it("fails a hidden page number, a hidden question and a blank QR code", async () => {
    const hide = `style="visibility:hidden" `;
    const result = await render(draft(), (page, html) => {
      if (page === 1) return html.replace(`<span data-measure="page-number">`, `<span ${hide}data-measure="page-number">`);
      if (page === 2) return html.replace(`<div class="question" data-measure="question-2">`, `<div class="question" ${hide}data-measure="question-2">`);
      return html.replace("<svg ", `<svg ${hide}`);
    });
    expect(result).toEqual({
      status: "failed",
      problems: [
        { page: 1, question: null, reason: "the page number is not printed" },
        { page: 2, question: 2, reason: "question 2 is hidden" },
        { page: 3, question: null, reason: "the QR code does not read as the page's link" },
      ],
    });
  }, 60_000);

  it("fails a question whose text and numbers are hidden while its box shows, and a page number that leaves no ink", async () => {
    // Page 1: a transparent page number. Page 2: every operand hidden inside visible question boxes. Page 3: the
    // operands white on white, so only the page image shows they are missing.
    const style: Record<number, string> = {
      1: `[data-sheet="0"] [data-measure="page-number"]{color:transparent}`,
      2: `[data-sheet="1"] .sum>div:not(.rule){visibility:hidden}`,
      3: `[data-sheet="2"] .sum{color:#fff}`,
    };
    const result = await render(draft(), (page, html) => `<style>${style[page]}</style>${html}`);
    const notPrinted = (page: number) => [1, 2, 3, 4].map((q) => ({ page, question: q, reason: `question ${q}'s content is not printed` }));
    expect(result).toEqual({
      status: "failed",
      problems: [{ page: 1, question: null, reason: "the page number is not printed" }, ...notPrinted(2), ...notPrinted(3)],
    });
  }, 60_000);

  // Page 2's operands made unreadable in ways a box check misses: each must fail every question on the page.
  const unreadable: [string, string][] = [
    ["too small", `.sum{font-size:3px}`],
    ["shrunk", `.sum>div:not(.rule){transform:scale(.06)}`],
    ["partly clipped", `.sum>div:first-child{clip-path:inset(0 0 0 70%)}`],
    ["cut by an inner box", `.sum>div:not(.rule){height:26px;overflow:hidden}`],
    ["covered", `.sum{position:relative}.sum::after{content:"";position:absolute;inset:0;background:#eee}`],
    ["blurred", `.sum{filter:blur(5px)}`],
  ];
  it.each(unreadable)("fails question content that is %s", async (_name, css) => {
    const result = await render(draft(), (page, html) => (page === 2 ? `<style>[data-sheet="1"] ${css.replace(/}(?=.)/g, `}[data-sheet="1"] `)}</style>${html}` : html));
    expect(result).toEqual({
      status: "failed",
      problems: [1, 2, 3, 4].map((q) => ({ page: 2, question: q, reason: `question ${q}'s content is not printed` })),
    });
  }, 60_000);

  it("fails an operand covered by another line of the same question, which brings its own ink to the same place", async () => {
    // Page 2: each question's second line (sign and operand) moved up onto the first, on an opaque white background.
    // The first operand passes every CSS, size and clipping check and its rect changes when all glyphs go, by the
    // second line's ink; only its own glyphs show it is covered.
    const css = `[data-sheet="1"] .sum>div:nth-child(2){position:relative;top:-60px;background:#fff}`;
    const result = await render(draft(), (page, html) => (page === 2 ? `<style>${css}</style>${html}` : html));
    expect(result).toEqual({
      status: "failed",
      problems: [1, 2, 3, 4].map((q) => ({ page: 2, question: q, reason: `question ${q}'s content is not printed` })),
    });
  }, 60_000);

  it("checks each piece of text alone on a sheet with a text shadow: it prints, and a covered operand still fails", async () => {
    const shadow = `[data-sheet="1"] h1{text-shadow:0 0 40px #000}`;
    const cover = `[data-sheet="1"] .sum>div:nth-child(2){position:relative;top:-60px;background:#fff}`;
    const withShadow = (css: string) => render(draft(), (page, html) => (page === 2 ? `<style>${css}</style>${html}` : html));
    expect((await withShadow(shadow)).status).toBe("rendered");
    expect(await withShadow(shadow + cover)).toEqual({
      status: "failed",
      problems: [1, 2, 3, 4].map((q) => ({ page: 2, question: q, reason: `question ${q}'s content is not printed` })),
    });
  }, 60_000);

  it("prints content set tighter than its font's line box, and a word problem at line-height 1.2", async () => {
    const book = draft();
    const q = book.pages[2].questions[0];
    q.package = { ...q.package, text: "Mia has 12 bags of 3 apples. How many apples does she have?", operation: { kind: "multiply", operands: [12, 3] } };
    const result = await render(book, (_page, html) => `<style>.sum{line-height:54px}.text{line-height:1.2}</style>${html}`);
    expect(result.status).toBe("rendered");
  }, 60_000);

  it("fails a question with no answer space", async () => {
    const result = await render(draft(), (page, html) => (page === 2 ? `<style>[data-sheet="1"] .rule{display:none}</style>${html}` : html));
    expect(result).toEqual({
      status: "failed",
      problems: [1, 2, 3, 4].map((q) => ({ page: 2, question: q, reason: `question ${q} has no answer space` })),
    });
  }, 60_000);
});
