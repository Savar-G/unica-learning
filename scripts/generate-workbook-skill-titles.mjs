// Offline title authoring on Savar's Claude subscription. Never imported by the site.
// node scripts/generate-workbook-skill-titles.mjs [--check] [--fresh]
// --check reads the committed data and writes the review list without calling Claude.
// Default: resume matching batches from /tmp/ui-review/skill-title-generation.json.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = "/tmp/ui-review";
mkdirSync(out, { recursive: true });
mkdirSync(join(root, ".workbook-sample"), { recursive: true });
const bundle = join(root, ".workbook-sample/skill-title-source.mjs");
await build({
  stdin: { contents: `export { BC_SKILL_MAP } from './src/lib/assessment/skill-map';
    export { BC_CURRICULUM } from './src/lib/workbook-curriculum';
    export { titleProblem } from './src/lib/workbook-title-rules';
    export { skillTitleProblems } from './src/lib/workbook-skill-title-check';`, resolveDir: root },
  outfile: bundle, bundle: true, platform: "node", format: "esm", alias: { "@": join(root, "src") },
});
const { BC_SKILL_MAP, BC_CURRICULUM, skillTitleProblems, titleProblem } = await import(pathToFileURL(bundle));
const file = join(root, "src/lib/workbook-skill-titles.ts");
const cacheFile = join(out, "skill-title-generation.json");
const cache = !process.argv.includes("--fresh") && existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};
const SYSTEM = `Write short workbook page titles for children, Kindergarten to grade 9 in Canada.
Each title names what the child learns in that skill, across all its questions. At most 4 words, in sentence case.
Use plain everyday child language. Curriculum math words are allowed. Name the skill, not a tool, unless the tool
is the skill (a ten-frame skill may name ten-frames). No "in all", "altogether", "total", "left over".
Every skill in a unit must have a different title. Preserve the distinction between its skills. Use numerals for
limits, such as "Less than 5", and keep titles short enough for one line (688 px wide, Geist Light 36 px).
Keep ranges accurate: "up to 10" is not "exactly 10". Cover all benchmarks named by a skill. Making an amount with
coins and bills is not earning money. Distinguish powers of ten from arbitrary multiples of ten.
Use sentence case, no punctuation at the end. Do not use title case. Flag any title whose meaning you are unsure of
with a short reason in review; otherwise review is an empty string. Return exactly one row per supplied skill id.
Use only the supplied curriculum data. Do not read files or use tools.`;
const schema = {
  type: "object", additionalProperties: false, required: ["titles"], properties: {
    titles: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["id", "title", "review"], properties: { id: { type: "string" }, title: { type: "string" }, review: { type: "string" } } } },
  },
};

function callClaude(prompt, wantedIds) {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: "/Users/savargupta/.claude_second" };
  delete env.ANTHROPIC_API_KEY;
  const run = spawnSync("claude", ["-p", "--output-format", "json", "--json-schema", JSON.stringify(schema),
    "--safe-mode", "--tools", "", "--no-session-persistence", "--model", "sonnet", "--effort", "high",
    "--system-prompt", SYSTEM], { input: prompt, env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 15 * 60 * 1000 });
  if (run.error || run.status !== 0) throw new Error(`Claude failed: ${run.error?.message ?? run.stderr ?? run.status}`);
  const result = JSON.parse(run.stdout);
  if (result.is_error || result.api_error) throw new Error(`Claude failed: ${result.result ?? result.api_error}`);
  const answer = result.structured_output ?? JSON.parse(result.result.slice(result.result.indexOf("{"), result.result.lastIndexOf("}") + 1));
  const wanted = new Set(wantedIds);
  if (!Array.isArray(answer.titles) || answer.titles.length !== wanted.size) throw new Error("Claude returned an incomplete batch");
  for (const row of answer.titles) {
    if (!wanted.delete(row.id) || typeof row.title !== "string" || typeof row.review !== "string") throw new Error("Claude returned a bad or duplicate row");
  }
  return { rows: answer.titles, model: Object.keys(result.modelUsage ?? {}), config: env.CLAUDE_CONFIG_DIR };
}

