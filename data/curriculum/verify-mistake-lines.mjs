// Run from the repository root. Subscription only, with no API fallback.
// WORKBOOK_CLAUDE_CONFIG_DIR=/Users/savargupta/.claude_second node data/curriculum/verify-mistake-lines.mjs
import { build } from "esbuild";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
mkdirSync(resolve(root, ".workbook-sample"), { recursive: true });
const temporary = mkdtempSync(resolve(root, ".workbook-sample/c2-verify-"));
try {
  const entry = resolve(temporary, "run.mjs");
  await build({ stdin: { contents: 'import { runMistakeVerification } from "./src/lib/workbook-curriculum/mistake-verification-run"; import { runMistakeRecheck } from "./src/lib/workbook-curriculum/mistake-recheck-run"; const args = process.argv.slice(2); if (args.includes("--recheck")) await runMistakeRecheck(args.filter(arg => arg !== "--recheck")); else await runMistakeVerification(args);', resolveDir: root, loader: "ts" }, outfile: entry, bundle: true, platform: "node", target: "node22", format: "esm", packages: "external", alias: { "@": resolve(root, "src") } });
  const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], { cwd: root, env: process.env, stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
  process.exitCode = await new Promise((ok, fail) => { child.once("error", fail); child.once("close", code => ok(code ?? 1)); });
} finally { rmSync(temporary, { recursive: true, force: true }); }
