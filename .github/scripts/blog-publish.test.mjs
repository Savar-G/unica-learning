import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanupTempBranchesFromManifest,
  deleteRemoteBranchAtSha,
  findMatchingCiRunId,
  isNonFastForwardPushError,
  parseLsRemoteSha,
  publishBlogBranch,
  TEMP_BRANCHES_FILENAME,
  validateConfig,
} from "./blog-publish.mjs";

const MAIN_A = "1111111111111111111111111111111111111111";
const MAIN_B = "2222222222222222222222222222222222222222";
const BLOG_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MERGE_1 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const MERGE_2 = "cccccccccccccccccccccccccccccccccccccccc";
const OTHER_SHA = "dddddddddddddddddddddddddddddddddddddddd";
const BRANCH = "claude/blog-does-my-child-need-a-tutor";

function makeHarness(handlers) {
  const calls = [];
  const files = new Map();
  const logs = [];
  const exec = (cmd, args) => {
    calls.push([cmd, ...args]);
    const key = [cmd, ...args].join(" ");
    for (const [match, reply] of handlers) {
      const ok = typeof match === "function" ? match(cmd, args, calls) : key === match;
      if (ok) return typeof reply === "function" ? reply(cmd, args, calls) : reply;
    }
    throw new Error(`Unexpected command: ${key}`);
  };
  return {
    calls,
    files,
    logs,
    exec,
    sleep: async () => {},
    log: (msg) => logs.push(msg),
    writeFile: (p, content) => files.set(p, content),
    appendFile: (p, content) => files.set(p, (files.get(p) ?? "") + content),
    fileExists: (p) => files.has(p),
    readFile: (p) => files.get(p),
  };
}

test("publishes cleanly on the first attempt and deletes temp and blog branches", async () => {
  const h = makeHarness([
    [(c, a) => c === "git" && a[0] === "config", { status: 0, stdout: "", stderr: "" }],
    ["git fetch --no-tags origin main", { status: 0, stdout: "", stderr: "" }],
    ["git rev-parse origin/main", { status: 0, stdout: `${MAIN_A}\n`, stderr: "" }],
    [`git merge-base --is-ancestor ${BLOG_SHA} ${MAIN_A}`, { status: 1, stdout: "", stderr: "" }],
    [`git show ${MAIN_A}:scripts/blog-publish-guard.mjs`, { status: 0, stdout: "// guard\n", stderr: "" }],
    [`node /tmp/runner/blog-publish-guard.mjs ${MAIN_A} ${BLOG_SHA}`, { status: 0, stdout: "Blog publish guard passed\n", stderr: "" }],
    [`git checkout -B publish ${MAIN_A}`, { status: 0, stdout: "", stderr: "" }],
    [`git merge --no-ff --no-edit -m Blog: publish ${BRANCH} ${BLOG_SHA}`, { status: 0, stdout: "", stderr: "" }],
    ["git rev-parse HEAD", { status: 0, stdout: `${MERGE_1}\n`, stderr: "" }],
    ["git push origin HEAD:refs/heads/site/blog-publish-99-1-a1", { status: 0, stdout: "", stderr: "" }],
    ["gh workflow run ci.yml --ref site/blog-publish-99-1-a1", { status: 0, stdout: "", stderr: "" }],
    [
      (c, a) => c === "gh" && a[0] === "run" && a[1] === "list",
      { status: 0, stdout: JSON.stringify([{ databaseId: 5001, headSha: MERGE_1 }]), stderr: "" },
    ],
    ["gh run watch 5001 --exit-status --interval 15", { status: 0, stdout: "", stderr: "" }],
    ["git push origin HEAD:main", { status: 0, stdout: "", stderr: "" }],
    [`git ls-remote --exit-code origin refs/heads/${BRANCH}`, { status: 0, stdout: `${BLOG_SHA}\trefs/heads/${BRANCH}\n`, stderr: "" }],
    [`git push --force-with-lease=refs/heads/${BRANCH}:${BLOG_SHA} origin :refs/heads/${BRANCH}`, { status: 0, stdout: "", stderr: "" }],
    ["git ls-remote --exit-code origin refs/heads/site/blog-publish-99-1-a1", { status: 0, stdout: `${MERGE_1}\trefs/heads/site/blog-publish-99-1-a1\n`, stderr: "" }],
    [`git push --force-with-lease=refs/heads/site/blog-publish-99-1-a1:${MERGE_1} origin :refs/heads/site/blog-publish-99-1-a1`, { status: 0, stdout: "", stderr: "" }],
  ]);

  const result = await publishBlogBranch({
    branch: BRANCH,
    headSha: BLOG_SHA,
    runId: "99",
    runAttempt: "1",
    runnerTemp: "/tmp/runner",
    exec: h.exec,
    sleep: h.sleep,
    log: h.log,
    writeFile: h.writeFile,
    appendFile: h.appendFile,
  });

  assert.deepEqual(result, {
    status: "published",
    attempt: 1,
    baseMain: MAIN_A,
    mergeSha: MERGE_1,
    ciRunId: "5001",
  });
  assert.equal(h.files.get(`/tmp/runner/${TEMP_BRANCHES_FILENAME}`), `site/blog-publish-99-1-a1\t${MERGE_1}\n`);
});

