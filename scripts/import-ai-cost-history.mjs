import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const dir = await mkdtemp(join(tmpdir(), "unica-history-import-"));
try {
  const file = join(dir, "import.mjs");
  await build({ entryPoints: ["scripts/import-ai-cost-history.ts"], outfile: file, bundle: true, platform: "node", format: "esm", logLevel: "silent" });
  await import(pathToFileURL(file).href);
} catch {
  console.error("Historical export validation or import failed. No success is claimed. Check the private package and migration. Retry the unchanged package after an interrupted import. No source or response data is printed.");
  process.exitCode = 1;
} finally { await rm(dir, { recursive: true, force: true }); }
