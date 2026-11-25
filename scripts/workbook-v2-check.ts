// npm run workbook:v2:check - checks every sheet and row of a bank snapshot file (docs/workbook-v2-engine.md).
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import { checkBank } from "@/lib/workbook-v2/build/check-bank";
import { openRenderer, projectAssets } from "@/lib/workbook-v2/render/typst";

const USAGE = "Usage: npm run workbook:v2:check -- --snapshot FILE";

function snapshotFile(args: string[]): string {
  try {
    const { values: { snapshot } } = parseArgs({ args, options: { snapshot: { type: "string", multiple: true } } });
    if (snapshot?.length !== 1 || snapshot[0] === "") throw new Error(USAGE);
    return snapshot[0];
  } catch {
    throw new Error(USAGE);
  }
}

const file = snapshotFile(process.argv.slice(2));
const text = await readFile(file, "utf8");
const snapshot = ((): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${file} is not JSON.`);
  }
})();
const renderer = await openRenderer(projectAssets(process.cwd(), homedir(), process.platform, process.arch));
const started = performance.now();
const { problems, checked } = await checkBank(snapshot, renderer);
if (problems.length > 0) throw new Error([...problems, `${problems.length} ${problems.length === 1 ? "problem" : "problems"}.`].join("\n"));
console.log(`No problem in ${checked.sheets} sheets and ${checked.rows} rows: ${checked.seeds} seeds, ${checked.questions} questions, ${checked.texts} texts, ${checked.pages} full pages and ${checked.alone} questions drawn alone, in ${((performance.now() - started) / 1000).toFixed(1)} s.`);
