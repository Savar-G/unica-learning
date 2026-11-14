import jsQR from "jsqr";
import { beforeAll, describe, expect, it } from "vitest";
import type { QuestionPackage } from "@/lib/question-package";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import {
  applyTransform,
  calibratePhoto,
  calibrationForPhoto,
  cropBox,
  cropInPhoto,
  cropPlan,
  perspectiveTransform,
  straightenedPage,
  warpBox,
  type Calibration,
  type CropQuestion,
  type Raster,
  type Transform,
} from "@/lib/scan-calibration";
import { normalizeScanPhoto } from "@/lib/scan-photo-image";
import { blankPage, cropCut, curled, cutOut, drawBoxOutline, drawDigit, drawMark, drawPrintedContent, drawQr, drawTextContent, fillBox, greyRaster, photoJpeg, photographed, rasterSharp, readDigit, rotatedCorners, shadowed, uprightCorners } from "@/lib/scan-synthetic";
import { SCAN_MARKS, printContractForPhoto, type Box, type PagePrintContract, type PhotoContract, type Point } from "@/lib/workbook-print-contract";

// Scan calibration through its public functions, on synthetic pages. Each answer is a seven-segment digit "written" in
// its box (scan-synthetic.ts), and each crop must read back as its own digit. Adjacent boxes hold other digits, so a map that is off reads
// the neighbour's digit or nothing. Synthetic ink proves the geometry; it says nothing about reading real handwriting.

const W = 1275, H = 1650;
const REVISION = "a".repeat(28);
const POINTS: Record<(typeof SCAN_MARKS)[number], Point> = {
  tl: { x: 34.375, y: 34.375 }, tr: { x: 1240.625, y: 34.375 }, br: { x: 1240.625, y: 1615.625 }, bl: { x: 34.375, y: 1615.625 },
};
const contract: PagePrintContract = {
  version: 1, workbookId: "w", page: 3, label: "D1-P1", day: 1, pageOfDay: 1,
  coordinates: { units: "image-px", origin: "top-left", x: "right", y: "down", orientation: "portrait", image: { width: W, height: H }, cssPage: { width: 816, height: 1056 }, scale: { x: W / 816, y: H / 1056 } },
  marks: { anchor: "outer-corner", order: [...SCAN_MARKS], points: POINTS },
  fingerprints: { content: "c", image: "f".repeat(64) },
};
const available: PhotoContract = { status: "available", revision: REVISION, contract };

const LINK = "https://unicalearning.com/tutor/p/test-page-token-0001";
const page = () => blankPage(W, H);
const fill = fillBox;
const mark = (r: Raster, m: (typeof SCAN_MARKS)[number]) => drawMark(r, m, POINTS[m]);

/** Where these pages print their QR code. */
const QR_BOX: Box = { x: 1020, y: 1440, width: 170, height: 170 };

const ANSWERS: { box: Box; digit: number }[] = Array.from({ length: 12 }, (_, i) => ({
  // Twelve boxes in tight rows: a neighbour is 14 pixels away.
  box: { x: 120 + (i % 4) * 268, y: 760 + Math.floor(i / 4) * 214, width: 254, height: 200 }, digit: (i * 7 + 3) % 10,
}));

function printedPage(): Raster {
  const r = page();
  for (const m of SCAN_MARKS) mark(r, m);
  drawPrintedContent(r);
  drawQr(r, QR_BOX, LINK);
  for (const a of ANSWERS) drawBoxOutline(r, a.box);
  return r;
}

function writtenPage(): Raster {
  const r = printedPage();
  for (const a of ANSWERS) drawDigit(r, a.box, a.digit);
  return r;
}

const stored = async (r: Raster) => greyRaster(await photoJpeg(r));

function digitsRead(photo: Raster, c: Calibration): (number | null)[] {
  return ANSWERS.map(({ box }) => readDigit(cropBox(photo, c, contract, box), cropCut(box), box));
}

const wanted = ANSWERS.map((a) => a.digit);

let printed: Raster, written: Raster;
beforeAll(() => { printed = printedPage(); written = writtenPage(); });

const square = (size: { width: number; height: number }, margin: number, centre?: Point) => uprightCorners(size, { width: W, height: H }, margin, centre);
const rotated = rotatedCorners;

