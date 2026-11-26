// Bundles a TypeScript script and runs it, so that it can use the modules of src/.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Writes the script and all that it uses as one file. A test that runs a command many times bundles it one time. */
export async function bundleScript(entry, outfile) {
  const { build } = await import("esbuild");
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    alias: { "@": resolve("src") },
    banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
  });
}

/** Runs a script that is one file. An error becomes its message and the exit code 1. */
export async function runBundle(file) {
  await run(() => import(pathToFileURL(file).href));
}

async function run(script) {
  try {
    await script();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

export async function runScript(entry) {
  const dir = await mkdtemp(join(tmpdir(), "unica-script-"));
  try {
    const file = join(dir, "script.mjs");
    await run(async () => {
      await bundleScript(entry, file);
      await import(pathToFileURL(file).href);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
