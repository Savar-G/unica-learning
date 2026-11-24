// npm run workbook:v2 - builds one book offline from a bank snapshot file (docs/workbook-v2-engine.md).
import { mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildBook, type BuiltBook } from "@/lib/workbook-v2/build/build-book";
import { openRenderer, projectAssets } from "@/lib/workbook-v2/render/typst";

const USAGE = "Usage: npm run workbook:v2 -- --snapshot FILE --book FILE --out FOLDER";

interface Args { snapshot: string; book: string; out: string }

function readArgs(args: string[]): Args {
  const text = { type: "string", multiple: true } as const;
  try {
    const { values } = parseArgs({ args, options: { snapshot: text, book: text, out: text } });
    const one = (list: string[] | undefined) => {
      if (list?.length !== 1 || list[0] === "") throw new Error(USAGE);
      return list[0];
    };
    return { snapshot: one(values.snapshot), book: one(values.book), out: one(values.out) };
  } catch {
    throw new Error(USAGE);
  }
}

async function readJson(file: string): Promise<unknown> {
  const text = await readFile(file, "utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${file} is not JSON.`);
  }
}

/** What the system says about a place that cannot become the folder of a book. Any other error stays as it is. */
function placeError(error: unknown, folder: string): unknown {
  const code = error instanceof Error && "code" in error ? error.code : null;
  if (code === "ENOTEMPTY" || code === "EEXIST") return new Error(`The folder ${folder} is not empty.`);
  return code === "ENOTDIR" ? new Error(`${folder} is not a folder.`) : error;
}

/** An older page in the folder could be taken for a page of this book. This look saves the work of a build; `publish` decides. */
async function checkEmpty(folder: string): Promise<void> {
  const files = await readdir(folder).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw placeError(error, folder);
  });
  if (files.length > 0) throw new Error(`The folder ${folder} is not empty.`);
}

function filesOf(book: BuiltBook): [string, string | Uint8Array][] {
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  return [
    ["book.pdf", book.pdf],
    ...book.pages.map((p, i): [string, Uint8Array] => [`page-${i + 1}.png`, p.image]),
    ["pages.json", json(book.pages.map((p) => p.model))],
    ["positions.json", json(book.positions)],
    ["answers.json", json(book.items)],
    ["record.json", json(book.record)],
  ];
}

/**
 * Writes the whole book beside the folder, on the same disk, and gives it the name of the folder in one step. The system
 * refuses that step when the folder holds something, so of two processes one wins and a reader never sees a part.
 */
async function publish(out: string, book: BuiltBook): Promise<void> {
  const folder = await realpath(out).catch(() => resolve(out));
  await mkdir(dirname(folder), { recursive: true });
  const staging = await mkdtemp(join(dirname(folder), ".workbook-v2-"));
  try {
    const whole = join(staging, "book");
    await mkdir(whole);
    for (const [name, content] of filesOf(book)) await writeFile(join(whole, name), content);
    await rename(whole, folder).catch((error: unknown) => {
      throw placeError(error, out);
    });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

const args = readArgs(process.argv.slice(2));
const input = { snapshot: await readJson(args.snapshot), book: await readJson(args.book) };
await checkEmpty(args.out);
const renderer = await openRenderer(projectAssets(process.cwd(), homedir(), process.platform, process.arch));
const result = await buildBook(input, renderer);
if (result.status === "failed") throw new Error(result.problems.join("\n"));
await publish(args.out, result);
console.log(`Built ${result.pages.length} pages, ${result.items.length} questions: ${args.out}`);
