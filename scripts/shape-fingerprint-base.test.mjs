import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { changedFingerprints, checkBase, FINGERPRINTS_DIR, LEGACY_FINGERPRINTS } from "./shape-fingerprint-base.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);
const folders = [];
after(() => folders.forEach((folder) => rmSync(folder, { recursive: true, force: true })));

function repository() {
  const root = mkdtempSync(join(tmpdir(), "fingerprint-base-"));
  folders.push(root);
  const git = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.test", "-c", "core.hooksPath=/dev/null", ...args], { cwd: root, encoding: "utf8" }).trim();
  const write = (value) => {
    const dir = join(root, FINGERPRINTS_DIR);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    if (typeof value === "string") {
      writeFileSync(join(dir, "s.json"), value);
      return;
    }
    for (const [id, versions] of Object.entries(value)) {
      writeFileSync(join(dir, `${id.replaceAll(".", "-")}.json`), JSON.stringify({ [id]: versions }));
    }
  };
  const writeLegacy = (value) => {
    mkdirSync(dirname(join(root, LEGACY_FINGERPRINTS)), { recursive: true });
    writeFileSync(join(root, LEGACY_FINGERPRINTS), typeof value === "string" ? value : JSON.stringify(value));
  };
  const commit = (value) => {
    if (value !== undefined) write(value);
    git("add", "-A");
    git("commit", "--quiet", "--allow-empty", "-m", "c");
    return git("rev-parse", "HEAD");
  };
  git("init", "--quiet", "-b", "main");
  return { root, git, write, writeLegacy, commit };
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
  rmSync(join(root, FINGERPRINTS_DIR), { recursive: true, force: true });
  assert.equal(checkBase(root, { ci: false }).ok, false);
});

