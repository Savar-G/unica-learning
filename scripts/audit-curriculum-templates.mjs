// Read JSON only. Bundle the trusted TypeScript audit, never source expressions as host code.
import { build } from "esbuild";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "unica-template-audit-"));
try {
  await build({ stdin: { contents: 'export { auditTemplates } from "./src/lib/workbook-curriculum/template-audit"; export { parseStepProgressions } from "./src/lib/workbook-curriculum/step-source"; export { curriculumProblems } from "./src/lib/workbook-curriculum/check"; export { BC_CURRICULUM } from "./src/lib/workbook-curriculum/bc"; export { BC_SKILL_MAP } from "./src/lib/assessment";', resolveDir: root, loader: "ts" }, outfile: join(out, "audit.mjs"), bundle: true, format: "esm", platform: "node", alias: { "@": join(root, "src") } });
  const { auditTemplates, parseStepProgressions, curriculumProblems, BC_CURRICULUM, BC_SKILL_MAP } = await import(pathToFileURL(join(out, "audit.mjs")));
  const source = parseStepProgressions(JSON.parse(readFileSync(process.argv[2] ?? join(root, "data/curriculum/step-progressions-k9.json"), "utf8")));
  const report = { ...auditTemplates(source), importProblems: curriculumProblems({ ...BC_CURRICULUM, steps: source.steps, contexts: source.contexts }, BC_SKILL_MAP) };
  const json = JSON.stringify(report, null, 2) + "\n";
  if (process.argv[3]) writeFileSync(process.argv[3], json);
  else process.stdout.write(json);
  console.error(`${report.templates} templates; ${report.trials} trials; ${report.passedFills} passed; ${report.failedFills} failed; ${report.importProblems.length} import problems`);
  process.exitCode = report.failedFills || report.importProblems.length ? 1 : 0;
} finally { rmSync(out, { recursive: true, force: true }); }
