import { afterAll, describe, expect, it } from "vitest";
import type { Raster } from "@/lib/scan-calibration";
import { normalizeScanPhoto } from "@/lib/scan-photo-image";
import { drawDigit, greyRaster, photoJpeg, photographed, rotatedCorners, uprightCorners } from "@/lib/scan-synthetic";
import { calibrate, chromium, createScanBindingContext, PAGE_SIZE, photoOf, rounded, SIZE, written } from "@/lib/scan-binding-chromium-harness";

const ctx = createScanBindingContext();
afterAll(() => ctx.close());

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
