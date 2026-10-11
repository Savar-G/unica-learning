// Template checker (#74, D-084): fills every question template from many seeds and asks Claude, through Claude Code
// headless (`claude -p`, on the Claude subscription; never an API key), whether each answer is correct and the grade
// fits. A build-time tool: nothing in src imports it, and it never runs on the deployed site.
//
// Usage: npm run check:templates -- [options]
//   --dry-run      print the prompts; call nothing, write nothing
//   --band 1-2     the bank to check: 1-2 (default), 3-5, 6-7 or all
//   --only a,b     only these template ids
//   --limit n      check at most n templates in this run
//   --samples n    filled examples per template (default 8, from 300 seeds)
//   --batch n      templates per `claude -p` call (default 10)
//   --model m      model alias for `claude --model` (default opus)
//   --effort e     effort for `claude --effort` (default high)
//   --fresh        check again templates that already have a result
//
// Resumable: each result is saved in scripts/template-check/results.json as soon as its batch returns, keyed by the
// template id and a hash of what Claude saw. A run skips templates whose hash still matches a pass, review or fail
// result, so it picks up where a stopped run ended and rechecks only templates that changed (or errored).
// The report, failures first, is scripts/template-check/report.md.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = join(root, "scripts/template-check");
const RESULTS = join(OUT_DIR, "results.json");
const REPORT = join(OUT_DIR, "report.md");
const MAP = join(root, ".design/research/online-assessment/bc-math-curriculum-map.md");

