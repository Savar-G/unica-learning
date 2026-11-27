// npm run workbook:v2:fixture - turns a reported bug into a failing fixture in one command (docs/workbook-v2-golden-replay.md).
//   --name NAME             the file name of the fixture: small letters, digits and dashes
//   --failure TEXT          what is wrong, in words
//   --expect WHAT           what must be true once it is fixed: builds | replays | refused=TEXT | page-text=N:TEXT | no-page-text=N:TEXT
//   --input FILE            a book input: { snapshot, book } or a saved input of format 1, with [--expected FILE] (ReplayExpected)
//   --bundle FOLDER         a replay bundle: FOLDER/input.json and FOLDER/expected.json
//   --workbook UUID         a published book from Supabase (SUPABASE_URL and SUPABASE_SECRET_KEY)
//   --out FOLDER            where the fixture goes (default: src/lib/workbook-v2-publish/bug-fixtures)
//   --renderer fake|typst   the renderer the fixture runs with (default: typst for replays, else fake)
// The fixture is written only when it fails today. Inside a git repository it is written only for an invented book: a
// real family's book (any --workbook of a family) goes to a folder outside every git repository.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { isUuid } from "@/lib/workbook-content";
import type { Renderer } from "@/lib/workbook-v2/renderer";
import { openRenderer, projectAssets } from "@/lib/workbook-v2/render/typst";
import { fakeRenderer } from "@/lib/workbook-v2/testing/fake-renderer";
import { BUG_FIXTURES_DIR, createBugFixture, type BugExpectation } from "@/lib/workbook-v2-publish/bug-fixture";
import type { ReplayExpected } from "@/lib/workbook-v2-publish/replay";
import { storedReplayBundle } from "./workbook-v2-stored-book";

const USAGE = "Usage: npm run workbook:v2:fixture -- --name NAME --failure TEXT --expect builds|replays|refused=TEXT|page-text=N:TEXT|no-page-text=N:TEXT (--input FILE [--expected FILE] | --bundle FOLDER | --workbook UUID) [--out FOLDER] [--renderer fake|typst]";

const readJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, "utf8")) as unknown;

function expectation(text: string): BugExpectation {
  if (text === "builds" || text === "replays") return { kind: text };
  const refused = /^refused=(.+)$/s.exec(text);
  if (refused) return { kind: "refused", problem: refused[1] };
  const page = /^(no-)?page-text=(\d+):(.+)$/s.exec(text);
  if (page) return { kind: "page-text", page: Number(page[2]), text: page[3], present: page[1] === undefined };
  throw new Error(USAGE);
}

async function source(values: Record<string, string | undefined>): Promise<{ input: unknown; expected?: ReplayExpected }> {
  const modes = ["input", "bundle", "workbook"].filter((m) => values[m] !== undefined);
  if (modes.length !== 1) throw new Error(USAGE);
  if (values.workbook !== undefined) {
    if (!isUuid(values.workbook)) throw new Error(USAGE);
    const { saved, expected } = await storedReplayBundle(values.workbook);
    return { input: saved, expected };
  }
  if (values.bundle !== undefined) return { input: await readJson(join(values.bundle, "input.json")), expected: (await readJson(join(values.bundle, "expected.json"))) as ReplayExpected };
  return { input: await readJson(values.input!), ...(values.expected === undefined ? {} : { expected: (await readJson(values.expected)) as ReplayExpected }) };
}

async function rendererOf(name: string): Promise<Renderer> {
  if (name === "fake") return fakeRenderer();
  if (name === "typst") return openRenderer(projectAssets(process.cwd(), homedir(), process.platform, process.arch));
  throw new Error(USAGE);
}

async function main(): Promise<void> {
  const text = { type: "string" } as const;
  let values: Record<string, string | undefined>;
  try {
    values = parseArgs({ args: process.argv.slice(2), options: { name: text, failure: text, expect: text, input: text, expected: text, bundle: text, workbook: text, out: text, renderer: text } }).values;
  } catch {
    throw new Error(USAGE);
  }
  if (!values.name || !values.failure || !values.expect) throw new Error(USAGE);
  const expect = expectation(values.expect);
  const { input, expected } = await source(values);
  const rendererName = values.renderer ?? (expect.kind === "replays" ? "typst" : "fake");
  if (rendererName !== "fake" && rendererName !== "typst") throw new Error(USAGE);
  const outDir = values.out ?? join(process.cwd(), BUG_FIXTURES_DIR);
  const { file, actual } = await createBugFixture(
    { name: values.name, failure: values.failure, expect, input, ...(expected ? { expected } : {}), renderer: rendererName, outDir },
    await rendererOf(rendererName),
  );
  console.log(`Wrote ${file}. It fails today: ${actual}. Run: npx vitest run src/lib/workbook-v2-publish/bug-fixture.test.ts -t "${values.name}"`);
}

await main();
