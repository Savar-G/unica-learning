// Builds the Unica Learning design system (src/ds) into dist/ds for design tooling (Claude Design sync).
// JS: ESM bundle with React external. CSS: base + warm look concatenated. Types: tsc declarations.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

rmSync("dist/ds", { recursive: true, force: true });
mkdirSync("dist/ds", { recursive: true });

await build({
  entryPoints: ["src/ds/index.ts"],
  outfile: "dist/ds/index.js",
  bundle: true,
  format: "esm",
  jsx: "automatic",
  target: "es2020",
  external: ["react", "react-dom", "react/jsx-runtime"],
  logLevel: "warning",
});

const css = ["src/ds/styles/base.css", "src/ds/styles/warm.css"].map((f) => `/* ${f} */\n${readFileSync(f, "utf8")}`).join("\n");
writeFileSync("dist/ds/unica-learning.css", css);

execFileSync("npx", ["tsc", "-p", "tsconfig.ds.json"], { stdio: "inherit" });
console.log("built dist/ds");
