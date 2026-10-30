// Curriculum import (#361): reads the curriculum skeleton (the source of truth, D-192) and writes the BC workbook
// curriculum, src/lib/workbook-curriculum/bc.ts: levels, units, skills and the Grade 3 steps. It checks the data first
// (every skill in the BC skill map, prerequisites before the skills that need them, pages and workbooks adding up to
// the grade budgets) and writes nothing while a check fails. A build-time tool: nothing in src imports it.
//
// Usage: npm run import:curriculum [-- <path to the skeleton .xlsx>]
import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import readXlsxFile from "read-excel-file/node";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKELETON = join(root, ".design/workbooks/samples/curriculum-skeleton.xlsx");
const OUT = join(root, "src/lib/workbook-curriculum/bc.ts");

const STRANDS = {
  "Number sense and place value": "N",
  Operations: "O",
  "Fractions, decimals, ratio and percent": "F",
  "Patterns and algebra": "A",
  "Measurement and geometry": "MG",
  "Data and probability": "DP",
};
const IMPORTANCE = { Core: "core", Standard: "standard", Minor: "minor" };
const LEADS = { "Parent-led": "parent-led", "Parent-supported": "parent-supported", "Child-led": "child-led" };
const DELIVERIES = ["new-step", "warm-up", "activity", "parent-checked"];
const RESPONSES = ["write-number", "circle", "match", "colour-or-shade", "draw", "number-line", "fill-table", "show-work", "write-words", "hands-on"];
const SCORABLE = ["yes", "partly", "no"];
const ARITHMETIC = { "Verified by code": "checked", "No arithmetic (picture or judgement)": "none" };

const problems = [];

/** The rows of a tab as objects, keyed by the given names; each header is found by its text, else by its start. */
function table(sheets, name, columns) {
  const sheet = sheets.find((s) => s.sheet === name);
  if (!sheet) throw new Error(`The skeleton has no tab "${name}"`);
  const [header, ...rows] = sheet.data;
  const at = {};
  for (const [key, title] of Object.entries(columns)) {
    const exact = header.indexOf(title);
    const i = exact >= 0 ? exact : header.findIndex((h) => typeof h === "string" && h.startsWith(title));
    if (i < 0) throw new Error(`Tab "${name}" has no column "${title}"`);
    at[key] = i;
  }
  return rows
    .map((r, i) => ({ row: i + 2, ...Object.fromEntries(Object.entries(at).map(([k, c]) => [k, r[c] ?? null])) }))
    .filter((r) => Object.keys(at).some((k) => r[k] !== null));
}

function fail(where, message) {
  problems.push(`${where}: ${message}`);
  return null;
}

function oneOf(where, value, allowed) {
  if (Array.isArray(allowed)) return allowed.includes(value) ? value : fail(where, `"${value}" is not one of ${allowed.join(", ")}`);
  return value in allowed ? allowed[value] : fail(where, `"${value}" is not one of ${Object.keys(allowed).join(", ")}`);
}

