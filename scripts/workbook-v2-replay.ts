// npm run workbook:v2:replay - rebuilds a v2 book and proves the same bytes (docs/workbook-v2-engine.md, "Replay").
//   --workbook <uuid>       a published book: its identity and fingerprints from Supabase, its input file from Storage
//                           (SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SECRET_KEY)
//   --bundle <folder>       offline: <folder>/input.json and <folder>/expected.json (ReplayExpected)
//   --input-file <file> --expected-pdf-sha256 <hex> --expected-page-sha256s <file> [--expected-input-hash <hex>]
//                           offline: a page hash a line; with no input hash, the input hash and the identity of this
//                           computer are taken as expected, so only the bytes are compared
//   --expected-snapshot-hash <hex>  with --input-file: the snapshot hash of the book, so a changed snapshot is named first
// It names the first difference in causal order (input format, plan, snapshot, input hash, engine, renderer, a font or
// the drawing file, build, page count, a page model, a page's pixels, the PDF), then each part that differs, and exits 1.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { isUuid } from "@/lib/workbook-content";
import { planBook } from "@/lib/workbook-v2/build/build-book";
import { ENGINE_VERSION } from "@/lib/workbook-v2/contract";
import type { Renderer } from "@/lib/workbook-v2/renderer";
import { openRenderer, projectAssets } from "@/lib/workbook-v2/render/typst";
import { fontHashes, rendererVersion } from "@/lib/workbook-v2-publish/contract-writer";
import { readSavedInput, replayBook, type FirstDifference, type ReplayExpected } from "@/lib/workbook-v2-publish/replay";
import { storedReplayBundle } from "./workbook-v2-stored-book";

const USAGE = "Usage: npm run workbook:v2:replay -- --workbook UUID | --bundle FOLDER | --input-file FILE --expected-pdf-sha256 HEX --expected-page-sha256s FILE [--expected-input-hash HEX] [--expected-snapshot-hash HEX]";
const HEX = /^[0-9a-f]{64}$/;

const readJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, "utf8")) as unknown;

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
  const snapshotHash = values["expected-snapshot-hash"];
  if (snapshotHash !== undefined && !HEX.test(snapshotHash)) throw new Error(USAGE);
  return {
    saved,
    expected: {
      inputHash, engineVersion: ENGINE_VERSION, rendererVersion: rendererVersion(renderer.identity), fontHashes: fontHashes(renderer.identity), pdfSha256: pdf, pageSha256s,
      ...(snapshotHash === undefined ? {} : { expectedSnapshotHash: snapshotHash }),
    },
  };
}

/** What to do next for the first cause. A Typst of another version is kept in private storage with its SHA-256 (Savar, 2026-11-24). */
const NEXT_STEP: Partial<Record<FirstDifference["kind"], string>> = {
  renderer: "Fetch the Typst program of that version from the private archive (its SHA-256 is in the book record), install it, and replay again.",
  engine: "Check out the commit of that engine version and replay again.",
  font: "Check out the commit whose fonts and page.typ have these hashes and replay again.",
  snapshot: "The saved input holds another snapshot than the book was made from: the stored input changed.",
};

function firstDifferenceText(first: FirstDifference): string {
  const next = NEXT_STEP[first.kind];
  return [`First difference (${first.kind}): ${first.message}`, ...(next ? [`Next: ${next}`] : [])].join("\n");
}

async function main(): Promise<void> {
  const text = { type: "string" } as const;
  let values: Record<string, string | undefined>;
  try {
    values = parseArgs({ args: process.argv.slice(2), options: { workbook: text, bundle: text, "input-file": text, "expected-pdf-sha256": text, "expected-page-sha256s": text, "expected-input-hash": text, "expected-snapshot-hash": text } }).values;
  } catch {
    throw new Error(USAGE);
  }
  const modes = ["workbook", "bundle", "input-file"].filter((m) => values[m] !== undefined);
  if (modes.length !== 1) throw new Error(USAGE);
  const renderer = await openRenderer(projectAssets(process.cwd(), homedir(), process.platform, process.arch));
  const source = values.workbook !== undefined
    ? (isUuid(values.workbook) ? await storedReplayBundle(values.workbook) : (() => { throw new Error(USAGE); })())
    : values.bundle !== undefined
      ? { saved: await readJson(join(values.bundle, "input.json")), expected: (await readJson(join(values.bundle, "expected.json"))) as ReplayExpected }
      : await fromFiles(values, renderer);
  const started = performance.now();
  const result = await replayBook(source.saved, source.expected, renderer, () => performance.now());
  if (!result.ok) {
    console.error([firstDifferenceText(result.firstDifference), "", "Every difference:", ...result.differences.map((d) => `- ${d}`)].join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`The replay is the same: ${result.pages} pages, PDF ${result.pdfSha256}, build ${result.buildMs} ms, total ${Math.round(performance.now() - started)} ms.`);
}

await main();
