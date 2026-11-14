// Builds scripts/workbook-page-gate-set-cli.ts and runs it with the same arguments (#859). See that file for usage.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(resolve(root, ".workbook-sample"), { recursive: true });
const dir = await mkdtemp(resolve(root, ".workbook-sample/page-gate-set-"));
try {
  await build({
    absWorkingDir: root, entryPoints: ["scripts/workbook-page-gate-set-cli.ts"], outfile: resolve(dir, "runner.mjs"),
    bundle: true, platform: "node", target: "node22", format: "esm", packages: "external", logLevel: "warning",
    // (The same browser as the sample tool: the print engine's puppeteer-core, through the local Chrome.)
    plugins: [{ name: "sample-browser", setup(builder) {
      builder.onResolve({ filter: /^puppeteer-core$/ }, (args) => args.importer.endsWith("/src/lib/print-engine-chromium.ts")
        ? { path: resolve(root, "scripts/workbook-sample-browser.ts") } : undefined);
    } }],
  });
  const child = spawnSync(process.execPath, [resolve(dir, "runner.mjs"), ...process.argv.slice(2)], { stdio: "inherit", cwd: root });
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
