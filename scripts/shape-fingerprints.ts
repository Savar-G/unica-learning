// npm run workbook:v2:fingerprints - records fingerprints for new shape versions and refuses to alter existing ones.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { SHAPES } from "@/lib/workbook-v2/shapes";
import { addShapeFingerprints } from "@/lib/workbook-v2/testing/shape-fingerprints";
import { SHAPE_REGISTRATIONS } from "@/lib/workbook-v2/testing/shape-registrations";

const DEFAULT_FILE = "src/lib/workbook-v2/testing/shape-fingerprints.json";
const USAGE = "Usage: npm run workbook:v2:fingerprints [-- --file PATH]";

function readFileArg(args: string[]): string {
  try {
    const { values } = parseArgs({ args, options: { file: { type: "string", multiple: true } } });
    if (!values.file) return resolve(DEFAULT_FILE);
    if (values.file.length !== 1 || values.file[0] === "") throw new Error(USAGE);
    return resolve(values.file[0]);
  } catch {
    throw new Error(USAGE);
  }
}

async function readExisting(file: string): Promise<unknown> {
  try {
    const text = await readFile(file, "utf8");
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
}

const file = readFileArg(process.argv.slice(2));
const existing = await readExisting(file);
const result = addShapeFingerprints(SHAPES, SHAPE_REGISTRATIONS, existing);
if (!result.ok) throw new Error(result.problems.join("\n"));
if (result.added.length === 0) {
  console.log(`Fingerprints are up to date: ${file}`);
} else {
  await writeFile(file, `${JSON.stringify(result.fingerprints, null, 2)}\n`, "utf8");
  console.log(`Added fingerprints (${result.added.join(", ")}): ${file}`);
}