test("retries automatically when main moves while CI is running, re-checking the guard and cleaning up both temp branches", async () => {
  let fetchCount = 0;
  let pushMainCount = 0;
  let revParseHeadCount = 0;

  const h = makeHarness([
    [(c, a) => c === "git" && a[0] === "config", { status: 0, stdout: "", stderr: "" }],
    [
      "git fetch --no-tags origin main",
      () => {
        fetchCount += 1;
        return { status: 0, stdout: "", stderr: "" };
      },
    ],
    ["git rev-parse origin/main", () => ({ status: 0, stdout: `${fetchCount === 1 ? MAIN_A : MAIN_B}\n`, stderr: "" })],
    [(c, a) => c === "git" && a[0] === "merge-base", { status: 1, stdout: "", stderr: "" }],
    [(c, a) => c === "git" && a[0] === "show", { status: 0, stdout: "// guard\n", stderr: "" }],
    [(c, a) => c === "node" && a[0] === "/tmp/runner/blog-publish-guard.mjs", { status: 0, stdout: "ok\n", stderr: "" }],
    [(c, a) => c === "git" && a[0] === "checkout", { status: 0, stdout: "", stderr: "" }],
    [(c, a) => c === "git" && a[0] === "merge", { status: 0, stdout: "", stderr: "" }],
    [
      "git rev-parse HEAD",
      () => {
        revParseHeadCount += 1;
        return { status: 0, stdout: `${revParseHeadCount === 1 ? MERGE_1 : MERGE_2}\n`, stderr: "" };
      },
    ],
    [(c, a) => c === "git" && a[0] === "push" && a[2]?.startsWith("HEAD:refs/heads/site/blog-publish-"), { status: 0, stdout: "", stderr: "" }],
    [(c, a) => c === "gh" && a[0] === "workflow" && a[1] === "run", { status: 0, stdout: "", stderr: "" }],
    [
      (c, a) => c === "gh" && a[0] === "run" && a[1] === "list",
      (c, a) => {
        const isFirst = a.includes("site/blog-publish-99-1-a1");
        return {
          status: 0,
          stdout: JSON.stringify([{ databaseId: isFirst ? 6001 : 6002, headSha: isFirst ? MERGE_1 : MERGE_2 }]),
          stderr: "",
        };
      },
    ],
    [(c, a) => c === "gh" && a[0] === "run" && a[1] === "watch", { status: 0, stdout: "", stderr: "" }],
    [
      "git push origin HEAD:main",
      () => {
        pushMainCount += 1;
        if (pushMainCount === 1) return { status: 1, stdout: "", stderr: "! [rejected] HEAD -> main (fetch first)" };
        return { status: 0, stdout: "", stderr: "" };
      },
    ],
    ["git ls-remote origin refs/heads/main", { status: 0, stdout: `${MAIN_B}\trefs/heads/main\n`, stderr: "" }],
    [
      (c, a) => c === "git" && a[0] === "ls-remote" && a[1] === "--exit-code",
      (c, a) => {
        const ref = a[3];
        const sha = ref.endsWith("-a1") ? MERGE_1 : ref.endsWith("-a2") ? MERGE_2 : BLOG_SHA;
        return { status: 0, stdout: `${sha}\t${ref}\n`, stderr: "" };
      },
    ],
    [(c, a) => c === "git" && a[0] === "push" && a[1]?.startsWith("--force-with-lease="), { status: 0, stdout: "", stderr: "" }],
  ]);

  const result = await publishBlogBranch({
    branch: BRANCH,
    headSha: BLOG_SHA,
    runId: "99",
    runAttempt: "1",
    runnerTemp: "/tmp/runner",
    exec: h.exec,
    sleep: h.sleep,
    log: h.log,
    writeFile: h.writeFile,
    appendFile: h.appendFile,
  });

  assert.deepEqual(result, {
    status: "published",
    attempt: 2,
    baseMain: MAIN_B,
    mergeSha: MERGE_2,
    ciRunId: "6002",
  });

  // Verify the guard ran against BOTH MAIN_A and MAIN_B.
  const guardCalls = h.calls.filter((c) => c[0] === "node" && c[1] === "/tmp/runner/blog-publish-guard.mjs");
  assert.deepEqual(guardCalls, [
    ["node", "/tmp/runner/blog-publish-guard.mjs", MAIN_A, BLOG_SHA],
    ["node", "/tmp/runner/blog-publish-guard.mjs", MAIN_B, BLOG_SHA],
  ]);

  // Verify both temporary branches were deleted with exact-SHA leases.
  const deletes = h.calls.filter((c) => c[0] === "git" && c[1] === "push" && c[2]?.startsWith("--force-with-lease="));
  assert.deepEqual(deletes, [
    ["git", "push", `--force-with-lease=refs/heads/site/blog-publish-99-1-a1:${MERGE_1}`, "origin", ":refs/heads/site/blog-publish-99-1-a1"],
    ["git", "push", `--force-with-lease=refs/heads/${BRANCH}:${BLOG_SHA}`, "origin", `:refs/heads/${BRANCH}`],
    ["git", "push", `--force-with-lease=refs/heads/site/blog-publish-99-1-a2:${MERGE_2}`, "origin", ":refs/heads/site/blog-publish-99-1-a2"],
  ]);
});