// ---------- Options ----------
function parseArgs(argv) {
  const opts = { dryRun: false, band: "1-2", only: null, limit: Infinity, samples: 8, batch: 10, model: "opus", effort: "high", fresh: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--fresh") opts.fresh = true;
    else if (a === "--band") opts.band = next();
    else if (a === "--only") opts.only = new Set(next().split(",").map((s) => s.trim()).filter(Boolean));
    else if (a === "--limit") opts.limit = positive(a, next());
    else if (a === "--samples") opts.samples = positive(a, next());
    else if (a === "--batch") opts.batch = positive(a, next());
    else if (a === "--model") opts.model = next();
    else if (a === "--effort") opts.effort = next();
    else if (a === "--help" || a === "-h") {
      console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).slice(0, 20).join("\n"));
      process.exit(0);
    } else throw new Error(`Unknown option ${a} (see --help)`);
  }
  return opts;
}
function positive(name, v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a whole number of 1 or more`);
  return n;
}

// ---------- The assessment core, through its public interface ----------
async function loadCore() {
  const outdir = mkdtempSync(join(tmpdir(), "unica-template-check-"));
  try {
    await build({
      entryPoints: { core: join(root, "src/lib/assessment/index.ts") },
      outdir, bundle: true, format: "esm", platform: "node", alias: { "@": join(root, "src") }, logLevel: "silent",
    });
    return await import(pathToFileURL(join(outdir, "core.js")));
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
}

/** BC standard headings from the curriculum map, section 1: { "1.3": "addition and subtraction to 20 (...)" }. */
function loadStandards() {
  const out = {};
  if (!existsSync(MAP)) return out;
  for (const line of readFileSync(MAP, "utf8").split("\n")) {
    const m = line.match(/^- \*\*([K\d.]+)\*\* (.*?)(?:\. Elaboration:|$)/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const STRAND_NAMES = {
  N: "number sense and place value", O: "operations", F: "fractions and decimals",
  A: "patterns and algebra", MG: "measurement and geometry", DP: "data and probability",
};
const gradeName = (level) => (level === 0 ? "K" : `grade ${level}`);

/** What Claude sees for one template: its tags and distinct filled examples, spread over many seeds. */
function describe(core, template, standards, samples) {
  const seen = new Map();
  for (let i = 0; i < 300; i++) {
    const q = core.fillTemplate(template, i * 7919 + 1);
    const key = `${q.prompt}|${[...(q.choices ?? [])].sort().join("|")}`;
    if (!seen.has(key)) seen.set(key, q);
  }
  let pool = [...seen.values()];
  // Keep the smallest and largest typed answers (the edges of the number range), then spread the rest.
  if (template.format === "number") pool.sort((a, b) => Number(a.answer) - Number(b.answer));
  const picked = [];
  const want = Math.min(samples, pool.length);
  for (let k = 0; k < want; k++) picked.push(pool[Math.round((k * (pool.length - 1)) / Math.max(1, want - 1))]);
  const tags = Object.fromEntries(["BC", "AB", "SK", "MB", "ON"].map((p) => [p, template.grades[p] === undefined ? "not tagged" : gradeName(template.grades[p])]));
  return {
    id: template.id,
    strand: STRAND_NAMES[template.strand],
    format: template.format === "choice" ? "multiple choice" : "typed number",
    whiteboard: template.whiteboard ? "the child may be asked to show work by drawing" : "no shown work",
    bcStandard: `${template.standard} ${standards[template.standard] ?? ""}`.trim(),
    gradeTags: tags,
    examples: [...new Set(picked)].map((q) => ({
      prompt: q.prompt,
      readAloud: q.readAloud,
      ...(q.choices ? { choices: q.choices } : {}),
      markedRight: q.answer,
      codedWrong: q.wrong.map((w) => ({ answer: w.value, misconception: core.MISCONCEPTIONS[w.misconception]?.description ?? w.misconception })),
    })),
  };
}

const hashOf = (payload) => createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);

// ---------- The prompt ----------
const SYSTEM = `You are a careful elementary math teacher in Canada. You review question templates for an online math placement test for children in grades 1 to 7. A template makes many questions by changing the numbers. Each template comes as JSON with its strand, its answer format, the BC learning standard it tests, the grade where each province teaches it (BC, AB, SK, MB, ON; K means Kindergarten) and several filled examples. Each example has the prompt the child sees, the read-aloud text a browser voice speaks, the choices (multiple choice only), the answer the computer marks right, and wrong answers coded to misconceptions. A misconception is a general description from a shared catalogue: its example may use other numbers than the question. Judge whether the error it names would produce that wrong answer.

For every template:
1. Solve every example yourself before you read the marked answer. answerCorrect is true only if the marked answer is right in every example and, for multiple choice, it is the only right choice.
2. wrongAnswersOk is true only if every coded wrong answer is really wrong, and its misconception is a plausible cause of that answer.
3. bcGradeFits is true if the BC tag is the grade where the BC curriculum (2016 redesign) teaches this skill at this difficulty, give or take one grade when the numbers make it easier or harder.
4. provinceTags: one entry for each of AB, SK, MB and ON. ok is false only if you think that province teaches this skill in a different grade. Give the grade you suggest, your confidence (high only if you know the curriculum outcome) and the reason.
5. wordingProblems: anything a child of the target age could misread, read-aloud text that does not say the same as the prompt, or text a browser voice would read badly.
6. verdict: "fail" if 1, 2 or 3 fails, or a province tag is wrong with high confidence; "review" if there is only a wording problem or a province doubt with medium or low confidence; "pass" otherwise.
Be strict on 1 and 2. Do not invent problems. Return one entry for each template id you were given.`;

const SCHEMA = {
  type: "object",
  properties: {
    templates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          answerCorrect: { type: "boolean" },
          wrongAnswersOk: { type: "boolean" },
          bcGradeFits: { type: "boolean" },
          provinceTags: {
            type: "array",
            items: {
              type: "object",
              properties: {
                province: { type: "string" },
                ok: { type: "boolean" },
                suggestedGrade: { type: "string" },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                reason: { type: "string" },
              },
              required: ["province", "ok", "confidence", "reason"],
            },
          },
          wordingProblems: { type: "array", items: { type: "string" } },
          problems: { type: "array", items: { type: "string" } },
          verdict: { type: "string", enum: ["pass", "review", "fail"] },
        },
        required: ["id", "answerCorrect", "wrongAnswersOk", "bcGradeFits", "provinceTags", "wordingProblems", "problems", "verdict"],
      },
    },
  },
  required: ["templates"],
};

const userPrompt = (payloads) =>
  `Check these ${payloads.length} templates. Reply with JSON only, in this shape: ${JSON.stringify(SCHEMA)}\n\n${JSON.stringify(payloads, null, 1)}`;

// ---------- Calling Claude Code headless ----------
/** The environment for `claude -p`: never an API key, so the call runs on the Claude subscription. */
function claudeEnv() {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  return env;
}

function callClaude(prompt, opts) {
  // --safe-mode skips hooks, MCP servers and CLAUDE.md files; --tools "" leaves Claude nothing to run, only to answer.
  const args = [
    "-p", "--output-format", "json", "--safe-mode", "--tools", "", "--no-session-persistence",
    "--model", opts.model, "--effort", opts.effort, "--system-prompt", SYSTEM,
  ];
  const run = spawnSync("claude", args, { input: prompt, env: claudeEnv(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000 });
  if (run.error) {
    const hint = run.error.code === "ENOENT" ? " Is Claude Code installed and on PATH?" : "";
    return { error: `claude did not run: ${run.error.message}.${hint}` };
  }
  const out = (run.stdout ?? "").trim();
  if (!out) {
    return { error: `claude -p returned no output (exit ${run.status}). ${(run.stderr ?? "").trim().slice(0, 300)} Inside an agent session this can happen; run the checker in your own terminal.` };
  }
  let envelope;
  try {
    envelope = JSON.parse(out);
  } catch {
    return { error: `claude -p output was not JSON: ${out.slice(0, 300)}` };
  }
  if (envelope.is_error || envelope.api_error) return { error: `claude -p failed: ${envelope.api_error ?? ""} ${String(envelope.result ?? "").slice(0, 300)}`.trim() };
  const text = String(envelope.result ?? "");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed.templates)) throw new Error("no templates array");
    // The model that wrote the answer is the one with the most output; Claude Code may use a small model on the side.
    const usage = Object.entries(envelope.modelUsage ?? {}).sort(([, a], [, b]) => (b.outputTokens ?? 0) - (a.outputTokens ?? 0));
    return { templates: parsed.templates, model: usage[0]?.[0] ?? opts.model, cost: envelope.total_cost_usd };
  } catch (e) {
    return { error: `Could not read Claude's answer as JSON (${e.message}): ${text.slice(0, 300)}` };
  }
}

