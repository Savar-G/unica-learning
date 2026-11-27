// The files of golden books. The repository keeps, for each synthetic level, a compact baseline of hashes and model
// outlines (fixtures/golden/<snapshot id>.json) and one accepted list (fixtures/golden/accepted.json). A full baseline,
// with every page model and page image, is written by the command to a folder outside every git repository: it gives the
// exact model paths and the pixel differences. Real levels have only full baselines, outside every repository.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PageModel } from "../contract";
import { refuseInsideGit } from "./git-repo";
import { assertExpectedConsistent, differenceImage, goldenRecord, readAccepted, readBaseline, type AcceptedChange, type ExpectedBook, type GoldenBaseline, type GoldenBuild, type GoldenComparison } from "./golden";

export const GOLDEN_DIR = "src/lib/workbook-v2/fixtures/golden";
export const acceptedFile = (root: string): string => join(root, GOLDEN_DIR, "accepted.json");
export const committedBaselineFile = (root: string, levelId: string): string => join(root, GOLDEN_DIR, `${levelId}.json`);

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8")) as unknown;
/** Writes a complete file into a sibling staging folder and renames it into place, so no partial file is left on failure. */
function writeAtomic(file: string, content: string | Uint8Array): void {
  const parent = dirname(file);
  mkdirSync(parent, { recursive: true });
  const staging = mkdtempSync(join(parent, ".golden-tmp-"));
  try {
    const tmp = join(staging, "part");
    writeFileSync(tmp, content);
    renameSync(tmp, file);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
const writeJson = (file: string, value: unknown) => writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
/** A folder name for a golden book: "level/strong" becomes "level__strong". */
const folderOf = (book: string): string => {
  if (!/^[A-Za-z0-9._-]+\/[a-z]+$/.test(book)) throw new Error(`The golden book name ${JSON.stringify(book)} is not a snapshot id and a child.`);
  return book.replace("/", "__");
};

export function readBaselineFile(file: string): GoldenBaseline {
  const baseline = readBaseline(readJson(file));
  if (typeof baseline === "string") throw new Error(`${file}: ${baseline}.`);
  return baseline;
}

export function readAcceptedFile(file: string): AcceptedChange[] {
  if (!existsSync(file)) return [];
  const accepted = readAccepted(readJson(file));
  if (typeof accepted[0] === "string") throw new Error([`${file} is not an accepted list:`, ...(accepted as string[])].join("\n"));
  return accepted as AcceptedChange[];
}

export function writeBaselineFile(file: string, renderer: string, builds: readonly GoldenBuild[]): void {
  writeJson(file, { format: 1, renderer, books: builds.map(goldenRecord) } satisfies GoldenBaseline);
}

/** Writes a full baseline: golden.json, and for each book its page models and page images. Never inside a git repository. */
export function writeFullBaseline(dir: string, renderer: string, builds: readonly GoldenBuild[]): void {
  const safeDir = refuseInsideGit(dir, "the golden baseline folder");
  const manifest = refuseInsideGit(join(safeDir, "golden.json"), "the golden baseline manifest");
  const plan = builds.map((build) => {
    const folder = refuseInsideGit(join(safeDir, folderOf(build.book)), `the golden baseline folder for ${build.book}`);
    const modelsFile = refuseInsideGit(join(folder, "models.json"), `the models file for ${build.book}`);
    const pageFiles = build.pages.map((p, i) => ({
      file: refuseInsideGit(join(folder, `page-${i + 1}.png`), `the page image for ${build.book} page ${i + 1}`),
      image: p.image,
    }));
    return { build, folder, modelsFile, pageFiles };
  });
  mkdirSync(safeDir, { recursive: true });
  for (const { build, folder, modelsFile, pageFiles } of plan) {
    mkdirSync(folder, { recursive: true });
    writeJson(modelsFile, build.pages.map((p) => p.model));
    for (const { file, image } of pageFiles) writeAtomic(file, image);
  }
  writeBaselineFile(manifest, renderer, builds);
}

/** A full baseline as expected books by name, verified against its manifest and never read from a git repository. */
export function readFullBaseline(dir: string): { renderer: string; books: Map<string, ExpectedBook> } {
  const safeDir = refuseInsideGit(dir, "the golden baseline folder");
  const manifest = refuseInsideGit(join(safeDir, "golden.json"), "the golden baseline manifest");
  const baseline = readBaselineFile(manifest);
  const books = new Map<string, ExpectedBook>();
  for (const record of baseline.books) {
    const folder = refuseInsideGit(join(safeDir, folderOf(record.book)), `the golden baseline folder for ${record.book}`);
    const modelsFile = refuseInsideGit(join(folder, "models.json"), `the models file for ${record.book}`);
    const rawModels = readJson(modelsFile);
    if (!Array.isArray(rawModels)) throw new Error(`${modelsFile} must be a JSON list of page models.`);
    const models = rawModels as PageModel[];
    const images = record.pages.map((_, i) => {
      const pageFile = refuseInsideGit(join(folder, `page-${i + 1}.png`), `the baseline image for ${record.book} page ${i + 1}`);
      return new Uint8Array(readFileSync(pageFile));
    });
    const expected: ExpectedBook = { record, models, images };
    assertExpectedConsistent(expected);
    books.set(record.book, expected);
  }
  return { renderer: baseline.renderer, books };
}

/** Writes, for each changed page whose expected image is known, the expected and new images and their difference. Never inside a git repository. */
export function writeDifferenceImages(dir: string, comparisons: readonly GoldenComparison[], expected: ReadonlyMap<string, ExpectedBook>, builds: readonly GoldenBuild[]): string[] {
  const safeDir = refuseInsideGit(dir, "the golden difference folder");
  const plan: { folder: string; file: string; bytes: Uint8Array }[] = [];
  for (const comparison of comparisons) {
    const [was, now] = [expected.get(comparison.book), builds.find((b) => b.book === comparison.book)];
    for (const change of comparison.changes) {
      const [before, after] = [was?.images?.[change.page - 1], now?.pages[change.page - 1]?.image];
      if (!before || !after) continue;
      const folder = refuseInsideGit(join(safeDir, folderOf(comparison.book)), `the golden difference folder for ${comparison.book}`);
      const difference = differenceImage(before, after);
      const files: [string, Uint8Array][] = [[`page-${change.page}-expected.png`, before], [`page-${change.page}-actual.png`, after], ...(difference ? [[`page-${change.page}-difference.png`, difference] as [string, Uint8Array]] : [])];
      for (const [name, bytes] of files) {
        plan.push({ folder, file: refuseInsideGit(join(folder, name), `the difference image ${name}`), bytes });
      }
    }
  }
  const written: string[] = [];
  for (const { folder, file, bytes } of plan) {
    mkdirSync(folder, { recursive: true });
    writeAtomic(file, bytes);
    written.push(file);
  }
  return written;
}
