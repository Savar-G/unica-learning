import { lstatSync } from "node:fs";
import { join } from "node:path";
import {
  CHECK_NOT_MARKED_REASON,
  CHECK_PHOTO_MISMATCH_REASON,
  CHECK_PHOTO_MISSING_REASON,
  findCheckProblems,
  loadReportSummary,
  parseStrictUtf8Json,
  readCheckedDigests,
  readRegularFileIfExists,
  readRegularFileNoFollow,
  readStatusMap,
  sha256Hex,
  validateReferenceRecord,
  writeCheckedDigests,
  type CheckedDigests,
  type CheckProblemReason,
  type PagePhoto,
  type ReferenceRecord,
  type ReportDigests,
  type TranscriptStatus,
} from "@/lib/reference-record";
import { fileSlugFromRef } from "./answers";
import type { PhotosManifest } from "./prepare";

// The pages whose final record a person checked, now or before. Compare and extract never write
// over, move or delete such a record; human_checked counts only while its digests match.
export interface CheckedPages {
  status: ReadonlyMap<string, TranscriptStatus>;
  digests: CheckedDigests;
  refs: Set<string>;
  // What the report of the last compare gives for each page (see withDamagedRecords).
  reported: ReadonlyMap<string, ReportDigests>;
}

export function loadCheckedPages(finalDir: string): CheckedPages {
  const status = readStatusMap(finalDir) ?? new Map<string, TranscriptStatus>();
  const digests = readCheckedDigests(finalDir);
  const report = loadReportSummary(finalDir);
  const refs = new Set<string>([
    ...[...status.keys()].filter((ref) => status.get(ref) === "human_checked"),
    ...digests.pages.keys(),
    ...digests.checkedBefore,
    ...report.checkedRefs,
  ]);
  return { status, digests, refs, reported: withDamagedRecords(finalDir, report.digests, status.keys()) };
}

// The record on disk, or null when the file is missing or is not a valid record (a typing mistake of a
// person). A link is an error.
export function loadExistingFinalRecord(filePath: string): ReferenceRecord | null {
  const bytes = readRegularFileIfExists(filePath);
  if (bytes === null) return null;
  try {
    const check = validateReferenceRecord(parseStrictUtf8Json(bytes));
    return check.ok ? check.record : null;
  } catch {
    return null;
  }
}

export function isDamagedFinalRecord(filePath: string): boolean {
  return fileExists(filePath) && loadExistingFinalRecord(filePath) === null;
}

const NO_HASH_OF_DAMAGED_RECORD = "no hash, the record was damaged";

// Compare writes only valid records, so a damaged one is the edit of a person. When the report has no
// hash for its page, no hash matches it: compare keeps the file like each other edited record.
function withDamagedRecords(
  finalDir: string,
  reported: ReadonlyMap<string, ReportDigests>,
  statusRefs: Iterable<string>,
): ReadonlyMap<string, ReportDigests> {
  const next = new Map(reported);
  for (const ref of new Set([...reported.keys(), ...statusRefs])) {
    const digests = reported.get(ref) ?? { record: null, photo: null, finalPhoto: null };
    if (digests.record === null && isDamagedFinalRecord(finalRecordPath(finalDir, ref))) {
      next.set(ref, { ...digests, record: NO_HASH_OF_DAMAGED_RECORD });
    }
  }
  return next;
}

// The final record file of a page.
export function finalFileName(ref: string): string {
  return `${fileSlugFromRef(ref)}.json`;
}

// Some disks see one file in two names that differ only in letter case.
export function finalFileKey(ref: string): string {
  return finalFileName(ref).toLowerCase();
}

// Tells if the final files of a page are those of one of these pages.
export function finalFileGuard(refs: Iterable<string>): (ref: string) => boolean {
  const keys = new Set([...refs].map(finalFileKey));
  return (ref) => keys.has(finalFileKey(ref));
}

function finalRecordPath(finalDir: string, ref: string): string {
  return join(finalDir, finalFileName(ref));
}

export function fileExists(filePath: string): boolean {
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

// The photos of the saved checks whose record is still in final/.
export function keptPhotoDigests(finalDir: string, checked: CheckedPages): string[] {
  const kept = keptCheckedRefs(finalDir, checked);
  return [...checked.digests.pages].filter(([ref]) => kept.has(ref)).map(([, d]) => d.photo_sha256);
}

// Saved checks whose photo_sha256 equals this photo and whose record is still in final/.
export function checkedRefsForPhoto(
  finalDir: string,
  checked: CheckedPages,
  photoSha256: string,
): string[] {
  const kept = keptCheckedRefs(finalDir, checked);
  return [...checked.digests.pages]
    .filter(([ref, d]) => d.photo_sha256 === photoSha256 && kept.has(ref))
    .map(([ref]) => ref);
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

// The photo that import would send with this page. Import refuses a file whose bytes are not the
// ones that the photo list gives, so the page has no photo then.
export function pagePhoto(photosDir: string, manifest: PhotosManifest, ref: string): PagePhoto {
  const entry = manifest.photos.find((p) => p.source_ref === ref);
  const bytes = entry ? readRegularFileIfExists(join(photosDir, entry.file)) : null;
  if (!entry || bytes === null) return { problem: CHECK_PHOTO_MISSING_REASON };
  const sha256 = sha256Hex(bytes);
  return sha256 === entry.sha256 ? { sha256 } : { problem: CHECK_PHOTO_MISMATCH_REASON };
}

// Why the check of a kept page does not count. Empty means that the page is human_checked.
export function pageCheckProblems(opts: {
  finalDir: string;
  checked: CheckedPages;
  ref: string;
  photo: PagePhoto;
}): CheckProblemReason[] {
  const { finalDir, checked, ref, photo } = opts;
  const problems = findCheckProblems(checked.digests.pages.get(ref), {
    recordSha256: sha256Hex(readRegularFileNoFollow(finalRecordPath(finalDir, ref))),
    photo,
  });
  // Only reference:check makes a page human_checked: compare never raises a status to it.
  const marked = checked.status.get(ref) === "human_checked";
  return problems.length === 0 && !marked ? [CHECK_NOT_MARKED_REASON] : problems;
}

