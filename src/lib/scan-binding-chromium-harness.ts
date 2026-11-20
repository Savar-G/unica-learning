import jsQR from "jsqr";
import QRCode from "qrcode";
import { findChromium, sharedChromiumPrintEngine } from "@/lib/print-engine-chromium";
import { calibratePhoto, cropPlan, sheetChecker, type Raster } from "@/lib/scan-calibration";
import type { ScanFrame } from "@/lib/scan-crops";
import { drawDigit, fillBox, greyRaster, photoJpeg, photographed, uprightCorners } from "@/lib/scan-synthetic";
import { printContractForPhoto, type Box, type PagePrintContract, type PrintedRegion } from "@/lib/workbook-print-contract";
import { pageUrl, renderWorkbook, type DraftPage } from "@/lib/workbook-render";
import { sampleBook } from "@/lib/workbook-sample-book";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";

export const chromium = await findChromium();
export const PARENT = "11111111-1111-4111-8111-111111111111";
export const CHILD = "22222222-2222-4222-8222-222222222222";
export const REVISION = "c".repeat(28);
export const PAGE_SIZE = { width: 1275, height: 1650 };
/** The full page matrix, written to SCAN_MATRIX_OUT: more pages and page sizes, and much slower. */
export const FULL = !!process.env.SCAN_MATRIX_OUT;
export const SIZE = { width: 1500, height: 1900 };

export interface Real {
  key: string;
  number: number;
  token: string;
  contract: PagePrintContract;
  png: Uint8Array;
  grey: Raster;
  plan: ReturnType<typeof cropPlan>;
  regions: PrintedRegion[];
  writing: Box[];
  questions: ScanFrame["page"]["questions"];
}

const tokenOf = (level: string, n: number) => `matrix${level}${String(n).padStart(4, "0")}xxxxxxxxxx`;

export function createScanBindingContext() {
  const engine = sharedChromiumPrintEngine();
  const templatePromise = fixedTemplateFonts().then((fonts) => workbookTemplate(fonts));
  // Cache rendered pages by (level, days, count), and reuse a larger cached prefix for the same (level, days)
  // so repeated tests in the same file never re-render the exact same workbook pages.
  const cache = new Map<string, Promise<Real[]>>();

  async function renderPages(level: string, days: string[], count: number): Promise<Real[]> {
    const { draft } = sampleBook({
      level,
      workbookId: `55555555-5555-4555-8555-0000000000${level === "U4" ? "04" : level === "U16" ? "16" : "26"}`,
      childId: CHILD,
      child: "Mateo",
      number: 2,
    });
    const pages = draft.pages
      .filter((p: DraftPage) => p.dayLabel !== null && days.includes(p.dayLabel) && p.questions.length > 0)
      .slice(0, count)
      .map((p: DraftPage) => ({ ...p, qrToken: tokenOf(level, p.number) }));
    const result = await renderWorkbook({ draft: { ...draft, pages }, parentId: PARENT, template: await templatePromise, engine });
    if (result.status !== "rendered") throw new Error(JSON.stringify(result.problems.slice(0, 3)));
    return Promise.all(result.workbook.pages.map(async (page) => {
      const png = result.files.find((f) => f.path === page.image!.path)!.bytes;
      const questions = page.questions.map((q) => ({ number: q.number, package: q.package as never, regions: q.regions ?? null }));
      const regions = page.questions.flatMap((q) => q.regions ?? []);
      return {
        key: `${level} p${page.number}`,
        number: page.number,
        token: page.qrToken,
        contract: page.printContract!,
        png,
        grey: await greyRaster(png),
        plan: cropPlan(questions),
        regions,
        writing: regions.flatMap((r) => (r.box ? [r.box] : [])),
        questions,
      };
    }));
  }

  function realPages(level: string, days: string[], count: number): Promise<Real[]> {
    const prefixKey = `${level}|${days.join(",")}|`;
    const exactKey = `${prefixKey}${count}`;
    const exact = cache.get(exactKey);
    if (exact) return exact;
    for (const [key, existing] of cache.entries()) {
      if (!key.startsWith(prefixKey)) continue;
      const existingCount = Number(key.slice(prefixKey.length));
      if (existingCount >= count) return existing.then((pages) => pages.slice(0, count));
    }
    const pending = renderPages(level, days, count);
    cache.set(exactKey, pending);
    return pending;
  }

  return { realPages, close: () => engine.close() };
}

