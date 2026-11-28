import fc from "fast-check";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { createSession } from "@/lib/maya";
import { teachingPackage } from "@/lib/maya-teaching";
import { workbookAnswerPages } from "@/lib/parent-workbook-answers";
import { checkQuestionPackage } from "@/lib/question-package";
import { storedContent, storedQuestion, type Workbook } from "@/lib/workbook-content";
import { calibratePhoto, photoPoint, sheetChecker } from "@/lib/scan-calibration";
import { runScanCrops } from "@/lib/scan-crops";
import { memoryScanCropStore } from "@/lib/scan-crops-memory";
import { normalizeScanPhoto } from "@/lib/scan-photo-image";
import { fillBox, greyRaster, pagePng } from "@/lib/scan-synthetic";
import { printContractProblem, printContractForPhoto, printedRevision, regionsProblem, storedPrintContract, storedScanPrintContract, type PagePrintContract } from "@/lib/workbook-print-contract";
import { pageUrl } from "@/lib/workbook-render";
import { buildBook, wholeBook, type BuiltBook } from "@/lib/workbook-v2/build/build-book";
import { PAPER, type Rect } from "@/lib/workbook-v2/contract";
import type { Renderer } from "@/lib/workbook-v2/renderer";
import { openRenderer } from "@/lib/workbook-v2/render/typst";
import { fakeRenderer } from "@/lib/workbook-v2/testing/fake-renderer";
import { skipTypstTests, testAssets } from "@/lib/workbook-v2/testing/typst";
import { IMAGE, SCALE, answerValueOf, boxOf, payloadProblem, pngSize, writeBook } from "./contract-writer";
import { allocationOf } from "./input";
import { promptOf } from "./package-copy";
import { PARENT, request } from "./publish.fixtures";
import type { Allocation } from "./types";

// The contract writer (C1): a built v2 book becomes rows that today's readers accept.

const WORKBOOK = "77777777-7777-4777-8777-777777777777";
const tokens = Array.from({ length: 8 }, (_, i) => `contract${String(i).padStart(16, "0")}`);

let built: BuiltBook;
let allocation: Allocation;
beforeAll(async () => {
  const planned = allocationOf(request(), { workbookId: WORKBOOK, qrTokens: tokens, allocatedAt: "2026-11-27T02:35:00.000Z", parentId: PARENT });
  if (!planned.ok) throw new Error(planned.problems.join("\n"));
  allocation = { ...planned.candidate, parentId: PARENT, workbookNumber: 3 };
  const result = await buildBook({ snapshot: request().snapshot, book: allocation.allocation.book }, fakeRenderer(), wholeBook(allocation.allocation.pagesPerDay));
  if (result.status !== "built") throw new Error(result.problems.join("\n"));
  built = result;
});

