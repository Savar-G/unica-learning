// Replay (UNI-141, architecture 10.3): rebuilds a stored v2 book from its saved input and proves that the PDF and every
// page image are the same bytes. Before it builds, it compares what made the book: the input hash, the engine version,
// the renderer version and the hash of each font and of the drawing file. A difference is named and nothing is built,
// so a changed font or engine never passes as a replay.
import { buildBook, planBook } from "@/lib/workbook-v2/build/build-book";
import { ENGINE_VERSION } from "@/lib/workbook-v2/contract";
import { sha256 } from "@/lib/workbook-v2/hash";
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
}

export type ReplayResult =
  | { ok: true; pdfSha256: string; pages: number; buildMs: number }
  | { ok: false; differences: string[] };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The saved input of a book, or why it is not one. */
export function readSavedInput(raw: unknown): SavedInput | string {
  if (!isObject(raw) || raw.format !== 1 || !isObject(raw.book) || raw.snapshot === undefined) return "the saved input is not a v2 book input of format 1";
  return raw as unknown as SavedInput;
}

/** Each part of what made the book that this computer does not have, in words. */
export function identityDifferences(expected: ReplayExpected, renderer: Renderer, engine: string = ENGINE_VERSION): string[] {
  const differences: string[] = [];
  if (expected.engineVersion !== engine) differences.push(`the engine version differs: the book has ${expected.engineVersion}, this code has ${engine}`);
  const record = { ...renderer.identity };
  const version = rendererVersion(record);
  if (expected.rendererVersion !== version) differences.push(`the renderer version differs: the book has ${expected.rendererVersion}, this computer has ${version}`);
  const here = fontHashes(record);
  for (const name of [...new Set([...Object.keys(expected.fontHashes), ...Object.keys(here)])].sort()) {
    if (expected.fontHashes[name] !== here[name]) differences.push(`the hash of ${name} differs: the book has ${expected.fontHashes[name] ?? "none"}, this computer has ${here[name] ?? "none"}`);
  }
  return differences;
}

export async function replayBook(raw: unknown, expected: ReplayExpected, renderer: Renderer, clock: () => number = () => 0): Promise<ReplayResult> {
  const saved = readSavedInput(raw);
  if (typeof saved === "string") return { ok: false, differences: [saved] };
  const plan = planBook({ snapshot: saved.snapshot, book: saved.book });
  if (!plan.ok) return { ok: false, differences: ["the saved input does not plan a book:", ...plan.problems] };
  const differences = [
    ...(plan.inputHash === expected.inputHash ? [] : [`the input hash differs: the book has ${expected.inputHash}, the saved input gives ${plan.inputHash}`]),
    ...identityDifferences(expected, renderer),
  ];
  if (differences.length > 0) return { ok: false, differences };

  const started = clock();
  const built = await buildBook({ snapshot: saved.snapshot, book: saved.book }, renderer);
  if (built.status === "failed") return { ok: false, differences: ["the book does not build again:", ...built.problems] };
  const buildMs = Math.round(clock() - started);
  const pdfSha256 = sha256(built.pdf);
  if (pdfSha256 !== expected.pdfSha256) differences.push(`the PDF differs: the book has ${expected.pdfSha256}, the replay gives ${pdfSha256}`);
  if (built.pages.length !== expected.pageSha256s.length) differences.push(`the book has ${expected.pageSha256s.length} pages, the replay gives ${built.pages.length}`);
  built.pages.forEach((page, i) => {
    const hash = sha256(page.image);
    if (expected.pageSha256s[i] !== undefined && hash !== expected.pageSha256s[i]) differences.push(`page ${i + 1} differs: the book has ${expected.pageSha256s[i]}, the replay gives ${hash}`);
  });
  return differences.length > 0 ? { ok: false, differences } : { ok: true, pdfSha256, pages: built.pages.length, buildMs };
}
