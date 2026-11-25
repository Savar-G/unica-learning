// Bundles a TypeScript script and runs it, so that it can use the modules of src/.
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function runScript(entry) {
  const dir = await mkdtemp(join(tmpdir(), "unica-script-"));
  try {
    const file = join(dir, "script.mjs");
    await build({
      entryPoints: [entry],
      outfile: file,
      bundle: true,
      platform: "node",
      format: "esm",
      alias: { "@": resolve("src") },
      banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
    });
    await import(pathToFileURL(file).href);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
