// npm run workbook:v2:fingerprints - records fingerprints for new shape versions and refuses to alter existing ones.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { shapeLibrary, SHAPES, type ShapeLibrary } from "@/lib/workbook-v2/shapes";
import { isRecord } from "@/lib/workbook-v2/shapes/shape";
import { addShapeFingerprints, fingerprintFileName, fingerprintFileText, FINGERPRINTS_DIR, type ShapeFingerprints } from "@/lib/workbook-v2/testing/shape-fingerprints";
import { SHAPE_REGISTRATIONS } from "@/lib/workbook-v2/testing/shape-registrations";

const USAGE = "Usage: npm run workbook:v2:fingerprints [-- --dir FOLDER] [--shape ID]";

function readArgs(args: string[]): { dir: string; shapes: ShapeLibrary } {
  try {
    const { values } = parseArgs({ args, options: { dir: { type: "string", multiple: true }, shape: { type: "string", multiple: true } } });
    const [dirs, ids] = [values.dir ?? [FINGERPRINTS_DIR], values.shape ?? [...SHAPES.keys()]];
    const shapes = shapeLibrary(ids.map((id) => SHAPES.get(id)).filter((shape) => shape !== undefined));
    if (dirs.length !== 1 || dirs[0] === "" || shapes.size !== ids.length) throw new Error(USAGE);
    return { dir: resolve(dirs[0]), shapes };
  } catch {
    throw new Error(USAGE);
  }
}

async function readExisting(dir: string): Promise<ShapeFingerprints> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
  const merged: ShapeFingerprints = {};
  for (const file of files) {
    const parsed: unknown = JSON.parse(await readFile(join(dir, file), "utf8"));
    if (!isRecord(parsed)) throw new Error(`${file} must hold an object`);
    const ids = Object.keys(parsed);
    if (ids.length !== 1) throw new Error(`${file} must hold exactly one shape`);
    const [id] = ids;
    if (fingerprintFileName(id) !== file) throw new Error(`${file} holds "${id}" and must be named "${fingerprintFileName(id)}"`);
    merged[id] = parsed[id] as Record<string, string>;
  }
  return merged;
}

const { dir, shapes } = readArgs(process.argv.slice(2));
const existing = await readExisting(dir);
const result = addShapeFingerprints(shapes, SHAPE_REGISTRATIONS.filter((r) => shapes.has(r.id)), existing);
if (!result.ok) throw new Error(result.problems.join("\n"));
if (result.added.length === 0) {
  console.log(`Fingerprints are up to date: ${dir}`);
} else {
  await mkdir(dir, { recursive: true });
  for (const [id, versions] of Object.entries(result.fingerprints)) {
    await writeFile(join(dir, fingerprintFileName(id)), fingerprintFileText(id, versions), "utf8");
  }
  console.log(`Added fingerprints (${result.added.join(", ")}): ${dir}`);
}
