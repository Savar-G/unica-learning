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
const render = async (book: WorkbookDraft) =>
  renderWorkbook({ draft: book, parentId: PARENT, template: fixedTemplate(await fixedTemplateFonts()), engine: chromiumPrintEngine() });

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
});
