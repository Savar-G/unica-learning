// npm run workbook:v2:golden - builds the golden books and compares each page with its baseline (docs/workbook-v2-golden-replay.md).
//   (no option)            the synthetic levels with the fake renderer, against the committed baselines and accepted list
//   --update               rewrite the committed synthetic baselines; refused while a changed page is not accepted
//   --renderer fake|typst  the renderer (default: fake for synthetic levels, typst for a real level)
//   --out DIR              write a full baseline (hashes, page models, page images) to DIR, outside every git repository
//   --baseline DIR         compare with a full baseline from --out: exact model paths and pixel differences
//   --diff-dir DIR         write the expected, new and difference image of each changed page, outside every git repository
//   --accepted FILE        the accepted list (default: the committed one)
//   --snapshot FILE        a real level from a private snapshot file outside every git repository, with --out or --baseline
//   --mastery N            the mastery percent of that level (default 90)
//   --book NAME            only this golden book
//   --hashes               print the SHA-256 of the PDF and of each page PNG of each book, and compare nothing
// It exits 1 when a changed page is not accepted.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import { sha256 } from "@/lib/workbook-v2/hash";
import type { Renderer } from "@/lib/workbook-v2/renderer";
import { openRenderer, projectAssets } from "@/lib/workbook-v2/render/typst";
import { fakeRenderer } from "@/lib/workbook-v2/testing/fake-renderer";
import { refuseInsideGit } from "@/lib/workbook-v2/testing/git-repo";
import { compareGoldenBook, goldenReport, type ExpectedBook, type GoldenBuild } from "@/lib/workbook-v2/testing/golden";
import { buildGoldenBooks, levelId, SYNTHETIC_LEVELS, type GoldenLevel } from "@/lib/workbook-v2/testing/golden-books";
import { acceptedFile, committedBaselineFile, readAcceptedFile, readBaselineFile, readFullBaseline, writeBaselineFile, writeDifferenceImages, writeFullBaseline } from "@/lib/workbook-v2/testing/golden-files";

const USAGE = "Usage: npm run workbook:v2:golden -- [--update] [--renderer fake|typst] [--out DIR] [--baseline DIR] [--diff-dir DIR] [--accepted FILE] [--snapshot FILE [--mastery N]] [--book NAME] [--hashes]";

function options(): Record<string, string | boolean | undefined> {
  const text = { type: "string" } as const;
  const flag = { type: "boolean" } as const;
  try {
    return parseArgs({ args: process.argv.slice(2), options: { update: flag, renderer: text, out: text, baseline: text, "diff-dir": text, accepted: text, snapshot: text, mastery: text, book: text, hashes: flag } }).values;
  } catch {
    throw new Error(USAGE);
  }
}

/** A real level: its snapshot file must be outside every git repository, and so must every file the run writes or reads of it. */
function realLevel(values: Record<string, string | boolean | undefined>): GoldenLevel {
  const file = values.snapshot as string;
  refuseInsideGit(file, "the real-level snapshot");
  for (const name of ["out", "baseline", "diff-dir"] as const) if (typeof values[name] === "string") refuseInsideGit(values[name], `--${name}`);
  if (values.update) throw new Error("Refused: --update writes the committed synthetic baselines and never a real level. Use --out DIR outside every git repository.");
  if (values.out === undefined && values.baseline === undefined && !values.hashes) throw new Error("A real level needs --out DIR or --baseline DIR, outside every git repository.");
  const mastery = values.mastery === undefined ? 90 : Number(values.mastery);
  if (!Number.isSafeInteger(mastery) || mastery < 1 || mastery > 100) throw new Error("--mastery must be a whole number from 1 to 100.");
  return { snapshot: JSON.parse(readFileSync(file, "utf8")) as unknown, masteryPercent: mastery };
}

async function rendererOf(name: string): Promise<{ renderer: Renderer; label: string }> {
  if (name === "fake") return { renderer: fakeRenderer(), label: "fake" };
  if (name !== "typst") throw new Error(USAGE);
  const renderer = await openRenderer(projectAssets(process.cwd(), homedir(), process.platform, process.arch));
  return { renderer, label: `typst@${renderer.identity.typst}` };
}

