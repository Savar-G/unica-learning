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
import { fileSlugFromRef } from "./answers";
import {
  classifyComparison,
  collectUnnamedTeachingMarks,
  compareRecords,
  decideStatus,
  type PageStatus,
} from "./compare";
import {
  loadOriginalNamesByDigest,
  loadPrepareReport,
  loadSlot,
  pairSlotPages,
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
} from "./compare-report";

export {
  formatCompareReportMarkdown,
  type CompareWorkReport,
  type DigestMismatchInfo,
  type FailedPhotoReport,
  type KeptHumanCheckedReport,
  type PageCompareReport,
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
  const seenBatchRefs = new Set<string>();

  for (const pair of pairs) {
    const chosen = pair.recA ?? pair.recB;
    if (!chosen) continue;
    const sourceRef = chosen.source_ref;
    if (seenBatchRefs.has(sourceRef)) {
      throw new Error(`Duplicate final source_ref "${sourceRef}" across multiple photos`);
    }
    seenBatchRefs.add(sourceRef);

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
  const { pairs, failedPhotos, bothFailedPhotos } = pairSlotPages(
    slotA,
    slotB,
    originalNamesByDigest,
  );

  const finalDir = prepareSafeOutputDir(join(workDir, "final"), repoRoot);
  const viewDir = prepareSafeOutputDir(join(workDir, "final-view"), repoRoot);

  const existingStatus =
    readJsonIfExists<Record<string, PageStatus>>(join(finalDir, "status.json")) ?? {};

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
    if (seenFinalRefs.has(sourceRef)) {
      throw new Error(`Duplicate final source_ref "${sourceRef}" across multiple photos`);
    }
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

    const existingKept =
      existingStatus[sourceRef] === "human_checked" ? loadExistingFinalRecord(finalRecordPath) : null;

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
        once_read: classified.once_read,
        both_unclear: classified.both_unclear,
        one_unclear: classified.one_unclear,
        needs_person_read: classified.needs_person_read,
        unnamed_teaching_marks: unnamedTeachingMarks,
        reader_notes: { a: pair.notesA, b: pair.notesB },
      });
      continue;
    }

    const status = decideStatus({
      hasA: pair.recA !== null,
      hasB: pair.recB !== null,
      familyA: slotA.meta?.family ?? null,
      familyB: slotB.meta?.family ?? null,
      diffs: allDiffs,
      sameDigest: pair.sameDigest,
    });

    statusMap[sourceRef] = status;

    writeSafeOutputFile(finalRecordPath, `${JSON.stringify(chosen, null, 2)}\n`, repoRoot);
    writeSafeOutputFile(
      join(viewDir, `${slug}.md`),
      `${renderRecordToMarkdown(chosen)}\n`,
      repoRoot,
    );

    pages.push({
      source_ref: sourceRef,
      photo: pair.photo,
      original_name: pair.originalName,
      photo_sha256: pair.photoSha256,
      status,
      only_in_reader: onlyIn,
      digest_mismatch: pair.digestMismatch,
      differences: classified.differences,
      once_read: classified.once_read,
      both_unclear: classified.both_unclear,
      one_unclear: classified.one_unclear,
      needs_person_read: classified.needs_person_read,
      unnamed_teaching_marks: unnamedTeachingMarks,
      reader_notes: { a: pair.notesA, b: pair.notesB },
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
