// Builds scripts/maya-family-review-cli.ts and runs it with the same arguments. See that file for usage.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await build({
  absWorkingDir: root, entryPoints: ["scripts/maya-family-review-cli.ts"], outfile: "node_modules/.cache/maya-family-review/run.mjs",
  bundle: true, platform: "node", target: "node22", format: "esm", packages: "external", alias: { "@": resolve(root, "src") }, logLevel: "warning",
});
// The exit code of the review (0 or 2) is the exit code of this command.
const run = spawnSync(process.execPath, [resolve(root, "node_modules/.cache/maya-family-review/run.mjs"), ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(run.status ?? 2);
