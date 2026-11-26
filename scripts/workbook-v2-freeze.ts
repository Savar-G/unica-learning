// npm run workbook:v2:freeze - freezes a draft of a level into a snapshot file (docs/workbook-v2-engine.md).
import { lstat, link, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { freezeBank } from "@/lib/workbook-v2/build/freeze-bank";
import { canonicalJson, sha256 } from "@/lib/workbook-v2/hash";
import { openRenderer, projectAssets } from "@/lib/workbook-v2/render/typst";

const USAGE = "Usage: npm run workbook:v2:freeze -- --draft FILE --out FILE";

function readArgs(args: string[]): { draft: string; out: string } {
  const text = { type: "string", multiple: true } as const;
  try {
    const { values } = parseArgs({ args, options: { draft: text, out: text } });
    const one = (list: string[] | undefined) => {
      if (list?.length !== 1 || list[0] === "") throw new Error(USAGE);
      return list[0];
    };
    return { draft: one(values.draft), out: one(values.out) };
  } catch {
    throw new Error(USAGE);
  }
}

/** A snapshot never replaces another one: books name it by its hash. This look saves the work of a freeze; `publish` decides. */
async function checkFree(file: string): Promise<void> {
  const there = await lstat(file).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
  if (there) throw new Error(`The file ${file} is there already.`);
}

/**
 * Writes the snapshot beside the file and links it to the name of the file in one step. A link is refused when the name
 * is taken, so of two processes one wins, and a reader never sees a part of a file.
 */
async function publish(out: string, text: string): Promise<void> {
  const file = resolve(out);
  const staging = await mkdtemp(join(dirname(file), ".workbook-v2-freeze-"));
  try {
    const whole = join(staging, "snapshot.json");
    await writeFile(whole, text, { flag: "wx" });
    await link(whole, file).catch((error: NodeJS.ErrnoException) => {
      throw error.code === "EEXIST" ? new Error(`The file ${out} is there already.`) : error;
    });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

const args = readArgs(process.argv.slice(2));
await checkFree(args.out);
const source = await readFile(args.draft, "utf8");
const draft = ((): unknown => {
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`${args.draft} is not JSON.`);
  }
})();
const renderer = await openRenderer(projectAssets(process.cwd(), homedir(), process.platform, process.arch));
const started = performance.now();
const result = await freezeBank(draft, renderer);
if (!result.ok) throw new Error([...result.problems, `${result.problems.length} ${result.problems.length === 1 ? "problem" : "problems"}. Nothing was written.`].join("\n"));
await publish(args.out, `${JSON.stringify(result.snapshot, null, 2)}\n`);
// The file is read back: what a book will read is the snapshot that was checked.
const written = sha256(canonicalJson(JSON.parse(await readFile(args.out, "utf8"))));
if (written !== result.hash) throw new Error(`The file ${args.out} does not hold the snapshot that was checked: its hash is ${written} and must be ${result.hash}.`);
const rows = result.capacity.reduce((sum, sheet) => sum + sheet.rows.length, 0);
console.log(`Frozen ${result.capacity.length} sheets and ${rows} rows in ${((performance.now() - started) / 1000).toFixed(1)} s: ${args.out}, SHA-256 ${result.hash}.`);
for (const sheet of result.capacity) console.log(`Sheet "${sheet.sheet}": ${sheet.attemptsWithoutRepeat} ${sheet.attemptsWithoutRepeat === 1 ? "attempt" : "attempts"} before a row repeats a question.`);
for (const warning of result.capacity.flatMap((sheet) => sheet.warnings)) console.log(`Warning: ${warning}`);
