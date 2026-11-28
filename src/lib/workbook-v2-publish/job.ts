// The v2 book job (UNI-141, architecture 10.3 "Book job order"):
// 1. Check that the child's family is a test family, plan the book (every check that needs no drawing), and save the
//    allocation (ids, QR tokens, date) and the input file under the input hash, before the build. A retry with the same
//    request key reuses them. A book that is published under that input hash already is given back with no build.
// 2. Build with buildBook.
// 3. Upload the PDF and each page image, each named by its SHA-256; a path that exists already counts as stored.
// 4. Write all rows in one call to publish_v2_workbook. When that call fails or its answer is lost, read the book by its
//    input hash before one retry: a book that was written is given back, never written twice.
// The record of each run says the time of each step and the bytes and rows it wrote.
import { buildBook, planBook } from "@/lib/workbook-v2/build/build-book";
import { canonicalJson } from "@/lib/workbook-v2/hash";
import type { Renderer } from "@/lib/workbook-v2/renderer";
import { writeBook } from "./contract-writer";
import { allocationOf, bookInput, type SavedInput } from "./input";
import type { Allocation, PublishPayload, PublishRequest, PublishedRef, V2File, V2PublishStore, V2Storage } from "./types";

export interface JobDeps {
  store: V2PublishStore;
  files: V2Storage;
  /** Opened only when a book is built. */
  renderer: () => Promise<Renderer>;
  now: () => Date;
  /** Milliseconds, for the times of the record. */
  clock: () => number;
  uuid: () => string;
  /** A QR token: 24 URL-safe characters. */
  token: () => string;
}

export interface TimingRecord {
  httpStatus: 200 | 201;
  status: "published" | "existing";
  workbookId: string;
  printedRevision: string | null;
  inputHash: string;
  inputPath: string;
  counts: { pages: number; questions: number; itemAnswers: number; sheets: number; timeLogs: number };
  /** pdf + images + input = total. */
  bytes: { pdf: number; images: number; input: number; total: number };
  /** allocate + build + upload + publish + overhead = total. */
  timingMs: { allocate: number; build: number; upload: number; publish: number; overhead: number; total: number };
}

export type JobResult =
  | { status: "published" | "existing"; record: TimingRecord }
  | { status: "refused"; reason: "unknown-child" | "not-test-family" | "database"; detail: string }
  | { status: "invalid"; problems: string[] }
  | { status: "failed"; problems: string[] };

const UPLOADS_AT_ONCE = 8;

async function uploadAll(files: V2Storage, list: readonly V2File[]): Promise<void> {
  let next = 0;
  let failed = false;
  let firstError: unknown;
  const worker = async () => {
    while (!failed && next < list.length) {
      const file = list[next++];
      try {
        await files.put(file);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
        return;
      }
    }
  };
  await Promise.allSettled(Array.from({ length: Math.min(UPLOADS_AT_ONCE, list.length) }, worker));
  if (failed) throw firstError;
}

/** One write; on a throw (a failed call or a lost answer), read the book first, and try one more time only if it is not there. */
export async function publishOnce(store: V2PublishStore, payload: PublishPayload): Promise<{ status: "published" | "existing"; ref: PublishedRef } | { status: "refused"; reason: string }> {
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await store.publish(payload);
      if (result.status === "refused") return result;
      return { status: result.status, ref: { workbookId: result.workbookId, printedRevision: result.printedRevision } };
    } catch (error) {
      const found = await store.findByInputHash(payload.workbook.inputHash);
      if (found) return { status: "existing", ref: found };
      if (attempt >= 2) throw error;
    }
  }
}

/**
 * An allocation that a request key or an input hash already has is reused only for the same book: the same child, sheets,
 * region and interest (the ids and tokens are the allocation's), and the same snapshot (its input hash).
 */
function sameBook(request: PublishRequest, a: Allocation): boolean {
  const asked = bookInput(request, a.workbookId, a.allocation.qrTokens);
  if (a.childId !== request.childId || canonicalJson(asked) !== canonicalJson(a.allocation.book)) return false;
  const plan = planBook({ snapshot: request.snapshot, book: a.allocation.book });
  return plan.ok && plan.inputHash === a.inputHash;
}

const NO_COUNTS = { pages: 0, questions: 0, itemAnswers: 0, sheets: 0, timeLogs: 0 };