describe("calibratePhoto and its crops", () => {
  const SIZE = { width: 1500, height: 1900 };
  const CASES: { name: string; size: { width: number; height: number }; corners: Point[]; turns: number }[] = [
    { name: "straight on", size: SIZE, corners: square(SIZE, 60), turns: 0 },
    { name: "half the size, off centre", size: SIZE, corners: square(SIZE, 500, { x: 620, y: 880 }), turns: 0 },
    { name: "twice the pixels", size: { width: 2800, height: 2800 }, corners: square({ width: 2800, height: 2800 }, 80), turns: 0 },
    { name: "a low-resolution photo", size: { width: 900, height: 1150 }, corners: square({ width: 900, height: 1150 }, 40), turns: 0 },
    { name: "rotated 8 degrees", size: SIZE, corners: rotated(square(SIZE, 170), 8, { x: 750, y: 950 }), turns: 0 },
    { name: "rotated -20 degrees", size: SIZE, corners: rotated(square(SIZE, 300), -20, { x: 750, y: 950 }), turns: 0 },
    { name: "tilted away at the top", size: SIZE, corners: [{ x: 300, y: 120 }, { x: 1200, y: 120 }, { x: 1400, y: 1780 }, { x: 100, y: 1780 }], turns: 0 },
    { name: "tilted to the side", size: SIZE, corners: [{ x: 120, y: 90 }, { x: 1300, y: 260 }, { x: 1300, y: 1640 }, { x: 120, y: 1810 }], turns: 0 },
    { name: "rotated and tilted", size: SIZE, corners: [{ x: 300, y: 80 }, { x: 1380, y: 240 }, { x: 1180, y: 1800 }, { x: 60, y: 1560 }], turns: 0 },
    { name: "upside down", size: SIZE, corners: rotated(square(SIZE, 60), 180, { x: 750, y: 950 }), turns: 2 },
    { name: "a quarter turn clockwise", size: { width: 1900, height: 1500 }, corners: rotated(square(SIZE, 60), 90, { x: 750, y: 950 }).map((p) => ({ x: p.x + 200, y: p.y - 200 })), turns: 1 },
    { name: "a quarter turn the other way", size: { width: 1900, height: 1500 }, corners: rotated(square(SIZE, 60), -90, { x: 750, y: 950 }).map((p) => ({ x: p.x + 200, y: p.y - 200 })), turns: 3 },
  ];

  it.each(CASES)("every crop holds its own written answer: $name", async ({ size, corners, turns }) => {
    // Disproved if a crop reads another box's digit or none, for any scale, rotation or perspective here.
    const photo = await stored(photographed(written, size, corners, { shade: 0.3 }));
    const result = calibratePhoto({ photo, printed, contract: available, pageLink: LINK });
    if (result.status !== "calibrated") throw new Error(`refused: ${JSON.stringify(result)}`);
    expect(result.calibration.quarterTurns).toBe(turns);
    expect(digitsRead(photo, result.calibration)).toEqual(wanted);
    // The found marks are the page's marks, within a few pixels of where the page was placed.
    const t = perspectiveTransform([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], corners)!;
    for (const m of SCAN_MARKS) {
      const truth = applyTransform(t, POINTS[m]);
      const found = result.calibration.marks[m];
      expect(Math.hypot(found.x - truth.x, found.y - truth.y), m).toBeLessThan(6);
    }
  }, 40_000);

  it("a control: a map shifted by half a box reads the wrong digits, so this check can fail", async () => {
    // Disproved (and the test above worthless) if a wrong map still reads every digit.
    const photo = await stored(photographed(written, SIZE, square(SIZE, 60)));
    const result = calibratePhoto({ photo, printed, contract: available, pageLink: LINK });
    if (result.status !== "calibrated") throw new Error("refused");
    const c = result.calibration;
    const scale = Math.hypot(c.transform[0], c.transform[3]);
    const moved: Transform = [...c.transform];
    moved[2] += 134 * scale; // About half of a box and its gap, along the row.
    const shifted = digitsRead(photo, { ...c, transform: moved });
    expect(shifted.filter((d, i) => d === wanted[i]).length).toBeLessThan(wanted.length / 2);
  }, 20_000);

  it("a control: the printed page with no answers reads no digit in any crop", async () => {
    const photo = await stored(photographed(printed, SIZE, square(SIZE, 60)));
    const result = calibratePhoto({ photo, printed, contract: available, pageLink: LINK });
    if (result.status !== "calibrated") throw new Error("refused");
    expect(digitsRead(photo, result.calibration).filter((d) => d !== null)).toEqual([]);
  }, 20_000);

  it("the straightened page puts the marks where the contract printed them, whatever the photo's angle", async () => {
    // Disproved if the preview's corners are not ink at the contract's points.
    const corners = [{ x: 300, y: 80 }, { x: 1380, y: 240 }, { x: 1180, y: 1800 }, { x: 60, y: 1560 }];
    const photo = await stored(photographed(written, SIZE, corners));
    const result = calibratePhoto({ photo, printed, contract: available, pageLink: LINK });
    if (result.status !== "calibrated") throw new Error("refused");
    const straight = straightenedPage(photo, result.calibration, contract);
    expect([straight.width, straight.height]).toEqual([W, H]);
    for (const m of SCAN_MARKS) {
      const p = POINTS[m];
      const inward = { x: m === "tl" || m === "bl" ? 1 : -1, y: m === "tl" || m === "tr" ? 1 : -1 };
      const at = (dx: number, dy: number) => straight.data[Math.round(p.y + inward.y * dy) * W + Math.round(p.x + inward.x * dx)];
      expect(at(14, 2), `${m} arm`).toBeLessThan(110);
      expect(at(14, -8), `${m} outside`).toBeGreaterThan(180);
    }
  }, 20_000);
});

