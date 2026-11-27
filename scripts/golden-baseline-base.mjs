#!/usr/bin/env node
/**
 * Compares the committed synthetic golden baselines (`src/lib/workbook-v2/fixtures/golden/*.json`) against the base
 * commit of this branch. A branch cannot silence a golden change by editing or deleting a committed baseline: every
 * page that differs from the base baseline must be accepted in `accepted.json` with the new hashes (by Cedric for any
 * pixel, added, or removed page change; by Savar or Cedric for a model-only change).
 *
 * Mirrors `scripts/shape-fingerprint-base.mjs` and runs in the `scope` job with zero npm dependencies.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const GOLDEN_DIR = "src/lib/workbook-v2/fixtures/golden";
const ACCEPTED_NAME = "accepted.json";
const APPROVERS = ["cedric", "savar"];
const HEX = /^[0-9a-f]{64}$/;
const NONE = "none";

const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isHash = (v) => typeof v === "string" && (HEX.test(v) || v === NONE);

function readAccepted(raw) {
  if (!Array.isArray(raw)) return { ok: false, problems: ["accepted.json must be a JSON list."] };
  const problems = [];
  for (const [i, entry] of raw.entries()) {
    const at = `Accepted entry ${i + 1}`;
    if (!isObject(entry)) {
      problems.push(`${at} must be an object.`);
      continue;
    }
    if (Object.keys(entry).sort().join(",") !== "approver,book,imageSha256,modelSha256,page,reason") {
      problems.push(`${at} must have exactly book, page, approver, reason, modelSha256 and imageSha256.`);
    }
    if (typeof entry.book !== "string" || entry.book === "") problems.push(`${at}: book must be a golden book name.`);
    if (typeof entry.page !== "number" || !Number.isSafeInteger(entry.page) || entry.page < 1) problems.push(`${at}: page must be a whole number >= 1.`);
    if (!APPROVERS.includes(entry.approver)) problems.push(`${at}: approver must be cedric or savar.`);
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") problems.push(`${at}: reason must not be empty.`);
    if (!isHash(entry.modelSha256) || !isHash(entry.imageSha256)) problems.push(`${at}: modelSha256 and imageSha256 must be SHA-256 hashes or "none".`);
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, entries: raw };
}

function isValidBaseline(raw) {
  return isObject(raw) && raw.format === 1 && typeof raw.renderer === "string" && Array.isArray(raw.books)
    && raw.books.every((b) => isObject(b) && typeof b.book === "string" && Array.isArray(b.pages)
      && b.pages.every((p) => isObject(p) && typeof p.page === "number" && isHash(p.modelSha256) && isHash(p.imageSha256)));
}

function isAccepted(book, page, modelSha256, imageSha256, childVisible, accepted) {
  return accepted.some((e) =>
    e.book === book && e.page === page
    && e.modelSha256 === modelSha256 && e.imageSha256 === imageSha256
    && typeof e.reason === "string" && e.reason.trim() !== ""
    && (childVisible ? e.approver === "cedric" : APPROVERS.includes(e.approver)),
  );
}

/**
 * Compares `baseFiles` (`{ [filename]: baseline }`) against `nowFiles` and `acceptedRaw`.
 * Returns a list of human-readable problems (empty when every baseline change is properly accepted).
 */
export function compareGoldenBaselines(baseFiles, nowFiles, acceptedRaw) {
  const parsedAccepted = readAccepted(acceptedRaw);
  if (!parsedAccepted.ok) return parsedAccepted.problems;
  const accepted = parsedAccepted.entries;
  const problems = [];

  for (const [name, nowBaseline] of Object.entries(nowFiles).sort(([a], [b]) => a.localeCompare(b))) {
    if (!isValidBaseline(nowBaseline)) {
      problems.push(`${name}: committed baseline is not a valid format 1 golden baseline.`);
    } else if (!nowBaseline.renderer.startsWith("typst@")) {
      problems.push(`${name}: committed baseline must use pinned Typst (got renderer ${JSON.stringify(nowBaseline.renderer)}).`);
    }
  }

  for (const [name, baseBaseline] of Object.entries(baseFiles).sort(([a], [b]) => a.localeCompare(b))) {
    if (!isValidBaseline(baseBaseline)) {
      problems.push(`${name}: base baseline is invalid.`);
      continue;
    }
    if (!Object.hasOwn(nowFiles, name)) {
      problems.push(`${name}: committed golden baseline was removed.`);
      continue;
    }
    const nowBaseline = nowFiles[name];
    if (!isValidBaseline(nowBaseline)) continue;
    const nowByBook = new Map(nowBaseline.books.map((b) => [b.book, b]));
    for (const baseBook of baseBaseline.books) {
      const nowBook = nowByBook.get(baseBook.book);
      if (!nowBook) {
        problems.push(`${name}: golden book ${baseBook.book} was removed from the baseline.`);
        continue;
      }
      const total = Math.max(baseBook.pages.length, nowBook.pages.length);
      for (let i = 0; i < total; i++) {
        const was = baseBook.pages[i];
        const now = nowBook.pages[i];
        const nowModel = now ? now.modelSha256 : NONE;
        const nowImage = now ? now.imageSha256 : NONE;
        if (was && now && was.modelSha256 === nowModel && was.imageSha256 === nowImage) continue;
        const childVisible = !was || !now || was.imageSha256 !== nowImage;
        if (!isAccepted(baseBook.book, i + 1, nowModel, nowImage, childVisible, accepted)) {
          const who = childVisible ? "cedric" : "savar or cedric";
          problems.push(`${baseBook.book} page ${i + 1} changed in the committed baseline without an accepted entry by ${who} for model ${nowModel}, image ${nowImage}.`);
        }
      }
    }
  }
  return problems;
}

