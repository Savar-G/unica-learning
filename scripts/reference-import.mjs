import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = resolve(root, "node_modules/.cache/reference-import/run.mjs");

await build({
  absWorkingDir: root,
  entryPoints: ["scripts/reference-import.ts"],
  outfile: outFile,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
  alias: { "@": resolve(root, "src") },
  logLevel: "warning",
});

const run = spawnSync(process.execPath, [outFile, ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(run.status ?? 1);