describe("refusals", () => {
  const SIZE = { width: 1500, height: 1900 };
  const covered = (m: (typeof SCAN_MARKS)[number]) => {
    const r = writtenPage();
    const p = POINTS[m];
    const x = m === "tl" || m === "bl" ? p.x - 4 : p.x - 34, y = m === "tl" || m === "tr" ? p.y - 4 : p.y - 34;
    fill(r, x, y, 38, 38, 248);
    return r;
  };

  it("refuses a photo with three marks hidden: too few of the page's own marks to place it", async () => {
    // Disproved if one mark, the code and a guess give a map.
    const r = covered("tl");
    for (const m of ["tr", "bl"] as const) {
      const p = POINTS[m];
      fill(r, m === "bl" ? p.x - 4 : p.x - 34, m === "tr" ? p.y - 4 : p.y - 34, 38, 38, 248);
    }
    const photo = await stored(photographed(r, SIZE, square(SIZE, 60)));
    expect(calibratePhoto({ photo, printed, contract: available, pageLink: LINK }).status).toBe("refused");
  }, 20_000);

  it("refuses a blank photo", () => {
    const photo = { width: 800, height: 1000, channels: 1 as const, data: new Uint8Array(800000).fill(240) };
    expect(calibratePhoto({ photo, printed, contract: available, pageLink: LINK })).toEqual({ status: "refused", reason: "marks-missing" });
  });

  /** A sheet that bows (#912): its corners stay where the marks are, its middle sits `amount` photo pixels lower. */
  const bowed = (r: Raster, amount: number): Raster => {
    const out = new Uint8Array(r.width * r.height * r.channels);
    for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
      const from = Math.round(y - amount * Math.sin(Math.PI * x / r.width) * Math.sin(Math.PI * y / r.height));
      const sy = Math.min(r.height - 1, Math.max(0, from));
      for (let c = 0; c < r.channels; c++) out[(y * r.width + x) * r.channels + c] = r.data[(sy * r.width + x) * r.channels + c];
    }
    return { ...r, data: out };
  };

  it("takes a bowed sheet of this page, and every crop still holds its own answer (#912)", async () => {
    // Disproved if the middle of a curled page, 14 pixels from where a flat sheet would put it, reads as another page.
    const photo = await stored(bowed(photographed(written, SIZE, square(SIZE, 60), { shade: 0.3 }), 14));
    const result = calibratePhoto({ photo, printed, contract: available, pageLink: LINK });
    if (result.status !== "calibrated") throw new Error(`refused: ${JSON.stringify(result)}`);
    expect(result.calibration.pageFit).toBeGreaterThanOrEqual(0.975);
    expect(digitsRead(photo, result.calibration)).toEqual(wanted);
  }, 40_000);

  it("still refuses a bowed photo of another page (#912)", async () => {
    // Disproved if a bend can make another page's ink follow this page.
    const other = page();
    for (const m of SCAN_MARKS) mark(other, m);
    for (let i = 0; i < 40; i++) fill(other, 200 + (i * 37) % 800, 500 + (i * 71) % 900, 60, 14);
    drawQr(other, QR_BOX, LINK);
    const photo = await stored(bowed(photographed(other, SIZE, square(SIZE, 60)), 14));
    expect(calibratePhoto({ photo, printed, contract: available, pageLink: LINK })).toEqual({ status: "refused", reason: "page-mismatch" });
  }, 20_000);

  it("refuses a photo of another page: its marks line up, but its ink does not follow the printed page", async () => {
    // Disproved if four good marks are enough, whatever the page.
    const other = page();
    for (const m of SCAN_MARKS) mark(other, m);
    for (let i = 0; i < 40; i++) fill(other, 200 + (i * 37) % 800, 500 + (i * 71) % 900, 60, 14);
    drawQr(other, QR_BOX, LINK);
    const photo = await stored(photographed(other, SIZE, square(SIZE, 60)));
    expect(calibratePhoto({ photo, printed, contract: available, pageLink: LINK })).toEqual({ status: "refused", reason: "page-mismatch" });
  }, 20_000);

  it("refuses when two ways up fit alike: the marks alone cannot say which way is up", async () => {
    // A page with a point of symmetry: a half turn prints the same ink.
    const even = page();
    for (const m of SCAN_MARKS) mark(even, m);
    for (let line = 0; line < 8; line++) { fill(even, 200, 200 + line * 60, 300, 20); fill(even, W - 500, H - 220 - line * 60, 300, 20); }
    drawQr(even, QR_BOX, LINK);
    const photo = await stored(photographed(even, SIZE, square(SIZE, 60)));
    expect(calibratePhoto({ photo, printed: even, contract: available, pageLink: LINK })).toEqual({ status: "refused", reason: "orientation-unclear" });
  }, 20_000);
});

describe("a small QR code that the upload reads zoomed (#912)", () => {
  const SIZE = { width: 1500, height: 1900 };
  /** Where these pages print a small code: low on the left, as the real template does. */
  const SMALL_QR: Box = { x: 90, y: 1513, width: 87, height: 87 };
  const smallQrPage = (qr: Box, link: string) => {
    const r = page();
    for (const m of SCAN_MARKS) mark(r, m);
    drawPrintedContent(r);
    drawQr(r, qr, link);
    return r;
  };
  /** A soft phone photo of a sheet, as the upload stores it. */
  const softPhoto = async (r: Raster, blur: number, margin: number) => {
    const bytes = await rasterSharp(photographed(r, SIZE, square(SIZE, margin), { shade: 0.2 })).blur(blur).jpeg({ quality: 82 }).toBuffer();
    const upload = await normalizeScanPhoto(bytes);
    return { token: upload.token, photo: await greyRaster(upload.bytes) };
  };
  const smallPrinted = () => smallQrPage(SMALL_QR, LINK);

  it.each([{ blur: 1, margin: 60 }, { blur: 0.6, margin: 250 }])("a code the upload read only zoomed is read in place too: blur $blur, margin $margin", async ({ blur, margin }) => {
    // Disproved if the upload takes a photo for its code and calibration then refuses it for that code. The whole photo's
    // read finds no code in these photos, so the upload takes them by its zoomed read, and the code reads in place only
    // from the photo's own pixels enlarged the same way.
    const { token, photo } = await softPhoto(smallPrinted(), blur, margin);
    expect(LINK.endsWith(`/${token}`)).toBe(true);
    const rgba = new Uint8ClampedArray(photo.width * photo.height * 4);
    for (let i = 0; i < photo.data.length; i++) { rgba[4 * i] = rgba[4 * i + 1] = rgba[4 * i + 2] = photo.data[i]; rgba[4 * i + 3] = 255; }
    expect(jsQR(rgba, photo.width, photo.height, { inversionAttempts: "attemptBoth" })).toBeNull();
    expect(calibratePhoto({ photo, printed: smallPrinted(), contract: available, pageLink: LINK }).status).toBe("calibrated");
  }, 40_000);

  it("still refuses the same small code with another page's link", async () => {
    // Disproved if the enlarged read decides by finding any code, not this page's.
    const other = "https://unicalearning.com/tutor/p/test-page-token-0002";
    const { photo } = await softPhoto(smallQrPage(SMALL_QR, other), 1, 60);
    expect(calibratePhoto({ photo, printed: smallPrinted(), contract: available, pageLink: LINK })).toEqual({ status: "refused", reason: "qr-mismatch" });
  }, 40_000);

  it("still refuses this page's small code where the page did not print it", async () => {
    // Disproved if the enlarged read takes a code from anywhere near the place: moved by its own size, it is elsewhere.
    const { photo } = await softPhoto(smallQrPage({ ...SMALL_QR, x: SMALL_QR.x + SMALL_QR.width }, LINK), 1, 60);
    expect(calibratePhoto({ photo, printed: smallPrinted(), contract: available, pageLink: LINK })).toEqual({ status: "refused", reason: "qr-mismatch" });
  }, 40_000);
});

