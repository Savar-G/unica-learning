import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
await mkdir(".workbook-sample", { recursive: true });
const folder = await mkdtemp(resolve(".workbook-sample/escalation-runner-"));
try {
  await build({ stdin: { contents: 'import { escalationEvalMain } from "./scripts/scan-marking-escalation-eval-cli.ts"; escalationEvalMain().catch(e => { console.error(`Escalation evaluation stopped: ${e.message}`); process.exitCode = 1; });', resolveDir: process.cwd(), sourcefile: "escalation-entry.ts" }, define: { "import.meta.url": '"escalation-evaluation-bundle"' }, outfile: resolve(folder, "runner.mjs"), bundle: true, platform: "node", target: "node22", format: "esm", packages: "external" });
  const child = spawnSync(process.execPath, [resolve(folder, "runner.mjs"), ...process.argv.slice(2)], { stdio: "inherit" });
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
} finally { await rm(folder, { recursive: true, force: true }); }
