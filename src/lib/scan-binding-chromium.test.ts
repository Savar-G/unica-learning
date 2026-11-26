import jsQR from "jsqr";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calibratePhoto, cropBox, type CropItem, type Raster } from "@/lib/scan-calibration";
import { readScanPreview, runScanCrops } from "@/lib/scan-crops";
import { memoryScanCropStore } from "@/lib/scan-crops-memory";
import { normalizeScanPhoto } from "@/lib/scan-photo-image";
import { cropCut, drawDigit, greyRaster, photoJpeg, photographed, readDigit, rotatedCorners, uprightCorners } from "@/lib/scan-synthetic";
import { pageUrl } from "@/lib/workbook-render";
import { available, calibrate, calibrateAmong, chromium, coverQr, createScanBindingContext, PAGE_SIZE, PARENT, photoOf, REVISION, SIZE, written, type Real } from "@/lib/scan-binding-chromium-harness";

// Which sheet a photo's crops come from, on pages printed by real Chromium with the real template. A wrong crop is a wrong
// mark on a child's work, so each test here asks for a refusal, with a control that the same page calibrates when it is
// right. Scale & angle matrix cases live in src/lib/scan-binding-scale*-chromium.test.ts and QR/scale margin cases live in
// src/lib/scan-binding-qr-chromium.test.ts. Skipped where no Chromium is found.

const ctx = createScanBindingContext();
afterAll(() => ctx.close());

