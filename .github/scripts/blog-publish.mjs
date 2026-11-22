#!/usr/bin/env node
// Publishes a validated claude/blog-* branch to protected main without executing any code from the blog branch.
// Runs in the publish job of .github/workflows/blog-publish.yml (extracted from origin/main via `git show`).
//
// For each attempt (retrying only when origin/main advances while CI runs):
//   1. Fetches latest origin/main and exits cleanly if HEAD_SHA is already merged.
//   2. Re-runs origin/main's scripts/blog-publish-guard.mjs against origin/main and HEAD_SHA.
//   3. Creates a --no-ff merge commit onto origin/main (fails immediately on merge conflicts).
//   4. Pushes the merge commit to a temporary site/blog-publish-* branch (ignored by Vercel).
//   5. Dispatches ci.yml (read-only full suite) on that branch and waits for the required `test` check to pass.
//   6. Pushes that exact tested merge commit to main, then deletes the temporary and blog branches with exact-SHA leases.
//
// Uses only Node built-ins so a single `git show` copy in $RUNNER_TEMP runs cleanly.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_POLL_ATTEMPTS = 60;
export const DEFAULT_POLL_INTERVAL_MS = 5_000;
export const DEFAULT_WATCH_INTERVAL_SEC = 15;
export const TEMP_BRANCHES_FILENAME = "blog-publish-temp-branches.txt";

const BLOG_BRANCH_RE = /^claude\/blog-[a-z0-9][a-z0-9._/-]*$/;
const SHA40_RE = /^[0-9a-f]{40}$/;
const DIGITS_RE = /^\d+$/;

function defaultExec(cmd, args, { stream = false } = {}) {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: stream ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout: stdout ?? "", stderr: "" };
  } catch (err) {
    return {
      status: typeof err?.status === "number" ? err.status : 1,
      stdout: err?.stdout ? String(err.stdout) : "",
      stderr: err?.stderr ? String(err.stderr) : stream ? "" : String(err?.message ?? err),
    };
  }
}

function defaultSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatCmd(cmd, args) {
  return [cmd, ...args].join(" ");
}

function mustExec(exec, cmd, args, context, options) {
  const res = exec(cmd, args, options);
  if (res.status !== 0) {
    const detail = [res.stderr.trim(), res.stdout.trim()].filter(Boolean).join("\n");
    throw new Error(`${context || formatCmd(cmd, args)} failed (exit ${res.status})${detail ? `:\n${detail}` : ""}`);
  }
  return res;
}

export function parseLsRemoteSha(stdout) {
  const firstLine = String(stdout ?? "").trim().split(/\r?\n/, 1)[0] ?? "";
  const sha = firstLine.split(/\s+/, 1)[0] ?? "";
  return SHA40_RE.test(sha) ? sha : null;
}

export function findMatchingCiRunId(runsJson, mergeSha) {
  let runs;
  try {
    runs = JSON.parse(runsJson);
  } catch {
    return null;
  }
  if (!Array.isArray(runs)) return null;
  const match = runs.find((r) => r && r.headSha === mergeSha && r.databaseId != null);
  return match ? String(match.databaseId) : null;
}

export function validateConfig({ branch, headSha, runId, runAttempt, runnerTemp }) {
  if (!branch || !BLOG_BRANCH_RE.test(branch) || branch.includes("..") || branch.endsWith("/")) {
    throw new Error(`Invalid blog branch name: ${JSON.stringify(branch)}`);
  }
  if (!headSha || !SHA40_RE.test(headSha)) {
    throw new Error(`Invalid HEAD_SHA: ${JSON.stringify(headSha)}`);
  }
  if (!runId || !DIGITS_RE.test(String(runId))) {
    throw new Error(`Invalid RUN_ID: ${JSON.stringify(runId)}`);
  }
  if (!runAttempt || !DIGITS_RE.test(String(runAttempt))) {
    throw new Error(`Invalid RUN_ATTEMPT: ${JSON.stringify(runAttempt)}`);
  }
  if (!runnerTemp) {
    throw new Error("RUNNER_TEMP is required");
  }
}

/**
 * Deletes a remote branch only if it still points to expectedSha.
 * Returns "deleted", "already_deleted", or "moved" (when expectedSha no longer matches).
 */
