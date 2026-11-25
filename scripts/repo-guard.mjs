#!/usr/bin/env node
/**
 * Deterministic architectural & agent-hygiene guardrails (AGENTS.md).
 *
 * Enforces structural ratchets so prose rules cannot drift back:
 *   1. max-lines: caps new prod files at 600 lines and freezes legacy monolith ceilings.
 *   2. banned-db-escapes: forbids `.overrideTypes(`, `.returns<`, `.maybeSingle<`.
 *   3. no-pagewise-brand: forbids "Pagewise" in customer-facing src/{app,components,ds}.
 *   4. no-test-sprawl: forbids new ticket-, fix-, final-, or regression-named test files.
 *   5. no-new-use-effect: freezes raw `useEffect(` counts in src/components and src/app.
 *   6. no-new-suppressions: freezes eslint-disable / oxlint-disable / @ts-ignore / @ts-expect-error counts.
 *   7. feature-map-coverage: requires every (site)/(product) page.tsx route in docs/feature-map.md.
 *   8. agents-md-budget: keeps AGENTS.md <= 150 lines and <= 10,240 bytes.
 *   9. engine-imports, engine-purity, engine-level-branch, engine-asset-use: keep the workbook engine pure (scripts/engine-guard.mjs).
 *
 * Usage:
 *   node scripts/repo-guard.mjs            # verify against scripts/repo-guard-baseline.json
 *   node scripts/repo-guard.mjs --ratchet  # tighten baseline ceilings downward only (never raises)
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { checkEngine } from "./engine-guard.mjs";

export const DEFAULT_MAX_LINES = 600;
export const AGENTS_MD_MAX_LINES = 150;
export const AGENTS_MD_MAX_BYTES = 10_240;

const CODE_FILE = /\.(ts|tsx|mts|js|mjs)$/;
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
const GENERATED_FILES = new Set([
  "src/lib/database.types.ts",
  "src/lib/database.checks.ts",
]);
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "out", "build", "vendor"]);

const BANNED_DB_ESCAPE_RE = /\.overrideTypes\s*[<(]|\.returns\s*<|\.maybeSingle\s*</;
const PAGEWISE_RE = /\bpagewise\b/i;
const TEST_SPRAWL_RE = /(?:-\d{3,}|-(?:fix(?:es)?|final|final-check|pr-\d+|round-?\d+|regressions?))\.test\.[cm]?[jt]sx?$/i;
const USE_EFFECT_RE = /\buseEffect\s*\(/g;
const SUPPRESSION_RE = /eslint-disable|oxlint-disable|@ts-ignore|@ts-expect-error/g;

function toPosix(p) {
  return p.split("\\").join("/");
}

function walkFiles(rootDir, relDir, out = []) {
  const fullDir = join(rootDir, relDir);
  if (!existsSync(fullDir)) return out;
  for (const entry of readdirSync(fullDir, { withFileTypes: true })) {
    const relPath = toPosix(join(relDir, entry.name));
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkFiles(rootDir, relPath, out);
    } else if (CODE_FILE.test(entry.name)) {
      out.push(relPath);
    }
  }
  return out;
}

const COMMENT_FREE_PRINTER = ts.createPrinter({ removeComments: true });

export function stripCommentsPreservingStrings(text, fileName = "file.tsx") {
  if (!text.includes("//") && !text.includes("/*")) return text;
  const scriptKind = fileName.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : fileName.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : fileName.endsWith(".js") || fileName.endsWith(".mjs")
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, scriptKind);
  return COMMENT_FREE_PRINTER.printFile(sourceFile);
}

export function pageFileToRoute(relPath) {
  const normalized = toPosix(relPath)
    .replace(/^src\/app/, "")
    .replace(/\/page\.tsx$/, "");
  const segments = normalized
    .split("/")
    .filter((seg) => seg && !(seg.startsWith("(") && seg.endsWith(")")));
  return "/" + segments.join("/");
}

export function extractDocumentedRoutes(markdown) {
  const routes = new Set();
  for (const match of markdown.matchAll(/`(\/[^`\s]*)`/g)) {
    const raw = match[1].replace(/\/+$/, "") || "/";
    routes.add(raw);
  }
  return routes;
}

export function scanRepo(rootDir) {
  const codeFiles = [
    ...walkFiles(rootDir, "src"),
    ...walkFiles(rootDir, "worker/maya-voice/src"),
  ].sort();

  const lineCounts = {};
  const useEffectCounts = {};
  const suppressionCounts = {};
  const sprawlTests = [];
  const bannedDbEscapes = [];
  const brandLeaks = [];

  for (const relPath of codeFiles) {
    if (GENERATED_FILES.has(relPath)) continue;

    const raw = readFileSync(join(rootDir, relPath), "utf8");
    const supCount = (raw.match(SUPPRESSION_RE) ?? []).length;
    if (supCount > 0) suppressionCounts[relPath] = supCount;

    const isTest = TEST_FILE.test(relPath);
    if (isTest) {
      if (TEST_SPRAWL_RE.test(relPath)) sprawlTests.push(relPath);
      continue;
    }

    const lines = raw.length === 0 ? 0 : raw.split(/\r?\n/).length;
    lineCounts[relPath] = lines;

    const isUiFile = /^src\/(app|components)\//.test(relPath);
    const needsCommentStrip = BANNED_DB_ESCAPE_RE.test(raw) || (isUiFile && USE_EFFECT_RE.test(raw));
    USE_EFFECT_RE.lastIndex = 0;
    const stripped = needsCommentStrip ? stripCommentsPreservingStrings(raw, relPath) : raw;

    const dbMatch = BANNED_DB_ESCAPE_RE.exec(stripped);
    if (dbMatch) {
      bannedDbEscapes.push({ file: relPath, match: dbMatch[0] });
    }

    if (/^src\/(app|components|ds)\//.test(relPath) && PAGEWISE_RE.test(raw)) {
      brandLeaks.push(relPath);
    }

    if (isUiFile) {
      const count = (stripped.match(USE_EFFECT_RE) ?? []).length;
      if (count > 0) useEffectCounts[relPath] = count;
    }
  }

  const pageFiles = [
    ...walkFiles(rootDir, "src/app/(site)"),
    ...walkFiles(rootDir, "src/app/(product)"),
  ]
    .filter((f) => f.endsWith("/page.tsx"))
    .sort();
  const pageRoutes = pageFiles.map((file) => ({ file, route: pageFileToRoute(file) }));

  const featureMapPath = join(rootDir, "docs/feature-map.md");
  const featureMapRoutes = existsSync(featureMapPath)
    ? extractDocumentedRoutes(readFileSync(featureMapPath, "utf8"))
    : null;

  const agentsMdPath = join(rootDir, "AGENTS.md");
  const agentsMd = existsSync(agentsMdPath)
    ? (() => {
        const buf = readFileSync(agentsMdPath);
        const text = buf.toString("utf8");
        return { bytes: buf.byteLength, lines: text.split(/\r?\n/).length };
      })()
    : null;

  return {
    lineCounts,
    useEffectCounts,
    suppressionCounts,
    sprawlTests: sprawlTests.sort(),
    bannedDbEscapes,
    brandLeaks,
    pageRoutes,
    featureMapRoutes,
    agentsMd,
  };
}

export function checkRepo(rootDir, baseline, { maxLines = DEFAULT_MAX_LINES } = {}) {
  const scan = scanRepo(rootDir);
  const violations = [];
  const tightenable = [];

  const maxLineBaseline = baseline.maxLines ?? {};
  for (const [file, lines] of Object.entries(scan.lineCounts)) {
    const limit = maxLineBaseline[file] ?? maxLines;
    if (lines > limit) {
      violations.push({
        rule: "max-lines",
        file,
        message: `${file} has ${lines} lines (limit ${limit}). Extract focused helpers instead of growing monoliths (AGENTS.md).`,
      });
    } else if (file in maxLineBaseline && lines < maxLineBaseline[file]) {
      tightenable.push(`maxLines:${file} (${maxLineBaseline[file]} -> ${lines <= maxLines ? "remove" : lines})`);
    }
  }
  for (const file of Object.keys(maxLineBaseline)) {
    if (!(file in scan.lineCounts)) tightenable.push(`maxLines:${file} (deleted)`);
  }

  for (const { file, match } of scan.bannedDbEscapes) {
    violations.push({
      rule: "banned-db-escapes",
      file,
      message: `${file} uses forbidden Supabase escape "${match}". Narrow column/RPC types in src/lib/database.ts (ColumnTypes / NullArgs) instead.`,
    });
  }

  for (const file of scan.brandLeaks) {
    violations.push({
      rule: "no-pagewise-brand",
      file,
      message: `${file} mentions "Pagewise". Brand is Unica Learning (D-056)—never write "Pagewise" in customer-facing code or copy.`,
    });
  }

  const allowedSprawl = new Set(baseline.sprawlTests ?? []);
  for (const file of scan.sprawlTests) {
    if (!allowedSprawl.has(file)) {
      violations.push({
        rule: "no-test-sprawl",
        file,
        message: `${file} uses ticket-, fix-, final-, or regression-based naming. Add tests to the module's existing <name>.test.ts (AGENTS.md).`,
      });
    }
  }
  const currentSprawl = new Set(scan.sprawlTests);
  for (const file of allowedSprawl) {
    if (!currentSprawl.has(file)) tightenable.push(`sprawlTests:${file} (removed)`);
  }

  const ueBaseline = baseline.useEffectCounts ?? {};
  for (const [file, count] of Object.entries(scan.useEffectCounts)) {
    const limit = ueBaseline[file] ?? 0;
    if (count > limit) {
      violations.push({
        rule: "no-new-use-effect",
        file,
        message: `${file} has ${count} useEffect() call(s) (limit ${limit}). Prefer derived state, event handlers, src/lib/state-machine.ts, or an isolated hook in src/hooks/.`,
      });
    } else if (file in ueBaseline && count < ueBaseline[file]) {
      tightenable.push(`useEffectCounts:${file} (${ueBaseline[file]} -> ${count})`);
    }
  }
  for (const file of Object.keys(ueBaseline)) {
    if (!(file in scan.useEffectCounts)) tightenable.push(`useEffectCounts:${file} (${ueBaseline[file]} -> 0)`);
  }

  const supBaseline = baseline.suppressionCounts ?? {};
  for (const [file, count] of Object.entries(scan.suppressionCounts)) {
    const limit = supBaseline[file] ?? 0;
    if (count > limit) {
      violations.push({
        rule: "no-new-suppressions",
        file,
        message: `${file} has ${count} lint/TS suppression(s) (limit ${limit}). Fix the underlying lint or type error instead of suppressing it.`,
      });
    } else if (file in supBaseline && count < supBaseline[file]) {
      tightenable.push(`suppressionCounts:${file} (${supBaseline[file]} -> ${count})`);
    }
  }
  for (const file of Object.keys(supBaseline)) {
    if (!(file in scan.suppressionCounts)) tightenable.push(`suppressionCounts:${file} (${supBaseline[file]} -> 0)`);
  }

  if (scan.featureMapRoutes === null) {
    violations.push({
      rule: "feature-map-coverage",
      file: "docs/feature-map.md",
      message: "docs/feature-map.md is missing. Maintain a canonical route map for all (site) and (product) pages.",
    });
  } else {
    for (const { file, route } of scan.pageRoutes) {
      if (!scan.featureMapRoutes.has(route)) {
        violations.push({
          rule: "feature-map-coverage",
          file,
          message: `Route \`${route}\` (${file}) is missing from docs/feature-map.md. Add it so agents share one canonical map of user-facing surfaces.`,
        });
      }
    }
  }

  if (scan.agentsMd) {
    if (scan.agentsMd.lines > AGENTS_MD_MAX_LINES || scan.agentsMd.bytes > AGENTS_MD_MAX_BYTES) {
      violations.push({
        rule: "agents-md-budget",
        file: "AGENTS.md",
        message: `AGENTS.md is ${scan.agentsMd.lines} lines / ${scan.agentsMd.bytes} bytes (budget <= ${AGENTS_MD_MAX_LINES} lines and <= ${AGENTS_MD_MAX_BYTES} bytes). Move subsystem details to docs/<topic>.md.`,
      });
    }
  }

  violations.push(...checkEngine(rootDir));

  return { ok: violations.length === 0, violations, tightenable, scan };
}

/** Tightens an existing baseline downward only (or initializes one when `baseline` is null). */
export function buildRatchetedBaseline(scan, existing = null, { maxLines = DEFAULT_MAX_LINES } = {}) {
  const sortObj = (entries) => Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));

  const nextMaxLines = [];
  for (const [file, lines] of Object.entries(scan.lineCounts)) {
    if (lines <= maxLines) continue;
    const prev = existing?.maxLines?.[file];
    nextMaxLines.push([file, prev === undefined ? lines : Math.min(prev, lines)]);
  }

  const nextUseEffect = [];
  for (const [file, count] of Object.entries(scan.useEffectCounts)) {
    const prev = existing?.useEffectCounts?.[file];
    const limit = prev === undefined ? (existing ? 0 : count) : Math.min(prev, count);
    if (limit > 0) nextUseEffect.push([file, limit]);
  }

  const nextSuppressions = [];
  for (const [file, count] of Object.entries(scan.suppressionCounts)) {
    const prev = existing?.suppressionCounts?.[file];
    const limit = prev === undefined ? (existing ? 0 : count) : Math.min(prev, count);
    if (limit > 0) nextSuppressions.push([file, limit]);
  }

  const prevSprawl = existing ? new Set(existing.sprawlTests ?? []) : null;
  const nextSprawl = scan.sprawlTests.filter((f) => !prevSprawl || prevSprawl.has(f)).sort();

  return {
    maxLinesDefault: maxLines,
    maxLines: sortObj(nextMaxLines),
    useEffectCounts: sortObj(nextUseEffect),
    suppressionCounts: sortObj(nextSuppressions),
    sprawlTests: nextSprawl,
  };
}

