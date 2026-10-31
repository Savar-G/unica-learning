// Builds scripts/maya-demo-child.ts and runs it with the same arguments (#323). See that file for usage.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await build({
  absWorkingDir: root, entryPoints: ["scripts/maya-demo-child.ts"], outfile: "node_modules/.cache/maya-demo-child/run.mjs",
  bundle: true, platform: "node", target: "node22", format: "esm", packages: "external", alias: { "@": resolve(root, "src") }, logLevel: "warning",
});
execFileSync(process.execPath, [resolve(root, "node_modules/.cache/maya-demo-child/run.mjs"), ...process.argv.slice(2)], { stdio: "inherit" });
