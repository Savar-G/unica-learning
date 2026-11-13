import { beforeAll, describe, expect, it } from "vitest";
import type { QuestionPackage } from "@/lib/question-package";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import {
  applyTransform,
  calibratePhoto,
  calibrationForPhoto,
  cropBox,
  cropPlan,
  perspectiveTransform,
  straightenedPage,
  warpBox,
  type Calibration,
  type CropQuestion,
  type Raster,
  type Transform,
} from "@/lib/scan-calibration";
import { blankPage, cropCut, drawBoxOutline, drawDigit, drawMark, drawPrintedContent, drawQr, fillBox, greyRaster, photoJpeg, photographed, readDigit, rotatedCorners, uprightCorners } from "@/lib/scan-synthetic";
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

  it.each(SCAN_MARKS)("refuses a photo with mark %s out of view, and makes no calibration", async (m) => {
    // Disproved if three marks and a guess give a map.
    const photo = await stored(photographed(covered(m), SIZE, square(SIZE, 60)));
    expect(calibratePhoto({ photo, printed, contract: available, pageLink: LINK })).toEqual({ status: "refused", reason: "marks-missing" });
  }, 20_000);

  it("refuses a photo with a thumb across a mark", async () => {
    const r = writtenPage();
    fill(r, 20, 20, 90, 30, 60);
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
    expect(calibrationForPhoto(result.calibration, { printedRevision: REVISION })).toBe(result.calibration);
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
