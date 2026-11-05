// Builds scripts/area-level-check.ts and runs it (#549). See that file for what it reads and prints.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await build({
  absWorkingDir: root, entryPoints: ["scripts/area-level-check.ts"], outfile: "node_modules/.cache/area-level-check/run.mjs",
  bundle: true, platform: "node", target: "node22", format: "esm", packages: "external", alias: { "@": resolve(root, "src") }, logLevel: "warning",
});
execFileSync(process.execPath, [resolve(root, "node_modules/.cache/area-level-check/run.mjs"), ...process.argv.slice(2)], { stdio: "inherit" });