describe("the contract writer", () => {
  it("writes a print contract for each page that the scan code reads, with the marks at their outer corners in image pixels", () => {
    const { payload } = writeBook(built, allocation);
    expect(payload.pages.map((p) => [p.number, p.dayLabel, p.printContract.day, p.printContract.pageOfDay])).toEqual([
      [1, "Day 1", 1, 1], [2, "Day 1", 1, 2], [3, "Day 1", 1, 3], [4, "Day 1", 1, 4], [5, "Day 2", 2, 1], [6, "Day 2", 2, 2], [7, "Day 2", 2, 3], [8, "Day 2", 2, 4],
    ]);
    for (const p of payload.pages) expect(printContractProblem(p.printContract, { workbookId: WORKBOOK, page: p.number, image: p.image })).toBeNull();
    const { points } = payload.pages[0].printContract.marks;
    // The marks of every template: 90 points from the spine on the left of a front page, 36 from the other edges, 13.5 wide.
    expect(points.tl).toEqual({ x: 90 * SCALE, y: 36 * SCALE });
    expect(points.br).toEqual({ x: (562.5 + 13.5) * SCALE, y: (742.5 + 13.5) * SCALE });
    expect(payload.pages[0].image).toEqual({ path: `${PARENT}/${WORKBOOK}/${payload.pages[0].printContract.fingerprints.image}.png`, width: 1275, height: 1650 });
    expect(payload.pages.map((p) => p.qrToken)).toEqual(tokens);
  });

  it("gives each question a box inside the image, its answer areas as regions, and a copied package that Maya and parent answer keys read", () => {
    const { payload } = writeBook(built, allocation);
    expect(payload.questions).toHaveLength(built.items.length);
    let checkedCount = 0;
    let teachableCount = 0;
    for (const q of payload.questions) {
      const page = payload.pages[q.pageNumber - 1];
      expect(q.box.x + q.box.width).toBeLessThanOrEqual(IMAGE.width);
      expect(q.box.y + q.box.height).toBeLessThanOrEqual(IMAGE.height);
      expect(regionsProblem(q.regions, page.image)).toBeNull();
      const check = checkQuestionPackage(q.package);
      expect(["checked", "not-checked"]).toContain(check.status);
      if (check.status === "checked") checkedCount++;
      if (createSession({ callId: `test-${q.pageNumber}-${q.number}`, package: teachingPackage(q.package) }).package) teachableCount++;
      expect(storedContent({ number: q.number, box: q.box, schemaVersion: payload.schemaVersion, package: q.package }, { source: "workbook", workbookId: WORKBOOK, page: q.pageNumber, question: q.number }).status).toBe("found");
    }
    // Nearly every single-answer arithmetic and story question carries a checked operation that Maya can teach.
    expect(checkedCount).toBeGreaterThanOrEqual(payload.questions.length - 5);
    expect(teachableCount).toBeGreaterThanOrEqual(payload.questions.length - 6);
    const story = payload.questions.find((q) => q.package.id.startsWith("v2:story-problems/"))!;
    expect(story.package.item?.regions[0]?.kind).toBe("box");
    const bracket = payload.questions.find((q) => q.package.id.startsWith("v2:division-brackets/1/back/"))!;
    expect(bracket.regions.map((r) => r.id)).toEqual(["answer"]);
    expect(bracket.package.item?.format).toBe("write-number");

    // Parent answer keys preserve quantity units on every word problem (both checked operations and fallback stories).
    const book: Pick<Workbook, "id" | "pages"> = {
      id: WORKBOOK,
      pages: payload.pages.map((p) => ({
        number: p.number, dayLabel: p.dayLabel, type: p.type, image: p.image, qrToken: p.qrToken, printContract: p.printContract,
        questions: payload.questions.filter((q) => q.pageNumber === p.number).map((q) => storedQuestion(
          { number: q.number, box: q.box, regions: q.regions, schemaVersion: payload.schemaVersion, package: q.package },
          { source: "workbook", workbookId: WORKBOOK, page: p.number, question: q.number },
        )),
      })),
    };
    const answerPages = workbookAnswerPages(book);
    expect(answerPages).not.toBeNull();
    for (const a of payload.itemAnswers.filter((x) => x.answerKind === "quantity")) {
      const pageKey = answerPages!.find((p) => p.number === a.pageNumber);
      const qKey = pageKey?.questions.find((q) => q.number === a.questionNumber);
      expect(qKey?.answers).toEqual([{ part: 1, value: `${a.answerValue} ${a.unit}`, alternatives: [] }]);
    }
  });

  it("writes one answer row for each printed question, with its exact answer, unit and worked steps", () => {
    const { payload } = writeBook(built, allocation);
    expect(payload.itemAnswers).toHaveLength(built.items.length);
    for (const [i, a] of payload.itemAnswers.entries()) {
      const item = built.items[i];
      expect(a).toMatchObject({ itemId: item.id, questionNumber: item.number, sheetId: item.sheetId, rowId: item.rowId, shape: item.shape, shapeVersion: item.shapeVersion, parts: item.answer.parts, workedSteps: item.steps, prompt: promptOf(item.face) });
      expect(a.itemHash).toMatch(/^[0-9a-f]{64}$/);
    }
    const story = payload.itemAnswers.find((a) => a.shape === "story")!;
    expect(story).toMatchObject({ answerKind: "quantity", unit: expect.any(String), questionId: expect.any(String), phrasingId: expect.any(String), scenarioId: expect.any(String) });
    expect(story.answerValue).toMatch(/^\d+$/);
    expect(new Set(payload.itemAnswers.map((a) => a.itemHash)).size).toBe(payload.itemAnswers.length);
  });

  it.each([
    [[{ name: "answer", kind: "whole-number" as const, value: "32" }], "32"],
    [[{ name: "answer", kind: "quantity" as const, value: "24", unit: "muffins" }], "24"],
    [[{ name: "quotient", kind: "whole-number" as const, value: "9" }, { name: "remainder", kind: "whole-number" as const, value: "1" }], "9 R1"],
    [["thousands", "hundreds", "tens", "ones"].map((name, i) => ({ name, kind: "digit" as const, value: String([4, 3, 0, 7][i]) })), "4, 3, 0, 7"],
  ])("writes the answer %j as %s, with no unit", (parts, text) => {
    expect(answerValueOf(parts)).toBe(text);
  });

  it("writes the sheets, a time log for each day, and the book's printed revision", () => {
    const { payload, files } = writeBook(built, allocation);
    expect(payload.sheets.map((s) => [s.sheetId, s.day, s.frontPageNumber, s.backPageNumber, s.startsDay])).toEqual([
      ["times-facts", 1, 1, 2, true], ["division-brackets", 1, 3, 4, false], ["equal-groups", 2, 5, 6, true], ["story-problems", 2, 7, 8, false],
    ]);
    expect(payload.timeLogs).toEqual([{ day: 1, firstSheetId: "times-facts", pageNumber: 1 }, { day: 2, firstSheetId: "equal-groups", pageNumber: 5 }]);
    expect(payload.workbook.printManifest.days).toEqual([{ day: 1, pages: [1, 2, 3, 4] }, { day: 2, pages: [5, 6, 7, 8] }]);
    const revision = printedRevision({ ...payload.workbook, id: WORKBOOK, pages: payload.pages.map((p) => ({ ...p, questions: payload.questions.filter((q) => q.pageNumber === p.number) })) });
    expect(payload.workbook.printedRevision).toBe(revision);
    expect(payloadProblem(payload, PARENT)).toBeNull();
    expect(files.map((f) => f.contentType)).toEqual(["application/pdf", ...Array(8).fill("image/png")]);
    expect(payload.workbook).toMatchObject({ number: 3, levels: [3], pagesPerDay: 4, engineVersion: built.record.engine, inputHash: allocation.inputHash });
  });

  it("refuses a page image of another size and a book with another count of pages than its tokens", () => {
    const narrow = (image: Uint8Array) => {
      const copy = image.slice();
      new DataView(copy.buffer).setUint32(16, 1000);
      return copy;
    };
    const small = { ...built, pages: built.pages.map((p, i) => (i === 2 ? { ...p, image: narrow(p.image) } : p)) };
    expect(() => writeBook(small, allocation)).toThrow(/page 3 is not a PNG of 1275 by 1650 pixels/);
    expect(() => writeBook(built, { ...allocation, allocation: { ...allocation.allocation, qrTokens: tokens.slice(0, 6) } })).toThrow(/QR token/);
  });

  it("refuses a book whose input file is outside its folder, by the store's check", () => {
    const { payload } = writeBook(built, allocation);
    expect(payloadProblem({ ...payload, workbook: { ...payload.workbook, inputPath: `${PARENT}/other/x.json` } }, PARENT)).toMatch(/folder/);
  });
});

