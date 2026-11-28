// The contract writer (UNI-141, architecture 10.5): turns a built v2 book into the rows that today's readers accept. Each
// page gets its print contract (scan marks in image pixels at 150 dpi), each question its box, its printed regions and a
// copied question package, and each printed question its item answer row, the one authority for its answer. The
// workbook's printed revision joins all of it, as for a v1 book. workbookProblem (the v1 store's check) checks the result,
// with a larger cap on questions: the store pages its reads (src/lib/workbook-store.ts).
import type { Json } from "@/lib/database.types";
import { QUESTION_PACKAGE_VERSION } from "@/lib/question-package";
import { workbookProblem, type WorkbookInput } from "@/lib/workbook-content";
import {
  PRINT_CONTRACT_VERSION,
  SCAN_MANIFEST_VERSION,
  SCAN_MARKS,
  SNAPSHOT_DAY,
  pageContentFingerprint,
  printedRevision,
  type PagePrintContract,
  type PrintedRegion,
  type ScanManifest,
} from "@/lib/workbook-print-contract";
import { printedCapture, printedPixels } from "@/lib/workbook-print-layout";
import type { BuiltBook } from "@/lib/workbook-v2/build/build-book";
import { IMAGE_PIXELS_PER_INCH, PAPER, SCAN_LAYOUTS, V2_SCAN_LAYOUT_VERSION, answerLine, type AnswerPart, type BookItem, type PageModel, type Rect } from "@/lib/workbook-v2/contract";
import { canonicalJson, sha256 } from "@/lib/workbook-v2/hash";
import { answerKindOf, copiedPackage, promptOf } from "./package-copy";
import type { Allocation, PayloadItemAnswer, PayloadPage, PayloadQuestion, PublishPayload, V2File } from "./types";

/** Image pixels a point. */
export const SCALE = IMAGE_PIXELS_PER_INCH / 72;
/** The size of every page image: the paper at 150 dpi. */
export const IMAGE = { width: Math.round(PAPER.w * SCALE), height: Math.round(PAPER.h * SCALE) } as const;
/** The most questions a v2 book may have: about 2,000 a level config allows, with room. */
export const MAX_V2_QUESTIONS = 4000;

const milli = (n: number) => Math.round(n * 1000) / 1000;

/** The width and height that a PNG says in its header. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((b, i) => bytes[i] === b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** A question's box: the whole pixels that hold its slot, inside the image. */
export function boxOf(r: Rect) {
  const x = Math.max(0, Math.floor(r.x * SCALE));
  const y = Math.max(0, Math.floor(r.y * SCALE));
  const right = Math.min(IMAGE.width, Math.ceil((r.x + r.w) * SCALE));
  const bottom = Math.min(IMAGE.height, Math.ceil((r.y + r.h) * SCALE));
  return { x, y, width: right - x, height: bottom - y };
}

function scanMarks(model: PageModel): PagePrintContract["marks"]["points"] {
  const rect = (corner: string) => {
    const region = model.regions.find((r) => r.role === "scan-mark" && r.id === `${model.id}/mark-${corner}`);
    if (!region) throw new Error(`page ${model.id} has no scan mark ${corner}`);
    return region.rect;
  };
  const point = (x: number, y: number) => ({ x: milli(x * SCALE), y: milli(y * SCALE) });
  const [tl, tr, br, bl] = SCAN_MARKS.map(rect);
  return { tl: point(tl.x, tl.y), tr: point(tr.x + tr.w, tr.y), br: point(br.x + br.w, br.y + br.h), bl: point(bl.x, bl.y + bl.h) };
}

/** The answer areas of a question, named by part, in image pixels. */
function printedRegions(model: PageModel, item: BookItem, image: { width: number; height: number }): PrintedRegion[] {
  return item.answer.parts.map((part) => {
    const regions = model.regions.filter((r) => r.item === item.id && r.part === part.name);
    const area = regions.find((r) => r.role === "answer"), reach = regions.find((r) => r.role === "reach");
    if (!area || !reach) throw new Error(`question ${item.id} has no answer area or reach for ${part.name}`);
    return { id: part.name, kind: "box", box: printedPixels(area.rect, model.size, image), reach: printedPixels(reach.rect, model.size, image) };
  });
}