test("fails immediately without retrying when CI fails, and still cleans up the temp branch", async () => {
  const h = makeHarness([
    [(c, a) => c === "git" && a[0] === "config", { status: 0, stdout: "", stderr: "" }],
    ["git fetch --no-tags origin main", { status: 0, stdout: "", stderr: "" }],
    ["git rev-parse origin/main", { status: 0, stdout: `${MAIN_A}\n`, stderr: "" }],
    [`git merge-base --is-ancestor ${BLOG_SHA} ${MAIN_A}`, { status: 1, stdout: "", stderr: "" }],
    [`git show ${MAIN_A}:scripts/blog-publish-guard.mjs`, { status: 0, stdout: "// guard\n", stderr: "" }],
    [`node /tmp/runner/blog-publish-guard.mjs ${MAIN_A} ${BLOG_SHA}`, { status: 0, stdout: "", stderr: "" }],
    [`git checkout -B publish ${MAIN_A}`, { status: 0, stdout: "", stderr: "" }],
    [`git merge --no-ff --no-edit -m Blog: publish ${BRANCH} ${BLOG_SHA}`, { status: 0, stdout: "", stderr: "" }],
    ["git rev-parse HEAD", { status: 0, stdout: `${MERGE_1}\n`, stderr: "" }],
    ["git push origin HEAD:refs/heads/site/blog-publish-99-1-a1", { status: 0, stdout: "", stderr: "" }],
    ["gh workflow run ci.yml --ref site/blog-publish-99-1-a1", { status: 0, stdout: "", stderr: "" }],
    [
      (c, a) => c === "gh" && a[0] === "run" && a[1] === "list",
      { status: 0, stdout: JSON.stringify([{ databaseId: 7001, headSha: MERGE_1 }]), stderr: "" },
    ],
    ["gh run watch 7001 --exit-status --interval 15", { status: 1, stdout: "", stderr: "X test failed" }],
    ["git ls-remote --exit-code origin refs/heads/site/blog-publish-99-1-a1", { status: 0, stdout: `${MERGE_1}\trefs/heads/site/blog-publish-99-1-a1\n`, stderr: "" }],
    [`git push --force-with-lease=refs/heads/site/blog-publish-99-1-a1:${MERGE_1} origin :refs/heads/site/blog-publish-99-1-a1`, { status: 0, stdout: "", stderr: "" }],
  ]);

  await assert.rejects(
    () =>
      publishBlogBranch({
        branch: BRANCH,
        headSha: BLOG_SHA,
        runId: "99",
        runAttempt: "1",
        runnerTemp: "/tmp/runner",
        exec: h.exec,
        sleep: h.sleep,
        log: h.log,
        writeFile: h.writeFile,
        appendFile: h.appendFile,
      }),
    /CI run 7001 failed/,
  );

  // Never attempted a second fetch or pushed to main.
  assert.equal(h.calls.filter((c) => c[0] === "git" && c[1] === "fetch").length, 1);
  assert.equal(h.calls.filter((c) => c.join(" ") === "git push origin HEAD:main").length, 0);
  // Temp branch was still deleted.
  assert.equal(
    h.calls.filter((c) => c[0] === "git" && c[1] === "push" && c[2]?.includes("site/blog-publish-99-1-a1")).length,
    1,
  );
});