/** "4-6", "8 (capped)", "15-20 min" -> { min, max }. */
function range(where, value) {
  const m = String(value).match(/^(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?\b/);
  if (!m) return fail(where, `"${value}" is not a number or a range`);
  return { min: Number(m[1]), max: Number(m[2] ?? m[1]) };
}

function whole(where, value, min = 0) {
  return Number.isInteger(value) && value >= min ? value : fail(where, `"${value}" is not a whole number of ${min} or more`);
}

function text(where, value) {
  return typeof value === "string" && value.trim() ? value.trim() : fail(where, "is empty");
}

/** "Kindergarten" -> 0, "Grade 3" -> 3. */
function schoolGrade(where, value) {
  if (value === "Kindergarten") return 0;
  const m = String(value).match(/^Grade (\d)$/);
  return m ? Number(m[1]) : fail(where, `"${value}" is not a grade`);
}

function levelId(where, value) {
  const m = String(value).match(/^Level (U([1-9]|[12]\d|30))$/);
  return m ? m[1] : fail(where, `"${value}" is not a level from Level U1 to Level U30`);
}

function parseGrades(sheets) {
  const rows = sheets.find((s) => s.sheet === "Read me")?.data ?? [];
  const rule = (item) => rows.find((r) => r[0] === item)?.[1];
  const pages = rule("Page budget per grade");
  const workbooks = rule("Workbook budget");
  if (!pages || !workbooks) throw new Error('Tab "Read me" needs the rows "Page budget per grade" and "Workbook budget"');

  const grades = new Map();
  for (const m of pages.matchAll(/(Kindergarten|Grade \d) \d+ pages \(\d+ review share, (\d+) for skills\)/g)) {
    grades.set(schoolGrade("Read me, Page budget per grade", m[1]), { skillPages: Number(m[2]) });
  }
  for (const m of workbooks.matchAll(/(Kindergarten|Grades? (\d)(?:-(\d))?):? (\d+)/g)) {
    const from = m[1] === "Kindergarten" ? 0 : Number(m[2]);
    const to = m[1] === "Kindergarten" ? 0 : Number(m[3] ?? m[2]);
    for (let g = from; g <= to; g++) {
      if (!grades.has(g)) fail("Read me, Workbook budget", `grade ${g} has no page budget`);
      else grades.get(g).workbooks = Number(m[4]);
    }
  }
  const out = [...grades].map(([g, b]) => ({ schoolGrade: g, skillPages: b.skillPages, workbooks: b.workbooks }));
  for (const g of out) if (g.workbooks === undefined) fail("Read me, Workbook budget", `grade ${g.schoolGrade} has no workbook budget`);
  return out.sort((a, b) => a.schoolGrade - b.schoolGrade);
}

function parseLevels(sheets) {
  const rows = table(sheets, "Levels", {
    level: "Level", grade: "Grade", band: "Band", title: "Parent-friendly title", topics: "Main topics", units: "Units",
    count: "Skill count", pagesPerDay: "Pages a day", lead: "Who leads", daily: "Daily time target",
    practice: "Practice-page target", test: "Level test length", review: "Review share", pages: "Pages budget",
    workbooks: "Workbooks",
  });
  return rows.map((r) => {
    const at = `Levels row ${r.row}`;
    const id = levelId(at, r.level);
    const share = typeof r.review === "number" ? r.review : Number(String(r.review).replace("%", "")) / 100;
    return {
      level: {
        curriculum: "bc",
        id,
        number: id ? Number(id.slice(1)) : null,
        title: text(at, r.title),
        topics: text(at, r.topics),
        band: oneOf(at, r.band, { Early: "early", Middle: "middle", Upper: "upper" }),
        units: String(r.units ?? "").split(",").map((u) => u.trim()).filter(Boolean),
        pagesPerDay: range(at, r.pagesPerDay),
        lead: oneOf(at, r.lead, LEADS),
        dailyMinutes: range(at, r.daily),
        practicePageMinutes: range(at, String(r.practice).replace(/^about /, ""))?.min ?? null,
        levelTestMinutes: range(at, r.test),
        reviewShare: Number.isFinite(share) && share > 0 && share < 1 ? share : fail(at, `review share "${r.review}" is not a percent`),
        skillPages: whole(at, r.pages),
        workbooks: whole(at, r.workbooks, 1),
        schoolGrade: schoolGrade(at, r.grade),
      },
      skillCount: r.count,
    };
  });
}

function parseSkills(sheets) {
  const rows = table(sheets, "Units & skills", {
    level: "Level", grade: "Grade", strand: "Strand", unit: "Unit code", unitText: "Unit (official", id: "Skill id",
    text: "Skill", requires: "Requires", order: "Order within level", importance: "Importance",
    difficulty: "Difficulty", delivery: "Delivery", response: "Response type", scorable: "Scorable", pages: "Pages",
    position: "Position code",
  });
  const units = new Map();
  const skills = rows.map((r) => {
    const at = `Units & skills row ${r.row} (${r.id})`;
    const level = levelId(at, r.level);
    const unit = { curriculum: "bc", code: text(at, r.unit), text: text(at, r.unitText), strand: oneOf(at, r.strand, STRANDS), level };
    const seen = units.get(unit.code);
    if (!seen) units.set(unit.code, unit);
    else if (JSON.stringify(seen) !== JSON.stringify(unit)) fail(at, `unit ${unit.code} differs from its first row (text, strand or level)`);
    return {
      curriculum: "bc",
      id: text(at, r.id),
      text: text(at, r.text),
      level,
      unit: unit.code,
      order: whole(at, r.order, 1),
      position: text(at, r.position),
      importance: oneOf(at, r.importance, IMPORTANCE),
      difficulty: oneOf(at, r.difficulty, [1, 2, 3]),
      delivery: oneOf(at, r.delivery, DELIVERIES),
      response: oneOf(at, r.response, RESPONSES),
      scorable: oneOf(at, r.scorable, SCORABLE),
      pages: whole(at, r.pages),
      requires: String(r.requires ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    };
  });
  return { units: [...units.values()], skills };
}

/** "4: Gives the digit, not its value [conceptual; zero-placeholder]" -> an expected mistake. */
function mistake(at, line) {
  const m = line.match(/^(.+?): (.+) \[(careless|conceptual)(?:; ([a-z0-9-]+))?\]$/);
  if (!m) return fail(at, `expected mistake "${line}" is not "answer: why [careless or conceptual; misconception id]"`);
  return { answer: m[1], why: m[2], kind: m[3], misconception: m[4] ?? null };
}

/** "A -> B" or "A. Fix: B" split in two at its one separator. */
function split(at, value, separator, what) {
  const parts = String(value).split(separator);
  if (parts.length !== 2) return fail(at, `${what} "${value}" needs exactly one "${separator.trim()}"`);
  return parts.map((p) => p.trim());
}

function parseSteps(sheets) {
  const rows = table(sheets, "Grade 3 steps", {
    skill: "Skill id", number: "Step number", name: "Step name", change: "What changes", rules: "Number ranges",
    example: "Example problem", pages: "Suggested pages", representation: "Representation", mistakes: "Expected mistakes",
    spot: "Spot the error", arithmetic: "Arithmetic check", position: "Position code",
  });
  return rows.map((r) => {
    const at = `Grade 3 steps row ${r.row} (${r.skill} step ${r.number})`;
    const example = split(at, r.example, " -> ", "the example");
    const spot = split(at, r.spot, " Fix: ", "the spot-the-error item");
    return {
      curriculum: "bc",
      skill: text(at, r.skill),
      number: whole(at, r.number, 1),
      position: text(at, r.position),
      name: text(at, r.name),
      change: text(at, r.change),
      rules: text(at, r.rules),
      example: example && { problem: example[0], answer: example[1] },
      pages: r.pages === "warm-up slot" ? 0 : whole(at, r.pages),
      representation: text(at, r.representation),
      mistakes: String(r.mistakes ?? "").split("\n").filter(Boolean).map((l) => mistake(at, l.trim())),
      spotTheError: spot && { wrong: spot[0], fix: spot[1] },
      arithmetic: oneOf(at, r.arithmetic, ARITHMETIC),
    };
  });
}

/** The data checks of the module and the BC skill map, bundled from TypeScript. */
async function loadChecks() {
  const outdir = mkdtempSync(join(tmpdir(), "unica-curriculum-import-"));
  try {
    await build({
      stdin: {
        contents: `export { curriculumProblems } from "./src/lib/workbook-curriculum/check";\nexport { BC_SKILL_MAP } from "./src/lib/assessment/skill-map";\n`,
        resolveDir: root,
        loader: "ts",
      },
      outfile: join(outdir, "checks.js"), bundle: true, format: "esm", platform: "node", alias: { "@": join(root, "src") }, logLevel: "silent",
    });
    return await import(pathToFileURL(join(outdir, "checks.js")));
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
}

const lines = (items) => items.map((x) => `    ${JSON.stringify(x)},`).join("\n");

function write(data, source) {
  const file = `// Generated by scripts/import-curriculum.mjs from ${source}. Do not edit by hand:
// change the skeleton, then run \`npm run import:curriculum\`.
import type { CurriculumData } from "./types";

export const BC_CURRICULUM: CurriculumData = {
  key: "bc",
  levels: [
${lines(data.levels)}
  ],
  units: [
${lines(data.units)}
  ],
  skills: [
${lines(data.skills)}
  ],
  steps: [
${lines(data.steps)}
  ],
  grades: [
${lines(data.grades)}
  ],
};
`;
  writeFileSync(OUT, file);
}

const path = process.argv[2] ?? SKELETON;
const sheets = await readXlsxFile(path);
const levelRows = parseLevels(sheets);
const { units, skills } = parseSkills(sheets);
const data = { key: "bc", levels: levelRows.map((l) => l.level), units, skills, steps: parseSteps(sheets), grades: parseGrades(sheets) };
for (const { level, skillCount } of levelRows) {
  const count = skills.filter((s) => s.level === level.id).length;
  if (count !== skillCount) fail(`Levels, ${level.id}`, `skill count says ${skillCount}, but the level has ${count} skills`);
}

if (problems.length === 0) {
  const { curriculumProblems, BC_SKILL_MAP } = await loadChecks();
  problems.push(...curriculumProblems(data, BC_SKILL_MAP));
}
if (problems.length > 0) {
  console.error(`The skeleton has ${problems.length} problem(s); nothing was written:\n${problems.map((p) => `- ${p}`).join("\n")}`);
  process.exit(1);
}
write(data, relative(root, path));
console.log(`Wrote ${relative(root, OUT)}: ${data.levels.length} levels, ${data.units.length} units, ${data.skills.length} skills, ${data.steps.length} steps.`);
