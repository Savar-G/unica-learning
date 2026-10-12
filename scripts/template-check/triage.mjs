// Review-flag triage report (#75, #76). Usage: node scripts/template-check/triage.mjs [--check]
//
// Reads the checker's results.json and summary-all.json, and triage-rows.json: one row per triaged flag, each written
// against the payload hash the checker saw. A flag of a review template is covered only by a row with the same template
// id AND the same hash, so a row never describes an older payload. Writes triage.md: every flag of the current check
// with its disposition, source and quote; the defects that triage found and fixed (rows on an older hash); the first
// complete run's fails (first-run-fails.json) and their status now; and the sibling overlap (sibling-overlap.txt).
//
// --check writes nothing. It exits 1 when a review flag has no current-hash row, or when a current-hash row is still a
// defect, so a new checker run cannot leave flags untriaged. After a new run, triage the new flags into
// triage-rows.json (with the new hash), then run this script again.
//
// A flag is a province tag check the model marked not ok, or ok with low or medium confidence; a wording problem; or,
// for a review verdict with neither, the model's problem text (triaged as one row per named province).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../..", import.meta.url));
const dir = join(root, "scripts/template-check");
const check = process.argv.includes("--check");
const read = (name) => JSON.parse(readFileSync(join(dir, name), "utf8"));
const summary = read("summary-all.json");
const results = read("results.json").templates;
const rows = read("triage-rows.json");
const firstRun = read("first-run-fails.json");