describe("a photo and its printed revision", () => {
  const SIZE = { width: 1500, height: 1900 };

  it("a photo of an older revision gets no calibration, and a stored calibration serves only its own revision", async () => {
    // Disproved if a new revision's contract or calibration reads an old photo.
    const photo = await stored(photographed(written, SIZE, square(SIZE, 60)));
    const NEW = "b".repeat(28);
    const old = printContractForPhoto({ printedRevision: NEW }, { printContract: contract }, { printedRevision: REVISION });
    expect(old).toEqual({ status: "unavailable", reason: "other-revision" });
    expect(calibratePhoto({ photo, printed, contract: old, pageLink: LINK })).toEqual({ status: "unavailable", reason: "other-revision" });
    // Positive control: the same bytes against their own revision calibrate.
    const own = printContractForPhoto({ printedRevision: REVISION }, { printContract: contract }, { printedRevision: REVISION });
    const result = calibratePhoto({ photo, printed, contract: own, pageLink: LINK });
    if (result.status !== "calibrated") throw new Error("refused");
    expect(result.calibration.revision).toBe(REVISION);
    expect(result.calibration.version).toBe(2);
    expect(calibrationForPhoto(result.calibration, { printedRevision: REVISION })).toBe(result.calibration);
    const legacy = { ...result.calibration, version: 1 };
    expect(calibrationForPhoto(legacy, { printedRevision: REVISION })).toBe(legacy);
    expect(calibrationForPhoto({ ...result.calibration, version: 3 }, { printedRevision: REVISION })).toBeNull();
    expect(calibrationForPhoto(result.calibration, { printedRevision: NEW })).toBeNull();
    expect(calibrationForPhoto(result.calibration, { printedRevision: null })).toBeNull();
  }, 20_000);

  it("a legacy book has no contract, so no calibration", async () => {
    const photo = await stored(photographed(written, SIZE, square(SIZE, 60)));
    const legacy = printContractForPhoto({ printedRevision: null }, { printContract: null }, { printedRevision: "2026-11-01 10:00:00+00" });
    expect(calibratePhoto({ photo, printed, contract: legacy, pageLink: LINK })).toEqual({ status: "unavailable", reason: "no-contract" });
  }, 20_000);
});

describe("warpBox", () => {
  it("is the identity through the identity map, and white off the photo", () => {
    const r: Raster = { width: 4, height: 4, channels: 3, data: new Uint8Array(48).map((_, i) => i * 5) };
    const id: Transform = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const inside = warpBox(r, id, { x: 1, y: 1, width: 2, height: 2 }, { width: 2, height: 2 });
    expect([...inside.data.slice(0, 3)]).toEqual([...r.data.slice(15, 18)]);
    const off = warpBox(r, id, { x: 100, y: 100, width: 1, height: 1 }, { width: 1, height: 1 });
    expect([...off.data]).toEqual([255, 255, 255]);
  });
});

