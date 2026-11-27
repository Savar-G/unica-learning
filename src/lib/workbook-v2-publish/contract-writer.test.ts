import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { checkQuestionPackage } from "@/lib/question-package";
import { storedContent } from "@/lib/workbook-content";
import { printContractProblem, printedRevision, regionsProblem } from "@/lib/workbook-print-contract";
import { buildBook, type BuiltBook } from "@/lib/workbook-v2/build/build-book";
import { PAPER } from "@/lib/workbook-v2/contract";
import { fakeRenderer } from "@/lib/workbook-v2/testing/fake-renderer";
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
  const result = await buildBook({ snapshot: request().snapshot, book: allocation.allocation.book }, fakeRenderer());
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

  it("gives each question a box inside the image, its answer areas as regions, and a copied package that every reader finds", () => {
    const { payload } = writeBook(built, allocation);
    expect(payload.questions).toHaveLength(built.items.length);
    for (const q of payload.questions) {
      const page = payload.pages[q.pageNumber - 1];
      expect(q.box.x + q.box.width).toBeLessThanOrEqual(IMAGE.width);
      expect(q.box.y + q.box.height).toBeLessThanOrEqual(IMAGE.height);
      expect(regionsProblem(q.regions, page.image)).toBeNull();
      const check = checkQuestionPackage(q.package);
      expect(check.status).toBe("not-checked");
      expect(storedContent({ number: q.number, box: q.box, schemaVersion: payload.schemaVersion, package: q.package }, { source: "workbook", workbookId: WORKBOOK, page: q.pageNumber, question: q.number }).status).toBe("found");
    }
    const story = payload.questions.find((q) => q.package.id.startsWith("v2:story-problems/"))!;
    expect(story.package.item?.regions).toEqual([{ id: "answer", kind: "box", label: expect.any(String), answer: { type: "number", value: expect.any(Number) } }]);
    const bracket = payload.questions.find((q) => q.package.id.startsWith("v2:division-brackets/1/back/"))!;
    expect(bracket.regions.map((r) => r.id)).toEqual(["answer"]);
    expect(bracket.package.item?.format).toBe("write-number");
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
      ["story-problems", 1, 1, 2, true], ["division-brackets", 1, 3, 4, false], ["times-facts", 2, 5, 6, true], ["equal-groups", 2, 7, 8, false],
    ]);
    expect(payload.timeLogs).toEqual([{ day: 1, firstSheetId: "story-problems", pageNumber: 1 }, { day: 2, firstSheetId: "times-facts", pageNumber: 5 }]);
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
