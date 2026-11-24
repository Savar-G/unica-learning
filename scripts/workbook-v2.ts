// npm run workbook:v2 - builds one book offline from a bank snapshot file (docs/workbook-v2-engine.md).
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
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

/** An older page in the folder could be taken for a page of this book. */
async function checkEmpty(folder: string): Promise<void> {
  const files = await readdir(folder).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  if (files.length > 0) throw new Error(`The folder ${folder} is not empty.`);
}

async function write(folder: string, book: BuiltBook): Promise<void> {
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  await mkdir(folder, { recursive: true });
  const files: [string, string | Uint8Array][] = [
    ["book.pdf", book.pdf],
    ...book.pages.map((p, i): [string, Uint8Array] => [`page-${i + 1}.png`, p.image]),
    ["pages.json", json(book.pages.map((p) => p.model))],
    ["positions.json", json(book.positions)],
    ["answers.json", json(book.items)],
    ["record.json", json(book.record)],
  ];
  for (const [name, content] of files) await writeFile(join(folder, name), content);
}

const args = readArgs(process.argv.slice(2));
const input = { snapshot: await readJson(args.snapshot), book: await readJson(args.book) };
await checkEmpty(args.out);
const renderer = await openRenderer(projectAssets(process.cwd(), homedir(), process.platform, process.arch));
const result = await buildBook(input, renderer);
if (result.status === "failed") throw new Error(result.problems.join("\n"));
await write(args.out, result);
console.log(`Built ${result.pages.length} pages, ${result.items.length} questions: ${args.out}`);
