import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const dir = await mkdtemp(join(tmpdir(), "unica-usage-import-"));
try {
  const file = join(dir, "import.mjs");
  await build({ entryPoints: ["scripts/import-ai-usage.ts"], outfile: file, bundle: true, platform: "node", format: "esm", alias: { "@": resolve("src") } });
  await import(pathToFileURL(file).href);
} catch {
  console.error("Usage receipt import failed. Check the arguments, receipt format, migration and server credentials. No receipt data is printed.");
  process.exitCode = 1;
} finally { await rm(dir, { recursive: true, force: true }); }