describe("cropPlan", () => {
  const pkg = (id: string, item: unknown): QuestionPackage => ({ id, item } as unknown as QuestionPackage);
  const box = (id: string) => ({ id, kind: "box", box: { x: 10, y: 10, width: 50, height: 40 } });

  it("keeps adjacent tick-and-number items in separate crops with both scored regions", () => {
    const questions: CropQuestion[] = [0, 1].map(n => {
      const p = structuredClone(FIXTURES.A);
      p.id = `tick-${n}`;
      p.item = { format: "tick-and-number", scorable: true, parentChecked: false, error: null,
        regions: [
          { id: "operation", kind: "choice", mark: "tick", label: null, choices: ["+", "−", "×", "÷"], answer: "+" },
          { id: "answer", kind: "box", label: null, answer: { type: "number", value: 66 } },
        ], checks: [{ kind: "operation-sign", region: "operation" }, { kind: "operation", region: "answer" }],
      };
      return { number: n + 1, package: p, regions: [
        { id: "operation", kind: "choice", box: { x: 10 + n * 200, y: 10, width: 100, height: 30 } },
        { id: "answer", kind: "box", box: { x: 120 + n * 200, y: 10, width: 40, height: 30 } },
      ] };
    });
    const plan = cropPlan(questions);
    expect(plan.notSupported).toEqual([]);
    expect(plan.crops.map(c => c.box)).toEqual([{ x: 10, y: 10, width: 150, height: 30 }, { x: 210, y: 10, width: 150, height: 30 }]);
    expect(plan.crops.map(c => c.regionIds)).toEqual([["operation", "answer"], ["operation", "answer"]]);
    questions[0].regions![1].box = null;
    expect(cropPlan(questions).notSupported).toEqual([1]);
  });

  it("crops supported, measured items in printed order and refuses untrusted shapes", () => {
    // Disproved if a fraction, a two-box item, an invalid choice package or an item with no measured box gets a crop.
    const write = (answer: unknown) => ({ format: "write-number", scorable: true, parentChecked: false, regions: [{ id: "a", kind: "box", label: null, answer }], checks: [], error: null });
    const plan = cropPlan([
      { number: 4, package: pkg("frac", write({ type: "fraction", numerator: 1, denominator: 2 })), regions: [box("a")] },
      { number: 1, package: pkg("whole", write({ type: "number", value: 12 })), regions: [box("a")] },
      { number: 2, package: pkg("decimal", write({ type: "number", value: 1.5 })), regions: [box("a")] },
      { number: 3, package: pkg("no-box", write({ type: "number", value: 7 })), regions: [{ id: "a", kind: "box", box: null }] },
      { number: 5, package: pkg("two", { format: "boxes", scorable: true, parentChecked: false, regions: [{ id: "a", kind: "box", answer: { type: "number", value: 1 } }, { id: "b", kind: "box", answer: { type: "number", value: 2 } }], checks: [], error: null }), regions: [box("a"), box("b")] },
      { number: 6, package: pkg("circle", { format: "circle", scorable: true, parentChecked: false, regions: [{ id: "a", kind: "choice", answer: "x" }], checks: [], error: null }), regions: [box("a")] },
      { number: 7, package: null, regions: null },
      { number: 8, package: pkg("legacy-no-regions", write({ type: "number", value: 9 })), regions: null },
    ]);
    expect(plan.crops).toEqual([{ number: 1, itemId: "whole", regionId: "a", box: box("a").box }]);
    expect(plan.notSupported).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("a sheet held up, cut by the photo's edge, or in shadow (#912)", () => {
  const SIZE = { width: 1500, height: 1900 };
  /** This page as real text sets it (drawTextContent): uneven words, so no part repeats another a line or a word away. */
  const textPage = (answers: boolean) => {
    const r = page();
    for (const m of SCAN_MARKS) mark(r, m);
    drawTextContent(r);
    drawQr(r, QR_BOX, LINK);
    for (const a of ANSWERS) { drawBoxOutline(r, a.box); if (answers) drawDigit(r, a.box, a.digit); }
    return r;
  };
  let textPrinted: Raster, textWritten: Raster;
  beforeAll(() => { textPrinted = textPage(false); textWritten = textPage(true); });
  /** Another page with this page's marks and QR code: bars where this page prints text and answer boxes. */
  const otherPage = () => {
    const other = page();
    for (const m of SCAN_MARKS) mark(other, m);
    for (let i = 0; i < 40; i++) fill(other, 200 + (i * 37) % 800, 500 + (i * 71) % 900, 60, 14);
    drawQr(other, QR_BOX, LINK);
    return other;
  };
  const calibrate = (photo: Raster) => calibratePhoto({ photo, printed: textPrinted, contract: available, pageLink: LINK });
  /** As the crop job calls it: with the page's answer boxes, so a hidden corner's answers are checked (#966 review). */
  const calibrateWithAnswers = (photo: Raster) => calibratePhoto({ photo, printed: textPrinted, contract: available, pageLink: LINK, writing: ANSWERS.map((a) => a.box) });
  /** A crop's grey brought back to paper white: a shadow darkens paper past readDigit's fixed threshold. */
  const brightened = (r: Raster): Raster => {
    const sorted = [...r.data].sort((p, q) => p - q), paper = sorted[Math.floor(sorted.length * 0.9)] || 1;
    return { ...r, data: r.data.map((v) => Math.min(255, Math.round((v * 248) / paper))) };
  };
  const answersRead = (photo: Raster, c: Calibration) => ANSWERS.map(({ box }) => readDigit(brightened(cropBox(photo, c, contract, box)), cropCut(box), box));

  it.each([
    { name: "held at the left edge", amount: 45, edge: "left" as const },
    { name: "held hard at the left edge", amount: 70, edge: "left" as const },
    { name: "held very hard at the left edge", amount: 90, edge: "left" as const },
    { name: "held hard at the right edge", amount: 70, edge: "right" as const },
  ])("a page $name calibrates part by part, and every crop holds its own answer", async ({ amount, edge }) => {
    // Disproved if the curl near the fingers, up to `amount` photo pixels from where the four marks put the print, is
    // refused, or a crop reads a neighbour's digit.
    const photo = await stored(curled(photographed(textWritten, SIZE, square(SIZE, 60), { shade: 0.3 }), amount, { edge }));
    const result = calibrate(photo);
    if (result.status !== "calibrated") throw new Error(`refused: ${JSON.stringify(result)}`);
    expect(result.calibration.mesh).toBeDefined();
    expect(result.calibration.pageFit).toBeGreaterThanOrEqual(0.975);
    expect(result.calibration.quarterTurns).toBe(0);
    expect(answersRead(photo, result.calibration)).toEqual(wanted);
    // The straightened page puts the print back where it printed: the heading block is ink at its printed place.
    const straight = straightenedPage(photo, result.calibration, contract);
    expect(straight.data[Math.round(H * 0.073) * W + Math.round(W * 0.1)]).toBeLessThan(110);
  }, 60_000);

  it.each([45, 70])("still refuses another page held the same way, curled by %i pixels", async (amount) => {
    // Disproved if aligning a page part by part lets another page's print follow this one.
    const photo = await stored(curled(photographed(otherPage(), SIZE, square(SIZE, 60)), amount));
    expect(calibrate(photo)).toEqual({ status: "refused", reason: "page-mismatch" });
  }, 60_000);

  it("this page upside down and curled is read upside down or refused: the way up stays unambiguous", async () => {
    const photo = await stored(curled(photographed(textWritten, SIZE, rotated(square(SIZE, 60), 180, { x: 750, y: 950 })), 45));
    const result = calibrate(photo);
    if (result.status === "calibrated") expect(result.calibration.quarterTurns).toBe(2);
  }, 60_000);

  /** A photo of this sheet turned 4 degrees, with the photo's top edge just below the top-left mark: that mark is cut off. */
  const cornerCut = async (sheet: Raster) => {
    const big = { width: 1500, height: 2000 };
    const corners = rotated(square(big, 160), 4, { x: 750, y: 1000 });
    const t = perspectiveTransform([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], corners)!;
    const tl = applyTransform(t, POINTS.tl), tr = applyTransform(t, POINTS.tr);
    const top = Math.round(tl.y + 12);
    // (The top-right mark stays well inside the photo: only one corner is cut.)
    expect(tr.y - top).toBeGreaterThan(60);
    return stored(cutOut(photographed(sheet, big, corners, { shade: 0.2 }), { x: 0, y: top, width: big.width, height: big.height - top }));
  };

  it("a photo with one corner mark cut off by its edge is placed by the QR code, and every crop holds its own answer", async () => {
    // Disproved if a cut-off mark refuses a photo that holds the page's code and every answer.
    const photo = await cornerCut(textWritten);
    const result = calibrate(photo);
    if (result.status !== "calibrated") throw new Error(`refused: ${JSON.stringify(result)}`);
    expect(result.calibration.placedBy).toBe("qr");
    expect(result.calibration.missingMarks).toEqual(["tl"]);
    expect(result.calibration.quarterTurns).toBe(0);
    expect(answersRead(photo, result.calibration)).toEqual(wanted);
    for (const { box } of ANSWERS) expect(cropInPhoto(result.calibration, contract, box)).toBe(true);
  }, 60_000);

  it("refuses the same cut photo of another page carrying this page's code", async () => {
    // Disproved if the QR code alone places and passes a sheet whose print is not this page's.
    expect((await calibrate(await cornerCut(otherPage()))).status).toBe("refused");
  }, 60_000);

  it.each(SCAN_MARKS)("a photo with mark %s hidden in a shadow is placed by its code and print, and every crop reads its own answer (#912)", async (m) => {
    // Cedric's rule (2026-11-14): with the code and every answer in view, a hidden corner does not refuse the page. Disproved
    // if the page is refused, or a crop reads another box's answer.
    const sheet = { ...textWritten, data: new Uint8Array(textWritten.data) };
    const p = POINTS[m];
    fill(sheet, m === "tl" || m === "bl" ? p.x - 4 : p.x - 34, m === "tl" || m === "tr" ? p.y - 4 : p.y - 34, 38, 38, 248);
    const photo = await stored(photographed(sheet, SIZE, square(SIZE, 60), { shade: 0.2 }));
    // With the answer boxes, as the crop job asks: the boxes next to the hidden mark must show their own frame (#966 review).
    const result = calibrateWithAnswers(photo);
    if (result.status !== "calibrated") throw new Error(`refused: ${JSON.stringify(result)}`);
    expect(result.calibration).toMatchObject({ placedBy: "qr", missingMarks: [], hiddenMarks: [m] });
    expect(answersRead(photo, result.calibration)).toEqual(wanted);
  }, 60_000);

  /** This written page with its bottom-left mark gone from view, as a hand or a sheet over it leaves it. */
  const blHidden = () => {
    const sheet = { ...textWritten, data: new Uint8Array(textWritten.data) };
    fill(sheet, POINTS.bl.x - 4, POINTS.bl.y - 34, 38, 38, 248);
    return sheet;
  };
  /** The answer box nearest the bottom-left mark. */
  const nearBl = ANSWERS[8];

  it("refuses a page whose hidden corner and the answer beside it lie under another sheet with other writing (#966 review)", async () => {
    // Disproved if the covered box is cropped: its crop would hold the other sheet's digit as this page's answer.
    const sheet = blHidden();
    const other = (nearBl.digit + 4) % 10;
    fill(sheet, 0, nearBl.box.y - 20, nearBl.box.x + nearBl.box.width + 16, H - nearBl.box.y + 20, 248);
    drawDigit(sheet, { x: nearBl.box.x + 10, y: nearBl.box.y + 10, width: nearBl.box.width - 20, height: nearBl.box.height - 20 }, other);
    const result = calibrateWithAnswers(await stored(photographed(sheet, SIZE, square(SIZE, 60), { shade: 0.2 })));
    expect(result).toEqual({ status: "refused", reason: "corner-covered" });
  }, 60_000);

  it("accepts a real shadow over the hidden corner and its answers, and the crops beside it read their own digits (#966 review)", async () => {
    // Disproved if a shadow (the frame still printed, only darker) refuses the page, or a crop near the corner misreads.
    const photo = await stored(shadowed(photographed(blHidden(), SIZE, square(SIZE, 60), { shade: 0.2 }), { x: 0, y: 1250 }, { x: 640, y: SIZE.height }, 0.45, 10));
    const result = calibrateWithAnswers(photo);
    if (result.status !== "calibrated") throw new Error(`refused: ${JSON.stringify(result)}`);
    expect(result.calibration).toMatchObject({ placedBy: "qr", hiddenMarks: ["bl"] });
    expect(answersRead(photo, result.calibration)).toEqual(wanted);
  }, 60_000);

  it.each([45, 70])("a curled sheet with its hidden corner on the curled edge (%i) is refused or read right, never misaligned (#966 review)", async (amount) => {
    const photo = await stored(curled(photographed(blHidden(), SIZE, square(SIZE, 60), { shade: 0.2 }), amount, { edge: "left" }));
    const result = calibrateWithAnswers(photo);
    if (result.status === "calibrated") expect(answersRead(photo, result.calibration)).toEqual(wanted);
    else expect(result.status).toBe("refused");
  }, 60_000);

  it("the same cut photo with a mark in view covered is placed by the code, two own marks found, every crop its own answer", async () => {
    // #912 (Cedric, 2026-11-14): a covered mark no longer refuses while the code, two own marks and the print place the
    // page. Disproved if a crop reads another box's answer.
    const sheet = textWritten;
    const covered = { ...sheet, data: new Uint8Array(sheet.data) };
    fill(covered, POINTS.bl.x - 4, POINTS.bl.y - 34, 38, 38, 248);
    const photo = await cornerCut(covered);
    const result = calibrate(photo);
    if (result.status !== "calibrated") throw new Error(`refused: ${JSON.stringify(result)}`);
    expect(result.calibration).toMatchObject({ placedBy: "qr", missingMarks: ["tl"], hiddenMarks: ["bl"] });
    expect(answersRead(photo, result.calibration)).toEqual(wanted);
  }, 60_000);

  it("refuses the cut photo when a second mark in view is covered too: one own mark is too few", async () => {
    const sheet = textPage(true);
    fill(sheet, POINTS.bl.x - 4, POINTS.bl.y - 34, 38, 38, 248);
    fill(sheet, POINTS.br.x - 34, POINTS.br.y - 34, 38, 38, 248);
    expect(calibrate(await cornerCut(sheet)).status).toBe("refused");
  }, 60_000);

  it("requires a near-edge mark whose inward arms are fully in the photo", async () => {
    const sheet = textPage(true);
    fill(sheet, POINTS.bl.x - 4, POINTS.bl.y - 34, 38, 38, 248);
    const full = photographed(sheet, SIZE, square(SIZE, 60), { shade: 0.2 });
    // The mark's corner is about 24 px inside this edge. Its arms point inward and are not cut off.
    const photo = await stored(cutOut(full, { x: 75, y: 0, width: SIZE.width - 75, height: SIZE.height }));
    // In view, so covered rather than cut off (#912): hidden, never counted as missing.
    const covered = calibrate(photo);
    if (covered.status !== "calibrated") throw new Error(`refused: ${JSON.stringify(covered)}`);
    expect(covered.calibration).toMatchObject({ placedBy: "qr", missingMarks: [], hiddenMarks: ["bl"] });
    const control = await stored(cutOut(photographed(textWritten, SIZE, square(SIZE, 60), { shade: 0.2 }),
      { x: 75, y: 0, width: SIZE.width - 75, height: SIZE.height }));
    const result = calibrate(control);
    expect(result.status).toBe("calibrated");
  }, 60_000);

  it("a question the photo's edge cuts is not cropped, and the others still read their own answers", async () => {
    // The photo's left edge runs through the first column of answer boxes, and both left marks are cut off. Disproved if
    // a cut box counts as in the photo (its crop would show white paper as if nothing were written), or another is lost.
    const full = photographed(textWritten, SIZE, square(SIZE, 60), { shade: 0.2 });
    const t = perspectiveTransform([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], square(SIZE, 60))!;
    const left = Math.round(applyTransform(t, { x: 260, y: 0 }).x);
    const photo = await stored(cutOut(full, { x: left, y: 0, width: SIZE.width - left, height: SIZE.height }));
    const result = calibrate(photo);
    if (result.status !== "calibrated") throw new Error(`refused: ${JSON.stringify(result)}`);
    expect(result.calibration.missingMarks).toEqual(["tl", "bl"]);
    const inPhoto = ANSWERS.map(({ box }) => cropInPhoto(result.calibration, contract, box));
    expect(inPhoto).toEqual(ANSWERS.map(({ box }) => box.x > 300));
    ANSWERS.forEach(({ box, digit }, i) => {
      if (inPhoto[i]) expect(readDigit(brightened(cropBox(photo, result.calibration, contract, box)), cropCut(box), box), `answer ${i + 1}`).toBe(digit);
    });
  }, 60_000);

  /** A third of the page across its text under a shadow, or the bottom with the QR code, with a firm edge. */
  const SHADOWS = [
    { name: "over a third of the page, across its text", from: { x: 1500, y: 260 }, to: { x: 0, y: 1000 } },
    { name: "over the QR code and the last row of answers", from: { x: 0, y: 1330 }, to: { x: 1500, y: 1250 } },
  ];

  it.each(SHADOWS)("a page with a shadow $name calibrates, every crop holds its own answer, and the upload reads it", async ({ from, to }) => {
    // 40% and 60% darker. Disproved if the right page is refused, read wrong, or not taken at upload.
    for (const darkness of [0.4, 0.6]) {
      const bytes = await photoJpeg(shadowed(photographed(textWritten, SIZE, square(SIZE, 60), { shade: 0.2 }), from, to, darkness, 8));
      const upload = await normalizeScanPhoto(bytes);
      expect(LINK.endsWith(`/${upload.token}`), `darkness ${darkness}`).toBe(true);
      const photo = await greyRaster(upload.bytes);
      const result = calibrate(photo);
      if (result.status !== "calibrated") throw new Error(`darkness ${darkness}: ${JSON.stringify(result)}`);
      expect(answersRead(photo, result.calibration), `darkness ${darkness}`).toEqual(wanted);
    }
  }, 60_000);

  it.each(SHADOWS)("still refuses another page with a shadow $name", async ({ from, to }) => {
    const photo = await stored(shadowed(photographed(otherPage(), SIZE, square(SIZE, 60)), from, to, 0.5, 8));
    expect(calibrate(photo)).toEqual({ status: "refused", reason: "page-mismatch" });
  }, 60_000);

  /**
   * A coil-bound book's left-hand page (2026-11-14): the coil lies over the two marks on its binding side, the right, so
   * the only marks in view sit on the same side as its QR code, bottom left. Under a lamp the sheet's bow toward the coil
   * makes its toner shine: the print on the right half comes out lighter than the matte paper, each stroke a pale stroke
   * inside a dark rim, as the real photos show. The paper is photo grey (205) so the shine can be lighter than it.
   */
  const QR_LEFT: Box = { x: 90, y: 1440, width: 170, height: 170 };
  const PAPER = 205, SHINE = 252, BEND = 640;
  const coilPage = (o: { shine: boolean; cover?: boolean }) => {
    const r = page();
    for (const m of SCAN_MARKS) if (m === "tl" || m === "bl") mark(r, m);
    drawTextContent(r);
    fill(r, QR_LEFT.x - 10, QR_LEFT.y - 10, QR_LEFT.width + 20, QR_LEFT.height + 20, 248);
    drawQr(r, QR_LEFT, LINK);
    for (const a of ANSWERS) drawBoxOutline(r, a.box);
    const ink = (x: number, y: number) => r.data[y * W + x] < 128;
    const out = new Uint8Array(r.data);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const at = y * W + x;
      if (r.data[at] >= 240) { out[at] = PAPER; continue; }
      if (!ink(x, y)) continue;
      // The rim of each stroke stays dark; inside it the toner shines.
      const inner = ink(x - 1, y) && ink(x + 1, y) && ink(x, y - 1) && ink(x, y + 1);
      if (o.shine && x > BEND && inner) out[at] = SHINE;
    }
    const sheet: Raster = { ...r, data: out };
    if (o.cover) {
      // Another sheet over the right half, with its own print and its own answers in this page's boxes.
      fill(sheet, BEND, 0, W - BEND, H, PAPER);
      for (let i = 0; i < 30; i++) {
        const x = BEND + 40 + (i * 53) % 520, y = 120 + (i * 97) % 1350;
        fill(sheet, x, y, 70, 14);
        // With shine, the other sheet's toner shines too.
        if (o.shine) fill(sheet, x + 2, y + 2, 66, 10, SHINE);
      }
      for (const a of ANSWERS) if (a.box.x + a.box.width / 2 > BEND) drawDigit(sheet, a.box, (a.digit + 5) % 10);
    }
    // The coil: dark loops down the right edge, over where the right-hand marks printed.
    for (let y = 10; y < H - 10; y += 22) fill(sheet, W - 60, y, 60, 9, 20);
    for (const a of ANSWERS) if (!o.cover || a.box.x + a.box.width / 2 <= BEND) drawDigit(sheet, a.box, a.digit);
    return sheet;
  };
  let coilPrinted: Raster;
  beforeAll(() => {
    coilPrinted = page();
    for (const m of SCAN_MARKS) mark(coilPrinted, m);
    drawTextContent(coilPrinted);
    fill(coilPrinted, QR_LEFT.x - 10, QR_LEFT.y - 10, QR_LEFT.width + 20, QR_LEFT.height + 20, 248);
    drawQr(coilPrinted, QR_LEFT, LINK);
    for (const a of ANSWERS) drawBoxOutline(coilPrinted, a.box);
  });
  const calibrateCoil = (photo: Raster) => calibratePhoto({ photo, printed: coilPrinted, contract: available, pageLink: LINK, writing: ANSWERS.map((a) => a.box) });

  it("a coil-bound page with its right-hand marks under the coil and its toner shining is placed by its code, every crop its own answer", async () => {
    // Disproved if the page is refused (before the fix: "marks-missing", the shining print failing the page fit), or a crop
    // reads another box's answer.
    const photo = await stored(photographed(coilPage({ shine: true }), SIZE, square(SIZE, 60)));
    const result = calibrateCoil(photo);
    if (result.status !== "calibrated") throw new Error(`refused: ${JSON.stringify(result)}`);
    expect(result.calibration).toMatchObject({ placedBy: "qr", missingMarks: [], hiddenMarks: ["tr", "br"] });
    expect(answersRead(photo, result.calibration)).toEqual(wanted);
  }, 60_000);

  it.each([false, true])("refuses the coil-bound page when another sheet with other answers covers its right half (its toner shining: %s)", async (shine) => {
    // Disproved if the code and the left half place the page while the boxes on the right show the other sheet's digits.
    const photo = await stored(photographed(coilPage({ shine, cover: true }), SIZE, square(SIZE, 60)));
    expect(calibrateCoil(photo).status).toBe("refused");
  }, 60_000);

  it("a page held up in shadow with a corner cut off still calibrates, and every crop holds its own answer", async () => {
    const big = { width: 1500, height: 2000 };
    const sheet = cutOut(photographed(textWritten, big, rotated(square(big, 160), 4, { x: 750, y: 1000 }), { shade: 0.2 }), { x: 0, y: 175, width: 1500, height: 1825 });
    const photo = await stored(shadowed(curled(sheet, 40), { x: 0, y: 1200 }, { x: 1500, y: 1100 }, 0.5, 8));
    const result = calibrate(photo);
    if (result.status !== "calibrated") throw new Error(`refused: ${JSON.stringify(result)}`);
    expect(result.calibration.placedBy).toBe("qr");
    expect(answersRead(photo, result.calibration)).toEqual(wanted);
  }, 60_000);
});
