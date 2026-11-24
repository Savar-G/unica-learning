#!/usr/bin/env node
/**
 * Compares the committed fingerprints of the workbook shapes with those of the base of this branch. A stored fingerprint
 * says what a version of a shape gave; children have books of that version, so an entry never changes and never goes.
 *
 * In CI the base is the first parent of the commit, which is the base of the pull request in its merge commit. A push can
 * hold several commits, so there the base is the tip of main before the push (EVENT_BEFORE), which is fetched when the
 * checkout does not have it. The `scope` job runs this, because it is the job that always runs. A base that cannot be
 * found fails there. On a laptop the base is the merge base with origin/main, and a checkout without it only warns.
 * It uses no package, so that it runs before `npm ci`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const FINGERPRINTS = "src/lib/workbook-v2/testing/shape-fingerprints.json";

const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isHash = (v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

/** Every entry of the base that is not the same now, in plain words. */
export function changedFingerprints(base, now) {
  if (!isRecord(base)) return ["The fingerprint file of the base is not an object."];
  if (!isRecord(now)) return ["The fingerprint file is not an object."];
  return Object.entries(base).flatMap(([shape, versions]) => {
    if (!isRecord(versions)) return [`The base holds no list of versions for ${shape}.`];
    const current = Object.hasOwn(now, shape) && isRecord(now[shape]) ? now[shape] : {};
    return Object.entries(versions).flatMap(([version, hash]) => {
      if (!isHash(hash)) return [`The base holds no SHA-256 for ${shape} version ${version}.`];
      if (!Object.hasOwn(current, version)) return [`The fingerprint of ${shape} version ${version} is gone.`];
      return current[version] === hash ? [] : [`The fingerprint of ${shape} version ${version} changed. Give the shape a new version and run npm run workbook:v2:fingerprints.`];
    });
  });
}

function git(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const commitOf = (root, name) => git(root, ["rev-parse", "--verify", "--quiet", `${name}^{commit}`]);

/** The tip of the branch before a push. A new branch has none (zeros), and then the first parent is the base. */
function tipBefore(root, before) {
  const known = commitOf(root, before);
  if (known) return known;
  git(root, ["fetch", "--quiet", "--depth=1", "origin", before]);
  return commitOf(root, before);
}

/** The result for one checkout: `ok`, and what to print. `before` is the tip of the branch before a push. */
export function checkBase(root, { ci, before = "" }) {
  const isPush = ci && /^[0-9a-f]{40}$/.test(before) && !/^0+$/.test(before);
  const place = isPush ? `the tip before the push (${before.slice(0, 9)})` : ci ? "the first parent of HEAD" : "the merge base with origin/main";
  const base = isPush ? tipBefore(root, before) : ci ? commitOf(root, "HEAD^1") : git(root, ["merge-base", "HEAD", "origin/main"]);
  if (!base) {
    return { ok: !ci, text: [`${ci ? "FAIL" : "Warning"}: this checkout does not have ${place}, so nothing proves that the stored shape fingerprints are still the same.`] };
  }
  const listed = git(root, ["ls-tree", "--name-only", base, "--", FINGERPRINTS]);
  if (listed === null) return { ok: false, text: [`FAIL: the files of ${base} cannot be listed.`] };
  if (listed === "") return { ok: true, text: [`The base ${base.slice(0, 9)} has no shape fingerprints yet.`] };
  let now = null;
  try {
    now = parse(readFileSync(join(root, FINGERPRINTS), "utf8"));
  } catch {
    // The problem list below says it.
  }
  const problems = changedFingerprints(parse(git(root, ["show", `${base}:${FINGERPRINTS}`]) ?? ""), now);
  return problems.length > 0 ? { ok: false, text: problems } : { ok: true, text: [`The stored shape fingerprints are those of ${place} (${base.slice(0, 9)}).`] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { ok, text } = checkBase(resolve(dirname(fileURLToPath(import.meta.url)), ".."), { ci: Boolean(process.env.CI), before: process.env.EVENT_BEFORE });
  (ok ? process.stdout : process.stderr).write(`${text.join("\n")}\n`);
  if (!ok) process.exitCode = 1;
}