export function deleteRemoteBranchAtSha({ branch, expectedSha, exec = defaultExec, log = console.log }) {
  const check = exec("git", ["ls-remote", "--exit-code", "origin", `refs/heads/${branch}`]);
  if (check.status === 2) return "already_deleted";
  if (check.status !== 0) {
    const detail = check.stderr.trim() || check.stdout.trim();
    throw new Error(`Failed checking remote branch ${branch} (exit ${check.status})${detail ? `: ${detail}` : ""}`);
  }
  const remoteSha = parseLsRemoteSha(check.stdout);
  if (remoteSha && remoteSha !== expectedSha) {
    log(`Skipping delete of ${branch}: remote moved from ${expectedSha} to ${remoteSha}`);
    return "moved";
  }
  const del = exec("git", ["push", `--force-with-lease=refs/heads/${branch}:${expectedSha}`, "origin", `:refs/heads/${branch}`]);
  if (del.status === 0) return "deleted";

  // Recheck in case the branch disappeared or moved between ls-remote and push.
  const recheck = exec("git", ["ls-remote", "--exit-code", "origin", `refs/heads/${branch}`]);
  if (recheck.status === 2) return "already_deleted";
  const afterSha = parseLsRemoteSha(recheck.stdout);
  if (afterSha && afterSha !== expectedSha) {
    log(`Skipping delete of ${branch}: remote moved from ${expectedSha} to ${afterSha}`);
    return "moved";
  }
  const detail = del.stderr.trim() || del.stdout.trim();
  throw new Error(`Failed deleting remote branch ${branch} (exit ${del.status})${detail ? `: ${detail}` : ""}`);
}

export function recordTempBranch(manifestPath, branch, sha, appendFile = appendFileSync) {
  appendFile(manifestPath, `${branch}\t${sha}\n`, "utf8");
}

