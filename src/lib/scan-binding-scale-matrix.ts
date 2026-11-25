import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import type { Raster } from "@/lib/scan-calibration";
import { sheetChecker } from "@/lib/scan-calibration";
import { normalizeScanPhoto } from "@/lib/scan-photo-image";
import { greyRaster, photoJpeg, photographed, rotatedCorners, uprightCorners } from "@/lib/scan-synthetic";
import type { Point } from "@/lib/workbook-print-contract";
import { calibrateAmong, chromium, createScanBindingContext, FULL, PAGE_SIZE, SIZE, written, type Real } from "@/lib/scan-binding-chromium-harness";

// The page matrix: every page's photo, at each scale and angle, calibrated against every page. The quick form is split by the
// page in the photo, one part a test file, so the parts run on their own machines (docs/ci/README.md). Each part has every
// scale and angle and compares with every page. The full form (SCAN_MATRIX_OUT) is one part, in the first file.

/** The parts of the quick form. Each photographs every third page. */
export const PARTS = 3;

const SCALE_FILE = /^scan-binding-scale(?:-(\d+))?-chromium\.test\.ts$/;
/** Which part a test file runs, by its name (no number is part 1), or null for another file. */
export function partOfFile(name: string): number | null {
  const found = SCALE_FILE.exec(name);
  return found && Number(found[1] ?? 1);
}

/** The books of the matrix, and how many of each one's first pages. */
export const matrixBooks = (full: boolean): [level: string, pages: number][] => [["U4", full ? 6 : 2], ["U16", full ? 12 : 3], ["U26", full ? 6 : 1]];

/** The pages of the matrix a part photographs. The full form is all in part 1. */
export function shownInPart(part: number, pages: number, full: boolean): number[] {
  const all = Array.from({ length: pages }, (_, i) => i);
  if (full) return part === 1 ? all : [];
  return all.filter((i) => i % PARTS === part - 1);
}

export interface MatrixCondition { scale: number; angle: string; corners: Point[] }
export function matrixConditions(full: boolean): MatrixCondition[] {
  const margin = (share: number) => (SIZE.height - share * SIZE.height) / 2;
  const centre = { x: SIZE.width / 2, y: SIZE.height / 2 };
  const upright = (share: number) => uprightCorners(SIZE, PAGE_SIZE, margin(share));
  const tilted = (share: number) => { const c = upright(share); return [{ x: c[0].x + 90, y: c[0].y + 30 }, { x: c[1].x - 90, y: c[1].y + 30 }, c[2], c[3]]; };
  const turned = (share: number) => rotatedCorners(upright(share), 7, centre);
  return (full ? [0.5, 0.6, 0.7, 0.77, 0.85, 0.95] : [0.5, 0.77, 0.95]).flatMap((scale) => [
    { scale, angle: "upright", corners: upright(scale) },
    ...(scale <= 0.85 ? [{ scale, angle: "rotated 7 degrees", corners: turned(scale) }, { scale, angle: "tilted", corners: tilted(scale) }] : []),
  ]);
}

/**
 * Part 3 is the slowest, with 39% of the work of the whole quick form. That form took 267 to 542 seconds on GitHub as one file
 * (13 runs of main, 2026-11-24), so part 3 is expected to take 104 to 210 seconds there. The limit is two times the slowest.
 */
const PART_LIMIT = 420_000;

