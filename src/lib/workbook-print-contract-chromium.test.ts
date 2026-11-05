import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { chromiumPrintEngine, findChromium } from "@/lib/print-engine-chromium";
import { imageBox, printContractProblem, SCAN_MARKS } from "@/lib/workbook-print-contract";
import { renderWorkbook, type DraftPage } from "@/lib/workbook-render";
import { sampleDraft } from "@/lib/workbook-sample";
import { sampleBook } from "@/lib/workbook-sample-book";
import { fixedTemplate } from "@/lib/workbook-template-fixed";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";

// The print contract (#536) on pages printed by real Chromium: the coordinates a contract stores are where the marks' ink
// is on the page image, on every kind of page; the fixed template, which draws no marks, gives no contract and renders.
// Runs where a Chromium is found; skipped elsewhere.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const chromium = await findChromium();
const draft = sampleBook({ level: "U12", workbookId: "55555555-5555-4555-8555-000000000031", childId: CHILD, child: "Mateo", number: 2 }).draft;

/** One page of each kind in the book. */
const oneOfEach = (pages: DraftPage[]) => {
  const seen = new Set<string>();
  return pages.filter((p) => { const k = p.content?.kind ?? p.type; if (seen.has(k)) return false; seen.add(k); return true; });
};

describe.skipIf(!chromium)("the print contract in Chromium", () => {
  it("each stored mark point sits on its mark's ink, on every kind of page, and the regions are measured", async () => {
    // Disproved if a point is off the ink (positive control: just outside the sheet's corner is white).
    const pages = oneOfEach(draft.pages);
    expect(pages.length).toBeGreaterThanOrEqual(3);
    const result = await renderWorkbook({ draft: { ...draft, pages }, parentId: PARENT, template: workbookTemplate(await fixedTemplateFonts()), engine: chromiumPrintEngine() });
    if (result.status !== "rendered") throw new Error(JSON.stringify(result.problems.slice(0, 3)));
    expect(result.pages.map((p) => p.contractProblem)).toEqual(pages.map(() => null));
    for (const page of result.workbook.pages) {
      const contract = page.printContract!;
      expect(printContractProblem(contract, { workbookId: draft.id, page: page.number, image: page.image })).toBeNull();
      const png = result.files.find((f) => f.path === page.image!.path)!.bytes;
      const { data, info } = await sharp(Buffer.from(png)).greyscale().raw().toBuffer({ resolveWithObject: true });
      const grey = (x: number, y: number) => data[Math.floor(y) * info.width + Math.floor(x)];
      for (const m of SCAN_MARKS) {
        const p = contract.marks.points[m];
        // One image pixel inside the L's outer corner is ink; two outside is paper.
        const inward = { x: m === "tl" || m === "bl" ? 1 : -1, y: m === "tl" || m === "tr" ? 1 : -1 };
        expect(grey(p.x + inward.x * 2, p.y + inward.y * 2), `${m} on page ${page.number}`).toBeLessThan(80);
        expect(grey(p.x - inward.x * 3, p.y - inward.y * 3), `${m} on page ${page.number}`).toBeGreaterThan(200);
      }
      for (const q of page.questions) {
        const measured = (q.regions ?? []).filter((r) => r.box);
        expect(measured.length).toBeGreaterThan(0);
        for (const r of measured) {
          // Inside the page image, and the same scale as the marks.
          expect(r.box!.x + r.box!.width).toBeLessThanOrEqual(page.image!.width + 0.01);
          expect(imageBox({ x: 0, y: 0, width: 816, height: 1056 }, contract.coordinates.scale)).toEqual({ x: 0, y: 0, width: 1275, height: 1650 });
        }
      }
    }
  }, 180_000);

  it("the fixed template draws no marks: it renders with no contract", async () => {
    const sample = sampleDraft({ workbookId: draft.id, childId: CHILD, qrTokens: [1, 2, 3].map((n) => `fixed-page-token-${n}`.padEnd(20, "x")) });
    const result = await renderWorkbook({ draft: sample, parentId: PARENT, template: fixedTemplate(), engine: chromiumPrintEngine() });
    if (result.status !== "rendered") throw new Error(JSON.stringify(result.problems.slice(0, 3)));
    expect(result.workbook.pages[0].printContract).toBeNull();
    expect(result.pages[0].contractProblem).toMatch(/no scan marks/);
  }, 120_000);
});
