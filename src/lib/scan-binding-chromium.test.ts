import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { chromiumPrintEngine, findChromium } from "@/lib/print-engine-chromium";
import { calibratePhoto, cropBox, cropPlan, type CropItem, type Raster } from "@/lib/scan-calibration";
import { runScanCrops, scanPartPath, type ScanFrame } from "@/lib/scan-crops";
import { memoryScanCropStore } from "@/lib/scan-crops-memory";
import { normalizeScanPhoto } from "@/lib/scan-photo-image";
import { cropCut, drawDigit, fillBox, greyRaster, photoJpeg, photographed, readDigit, rotatedCorners, uprightCorners } from "@/lib/scan-synthetic";
import { printContractForPhoto, type Box, type PagePrintContract, type Point, type PrintedRegion } from "@/lib/workbook-print-contract";
import { pageUrl, renderWorkbook, type DraftPage } from "@/lib/workbook-render";
import { sampleBook } from "@/lib/workbook-sample-book";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";

// Which sheet a photo's crops come from, on pages printed by real Chromium with the real template. A wrong crop is a wrong
// mark on a child's work, so each test here asks for a refusal, with a control that the same page calibrates when it is
// right. Set SCAN_MATRIX_OUT to write the full page matrix as evidence. Skipped where no Chromium is found.

const chromium = await findChromium();
const PARENT = "11111111-1111-4111-8111-111111111111", CHILD = "22222222-2222-4222-8222-222222222222", REVISION = "c".repeat(28);
const PAGE_SIZE = { width: 1275, height: 1650 };
/** The full page matrix, written to SCAN_MATRIX_OUT: more pages and page sizes, and much slower. */
const FULL = !!process.env.SCAN_MATRIX_OUT;
const SIZE = { width: 1500, height: 1900 };

interface Real { key: string; number: number; token: string; contract: PagePrintContract; png: Uint8Array; grey: Raster; plan: ReturnType<typeof cropPlan>; regions: PrintedRegion[]; writing: Box[]; questions: ScanFrame["page"]["questions"] }

const tokenOf = (level: string, n: number) => `matrix${level}${String(n).padStart(4, "0")}xxxxxxxxxx`;

async function realPages(level: string, days: string[], count: number): Promise<Real[]> {
  const { draft } = sampleBook({ level, workbookId: `55555555-5555-4555-8555-0000000000${level === "U4" ? "04" : level === "U16" ? "16" : "26"}`, childId: CHILD, child: "Mateo", number: 2 });
  const pages = draft.pages.filter((p: DraftPage) => p.dayLabel !== null && days.includes(p.dayLabel) && p.questions.length > 0).slice(0, count)
    .map((p: DraftPage) => ({ ...p, qrToken: tokenOf(level, p.number) }));
  const result = await renderWorkbook({ draft: { ...draft, pages }, parentId: PARENT, template: workbookTemplate(await fixedTemplateFonts()), engine: chromiumPrintEngine() });
  if (result.status !== "rendered") throw new Error(JSON.stringify(result.problems.slice(0, 3)));
  return Promise.all(result.workbook.pages.map(async (page) => {
    const png = result.files.find((f) => f.path === page.image!.path)!.bytes;
    const questions = page.questions.map((q) => ({ number: q.number, package: q.package as never, regions: q.regions ?? null }));
    const regions = page.questions.flatMap((q) => q.regions ?? []);
    return {
      key: `${level} p${page.number}`, number: page.number, token: page.qrToken, contract: page.printContract!, png, grey: await greyRaster(png),
      plan: cropPlan(questions), regions, writing: regions.flatMap((r) => (r.box ? [r.box] : [])), questions,
    };
  }));
}

const available = (p: Real) => printContractForPhoto({ printedRevision: REVISION }, { printContract: p.contract }, { printedRevision: REVISION });
const calibrate = (photo: Raster, p: Real) => calibratePhoto({ photo, printed: p.grey, contract: available(p), pageLink: pageUrl(p.token), writing: p.writing });

function written(p: Real, digit: (i: number) => number): Raster {
  const copy: Raster = { ...p.grey, data: p.grey.data.slice() };
  p.plan.crops.forEach((c, i) => drawDigit(copy, c.box, digit(i), 20));
  return copy;
}

/** Paints over the page's printed QR code, wherever it really printed. */
function coverQr(r: Raster, p: Real): Raster {
  // The footer's left corner in the real template, found from the image's own marks would be overkill: a test of the
  // template as printed, so a generous box over the bottom left is enough.
  fillBox(r, p.contract.marks.points.bl.x + 20, p.contract.marks.points.bl.y - 150, 150, 120, 248);
  return r;
}

