import { writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import type { Raster } from "@/lib/scan-calibration";
import { sheetChecker } from "@/lib/scan-calibration";
import { normalizeScanPhoto } from "@/lib/scan-photo-image";
import { drawDigit, greyRaster, photoJpeg, photographed, rotatedCorners, uprightCorners } from "@/lib/scan-synthetic";
import type { Point } from "@/lib/workbook-print-contract";
import { calibrate, calibrateAmong, chromium, createScanBindingContext, FULL, PAGE_SIZE, photoOf, rounded, SIZE, written, type Real } from "@/lib/scan-binding-chromium-harness";

const ctx = createScanBindingContext();
afterAll(() => ctx.close());

describe.skipIf(!chromium)("telling pages apart at every scale", () => {
  it("over scale and angle: no other page ever calibrates, and each right page the upload accepts does", async () => {
    // A false refusal hurts every family, and a false accept is a wrong mark. Both are counted: for the whole check, and for
    // the ink comparison alone, which near-twin pages can pass. The upload's own QR read is reported, since a photo that
    // fails it never reaches calibration. Each page is calibrated among all the matrix's pages, as the job does among the
    // child's pages (#456). For each pair the ink comparison passes and only the QR code stops, the sheet check is also asked
    // on its own, as if that page's code were pasted on the sheet. Set SCAN_MATRIX_OUT for the full matrix.
    const full = FULL;
    const pages = [
      ...await ctx.realPages("U4", ["Day 1", "Day 2"], full ? 6 : 2),
      ...await ctx.realPages("U16", ["Day 1", "Day 2"], full ? 12 : 3),
      ...await ctx.realPages("U26", ["Day 1", "Day 2"], full ? 6 : 1),
    ].filter((p) => p.contract);
    const greys = pages.map((p) => p.grey);
    const among = (photo: Raster, p: Real) => calibrateAmong(photo, p, greys);
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
    const wrong: { photo: string; against: string; scale: number; angle: string; status: string; reason: string | null; sheetStops?: boolean }[] = [];
    for (const c of conditions) for (const shown of pages) {
      const bytes = await photoJpeg(photographed(written(shown, (i) => (i * 3 + 1) % 10), SIZE, c.corners, { shade: 0.2 }));
      // What the upload stores is what calibration reads: the normalized photo, when the upload takes it.
      const normalized = await normalizeScanPhoto(bytes).catch(() => null);
      const uploadReads = normalized?.token === shown.token;
      const photo = await greyRaster(normalized ? normalized.bytes : bytes);
      const own = among(photo, shown);
      right.push({ page: shown.key, scale: c.scale, angle: c.angle, uploadReads, status: own.status, reason: own.status === "calibrated" ? null : own.reason });
      for (const against of pages) {
        if (against === shown) continue;
        const r = among(photo, against);
        const reason = r.status === "calibrated" ? null : r.reason;
        // (The sheet's marks map it the same way whichever page it is compared with.)
        const sheetStops = reason === "qr-mismatch" && own.status === "calibrated"
          ? sheetChecker({ photo, printed: against.grey, transform: own.calibration.transform, writing: against.writing })(greys).verdict !== "this-page" : undefined;
        wrong.push({ photo: shown.key, against: against.key, scale: c.scale, angle: c.angle, status: r.status, reason, sheetStops });
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
        nearTwinsAlsoStoppedBySheet: others.filter((r) => r.sheetStops).length,
      };
    });
    const summary = {
      pages: pages.length, conditions: conditions.length, right: right.length, uploadReads: accepted.length,
      calibratedOfRead: accepted.filter((r) => r.status === "calibrated").length,
      falseRefusals: accepted.filter((r) => r.status !== "calibrated").length,
      wrong: wrong.length, falseAccepts: wrong.filter((r) => r.status === "calibrated").length,
      passedInkStoppedByQr: wrong.filter((r) => r.reason === "qr-mismatch").length,
      nearTwinsSheetChecked: wrong.filter((r) => r.sheetStops !== undefined).length,
      nearTwinsAlsoStoppedBySheet: wrong.filter((r) => r.sheetStops).length,
      refusedOtherwise: wrong.filter((r) => r.status !== "calibrated" && r.reason !== "page-mismatch" && r.reason !== "qr-mismatch").length,
    };
    if (process.env.SCAN_MATRIX_OUT) writeFileSync(process.env.SCAN_MATRIX_OUT, `${JSON.stringify({ summary, byCondition, nearTwins: wrong.filter((r) => r.reason === "qr-mismatch"), falseRefusals: accepted.filter((r) => r.status !== "calibrated"), uploadCannotRead: right.filter((r) => !r.uploadReads).map((r) => ({ page: r.page, scale: r.scale, angle: r.angle, status: r.status })) }, null, 2)}\n`);
    expect(summary.falseAccepts, JSON.stringify(summary)).toBe(0);
    expect(summary.falseRefusals, JSON.stringify(accepted.filter((r) => r.status !== "calibrated"))).toBe(0);
    // (Pages that differ by a few digits can pass the ink comparison. Few may, and the sheet check must stop each of them
    // with no help from the QR code: a code pasted on a near twin is refused.)
    expect(summary.passedInkStoppedByQr / summary.wrong, JSON.stringify(summary)).toBeLessThan(0.05);
    // (The full matrix holds U4 pages 5 and 8, a near-twin pair; the quick one may hold none.)
    if (full) expect(summary.nearTwinsSheetChecked, JSON.stringify(summary)).toBeGreaterThan(0);
    expect(wrong.filter((r) => r.sheetStops === false), "near twins the sheet check passes").toEqual([]);
  }, FULL ? 3_600_000 : 560_000);

  it("writing that runs a little past the answer boxes does not refuse the right page", async () => {
    // Children overrun. Disproved if the comparison needs a spotless page.
    const shown = (await ctx.realPages("U16", ["Day 1"], 4)).filter((p) => p.plan.crops.length > 0);
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
    const pages = await ctx.realPages("U16", ["Day 1"], 2);
    const page4 = pages.find((p) => p.number === 4)!;
    const written4: Raster = { ...page4.grey, data: page4.grey.data.slice() };
    page4.plan.crops.forEach((c) => drawDigit(written4, c.box, 3, 20));
    const photo = await greyRaster(await photoJpeg(photographed(written4, SIZE, uprightCorners(SIZE, PAGE_SIZE, margin), { shade: 0.2 })));
    expect(calibrate(photo, page4).status).toBe("calibrated");
  }, 120_000);

  it("a small QR code that the upload read is read in place too", async () => {
    // Disproved if a photo the upload took is refused for its code. Whether the upload's own reader finds a code of about
    // 2 pixels a module depends on how the printer rounded its modules, which differs between machines (the Linux runner's
    // read none of the 70% photos). So the code is drawn at exactly 2 pixels a module, the same pixels everywhere, and the
    // page is brought closer, from 70% of the photo's height, until the upload takes it. On macOS it takes both pages from 75%
    // (about 1.8 photo pixels a module) and at every size above, and calibration reads each of those.
    const pages = (await ctx.realPages("U16", ["Day 1"], 2)).filter((p) => p.number === 3 || p.number === 4);
    expect(pages).toHaveLength(2);
    const taken: string[] = [];
    for (const p of pages) {
      const page = { ...p, grey: rounded(p, 0, 2) };
      for (const share of [0.7, 0.75, 0.8, 0.85, 0.9]) {
        const bytes = await photoJpeg(photographed(written(page, (i) => (i * 3 + 1) % 10), SIZE, uprightCorners(SIZE, PAGE_SIZE, ((1 - share) / 2) * SIZE.height), { shade: 0.2 }));
        const stored = await normalizeScanPhoto(bytes).catch(() => null);
        if (!stored) continue;
        expect(stored.token).toBe(p.token);
        expect(calibrate(await greyRaster(stored.bytes), page).status, `${p.key} at ${share}`).toBe("calibrated");
        taken.push(`${p.key} at ${share}`);
        break;
      }
    }
    // (Each page is taken at some distance, so the check above cannot pass with nothing to check.)
    expect(taken, `taken: ${taken.join(", ")}`).toHaveLength(2);
  }, 240_000);

  it("the right page's code reads in place however the printer rounded its modules, from each angle", async () => {
    // Disproved if the QR check needs this machine's own rounding of the code's modules: the Linux runner's Chromium
    // rounds them otherwise, and refused page 5 at 7 degrees. Each page, with its code drawn at three other phases, from
    // the angles the crop test uses.
    const pages = [...await ctx.realPages("U4", ["Day 1"], 4), ...await ctx.realPages("U16", ["Day 1"], 4)].filter((p) => p.plan.crops.length > 0);
    const angles = {
      "straight on": uprightCorners(SIZE, PAGE_SIZE, 60),
      "rotated 7 degrees": rotatedCorners(uprightCorners(SIZE, PAGE_SIZE, 170), 7, { x: 750, y: 950 }),
      tilted: [{ x: 280, y: 110 }, { x: 1240, y: 150 }, { x: 1390, y: 1790 }, { x: 110, y: 1760 }],
      "upside down": rotatedCorners(uprightCorners(SIZE, PAGE_SIZE, 60), 180, { x: 750, y: 950 }),
    };
    const refused: string[] = [];
    for (const p of pages) for (const phase of [0.25, 0.5, 0.75]) {
      const page = { ...p, grey: rounded(p, phase) };
      for (const [angle, corners] of Object.entries(angles)) {
        const r = calibrate(await photoOf(written(page, (i) => (i * 3 + 1) % 10), SIZE, corners), page);
        if (r.status !== "calibrated") refused.push(`${p.key} rounded at ${phase}, ${angle}: ${r.reason}`);
      }
    }
    expect(refused).toEqual([]);
  }, 400_000);
});
