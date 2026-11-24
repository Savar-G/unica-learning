import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  assertOutsideRepo,
  prepareSafeOutputDir,
  renderRecordToMarkdown,
  validateReferenceRecord,
  writeSafeOutputFile,
  type ReferenceRecord,
} from "@/lib/reference-record";
import { applyComputedAnswers, fileSlugFromRef } from "./answers";
import {
  classifyComparison,
  collectUnnamedTeachingMarks,
  compareRecords,
  decideStatus,
  emptyAnswerDiffs,
  locateOnceReadInKeptRecord,
  type PageStatus,
} from "./compare";
import {
  loadOriginalNamesByDigest,
  loadPrepareReport,
  loadSlot,
  pairDigest,
  pairSlotPages,
  pickPageWinners,
  readJsonIfExists,
  type PairedPage,
} from "./compare-pairing";
import {
  formatCompareReportMarkdown,
  type CompareWorkReport,
  type DigestMismatchInfo,
  type FailedPhotoReport,
  type KeptHumanCheckedReport,
  type PageCompareReport,
  type SamePageIdConflict,
} from "./compare-report";
import { parsePhotosManifest, PHOTOS_MANIFEST_FILE } from "./prepare";

export {
  formatCompareReportMarkdown,
  type CompareWorkReport,
  type DigestMismatchInfo,
  type FailedPhotoReport,
  type KeptHumanCheckedReport,
  type PageCompareReport,
  type SamePageIdConflict,
};

const FINAL_META_FILES = new Set(["status.json", "report.json"]);

function readStoredSourceRef(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      typeof (parsed as Record<string, unknown>).source_ref === "string"
    ) {
      return (parsed as Record<string, unknown>).source_ref as string;
    }
    return null;
  } catch {
    return null;
  }
}

