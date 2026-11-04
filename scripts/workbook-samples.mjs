// Builds scripts/workbook-samples.ts and runs it with the same arguments (#363). See that file for usage.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(resolve(root, ".workbook-sample"), { recursive: true });
const run = await mkdtemp(resolve(root, ".workbook-sample/run-"));
try {
await build({
  absWorkingDir: root, entryPoints: ["scripts/workbook-samples.ts"], outfile: resolve(run, "samples.mjs"),
  bundle: true, platform: "node", target: "node22", format: "esm", packages: "external",
  plugins: [{ name: "sample-browser", setup(builder) {
    builder.onResolve({ filter: /^puppeteer-core$/ }, args => args.importer.endsWith("/src/lib/print-engine-chromium.ts")
      ? { path: resolve(root, "scripts/workbook-sample-browser.ts") } : undefined);
  } }],
});
const child = spawnSync(process.execPath, [resolve(run, "samples.mjs"), ...process.argv.slice(2)], { stdio: "inherit" });
if (child.error) throw child.error;
process.exitCode = child.status ?? 1;
} finally { await rm(run, { recursive: true, force: true }); }
