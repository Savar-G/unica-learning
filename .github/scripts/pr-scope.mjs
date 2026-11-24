#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MAX_AFFECTED_FILES = 40;
const DEFAULT_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ENGINE_PREFIX = "src/lib/workbook-v2/";
const CODE_EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs", ".cjs", ".json"];
const CODE_FILE_RE = /\.[cm]?[jt]sx?$/;

/**
 * Non-code files dynamically read by tests via `fs.readFileSync` / `spawnSync` (not visible to Vitest's static import
 * graph). Changing one of these maps to its exact consumer test(s) instead of being skipped.
 */
export const DYNAMIC_READ_RULES = [
  { match: (f) => f === "docs/facts.md", tests: ["src/lib/facts.test.ts"] },
  { match: (f) => f === "docs/maya-practice-lines.md", tests: ["src/lib/maya/session-regressions.test.ts"] },
  { match: (f) => f === "docs/maya-practice.md" || f === "AGENTS.md", tests: ["src/lib/maya-practice/practice.test.ts"] },
  { match: (f) => /^docs\/workbook-gate-set.*\.json$/.test(f), tests: ["src/lib/workbook-gates.test.ts"] },
  { match: (f) => f.startsWith(".design/research/"), tests: ["src/lib/assessment/bank-coverage.test.ts", "src/lib/assessment/skill-map.test.ts"] },
  { match: (f) => f === ".design/workbooks/samples/curriculum-skeleton.xlsx", tests: ["src/lib/workbook-curriculum/step-source.test.ts"] },
];

const ALWAYS_FULL_PATTERNS = [
  /^package(-lock)?\.json$/,
  /^vitest\.config\./,
  /^tsconfig.*\.json$/,
  /^eslint\.config\./,
  /^\.oxlintrc\.json$/,
  /^next\.config\./,
  /^\.github\//,
  /^\.githooks\//,
  /^data\//,
  /^scripts\//,
  /^supabase\//,
  /^public\//,
  /^src\/lib\/database.*\.ts$/,
  /^src\/lib\/workbook-curriculum\//,
  /^src\/lib\/question-package.*\.ts$/,
  /^src\/lib\/workbook-render\.ts$/,
  /^src\/lib\/workbook-template.*\.ts$/,
  /^src\/lib\/print-engine-chromium\.ts$/,
  /^src\/lib\/maya\.ts$/,
  /^src\/lib\/maya\/session\.ts$/,
  /^src\/lib\/maya-text\.ts$/,
];

const SKIPPABLE_DOC_PATTERNS = [
  /^\.design\//,
  /^docs\//,
  /^\.claude\//,
  /^\.agents\//,
  /^skills-lock\.json$/,
  /^[^/]+\.md$/,
];

const CODE_LINT_PATTERN = /^(?:(src\/|scripts\/).*\.[cm]?[jt]sx?|docs\/feature-map\.md|AGENTS\.md)$/;
const MAYA_BEHAVIOUR_PATTERN = /^(src\/lib\/(maya|number-words|question-package)|docs\/maya-gate\.md)/;
const FAMILY_ZONES_PATTERN = /^(supabase\/|src\/lib\/(family-time|canada-postal-zones|supported-time-zones)|scripts\/generate-family-zones)/;
const VOICE_WORKER_PATTERN = /^(worker\/|src\/lib\/maya)/;
const FULL_HISTORY_PATTERN = /^src\/lib\/(workbook-book1|workbook-plan|workbook-placement|child-profile|workbook-sample-profiles)/;

function stripComments(source) {
  let out = "";
  let quote = "";
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (ch === "\\" && i + 1 < source.length) {
        out += next;
        i++;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/" && source[i - 1] !== "\\") {
      while (i < source.length && source[i] !== "\n") i++;
      if (i < source.length) out += "\n";
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i++;
      out += " ";
      continue;
    }
    out += ch;
  }
  return out;
}

function extractSpecifiers(code) {
  const specifiers = [];
  const patterns = [
    /\b(?:import|export)\s+[^;]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const match of code.matchAll(re)) specifiers.push(match[1]);
  }
  return specifiers;
}

function isFile(fullPath) {
  return existsSync(fullPath) && statSync(fullPath).isFile();
}

function resolveLocalFile(rootDir, fromFile, specifier) {
  let base = null;
  if (specifier.startsWith("@/")) {
    base = posix.normalize(`src/${specifier.slice(2)}`);
  } else if (specifier.startsWith(".")) {
    base = posix.normalize(posix.join(posix.dirname(fromFile), specifier));
  } else {
    return null;
  }
  const candidates = [base];
  if (/\.[cm]?js$/.test(base)) {
    const stem = base.replace(/\.[cm]?js$/, "");
    candidates.push(`${stem}.ts`, `${stem}.tsx`, `${stem}.mts`);
  }
  for (const ext of CODE_EXTENSIONS) candidates.push(`${base}${ext}`);
  for (const ext of CODE_EXTENSIONS) candidates.push(posix.join(base, `index${ext}`));
  for (const rel of candidates) {
    if (isFile(join(rootDir, rel))) return { file: rel };
  }
  return { unresolved: base };
}

