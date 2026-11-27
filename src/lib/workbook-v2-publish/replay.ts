// Replay (UNI-141, architecture 10.3): rebuilds a stored v2 book from its saved input and proves that the PDF and every
// page image are the same bytes. Before it builds, it compares what made the book: the input hash, the engine version,
// the renderer version and the hash of each font and of the drawing file. A difference is named and nothing is built,
// so a changed font or engine never passes as a replay. `firstDifference` names the first cause in causal order (UNI-261):
// the saved input, its plan, the snapshot, the input hash, the engine, the renderer, the fonts, the build, the page count,
// any page model, then any page's pixels, and last the PDF, so a later difference that only follows from an earlier one is
// never reported as the cause.
import { buildBook, planBook } from "@/lib/workbook-v2/build/build-book";
import { ENGINE_VERSION } from "@/lib/workbook-v2/contract";
import { canonicalJson, sha256 } from "@/lib/workbook-v2/hash";
import type { Renderer } from "@/lib/workbook-v2/renderer";
import { fontHashes, rendererVersion } from "./contract-writer";
import type { SavedInput } from "./input";

/** What the stored book says made it, and the SHA-256 of its bytes. */
export interface ReplayExpected {
  inputHash: string;
  engineVersion: string;
  rendererVersion: string;
  fontHashes: Record<string, string>;
  pdfSha256: string;
  pageSha256s: string[];
  /** The hash of the snapshot the book was made from (`plan.snapshot.hash`), when known: a changed snapshot is then named before the input hash. */
  expectedSnapshotHash?: string;
  /** The SHA-256 of the canonical JSON of each page model, when known: a changed model is then named before its pixels. */
  pageModelSha256s?: string[];
}

/** The causes of a replay difference, in the order a replay checks them. */
export const REPLAY_CAUSES = ["input-format", "plan", "snapshot", "input-hash", "engine", "renderer", "font", "build", "page-count", "page-model", "page-pixels", "pdf"] as const;
export type ReplayCause = (typeof REPLAY_CAUSES)[number];

/** The first cause of a difference: what changed first, in causal order. `page` is the page in the book, from 1. */
export interface FirstDifference { kind: ReplayCause; message: string; details?: { expected?: string; actual?: string; page?: number; name?: string } }

export type ReplayResult =
  | { ok: true; pdfSha256: string; pages: number; buildMs: number }
  | { ok: false; differences: string[]; firstDifference: FirstDifference };

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** The saved input of a book, or why it is not one. */
export function readSavedInput(raw: unknown): SavedInput | string {
  if (!isPlainObject(raw) || raw.format !== 1 || !isPlainObject(raw.book) || raw.snapshot === undefined) return "the saved input is not a v2 book input of format 1";
  return raw as unknown as SavedInput;
}

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v !== "";

/** Validates an expected replay record before comparison, returning either the normalized record or a reason it is invalid. */
export function readReplayExpected(raw: unknown): ReplayExpected | string {
  if (!isPlainObject(raw)) return "the expected replay must be an object";
  if (!isNonEmptyString(raw.inputHash)) return "the expected replay needs a non-empty inputHash";
  if (!isNonEmptyString(raw.engineVersion)) return "the expected replay needs a non-empty engineVersion";
  if (!isNonEmptyString(raw.rendererVersion)) return "the expected replay needs a non-empty rendererVersion";
  if (!isPlainObject(raw.fontHashes) || !Object.values(raw.fontHashes).every(isNonEmptyString)) return "the expected replay needs fontHashes as a map of strings";
  if (!isNonEmptyString(raw.pdfSha256)) return "the expected replay needs a non-empty pdfSha256";
  if (!Array.isArray(raw.pageSha256s) || raw.pageSha256s.length === 0 || !raw.pageSha256s.every(isNonEmptyString)) {
    return "the expected replay needs pageSha256s as a non-empty list of hashes";
  }
  if (raw.expectedSnapshotHash !== undefined && !isNonEmptyString(raw.expectedSnapshotHash)) {
    return "expectedSnapshotHash must be a non-empty string when present";
  }
  if (raw.pageModelSha256s !== undefined) {
    if (!Array.isArray(raw.pageModelSha256s) || !raw.pageModelSha256s.every(isNonEmptyString)) {
      return "pageModelSha256s must be a list of hashes when present";
    }
    if (raw.pageModelSha256s.length !== raw.pageSha256s.length) {
      return `pageModelSha256s has ${raw.pageModelSha256s.length} entries, and pageSha256s has ${raw.pageSha256s.length}`;
    }
  }
  return {
    inputHash: raw.inputHash,
    engineVersion: raw.engineVersion,
    rendererVersion: raw.rendererVersion,
    fontHashes: { ...(raw.fontHashes as Record<string, string>) },
    pdfSha256: raw.pdfSha256,
    pageSha256s: [...raw.pageSha256s],
    ...(raw.expectedSnapshotHash !== undefined ? { expectedSnapshotHash: raw.expectedSnapshotHash } : {}),
    ...(raw.pageModelSha256s !== undefined ? { pageModelSha256s: [...raw.pageModelSha256s] } : {}),
  };
}

