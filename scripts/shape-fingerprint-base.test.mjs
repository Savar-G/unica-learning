import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { readFileSync } from "node:fs";
import { changedFingerprints, checkBase, FINGERPRINTS } from "./shape-fingerprint-base.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);
const folders = [];
after(() => folders.forEach((folder) => rmSync(folder, { recursive: true, force: true })));

function repository() {
  const root = mkdtempSync(join(tmpdir(), "fingerprint-base-"));
  folders.push(root);
  const git = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.test", "-c", "core.hooksPath=/dev/null", ...args], { cwd: root, encoding: "utf8" }).trim();
  const write = (value) => {
    mkdirSync(dirname(join(root, FINGERPRINTS)), { recursive: true });
    writeFileSync(join(root, FINGERPRINTS), typeof value === "string" ? value : JSON.stringify(value));
  };
  const commit = (value) => {
    if (value !== undefined) write(value);
    git("add", "-A");
    git("commit", "--quiet", "--allow-empty", "-m", "c");
    return git("rev-parse", "HEAD");
  };
  git("init", "--quiet", "-b", "main");
  return { root, git, write, commit };
}

for (const [name, base, now, problem] of [
  ["the same", { s: { 1: A } }, { s: { 1: A } }, null],
  ["a new version", { s: { 1: A } }, { s: { 1: A, 2: B } }, null],
  ["a new shape", { s: { 1: A } }, { s: { 1: A }, t: { 1: B } }, null],
  ["a changed entry", { s: { 1: A } }, { s: { 1: B } }, /s version 1 changed/],
  ["a changed entry of an older version", { s: { 1: A, 2: B } }, { s: { 1: B, 2: B, 3: A } }, /s version 1 changed/],
  ["an entry that is gone", { s: { 1: A, 2: B } }, { s: { 1: A } }, /s version 2 is gone/],
  ["a shape that is gone", { s: { 1: A } }, {}, /s version 1 is gone/],
  ["a shape of another name that is inherited", { constructor: { 1: A } }, {}, /constructor version 1 is gone/],
  ["a shape that is no object now", { s: { 1: A } }, { s: A }, /s version 1 is gone/],
  ["no file now", { s: { 1: A } }, null, /is not an object/],
  ["a base that cannot be read", null, {}, /of the base is not an object/],
  ["a base with no hash", { s: { 1: "" } }, { s: { 1: "" } }, /holds no SHA-256/],
]) {
  test(`comparing: ${name}`, () => {
    const problems = changedFingerprints(base, now);
    if (problem === null) assert.deepEqual(problems, []);
    else assert.match(problems.join("\n"), problem);
  });
}

test("a laptop compares the files on disk with the merge base of origin/main", () => {
  const { root, git, write, commit } = repository();
  const base = commit({ s: { 1: A } });
  git("update-ref", "refs/remotes/origin/main", base);
  commit({ s: { 1: A, 2: B } });
  assert.equal(checkBase(root, { ci: false }).ok, true);
  write({ s: { 1: B, 2: B } });
  assert.deepEqual([checkBase(root, { ci: false }).ok, /version 1 changed/.test(checkBase(root, { ci: false }).text.join())], [false, true]);
  write("not json");
  assert.equal(checkBase(root, { ci: false }).ok, false);
  rmSync(join(root, FINGERPRINTS));
  assert.equal(checkBase(root, { ci: false }).ok, false);
});

test("a laptop with no origin/main warns", () => {
  const { root, commit } = repository();
  commit({ s: { 1: A } });
  const { ok, text } = checkBase(root, { ci: false });
  assert.equal(ok, true);
  assert.match(text.join(), /^Warning: .*merge base with origin\/main/);
});

test("CI compares with the first parent of the merge commit, which is the base of the pull request", () => {
  const { root, git, commit } = repository();
  commit({ s: { 1: A } });
  git("checkout", "--quiet", "-b", "change");
  commit({ s: { 1: B } });
  git("checkout", "--quiet", "main");
  git("merge", "--quiet", "--no-ff", "-m", "m", "change");
  assert.equal(checkBase(root, { ci: true }).ok, false);
  git("checkout", "--quiet", "-b", "good", "main^1");
  commit({ s: { 1: A, 2: B } });
  assert.equal(checkBase(root, { ci: true }).ok, true);
});

test("CI fails in a checkout with no parent, and says so", () => {
  const { root, git, commit } = repository();
  commit({ s: { 1: A } });
  commit({ s: { 1: B } });
  const shallow = mkdtempSync(join(tmpdir(), "fingerprint-shallow-"));
  folders.push(shallow);
  execFileSync("git", ["clone", "--quiet", "--depth", "1", `file://${root}`, shallow], { stdio: "ignore" });
  assert.equal(git("rev-list", "--count", "HEAD"), "2");
  const { ok, text } = checkBase(shallow, { ci: true });
  assert.equal(ok, false);
  assert.match(text.join(), /^FAIL: this checkout does not have the first parent of HEAD/);
});

test("a base with no file has nothing to keep", () => {
  const { root, commit } = repository();
  commit();
  commit({ s: { 1: A } });
  assert.deepEqual(checkBase(root, { ci: true }).ok, true);
});

test("the job of CI that always runs has the parent and runs the check", () => {
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const scope = ci.slice(ci.indexOf("\n  scope:"), ci.indexOf("\n  unit:"));
  assert.match(scope, /fetch-depth: 2\n/);
  assert.match(scope, /run: node scripts\/shape-fingerprint-base\.mjs\n/);
});
