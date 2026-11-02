// Builds scripts/workbook-worker.ts and runs it with the same arguments (D-200). See that file and docs/workbook-worker.md.
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// "server-only" marks modules the browser must never get; this is a server process, so the marker is left empty
// (the package itself throws outside React Server Components).
const serverOnly = {
  name: "server-only",
  setup(b) {
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }));
    b.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" }));
  },
};
await build({
  absWorkingDir: root, entryPoints: ["scripts/workbook-worker.ts"], outfile: ".workbook-worker/worker.mjs",
  bundle: true, platform: "node", target: "node22", format: "esm", packages: "external", plugins: [serverOnly],
});
// A child process, not execFileSync: the worker runs for days, and SIGTERM from launchd must reach it.
const child = spawn(process.execPath, [resolve(root, ".workbook-worker/worker.mjs"), ...process.argv.slice(2)], { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
