import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
await mkdir(".workbook-sample", { recursive: true });
const dir = await mkdtemp(resolve(".workbook-sample/gate-set-"));
try {
  await build({ entryPoints: ["scripts/workbook-gate-set-cli.ts"], outfile: resolve(dir, "runner.mjs"), bundle: true, platform: "node", target: "node22", format: "esm", packages: "external", logLevel: "warning" });
  const child = spawnSync(process.execPath, [resolve(dir, "runner.mjs"), ...process.argv.slice(2)], { stdio: "inherit" });
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
