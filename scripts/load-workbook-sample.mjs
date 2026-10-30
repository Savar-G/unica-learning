// Builds scripts/load-workbook-sample.ts and runs it with the same arguments (#299). See that file for usage.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await build({
  absWorkingDir: root, entryPoints: ["scripts/load-workbook-sample.ts"], outfile: ".workbook-sample/load.mjs",
  bundle: true, platform: "node", target: "node22", format: "esm", packages: "external",
});
execFileSync(process.execPath, [resolve(root, ".workbook-sample/load.mjs"), ...process.argv.slice(2)], { stdio: "inherit" });
