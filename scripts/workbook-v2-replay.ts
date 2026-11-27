// npm run workbook:v2:replay - rebuilds a v2 book and proves the same bytes (docs/workbook-v2-engine.md, "Replay").
//   --workbook <uuid>       a published book: its identity and fingerprints from Supabase, its input file from Storage
//                           (SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SECRET_KEY)
//   --bundle <folder>       offline: <folder>/input.json and <folder>/expected.json (ReplayExpected)
//   --input-file <file> --expected-pdf-sha256 <hex> --expected-page-sha256s <file> [--expected-input-hash <hex>]
//                           offline: a page hash a line; with no input hash, the input hash and the identity of this
//                           computer are taken as expected, so only the bytes are compared
// It names each part that differs (input hash, engine, renderer, a font or the drawing file, the PDF, a page) and exits 1.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { isUuid } from "@/lib/workbook-content";
import { planBook } from "@/lib/workbook-v2/build/build-book";
import { ENGINE_VERSION } from "@/lib/workbook-v2/contract";
import type { Renderer } from "@/lib/workbook-v2/renderer";
import { openRenderer, projectAssets } from "@/lib/workbook-v2/render/typst";
import { fontHashes, rendererVersion } from "@/lib/workbook-v2-publish/contract-writer";
import { readSavedInput, replayBook, type ReplayExpected } from "@/lib/workbook-v2-publish/replay";
import { v2Files, v2PublishStore } from "@/lib/workbook-v2-publish/supabase-store";

const USAGE = "Usage: npm run workbook:v2:replay -- --workbook UUID | --bundle FOLDER | --input-file FILE --expected-pdf-sha256 HEX --expected-page-sha256s FILE [--expected-input-hash HEX]";
const HEX = /^[0-9a-f]{64}$/;

const readJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, "utf8")) as unknown;

async function fromWorkbook(id: string): Promise<{ saved: unknown; expected: ReplayExpected }> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SECRET_KEY.");
  const db = createClient<Database>(url, key, { auth: { persistSession: false } });
  const book = await v2PublishStore(db).storedBook(id);
  if (!book) throw new Error(`No v2 book ${id}.`);
  if (!book.pdfSha256 || book.pages.some((p) => !p.imageSha256)) throw new Error(`The book ${id} has no fingerprint of its PDF or of a page.`);
  const bytes = await v2Files(db).get(book.inputPath);
  if (!bytes) throw new Error(`The input file ${book.inputPath} is not in Storage.`);
  return {
    saved: JSON.parse(new TextDecoder().decode(bytes)) as unknown,
    expected: { ...book, pdfSha256: book.pdfSha256, pageSha256s: book.pages.map((p) => p.imageSha256 ?? "") },
  };
}

async function fromFiles(values: Record<string, string | undefined>, renderer: Renderer): Promise<{ saved: unknown; expected: ReplayExpected }> {
  const saved = await readJson(values["input-file"]!);
  const pdf = values["expected-pdf-sha256"];
  const list = values["expected-page-sha256s"];
  if (!pdf || !HEX.test(pdf) || !list) throw new Error(USAGE);
  const pageSha256s = (await readFile(list, "utf8")).split(/\s+/).filter((l) => l !== "");
  if (!pageSha256s.every((h) => HEX.test(h))) throw new Error(`${list} must hold one SHA-256 a line.`);
  let inputHash = values["expected-input-hash"];
  if (inputHash === undefined) {
    const input = readSavedInput(saved);
    const plan = typeof input === "string" ? null : planBook({ snapshot: input.snapshot, book: input.book });
    inputHash = plan?.ok ? plan.inputHash : "";
  }
  return { saved, expected: { inputHash, engineVersion: ENGINE_VERSION, rendererVersion: rendererVersion(renderer.identity), fontHashes: fontHashes(renderer.identity), pdfSha256: pdf, pageSha256s } };
}

async function main(): Promise<void> {
  const text = { type: "string" } as const;
  let values: Record<string, string | undefined>;
  try {
    values = parseArgs({ args: process.argv.slice(2), options: { workbook: text, bundle: text, "input-file": text, "expected-pdf-sha256": text, "expected-page-sha256s": text, "expected-input-hash": text } }).values;
  } catch {
    throw new Error(USAGE);
  }
  const modes = ["workbook", "bundle", "input-file"].filter((m) => values[m] !== undefined);
  if (modes.length !== 1) throw new Error(USAGE);
  const renderer = await openRenderer(projectAssets(process.cwd(), homedir(), process.platform, process.arch));
  const source = values.workbook !== undefined
    ? (isUuid(values.workbook) ? await fromWorkbook(values.workbook) : (() => { throw new Error(USAGE); })())
    : values.bundle !== undefined
      ? { saved: await readJson(join(values.bundle, "input.json")), expected: (await readJson(join(values.bundle, "expected.json"))) as ReplayExpected }
      : await fromFiles(values, renderer);
  const started = performance.now();
  const result = await replayBook(source.saved, source.expected, renderer, () => performance.now());
  if (!result.ok) {
    console.error(["The replay differs:", ...result.differences.map((d) => `- ${d}`)].join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`The replay is the same: ${result.pages} pages, PDF ${result.pdfSha256}, build ${result.buildMs} ms, total ${Math.round(performance.now() - started)} ms.`);
}

await main();