function git(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readDiskBaselines(root) {
  const dir = join(root, GOLDEN_DIR);
  if (!existsSync(dir)) return { baselines: {}, accepted: [] };
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const baselines = {};
  let accepted = [];
  for (const name of files) {
    const parsed = parseJson(readFileSync(join(dir, name), "utf8"));
    if (name === ACCEPTED_NAME) accepted = parsed;
    else baselines[name] = parsed;
  }
  return { baselines, accepted };
}

function readGitBaselines(root, base) {
  const listed = git(root, ["ls-tree", "-r", "--name-only", base, "--", GOLDEN_DIR]);
  if (listed === null) return { status: "error" };
  const paths = listed.split("\n").filter((p) => p.endsWith(".json") && !p.endsWith(`/${ACCEPTED_NAME}`)).sort();
  if (paths.length === 0) return { status: "none", baselines: {} };
  const baselines = {};
  for (const p of paths) {
    const name = p.slice(GOLDEN_DIR.length + 1);
    baselines[name] = parseJson(git(root, ["show", `${base}:${p}`]) ?? "");
  }
  return { status: "found", baselines };
}

const commitOf = (root, name) => git(root, ["rev-parse", "--verify", "--quiet", `${name}^{commit}`]);

function tipBefore(root, before) {
  const known = commitOf(root, before);
  if (known) return known;
  git(root, ["fetch", "--quiet", "--depth=1", "origin", before]);
  return commitOf(root, before);
}

/** Checks committed golden baselines against the branch base. */
export function checkGoldenBase(root, { ci, before = "" }) {
  const isPush = ci && /^[0-9a-f]{40}$/.test(before) && !/^0+$/.test(before);
  const place = isPush ? `the tip before the push (${before.slice(0, 9)})` : ci ? "the first parent of HEAD" : "the merge base with origin/main";
  const base = isPush ? tipBefore(root, before) : ci ? commitOf(root, "HEAD^1") : git(root, ["merge-base", "HEAD", "origin/main"]);
  const disk = readDiskBaselines(root);
  if (!base) {
    const diskProblems = compareGoldenBaselines({}, disk.baselines, disk.accepted);
    if (diskProblems.length > 0) return { ok: false, text: diskProblems };
    return { ok: !ci, text: [`${ci ? "FAIL" : "Warning"}: this checkout does not have ${place}, so golden baselines could not be compared with the base.`] };
  }
  const stored = readGitBaselines(root, base);
  if (stored.status === "error") return { ok: false, text: [`FAIL: the golden baselines of ${base} cannot be listed.`] };
  const problems = compareGoldenBaselines(stored.baselines, disk.baselines, disk.accepted);
  if (problems.length > 0) return { ok: false, text: problems };
  if (stored.status === "none") return { ok: true, text: [`The base ${base.slice(0, 9)} has no golden baselines yet.`] };
  return { ok: true, text: [`Committed golden baselines match ${place} (${base.slice(0, 9)}) or accepted.json.`] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { ok, text } = checkGoldenBase(resolve(dirname(fileURLToPath(import.meta.url)), ".."), { ci: Boolean(process.env.CI), before: process.env.EVENT_BEFORE });
  (ok ? process.stdout : process.stderr).write(`${text.join("\n")}\n`);
  if (!ok) process.exitCode = 1;
}