/** Each part of what made the book that this computer does not have, as a cause with words, in causal order. */
function identityCauses(expected: ReplayExpected, renderer: Renderer, engine: string): FirstDifference[] {
  const causes: FirstDifference[] = [];
  if (expected.engineVersion !== engine) causes.push({ kind: "engine", message: `the engine version differs: the book has ${expected.engineVersion}, this code has ${engine}`, details: { expected: expected.engineVersion, actual: engine } });
  const record = { ...renderer.identity };
  const version = rendererVersion(record);
  if (expected.rendererVersion !== version) causes.push({ kind: "renderer", message: `the renderer version differs: the book has ${expected.rendererVersion}, this computer has ${version}`, details: { expected: expected.rendererVersion, actual: version } });
  const here = fontHashes(record);
  for (const name of [...new Set([...Object.keys(expected.fontHashes), ...Object.keys(here)])].sort()) {
    const [was, is] = [expected.fontHashes[name] ?? "none", here[name] ?? "none"];
    if (was !== is) causes.push({ kind: "font", message: `the hash of ${name} differs: the book has ${was}, this computer has ${is}`, details: { name, expected: was, actual: is } });
  }
  return causes;
}

/** Each part of what made the book that this computer does not have, in words. */
export function identityDifferences(expected: ReplayExpected, renderer: Renderer, engine: string = ENGINE_VERSION): string[] {
  return identityCauses(expected, renderer, engine).map((c) => c.message);
}

const differ = (first: FirstDifference, differences: string[] = [first.message]): ReplayResult => ({ ok: false, differences, firstDifference: first });
/** The cause that comes first in `REPLAY_CAUSES`; of two of one kind, the one found first (the lower page). */
const firstOf = (causes: readonly FirstDifference[]): FirstDifference =>
  causes.reduce((first, c) => (REPLAY_CAUSES.indexOf(c.kind) < REPLAY_CAUSES.indexOf(first.kind) ? c : first));

export async function replayBook(raw: unknown, rawExpected: ReplayExpected, renderer: Renderer, clock: () => number = () => 0): Promise<ReplayResult> {
  const saved = readSavedInput(raw);
  if (typeof saved === "string") return differ({ kind: "input-format", message: saved });
  const expected = readReplayExpected(rawExpected);
  if (typeof expected === "string") return differ({ kind: "input-format", message: expected });
  const plan = planBook({ snapshot: saved.snapshot, book: saved.book });
  if (!plan.ok) return differ({ kind: "plan", message: "the saved input does not plan a book" }, ["the saved input does not plan a book:", ...plan.problems]);
  const causes: FirstDifference[] = [];
  const snapshotHash = expected.expectedSnapshotHash;
  if (snapshotHash !== undefined && snapshotHash !== plan.snapshot.hash) {
    causes.push({ kind: "snapshot", message: `the snapshot differs: the book has ${snapshotHash}, the saved input gives ${plan.snapshot.hash} (${plan.snapshot.id})`, details: { expected: snapshotHash, actual: plan.snapshot.hash } });
  }
  if (plan.inputHash !== expected.inputHash) causes.push({ kind: "input-hash", message: `the input hash differs: the book has ${expected.inputHash}, the saved input gives ${plan.inputHash}`, details: { expected: expected.inputHash, actual: plan.inputHash } });
  causes.push(...identityCauses(expected, renderer, ENGINE_VERSION));
  if (causes.length > 0) return differ(firstOf(causes), causes.map((c) => c.message));

  const started = clock();
  const built = await buildBook({ snapshot: saved.snapshot, book: saved.book }, renderer);
  if (built.status === "failed") return differ({ kind: "build", message: "the book does not build again" }, ["the book does not build again:", ...built.problems]);
  const buildMs = Math.round(clock() - started);
  const pdfSha256 = sha256(built.pdf);
  // `differences` keeps its order (the PDF first); `causes` is in causal order (the PDF last).
  const differences: string[] = [];
  const add = (cause: FirstDifference) => { causes.push(cause); differences.push(cause.message); };
  const pdf: FirstDifference = { kind: "pdf", message: `the PDF differs: the book has ${expected.pdfSha256}, the replay gives ${pdfSha256}`, details: { expected: expected.pdfSha256, actual: pdfSha256 } };
  if (pdfSha256 !== expected.pdfSha256) differences.push(pdf.message);
  const [wasCount, count] = [expected.pageSha256s.length, built.pages.length];
  if (count !== wasCount) add({ kind: "page-count", message: `the book has ${wasCount} pages, the replay gives ${count}`, details: { expected: String(wasCount), actual: String(count) } });
  built.pages.forEach((page, i) => {
    const [wasModel, model] = [expected.pageModelSha256s?.[i], sha256(canonicalJson(page.model))];
    if (wasModel !== undefined && model !== wasModel) add({ kind: "page-model", message: `the model of page ${i + 1} differs: the book has ${wasModel}, the replay gives ${model}`, details: { page: i + 1, expected: wasModel, actual: model } });
    const [was, hash] = [expected.pageSha256s[i], sha256(page.image)];
    if (was !== undefined && hash !== was) add({ kind: "page-pixels", message: `page ${i + 1} differs: the book has ${was}, the replay gives ${hash}`, details: { page: i + 1, expected: was, actual: hash } });
  });
  if (pdfSha256 !== expected.pdfSha256) causes.push(pdf);
  return causes.length > 0 ? differ(firstOf(causes), differences) : { ok: true, pdfSha256, pages: built.pages.length, buildMs };
}