test("fails immediately without retrying when push to main fails even though main did not move", async () => {
  const h = makeHarness([
    [(c, a) => c === "git" && a[0] === "config", { status: 0, stdout: "", stderr: "" }],
    ["git fetch --no-tags origin main", { status: 0, stdout: "", stderr: "" }],
    ["git rev-parse origin/main", { status: 0, stdout: `${MAIN_A}\n`, stderr: "" }],
    [`git merge-base --is-ancestor ${BLOG_SHA} ${MAIN_A}`, { status: 1, stdout: "", stderr: "" }],
    [`git show ${MAIN_A}:scripts/blog-publish-guard.mjs`, { status: 0, stdout: "// guard\n", stderr: "" }],
    [`node /tmp/runner/blog-publish-guard.mjs ${MAIN_A} ${BLOG_SHA}`, { status: 0, stdout: "", stderr: "" }],
    [`git checkout -B publish ${MAIN_A}`, { status: 0, stdout: "", stderr: "" }],
    [`git merge --no-ff --no-edit -m Blog: publish ${BRANCH} ${BLOG_SHA}`, { status: 0, stdout: "", stderr: "" }],
    ["git rev-parse HEAD", { status: 0, stdout: `${MERGE_1}\n`, stderr: "" }],
    ["git push origin HEAD:refs/heads/site/blog-publish-99-1-a1", { status: 0, stdout: "", stderr: "" }],
    ["gh workflow run ci.yml --ref site/blog-publish-99-1-a1", { status: 0, stdout: "", stderr: "" }],
    [
      (c, a) => c === "gh" && a[0] === "run" && a[1] === "list",
      { status: 0, stdout: JSON.stringify([{ databaseId: 8001, headSha: MERGE_1 }]), stderr: "" },
    ],
    ["gh run watch 8001 --exit-status --interval 15", { status: 0, stdout: "", stderr: "" }],
    ["git push origin HEAD:main", { status: 1, stdout: "", stderr: "GH006: Protected branch update failed" }],
    ["git ls-remote origin refs/heads/main", { status: 0, stdout: `${MAIN_A}\trefs/heads/main\n`, stderr: "" }],
    ["git ls-remote --exit-code origin refs/heads/site/blog-publish-99-1-a1", { status: 0, stdout: `${MERGE_1}\trefs/heads/site/blog-publish-99-1-a1\n`, stderr: "" }],
    [`git push --force-with-lease=refs/heads/site/blog-publish-99-1-a1:${MERGE_1} origin :refs/heads/site/blog-publish-99-1-a1`, { status: 0, stdout: "", stderr: "" }],
  ]);

  await assert.rejects(
    () =>
      publishBlogBranch({
        branch: BRANCH,
        headSha: BLOG_SHA,
        runId: "99",
        runAttempt: "1",
        runnerTemp: "/tmp/runner",
        exec: h.exec,
        sleep: h.sleep,
        log: h.log,
        writeFile: h.writeFile,
        appendFile: h.appendFile,
      }),
    /Protected branch update failed/,
  );
  assert.equal(h.calls.filter((c) => c[0] === "git" && c[1] === "fetch").length, 1);
});

