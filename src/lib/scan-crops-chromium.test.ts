import { describe, expect, it } from "vitest";
import { chromiumPrintEngine, findChromium } from "@/lib/print-engine-chromium";
import { calibratePhoto, cropBox, cropPlan, type Calibration, type CropItem, type Raster } from "@/lib/scan-calibration";
import { cropCut, drawDigit, greyRaster, photoJpeg, photographed, readDigit, rotatedCorners, uprightCorners } from "@/lib/scan-synthetic";
import { printContractForPhoto, type PagePrintContract } from "@/lib/workbook-print-contract";
import { pageUrl, renderWorkbook, type DraftPage } from "@/lib/workbook-render";
import { sampleBook } from "@/lib/workbook-sample-book";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";

// The calibration on pages printed by real Chromium with the real template: real marks among real ink, read from the stored
// contract and the stored regions only. Synthetic digits are written in the real answer boxes. This does not prove real
// handwriting, a real camera or a curled saddle-stitched page. Runs where a Chromium is found; skipped elsewhere.

const chromium = await findChromium();
const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const REVISION = "c".repeat(28);

const SIZE = { width: 1500, height: 1900 };

async function renderedPages(level: string) {
  const { draft } = sampleBook({ level, workbookId: "55555555-5555-4555-8555-000000000041", childId: CHILD, child: "Mateo", number: 2 });
  // The first Day 1 pages that hold at least one question.
  const pages = draft.pages.filter((p: DraftPage) => p.dayLabel === "Day 1" && p.questions.length > 0).slice(0, 4);
  const result = await renderWorkbook({ draft: { ...draft, pages }, parentId: PARENT, template: workbookTemplate(await fixedTemplateFonts()), engine: chromiumPrintEngine() });
  if (result.status !== "rendered") throw new Error(JSON.stringify(result.problems.slice(0, 3)));
  return result.workbook.pages.flatMap((page) => {
    const plan = cropPlan(page.questions.map((q) => ({ number: q.number, package: q.package as never, regions: q.regions ?? null })));
    const png = result.files.find((f) => f.path === page.image!.path)?.bytes;
    return page.printContract && png ? [{ number: page.number, contract: page.printContract, png, plan, link: pageUrl(page.qrToken), writing: page.questions.flatMap((q) => (q.regions ?? []).flatMap((r) => (r.box ? [r.box] : []))) }] : [];
  });
}

const CORNERS = {
  "straight on": uprightCorners(SIZE, { width: 1275, height: 1650 }, 60),
  "rotated 7 degrees": rotatedCorners(uprightCorners(SIZE, { width: 1275, height: 1650 }, 170), 7, { x: 750, y: 950 }),
  tilted: [{ x: 280, y: 110 }, { x: 1240, y: 150 }, { x: 1390, y: 1790 }, { x: 110, y: 1760 }],
  "upside down": rotatedCorners(uprightCorners(SIZE, { width: 1275, height: 1650 }, 60), 180, { x: 750, y: 950 }),
};

function writtenOn(printed: Raster, crops: CropItem[]) {
  const copy: Raster = { ...printed, data: printed.data.slice() };
  crops.forEach((c, i) => drawDigit(copy, c.box, (i * 3 + 1) % 10, 20));
  return copy;
}

const read = (photo: Raster, c: Calibration, contract: PagePrintContract, crops: CropItem[]) => crops.map((x) => readDigit(cropBox(photo, c, contract, x.box), cropCut(x.box), x.box));

describe.skipIf(!chromium)("calibration on real printed pages", () => {
  it.each(["U4", "U16"])("every real answer box of %s crops to its own written answer, from each angle", async (level) => {
    // Disproved if real page ink is taken for a mark, or a real answer region's crop holds another answer.
    const pages = await renderedPages(level);
    const supported = pages.filter((p) => p.plan.crops.length > 0);
    expect(supported.length, `${level} has a page with single-box whole-number items`).toBeGreaterThan(0);
    let checked = 0;
    for (const page of supported) {
      const printed = await greyRaster(page.png);
      const written = writtenOn(printed, page.plan.crops);
      const wanted = page.plan.crops.map((_, i) => (i * 3 + 1) % 10);
      const contract = printContractForPhoto({ printedRevision: REVISION }, { printContract: page.contract }, { printedRevision: REVISION });
      for (const [name, corners] of Object.entries(CORNERS)) {
        const photo = await greyRaster(await photoJpeg(photographed(written, SIZE, corners, { shade: 0.25 })));
        const result = calibratePhoto({ photo, printed, contract, pageLink: page.link, writing: page.writing });
        if (result.status !== "calibrated") throw new Error(`${level} page ${page.number} ${name}: ${result.reason}`);
        expect(read(photo, result.calibration, page.contract, page.plan.crops), `${level} page ${page.number} ${name}`).toEqual(wanted);
        checked += wanted.length;
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 240_000);

  it("a real page's photo does not calibrate against another real page's image", async () => {
    // Disproved if the printed-page check passes any page with the same marks. The template's marks are the same on all pages.
    const [one, two] = await renderedPages("U16");
    const printedOne = await greyRaster(one.png), printedTwo = await greyRaster(two.png);
    const photo = await greyRaster(await photoJpeg(photographed(printedTwo, SIZE, CORNERS["straight on"])));
    const own = calibratePhoto({ photo, printed: printedTwo, contract: printContractForPhoto({ printedRevision: REVISION }, { printContract: two.contract }, { printedRevision: REVISION }), pageLink: two.link, writing: two.writing });
    expect(own.status).toBe("calibrated");
    const other = calibratePhoto({ photo, printed: printedOne, contract: printContractForPhoto({ printedRevision: REVISION }, { printContract: one.contract }, { printedRevision: REVISION }), pageLink: one.link, writing: one.writing });
    expect(other.status).toBe("refused");
  }, 120_000);
});
