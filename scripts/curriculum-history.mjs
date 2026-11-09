// Adds one entry to the curriculum structure archive (src/lib/workbook-curriculum/history/), which new-book planning
// reads to compare the curriculum Book 1 was planned on with today's (docs/next-book-curriculum-history.md).
//
// Usage: node scripts/curriculum-history.mjs --digest <28 hex> [--key bc] [--commit <sha>]... [--rev HEAD]
//
// It walks the Git history of the curriculum (every commit from --rev that changed src/lib/workbook-curriculum/ or
// src/lib/workbook-digest.ts, newest first; each --commit is tried before them, for example the run frame's
// versions.build). For each commit it builds that commit's src/lib/workbook-curriculum/index.ts from Git objects only
// (`git show <commit>:<path>`, never the working tree), takes the curriculum data its curriculumVersion fingerprints, and
// fingerprints it with today's digestOf (src/lib/workbook-digest.ts, imported, not copied). It writes the archive file
// only for a commit whose fingerprint equals --digest exactly, with that commit and the Git blob of its bc.ts in the
// file, and refuses (exit 1, no file) when no commit matches. The structure in the file is made by today's
// curriculumStructureOf (src/lib/workbook-curriculum/structure.ts). Then register the file in
// src/lib/workbook-curriculum/history/index.ts (the line to add is printed) and commit both.
//
// Read-only on the repository: it reads Git objects and writes only the archive file. It needs esbuild (a dev
// dependency) and the full Git history, so it never runs on Vercel.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const [digest] = option("--digest"), key = option("--key")[0] ?? "bc", rev = option("--rev")[0] ?? "HEAD";
if (!/^[0-9a-f]{28}$/.test(digest ?? "")) fail("Give --digest: the 28-character curriculum fingerprint (a run frame's versions.curriculum).");
if (!/^[a-z]+$/.test(key)) fail("--key must be a curriculum key, for example bc.");

const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
function fail(message) { console.error(message); process.exit(1); }

/** Loads CommonJS code built by esbuild, resolving packages from the repository's node_modules. */
function load(code, name) {
  const file = path.join(root, name), m = new Module(file);
  m.filename = file;
  m.paths = Module._nodeModulePaths(root);
  m._compile(code, file);
  return m.exports;
}
const empty = (b) => {
  b.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }));
  b.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" }));
};

// Today's fingerprint and structure functions, from the working tree.
const today = load((await build({
  stdin: { contents: 'export { digestOf } from "./src/lib/workbook-digest"; export { curriculumStructureOf, readCurriculumStructureRecord, CURRICULUM_STRUCTURE_FORMAT } from "./src/lib/workbook-curriculum/structure";', resolveDir: root, loader: "ts" },
  bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent", alias: { "@": path.join(root, "src") }, plugins: [{ name: "empty", setup: empty }],
})).outputFiles[0].text, "curriculum-history-today.cjs");

const INDEX = "src/lib/workbook-curriculum/index.ts";
const EXTENSIONS = ["", ".ts", ".tsx", ".json", "/index.ts", "/index.tsx"];