test("exits cleanly when HEAD_SHA is already merged into origin/main", async () => {
  const h = makeHarness([
    [(c, a) => c === "git" && a[0] === "config", { status: 0, stdout: "", stderr: "" }],
    ["git fetch --no-tags origin main", { status: 0, stdout: "", stderr: "" }],
    ["git rev-parse origin/main", { status: 0, stdout: `${MAIN_A}\n`, stderr: "" }],
    [`git merge-base --is-ancestor ${BLOG_SHA} ${MAIN_A}`, { status: 0, stdout: "", stderr: "" }],
    [`git ls-remote --exit-code origin refs/heads/${BRANCH}`, { status: 2, stdout: "", stderr: "" }],
  ]);

  const result = await publishBlogBranch({
    branch: BRANCH,
    headSha: BLOG_SHA,
    runId: "99",
    runAttempt: "1",
    runnerTemp: "/tmp/runner",
    exec: h.exec,
    sleep: h.sleep,
    log: h.log,
    writeFile: h.writeFile,
    appendFile: h.appendFile,
  });

  assert.deepEqual(result, { status: "already_merged", attempt: 1, baseMain: MAIN_A });
});

test("deleteRemoteBranchAtSha skips deletion when a branch moved to a newer commit", () => {
  const h = makeHarness([
    [`git ls-remote --exit-code origin refs/heads/${BRANCH}`, { status: 0, stdout: `${OTHER_SHA}\trefs/heads/${BRANCH}\n`, stderr: "" }],
  ]);
  const outcome = deleteRemoteBranchAtSha({ branch: BRANCH, expectedSha: BLOG_SHA, exec: h.exec, log: h.log });
  assert.equal(outcome, "moved");
  assert.equal(h.calls.length, 1);
});

test("cleanupTempBranchesFromManifest deduplicates entries and ignores already-deleted branches", () => {
  const h = makeHarness([
    ["git ls-remote --exit-code origin refs/heads/site/blog-publish-99-1-a1", { status: 2, stdout: "", stderr: "" }],
    ["git ls-remote --exit-code origin refs/heads/site/blog-publish-99-1-a2", { status: 0, stdout: `${MERGE_2}\trefs/heads/site/blog-publish-99-1-a2\n`, stderr: "" }],
    [`git push --force-with-lease=refs/heads/site/blog-publish-99-1-a2:${MERGE_2} origin :refs/heads/site/blog-publish-99-1-a2`, { status: 0, stdout: "", stderr: "" }],
  ]);
  h.files.set(
    "/tmp/runner/manifest.txt",
    [
      `site/blog-publish-99-1-a1\t${MERGE_1}`,
      `site/blog-publish-99-1-a1\t${MERGE_1}`,
      `site/blog-publish-99-1-a2\t${MERGE_2}`,
    ].join("\n"),
  );

  const results = cleanupTempBranchesFromManifest({
    manifestPath: "/tmp/runner/manifest.txt",
    exec: h.exec,
    log: h.log,
    fileExists: h.fileExists,
    readFile: h.readFile,
  });

  assert.deepEqual(results, [
    { branch: "site/blog-publish-99-1-a1", sha: MERGE_1, outcome: "already_deleted" },
    { branch: "site/blog-publish-99-1-a2", sha: MERGE_2, outcome: "deleted" },
  ]);
});

test("parseLsRemoteSha and findMatchingCiRunId validate formats strictly", () => {
  assert.equal(parseLsRemoteSha(`${MAIN_A}\trefs/heads/main\n`), MAIN_A);
  assert.equal(parseLsRemoteSha("not-a-sha\trefs/heads/main"), null);
  assert.equal(
    findMatchingCiRunId(JSON.stringify([{ databaseId: 1, headSha: MAIN_A }, { databaseId: 2, headSha: MERGE_1 }]), MERGE_1),
    "2",
  );
  assert.equal(findMatchingCiRunId("bad-json", MERGE_1), null);
});

