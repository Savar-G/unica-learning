import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";

await mkdir(".workbook-sample", { recursive: true });
const folder = await mkdtemp(resolve(".workbook-sample/book-marking-coverage-"));
try {
  await build({ entryPoints: ["scripts/scan-marking-book-coverage-cli.ts"], outfile: resolve(folder, "check.mjs"), bundle: true, platform: "node", target: "node22", format: "esm", packages: "external" });
  const result = spawnSync(process.execPath, [resolve(folder, "check.mjs"), ...process.argv.slice(2)], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { await rm(folder, { recursive: true, force: true }); }