/** The expected books: from a full baseline, or from the committed baselines of the synthetic levels. */
function expectedBooks(values: Record<string, string | boolean | undefined>, levels: readonly GoldenLevel[], label: string): Map<string, ExpectedBook> {
  if (typeof values.baseline === "string") {
    const full = readFullBaseline(values.baseline);
    if (full.renderer !== label) throw new Error(`The baseline in ${values.baseline} was made with ${full.renderer}, and this run uses ${label}.`);
    return full.books;
  }
  const books = new Map<string, ExpectedBook>();
  for (const level of levels) {
    const file = committedBaselineFile(process.cwd(), levelId(level));
    if (!existsSync(file)) continue;
    const baseline = readBaselineFile(file);
    if (baseline.renderer !== label) throw new Error(`The committed baselines are of the ${baseline.renderer} renderer: use --renderer ${baseline.renderer}, or --baseline DIR for ${label}.`);
    for (const record of baseline.books) books.set(record.book, { record });
  }
  return books;
}

function update(levels: readonly GoldenLevel[], builds: readonly GoldenBuild[], label: string): void {
  for (const level of levels) {
    const id = levelId(level);
    writeBaselineFile(committedBaselineFile(process.cwd(), id), label, builds.filter((b) => b.book.startsWith(`${id}/`)));
  }
  console.log(`Wrote the committed baselines of ${levels.length} synthetic levels.`);
}

async function main(): Promise<void> {
  const values = options();
  const real = typeof values.snapshot === "string";
  const levels = real ? [realLevel(values)] : SYNTHETIC_LEVELS;
  for (const name of ["out", "diff-dir"] as const) if (typeof values[name] === "string") refuseInsideGit(values[name], `--${name}`);
  if (values.update && (values.out !== undefined || values.baseline !== undefined || values.book !== undefined)) throw new Error("--update compares with the committed baselines and writes all of them: it takes no --out, --baseline or --book.");
  const rendererName = typeof values.renderer === "string" ? values.renderer : real ? "typst" : "fake";
  const { renderer, label } = await rendererOf(rendererName);
  const builds = await buildGoldenBooks(levels, renderer, typeof values.book === "string" ? values.book : undefined);

  if (values.hashes) {
    for (const b of builds) console.log(JSON.stringify({ book: b.book, pdf: sha256(b.pdf), pages: b.pages.map((p) => sha256(p.image)) }));
    return;
  }
  if (typeof values.out === "string") {
    writeFullBaseline(values.out, label, builds);
    console.log(`Wrote a full baseline of ${builds.length} golden books to ${values.out}.`);
    if (values.baseline === undefined) return;
  }

  const expected = expectedBooks(values, levels, label);
  const accepted = readAcceptedFile(typeof values.accepted === "string" ? values.accepted : acceptedFile(process.cwd()));
  const missing = builds.filter((b) => !expected.has(b.book)).map((b) => b.book);
  const comparisons = builds.flatMap((build) => {
    const book = expected.get(build.book);
    return book ? [compareGoldenBook(book, build, accepted)] : [];
  });
  console.log(goldenReport(comparisons));
  if (missing.length > 0) console.log(`No baseline yet: ${missing.join(", ")}.`);
  if (typeof values["diff-dir"] === "string") {
    const written = writeDifferenceImages(values["diff-dir"], comparisons, expected, builds);
    console.log(`Wrote ${written.length} images to ${values["diff-dir"]}.`);
  }
  const refused = comparisons.flatMap((c) => c.changes.filter((p) => p.accepted === null).map((p) => `${c.book} page ${p.page}`));
  if (refused.length > 0) {
    console.error(`${refused.length} changed ${refused.length === 1 ? "page is" : "pages are"} not accepted: ${refused.join(", ")}.`);
    process.exitCode = 1;
  } else if (values.update) update(levels, builds, label);
  // A golden book with no baseline yet fails until --update writes its first baseline (a new level: no page changed).
  else if (missing.length > 0) process.exitCode = 1;
}

await main();