export const available = (p: Real) => printContractForPhoto({ printedRevision: REVISION }, { printContract: p.contract }, { printedRevision: REVISION });
export const calibrate = (photo: Raster, p: Real) => calibratePhoto({ photo, printed: p.grey, contract: available(p), pageLink: pageUrl(p.token), writing: p.writing });

/** Calibration, then the sheet check among other pages, as the crop job asks them. */
export function calibrateAmong(photo: Raster, p: Real, among: Raster[]) {
  const r = calibrate(photo, p);
  if (r.status !== "calibrated") return r;
  const sheet = sheetChecker({ photo, printed: p.grey, transform: r.calibration.transform, writing: p.writing })(among);
  return sheet.verdict === "this-page" ? r : { status: "refused" as const, reason: sheet.verdict };
}

export function written(p: Real, digit: (i: number) => number): Raster {
  const copy: Raster = { ...p.grey, data: p.grey.data.slice() };
  p.plan.crops.forEach((c, i) => drawDigit(copy, c.box, digit(i), 20));
  return copy;
}

/** Paints over the page's printed QR code, wherever it really printed. */
export function coverQr(r: Raster, p: Real): Raster {
  // The footer's left corner in the real template, found from the image's own marks would be overkill: a test of the
  // template as printed, so a generous box over the bottom left is enough.
  fillBox(r, p.contract.marks.points.bl.x + 20, p.contract.marks.points.bl.y - 150, 150, 120, 248);
  return r;
}

/**
 * The page with its QR code drawn again from the code's exact modules, each module edge rounded to whole pixels at
 * another phase: what another printer or another Chromium does with the template's crisp edges (Linux and macOS differ).
 */
export function rounded(p: Real, phase: number, pitch?: number): Raster {
  const r = p.grey;
  const rgba = new Uint8ClampedArray(r.width * r.height * 4);
  for (let i = 0; i < r.data.length; i++) { rgba[4 * i] = rgba[4 * i + 1] = rgba[4 * i + 2] = r.data[i]; rgba[4 * i + 3] = 255; }
  const found = jsQR(rgba, r.width, r.height)!;
  const { size, data } = QRCode.create(pageUrl(p.token), { errorCorrectionLevel: "M" }).modules;
  const printed = found.location.topLeftCorner, printedPitch = (found.location.topRightCorner.x - printed.x) / size;
  const out: Raster = { ...r, data: r.data.slice() };
  for (let y = Math.floor(printed.y - 2 * printedPitch); y < Math.ceil(printed.y + (size + 2) * printedPitch); y++) for (let x = Math.floor(printed.x - 2 * printedPitch); x < Math.ceil(printed.x + (size + 2) * printedPitch); x++) out.data[y * r.width + x] = 255;
  // With a whole number of pixels a module, the code is the same pixels on any machine, centred where it printed.
  const m = pitch ?? printedPitch;
  const tl = pitch ? { x: Math.round(printed.x + (size * (printedPitch - pitch)) / 2), y: Math.round(printed.y + (size * (printedPitch - pitch)) / 2) } : printed;
  const edge = (k: number, from: number) => Math.round(from + k * m + phase);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    if (!data[j * size + i]) continue;
    for (let y = edge(j, tl.y); y < edge(j + 1, tl.y); y++) out.data.fill(0, y * r.width + edge(i, tl.x), y * r.width + edge(i + 1, tl.x));
  }
  return out;
}

export const photoOf = async (r: Raster, size = SIZE, corners = uprightCorners(size, PAGE_SIZE, 70)) =>
  greyRaster(await photoJpeg(photographed(r, size, corners, { shade: 0.2 })));