const photoOf = async (r: Raster, size = SIZE, corners = uprightCorners(size, PAGE_SIZE, 70)) => greyRaster(await photoJpeg(photographed(r, size, corners, { shade: 0.2 })));

describe.skipIf(!chromium)("binding a photo to its printed page", () => {
  let pages: Real[], page: Real;
  beforeAll(async () => {
    pages = await realPages("U16", ["Day 1"], 4);
    page = pages.find((p) => p.plan.crops.length >= 5)!;
  }, 120_000);

  const THREE = () => 3, EIGHT = () => 8;

  /** Two copies on one photo: a smaller one and a larger one beside it. */
  function twoCopies(small: Raster, large: Raster) {
    const size = { width: 2600, height: 1900 };
    const onto = { ...size, channels: 1 as const, data: new Uint8Array(size.width * size.height).fill(96) };
    photographed(small, size, uprightCorners({ width: 800, height: 1900 }, PAGE_SIZE, 420), { onto });
    const at = uprightCorners({ width: 1500, height: 1900 }, PAGE_SIZE, 60).map((c) => ({ x: c.x + 1000, y: c.y }));
    photographed(large, size, at, { onto });
    return photoJpeg(onto);
  }

  it("a control: one copy with its own QR code calibrates, and the crops hold its answers", async () => {
    const photo = await photoOf(written(page, THREE));
    const result = calibrate(photo, page);
    if (result.status !== "calibrated") throw new Error(`refused: ${result.reason}`);
    const reads = page.plan.crops.map((c: CropItem) => readDigit(cropBox(photo, result.calibration, page.contract, c.box), cropCut(c.box), c.box));
    expect(reads).toEqual(page.plan.crops.map(() => 3));
  }, 30_000);

  it("the job refuses two copies on one photo: a smaller copy with its QR code, a larger copy with it covered", async () => {
    // Disproved if crops holding 8 are saved for the page whose visible QR code sits on the copy holding 3.
    const bytes = await twoCopies(written(page, THREE), coverQr(written(page, EIGHT), page));
    const now = Date.parse("2026-11-05T12:00:00Z"), id = "00000000-0000-4000-8000-0000000000a1";
    const m = memoryScanCropStore({ now: () => now });
    m.printed.set("printed.png", page.png);
    m.photos.set(id, { parent: PARENT, state: "saved", createdAt: now, expiresAt: now + 86_400_000, bytes, storedBytes: 1, frame: { printedRevision: REVISION, book: { printedRevision: REVISION }, page: { printContract: page.contract, imagePath: "printed.png", qrToken: page.token, questions: page.questions } } });
    const preview = await runScanCrops(m.store, { parent: PARENT, photo: id }, "00000000-0000-4000-8000-000000000001");
    expect(preview).toEqual({ status: "refused", reason: "ambiguous-page" });
    expect(m.filesOf(id)).toEqual([]);
    expect(m.objects.has(scanPartPath(PARENT, id, "00000000-0000-4000-8000-000000000001", "straight"))).toBe(false);
  }, 60_000);

  it("refuses two copies that both show their QR code: it cannot know which sheet was meant", async () => {
    const photo = await greyRaster(await twoCopies(written(page, THREE), written(page, EIGHT)));
    expect(calibrate(photo, page)).toEqual({ status: "refused", reason: "ambiguous-page" });
  }, 60_000);

  it("refuses a page whose QR code is covered: its identity cannot be read inside the rectangle", async () => {
    const photo = await photoOf(coverQr(written(page, THREE), page));
    expect(calibrate(photo, page)).toEqual({ status: "refused", reason: "qr-mismatch" });
  }, 30_000);

  it("refuses the right page with another page's QR code printed in its place", async () => {
    // Disproved if any readable QR code passes. The link is the page's own, not whichever code a photo holds.
    const photo = await photoOf(written(page, THREE));
    const result = calibratePhoto({ photo, printed: page.grey, contract: available(page), pageLink: pageUrl("another-page-token-000"), writing: page.writing });
    expect(result).toEqual({ status: "refused", reason: "qr-mismatch" });
  }, 30_000);

  it("a mirrored photo is refused, and a photo in poor light or upside down is read the right way up or refused", async () => {
    // Disproved if a calibration ever comes back with the page the wrong way up.
    const r = written(page, THREE);
    const base = await sharp(Buffer.from(r.data), { raw: { width: r.width, height: r.height, channels: 1 } });
    const read = async (s: typeof base) => greyRaster(await s.clone().jpeg({ quality: 88 }).toBuffer());
    expect((calibrate(await read(base.clone().flop()), page)).status).toBe("refused");
    const upside = calibrate(await read(base.clone().rotate(180)), page);
    if (upside.status === "calibrated") expect(upside.calibration.quarterTurns).toBe(2);
    const dark: Raster = { ...r, data: r.data.map((v, i) => Math.round(v * (0.15 + (0.5 * (i % r.width)) / r.width))) };
    const dim = calibrate(await greyRaster(await photoJpeg(dark)), page);
    if (dim.status === "calibrated") expect(dim.calibration.quarterTurns).toBe(0);
  }, 60_000);

  it("refuses a QR code that sits elsewhere on the sheet than the contract's page image places it", async () => {
    // The right code, moved: it reads, but not where this page printed it.
    const moved = written(page, THREE);
    const bl = page.contract.marks.points.bl;
    const box = { x: bl.x + 20, y: bl.y - 150, width: 150, height: 120 };
    const pixels = new Uint8Array(moved.data);
    for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) moved.data[(y + 200) * moved.width + x + 600] = pixels[Math.round(box.y + y) * moved.width + Math.round(box.x + x)];
    coverQr(moved, page);
    expect(calibrate(await photoOf(moved), page)).toEqual({ status: "refused", reason: "qr-mismatch" });
  }, 30_000);
});

