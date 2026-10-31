// Builds scripts/workbook-samples.ts and runs it with the same arguments (#363). See that file for usage.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await build({
  absWorkingDir: root, entryPoints: ["scripts/workbook-samples.ts"], outfile: ".workbook-sample/samples.mjs",
  bundle: true, platform: "node", target: "node22", format: "esm", packages: "external",
});
execFileSync(process.execPath, [resolve(root, ".workbook-sample/samples.mjs"), ...process.argv.slice(2)], { stdio: "inherit" });