// Current tags, through the public assessment core (as the checker loads it).
const coreDir = mkdtempSync(join(tmpdir(), "triage-core-"));
let core;
try {
  await build({ entryPoints: { core: join(root, "src/lib/assessment/index.ts") }, outdir: coreDir, bundle: true, format: "esm", platform: "node", alias: { "@": join(root, "src") }, logLevel: "silent" });
  core = await import(pathToFileURL(join(coreDir, "core.js")));
} finally {
  rmSync(coreDir, { recursive: true, force: true });
}
const templates = new Map(Object.values(core.BANKS).flat().map((t) => [t.id, t]));
const tagNow = (id, item) => (item.startsWith("tag-") ? templates.get(id)?.grades[item.slice(4)] : undefined);
const status = new Map(summary.rows.map((r) => [r.id, r]));
const cell = (s) => String(s ?? "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();

const byKey = new Map();
for (const r of rows) {
  const k = `${r.id}|${r.hash}`;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(r);
}
const flagsOf = (id) => {
  const f = results[id].findings;
  const items = [
    ...f.provinceTags.filter((t) => !t.ok || t.confidence !== "high").map((t) => ({ item: `tag-${t.province}`, text: `${t.province}: ${t.ok ? "ok" : `suggests ${t.suggestedGrade ?? "another grade"}`} (${t.confidence}). ${t.reason}` })),
    ...f.wordingProblems.map((w) => ({ item: "wording", text: w })),
  ];
  if (!items.length) items.push({ item: "verdict-only", text: f.problems.join(" ") });
  return items;
};

const table = [], gaps = [], dispositions = {};
let flagCount = 0;
for (const s of summary.rows.filter((r) => r.status === "review")) {
  const triage = byKey.get(`${s.id}|${s.hash}`) ?? [];
  const flags = flagsOf(s.id);
  const wording = flags.filter((x) => x.item === "wording");
  for (const fl of flags) {
    flagCount++;
    const match = fl.item === "verdict-only" ? triage : triage.filter((r) => r.item === fl.item);
    if (!match.length) {
      gaps.push(`${s.id} ${fl.item}`);
      continue;
    }
    // Wording rows pair with wording flags in order; a template's last wording row covers any extra flags.
    const used = fl.item === "wording" ? [match[Math.min(match.length - 1, wording.indexOf(fl))]] : match;
    for (const m of used) {
      dispositions[m.disposition] = (dispositions[m.disposition] ?? 0) + 1;
      table.push(`| \`${s.id}\` | \`${s.hash}\` | ${fl.item} | ${cell(fl.text)} | ${m.disposition} | ${cell(m.source)}${m.url ? ` (${m.url})` : ""}: "${cell(m.quote)}" | ${cell(m.reason)} |`);
    }
  }
}
const open = rows.filter((r) => r.disposition === "defect" && status.get(r.id)?.hash === r.hash);
const fixed = rows.filter((r) => r.disposition === "defect" && status.has(r.id) && status.get(r.id).hash !== r.hash);

if (check) {
  console.log(`review templates ${summary.review}; flags ${flagCount}; rows on the current hash ${table.length}; untriaged flags ${gaps.length}; open defects ${open.length}`);
  for (const g of gaps) console.log(`untriaged: ${g}`);
  for (const r of open) console.log(`open defect: ${r.id} ${r.item}`);
  process.exit(gaps.length || open.length ? 1 : 0);
}
if (gaps.length || open.length) throw new Error(`untriaged flags ${gaps.length}, open defects ${open.length}; run with --check`);

const firstFails = Object.entries(firstRun.fails).filter(([id]) => status.has(id));
const sibling = readFileSync(join(dir, "sibling-overlap.txt"), "utf8").trim();
const md = [
  "# Review-flag triage (#75, #76)",
  "",
  `Made by \`node scripts/template-check/triage.mjs\` from \`summary-all.json\` (${summary.provider}, ${summary.model}, ${summary.effort} effort), \`results.json\` and \`triage-rows.json\`: ${summary.total} templates, pass ${summary.pass}, review ${summary.review}, fail ${summary.fail}, error ${summary.error}, unchecked ${summary.unchecked}.`,
  "",
  "Owner rule (2026-10-11, #54, #75, #76): zero checker fails, and every review flag triaged against primary curriculum sources. A flag that is a real defect is fixed in the template and checked again; a flag that is not a defect keeps its model verdict and gets a disposition with its source. No model verdict was edited by hand.",
  "",
  "A flag is a province tag check the model marked not ok, or ok with low or medium confidence; a wording problem; or, for a review verdict with neither, the model's problem text. Each row matches the template id and the payload hash of its current check (Hash column). Dispositions: confirmed (the tag is the grade where the province's current outcome teaches the task, or an earlier outcome covers only part of it), not-a-defect (wording), unverified (no outcome names the task after a recorded search, or the saved outcome text cannot confirm the tag; the tag stays).",
  "",
  "Sources (saved and hashed 2026-10-11): BC https://curriculum.gov.bc.ca/curriculum/mathematics/<grade>/core; AB current K-6 https://curriculum.learnalberta.ca/curriculum/en/gfc/MAT (outcome data gfc-mat.json) and, for grades 7-8, the 2016 K-9 program of studies (still current for grades 7-9); SK https://curriculum.gov.sk.ca/CurriculumOutcomeContent?id=145..152; MB https://www.edu.gov.mb.ca/k12/framework/english/math/math_gr<grade>.html; ON The Ontario Curriculum Grades 1-8 Mathematics 2020 (January 2021), printed page = PDF page - 1.",
  "",
  `Flags: ${flagCount}. Rows: ${table.length}. Dispositions: ${Object.entries(dispositions).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
  "",
  "## Review flags on the final check",
  "",
  "| Template | Hash | Flag | Checker text | Disposition | Source | Reason |",
  "|---|---|---|---|---|---|---|",
  ...table,
  "",
  `## Defects found by triage and fixed (${fixed.length})`,
  "",
  "These rows describe an earlier payload (Hash column). The fix changed the template, the checker ran again, and the current status is shown. Tag now is the tag in the source today; where it differs from the proposal, the lead chose another grade and the current-hash row explains it.",
  "",
  "| Template | Hash | Flag | Triage proposal | Tag now | Source | Current status |",
  "|---|---|---|---|---|---|---|",
  ...fixed.map((r) => `| \`${r.id}\` | \`${r.hash}\` | ${r.item} | ${r.proposedGrade !== undefined ? `${r.currentGrade} to ${r.proposedGrade}` : cell(r.reason).slice(0, 160)} | ${tagNow(r.id, r.item) ?? "-"} | ${cell(r.source)}: "${cell(r.quote)}" | ${status.get(r.id).status} |`),
  "",
  `## Checker fails of the first complete run and their status now (${firstFails.length})`,
  "",
  `The first complete run (whole bank, source ${firstRun.source}) had these fails. Each was checked against the primary sources, fixed in the template, and checked again.`,
  "",
  "| Template | First-run finding | Status now |",
  "|---|---|---|",
  ...firstFails.map(([id, r]) => {
    const f = r.findings;
    const tags = f.provinceTags.filter((t) => !t.ok && t.confidence === "high").map((t) => `${t.province} to ${t.suggestedGrade}`).join(", ");
    const core = [!f.answerCorrect && "answer", !f.wrongAnswersOk && "coded wrong answer", !f.bcGradeFits && "BC grade"].filter(Boolean).join(", ");
    return `| \`${id}\` | ${cell([core && `failed check: ${core}`, tags && `high-confidence tag: ${tags}`].filter(Boolean).join("; ") || f.problems.join(" ")).slice(0, 220)} | ${status.get(id).status} |`;
  }),
  "",
  "## Sibling overlap after the retags (owner decisions 2026-10-11 and 2026-10-12)",
  "",
  "Stage 1 template share and stage 1 + stay question share between two seeds (200 pairs), measured on the final bank. Alberta's and Ontario's curricula teach much of BC's grade 7 content in grade 6 or earlier, so their level 7 pools are small. The owner accepted the Alberta grade 7 overlap (2026-10-11) and the Ontario grade 7 overlap (2026-10-12, #76) and asked for no new grade 7 templates for them. `bank-grades-6-7.test.ts` (\"siblings and retakes in grades 6-7\") holds Alberta grade 7 under 0.85 / 0.15, Ontario grade 7 under 0.6 / 0.15 and the others under 0.6 / 0.12. Before the retags (source 306ab61) every province was at or under 0.43 / 0.09.",
  "",
  "```",
  sibling,
  "```",
  "",
];
writeFileSync(join(dir, "triage.md"), md.join("\n"));
console.log(`triage.md: ${flagCount} flags, ${table.length} rows, ${fixed.length} fixed defects, ${firstFails.length} first-run fails`);
