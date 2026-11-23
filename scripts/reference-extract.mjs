import { build } from "esbuild";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheBase = join(root, "node_modules", ".cache");
await mkdir(cacheBase, { recursive: true });
const dir = await mkdtemp(join(cacheBase, "unica-reference-extract-"));
try {
  const file = join(dir, "reference-extract.mjs");
  await build({
    absWorkingDir: root,
    entryPoints: ["scripts/reference-extract.ts"],
    outfile: file,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    alias: { "@": resolve(root, "src") },
  });
  await import(pathToFileURL(file).href);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
