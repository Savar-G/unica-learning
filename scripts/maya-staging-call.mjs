// Builds scripts/maya-staging-call.ts and runs it with the same arguments (#1137). See that file for usage.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = "node_modules/.cache/maya-staging-call/run.mjs";
await build({
  absWorkingDir: root, entryPoints: ["scripts/maya-staging-call.ts"], outfile: out,
  bundle: true, platform: "node", target: "node22", format: "esm", packages: "external",
  alias: { "@": resolve(root, "src") }, logLevel: "warning",
});
execFileSync(process.execPath, ["--conditions=react-server", resolve(root, out), ...process.argv.slice(2)], { stdio: "inherit" });
