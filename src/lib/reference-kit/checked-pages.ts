import { lstatSync } from "node:fs";
import { join } from "node:path";
import {
  CHECK_NOT_MARKED_REASON,
  findCheckProblems,
  parseStrictUtf8Json,
  readCheckedDigests,
  readRegularFileIfExists,
  readRegularFileNoFollow,
  sha256Hex,
  writeCheckedDigests,
  type CheckedDigests,
  type CheckProblemReason,
} from "@/lib/reference-record";
import { fileSlugFromRef } from "./answers";
import type { PhotosManifest } from "./prepare";

// The pages whose final record a person checked, now or before. Compare and extract never write
// over, move or delete such a record; human_checked counts only while its digests match.
export interface CheckedPages {
  status: Record<string, string>;
  digests: CheckedDigests;
  refs: Set<string>;
}

function readStrictJson(filePath: string): unknown {
  const bytes = readRegularFileIfExists(filePath);
  if (bytes === null) return undefined;
  try {
    return parseStrictUtf8Json(bytes);
  } catch (err) {
    throw new Error(`Damaged file ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function readStatusMap(finalDir: string): Record<string, string> {
  const filePath = join(finalDir, "status.json");
  const raw = readStrictJson(filePath);
  if (raw === undefined) return {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`Damaged file ${filePath}: expected an object`);
  }
  for (const [ref, value] of Object.entries(raw)) {
    if (typeof value !== "string") throw new Error(`Damaged file ${filePath}: ${ref} has no text status`);
  }
  return raw as Record<string, string>;
}

// The kept pages that the last compare listed: a second memory of them, so that the loss of the
// digest file alone does not lose a person's record.
function readReportedKeptRefs(finalDir: string): string[] {
  const filePath = join(finalDir, "report.json");
  const report = readStrictJson(filePath) as { kept_human_checked?: unknown } | null | undefined;
  const kept: unknown = report?.kept_human_checked ?? [];
  if (!Array.isArray(kept)) throw new Error(`Damaged file ${filePath}: kept_human_checked is not a list`);
  return kept.map((row: unknown, i) => {
    const ref = (row as { source_ref?: unknown } | null)?.source_ref;
    if (typeof ref !== "string") {
      throw new Error(`Damaged file ${filePath}: kept_human_checked[${i}] has no source_ref`);
    }
    return ref;
  });
}

export function loadCheckedPages(finalDir: string): CheckedPages {
  const status = readStatusMap(finalDir);
  const digests = readCheckedDigests(finalDir);
  const refs = new Set<string>([
    ...Object.keys(status).filter((ref) => status[ref] === "human_checked"),
    ...digests.pages.keys(),
    ...digests.checkedBefore,
    ...readReportedKeptRefs(finalDir),
  ]);
  return { status, digests, refs };
}

function finalRecordPath(finalDir: string, ref: string): string {
  return join(finalDir, `${fileSlugFromRef(ref)}.json`);
}

function fileExists(filePath: string): boolean {
  try {
    lstatSync(filePath);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

// The checked pages that still have a record file. A person who removes the file lets go of the page.
export function keptCheckedRefs(finalDir: string, checked: CheckedPages): Set<string> {
  return new Set([...checked.refs].filter((ref) => fileExists(finalRecordPath(finalDir, ref))));
}

// True for the photo of a page that a person checked and whose record is still there: the photo of
// the saved check, or each photo with this page id when no digest is saved. extract --force does not
// read it again.
export function isPhotoOfCheck(opts: {
  finalDir: string;
  checked: CheckedPages;
  ref: string;
  photoSha256: string;
}): boolean {
  const { finalDir, checked, ref, photoSha256 } = opts;
  const digest = checked.digests.pages.get(ref);
  return (
    keptCheckedRefs(finalDir, checked).has(ref) &&
    (digest === undefined || digest.photo_sha256 === photoSha256)
  );
}

// Before compare takes human_checked out of status.json, the digest file remembers each kept page.
// No digest is made here: a page with none goes into checked_before.
export function rememberKeptPages(
  finalDir: string,
  checked: CheckedPages,
  kept: ReadonlySet<string>,
  repoRoot: string,
): void {
  const { pages, checkedBefore } = checked.digests;
  const next: CheckedDigests = {
    pages: new Map([...pages].filter(([ref]) => kept.has(ref))),
    checkedBefore: new Set([...kept].filter((ref) => !pages.has(ref))),
  };
  const same =
    next.pages.size === pages.size &&
    next.checkedBefore.size === checkedBefore.size &&
    [...next.checkedBefore].every((ref) => checkedBefore.has(ref));
  if (!same) writeCheckedDigests(finalDir, next, repoRoot);
}

// The SHA-256 of the photo that import would send with this page, or null when there is none.
export function pagePhotoSha256(
  photosDir: string,
  manifest: PhotosManifest | null,
  ref: string,
): string | null {
  const entry = manifest?.photos.find((p) => p.source_ref === ref);
  if (!entry) return null;
  const bytes = readRegularFileIfExists(join(photosDir, entry.file));
  return bytes === null ? null : sha256Hex(bytes);
}

// Why the check of a kept page does not count. Empty means that the page is human_checked.
export function pageCheckProblems(opts: {
  finalDir: string;
  checked: CheckedPages;
  ref: string;
  photoSha256: string | null;
}): CheckProblemReason[] {
  const { finalDir, checked, ref, photoSha256 } = opts;
  const problems = findCheckProblems(checked.digests.pages.get(ref), {
    recordSha256: sha256Hex(readRegularFileNoFollow(finalRecordPath(finalDir, ref))),
    photoSha256,
  });
  // Only reference:check makes a page human_checked: compare never raises a status to it.
  const marked = Object.hasOwn(checked.status, ref) && checked.status[ref] === "human_checked";
  return problems.length === 0 && !marked ? [CHECK_NOT_MARKED_REASON] : problems;
}

// True when the page is human_checked for this photo: its status is marked and both digests match.
export function isCheckedForPhoto(opts: {
  finalDir: string;
  checked: CheckedPages;
  ref: string;
  photoSha256: string;
}): boolean {
  return (
    fileExists(finalRecordPath(opts.finalDir, opts.ref)) && pageCheckProblems(opts).length === 0
  );
}
