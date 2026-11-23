import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const dir = await mkdtemp(join(tmpdir(), "unica-reference-convert-"));
try {
  const file = join(dir, "reference-convert.mjs");
  await build({
    entryPoints: ["scripts/reference-convert.ts"],
    outfile: file,
    bundle: true,
    platform: "node",
    format: "esm",
    alias: { "@": resolve("src") },
  });
  await import(pathToFileURL(file).href);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
