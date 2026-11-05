// Builds scripts/scan-photo-set.ts and runs it with the same arguments (#537). See that file for usage.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(resolve(root, ".workbook-sample"), { recursive: true });
const run = await mkdtemp(resolve(root, ".workbook-sample/scan-photo-set-"));
try {
  await build({
    absWorkingDir: root, entryPoints: ["scripts/scan-photo-set.ts"], outfile: resolve(run, "scan-photo-set.mjs"),
    bundle: true, platform: "node", target: "node22", format: "esm", packages: "external",
  });
  const child = spawnSync(process.execPath, [resolve(run, "scan-photo-set.mjs"), ...process.argv.slice(2)], { stdio: "inherit", cwd: root });
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
} finally { await rm(run, { recursive: true, force: true }); }