test("reads a legacy single fingerprint file from the base commit during migration to the folder", () => {
  const { root, git, writeLegacy, write, commit } = repository();
  writeLegacy({ "mul.column": { 1: A } });
  const base = commit();
  git("update-ref", "refs/remotes/origin/main", base);
  rmSync(join(root, LEGACY_FINGERPRINTS));
  write({ "mul.column": { 1: A, 2: B } });
  commit();
  assert.equal(checkBase(root, { ci: false }).ok, true);
  write({ "mul.column": { 1: B, 2: B } });
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

test("CI compares a push of several commits with the tip before the push, and fetches it when it is not there", () => {
  const { root, git, commit } = repository();
  const before = commit({ s: { 1: A } });
  commit({ s: { 1: B } });
  commit();
  assert.equal(checkBase(root, { ci: true }).ok, true, "the first parent already holds the change");
  assert.equal(checkBase(root, { ci: true, before }).ok, false);
  git("config", "uploadpack.allowAnySHA1InWant", "true");
  const shallow = mkdtempSync(join(tmpdir(), "fingerprint-push-"));
  folders.push(shallow);
  execFileSync("git", ["clone", "--quiet", "--depth", "2", `file://${root}`, shallow], { stdio: "ignore" });
  const fetched = checkBase(shallow, { ci: true, before });
  assert.match(fetched.text.join(), /s version 1 changed/);
  assert.equal(fetched.ok, false);
});

test("CI fails when the tip before a push cannot be found, and uses the first parent for a new branch", () => {
  const { root, commit } = repository();
  commit({ s: { 1: A } });
  commit({ s: { 1: A, 2: B } });
  const lost = checkBase(root, { ci: true, before: "c".repeat(40) });
  assert.equal(lost.ok, false);
  assert.match(lost.text.join(), /^FAIL: this checkout does not have the tip before the push/);
  for (const before of ["0".repeat(40), "", undefined]) assert.equal(checkBase(root, { ci: true, before }).ok, true);
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
  assert.match(scope, /EVENT_BEFORE: \$\{\{ github\.event\.before \}\}\n {8}run: node scripts\/shape-fingerprint-base\.mjs\n/);
});

test("two branches that each add a shape merge cleanly with the committed .gitattributes and per-shape fingerprint folder", () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const attrs = readFileSync(join(repoRoot, ".gitattributes"), "utf8");
  const idxFile = "src/lib/workbook-v2/shapes/index.ts";
  const regFile = "src/lib/workbook-v2/testing/shape-registrations.ts";
  const makeIdx = (names) => [
    ...names.map((n) => `import { ${n} } from "./${n}";`),
    'import type { Shape } from "./shape";',
    "",
    'export type { Item, Shape } from "./shape";',
    "export type ShapeLibrary = ReadonlyMap<string, Shape>;",
    "export function shapeLibrary(shapes: readonly Shape[]): ShapeLibrary { return new Map(shapes.map((s) => [s.id, s])); }",
    "export const SHAPES: ShapeLibrary = shapeLibrary([",
    ...names.map((n) => `  ${n},`),
    "]);",
    "",
  ].join("\n");
  const makeReg = (names) => [
    "// Registrations.",
    'import type { ShapeRegistration } from "./shape-registration";',
    ...names.map((n) => `import { ${n} } from "./registrations/${n}";`),
    "",
    "// Separator line 1.",
    "// Separator line 2.",
    "// Separator line 3.",
    "export const SHAPE_REGISTRATIONS: readonly ShapeRegistration[] = [",
    ...names.map((n) => `  ${n},`),
    "];",
    "",
  ].join("\n");
  for (const [label, baseNames, aNames, bNames, addedA, addedB] of [
    ["same middle", ["aShape", "zShape"], ["aShape", "m1Shape", "zShape"], ["aShape", "m2Shape", "zShape"], "m1.shape", "m2.shape"],
    ["end", ["aShape", "mShape"], ["aShape", "mShape", "xShape"], ["aShape", "mShape", "yShape"], "x.shape", "y.shape"],
    ["start", ["mShape", "zShape"], ["aShape", "mShape", "zShape"], ["bShape", "mShape", "zShape"], "a.shape", "b.shape"],
  ]) {
    const { root, git } = repository();
    const put = (rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
    put(".gitattributes", attrs);
    put(idxFile, makeIdx(baseNames));
    put(regFile, makeReg(baseNames));
    put(`${FINGERPRINTS_DIR}/base-shape.json`, JSON.stringify({ "base.shape": { 1: A } }));
    git("add", "-A"); git("commit", "--quiet", "-m", "base");
    git("checkout", "--quiet", "-b", "branch-a");
    put(idxFile, makeIdx(aNames));
    put(regFile, makeReg(aNames));
    put(`${FINGERPRINTS_DIR}/${addedA.replaceAll(".", "-")}.json`, JSON.stringify({ [addedA]: { 1: A } }));
    git("add", "-A"); git("commit", "--quiet", "-m", "a");
    git("checkout", "--quiet", "main");
    git("checkout", "--quiet", "-b", "branch-b");
    put(idxFile, makeIdx(bNames));
    put(regFile, makeReg(bNames));
    put(`${FINGERPRINTS_DIR}/${addedB.replaceAll(".", "-")}.json`, JSON.stringify({ [addedB]: { 1: B } }));
    git("add", "-A"); git("commit", "--quiet", "-m", "b");
    git("merge", "--quiet", "--no-edit", "branch-a");
    for (const file of [idxFile, regFile]) {
      const merged = readFileSync(join(root, file), "utf8");
      assert.equal(merged.includes("<<<<"), false, `${label}: ${file} conflict`);
      assert.equal((merged.match(/^export const /gm) ?? []).length, 1, `${label}: ${file} duplicate export`);
      assert.equal((merged.match(/^  \w+Shape,$/gm) ?? []).length, baseNames.length + 2, `${label}: ${file} items`);
    }
    assert.equal(checkBase(root, { ci: true }).ok, true, `${label}: fingerprint check`);
  }
});