/** pass, review or fail, from the checks themselves (Claude's own verdict can only make it stricter). */
function statusOf(f) {
  const sureWrongTag = (f.provinceTags ?? []).some((t) => t.ok === false && t.confidence === "high");
  if (!f.answerCorrect || !f.wrongAnswersOk || !f.bcGradeFits || sureWrongTag || f.verdict === "fail") return "fail";
  const doubts = (f.provinceTags ?? []).some((t) => t.ok === false) || (f.wordingProblems ?? []).length > 0;
  if (doubts || f.verdict === "review") return "review";
  return "pass";
}

// ---------- Results and report ----------
function loadResults() {
  if (!existsSync(RESULTS)) return { version: 1, templates: {} };
  return JSON.parse(readFileSync(RESULTS, "utf8"));
}
function saveResults(results) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 2)}\n`);
}

function writeReport(results, current, opts) {
  const rows = current.map(({ template, hash }) => {
    const r = results.templates[template.id];
    const status = !r ? "not checked" : r.hash !== hash ? "changed since its check" : r.status;
    return { id: template.id, status, r };
  });
  const count = (s) => rows.filter((x) => x.status === s).length;
  const lines = [
    "# Template check report",
    "",
    `Made by \`npm run check:templates\` (scripts/check-templates.mjs). Bank: ${opts.band}, ${rows.length} templates. Updated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`,
    "",
    `Pass: ${count("pass")}. Review: ${count("review")}. Fail: ${count("fail")}. Error: ${count("error")}. Not checked: ${count("not checked")}. Changed since its check: ${count("changed since its check")}.`,
    "",
    "A template passes when Claude found its answers correct, its coded wrong answers wrong, and its BC grade right. Review means a wording problem or a province tag doubt that a person should decide.",
    "",
  ];
  const detail = (x) => {
    const f = x.r?.findings;
    const out = [`### ${x.id}`, ""];
    if (x.r?.error) out.push(`- Error: ${x.r.error}`);
    if (f) {
      if (!f.answerCorrect) out.push("- The marked answer is not right in every example.");
      if (!f.wrongAnswersOk) out.push("- A coded wrong answer is not wrong, or its misconception does not fit.");
      if (!f.bcGradeFits) out.push("- The BC grade tag does not fit.");
      for (const p of f.problems ?? []) out.push(`- ${p}`);
      for (const t of (f.provinceTags ?? []).filter((t) => !t.ok)) out.push(`- ${t.province}: suggests ${t.suggestedGrade ?? "another grade"} (${t.confidence} confidence). ${t.reason}`);
      for (const w of f.wordingProblems ?? []) out.push(`- Wording: ${w}`);
    }
    out.push(`- Checked ${x.r?.checkedAt ?? "-"} with ${x.r?.model ?? "-"}.`, "");
    return out;
  };
  for (const [title, status] of [["Fail", "fail"], ["Error", "error"], ["Review", "review"]]) {
    const items = rows.filter((x) => x.status === status);
    if (items.length) lines.push(`## ${title} (${items.length})`, "", ...items.flatMap(detail));
  }
  for (const [title, status] of [["Changed since its check", "changed since its check"], ["Not checked", "not checked"]]) {
    const items = rows.filter((x) => x.status === status);
    if (items.length) lines.push(`## ${title} (${items.length})`, "", items.map((x) => `\`${x.id}\``).join(", "), "");
  }
  const passed = rows.filter((x) => x.status === "pass");
  if (passed.length) lines.push(`## Pass (${passed.length})`, "", ...passed.map((x) => `- \`${x.id}\` (${x.r.checkedAt}, ${x.r.model})`), "");
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT, lines.join("\n"));
  return { pass: count("pass"), review: count("review"), fail: count("fail"), error: count("error"), unchecked: count("not checked") + count("changed since its check") };
}