test("aborts and fails immediately on a merge conflict without retrying", async () => {
  const h = makeHarness([
    [(c, a) => c === "git" && a[0] === "config", { status: 0, stdout: "", stderr: "" }],
    ["git fetch --no-tags origin main", { status: 0, stdout: "", stderr: "" }],
    ["git rev-parse origin/main", { status: 0, stdout: `${MAIN_A}\n`, stderr: "" }],
    [`git merge-base --is-ancestor ${BLOG_SHA} ${MAIN_A}`, { status: 1, stdout: "", stderr: "" }],
    [`git show ${MAIN_A}:scripts/blog-publish-guard.mjs`, { status: 0, stdout: "// guard\n", stderr: "" }],
    [`node /tmp/runner/blog-publish-guard.mjs ${MAIN_A} ${BLOG_SHA}`, { status: 0, stdout: "", stderr: "" }],
    [`git checkout -B publish ${MAIN_A}`, { status: 0, stdout: "", stderr: "" }],
    [(c, a) => c === "git" && a[0] === "merge" && a[1] === "--no-ff", { status: 1, stdout: "CONFLICT (content): Merge conflict in docs/blog-topics.md", stderr: "" }],
    ["git merge --abort", { status: 0, stdout: "", stderr: "" }],
  ]);

  await assert.rejects(
    () =>
      publishBlogBranch({
        branch: BRANCH,
        headSha: BLOG_SHA,
        runId: "99",
        runAttempt: "1",
        runnerTemp: "/tmp/runner",
        exec: h.exec,
        sleep: h.sleep,
        log: h.log,
        writeFile: h.writeFile,
        appendFile: h.appendFile,
      }),
    /Merge conflict in docs\/blog-topics\.md/,
  );
  assert.equal(h.calls.filter((c) => c.join(" ") === "git merge --abort").length, 1);
  assert.equal(h.calls.filter((c) => c[0] === "git" && c[1] === "fetch").length, 1);
});

test("stops after exhausting maxAttempts when main keeps moving", async () => {
  let attempt = 0;
  const shas = [MAIN_A, MAIN_B, OTHER_SHA];
  const h = makeHarness([
    [(c, a) => c === "git" && a[0] === "config", { status: 0, stdout: "", stderr: "" }],
    [
      "git fetch --no-tags origin main",
      () => {
        attempt += 1;
        return { status: 0, stdout: "", stderr: "" };
      },
    ],
    ["git rev-parse origin/main", () => ({ status: 0, stdout: `${shas[attempt - 1]}\n`, stderr: "" })],
    [(c, a) => c === "git" && a[0] === "merge-base", { status: 1, stdout: "", stderr: "" }],
    [(c, a) => c === "git" && a[0] === "show", { status: 0, stdout: "// guard\n", stderr: "" }],
    [(c, a) => c === "node" && a[0] === "/tmp/runner/blog-publish-guard.mjs", { status: 0, stdout: "", stderr: "" }],
    [(c, a) => c === "git" && a[0] === "checkout", { status: 0, stdout: "", stderr: "" }],
    [(c, a) => c === "git" && a[0] === "merge", { status: 0, stdout: "", stderr: "" }],
    ["git rev-parse HEAD", () => ({ status: 0, stdout: `${attempt === 1 ? MERGE_1 : MERGE_2}\n`, stderr: "" })],
    [(c, a) => c === "git" && a[0] === "push" && a[2]?.startsWith("HEAD:refs/heads/site/blog-publish-"), { status: 0, stdout: "", stderr: "" }],
    [(c, a) => c === "gh" && a[0] === "workflow" && a[1] === "run", { status: 0, stdout: "", stderr: "" }],
    [
      (c, a) => c === "gh" && a[0] === "run" && a[1] === "list",
      () => ({ status: 0, stdout: JSON.stringify([{ databaseId: 9000 + attempt, headSha: attempt === 1 ? MERGE_1 : MERGE_2 }]), stderr: "" }),
    ],
    [(c, a) => c === "gh" && a[0] === "run" && a[1] === "watch", { status: 0, stdout: "", stderr: "" }],
    ["git push origin HEAD:main", { status: 1, stdout: "", stderr: "! [rejected] HEAD -> main (fetch first)" }],
    ["git ls-remote origin refs/heads/main", () => ({ status: 0, stdout: `${shas[attempt]}\trefs/heads/main\n`, stderr: "" })],
    [
      (c, a) => c === "git" && a[0] === "ls-remote" && a[1] === "--exit-code",
      (c, a) => ({ status: 0, stdout: `${a[3].endsWith("-a1") ? MERGE_1 : MERGE_2}\t${a[3]}\n`, stderr: "" }),
    ],
    [(c, a) => c === "git" && a[0] === "push" && a[1]?.startsWith("--force-with-lease="), { status: 0, stdout: "", stderr: "" }],
  ]);

  await assert.rejects(
    () =>
      publishBlogBranch({
        branch: BRANCH,
        headSha: BLOG_SHA,
        runId: "99",
        runAttempt: "1",
        runnerTemp: "/tmp/runner",
        maxAttempts: 2,
        exec: h.exec,
        sleep: h.sleep,
        log: h.log,
        writeFile: h.writeFile,
        appendFile: h.appendFile,
      }),
    /main moved 2 times in a row/,
  );
  assert.equal(attempt, 2);
});