function main() {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const baselinePath = join(rootDir, "scripts/repo-guard-baseline.json");
  const ratchetMode = process.argv.includes("--ratchet");
  const initMode = process.argv.includes("--init-baseline");

  if (initMode) {
    const scan = scanRepo(rootDir);
    const fresh = buildRatchetedBaseline(scan, null);
    writeFileSync(baselinePath, JSON.stringify(fresh, null, 2) + "\n");
    process.stdout.write(`[repo-guard] initialized ${relative(rootDir, baselinePath)}\n`);
    return;
  }

  if (!existsSync(baselinePath)) {
    process.stderr.write(`[repo-guard] missing ${relative(rootDir, baselinePath)}\n`);
    process.exitCode = 1;
    return;
  }

  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const result = checkRepo(rootDir, baseline, { maxLines: baseline.maxLinesDefault ?? DEFAULT_MAX_LINES });

  if (ratchetMode) {
    if (!result.ok) {
      for (const v of result.violations) process.stderr.write(`[repo-guard] FAIL (${v.rule}): ${v.message}\n`);
      process.stderr.write(`[repo-guard] cannot ratchet while ${result.violations.length} violation(s) remain.\n`);
      process.exitCode = 1;
      return;
    }
    const tightened = buildRatchetedBaseline(result.scan, baseline, { maxLines: baseline.maxLinesDefault ?? DEFAULT_MAX_LINES });
    writeFileSync(baselinePath, JSON.stringify(tightened, null, 2) + "\n");
    process.stdout.write(`[repo-guard] ratcheted ${relative(rootDir, baselinePath)} (${result.tightenable.length} ceiling(s) tightened).\n`);
    return;
  }

  if (!result.ok) {
    for (const v of result.violations) process.stderr.write(`[repo-guard] FAIL (${v.rule}): ${v.message}\n`);
    process.stderr.write(`[repo-guard] ${result.violations.length} violation(s) found.\n`);
    process.exitCode = 1;
    return;
  }

  const tip = result.tightenable.length > 0
    ? ` (${result.tightenable.length} baseline ceiling(s) can be tightened via: node scripts/repo-guard.mjs --ratchet)`
    : "";
  process.stdout.write(`[repo-guard] OK (${result.scan.pageRoutes.length} routes mapped, 0 guardrail violations)${tip}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
