import { join } from "node:path";
import { isPlainObject, parseStrictUtf8Json } from "./import-photos";
import { writeSafeOutputFile } from "./output-guard";
import { readRegularFileIfExists } from "./read-file";
import { isSourceRef } from "./validate";

// The digests that tie a page checked by a person to its record and its photo. reference:check
// writes them; compare, extract and import read them. They are in a file of their own beside
// status.json, because status.json is a map of text that import and older kits read. The name does
// not end in ".json": older kits treat each other .json file in that folder as a page record.
export const CHECKED_DIGESTS_FILE = "checked-pages.digests";

export const CHECK_RECORD_CHANGED_REASON = "record changed after the check" as const;
export const CHECK_PHOTO_CHANGED_REASON = "photo changed after the check" as const;
export const CHECK_PHOTO_MISSING_REASON = "photo of the check is missing" as const;
export const CHECK_WITHOUT_DIGESTS_REASON = "checked before the photo check was saved" as const;
export const CHECK_NOT_MARKED_REASON = "check does not count any more (check the page again)" as const;

// Why the check of a page does not count. Part of PAGE_STOP_REASONS.
export const CHECK_PROBLEM_REASONS = [
  CHECK_RECORD_CHANGED_REASON,
  CHECK_PHOTO_CHANGED_REASON,
  CHECK_PHOTO_MISSING_REASON,
  CHECK_WITHOUT_DIGESTS_REASON,
  CHECK_NOT_MARKED_REASON,
] as const;
export type CheckProblemReason = (typeof CHECK_PROBLEM_REASONS)[number];

export interface CheckedDigest {
  record_sha256: string;
  photo_sha256: string;
}

export interface CheckedDigests {
  pages: Map<string, CheckedDigest>;
  // Pages that a person checked before the digests existed. They have no digest until the person
  // checks them again; the list only keeps compare from writing over their records.
  checkedBefore: Set<string>;
}

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

function parseCheckedDigests(raw: unknown): CheckedDigests {
  if (!isPlainObject(raw) || raw.version !== 1) throw new Error("expected an object with version 1");
  if (!Array.isArray(raw.pages)) throw new Error("pages is not a list");
  if (!Array.isArray(raw.checked_before)) throw new Error("checked_before is not a list");
  const pages = new Map<string, CheckedDigest>();
  raw.pages.forEach((entry: unknown, i) => {
    if (!isPlainObject(entry) || !isSourceRef(entry.source_ref)) {
      throw new Error(`pages[${i}] has no valid source_ref`);
    }
    const { source_ref, record_sha256, photo_sha256 } = entry;
    if (pages.has(source_ref)) throw new Error(`pages[${i}] is a second entry for ${source_ref}`);
    for (const value of [record_sha256, photo_sha256]) {
      if (typeof value !== "string" || !SHA256_HEX_RE.test(value)) {
        throw new Error(`pages[${i}] (${source_ref}) has a digest that is not a SHA-256`);
      }
    }
    pages.set(source_ref, {
      record_sha256: record_sha256 as string,
      photo_sha256: photo_sha256 as string,
    });
  });
  const checkedBefore = new Set<string>();
  raw.checked_before.forEach((ref: unknown, i) => {
    if (!isSourceRef(ref)) throw new Error(`checked_before[${i}] is not a page id`);
    checkedBefore.add(ref);
  });
  return { pages, checkedBefore };
}

// A missing file is an older folder (no digests). A damaged file is an error that names the file.
export function readCheckedDigests(finalDir: string): CheckedDigests {
  const filePath = join(finalDir, CHECKED_DIGESTS_FILE);
  const bytes = readRegularFileIfExists(filePath);
  if (bytes === null) return { pages: new Map(), checkedBefore: new Set() };
  try {
    return parseCheckedDigests(parseStrictUtf8Json(bytes));
  } catch (err) {
    throw new Error(`Damaged file ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function formatCheckedDigests(digests: CheckedDigests): string {
  const pages = [...digests.pages].map(([source_ref, d]) => ({
    source_ref,
    record_sha256: d.record_sha256,
    photo_sha256: d.photo_sha256,
  }));
  return `${JSON.stringify({ version: 1, pages, checked_before: [...digests.checkedBefore] }, null, 2)}\n`;
}

export function writeCheckedDigests(
  finalDir: string,
  digests: CheckedDigests,
  repoRoot: string,
): void {
  // A page id that the next read would refuse never enters the file.
  const badRef = [...digests.pages.keys(), ...digests.checkedBefore].find((ref) => !isSourceRef(ref));
  if (badRef !== undefined) {
    throw new Error(`Refusing to write ${CHECKED_DIGESTS_FILE}: ${JSON.stringify(badRef)} is not a page id`);
  }
  writeSafeOutputFile(join(finalDir, CHECKED_DIGESTS_FILE), formatCheckedDigests(digests), repoRoot);
}

// The one rule that decides if the check of a page still counts: both digests match what is there
// now. Empty means that it counts.
export function findCheckProblems(
  digest: CheckedDigest | undefined,
  now: { recordSha256: string; photoSha256: string | null },
): CheckProblemReason[] {
  if (digest === undefined) return [CHECK_WITHOUT_DIGESTS_REASON];
  const problems: CheckProblemReason[] = [];
  if (now.recordSha256 !== digest.record_sha256) problems.push(CHECK_RECORD_CHANGED_REASON);
  if (now.photoSha256 === null) problems.push(CHECK_PHOTO_MISSING_REASON);
  else if (now.photoSha256 !== digest.photo_sha256) problems.push(CHECK_PHOTO_CHANGED_REASON);
  return problems;
}

// Import: a human_checked page must still match its digests. A machine_read page that a person
// checked before must match them too: compare keeps its record when the photo changes, so the text
// and the photo may not belong together. The digests of now are those of the bytes that the import
// read and would send.
export function checkCheckedPages(args: {
  finalDir: string;
  statusByRef: ReadonlyMap<string, string>;
  recordSha256ByRef: ReadonlyMap<string, string>;
  plannedPhotos: ReadonlyMap<string, { sha256: string }>;
  problems: string[];
}): void {
  let digests: CheckedDigests;
  try {
    digests = readCheckedDigests(args.finalDir);
  } catch (err) {
    args.problems.push(err instanceof Error ? err.message : String(err));
    return;
  }
  for (const [ref, recordSha256] of args.recordSha256ByRef) {
    const status = args.statusByRef.get(ref) ?? "machine_read";
    const checkedBefore = digests.checkedBefore.has(ref);
    const digest = digests.pages.get(ref);
    const lapsed = status === "machine_read" && (digest !== undefined || checkedBefore);
    if (status !== "human_checked" && !lapsed) continue;
    const photoSha256 = args.plannedPhotos.get(ref)?.sha256 ?? null;
    const causes = findCheckProblems(lapsed && checkedBefore ? undefined : digest, {
      recordSha256,
      photoSha256,
    });
    if (causes.length === 0) continue;
    const photoHint = photoSha256 === null ? " (give the prepared photos with --photos)" : "";
    const what = lapsed
      ? "a person checked this page before and its status is machine_read now"
      : "status.json says human_checked, but";
    args.problems.push(
      `${ref}: ${what}: ${causes.join("; ")}${photoHint}; run reference:compare, then a person runs reference:check for this page`,
    );
  }
}
