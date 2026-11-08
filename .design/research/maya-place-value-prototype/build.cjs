// Builds and runs render.tsx with esbuild (the same way coverage-offline.ts is run). Run from the repo root.
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const out = process.argv[2];
if (!out) throw new Error("usage: node build.cjs <out dir>");
// The bundle sits in the repo (so react-dom resolves) and is deleted after the run.
const bundle = path.resolve(".place-chart-render.cjs");
require("esbuild").buildSync({
  entryPoints: [path.join(__dirname, "render.tsx")], bundle: true, platform: "node", format: "cjs", outfile: bundle,
  packages: "external", tsconfig: "tsconfig.json", jsx: "automatic", loader: { ".css": "empty" },
  alias: { "server-only": "./node_modules/next/dist/compiled/server-only/empty.js" },
});
try {
  execFileSync("node", [bundle, out], { stdio: "inherit" });
} finally {
  require("node:fs").rmSync(bundle, { force: true });
}