export async function publishV2Book(deps: JobDeps, request: PublishRequest): Promise<JobResult> {
  const started = deps.clock();
  const family = await deps.store.family(request.childId);
  if (family.status === "unknown-child") return { status: "refused", reason: "unknown-child", detail: "the child is not known" };
  if (family.status === "not-test") return { status: "refused", reason: "not-test-family", detail: "v2 books are only for test families" };

  const workbookId = deps.uuid();
  const qrTokens = Array.from({ length: request.sheets.length * 2 }, () => deps.token());
  const planned = allocationOf(request, { workbookId, qrTokens, allocatedAt: deps.now().toISOString(), parentId: family.parentId });
  if (!planned.ok) return { status: "invalid", problems: planned.problems };
  const allocated = await deps.store.allocate(planned.candidate);
  if (allocated.status === "refused") return { status: "refused", reason: "database", detail: allocated.reason };
  const allocation: Allocation = allocated;
  const savedReasons = allocation.allocation.reasons;
  if (allocated.status === "existing" && (!sameBook(request, allocation)
    || (savedReasons !== undefined && canonicalJson(savedReasons) !== canonicalJson(planned.candidate.allocation.reasons)))) {
    return { status: "invalid", problems: ["the request key was used for another book"] };
  }
  const record = (status: "published" | "existing", ref: PublishedRef, counts: TimingRecord["counts"], pdf: number, images: number, inputBytes: number, t: Omit<TimingRecord["timingMs"], "overhead" | "total">): TimingRecord => {
    const total = Math.max(0, Math.ceil(deps.clock() - started));
    // (Each step rounds down and the total up, so the overhead is never below 0.)
    const steps = { allocate: Math.floor(t.allocate), build: Math.floor(t.build), upload: Math.floor(t.upload), publish: Math.floor(t.publish) };
    const overhead = total - steps.allocate - steps.build - steps.upload - steps.publish;
    return {
      httpStatus: status === "published" ? 201 : 200, status, workbookId: ref.workbookId, printedRevision: ref.printedRevision,
      inputHash: allocation.inputHash, inputPath: allocation.inputPath, counts,
      bytes: { pdf, images, input: inputBytes, total: pdf + images + inputBytes }, timingMs: { ...steps, overhead, total },
    };
  };
  const existing = await deps.store.findByInputHash(allocation.inputHash);
  if (existing) {
    const allocate = deps.clock() - started;
    return { status: "existing", record: record("existing", existing, NO_COUNTS, 0, 0, 0, { allocate, build: 0, upload: 0, publish: 0 }) };
  }
  const saved: SavedInput = { format: 1, snapshot: request.snapshot, book: allocation.allocation.book };
  const input = new TextEncoder().encode(canonicalJson(saved));
  await deps.files.put({ path: allocation.inputPath, contentType: "application/json", bytes: input });
  const allocate = deps.clock() - started;

  const buildStart = deps.clock();
  const built = await buildBook({ snapshot: request.snapshot, book: allocation.allocation.book }, await deps.renderer());
  if (built.status === "failed") return { status: "failed", problems: built.problems };
  if (built.record.inputHash !== allocation.inputHash) return { status: "failed", problems: ["the built book is not the book of its allocation"] };
  const build = deps.clock() - buildStart;

  const currentFamily = await deps.store.family(request.childId);
  if (currentFamily.status === "unknown-child") return { status: "refused", reason: "unknown-child", detail: "the child is not known" };
  if (currentFamily.status === "not-test") return { status: "refused", reason: "not-test-family", detail: "v2 books are only for test families" };

  const uploadStart = deps.clock();
  const { payload, files } = writeBook(built, allocation);
  await uploadAll(deps.files, files);
  const upload = deps.clock() - uploadStart;

  const publishStart = deps.clock();
  const result = await publishOnce(deps.store, payload);
  if (result.status === "refused") return { status: "refused", reason: "database", detail: result.reason };
  const publish = deps.clock() - publishStart;
  const counts = { pages: payload.pages.length, questions: payload.questions.length, itemAnswers: payload.itemAnswers.length, sheets: payload.sheets.length, timeLogs: payload.timeLogs.length };
  const images = files.filter((f) => f.contentType === "image/png").reduce((n, f) => n + f.bytes.length, 0);
  return { status: result.status, record: record(result.status, result.ref, counts, built.pdf.length, images, input.length, { allocate, build, upload, publish }) };
}
