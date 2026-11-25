// Finds the pinned Typst for tests. In CI the tests that need it always run, so they fail when the install step is gone.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PINS } from "../render/pins";
import { drawingFiles, projectAssets, type RenderAssets } from "../render/typst";

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