describe.skipIf(!chromium)("telling pages apart at every scale", () => {
  it("over scale and angle: no other page ever calibrates, and each right page the upload accepts does", async () => {
    // A false refusal hurts every family, and a false accept is a wrong mark. Both are counted: for the whole check, and for
    // the ink comparison alone, which near-twin pages can pass. The upload's own QR read is reported, since a photo that
    // fails it never reaches calibration. Set SCAN_MATRIX_OUT for the full matrix.
    const full = FULL;
    const pages = [
      ...await realPages("U4", ["Day 1", "Day 2"], full ? 6 : 2),
      ...await realPages("U16", ["Day 1", "Day 2"], full ? 12 : 3),
      ...await realPages("U26", ["Day 1", "Day 2"], full ? 6 : 1),
    ].filter((p) => p.contract);
    const margin = (share: number) => (SIZE.height - share * SIZE.height) / 2;
    const centre = { x: SIZE.width / 2, y: SIZE.height / 2 };
    const tilted = (share: number) => { const c = uprightCorners(SIZE, PAGE_SIZE, margin(share)); return [{ x: c[0].x + 90, y: c[0].y + 30 }, { x: c[1].x - 90, y: c[1].y + 30 }, c[2], c[3]]; };
    const upright = (share: number) => uprightCorners(SIZE, PAGE_SIZE, margin(share));
    const turned = (share: number) => rotatedCorners(upright(share), 7, centre);
    const conditions: { scale: number; angle: string; corners: Point[] }[] = (full ? [0.5, 0.6, 0.7, 0.77, 0.85, 0.95] : [0.5, 0.77, 0.95]).flatMap((scale) => [
      { scale, angle: "upright", corners: upright(scale) },
      ...(scale <= 0.85 ? [{ scale, angle: "rotated 7 degrees", corners: turned(scale) }, { scale, angle: "tilted", corners: tilted(scale) }] : []),
    ]);
    const right: { page: string; scale: number; angle: string; uploadReads: boolean; status: string; reason: string | null }[] = [];
    const wrong: { photo: string; against: string; scale: number; angle: string; status: string; reason: string | null }[] = [];
    for (const c of conditions) for (const shown of pages) {
      const bytes = await photoJpeg(photographed(written(shown, (i) => (i * 3 + 1) % 10), SIZE, c.corners, { shade: 0.2 }));
      // What the upload stores is what calibration reads: the normalized photo, when the upload takes it.
      const normalized = await normalizeScanPhoto(bytes).catch(() => null);
      const uploadReads = normalized?.token === shown.token;
      const photo = await greyRaster(normalized ? normalized.bytes : bytes);
      for (const against of pages) {
        const r = calibrate(photo, against);
        const reason = r.status === "calibrated" ? null : r.reason;
        if (against === shown) right.push({ page: shown.key, scale: c.scale, angle: c.angle, uploadReads, status: r.status, reason });
        else wrong.push({ photo: shown.key, against: against.key, scale: c.scale, angle: c.angle, status: r.status, reason });
      }
    }
    const accepted = right.filter((r) => r.uploadReads);
    const byCondition = conditions.map(({ scale, angle }) => {
      const rows = right.filter((r) => r.scale === scale && r.angle === angle), read = rows.filter((r) => r.uploadReads);
      const others = wrong.filter((r) => r.scale === scale && r.angle === angle);
      return {
        pageFill: Math.round(scale * 100), angle, rightPages: rows.length, uploadReads: read.length,
        rightAccepted: read.filter((r) => r.status === "calibrated").length,
        falseRefusals: read.filter((r) => r.status !== "calibrated").length,
        wrongPages: others.length, wrongAccepted: others.filter((r) => r.status === "calibrated").length,
        passedInkStoppedByQr: others.filter((r) => r.reason === "qr-mismatch").length,
      };
    });
    const summary = {
      pages: pages.length, conditions: conditions.length, right: right.length, uploadReads: accepted.length,
      calibratedOfRead: accepted.filter((r) => r.status === "calibrated").length,
      falseRefusals: accepted.filter((r) => r.status !== "calibrated").length,
      wrong: wrong.length, falseAccepts: wrong.filter((r) => r.status === "calibrated").length,
      passedInkStoppedByQr: wrong.filter((r) => r.reason === "qr-mismatch").length,
      refusedOtherwise: wrong.filter((r) => r.status !== "calibrated" && r.reason !== "page-mismatch" && r.reason !== "qr-mismatch").length,
    };
    if (process.env.SCAN_MATRIX_OUT) writeFileSync(process.env.SCAN_MATRIX_OUT, `${JSON.stringify({ summary, byCondition, nearTwins: wrong.filter((r) => r.reason === "qr-mismatch"), falseRefusals: accepted.filter((r) => r.status !== "calibrated"), uploadCannotRead: right.filter((r) => !r.uploadReads).map((r) => ({ page: r.page, scale: r.scale, angle: r.angle, status: r.status })) }, null, 2)}\n`);
    expect(summary.falseAccepts, JSON.stringify(summary)).toBe(0);
    expect(summary.falseRefusals, JSON.stringify(accepted.filter((r) => r.status !== "calibrated"))).toBe(0);
    // (Pages that differ by a few digits can pass the ink comparison: only the QR code tells those apart. Few may.)
    expect(summary.passedInkStoppedByQr / summary.wrong, JSON.stringify(summary)).toBeLessThan(0.05);
  }, FULL ? 3_600_000 : 560_000);

  it("writing that runs a little past the answer boxes does not refuse the right page", async () => {
    // Children overrun. Disproved if the comparison needs a spotless page.
    const shown = (await realPages("U16", ["Day 1"], 4)).filter((p) => p.plan.crops.length > 0);
    for (const p of shown) for (const over of [2, 5, 10]) {
      const r: Raster = { ...p.grey, data: p.grey.data.slice() };
      p.plan.crops.forEach((c, i) => drawDigit(r, { x: c.box.x - over, y: c.box.y - over, width: c.box.width + 2 * over, height: c.box.height + 2 * over }, (i * 3 + 1) % 10, 20));
      expect(calibrate(await photoOf(r), p).status, `${p.key} over ${over}`).toBe("calibrated");
    }
  }, 200_000);
});