const storyIds = (question: unknown) => {
  const q = (question ?? {}) as { question?: unknown; phrasing?: unknown; scenario?: unknown };
  const text = (v: unknown) => (typeof v === "string" ? v : null);
  return { questionId: text(q.question), phrasingId: text(q.phrasing), scenarioId: text(q.scenario) };
};

/** The answer as one text, with no unit: "32", or "9 R1" for a quotient and a remainder, or "4, 3, 0, 7" for places. */
export const answerValueOf = (parts: readonly AnswerPart[]): string =>
  (parts.length === 1 ? parts[0].value : answerLine({ parts: parts.map((p) => ({ ...p, kind: p.kind === "quantity" ? "whole-number" : p.kind })) }));

function itemAnswer(item: BookItem, page: number, attempt: number, snapshotId: string, engine: string): PayloadItemAnswer {
  const parts = item.answer.parts;
  const unit = parts.find((p) => p.kind === "quantity")?.unit ?? null;
  return {
    pageNumber: page, itemId: item.id, questionNumber: item.number, snapshotId, sheetId: item.sheetId, rowId: item.rowId, attempt,
    ...storyIds(item.question), engineVersion: engine, shape: item.shape, shapeVersion: item.shapeVersion, params: item.question as Json,
    prompt: promptOf(item.face), answerKind: answerKindOf(item),
    answerValue: answerValueOf(parts),
    acceptedForms: [], unit, parts, workedSteps: item.steps, difficulty: item.difficulty,
    itemHash: sha256(canonicalJson({ id: item.id, sheetId: item.sheetId, side: item.side, rowId: item.rowId, number: item.number, shape: item.shape, shapeVersion: item.shapeVersion, question: item.question, face: item.face, answer: item.answer, steps: item.steps, difficulty: item.difficulty })),
  };
}

export interface WrittenBook { payload: PublishPayload; files: V2File[] }

/** The renderer version a v2 book records: the pinned Typst version, the same on every computer. */
export const rendererVersion = (identity: Pick<BuiltBook["record"], "typst">) => `typst@${identity.typst}`;
/** The hashes of the files that Typst draws with: each font, and the drawing file. */
export const fontHashes = (identity: Pick<BuiltBook["record"], "fonts" | "template">): Record<string, string> => ({ ...identity.fonts, "page.typ": identity.template });