// ---------- Main ----------
const opts = parseArgs(process.argv.slice(2));
const core = await loadCore();
const standards = loadStandards();
const banks = opts.band === "all" ? Object.values(core.BANKS) : [core.BANKS[opts.band]];
if (!banks[0]) throw new Error(`No bank "${opts.band}". Use one of: ${Object.keys(core.BANKS).join(", ")}, all`);
const templates = [...new Map(banks.flat().map((t) => [t.id, t])).values()];
const unknown = [...(opts.only ?? [])].filter((id) => !templates.some((t) => t.id === id));
if (unknown.length) throw new Error(`Not in bank ${opts.band}: ${unknown.join(", ")}`);
// The report always covers the whole bank; --only and --limit only narrow what this run checks.
const current = templates.map((template) => {
  const payload = describe(core, template, standards, opts.samples);
  return { template, payload, hash: hashOf({ payload, system: SYSTEM }) };
});

const results = loadResults();
const pending = current
  .filter(({ template, hash }) => {
    if (opts.only && !opts.only.has(template.id)) return false;
    const r = results.templates[template.id];
    return opts.fresh || !r || r.hash !== hash || r.status === "error";
  })
  .slice(0, opts.limit);
const batches = [];
for (let i = 0; i < pending.length; i += opts.batch) batches.push(pending.slice(i, i + opts.batch));

console.log(`${templates.length} templates in bank ${opts.band}; ${pending.length} to check in ${batches.length} ${batches.length === 1 ? "call" : "calls"} to claude -p.`);
if (process.env.ANTHROPIC_API_KEY) console.log("ANTHROPIC_API_KEY is set in this shell; the checker removes it for claude -p, so the calls use your Claude subscription.");

if (opts.dryRun) {
  console.log(`\n===== System prompt =====\n${SYSTEM}`);
  batches.forEach((b, i) => console.log(`\n===== Call ${i + 1} of ${batches.length}: ${b.map((x) => x.template.id).join(", ")} =====\n${userPrompt(b.map((x) => x.payload))}`));
  process.exit(0);
}

for (const [i, batch] of batches.entries()) {
  const ids = batch.map((x) => x.template.id);
  console.log(`Call ${i + 1} of ${batches.length}: ${ids.join(", ")}`);
  const answer = callClaude(userPrompt(batch.map((x) => x.payload)), opts);
  const checkedAt = new Date().toISOString().slice(0, 10);
  for (const { template, hash } of batch) {
    const findings = answer.templates?.find((f) => f.id === template.id);
    results.templates[template.id] = answer.error || !findings
      ? { hash, status: "error", checkedAt, model: opts.model, error: answer.error ?? "Claude's answer left this template out." }
      : { hash, status: statusOf(findings), checkedAt, model: answer.model, findings };
  }
  saveResults(results);
  writeReport(results, current, opts);
  if (answer.error) {
    console.error(`  ${answer.error}`);
    if (/no output|did not run|usage_limit|rate/i.test(answer.error)) {
      console.error("Stopping. Run the same command again later: finished templates are kept.");
      break;
    }
  } else {
    const statuses = batch.map((x) => `${x.template.id}: ${results.templates[x.template.id].status}`);
    console.log(`  ${statuses.join("; ")}${answer.cost ? ` (list price USD ${answer.cost.toFixed(2)})` : ""}`);
  }
}

const summary = writeReport(results, current, opts);
console.log(`\nPass ${summary.pass}, review ${summary.review}, fail ${summary.fail}, error ${summary.error}, not checked ${summary.unchecked}.`);
console.log(`Report: ${REPORT}`);
// The bank is ready only when every template has a current pass or a review a person has read; a run that leaves
// templates unchecked, failed or errored exits 1, so it can gate a merge.
const ready = summary.fail + summary.error + summary.unchecked === 0;
if (!ready) console.log(summary.unchecked ? "Not ready: run the checker again to check the rest." : "Not ready: fix the failed templates and run again.");
else if (summary.review) console.log("Ready once a person has read the review items in the report.");
process.exit(ready ? 0 : 1);
