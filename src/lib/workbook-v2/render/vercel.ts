// Draws in a Vercel function with the official pinned Typst program for linux x64. A function that builds books needs the
// staged program in its bundle; no function does yet (UNI-260). Nothing here knows Next.js or the app.
import { chmod, lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { sha256 } from "../hash";
import { RenderError } from "../renderer";
import { installTypst } from "./install";
import { PINS, type Pins } from "./pins";
import { readRegularFile } from "./regular-file";
import { drawingFiles, type RenderAssets } from "./typst";

export const VERCEL_TYPST_TARGET = "x86_64-unknown-linux-musl";

const MODE = 0o755;

/** Posix path relative to the repository root where the build stages the pinned linux x64 Typst binary. */
export function bundledTypstRelPath(version: string = PINS.version, target: string = VERCEL_TYPST_TARGET): string {
  return `.workbook-v2/typst/${version}/${target}/typst`;
}

/** The files that the bundle of a function that builds books must hold (`outputFileTracingIncludes`). */
export function workbookV2TraceFiles(pins: Pins = PINS): readonly string[] {
  return [
    `./${bundledTypstRelPath(pins.version, VERCEL_TYPST_TARGET)}`,
    "./src/lib/workbook-v2/render/page.typ",
    "./src/lib/workbook-v2/render/fonts/**",
    "./THIRD_PARTY_NOTICES.md",
    "./node_modules/qrcode/license",
    "./node_modules/jsqr/LICENSE",
  ];
}

/** The assets inside a function: its bundle can only be read, and only the temp folder can be written. */
export function vercelAssets(root: string, pins: Pins = PINS): RenderAssets {
  return {
    program: join(root, ".workbook-v2", "typst", pins.version, VERCEL_TYPST_TARGET, "typst"),
    target: VERCEL_TYPST_TARGET,
    ...drawingFiles(root),
    copyIfNotExecutable: true,
  };
}

export interface StageTypstInput {
  root: string;
  home: string;
  pins?: Pins;
  download: (url: string) => Promise<Uint8Array>;
}

export interface StageTypstResult {
  path: string;
  bytes: number;
  reused: boolean;
}

/** Makes each folder between the root and the place, and refuses one that is a link or no folder: it can lead outside. */
async function makeFolders(root: string, place: string): Promise<void> {
  let folder = root;
  for (const part of relative(root, place).split(sep)) {
    folder = join(folder, part);
    await mkdir(folder).catch(() => undefined);
    if (!(await lstat(folder)).isDirectory()) throw new RenderError(`${folder} must be a folder.`);
  }
}

/** Downloads (if needed) via `installTypst` and stages the verified linux x64 Typst binary inside the project root. */
export async function stageBundledTypst({ root, home, pins = PINS, download }: StageTypstInput): Promise<StageTypstResult> {
  const pin = pins.targets[VERCEL_TYPST_TARGET];
  if (!pin) throw new RenderError(`The workbook engine has no pinned Typst for ${VERCEL_TYPST_TARGET}.`);
  const dest = vercelAssets(root, pins).program;
  await makeFolders(root, dirname(dest));
  const existing = await readRegularFile(dest);
  if (existing && sha256(existing) === pin.programSha256) {
    await chmod(dest, MODE);
    return { path: dest, bytes: existing.byteLength, reused: true };
  }

  const cached = await installTypst({ home, target: VERCEL_TYPST_TARGET, pins, download });
  const bytes = await readRegularFile(cached);
  if (!bytes || sha256(bytes) !== pin.programSha256) {
    throw new RenderError(`The cached program ${cached} is not the pinned Typst ${pins.version} for ${VERCEL_TYPST_TARGET}.`);
  }

  const work = await mkdtemp(join(dirname(dest), ".stage-"));
  try {
    const temp = join(work, "typst");
    await writeFile(temp, bytes);
    await chmod(temp, MODE);
    await rename(temp, dest);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  return { path: dest, bytes: bytes.byteLength, reused: false };
}