/** The rows and files of a built book under its allocation. Throws when the book and the allocation do not fit. */
export function writeBook(built: BuiltBook, a: Allocation): WrittenBook {
  const { allocation, parentId, workbookId } = a;
  const folder = `${parentId}/${workbookId}`;
  if (built.pages.length !== allocation.qrTokens.length) throw new Error("the book does not have a page for each allocated QR token");
  const pdfSha256 = sha256(built.pdf);
  const pdfPath = `${folder}/${pdfSha256}.pdf`;
  const files: V2File[] = [{ path: pdfPath, contentType: "application/pdf", bytes: built.pdf }];
  const level = allocation.levels[0];
  const pages: PayloadPage[] = [];
  const questions: PayloadQuestion[] = [];
  const itemAnswers: PayloadItemAnswer[] = [];
  const byPage = new Map<string, BookItem[]>();
  for (const item of built.items) {
    const page = item.id.slice(0, item.id.lastIndexOf("/"));
    byPage.set(page, [...(byPage.get(page) ?? []), item]);
  }
  built.pages.forEach(({ model, image }, i) => {
    const number = i + 1;
    const day = allocation.days[Math.floor(i / 2)];
    const size = pngSize(image);
    if (!size || size.width !== IMAGE.width || size.height !== IMAGE.height) throw new Error(`page ${number} is not a PNG of ${IMAGE.width} by ${IMAGE.height} pixels`);
    const imageSha = sha256(image);
    const path = `${folder}/${imageSha}.png`;
    files.push({ path, contentType: "image/png", bytes: image });
    const qrToken = allocation.qrTokens[i];
    const dayLabel = `Day ${day}`;
    const items = byPage.get(model.id) ?? [];
    const pageQuestions = items.map((item): PayloadQuestion => {
      const slot = model.regions.find((r) => r.role === "slot" && r.item === item.id);
      if (!slot) throw new Error(`question ${item.id} has no slot`);
      const ref = { source: "workbook" as const, workbookId, page: number, question: item.number };
      return { pageNumber: number, number: item.number, package: copiedPackage(item, ref, level), box: boxOf(slot.rect), regions: printedRegions(model, item, size) };
    });
    const dayStart = allocation.days.findIndex((d) => d === day) * 2;
    const printContract: PagePrintContract = {
      version: PRINT_CONTRACT_VERSION, workbookId, page: number, label: model.id, day, pageOfDay: i - dayStart + 1,
      layout: { version: V2_SCAN_LAYOUT_VERSION, side: model.side },
      captures: model.captures.map((capture) => printedCapture(capture, model.size, size)),
      coordinates: {
        units: "image-px", origin: "top-left", x: "right", y: "down", orientation: "portrait", image: size,
        content: printedPixels(SCAN_LAYOUTS[V2_SCAN_LAYOUT_VERSION][model.side].content, model.size, size),
        cssPage: { width: PAPER.w, height: PAPER.h }, scale: { x: SCALE, y: SCALE },
      },
      marks: { anchor: "outer-corner", order: [...SCAN_MARKS], points: scanMarks(model) },
      fingerprints: {
        content: pageContentFingerprint({ number, dayLabel, type: "practice", qrToken, questions: pageQuestions, content: { model: model.id, template: model.template } }),
        image: imageSha,
      },
    };
    pages.push({ number, dayLabel, type: "practice", image: { path, ...IMAGE }, qrToken, printContract });
    questions.push(...pageQuestions);
    itemAnswers.push(...items.map((item) => itemAnswer(item, number, model.attempt, built.record.snapshot.id, built.record.engine)));
  });
  if (itemAnswers.length !== built.items.length) throw new Error("a question of the book is on no page");

  const manifest: ScanManifest = {
    version: SCAN_MANIFEST_VERSION, curriculum: { key: "workbook-v2", version: built.record.snapshot.id }, testWorkbook: false, snapshotDay: SNAPSHOT_DAY,
    days: [...new Set(allocation.days)].map((day) => ({ day, pages: pages.filter((p) => p.printContract.day === day && questions.some((q) => q.pageNumber === p.number)).map((p) => p.number) })),
    levelTest: null,
  };
  const revisionSource = { id: workbookId, pdfPath, pdfSha256, printManifest: manifest, pages: pages.map((p) => ({ ...p, questions: questions.filter((q) => q.pageNumber === p.number) })) };
  const revision = printedRevision(revisionSource);
  if (!revision) throw new Error("the book has no printed revision");
  const sheets = allocation.book.sheets.map((s, i) => ({
    sheetId: s.sheetId, attempt: s.attempt, day: allocation.days[i], frontPageNumber: 2 * i + 1, backPageNumber: 2 * i + 2,
    snapshotId: built.record.snapshot.id, startsDay: s.startsDay,
    ...(allocation.reasons?.[i] !== undefined ? { reason: allocation.reasons[i] } : s.attempt === 1 ? { reason: "new" as const } : {}),
  }));
  const payload: PublishPayload = {
    schemaVersion: QUESTION_PACKAGE_VERSION,
    workbook: {
      id: workbookId, childId: a.childId, number: a.workbookNumber, levels: allocation.levels, pdfPath, pdfSha256, printManifest: manifest, printedRevision: revision,
      bankSnapshotId: built.record.snapshot.id, bankSnapshotHash: built.record.snapshot.hash, engineVersion: built.record.engine,
      rendererVersion: rendererVersion(built.record), fontHashes: fontHashes(built.record), inputHash: a.inputHash, inputPath: a.inputPath, pagesPerDay: allocation.pagesPerDay,
    },
    pages, questions, itemAnswers, sheets,
    timeLogs: sheets.filter((s) => s.startsDay).map((s) => ({ day: s.day, firstSheetId: s.sheetId, pageNumber: s.frontPageNumber })),
  };
  const problem = payloadProblem(payload, parentId);
  if (problem) throw new Error(`the book does not pass the store's check: ${problem}`);
  return { payload, files };
}