describe("a question's box", () => {
  it("holds its slot in whole pixels inside the page image (property)", () => {
    const rect = fc.record({ x: fc.double({ min: 0, max: PAPER.w - 1, noNaN: true }), y: fc.double({ min: 0, max: PAPER.h - 1, noNaN: true }) })
      .chain(({ x, y }) => fc.record({ x: fc.constant(x), y: fc.constant(y), w: fc.double({ min: 0.5, max: PAPER.w - x, noNaN: true }), h: fc.double({ min: 0.5, max: PAPER.h - y, noNaN: true }) }));
    fc.assert(fc.property(rect, (r) => {
      const b = boxOf(r);
      const whole = [b.x, b.y, b.width, b.height].every(Number.isInteger);
      return whole && b.x >= 0 && b.y >= 0 && b.width >= 1 && b.height >= 1 && b.x + b.width <= IMAGE.width && b.y + b.height <= IMAGE.height
        && b.x <= r.x * SCALE && b.y <= r.y * SCALE && b.x + b.width >= Math.min(IMAGE.width, (r.x + r.w) * SCALE) - 1e-9;
    }), { seed: 141 });
  });

  it("reads the size of a PNG from its header, and nothing from other bytes", () => {
    expect(pngSize(built.pages[0].image)).toEqual({ width: 1275, height: 1650 });
    expect(pngSize(new Uint8Array(30))).toBeNull();
  });
});