/** The curriculum data of one commit: what its curriculumVersion fingerprinted (its DATA), or null when it had none. */
async function dataAt(commit) {
  const files = new Set(git("ls-tree", "-r", "--name-only", commit, "--", "src", "data").split("\n").filter(Boolean));
  if (!files.has(INDEX)) return null;
  const indexText = git("show", `${commit}:${INDEX}`);
  if (!/\nconst DATA\b/.test(indexText) || !/export function curriculumVersion\(/.test(indexText)) return null;
  const resolveIn = (base) => EXTENSIONS.map((e) => base + e).find((p) => files.has(p));
  const result = await build({
    stdin: { contents: `export { __CURRICULUM_DATA } from "./${INDEX.replace(/\.ts$/, "")}";`, resolveDir: root, loader: "ts" },
    bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent",
    plugins: [{ name: "git-source", setup(b) {
      empty(b);
      b.onResolve({ filter: /^(\.{1,2}\/|@\/)/ }, (a) => {
        const from = a.importer ? path.posix.dirname(a.importer) : "";
        const base = a.path.startsWith("@/") ? path.posix.join("src", a.path.slice(2)) : path.posix.normalize(path.posix.join(from, a.path));
        const found = resolveIn(base);
        if (!found) return { errors: [{ text: `${a.path} is not in ${commit}` }] };
        return { path: found, namespace: "git" };
      });
      b.onResolve({ filter: /.*/ }, (a) => (a.namespace === "git" ? { path: a.path, external: true } : undefined));
      b.onLoad({ filter: /.*/, namespace: "git" }, (a) => {
        let contents = git("show", `${commit}:${a.path}`);
        // The commit's own DATA, the object its curriculumVersion fingerprints, exported as it is.
        if (a.path === INDEX) contents += "\nexport const __CURRICULUM_DATA = DATA;\n";
        return { contents, loader: a.path.endsWith(".json") ? "json" : a.path.endsWith(".tsx") ? "tsx" : "ts" };
      });
    } }],
  });
  const all = load(result.outputFiles[0].text, `curriculum-history-${commit}.cjs`).__CURRICULUM_DATA;
  return all && Object.hasOwn(all, key) ? all[key] : null;
}

const extra = option("--commit").map((c) => git("rev-parse", "--verify", `${c}^{commit}`).trim());
const walked = git("log", "--format=%H", rev, "--", "src/lib/workbook-curriculum", "src/lib/workbook-digest.ts").split("\n").filter(Boolean);
const candidates = [...new Set([...extra, ...walked])];
let match = null, tried = 0;
for (const commit of candidates) {
  let data;
  try { data = await dataAt(commit); } catch (e) { console.log(`${commit.slice(0, 10)} does not build: ${String(e.message ?? e).split("\n")[0]}`); continue; }
  if (!data) continue;
  tried++;
  const found = today.digestOf(data);
  console.log(`${commit.slice(0, 10)} ${found}${found === digest ? "  match" : ""}`);
  if (found === digest) { match = { commit, data }; break; }
}
if (!match) fail(`No commit's curriculum has the fingerprint ${digest} (${tried} commits checked). No file written.`);

const structure = today.curriculumStructureOf(match.data);
const record = { format: today.CURRICULUM_STRUCTURE_FORMAT, key, digest,
  source: { commit: match.commit, path: "src/lib/workbook-curriculum/bc.ts", blob: git("rev-parse", `${match.commit}:src/lib/workbook-curriculum/bc.ts`).trim() },
  levels: structure.levels };
if (!today.readCurriculumStructureRecord(JSON.parse(JSON.stringify(record)), key, digest)) fail("The structure does not pass the archive reader. No file written.");

// One skill per line, so a later diff between two entries reads skill by skill.
const line = (v) => JSON.stringify(v);
const text = `{\n  "format": ${line(record.format)},\n  "key": ${line(key)},\n  "digest": ${line(digest)},\n  "source": ${line(record.source)},\n  "levels": [\n`
  + record.levels.map((l) => `    {"id": ${line(l.id)}, "number": ${l.number}, "units": [\n`
    + l.units.map((u) => `      {"code": ${line(u.code)}, "skills": [\n${u.skills.map((s) => `        ${line(s)}`).join(",\n")}\n      ]}`).join(",\n")
    + "\n    ]}").join(",\n") + "\n  ]\n}\n";
if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(record)) fail("The archive text does not read back as the record. No file written.");
const dir = path.join(root, "src/lib/workbook-curriculum/history"), name = `${key}-${digest}.json`;
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, name), text);
console.log(`Wrote src/lib/workbook-curriculum/history/${name} from ${match.commit}.`);
console.log(`Register it in src/lib/workbook-curriculum/history/index.ts:\n  import ${key}_${digest} from "./${name}";  and add  ${key}_${digest}  to ARCHIVE.`);
