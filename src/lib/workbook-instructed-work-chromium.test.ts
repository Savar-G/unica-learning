import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { chromiumPrintEngine, findChromium } from "@/lib/print-engine-chromium";
import type { DayContent } from "@/lib/workbook-page";
import { renderWorkbook, type DraftPage } from "@/lib/workbook-render";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";
import { INSTRUCTED_WORK_BOOK, INSTRUCTED_WORK_CHALLENGE, INSTRUCTED_WORK_WORDS } from "@/lib/workbook-instructed-work-fixture";

// Savar's book 1 review (2026-11-08): a U16 page whose instruction already says "Show your work for questions 1-3." printed
// "SHOW YOUR WORK" again in each of those questions' work spaces ("takes up space to show work"), and a Challenge card
// shaded its work space too ("make just the question coloured and the space below it white space"). Real Chromium,
// where one is found.

const chromium = await findChromium();
const parentId = "11111111-1111-4111-8111-111111111111";

describe("the work label of a question the page's instruction names", () => {
  it("prints only where the instruction does not already ask for the work", async () => {
    const template = workbookTemplate();
    const book = { ...INSTRUCTED_WORK_BOOK, pages: [INSTRUCTED_WORK_WORDS, INSTRUCTED_WORK_CHALLENGE] };
    for (const page of book.pages) {
      const html = template.page(page, { qr: "", qrUrl: "" }, book)!;
      expect(html).toContain("Show your work for questions 1-3.");
      expect(html).not.toMatch(/<span class="lab">Show your work<\/span>/);
      // Below U16 the page keeps its general instruction, so each work space keeps its own label.
      const u9: DraftPage = { ...page, content: { ...(page.content as DayContent), level: 9 } };
      expect(template.page(u9, { qr: "", qrUrl: "" }, { ...book, levels: [9], pages: [u9] })).toMatch(/<span class="lab">Show your work<\/span>/);
    }
  });
});

describe.skipIf(!chromium)("instructed work spaces in Chromium", () => {
  it("print no repeated label, and a Challenge card's work space is white under its shaded question", async () => {
    const template = workbookTemplate(await fixedTemplateFonts());
    const draft = { ...INSTRUCTED_WORK_BOOK, pages: [INSTRUCTED_WORK_WORDS, INSTRUCTED_WORK_CHALLENGE] };
    const result = await renderWorkbook({ draft, parentId, template, engine: chromiumPrintEngine() });
    expect(result.status === "failed" ? result.problems.map((p) => `page ${p.page}: ${p.reason}`) : []).toEqual([]);
    if (result.status !== "rendered") return;
    for (const page of result.workbook.pages) {
      const png = result.files.find((f) => f.path === page.image!.path)!.bytes;
      const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const pixel = (x: number, y: number) => { const at = (Math.round(y) * info.width + Math.round(x)) * 3; return [data[at], data[at + 1], data[at + 2]]; };
      for (const q of page.questions) {
        const work = q.regions!.find((r) => r.kind === "work")!.box!;
        // The work space's top band, where its label printed: blank white paper, across the whole space.
        for (let x = work.x + 4; x < work.x + work.width - 4; x += 3) {
          for (let y = work.y + 2; y < work.y + Math.min(60, work.height - 2); y += 3) expect(pixel(x, y), `page ${page.number} question ${q.number}`).toEqual([255, 255, 255]);
        }
        // The Challenge question itself keeps its shading, beside the end of its text.
        if (page.type === "challenge") expect(pixel(q.box!.x + q.box!.width - 30, q.box!.y + 20)).toEqual([244, 242, 240]);
      }
    }
  }, 120_000);
});