describe.skipIf(skipTypstTests(process.env.WORKBOOK_V2_REQUIRE_TYPST === "1"))("scanning a published Typst workbook", () => {
  let real: BuiltBook;
  let renderer: Renderer;
  let payload: ReturnType<typeof writeBook>["payload"];
  beforeAll(async () => {
    renderer = await openRenderer(testAssets());
    const result = await buildBook({ snapshot: request().snapshot, book: allocation.allocation.book }, renderer, wholeBook(allocation.allocation.pagesPerDay));
    if (result.status !== "built") throw new Error(result.problems.join("\n"));
    real = result;
    payload = writeBook(real, allocation).payload;
  }, 60_000);

  const fromStorage = (i: number) => {
    const page = payload.pages[i];
    return storedPrintContract(JSON.parse(JSON.stringify(page.printContract)), { workbookId: WORKBOOK, page: page.number, image: page.image })!;
  };
  const contractFor = async (token: string) => {
    const i = tokens.indexOf(token);
    return i < 0 ? null : fromStorage(i);
  };
  const calibrate = async (i: number, bytes: Uint8Array, contract: PagePrintContract | null = fromStorage(i), expected = tokens[i]) => {
    const revision = payload.workbook.printedRevision;
    return calibratePhoto({ photo: await greyRaster(bytes), printed: await greyRaster(real.pages[i].image),
      contract: printContractForPhoto({ printedRevision: revision }, { printContract: contract }, { printedRevision: revision }),
      pageLink: pageUrl(expected), writing: payload.questions.filter((q) => q.pageNumber === i + 1).flatMap((q) => q.regions.flatMap((r) => r.box ? [r.box] : [])) });
  };
  const hideMarks = async (i: number, count: number) => {
    const { image, model } = real.pages[i];
    const photo = await greyRaster(image);
    for (const { rect } of model.regions.filter((r) => r.role === "scan-mark").slice(0, count)) {
      const x = Math.floor(rect.x * SCALE) - 1, y = Math.floor(rect.y * SCALE) - 1;
      fillBox(photo, x, y, Math.ceil((rect.x + rect.w) * SCALE) - x + 1, Math.ceil((rect.y + rect.h) * SCALE) - y + 1, 255);
    }
    return pagePng(photo);
  };
  const checkCrops = async (i: number, bytes: Uint8Array, twin?: Uint8Array) => {
    const page = payload.pages[i];
    const clock = Date.parse("2026-11-27T12:00:00Z");
    const ref = { parent: PARENT, photo: "typst-photo" };
    const memory = memoryScanCropStore({ now: () => clock });
    memory.printed.set(page.image.path, real.pages[i].image);
    if (twin) memory.printed.set("invented-twin.png", twin);
    memory.photos.set(ref.photo, { parent: PARENT, state: "saved", createdAt: clock, expiresAt: clock + 100_000, bytes, storedBytes: bytes.length,
      frame: { book: { printedRevision: payload.workbook.printedRevision }, printedRevision: payload.workbook.printedRevision,
        page: { printContract: fromStorage(i), qrToken: page.qrToken, imagePath: page.image.path, others: twin ? ["invented-twin.png"] : [], questions: payload.questions.filter((q) => q.pageNumber === i + 1) } } });
    return runScanCrops(memory.store, ref, "test-lease");
  };

  it("stores the layout identity, answer rectangles and captures of the rendered page", () => {
    for (const i of [0, 1]) {
      const { model } = real.pages[i];
      const px = (n: number) => Math.round(n * 1000) / 1000;
      const box = ({ x, y, w, h }: Rect) => ({
        x: px(x * IMAGE.width / model.size.w), y: px(y * IMAGE.height / model.size.h),
        width: px(w * IMAGE.width / model.size.w), height: px(h * IMAGE.height / model.size.h),
      });
      expect(fromStorage(i)).toMatchObject({ layout: { version: 2, side: model.side }, captures: model.captures.map(({ id, kind, rect, fields }) => ({
        id, kind, box: box(rect), fields: fields.map(({ name, rect, reach }) => ({ name, box: box(rect), reach: box(reach) })),
      })) });
      const expected = model.regions.filter((r) => r.role === "answer");
      const stored = payload.questions.filter((q) => q.pageNumber === i + 1).flatMap((q) => q.regions);
      expect(stored).toHaveLength(expected.length);
      for (const [j, { rect, item, part }] of expected.entries()) {
        const reach = model.regions.find((r) => r.role === "reach" && r.item === item && r.part === part)!;
        expect(stored[j]).toMatchObject({ box: box(rect), reach: box(reach.rect) });
      }
    }
  });

  it("reads early v2 publications using the stored generator and page order", async () => {
    for (const i of [0, 1, 2]) {
      const { printContract, number, image } = payload.pages[i];
      const legacy = { ...printContract, layout: undefined, captures: undefined, coordinates: { ...printContract.coordinates, content: undefined } };
      const at = { workbookId: WORKBOOK, page: number, image };
      expect(storedScanPrintContract(legacy, at, "v1")).toBe(legacy);
      const read = storedScanPrintContract(legacy, at, "v2");
      expect(read).toEqual(printContract);
      if (!read || read === "unsupported") throw new Error("No scan layout for a stored v2 page");
      expect((await calibrate(i, await hideMarks(i, 4), read)).status).toBe("calibrated");
    }
  }, 30_000);

  it.each([0, 1, 2, 3, 4])("places a front and a back page with %i marks hidden", async (hidden) => {
    for (const i of [0, 1]) {
      const photo = await normalizeScanPhoto(await hideMarks(i, hidden), undefined, contractFor);
      expect(photo).toMatchObject({ token: tokens[i], spread: null });
      const result = await calibrate(i, photo.bytes);
      expect(result.status).toBe("calibrated");
      if (result.status !== "calibrated") return;
      expect(result.calibration.hiddenMarks ?? []).toHaveLength(hidden);
      const { rect } = real.pages[i].model.regions.find((r) => r.role === "answer")!;
      const expected = { x: rect.x * SCALE, y: rect.y * SCALE };
      const found = photoPoint(result.calibration, IMAGE, expected);
      expect(Math.hypot(found.x - expected.x, found.y - expected.y)).toBeLessThan(4);
    }
  }, 30_000);

  it("keeps both identified pages in a spread with outer QR codes about 1.77 page widths apart", async () => {
    const gap = 64;
    const qrCenter = (i: number) => {
      const { rect } = real.pages[i].model.regions.find((r) => r.role === "qr")!;
      return (rect.x + rect.w / 2) * SCALE;
    };
    expect((IMAGE.width + gap + qrCenter(2) - qrCenter(1)) / IMAGE.width).toBeCloseTo(1.77, 2);
    const spread = await sharp({ create: { width: IMAGE.width * 2 + gap, height: IMAGE.height, channels: 3, background: "#eeeeee" } })
      .composite([{ input: Buffer.from(real.pages[1].image), left: 0, top: 0 }, { input: Buffer.from(real.pages[2].image), left: IMAGE.width + gap, top: 0 }]).png().toBuffer();
    const normalized = await normalizeScanPhoto(spread, undefined, contractFor);
    expect(normalized.spread?.map(({ token }) => token)).toEqual([tokens[1], tokens[2]]);
    for (const [j, page] of (normalized.spread ?? []).entries()) {
      expect(await normalizeScanPhoto(page.bytes, undefined, contractFor)).toMatchObject({ token: tokens[j + 1], spread: null });
      expect((await calibrate(j + 1, page.bytes)).status).toBe("calibrated");
    }
  }, 30_000);

  it("rejects unsupported explicit layout metadata during storage reads, upload and calibration", async () => {
    const page = payload.pages[0];
    const unsupported = { ...page.printContract, layout: { version: 99, side: "front" } };
    const at = { workbookId: WORKBOOK, page: 1, image: page.image };
    const stored = storedPrintContract(unsupported, at);
    expect(stored).toBeNull();
    await expect(normalizeScanPhoto(real.pages[0].image, undefined, async () => storedScanPrintContract(unsupported, at, "v2"))).rejects.toThrow("page");
    expect(await calibrate(0, real.pages[0].image, stored)).toEqual({ status: "unavailable", reason: "no-contract" });
  });

  it("refuses another page and stops answers outside the photo with a readable QR", async () => {
    expect((await calibrate(0, await hideMarks(1, 4))).status).toBe("refused");
    const bytes = await sharp(await hideMarks(0, 4)).extract({ left: 0, top: 440, width: IMAGE.width, height: IMAGE.height - 440 }).png().toBuffer();
    const preview = await checkCrops(0, bytes);
    expect((await normalizeScanPhoto(bytes, undefined, contractFor)).token).toBe(tokens[0]);
    expect(preview).toMatchObject({ status: "ready", cutOff: expect.arrayContaining([1]) });
    if (preview.status === "ready") {
      expect(preview.crops.length).toBeGreaterThan(0);
      expect(preview.crops.some((c) => c.number === 1)).toBe(false);
    }
  }, 30_000);

  it("keeps visible answers with all marks hidden and checks a near twin with the same readable QR", async () => {
    const { model, image } = real.pages[0];
    const markerless = await hideMarks(0, 4);
    const preview = await checkCrops(0, markerless);
    expect(preview).toMatchObject({ status: "ready", crops: expect.arrayContaining(payload.questions.filter((q) => q.pageNumber === 1)
      .map((q) => expect.objectContaining({ number: q.number }))) });

    const twin = structuredClone(model);
    const label = twin.regions.find((r) => r.role === "label")!.ink[0];
    if (label.kind !== "text") throw new Error("The invented question has no printed number");
    label.text = "8";
    const [other] = await renderer.images([twin]);
    const [printed, photo, otherPrint] = await Promise.all([greyRaster(image), greyRaster(other), greyRaster(other)]);
    const aligned = await calibrate(0, markerless);
    if (aligned.status !== "calibrated") throw new Error("The reference photo did not calibrate");
    const { calibration } = aligned;
    const sheet = { printed, transform: calibration.transform, sheet: calibration, layout: fromStorage(0).layout };
    expect(sheetChecker({ ...sheet, photo: await greyRaster(markerless) })([otherPrint]).verdict).toBe("this-page");
    const verdict = sheetChecker({ ...sheet, photo })([otherPrint]);
    expect(verdict.twins).toBe(1);
    expect(verdict.verdict).not.toBe("this-page");
    const wrong = await checkCrops(0, other, other);
    expect(wrong).toMatchObject({ status: "ready", crops: expect.any(Array) });
    if (wrong.status === "ready") expect(wrong.crops.some((c) => c.number === 1)).toBe(false);
  }, 30_000);
});