function sha256OfFile(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function loadExistingFinalRecord(filePath: string): ReferenceRecord | null {
  if (!existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    const check = validateReferenceRecord(parsed);
    return check.ok ? check.record : null;
  } catch {
    return null;
  }
}

function assertNoFileCollisions(
  pairs: readonly PairedPage[],
  existingStatus: Record<string, PageStatus>,
  finalDir: string,
): void {
  const fileToRef = new Map<string, string>();

  for (const pair of pairs) {
    const chosen = pair.recA ?? pair.recB;
    if (!chosen) continue;
    const sourceRef = chosen.source_ref;

    const fileName = `${fileSlugFromRef(sourceRef)}.json`;
    const prior = fileToRef.get(fileName);
    if (prior && prior !== sourceRef) {
      throw new Error(
        `Refusing to write: "${sourceRef}" and "${prior}" both map to "${fileName}"`,
      );
    }
    fileToRef.set(fileName, sourceRef);

    const storedRef = readStoredSourceRef(join(finalDir, fileName));
    if (storedRef !== null && storedRef !== sourceRef) {
      throw new Error(
        `Refusing to overwrite "${fileName}": existing file holds source_ref "${storedRef}", not "${sourceRef}"`,
      );
    }
  }

  for (const existingRef of Object.keys(existingStatus)) {
    const fileName = `${fileSlugFromRef(existingRef)}.json`;
    const prior = fileToRef.get(fileName);
    if (prior && prior !== existingRef) {
      throw new Error(
        `Refusing to write: "${prior}" collides with existing "${existingRef}" on "${fileName}"`,
      );
    }
    fileToRef.set(fileName, existingRef);
  }
}

// The manifest gives a page id only to the photo whose readings made the final record, so it holds
// at most one entry for each page id. A kept human_checked page with no current readings keeps the
// page id it already has.
function syncManifestSourceRefs(
  workDir: string,
  winners: readonly PairedPage[],
  keptStaleRefs: ReadonlySet<string>,
  repoRoot: string,
): void {
  const manifestPath = join(workDir, "photos", PHOTOS_MANIFEST_FILE);
  if (!existsSync(manifestPath)) return;
  let manifest;
  try {
    manifest = parsePhotosManifest(JSON.parse(readFileSync(manifestPath, "utf8")) as unknown);
  } catch {
    return;
  }
  const refByDigest = new Map<string, string>();
  for (const pair of winners) {
    const digest = pairDigest(pair);
    const ref = (pair.recA ?? pair.recB)?.source_ref;
    if (digest && ref && !refByDigest.has(digest)) refByDigest.set(digest, ref);
  }
  const assigned = new Set<string>();
  const photos = manifest.photos.map((entry) => {
    const { source_ref: oldRef, ...rest } = entry;
    const winnerRef = refByDigest.get(entry.sha256);
    const ref = winnerRef ?? (oldRef && keptStaleRefs.has(oldRef) ? oldRef : undefined);
    if (!ref || assigned.has(ref)) return rest;
    assigned.add(ref);
    return { ...rest, source_ref: ref };
  });
  const next = `${JSON.stringify({ version: 1, photos }, null, 2)}\n`;
  if (next !== `${JSON.stringify(manifest, null, 2)}\n`) {
    writeSafeOutputFile(manifestPath, next, repoRoot);
  }
}

// The final record holds reader a's content. When both readers read the same photo, it names both.
function withBothReaders(chosen: ReferenceRecord, pair: PairedPage): ReferenceRecord {
  if (!pair.recA || !pair.recB || !pair.sameDigest) return chosen;
  const readers = [...new Set([...(pair.recA.readers ?? []), ...(pair.recB.readers ?? [])])];
  return readers.length > 0 ? { ...chosen, readers } : chosen;
}

function mergeNotes(existing: readonly string[], added: readonly string[]): string[] {
  if (added.length === 0) return [...existing];
  const seen = new Set(existing);
  const out = [...existing];
  for (const note of added) {
    if (!seen.has(note)) {
      seen.add(note);
      out.push(note);
    }
  }
  return out;
}

export function compareWorkFolder(opts: {
  workDir: string;
  repoRoot: string;
}): CompareWorkReport {
  const repoRoot = resolve(opts.repoRoot);
  const workDir = resolve(opts.workDir);
  assertOutsideRepo(workDir, repoRoot);

  const originalNamesByDigest = loadOriginalNamesByDigest(workDir);
  const prepareReport = loadPrepareReport(workDir);
  const slotA = loadSlot(join(workDir, "reader-a"));
  const slotB = loadSlot(join(workDir, "reader-b"));
  const paired = pairSlotPages(slotA, slotB, originalNamesByDigest);
  const { failedPhotos, bothFailedPhotos } = paired;
  const { winners: pairs, conflicts } = pickPageWinners(paired.pairs);

  const finalDir = prepareSafeOutputDir(join(workDir, "final"), repoRoot);
  const viewDir = prepareSafeOutputDir(join(workDir, "final-view"), repoRoot);

  const existingStatus =
    readJsonIfExists<Record<string, PageStatus>>(join(finalDir, "status.json")) ?? {};
  // The hash of each final record as the last compare wrote it. Another hash on disk means that a
  // person changed the file.
  const previousHashes = new Map<string, string>();
  const previousReport = readJsonIfExists<Partial<CompareWorkReport>>(join(finalDir, "report.json"));
  for (const page of previousReport?.pages ?? []) {
    if (typeof page.final_record_sha256 === "string") {
      previousHashes.set(page.source_ref, page.final_record_sha256);
    }
  }

  assertNoFileCollisions(pairs, existingStatus, finalDir);

  const pages: PageCompareReport[] = [];
  const singleReaderPages: Array<{ source_ref: string; reader: "a" | "b" }> = [];
  const keptHumanChecked: KeptHumanCheckedReport[] = [];
  const removedStalePages: string[] = [];
  const statusMap: Record<string, PageStatus> = {};
  const seenFinalRefs = new Set<string>();
  const keptFinalFiles = new Set<string>();

  for (const pair of pairs) {
    const chosen = pair.recA ?? pair.recB;
    if (!chosen) continue;

    const sourceRef = chosen.source_ref;
    seenFinalRefs.add(sourceRef);
    const slug = fileSlugFromRef(sourceRef);
    const finalFileName = `${slug}.json`;
    const finalRecordPath = join(finalDir, finalFileName);
    keptFinalFiles.add(finalFileName);

    const onlyIn: "a" | "b" | null =
      pair.recA && !pair.recB ? "a" : !pair.recA && pair.recB ? "b" : null;
    if (onlyIn) {
      singleReaderPages.push({ source_ref: sourceRef, reader: onlyIn });
    }

    const allDiffs = pair.recA && pair.recB ? compareRecords(pair.recA, pair.recB) : [];
    const classified = classifyComparison(pair.recA, pair.recB);
    const unnamedTeachingMarks = collectUnnamedTeachingMarks(pair.recA, pair.recB);

    const isChecked = existingStatus[sourceRef] === "human_checked" && existsSync(finalRecordPath);
    const existingKept = isChecked ? loadExistingFinalRecord(finalRecordPath) : null;

    if (isChecked && !existingKept) {
      // A person checked this page and the file is not a valid record now: never write over it.
      statusMap[sourceRef] = "human_checked";
      keptHumanChecked.push({
        source_ref: sourceRef,
        in_current_batch: true,
        differs_from_reader_a: false,
        differs_from_reader_b: false,
        diff_count_a: 0,
        diff_count_b: 0,
        invalid: true,
      });
      pages.push({
        source_ref: sourceRef,
        photo: pair.photo,
        original_name: pair.originalName,
        photo_sha256: pair.photoSha256,
        status: "human_checked",
        only_in_reader: onlyIn,
        digest_mismatch: pair.digestMismatch,
        differences: classified.differences,
        wording: classified.wording,
        once_read: locateOnceReadInKeptRecord(classified.once_read, null),
        both_unclear: classified.both_unclear,
        one_unclear: classified.one_unclear,
        // The kept file is not a valid record, so its answer places cannot be read.
        empty_answer: [],
        needs_person_read: classified.needs_person_read,
        unnamed_teaching_marks: unnamedTeachingMarks,
        reader_notes: { a: pair.notesA, b: pair.notesB },
      });
      continue;
    }

    if (existingKept) {
      statusMap[sourceRef] = "human_checked";
      const diffsA = pair.recA ? compareRecords(existingKept, pair.recA) : [];
      const diffsB = pair.recB ? compareRecords(existingKept, pair.recB) : [];
      keptHumanChecked.push({
        source_ref: sourceRef,
        in_current_batch: true,
        differs_from_reader_a: diffsA.length > 0,
        differs_from_reader_b: diffsB.length > 0,
        diff_count_a: diffsA.length,
        diff_count_b: diffsB.length,
      });

      pages.push({
        source_ref: sourceRef,
        photo: pair.photo,
        original_name: pair.originalName,
        photo_sha256: pair.photoSha256,
        status: "human_checked",
        only_in_reader: onlyIn,
        digest_mismatch: pair.digestMismatch,
        differences: classified.differences,
        wording: classified.wording,
        once_read: locateOnceReadInKeptRecord(classified.once_read, existingKept),
        both_unclear: classified.both_unclear,
        one_unclear: classified.one_unclear,
        empty_answer: emptyAnswerDiffs(existingKept, pair.recA, pair.recB),
        needs_person_read: classified.needs_person_read,
        unnamed_teaching_marks: unnamedTeachingMarks,
        reader_notes: { a: pair.notesA, b: pair.notesB },
      });
      continue;
    }

    const { record: finalRecord, notes: computedNotes } = applyComputedAnswers(
      withBothReaders(chosen, pair),
    );
    const readerNotes = pair.recA
      ? { a: mergeNotes(pair.notesA, computedNotes), b: pair.notesB }
      : { a: pair.notesA, b: mergeNotes(pair.notesB, computedNotes) };
    const finalEmptyAnswers = emptyAnswerDiffs(finalRecord, pair.recA, pair.recB);
    const status = decideStatus({
      hasA: pair.recA !== null,
      hasB: pair.recB !== null,
      familyA: slotA.meta?.family ?? null,
      familyB: slotB.meta?.family ?? null,
      diffs: [...allDiffs, ...finalEmptyAnswers],
      sameDigest: pair.sameDigest,
    });

    // A final record that a person changed since the last compare is kept until the person
    // checks it. The page is then not double_read: the file is no longer what the readers wrote.
    const previousHash = previousHashes.get(sourceRef);
    const editedByPerson =
      previousHash !== undefined &&
      existsSync(finalRecordPath) &&
      sha256OfFile(finalRecordPath) !== previousHash;
    // The record that stays on disk: the edited file, or the record that compare writes.
    const editedRecord = editedByPerson ? loadExistingFinalRecord(finalRecordPath) : null;
    const finalText = `${JSON.stringify(finalRecord, null, 2)}\n`;
    const pageStatus: PageStatus = editedByPerson ? "machine_read" : status;
    statusMap[sourceRef] = pageStatus;

    if (!editedByPerson) {
      writeSafeOutputFile(finalRecordPath, finalText, repoRoot);
      writeSafeOutputFile(
        join(viewDir, `${slug}.md`),
        `${renderRecordToMarkdown(finalRecord)}\n`,
        repoRoot,
      );
    }

    pages.push({
      source_ref: sourceRef,
      photo: pair.photo,
      original_name: pair.originalName,
      photo_sha256: pair.photoSha256,
      final_record_sha256: editedByPerson
        ? (previousHash ?? null)
        : createHash("sha256").update(finalText, "utf8").digest("hex"),
      ...(editedByPerson ? { edited_by_person: true } : {}),
      status: pageStatus,
      only_in_reader: onlyIn,
      digest_mismatch: pair.digestMismatch,
      differences: classified.differences,
      wording: classified.wording,
      once_read: editedByPerson
        ? locateOnceReadInKeptRecord(classified.once_read, editedRecord)
        : classified.once_read,
      both_unclear: classified.both_unclear,
      one_unclear: classified.one_unclear,
      empty_answer: editedByPerson
        ? emptyAnswerDiffs(editedRecord, pair.recA, pair.recB)
        : finalEmptyAnswers,
      needs_person_read: classified.needs_person_read,
      unnamed_teaching_marks: unnamedTeachingMarks,
      reader_notes: readerNotes,
    });
  }

  const handledStaleFiles = new Set<string>(keptFinalFiles);
  for (const [staleRef, staleStatus] of Object.entries(existingStatus)) {
    if (seenFinalRefs.has(staleRef)) continue;
    const slug = fileSlugFromRef(staleRef);
    const recordFile = `${slug}.json`;
    const recordPath = join(finalDir, recordFile);
    const viewPath = join(viewDir, `${slug}.md`);
    handledStaleFiles.add(recordFile);

    if (staleStatus === "human_checked" && existsSync(recordPath)) {
      statusMap[staleRef] = "human_checked";
      keptHumanChecked.push({
        source_ref: staleRef,
        in_current_batch: false,
        differs_from_reader_a: false,
        differs_from_reader_b: false,
        diff_count_a: 0,
        diff_count_b: 0,
      });
    } else {
      if (existsSync(recordPath)) unlinkSync(recordPath);
      if (existsSync(viewPath)) unlinkSync(viewPath);
      removedStalePages.push(staleRef);
    }
  }

  for (const name of readdirSync(finalDir)) {
    if (!name.endsWith(".json") || FINAL_META_FILES.has(name) || handledStaleFiles.has(name)) {
      continue;
    }
    const recordPath = join(finalDir, name);
    const rec = loadExistingFinalRecord(recordPath);
    const label = rec?.source_ref ?? name;
    const viewPath = join(viewDir, name.replace(/\.json$/, ".md"));
    if (existsSync(recordPath)) unlinkSync(recordPath);
    if (existsSync(viewPath)) unlinkSync(viewPath);
    removedStalePages.push(label);
  }

  syncManifestSourceRefs(
    workDir,
    pairs,
    new Set(keptHumanChecked.filter((k) => !k.in_current_batch).map((k) => k.source_ref)),
    repoRoot,
  );

  const report: CompareWorkReport = {
    reader_a: slotA.meta,
    reader_b: slotB.meta,
    pages,
    single_reader_pages: singleReaderPages,
    failed_photos: failedPhotos,
    too_small_photos: prepareReport.tooSmall,
    could_not_read_photos: [...prepareReport.unreadable, ...bothFailedPhotos],
    kept_human_checked: keptHumanChecked,
    removed_stale_pages: removedStalePages,
    duplicate_photos: prepareReport.duplicates,
    removed_photos: prepareReport.removedPhotos,
    same_page_id_conflicts: conflicts,
  };

  writeSafeOutputFile(
    join(finalDir, "status.json"),
    `${JSON.stringify(statusMap, null, 2)}\n`,
    repoRoot,
  );
  writeSafeOutputFile(
    join(finalDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    repoRoot,
  );
  writeSafeOutputFile(
    join(finalDir, "report.md"),
    formatCompareReportMarkdown(report),
    repoRoot,
  );

  return report;
}