export function cleanupTempBranchesFromManifest({
  manifestPath,
  exec = defaultExec,
  log = console.log,
  fileExists = existsSync,
  readFile = readFileSync,
}) {
  if (!fileExists(manifestPath)) return [];
  const raw = readFile(manifestPath, "utf8");
  const seen = new Set();
  const results = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [branch, sha] = trimmed.split("\t");
    if (!branch || !SHA40_RE.test(sha ?? "")) continue;
    const key = `${branch}\t${sha}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const outcome = deleteRemoteBranchAtSha({ branch, expectedSha: sha, exec, log });
    results.push({ branch, sha, outcome });
  }
  return results;
}

export async function publishBlogBranch({
  branch,
  headSha,
  runId,
  runAttempt,
  runnerTemp,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  pollAttempts = DEFAULT_POLL_ATTEMPTS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  watchIntervalSec = DEFAULT_WATCH_INTERVAL_SEC,
  exec = defaultExec,
  sleep = defaultSleep,
  log = console.log,
  writeFile = writeFileSync,
  appendFile = appendFileSync,
}) {
  validateConfig({ branch, headSha, runId, runAttempt, runnerTemp });

  const guardPath = join(runnerTemp, "blog-publish-guard.mjs");
  const manifestPath = join(runnerTemp, TEMP_BRANCHES_FILENAME);

  mustExec(exec, "git", ["config", "user.name", "unica-blog-bot"], "git config user.name");
  mustExec(exec, "git", ["config", "user.email", "unica-blog-bot@users.noreply.github.com"], "git config user.email");

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    mustExec(exec, "git", ["fetch", "--no-tags", "origin", "main"], "git fetch origin main");
    const baseMain = mustExec(exec, "git", ["rev-parse", "origin/main"], "git rev-parse origin/main").stdout.trim();
    if (!SHA40_RE.test(baseMain)) {
      throw new Error(`Unexpected origin/main SHA: ${JSON.stringify(baseMain)}`);
    }

    // Idempotent recovery: if this exact commit is already on main, finish cleanly without re-merging.
    const alreadyMerged = exec("git", ["merge-base", "--is-ancestor", headSha, baseMain]);
    if (alreadyMerged.status === 0) {
      log(`${branch} (${headSha}) is already merged into origin/main (${baseMain}); cleaning up branch.`);
      deleteRemoteBranchAtSha({ branch, expectedSha: headSha, exec, log });
      return { status: "already_merged", attempt, baseMain };
    }

    // Re-run origin/main's copy of the guard on every attempt so a branch cannot loosen its own checks.
    const guardSource = mustExec(
      exec,
      "git",
      ["show", `${baseMain}:scripts/blog-publish-guard.mjs`],
      "extract blog-publish-guard.mjs from origin/main",
    ).stdout;
    writeFile(guardPath, guardSource, "utf8");
    const guardRun = mustExec(exec, "node", [guardPath, baseMain, headSha], "blog-publish-guard");
    if (guardRun.stdout.trim()) log(guardRun.stdout.trim());

    mustExec(exec, "git", ["checkout", "-B", "publish", baseMain], "git checkout publish");
    const merge = exec("git", ["merge", "--no-ff", "--no-edit", "-m", `Blog: publish ${branch}`, headSha]);
    if (merge.status !== 0) {
      exec("git", ["merge", "--abort"]);
      const detail = [merge.stderr.trim(), merge.stdout.trim()].filter(Boolean).join("\n");
      throw new Error(`Failed to merge ${branch} (${headSha}) into origin/main (${baseMain})${detail ? `:\n${detail}` : ""}`);
    }

    const mergeSha = mustExec(exec, "git", ["rev-parse", "HEAD"], "git rev-parse HEAD").stdout.trim();
    const testBranch = `site/blog-publish-${runId}-${runAttempt}-a${attempt}`;
    log(`Attempt ${attempt}/${maxAttempts}: testing merge ${mergeSha} (base ${baseMain}) on ${testBranch}`);

    recordTempBranch(manifestPath, testBranch, mergeSha, appendFile);
    mustExec(exec, "git", ["push", "origin", `HEAD:refs/heads/${testBranch}`], `push temporary branch ${testBranch}`);

    let ciRunId = null;
    try {
      mustExec(exec, "gh", ["workflow", "run", "ci.yml", "--ref", testBranch], `dispatch ci.yml on ${testBranch}`);

      for (let poll = 1; poll <= pollAttempts; poll += 1) {
        const list = exec("gh", [
          "run",
          "list",
          "--workflow",
          "ci.yml",
          "--branch",
          testBranch,
          "--event",
          "workflow_dispatch",
          "--json",
          "databaseId,headSha",
        ]);
        if (list.status === 0) {
          ciRunId = findMatchingCiRunId(list.stdout, mergeSha);
          if (ciRunId) break;
        }
        if (poll < pollAttempts) await sleep(pollIntervalMs);
      }
      if (!ciRunId) {
        throw new Error(`CI run for ${mergeSha} on ${testBranch} was not found after ${pollAttempts} polls`);
      }

      log(`Watching CI run ${ciRunId} for ${mergeSha}`);
      mustExec(
        exec,
        "gh",
        ["run", "watch", ciRunId, "--exit-status", "--interval", String(watchIntervalSec)],
        `CI run ${ciRunId}`,
        { stream: true },
      );

      const pushMain = exec("git", ["push", "origin", "HEAD:main"]);
      if (pushMain.status === 0) {
        log(`Published ${branch} (${mergeSha}) to main on attempt ${attempt}/${maxAttempts}`);
        deleteRemoteBranchAtSha({ branch, expectedSha: headSha, exec, log });
        return { status: "published", attempt, baseMain, mergeSha, ciRunId };
      }

      const remoteMain = exec("git", ["ls-remote", "origin", "refs/heads/main"]);
      const latestMain = remoteMain.status === 0 ? parseLsRemoteSha(remoteMain.stdout) : null;
      if (latestMain && latestMain !== baseMain) {
        if (attempt < maxAttempts) {
          log(`main moved from ${baseMain} to ${latestMain} while CI ran (attempt ${attempt}/${maxAttempts}); re-merging and retrying.`);
          continue;
        }
        throw new Error(`main moved ${maxAttempts} times in a row while publishing ${branch} (last: ${baseMain} -> ${latestMain})`);
      }

      const detail = [pushMain.stderr.trim(), pushMain.stdout.trim()].filter(Boolean).join("\n");
      throw new Error(`Failed to push ${mergeSha} to main (origin/main stayed at ${baseMain})${detail ? `:\n${detail}` : ""}`);
    } finally {
      deleteRemoteBranchAtSha({ branch: testBranch, expectedSha: mergeSha, exec, log });
    }
  }

  throw new Error(`Exhausted ${maxAttempts} attempts publishing ${branch}`);
}

async function main() {
  const runnerTemp = process.env.RUNNER_TEMP;
  if (process.argv.includes("--cleanup-only")) {
    if (!runnerTemp) throw new Error("RUNNER_TEMP is required for --cleanup-only");
    cleanupTempBranchesFromManifest({ manifestPath: join(runnerTemp, TEMP_BRANCHES_FILENAME) });
    return;
  }

  await publishBlogBranch({
    branch: process.env.BRANCH,
    headSha: process.env.HEAD_SHA,
    runId: process.env.RUN_ID,
    runAttempt: process.env.RUN_ATTEMPT,
    runnerTemp,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