function walkNonEngineSrc(rootDir, relDir = "src", out = []) {
  const fullDir = join(rootDir, relDir);
  if (!existsSync(fullDir)) return out;
  for (const entry of readdirSync(fullDir, { withFileTypes: true })) {
    const relPath = posix.join(relDir, entry.name);
    if (entry.isDirectory()) {
      if (`${relPath}/` === ENGINE_PREFIX || entry.name === "node_modules") continue;
      walkNonEngineSrc(rootDir, relPath, out);
    } else if (CODE_FILE_RE.test(entry.name)) {
      out.push(relPath);
    }
  }
  return out;
}

function isEngineTarget(relPath) {
  return relPath === ENGINE_PREFIX.slice(0, -1) || relPath.startsWith(ENGINE_PREFIX);
}

/**
 * Checks whether any app file outside `src/lib/workbook-v2/` imports a changed engine file directly or transitively.
 * Uses only Node built-ins because the `scope` CI job runs before `npm ci`.
 */
function hasAppEngineDependency(rootDir, changedEngineFiles) {
  const changedSet = new Set(changedEngineFiles);
  const directRoots = new Set();

  for (const file of walkNonEngineSrc(rootDir)) {
    const raw = readFileSync(join(rootDir, file), "utf8");
    if (!raw.includes("workbook-v2")) continue;
    const code = stripComments(raw);
    if (!code.includes("workbook-v2")) continue;
    if (/\b(?:import|require)\s*\(\s*[^"'\s)][^)]*workbook-v2/.test(code)) return true;
    for (const spec of extractSpecifiers(code)) {
      const resolved = resolveLocalFile(rootDir, file, spec);
      if (!resolved) continue;
      if (resolved.unresolved) {
        if (isEngineTarget(resolved.unresolved)) return true;
      } else if (resolved.file.startsWith(ENGINE_PREFIX)) {
        directRoots.add(resolved.file);
      }
    }
  }

  if (directRoots.size === 0) return false;

  const visited = new Set();
  const queue = [...directRoots];
  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    if (changedSet.has(current)) return true;
    const full = join(rootDir, current);
    if (!isFile(full)) return true;
    const code = stripComments(readFileSync(full, "utf8"));
    for (const spec of extractSpecifiers(code)) {
      const resolved = resolveLocalFile(rootDir, current, spec);
      if (!resolved) continue;
      if (resolved.unresolved) {
        if (isEngineTarget(resolved.unresolved)) return true;
      } else if (resolved.file.startsWith(ENGINE_PREFIX) && !visited.has(resolved.file)) {
        queue.push(resolved.file);
      }
    }
  }

  return false;
}

function fullScope(reason) {
  return {
    mode: "full",
    reason,
    runPrUnit: false,
    runChangedUnit: false,
    extraTests: [],
    runEngine: true,
    runLintAndTypes: true,
    runMayaBehaviour: true,
    runFamilyZones: true,
    runVoiceWorker: true,
    needsFullHistory: true,
  };
}

/**
 * Classifies a CI trigger into `full`, `affected`, or `skip` mode.
 *
 * - Non-PR events (`push` to `main`, `workflow_dispatch`, etc.) ALWAYS run `full`.
 * - PRs touching high-blast-radius configs, CI, DB migrations, data, scripts, or core shared modules ALWAYS run `full`.
 * - PRs touching only non-tested docs/design/skill files run `skip` (even when >40 files).
 * - PRs touching >40 non-skippable files or with an empty/unreadable diff ALWAYS fall back to `full`.
 * - Scoped PRs run `affected`: `engine` when `src/lib/workbook-v2/**` changed, `pr-unit` (`vitest --changed`, excluding
 *   engine tests) when non-engine `src/` changed or app code imports a changed engine file, explicit dynamically-read
 *   consumer tests, `lint-and-types` when code changed, and path-scoped `maya-behaviour` / `family-zones` / `voice-worker`.
 */
export function classifyScope({ eventName, changedFiles, rootDir = DEFAULT_ROOT }) {
  if (eventName !== "pull_request") {
    return fullScope(`event=${eventName}`);
  }
  const files = [...new Set((changedFiles ?? []).map((f) => f.trim()).filter(Boolean))].sort();
  if (files.length === 0) {
    return fullScope("empty-diff-fallback");
  }

  for (const file of files) {
    if (ALWAYS_FULL_PATTERNS.some((re) => re.test(file))) {
      return fullScope(`high-blast-radius:${file}`);
    }
  }

  const extraTestsSet = new Set();
  for (const file of files) {
    for (const rule of DYNAMIC_READ_RULES) {
      if (rule.match(file)) {
        for (const testFile of rule.tests) extraTestsSet.add(testFile);
      }
    }
  }
  const extraTests = [...extraTestsSet].sort();

  const runMayaBehaviour = files.some((f) => MAYA_BEHAVIOUR_PATTERN.test(f));
  const runFamilyZones = files.some((f) => FAMILY_ZONES_PATTERN.test(f));
  const runVoiceWorker = files.some((f) => VOICE_WORKER_PATTERN.test(f));
  const runLintAndTypes = files.some((f) => CODE_LINT_PATTERN.test(f));
  const changedEngineFiles = files.filter((f) => f.startsWith(ENGINE_PREFIX));
  const runEngine = changedEngineFiles.length > 0;
  const hasNonEngineSrc = files.some((f) => f.startsWith("src/") && !f.startsWith(ENGINE_PREFIX));
  const hasWorkerOnly = files.some((f) => f.startsWith("worker/"));

  // Every file must be in a known skippable doc/design folder AND not trigger any dynamic-read or targeted job.
  const allSkippable = files.every((f) => SKIPPABLE_DOC_PATTERNS.some((re) => re.test(f)));
  if (allSkippable && extraTests.length === 0 && !runEngine && !runMayaBehaviour && !runFamilyZones && !runVoiceWorker && !runLintAndTypes) {
    return {
      mode: "skip",
      reason: "docs-or-design-only",
      runPrUnit: false,
      runChangedUnit: false,
      extraTests: [],
      runEngine: false,
      runLintAndTypes: false,
      runMayaBehaviour: false,
      runFamilyZones: false,
      runVoiceWorker: false,
      needsFullHistory: false,
    };
  }

  const nonSkippableCount = files.filter((f) => !SKIPPABLE_DOC_PATTERNS.some((re) => re.test(f))).length;
  if (nonSkippableCount > MAX_AFFECTED_FILES) {
    return fullScope(`large-pr:${nonSkippableCount}-files`);
  }

  // Unknown top-level files outside src/, worker/, or skippable docs/design fall back to full.
  const hasUnknownPath = files.some((f) => !f.startsWith("src/") && !f.startsWith("worker/") && !SKIPPABLE_DOC_PATTERNS.some((re) => re.test(f)));
  if (hasUnknownPath) {
    const unknown = files.find((f) => !f.startsWith("src/") && !f.startsWith("worker/") && !SKIPPABLE_DOC_PATTERNS.some((re) => re.test(f)));
    return fullScope(`unknown-path:${unknown}`);
  }

  const appImportsEngine = runEngine && !hasNonEngineSrc && hasAppEngineDependency(rootDir, changedEngineFiles);
  const runChangedUnit = hasNonEngineSrc || appImportsEngine;
  const runPrUnit = runChangedUnit || extraTests.length > 0;
  const needsFullHistory = files.some((f) => FULL_HISTORY_PATTERN.test(f));

  let reason = "scoped-pr";
  if (hasWorkerOnly && !hasNonEngineSrc && !runEngine && extraTests.length === 0) {
    reason = "worker-only";
  } else if (runEngine && !hasNonEngineSrc && !hasWorkerOnly && !runPrUnit) {
    reason = "engine-only";
  }

  return {
    mode: "affected",
    reason,
    runPrUnit,
    runChangedUnit,
    extraTests,
    runEngine,
    runLintAndTypes,
    runMayaBehaviour,
    runFamilyZones,
    runVoiceWorker,
    needsFullHistory,
  };
}

function main() {
  const eventName = process.env.GITHUB_EVENT_NAME || "pull_request";
  let baseSha = "";
  let changedFiles = [];

  if (eventName === "pull_request") {
    try {
      baseSha = execFileSync("git", ["rev-parse", "HEAD^1"], { encoding: "utf8" }).trim();
      const raw = execFileSync("git", ["diff", "--no-renames", "--name-only", baseSha, "HEAD"], { encoding: "utf8" });
      changedFiles = raw.split(/\r?\n/).filter(Boolean);
    } catch (error) {
      console.error(`[pr-scope] failed to read PR diff, falling back to full: ${error.message}`);
      changedFiles = [];
    }
  }

  const result = classifyScope({ eventName, changedFiles });
  const lines = [
    `mode=${result.mode}`,
    `reason=${result.reason}`,
    `base_sha=${baseSha}`,
    `run_pr_unit=${result.runPrUnit}`,
    `run_changed_unit=${result.runChangedUnit}`,
    `extra_tests=${result.extraTests.join(" ")}`,
    `run_engine=${result.runEngine}`,
    `run_lint_and_types=${result.runLintAndTypes}`,
    `run_maya_behaviour=${result.runMayaBehaviour}`,
    `run_family_zones=${result.runFamilyZones}`,
    `run_voice_worker=${result.runVoiceWorker}`,
    `needs_full_history=${result.needsFullHistory}`,
  ];
  process.stdout.write(lines.join("\n") + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
