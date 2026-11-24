// Vercel Node function support for W1 (the official pinned linux x64 Typst program). Lives in render/ so the pure
// engine imports nothing from Next.js or the app, and uses no process globals.
import { access, chmod, constants, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { sha256 } from "../hash";
import { RenderError } from "../renderer";
import { installTypst } from "./install";
import { PINS, type Pins } from "./pins";
import { drawingFiles, type RenderAssets } from "./typst";

export const VERCEL_TYPST_TARGET = "x86_64-unknown-linux-musl";

const MODE = 0o755;

export interface WorkbookV2Route {
  route: string;
  scope: "preview" | "production";
}

/** Routes that build v2 workbooks inside a Vercel function. Empty until a production route lands (UNI-260). */
export const WORKBOOK_V2_ROUTES: readonly WorkbookV2Route[] = [];

/** Posix path relative to the repository root where the build stages the pinned linux x64 Typst binary. */
export function bundledTypstRelPath(version: string = PINS.version, target: string = VERCEL_TYPST_TARGET): string {
  return `.workbook-v2/typst/${version}/${target}/typst`;
}

/** Files traced into every Vercel function that builds v2 workbooks by W1. */
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

/** Route-scoped `outputFileTracingIncludes` entries for Next.js. Returns `{}` when no route builds v2 books. */
export function workbookV2TracingIncludes(routes: readonly string[], pins: Pins = PINS): Record<string, string[]> {
  if (routes.length === 0) return {};
  const files = [...workbookV2TraceFiles(pins)];
  return Object.fromEntries(routes.map((route) => [route.replace(/[[\]]/g, "\\$&"), [...files]]));
}

/** Assets for running W1 inside a Vercel linux x64 Node function (read-only bundle, writable temp folder). */
export function vercelAssets(root: string, pins: Pins = PINS): RenderAssets {
  return {
    program: join(root, ".workbook-v2", "typst", pins.version, VERCEL_TYPST_TARGET, "typst"),
    target: VERCEL_TYPST_TARGET,
    ...drawingFiles(root),
    copyIfNotExecutable: true,
  };
}

export type StagePlan =
  | { action: "skip"; reason: string }
  | { action: "stage"; required: boolean; reason: string };

/** Decides whether a build should stage linux x64 Typst and whether a failed download may fail the build. */
export function planTypstStage(input: { routes: readonly WorkbookV2Route[]; vercelEnv?: string; force?: boolean }): StagePlan {
  const { routes, vercelEnv, force = false } = input;
  const needsProd = routes.some((r) => r.scope === "production");
  const needsAny = routes.length > 0;

  if (vercelEnv === "production") {
    if (needsProd) return { action: "stage", required: true, reason: "A production route builds v2 workbooks." };
    if (force) return { action: "stage", required: false, reason: "Forced while no production route builds v2 workbooks." };
    return { action: "skip", reason: "No production route builds v2 workbooks." };
  }
  if (vercelEnv === "preview") {
    if (needsAny) return { action: "stage", required: true, reason: "A route on this preview builds v2 workbooks." };
    if (force) return { action: "stage", required: false, reason: "Forced on a preview with no v2 workbook route." };
    return { action: "skip", reason: "No route on this preview builds v2 workbooks." };
  }
  if (force) return { action: "stage", required: true, reason: "Requested explicitly." };
  if (needsAny) return { action: "stage", required: false, reason: "A route builds v2 workbooks in this checkout." };
  return { action: "skip", reason: "No route builds v2 workbooks." };
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

/** Downloads (if needed) via `installTypst` and stages the verified linux x64 Typst binary inside the project root. */
export async function stageBundledTypst({ root, home, pins = PINS, download }: StageTypstInput): Promise<StageTypstResult> {
  const pin = pins.targets[VERCEL_TYPST_TARGET];
  if (!pin) throw new RenderError(`The workbook engine has no pinned Typst for ${VERCEL_TYPST_TARGET}.`);
  const dest = vercelAssets(root, pins).program;
  const existing = await readFile(dest).catch(() => null);
  if (existing && sha256(existing) === pin.programSha256) {
    await access(dest, constants.X_OK).catch(() => chmod(dest, MODE));
    return { path: dest, bytes: existing.byteLength, reused: true };
  }

  const cached = await installTypst({ home, target: VERCEL_TYPST_TARGET, pins, download });
  const bytes = await readFile(cached);
  if (sha256(bytes) !== pin.programSha256) {
    throw new RenderError(`The cached program ${cached} is not the pinned Typst ${pins.version} for ${VERCEL_TYPST_TARGET}.`);
  }

  const place = dirname(dest);
  await mkdir(place, { recursive: true });
  const work = await mkdtemp(join(place, ".stage-"));
  try {
    const temp = join(work, "typst");
    await writeFile(temp, bytes, { mode: MODE });
    await chmod(temp, MODE);
    await rename(temp, dest);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  return { path: dest, bytes: bytes.byteLength, reused: false };
}

export type StageOutcome =
  | { status: "skipped"; reason: string }
  | { status: "staged"; result: StageTypstResult }
  | { status: "warned"; message: string };

/** Runs a staging plan, turning download errors into warnings when `required` is false. */
export async function runTypstStage(input: { plan: StagePlan; stage: () => Promise<StageTypstResult> }): Promise<StageOutcome> {
  if (input.plan.action === "skip") return { status: "skipped", reason: input.plan.reason };
  try {
    return { status: "staged", result: await input.stage() };
  } catch (error) {
    if (input.plan.required) throw error;
    return { status: "warned", message: error instanceof Error ? error.message : String(error) };
  }
}