/** The test of one part, for the test file whose `import.meta.url` is `fileUrl`. */
export function describeMatrixPart(fileUrl: string) {
  const part = partOfFile(fileURLToPath(fileUrl).split(/[\\/]/).at(-1)!)!;
  const ctx = createScanBindingContext();
  afterAll(() => ctx.close());

  // A part that is skipped for want of a browser would pass.
  it.runIf(process.env.CI)("has a browser in CI", () => expect(Boolean(chromium)).toBe(true));

  describe.skipIf(!chromium || (FULL && part > 1))(`telling pages apart at every scale, part ${part}`, () => {
    it("over scale and angle: no other page ever calibrates, and each right page the upload accepts does", async () => {
      // A false refusal hurts every family, and a false accept is a wrong mark. Both are counted: for the whole check, and for
      // the ink comparison alone, which near-twin pages can pass. The upload's own QR read is reported, since a photo that
      // fails it never reaches calibration. Each page is calibrated among all the matrix's pages, as the job does among the
      // child's pages (#456). For each pair the ink comparison passes and only the QR code stops, the sheet check is also asked
      // on its own, as if that page's code were pasted on the sheet. Set SCAN_MATRIX_OUT for the full matrix.
      const full = FULL;
      const pages: Real[] = [];
      for (const [level, count] of matrixBooks(full)) pages.push(...(await ctx.realPages(level, ["Day 1", "Day 2"], count)).filter((p) => p.contract));
      expect(pages.length, "pages of the matrix").toBe(full ? 24 : 6);
      const shownPages = shownInPart(part, pages.length, full).map((i) => pages[i]);
      const greys = pages.map((p) => p.grey);
      // What calibration was really asked, written where it is asked.
      const asked: string[] = [];
      const among = (c: MatrixCondition, photo: { of: Real; raster: Raster }, p: Real) => {
        asked.push(`${c.scale} ${c.angle} ${photo.of.key} against ${p.key}`);
        return calibrateAmong(photo.raster, p, greys);
      };
      const conditions = matrixConditions(full);
      const right: { page: string; scale: number; angle: string; uploadReads: boolean; status: string; reason: string | null }[] = [];
      const wrong: { photo: string; against: string; scale: number; angle: string; status: string; reason: string | null; sheetStops?: boolean }[] = [];
      for (const c of conditions) for (const shown of shownPages) {
        const bytes = await photoJpeg(photographed(written(shown, (i) => (i * 3 + 1) % 10), SIZE, c.corners, { shade: 0.2 }));
        // What the upload stores is what calibration reads: the normalized photo, when the upload takes it.
        const normalized = await normalizeScanPhoto(bytes).catch(() => null);
        const uploadReads = normalized?.token === shown.token;
        const photo = { of: shown, raster: await greyRaster(normalized ? normalized.bytes : bytes) };
        const own = among(c, photo, shown);
        right.push({ page: shown.key, scale: c.scale, angle: c.angle, uploadReads, status: own.status, reason: own.status === "calibrated" ? null : own.reason });
        for (const against of pages) {
          if (against === shown) continue;
          const r = among(c, photo, against);
          const reason = r.status === "calibrated" ? null : r.reason;
          // (The sheet's marks map it the same way whichever page it is compared with.)
          const sheetStops = reason === "qr-mismatch" && own.status === "calibrated"
            ? sheetChecker({ photo: photo.raster, printed: against.grey, transform: own.calibration.transform, writing: against.writing })(greys).verdict !== "this-page" : undefined;
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
      console.info(`[scan-matrix] part ${part}: ${JSON.stringify(summary)}`);
      if (process.env.SCAN_MATRIX_OUT) writeFileSync(process.env.SCAN_MATRIX_OUT, `${JSON.stringify({ summary, byCondition, nearTwins: wrong.filter((r) => r.reason === "qr-mismatch"), falseRefusals: accepted.filter((r) => r.status !== "calibrated"), uploadCannotRead: right.filter((r) => !r.uploadReads).map((r) => ({ page: r.page, scale: r.scale, angle: r.angle, status: r.status })) }, null, 2)}\n`);
      // Nothing is left out: each condition has each page of this part, against every other page, one time.
      const quick = ["0.5 upright", "0.5 rotated 7 degrees", "0.5 tilted", "0.77 upright", "0.77 rotated 7 degrees", "0.77 tilted", "0.95 upright"];
      const expected = full ? conditions.map((c) => `${c.scale} ${c.angle}`) : quick;
      expect(expected.length).toBe(full ? 16 : 7);
      expect(right.map((r) => `${r.scale} ${r.angle} ${r.page}`)).toEqual(expected.flatMap((c) => shownPages.map((p) => `${c} ${p.key}`)));
      expect(wrong.map((r) => `${r.scale} ${r.angle} ${r.photo} against ${r.against}`))
        .toEqual(expected.flatMap((c) => shownPages.flatMap((p) => pages.filter((q) => q !== p).map((q) => `${c} ${p.key} against ${q.key}`))));
      expect(asked).toEqual(expected.flatMap((c) => shownPages.flatMap((p) => [p, ...pages.filter((q) => q !== p)].map((q) => `${c} ${p.key} against ${q.key}`))));
      expect(new Set(pages.map((p) => p.key)).size).toBe(pages.length);
      expect(summary.falseAccepts, JSON.stringify(summary)).toBe(0);
      expect(summary.falseRefusals, JSON.stringify(accepted.filter((r) => r.status !== "calibrated"))).toBe(0);
      // (A part whose uploads read no photo would say nothing about refusals.)
      expect(summary.uploadReads, JSON.stringify(summary)).toBeGreaterThan(0);
      // (Pages that differ by a few digits can pass the ink comparison. Few may, and the sheet check must stop each of them
      // with no help from the QR code: a code pasted on a near twin is refused. When each part is below the limit, so is the
      // whole matrix: the whole's share lies between the parts' shares.)
      expect(summary.passedInkStoppedByQr / summary.wrong, JSON.stringify(summary)).toBeLessThan(0.05);
      // (The full matrix holds U4 pages 5 and 8, a near-twin pair; the quick one may hold none.)
      if (full) expect(summary.nearTwinsSheetChecked, JSON.stringify(summary)).toBeGreaterThan(0);
      expect(wrong.filter((r) => r.sheetStops === false), "near twins the sheet check passes").toEqual([]);
    }, FULL ? 3_600_000 : PART_LIMIT);
  });
  return ctx;
}
