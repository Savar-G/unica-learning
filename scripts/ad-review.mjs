// Builds scripts/ad-review.ts and runs it with the same arguments (weekly ad review). See that file for usage.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await build({
  absWorkingDir: root, entryPoints: ["scripts/ad-review.ts"], outfile: "node_modules/.cache/ad-review/run.mjs",
  bundle: true, platform: "node", target: "node22", format: "esm", packages: "external", alias: { "@": resolve(root, "src") }, logLevel: "warning",
});
const child = spawnSync(process.execPath, [resolve(root, "node_modules/.cache/ad-review/run.mjs"), ...process.argv.slice(2)], { stdio: "inherit" });
process.exitCode = child.status ?? 1;
