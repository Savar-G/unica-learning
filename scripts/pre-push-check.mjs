#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ZERO_OID = /^0{40,64}$/;
export const LOCAL_BUDGET_MS = 9_000;

/**
 * Parses git `pre-push` stdin (`<local ref> <local oid> <remote ref> <remote oid>`).
 * Returns true only when at least one ref line is present and every line is a branch/tag deletion.
 */
export function isDeleteOnlyPush(stdinText) {
  const lines = String(stdinText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  return lines.every((line) => {
    const parts = line.split(/\s+/);
    return parts.length >= 2 && ZERO_OID.test(parts[1]);
  });
}

function binPath(rootDir, name) {
  const ext = process.platform === "win32" ? ".cmd" : "";
  const local = resolve(rootDir, "node_modules", ".bin", `${name}${ext}`);
  return existsSync(local) ? local : name;
}

export function buildChecks(rootDir) {
  return [
    {
      name: "oxlint",
      steps: [{ cmd: binPath(rootDir, "oxlint"), args: ["src"] }],
    },
    {
      name: "app-typecheck",
      steps: [
        { cmd: binPath(rootDir, "next"), args: ["typegen"] },
        { cmd: binPath(rootDir, "tsgo"), args: ["--noEmit"] },
      ],
    },
    {
      name: "voice-typecheck",
      steps: [{ cmd: binPath(rootDir, "tsgo"), args: ["-p", "worker/maya-voice/tsconfig.json"] }],
    },
  ];
}

function defaultRunStep({ cmd, args, cwd }) {
  return new Promise((resolveStep) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout?.on("data", (chunk) => { out += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { out += chunk.toString(); });
    child.on("error", (error) => resolveStep({ code: 1, output: `${out}${error.message}\n` }));
    child.on("close", (code) => resolveStep({ code: code ?? 1, output: out }));
  });
}

/**
 * Runs all configured check pipelines in parallel. Each pipeline executes its steps sequentially
 * (e.g. `next typegen` before `tsgo --noEmit`) while pipelines run concurrently.
 */
export async function runPrePushChecks({
  rootDir,
  checks = buildChecks(rootDir),
  runStep = defaultRunStep,
  now = () => performance.now(),
} = {}) {
  const startedAt = now();
  const results = await Promise.all(
    checks.map(async (check) => {
      const checkStart = now();
      let combinedOutput = "";
      for (const step of check.steps) {
        const res = await runStep({ cmd: step.cmd, args: step.args, cwd: rootDir });
        combinedOutput += res.output ?? "";
        if (res.code !== 0) {
          return {
            name: check.name,
            ok: false,
            code: res.code,
            durationMs: Math.round(now() - checkStart),
            output: combinedOutput.trim(),
          };
        }
      }
      return {
        name: check.name,
        ok: true,
        code: 0,
        durationMs: Math.round(now() - checkStart),
        output: combinedOutput.trim(),
      };
    }),
  );
  const totalMs = Math.round(now() - startedAt);
  return {
    ok: results.every((r) => r.ok),
    totalMs,
    overBudget: totalMs > LOCAL_BUDGET_MS,
    results,
  };
}

function readStdin() {
  if (process.stdin.isTTY) return Promise.resolve("");
  return new Promise((resolveStdin) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolveStdin(data));
    process.stdin.on("error", () => resolveStdin(""));
  });
}

async function main() {
  const hookMode = process.argv.includes("--hook");
  if (hookMode) {
    const stdinText = await readStdin();
    if (isDeleteOnlyPush(stdinText)) {
      process.stdout.write("[pre-push] remote ref deletion only; skipping local checks.\n");
      return;
    }
  }

  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const summary = await runPrePushChecks({ rootDir });

  for (const r of summary.results) {
    const status = r.ok ? "PASS" : `FAIL (exit ${r.code})`;
    process.stdout.write(`[pre-push] ${r.name}: ${status} (${(r.durationMs / 1000).toFixed(2)}s)\n`);
    if (!r.ok && r.output) {
      process.stderr.write(`\n--- ${r.name} output ---\n${r.output}\n`);
    }
  }

  const wallSec = (summary.totalMs / 1000).toFixed(2);
  const budgetSec = (LOCAL_BUDGET_MS / 1000).toFixed(0);
  if (summary.ok) {
    const budgetNote = summary.overBudget ? ` (exceeded ${budgetSec}s local target)` : ` (within ${budgetSec}s target)`;
    process.stdout.write(`[pre-push] all checks passed in ${wallSec}s${budgetNote}.\n`);
    return;
  }

  process.stderr.write(`[pre-push] failed in ${wallSec}s. Fix the errors above before pushing (or bypass only when necessary with --no-verify).\n`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
