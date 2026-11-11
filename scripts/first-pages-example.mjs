// Builds scripts/first-pages-example.ts and runs it with the same arguments. See that file and docs/first-pages.md.
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverOnly = {
  name: "server-only",
  setup(b) {
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }));
    b.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" }));
  },
};
await build({
  absWorkingDir: root, entryPoints: ["scripts/first-pages-example.ts"], outfile: ".first-pages-example/example.mjs",
  bundle: true, platform: "node", target: "node22", format: "esm", packages: "external", plugins: [serverOnly],
});
const child = spawn(process.execPath, [resolve(root, ".first-pages-example/example.mjs"), ...process.argv.slice(2)], { stdio: "inherit" });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