test("validateConfig rejects non-blog branches and malformed SHAs", () => {
  assert.throws(
    () => validateConfig({ branch: "main", headSha: BLOG_SHA, runId: "1", runAttempt: "1", runnerTemp: "/tmp" }),
    /Invalid blog branch/,
  );
  assert.throws(
    () => validateConfig({ branch: "claude/blog-a..b", headSha: BLOG_SHA, runId: "1", runAttempt: "1", runnerTemp: "/tmp" }),
    /Invalid blog branch/,
  );
  assert.throws(
    () => validateConfig({ branch: BRANCH, headSha: "not-a-sha", runId: "1", runAttempt: "1", runnerTemp: "/tmp" }),
    /Invalid HEAD_SHA/,
  );
});

test("does not retry a branch-protection push rejection even if main also moved", async () => {
  const h = makeHarness([
    [(c, a) => c === "git" && a[0] === "config", { status: 0, stdout: "", stderr: "" }],
    ["git fetch --no-tags origin main", { status: 0, stdout: "", stderr: "" }],
    ["git rev-parse origin/main", { status: 0, stdout: `${MAIN_A}\n`, stderr: "" }],
    [`git merge-base --is-ancestor ${BLOG_SHA} ${MAIN_A}`, { status: 1, stdout: "", stderr: "" }],
    [`git show ${MAIN_A}:scripts/blog-publish-guard.mjs`, { status: 0, stdout: "// guard\n", stderr: "" }],
    [`node /tmp/runner/blog-publish-guard.mjs ${MAIN_A} ${BLOG_SHA}`, { status: 0, stdout: "", stderr: "" }],
    [`git checkout -B publish ${MAIN_A}`, { status: 0, stdout: "", stderr: "" }],
    [`git merge --no-ff --no-edit -m Blog: publish ${BRANCH} ${BLOG_SHA}`, { status: 0, stdout: "", stderr: "" }],
    ["git rev-parse HEAD", { status: 0, stdout: `${MERGE_1}\n`, stderr: "" }],
    ["git push origin HEAD:refs/heads/site/blog-publish-99-1-a1", { status: 0, stdout: "", stderr: "" }],
    ["gh workflow run ci.yml --ref site/blog-publish-99-1-a1", { status: 0, stdout: "", stderr: "" }],
    [
      (c, a) => c === "gh" && a[0] === "run" && a[1] === "list",
      { status: 0, stdout: JSON.stringify([{ databaseId: 8501, headSha: MERGE_1 }]), stderr: "" },
    ],
    ["gh run watch 8501 --exit-status --interval 15", { status: 0, stdout: "", stderr: "" }],
    [
      "git push origin HEAD:main",
      { status: 1, stdout: "", stderr: "remote: error: GH006: Protected branch update failed for refs/heads/main.\n! [remote rejected] HEAD -> main (protected branch hook declined)" },
    ],
    ["git ls-remote origin refs/heads/main", { status: 0, stdout: `${MAIN_B}\trefs/heads/main\n`, stderr: "" }],
    ["git ls-remote --exit-code origin refs/heads/site/blog-publish-99-1-a1", { status: 0, stdout: `${MERGE_1}\trefs/heads/site/blog-publish-99-1-a1\n`, stderr: "" }],
    [`git push --force-with-lease=refs/heads/site/blog-publish-99-1-a1:${MERGE_1} origin :refs/heads/site/blog-publish-99-1-a1`, { status: 0, stdout: "", stderr: "" }],
  ]);

  await assert.rejects(
    () =>
      publishBlogBranch({
        branch: BRANCH,
        headSha: BLOG_SHA,
        runId: "99",
        runAttempt: "1",
        runnerTemp: "/tmp/runner",
        exec: h.exec,
        sleep: h.sleep,
        log: h.log,
        writeFile: h.writeFile,
        appendFile: h.appendFile,
      }),
    /GH006: Protected branch update failed/,
  );
  assert.equal(h.calls.filter((c) => c[0] === "git" && c[1] === "fetch").length, 1);
  assert.equal(isNonFastForwardPushError("! [rejected] HEAD -> main (non-fast-forward)"), true);
  assert.equal(isNonFastForwardPushError("GH006: Protected branch update failed"), false);
});