/** What the v1 store's check and v2 relational rules say of the book payload, or null. */
export function payloadProblem(p: PublishPayload, parentId: string): string | null {
  if (!p.workbook.inputPath.startsWith(`${parentId}/${p.workbook.id}/`)) return "the input file is not in the workbook's folder";
  if (!Array.isArray(p.pages) || !Array.isArray(p.questions) || !Array.isArray(p.itemAnswers) || !Array.isArray(p.sheets) || !Array.isArray(p.timeLogs)) {
    return "the book payload is incomplete";
  }
  if (p.pages.length < 2 || p.pages.length % 2 !== 0 || p.sheets.length !== p.pages.length / 2
    || p.questions.length < 1 || p.itemAnswers.length !== p.questions.length || p.timeLogs.length < 1) {
    return "the book payload is incomplete";
  }
  const pageNumbers = new Set(p.pages.map((page) => page.number));
  if (pageNumbers.size !== p.pages.length || p.pages.some((page) => !Number.isInteger(page.number) || page.number < 1 || page.number > p.pages.length)) {
    return "the page numbers do not run from 1 through the page count";
  }
  const questionKeys = new Set(p.questions.map((q) => `${q.pageNumber}:${q.number}`));
  if (questionKeys.size !== p.questions.length || p.questions.some((q) => !pageNumbers.has(q.pageNumber))) {
    return "a question names a missing or duplicate page position";
  }
  const answerKeys = new Set(p.itemAnswers.map((a) => `${a.pageNumber}:${a.questionNumber}`));
  if (answerKeys.size !== p.itemAnswers.length || [...answerKeys].some((k) => !questionKeys.has(k))) {
    return "an item answer does not match a question";
  }
  const frontPages = new Set(p.sheets.map((s) => s.frontPageNumber));
  if (frontPages.size !== p.sheets.length || p.sheets.some((s) => s.frontPageNumber < 1 || s.backPageNumber !== s.frontPageNumber + 1 || s.backPageNumber > p.pages.length || s.frontPageNumber % 2 !== 1)) {
    return "the sheets do not partition pages 1 through the page count";
  }
  const firstByDay = new Map<number, typeof p.sheets[number]>();
  for (const s of p.sheets) {
    const prev = firstByDay.get(s.day);
    if (!prev || s.frontPageNumber < prev.frontPageNumber) firstByDay.set(s.day, s);
  }
  const dayStarts = p.sheets.filter((s) => s.startsDay);
  if (dayStarts.length !== firstByDay.size || p.timeLogs.length !== firstByDay.size
    || [...firstByDay.values()].some((first) => !first.startsDay || !p.timeLogs.some((t) => t.day === first.day && t.firstSheetId === first.sheetId && t.pageNumber === first.frontPageNumber))) {
    return "the time logs do not match the first sheet of each day";
  }
  const input: WorkbookInput = {
    id: p.workbook.id, childId: p.workbook.childId, number: p.workbook.number, levels: p.workbook.levels, pdfPath: p.workbook.pdfPath, profileBuild: null,
    pdfSha256: p.workbook.pdfSha256, printManifest: p.workbook.printManifest, printedRevision: p.workbook.printedRevision,
    pages: p.pages.map((page) => ({ ...page, questions: p.questions.filter((q) => q.pageNumber === page.number).map((q) => ({ number: q.number, box: q.box, package: q.package, regions: q.regions })) })),
  };
  return workbookProblem(input, { maxQuestions: MAX_V2_QUESTIONS });
}