function batchProblems(batch, rows) {
  const titles = Object.fromEntries(rows.map((r) => [r.id, r.title]));
  const problems = [];
  for (const unit of batch) {
    const seen = new Set();
    for (const skill of unit.skills) {
      const title = titles[skill.id];
      const problem = typeof title === "string" ? titleProblem(title) : "missing title";
      if (problem) problems.push(`${skill.id}: ${problem}`);
      if (seen.has(title?.toLowerCase())) problems.push(`${skill.id}: duplicate title in unit ${unit.unit}`);
      seen.add(title?.toLowerCase());
    }
  }
  return problems;
}
const units = BC_SKILL_MAP.standards.map((unit) => ({
  unit: unit.code, grade: unit.grade, name: unit.text,
  skills: unit.skills.map((skill) => ({ id: skill.id, name: skill.text,
    curriculum: BC_CURRICULUM.skills.find((s) => s.id === skill.id),
    steps: BC_CURRICULUM.steps.filter((s) => s.skill === skill.id).map((s) => ({ name: s.name, rules: s.rules })),
  })),
}));
const batches = [];
for (const unit of units) {
  if (!batches.length || batches.at(-1).reduce((n, u) => n + u.skills.length, 0) + unit.skills.length > 40) batches.push([]);
  batches.at(-1).push(unit);
}
let rows = [];
if (process.argv.includes("--check")) {
  const dataBundle = join(root, ".workbook-sample/skill-title-data.mjs");
  await build({ entryPoints: [file], outfile: dataBundle, bundle: true, platform: "node", format: "esm" });
  const data = await import(pathToFileURL(dataBundle));
  rows = Object.entries(data.SKILL_TITLES).map(([id, title]) => ({ id, title, review: data.SKILL_TITLE_REVIEWS[id] ?? "" }));
} else {
  for (const [i, batch] of batches.entries()) {
    const prompt = JSON.stringify(batch);
    const hash = createHash("sha256").update(SYSTEM + prompt + JSON.stringify(schema)).digest("hex");
    const ids = batch.flatMap((u) => u.skills.map((s) => s.id));
    if (!cache[hash]) {
      console.log(`Writing batch ${i + 1}/${batches.length}: ${batch.reduce((n, u) => n + u.skills.length, 0)} skills`);
      cache[hash] = callClaude(prompt, ids);
      writeFileSync(cacheFile, JSON.stringify(cache, null, 2) + "\n");
    } else console.log(`Using saved batch ${i + 1}/${batches.length}`);
    let problems = batchProblems(batch, cache[hash].rows);
    for (let attempt = 0; problems.length && attempt < 3; attempt++) {
      console.log(`Correcting batch ${i + 1}: ${problems.length} title rule failures`);
      cache[hash] = callClaude(`${prompt}\n\nPrevious titles: ${JSON.stringify(cache[hash].rows)}\n`
        + `Correct these code failures. Count each space-separated word; at most 4. Keep valid titles and review flags unless they need correction.\n${problems.join("\n")}`, ids);
      writeFileSync(cacheFile, JSON.stringify(cache, null, 2) + "\n");
      problems = batchProblems(batch, cache[hash].rows);
    }
    if (problems.length) throw new Error(problems.join("\n"));
    rows.push(...cache[hash].rows);
  }
}
const titles = Object.fromEntries(rows.map((r) => [r.id, r.title]));
const problems = skillTitleProblems(titles);
if (problems.length) throw new Error(problems.join("\n"));
const reviews = Object.fromEntries(rows.filter((r) => r.review).map((r) => [r.id, r.review]));
if (!process.argv.includes("--check")) {
  writeFileSync(file, `// Generated by scripts/generate-workbook-skill-titles.mjs on the Claude subscription (Sonnet, high).\n`
    + `// Review the wording before use. Re-run with --check to validate and write the review list.\n`
    + `export const SKILL_TITLES: Readonly<Record<string, string>> = ${JSON.stringify(titles, null, 2)};\n\n`
    + `/** Titles that need a human wording check. */\nexport const SKILL_TITLE_REVIEWS: Readonly<Record<string, string>> = ${JSON.stringify(reviews, null, 2)};\n`);
}
const cell = (s) => s.replaceAll("|", "\\|").replaceAll("\n", " ");
const md = ["# Skill titles", "", `${rows.length} titles. ${Object.keys(reviews).length} flagged titles.`, "",
  "Generated on the Claude subscription. The title checks enforce the word limit, banned phrases and distinct titles within each unit. Run the print fit check separately.", ""];
if (Object.keys(reviews).length) {
  md.push("## Flagged titles", "", "| Skill id | Title | Review |", "|---|---|---|");
  for (const row of rows.filter((r) => r.review)) md.push(`| ${row.id} | ${cell(row.title)} | ${cell(row.review)} |`);
  md.push("");
}
for (const unit of units) {
  md.push(`## ${unit.unit}: ${unit.name}`, "", "| Unit | Skill id | Skill name | Title | Review |", "|---|---|---|---|---|");
  for (const skill of unit.skills) md.push(`| ${unit.unit} | ${skill.id} | ${cell(skill.name)} | ${cell(titles[skill.id])} | ${cell(reviews[skill.id] ?? "")} |`);
  md.push("");
}
writeFileSync(join(out, "skill-titles.md"), md.join("\n") + "\n");
console.log(`${rows.length} valid titles; ${Object.keys(reviews).length} flagged; ${out}/skill-titles.md`);