test("continues retrying when inline temporary branch cleanup hits a transient error", async () => {
  let fetchCount = 0;
  let pushMainCount = 0;
  let revParseHeadCount = 0;

  const h = makeHarness([
    [(c, a) => c === "git" && a[0] === "config", { status: 0, stdout: "", stderr: "" }],
    [
      "git fetch --no-tags origin main",
      () => {
        fetchCount += 1;
        return { status: 0, stdout: "", stderr: "" };
      },
    ],
    ["git rev-parse origin/main", () => ({ status: 0, stdout: `${fetchCount === 1 ? MAIN_A : MAIN_B}\n`, stderr: "" })],
    [(c, a) => c === "git" && a[0] === "merge-base", { status: 1, stdout: "", stderr: "" }],
    [(c, a) => c === "git" && a[0] === "show", { status: 0, stdout: "// guard\n", stderr: "" }],
    [(c, a) => c === "node" && a[0] === "/tmp/runner/blog-publish-guard.mjs", { status: 0, stdout: "", stderr: "" }],
    [(c, a) => c === "git" && a[0] === "checkout", { status: 0, stdout: "", stderr: "" }],
    [(c, a) => c === "git" && a[0] === "merge", { status: 0, stdout: "", stderr: "" }],
    [
      "git rev-parse HEAD",
      () => {
        revParseHeadCount += 1;
        return { status: 0, stdout: `${revParseHeadCount === 1 ? MERGE_1 : MERGE_2}\n`, stderr: "" };
      },
    ],
    [(c, a) => c === "git" && a[0] === "push" && a[2]?.startsWith("HEAD:refs/heads/site/blog-publish-"), { status: 0, stdout: "", stderr: "" }],
    [(c, a) => c === "gh" && a[0] === "workflow" && a[1] === "run", { status: 0, stdout: "", stderr: "" }],
    [
      (c, a) => c === "gh" && a[0] === "run" && a[1] === "list",
      (c, a) => {
        const isFirst = a.includes("site/blog-publish-99-1-a1");
        return {
          status: 0,
          stdout: JSON.stringify([{ databaseId: isFirst ? 9101 : 9102, headSha: isFirst ? MERGE_1 : MERGE_2 }]),
          stderr: "",
        };
      },
    ],
    [(c, a) => c === "gh" && a[0] === "run" && a[1] === "watch", { status: 0, stdout: "", stderr: "" }],
    [
      "git push origin HEAD:main",
      () => {
        pushMainCount += 1;
        if (pushMainCount === 1) return { status: 1, stdout: "", stderr: "! [rejected] HEAD -> main (fetch first)" };
        return { status: 0, stdout: "", stderr: "" };
      },
    ],
    ["git ls-remote origin refs/heads/main", { status: 0, stdout: `${MAIN_B}\trefs/heads/main\n`, stderr: "" }],
    // Attempt 1 temp-branch cleanup fails transiently (network error) — must NOT abort attempt 2!
    ["git ls-remote --exit-code origin refs/heads/site/blog-publish-99-1-a1", { status: 128, stdout: "", stderr: "fatal: unable to access: Could not resolve host" }],
    [
      (c, a) => c === "git" && a[0] === "ls-remote" && a[1] === "--exit-code",
      (c, a) => {
        const ref = a[3];
        const sha = ref.endsWith("-a2") ? MERGE_2 : BLOG_SHA;
        return { status: 0, stdout: `${sha}\t${ref}\n`, stderr: "" };
      },
    ],
    [(c, a) => c === "git" && a[0] === "push" && a[1]?.startsWith("--force-with-lease="), { status: 0, stdout: "", stderr: "" }],
  ]);

  const result = await publishBlogBranch({
    branch: BRANCH,
    headSha: BLOG_SHA,
    runId: "99",
    runAttempt: "1",
    runnerTemp: "/tmp/runner",
    exec: h.exec,
    sleep: h.sleep,
    log: h.log,
    writeFile: h.writeFile,
    appendFile: h.appendFile,
  });

  assert.equal(result.status, "published");
  assert.equal(result.attempt, 2);
  assert.ok(h.logs.some((line) => line.includes("deferred to cleanup step")));
});
