// The files of golden books. The repository keeps, for each synthetic level, a compact baseline of hashes and model
// outlines (fixtures/golden/<snapshot id>.json) and one accepted list (fixtures/golden/accepted.json). A full baseline,
// with every page model and page image, is written by the command to a folder outside every git repository: it gives the
// exact model paths and the pixel differences. Real levels have only full baselines, outside every repository.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PageModel } from "../contract";
import { refuseInsideGit } from "./git-repo";
import { differenceImage, goldenRecord, readAccepted, readBaseline, type AcceptedChange, type ExpectedBook, type GoldenBaseline, type GoldenBuild, type GoldenComparison } from "./golden";

export const GOLDEN_DIR = "src/lib/workbook-v2/fixtures/golden";
export const acceptedFile = (root: string): string => join(root, GOLDEN_DIR, "accepted.json");
export const committedBaselineFile = (root: string, levelId: string): string => join(root, GOLDEN_DIR, `${levelId}.json`);

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8")) as unknown;
const writeJson = (file: string, value: unknown) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
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
  refuseInsideGit(dir, "the golden baseline folder");
  for (const build of builds) folderOf(build.book);
  mkdirSync(dir, { recursive: true });
  for (const build of builds) {
    const folder = join(dir, folderOf(build.book));
    mkdirSync(folder, { recursive: true });
    writeJson(join(folder, "models.json"), build.pages.map((p) => p.model));
    build.pages.forEach((p, i) => writeFileSync(join(folder, `page-${i + 1}.png`), p.image));
  }
  writeBaselineFile(join(dir, "golden.json"), renderer, builds);
}

/** A full baseline as expected books by name. */
export function readFullBaseline(dir: string): { renderer: string; books: Map<string, ExpectedBook> } {
  const baseline = readBaselineFile(join(dir, "golden.json"));
  const books = new Map<string, ExpectedBook>();
  for (const record of baseline.books) {
    const folder = join(dir, folderOf(record.book));
    const models = readJson(join(folder, "models.json")) as PageModel[];
    const images = record.pages.map((_, i) => new Uint8Array(readFileSync(join(folder, `page-${i + 1}.png`))));
    books.set(record.book, { record, models, images });
  }
  return { renderer: baseline.renderer, books };
}

/** Writes, for each changed page whose expected image is known, the expected and new images and their difference. Never inside a git repository. */
export function writeDifferenceImages(dir: string, comparisons: readonly GoldenComparison[], expected: ReadonlyMap<string, ExpectedBook>, builds: readonly GoldenBuild[]): string[] {
  refuseInsideGit(dir, "the golden difference folder");
  const written: string[] = [];
  for (const comparison of comparisons) {
    const [was, now] = [expected.get(comparison.book), builds.find((b) => b.book === comparison.book)];
    for (const change of comparison.changes) {
      const [before, after] = [was?.images?.[change.page - 1], now?.pages[change.page - 1]?.image];
      if (!before || !after) continue;
      const folder = join(dir, folderOf(comparison.book));
      mkdirSync(folder, { recursive: true });
      const difference = differenceImage(before, after);
      const files: [string, Uint8Array][] = [[`page-${change.page}-expected.png`, before], [`page-${change.page}-actual.png`, after], ...(difference ? [[`page-${change.page}-difference.png`, difference] as [string, Uint8Array]] : [])];
      for (const [name, bytes] of files) {
        writeFileSync(join(folder, name), bytes);
        written.push(join(folder, name));
      }
    }
  }
  return written;
}
