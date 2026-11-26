// Finds the pinned Typst for tests. In CI the tests that need it always run, so they fail when the install step is gone.
import { existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { sha256 } from "../hash";
import { PINS, type Pins } from "../render/pins";
import { drawingFiles, openRenderer, projectAssets, type RenderAssets } from "../render/typst";
import type { Renderer } from "../renderer";

export type TypstMode = "run" | "skip" | "fail";
export const typstMode = (found: { installed: boolean; ci: boolean }): TypstMode => (found.installed ? "run" : found.ci ? "fail" : "skip");

/** Where the engine's own files and the installed Typst are, for a test that runs in the repository. */
export const testAssets = (): RenderAssets => projectAssets(process.cwd(), homedir(), process.platform, process.arch);

export const testFiles = () => drawingFiles(process.cwd());

function installed(): boolean {
  try {
    return existsSync(testAssets().program);
  } catch {
    return false;
  }
}

/** Whether a test that needs Typst must be skipped on this computer, with the reason printed. */
export function skipTypstTests(): boolean {
  const mode = typstMode({ installed: installed(), ci: Boolean(process.env.CI) });
  if (mode === "skip") console.warn(`Skipped: these tests need Typst ${PINS.version}. Run "npm run typst:install" once.`);
  return mode === "skip";
}

export const fixture = (name: string): string => join(process.cwd(), "src/lib/workbook-v2/fixtures", name);

/**
 * The same with a pinned program in this folder that is a line, which starts the real Typst: the checks of the real one
 * read 45 MB two times for each drawing. For tests that draw many times and do not look at the program.
 */
export function quickAssets(folder: string, assets: RenderAssets = testAssets()): { assets: RenderAssets; pins: Pins } {
  const program = join(folder, "starts-typst.sh");
  const source = `#!/bin/sh\nexec "${assets.program}" "$@"\n`;
  if (!existsSync(program)) writeFileSync(program, source, { mode: 0o755 });
  return { assets: { ...assets, program }, pins: { ...PINS, targets: { ...PINS.targets, [assets.target]: { archiveSha256: "0".repeat(64), programSha256: sha256(source) } } } };
}

export function quickRenderer(folder: string, given?: RenderAssets): Promise<Renderer> {
  const { assets, pins } = quickAssets(folder, given);
  return openRenderer(assets, pins);
}
