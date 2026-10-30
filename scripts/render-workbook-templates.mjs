// Builds scripts/render-workbook-templates.ts and runs it with the same arguments (#310). See that file for usage.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await build({
  absWorkingDir: root, entryPoints: ["scripts/render-workbook-templates.ts"], outfile: ".workbook-sample/render-templates.mjs",
  bundle: true, platform: "node", target: "node22", format: "esm", packages: "external",
});
execFileSync(process.execPath, [resolve(root, ".workbook-sample/render-templates.mjs"), ...process.argv.slice(2)], { stdio: "inherit" });