describe.skipIf(!chromium)("comparison across scale", () => {
  it.each([{ margin: 160 }, { margin: 220 }])("the right page calibrates when it fills less of the photo: margin $margin", async ({ margin }) => {
    // Disproved if a normal photo is refused because the page is further away. Reproduces the re-review of #610: U16 page 4,
    // upright, all marks and the QR code readable.
    const pages = await realPages("U16", ["Day 1"], 2);
    const page4 = pages.find((p) => p.number === 4)!;
    const written4: Raster = { ...page4.grey, data: page4.grey.data.slice() };
    page4.plan.crops.forEach((c) => drawDigit(written4, c.box, 3, 20));
    const photo = await greyRaster(await photoJpeg(photographed(written4, SIZE, uprightCorners(SIZE, PAGE_SIZE, margin), { shade: 0.2 })));
    expect(calibrate(photo, page4).status).toBe("calibrated");
  }, 120_000);

  it("a small QR code that the upload read is read in place too", async () => {
    // Disproved if a photo the upload accepted is refused for its code. At 70% of the photo's height the code is about 2.4
    // pixels a module: too few for a window around it, but the whole photo reads, as the upload reads it.
    const pages = (await realPages("U16", ["Day 1"], 2)).filter((p) => p.number === 3 || p.number === 4);
    expect(pages).toHaveLength(2);
    for (const p of pages) {
      const bytes = await photoJpeg(photographed(written(p, (i) => (i * 3 + 1) % 10), SIZE, uprightCorners(SIZE, PAGE_SIZE, 0.15 * SIZE.height), { shade: 0.2 }));
      const stored = await normalizeScanPhoto(bytes);
      expect(stored.token).toBe(p.token);
      expect(calibrate(await greyRaster(stored.bytes), p).status, p.key).toBe("calibrated");
    }
  }, 120_000);
});