describe.skipIf(!chromium)("binding a photo to its printed page", () => {
  let pages: Real[], page: Real;
  beforeAll(async () => {
    pages = await ctx.realPages("U16", ["Day 1"], 4);
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

  it("the job cannot file two copies when neither code is readable", async () => {
    // Disproved if crops holding 8 are saved for the page whose visible QR code sits on the copy holding 3.
    const bytes = await twoCopies(written(page, THREE), coverQr(written(page, EIGHT), page));
    const now = Date.parse("2026-11-05T12:00:00Z"), id = "00000000-0000-4000-8000-0000000000a1";
    const m = memoryScanCropStore({ now: () => now });
    m.printed.set("printed.png", page.png);
    m.photos.set(id, { parent: PARENT, state: "saved", createdAt: now, expiresAt: now + 86_400_000, bytes, storedBytes: 1, frame: { printedRevision: REVISION, book: { printedRevision: REVISION }, page: { printContract: page.contract, imagePath: "printed.png", qrToken: page.token, questions: page.questions, others: [] } } });
    const preview = await runScanCrops(m.store, { parent: PARENT, photo: id }, "00000000-0000-4000-8000-000000000001");
    expect(preview).toEqual({ status: "refused", reason: "ambiguous-page" });
    expect(m.filesOf(id)).toEqual([]);
  }, 60_000);

  it("takes a page lying on the rest of the book, whose sheet below shows its marks beside the page's own (#912)", async () => {
    // Disproved if the sheet below, showing its marks beside the page's own, makes the page refused or misplaced. (The
    // mixed-mark rectangles that refused real photos as "ambiguous-page" did not follow the print in synthetic photos;
    // the real Robin set is the evidence for the fix, this keeps the case covered.)
    const below = pages.find((p) => p !== page)!;
    const size = { width: 2100, height: 2800 };
    const onto = { ...size, channels: 1 as const, data: new Uint8Array(size.width * size.height).fill(96) };
    const top = uprightCorners(size, PAGE_SIZE, 260);
    photographed(written(below, EIGHT), size, rotatedCorners(top.map((c) => ({ x: c.x + 110, y: c.y + 80 })), 2, { x: 1050, y: 1400 }), { onto });
    photographed(written(page, THREE), size, top, { onto });
    const photo = await greyRaster(await photoJpeg(onto));
    const result = calibrate(photo, page);
    if (result.status !== "calibrated") throw new Error(`refused: ${result.reason}`);
    const reads = page.plan.crops.map((c: CropItem) => readDigit(cropBox(photo, result.calibration, page.contract, c.box), cropCut(c.box), c.box));
    expect(reads).toEqual(page.plan.crops.map(() => 3));
  }, 60_000);

  it("holds two copies with the same QR code for team review", async () => {
    const photo = await greyRaster(await twoCopies(written(page, THREE), written(page, EIGHT)));
    expect(calibrate(photo, page)).toEqual({ status: "review", reason: "ambiguous-page" });
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

  it("a mirror has no automatic marks, and a poor-light or upside-down page can only be placed right way up", async () => {
    // Disproved if a calibration ever comes back with the page the wrong way up.
    const r = written(page, THREE);
    const base = await sharp(Buffer.from(r.data), { raw: { width: r.width, height: r.height, channels: 1 } });
    const read = async (s: typeof base) => greyRaster(await s.clone().jpeg({ quality: 88 }).toBuffer());
    expect((calibrate(await read(base.clone().flop()), page)).status).not.toBe("calibrated");
    const upside = calibrate(await read(base.clone().rotate(180)), page);
    if (upside.status === "calibrated") expect(upside.calibration.quarterTurns).toBe(2);
    const dark: Raster = { ...r, data: r.data.map((v, i) => Math.round(v * (0.15 + (0.5 * (i % r.width)) / r.width))) };
    const dim = calibrate(await greyRaster(await photoJpeg(dark)), page);
    if (dim.status === "calibrated") expect(dim.calibration.quarterTurns).toBe(0);
  }, 60_000);

  it("holds a QR code moved away from where the page printed it", async () => {
    // The right code, moved: it reads, but not where this page printed it.
    const moved = written(page, THREE);
    const bl = page.contract.marks.points.bl;
    const box = { x: bl.x + 20, y: bl.y - 150, width: 150, height: 120 };
    const pixels = new Uint8Array(moved.data);
    for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) moved.data[(y + 200) * moved.width + x + 600] = pixels[Math.round(box.y + y) * moved.width + Math.round(box.x + x)];
    coverQr(moved, page);
    expect(calibrate(await photoOf(moved), page)).toMatchObject({ status: "review" });
  }, 30_000);
});

describe.skipIf(!chromium)("one sheet, this page: a near twin's print anywhere on the sheet refuses it (#456)", () => {
  // U4 pages 5 and 8 print the same template and differ by a few digits: the page comparison passes either for the other,
  // so the QR code alone said which page a photo holds. The photos here were accepted before #456, with the other page's
  // answers cropped (the cases from the PR #610 and #637 reviews).
  let pages: Real[], p5: Real, p8: Real, others: Raster[];
  beforeAll(async () => {
    pages = await ctx.realPages("U4", ["Day 1"], 6);
    p5 = pages.find((p) => p.number === 5)!;
    p8 = pages.find((p) => p.number === 8)!;
    others = pages.map((p) => p.grey);
  }, 120_000);

  /** Where the page printed its QR code, from the page image itself. */
  const qrBox = (p: Real) => {
    const rgba = new Uint8ClampedArray(p.grey.width * p.grey.height * 4);
    for (let i = 0; i < p.grey.data.length; i++) { rgba[4 * i] = rgba[4 * i + 1] = rgba[4 * i + 2] = p.grey.data[i]; rgba[4 * i + 3] = 255; }
    const at = jsQR(rgba, p.grey.width, p.grey.height)!.location;
    const xs = [at.topLeftCorner.x, at.bottomRightCorner.x, at.bottomLeftCorner.x, at.topRightCorner.x], ys = [at.topLeftCorner.y, at.bottomRightCorner.y, at.bottomLeftCorner.y, at.topRightCorner.y];
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  };
  /** Page 5 as written, with page 8's QR code and its quiet zone cut out and pasted over page 5's own. */
  function pastedQr(): Raster {
    const sheet = written(p5, () => 3), q = qrBox(p8), pad = 0.15 * q.width;
    for (let y = Math.floor(q.y - pad); y < Math.ceil(q.y + q.height + pad); y++) for (let x = Math.floor(q.x - pad); x < Math.ceil(q.x + q.width + pad); x++) sheet.data[y * sheet.width + x] = p8.grey.data[y * sheet.width + x];
    return sheet;
  }
  /** Loose page 8, written, lying over page 5 with its footer folded behind it: page 8 down to just above the footer, then page 5. */
  function overlapping(): Raster {
    const sheet = written(p5, () => 3), top = written(p8, () => 7), fold = Math.floor(qrBox(p5).y - 0.25 * qrBox(p5).height);
    sheet.data.set(top.data.subarray(0, fold * sheet.width), 0);
    return sheet;
  }
  /** The print's contrast kept at this share inside a box, as glare leaves it. */
  function glared(r: Raster, gain: number, ...boxes: { x0: number; y0: number; x1: number; y1: number }[]): Raster {
    const out: Raster = { ...r, data: r.data.slice() };
    for (const b of boxes) for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) out.data[y * out.width + x] = 255 - (255 - out.data[y * out.width + x]) * gain;
    return out;
  }
  const uploaded = async (sheet: Raster) => {
    const stored = await normalizeScanPhoto(await photoJpeg(photographed(sheet, SIZE, uprightCorners(SIZE, PAGE_SIZE, 70), { shade: 0.2 })));
    return { token: stored.token, photo: await greyRaster(stored.bytes), bytes: stored.bytes };
  };
  /** The whole job on a photo, among all the book's pages. */
  async function job(bytes: Uint8Array, p: Real, id: string, sheetCheckMs?: number) {
    const now = Date.parse("2026-11-05T12:00:00Z"), m = memoryScanCropStore({ now: () => now });
    for (const q of pages) m.printed.set(`page-${q.number}.png`, q.png);
    const frame = { printContract: p.contract, imagePath: `page-${p.number}.png`, qrToken: p.token, questions: p.questions, others: pages.filter((q) => q !== p).map((q) => `page-${q.number}.png`) };
    m.photos.set(id, { parent: PARENT, state: "saved", createdAt: now, expiresAt: now + 86_400_000, bytes, storedBytes: 1, frame: { printedRevision: REVISION, book: { printedRevision: REVISION }, page: frame } });
    return { m, preview: await runScanCrops(m.store, { parent: PARENT, photo: id }, "00000000-0000-4000-8000-000000000002", { sheetCheckMs }) };
  }

  it("a control: pages 5 and 8 each calibrate among all their book's pages", async () => {
    // Disproved if the check refuses a right page because a near twin is in the book.
    for (const p of [p5, p8]) {
      const { token, photo } = await uploaded(written(p, (i) => (i * 3 + 1) % 10));
      expect(token).toBe(p.token);
      const r = calibrateAmong(photo, p, others);
      expect(r.status, `${p.key}: ${r.status === "refused" ? r.reason : ""}`).toBe("calibrated");
    }
  }, 60_000);

  it("keeps page 5 with a pasted page 8 code from automatic marking", async () => {
    // Disproved if crops of page 5's answers are saved as page 8's.
    const { token, bytes } = await uploaded(pastedQr());
    expect(token).toBe(p8.token);
    const { preview } = await job(bytes, p8, "00000000-0000-4000-8000-0000000000c1");
    expect(preview).toMatchObject({ status: "ready", crops: [], original: true });
  }, 60_000);

  it.each([0.5, 0.25, 0.1, 0.05])("the job holds the pasted code under glare that keeps %f of the print's contrast", async (gain) => {
    // The PR #637 review: glare drove the old score to zero, so five of page 5's answers were saved under page 8. Missing
    // evidence must never pass. Disproved if the job makes any crop.
    const { token, bytes } = await uploaded(glared(pastedQr(), gain, { x0: 80, y0: 75, x1: 1000, y1: 1460 }, { x0: 200, y0: 1490, x1: 650, y1: 1570 }));
    expect(token).toBe(p8.token);
    const { m, preview } = await job(bytes, p8, "00000000-0000-4000-8000-0000000000c1");
    expect(preview).toMatchObject({ status: "ready", crops: [] });
    expect(m.filesOf("00000000-0000-4000-8000-0000000000c1")).toHaveLength(1);
  }, 60_000);

  it("heavy glare on the entire right page keeps the photo for review", async () => {
    // The parent can act on this: another photo without glare.
    const { bytes } = await uploaded(glared(written(p5, () => 3), 0.1, { x0: 80, y0: 75, x1: 1000, y1: 1460 }));
    expect((await job(bytes, p5, "00000000-0000-4000-8000-0000000000c2")).preview).toMatchObject({ status: "ready", crops: [], original: true });
  }, 60_000);

  it("a right page with mild glare over everything still passes: the spots that tell the pages apart can be read", async () => {
    for (const p of [p5, p8]) {
      const { photo } = await uploaded(glared(written(p, () => 3), 0.5, { x0: 80, y0: 75, x1: 1000, y1: 1460 }));
      const r = calibrateAmong(photo, p, others);
      expect(r.status, `${p.key}: ${r.status === "refused" ? r.reason : ""}`).toBe("calibrated");
    }
  }, 60_000);

  it("heavy glare on a line both pages print the same still passes", async () => {
    // The title lines print the same on pages 5 and 8, so nothing about which page it is hides under them.
    const { photo } = await uploaded(glared(written(p5, () => 3), 0.1, { x0: 80, y0: 150, x1: 1000, y1: 280 }));
    const r = calibrateAmong(photo, p5, others);
    expect(r.status, r.status === "refused" ? r.reason : "").toBe("calibrated");
  }, 60_000);

  it("heavy glare on one spot that tells the pages apart refuses as too faint to read", async () => {
    // The heading is the one line here where the pages differ, and the rest of the page is clear: it cannot be read there.
    const { photo } = await uploaded(glared(written(p5, () => 3), 0.1, { x0: 80, y0: 95, x1: 500, y1: 140 }));
    expect(calibrateAmong(photo, p5, others)).toEqual({ status: "refused", reason: "faint" });
  }, 60_000);

  it("the job files page 5 by its code and withholds the crops of page 8 over it", async () => {
    // Disproved if crops of page 8's answers are saved under page 5, as they were before #456.
    const { token, bytes } = await uploaded(overlapping());
    expect(token).toBe(p5.token);
    const id = "00000000-0000-4000-8000-0000000000b1";
    const { m, preview } = await job(bytes, p5, id);
    expect(preview).toMatchObject({ status: "ready", crops: [] });
    expect(m.filesOf(id)).toHaveLength(1);
    expect(await readScanPreview(m.store, { parent: PARENT, photo: id })).toEqual(preview);
  }, 120_000);

  it("the job files page 5 when a covering sheet reaches its second question", async () => {
    // A smaller sheet leaves more of page 5 in view. Disproved if the part of page 8 in view is taken for page 5.
    const sheet = written(p5, () => 3), top = written(p8, () => 7), fold = 620;
    sheet.data.set(top.data.subarray(0, fold * sheet.width), 0);
    const { token, bytes } = await uploaded(sheet);
    expect(token).toBe(p5.token);
    const { preview } = await job(bytes, p5, "00000000-0000-4000-8000-0000000000c4");
    expect(preview.status).toBe("ready");
    if (preview.status === "ready") expect(preview.crops.every((crop) => crop.number > 2)).toBe(true);
  }, 60_000);

  it("writing that runs past the answer boxes does not refuse a right page among its near twins", async () => {
    for (const p of [p5, p8]) for (const over of [2, 5, 10]) {
      const r: Raster = { ...p.grey, data: p.grey.data.slice() };
      p.plan.crops.forEach((c, i) => drawDigit(r, { x: c.box.x - over, y: c.box.y - over, width: c.box.width + 2 * over, height: c.box.height + 2 * over }, (i * 3 + 1) % 10, 20));
      const { photo } = await uploaded(r);
      const a = calibrateAmong(photo, p, others);
      expect(a.status, `${p.key} over ${over}: ${a.status === "refused" ? a.reason : ""}`).toBe("calibrated");
    }
  }, 120_000);

  it("a pencil stroke across one printed digit does not refuse a right page", async () => {
    // Children mark their pages. One spot may stay unclear; the others still say which page it is.
    const r = written(p5, () => 3);
    for (let i = 0; i < 90; i++) for (let w = 0; w < 4; w++) r.data[(440 + Math.round(i * 0.3) + w) * r.width + 130 + i] = 70;
    const { photo } = await uploaded(r);
    const a = calibrateAmong(photo, p5, others);
    expect(a.status, a.status === "refused" ? a.reason : "").toBe("calibrated");
  }, 60_000);

  it("the job with no time left for the other pages says so, stores nothing, and a later call can still check", async () => {
    const { bytes } = await uploaded(written(p5, () => 3));
    const id = "00000000-0000-4000-8000-0000000000c3";
    const { m, preview } = await job(bytes, p5, id, 0);
    expect(preview).toMatchObject({ status: "refused", reason: "check-timeout" });
    expect(m.filesOf(id)).toEqual([]);
    expect(await readScanPreview(m.store, { parent: PARENT, photo: id })).toEqual({ status: "busy" });
  }, 60_000);
});
