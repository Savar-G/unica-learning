import { createHash } from "node:crypto";
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  assertOutsideRepo,
  prepareSafeOutputDir,
  renderRecordToMarkdown,
  writeSafeOutputFile,
  type ReferenceRecord,
} from "@/lib/reference-record";
import {
  applyComputedAnswers,
  collectExampleAnswerConflicts,
  collectReadTimeAnswerConflicts,
  collectReadTimeUnclearAnswers,
  fileSlugFromRef,
} from "./answers";
import {
  agreementPercentage,
  classifyComparison,
  collectUnnamedTeachingMarks,
  compareRecords,
  compareRecordsWithCounts,
  decidePageOutcome,
  emptyAnswerDiffs,
  findAnswerDisagreements,
  findExpressionDisagreements,
  resolveSingleReadPaths,
  stripKeptRecordLocations,
  type PageStatus,
} from "./compare";
import {
  assertNoFileCollisions,
  loadExistingFinalRecord,
  sha256OfFile,
  syncManifestSourceRefs,
} from "./compare-batch-files";
import {
  loadOriginalNamesByDigest,
  loadPrepareReport,
  loadSlot,
  pairSlotPages,
  pickPageWinners,
  readJsonIfExists,
  type PairedPage,
} from "./compare-pairing";
import {
  formatCompareReportMarkdown,
  formatPagesSentToPerson,
  resultLabelForStatus,
  type CompareWorkReport,
  type DigestMismatchInfo,
  type FailedPhotoReport,
  type KeptHumanCheckedReport,
  type PageAgreement,
  type PageCompareReport,
  type PageResultLabel,
  type PageSentToPerson,
  type SamePageIdConflict,
} from "./compare-report";

export {
  formatCompareReportMarkdown,
  formatPagesSentToPerson,
  type CompareWorkReport,
  type DigestMismatchInfo,
  type FailedPhotoReport,
  type KeptHumanCheckedReport,
  type PageAgreement,
  type PageCompareReport,
  type PageResultLabel,
  type PageSentToPerson,
  type SamePageIdConflict,
};

const FINAL_META_FILES = new Set(["status.json", "report.json"]);

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
  if (previousReport && Array.isArray(previousReport.pages)) {
    for (const page of previousReport.pages) {
      if (
        typeof page === "object" &&
        page !== null &&
        typeof page.source_ref === "string" &&
        typeof page.final_record_sha256 === "string"
      ) {
        previousHashes.set(page.source_ref, page.final_record_sha256);
      }
    }
  }

  assertNoFileCollisions(pairs, existingStatus, finalDir);

  const pages: PageCompareReport[] = [];
  const pagesSentToPerson: PageSentToPerson[] = [];
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

    const comparison =
      pair.recA && pair.recB
        ? compareRecordsWithCounts(pair.recA, pair.recB)
        : { diffs: [], counts: { compared: 0, agreed: 0 } };
    const allDiffs = comparison.diffs;
    const classified = classifyComparison(pair.recA, pair.recB, comparison);
    const agreement: PageAgreement = {
      agreed: comparison.counts.agreed,
      compared: comparison.counts.compared,
      percent: agreementPercentage(comparison.counts.agreed, comparison.counts.compared),
    };
    const unnamedTeachingMarks = collectUnnamedTeachingMarks(pair.recA, pair.recB);

    const isChecked = existingStatus[sourceRef] === "human_checked" && existsSync(finalRecordPath);
    const existingKept = isChecked ? loadExistingFinalRecord(finalRecordPath) : null;

    if (isChecked) {
      statusMap[sourceRef] = "human_checked";
      if (!existingKept) {
        // A person checked this page and the file is not a valid record now: never write over it.
        keptHumanChecked.push({
          source_ref: sourceRef,
          in_current_batch: true,
          differs_from_reader_a: false,
          differs_from_reader_b: false,
          diff_count_a: 0,
          diff_count_b: 0,
          invalid: true,
        });
      } else {
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
      }
      pages.push({
        source_ref: sourceRef,
        photo: pair.photo,
        original_name: pair.originalName,
        photo_sha256: pair.photoSha256,
        status: "human_checked",
        agreement,
        result: resultLabelForStatus("human_checked"),
        result_reason: null,
        only_in_reader: onlyIn,
        digest_mismatch: pair.digestMismatch,
        differences: stripKeptRecordLocations(classified.differences),
        wording: classified.wording,
        once_read: stripKeptRecordLocations(classified.once_read),
        both_unclear: classified.both_unclear,
        one_unclear: classified.one_unclear,
        // An invalid kept file cannot have its answer places read.
        empty_answer: existingKept ? emptyAnswerDiffs(existingKept, pair.recA, pair.recB) : [],
        needs_person_read: classified.needs_person_read,
        unnamed_teaching_marks: unnamedTeachingMarks,
        reader_notes: { a: pair.notesA, b: pair.notesB },
      });
      continue;
    }

    // A final record that a person changed since the last compare is kept until the person
    // checks it. The page is then not double_read or agreement_accepted.
    const previousHash = previousHashes.get(sourceRef);
    const editedByPerson =
      previousHash !== undefined &&
      existsSync(finalRecordPath) &&
      sha256OfFile(finalRecordPath) !== previousHash;

    // The record that stays on disk: the edited file, or the record that compare writes.
    const rawEditedRecord = editedByPerson ? loadExistingFinalRecord(finalRecordPath) : null;
    let editedRecord = rawEditedRecord;
    let strippedEditedSingleRead = false;
    if (editedByPerson && rawEditedRecord && "single_read" in rawEditedRecord) {
      const cleaned: ReferenceRecord = { ...rawEditedRecord };
      delete cleaned.single_read;
      editedRecord = cleaned;
      strippedEditedSingleRead = true;
    }

    const {
      record: computedRecord,
      notes: computedNotes,
      details: computedDetails,
    } = applyComputedAnswers(withBothReaders(chosen, pair));
    const editedDetails = editedRecord ? applyComputedAnswers(editedRecord).details : [];
    const finalIsFreshA = !editedByPerson && pair.recA !== null;
    const finalItemDetails = (editedByPerson ? editedDetails : computedDetails).filter(
      (d) => d.kind === "answer_differs",
    );
    const finalItemConflictPaths = new Set(finalItemDetails.map((d) => d.path));
    const exampleConflicts = collectExampleAnswerConflicts(
      editedByPerson ? editedRecord : computedRecord,
      pair.recA,
      pair.recB,
      { finalIsFreshA },
    );
    const answerConflicts = [
      ...finalItemDetails.map((d) => `final record: ${d.message}`),
      ...exampleConflicts.finalMessages,
    ];
    const readerNotes = pair.recA
      ? { a: mergeNotes(pair.notesA, computedNotes), b: pair.notesB }
      : { a: pair.notesA, b: mergeNotes(pair.notesB, computedNotes) };
    const finalEmptyAnswers = editedByPerson
      ? emptyAnswerDiffs(editedRecord, pair.recA, pair.recB)
      : emptyAnswerDiffs(computedRecord, pair.recA, pair.recB);

    const readTimeUnclearAnswers =
      pair.recA && pair.recB
        ? [
            ...collectReadTimeUnclearAnswers("a", pair.noteDetailsA),
            ...collectReadTimeUnclearAnswers("b", pair.noteDetailsB),
          ]
        : [];
    const answerDisagreements = [
      ...new Set([
        ...findAnswerDisagreements(allDiffs, { a: pair.recA, b: pair.recB }),
        ...readTimeUnclearAnswers,
      ]),
    ];
    const expressionDisagreements = findExpressionDisagreements(allDiffs);
    const readerAnswerConflicts = [
      ...new Set([
        ...collectReadTimeAnswerConflicts(
          "a",
          pair.notesA,
          pair.noteDetailsA,
          finalIsFreshA ? { excludePaths: finalItemConflictPaths } : undefined,
        ),
        ...collectReadTimeAnswerConflicts("b", pair.notesB, pair.noteDetailsB),
        ...exampleConflicts.readerMessages,
      ]),
    ];
    const decision = decidePageOutcome({
      hasA: pair.recA !== null,
      hasB: pair.recB !== null,
      familyA: slotA.meta?.family ?? null,
      familyB: slotB.meta?.family ?? null,
      diffs: [...allDiffs, ...finalEmptyAnswers],
      sameDigest: pair.sameDigest,
      counts: comparison.counts,
      hasAnswerConflict: answerConflicts.length > 0,
      hasReaderAnswerConflict: readerAnswerConflicts.length > 0,
      needsPersonRead: classified.needs_person_read,
      editedByPerson,
      recordA: pair.recA,
      recordB: pair.recB,
      answerDisagreements,
      expressionDisagreements,
    });
    const pageStatus = decision.status;
    statusMap[sourceRef] = pageStatus;

    // Strip any stale single_read; attach single_read paths only on agreement_accepted pages.
    const baseRecord: ReferenceRecord = { ...computedRecord };
    delete baseRecord.single_read;
    const singleReadPaths =
      pageStatus === "agreement_accepted" ? resolveSingleReadPaths(baseRecord, allDiffs) : [];
    const finalRecord: ReferenceRecord =
      pageStatus === "agreement_accepted" && singleReadPaths.length > 0
        ? { ...baseRecord, single_read: singleReadPaths }
        : baseRecord;

    const finalText = `${JSON.stringify(finalRecord, null, 2)}\n`;

    if (!editedByPerson) {
      writeSafeOutputFile(finalRecordPath, finalText, repoRoot);
      writeSafeOutputFile(
        join(viewDir, `${slug}.md`),
        `${renderRecordToMarkdown(finalRecord)}\n`,
        repoRoot,
      );
    } else if (editedRecord) {
      if (strippedEditedSingleRead) {
        writeSafeOutputFile(
          finalRecordPath,
          `${JSON.stringify(editedRecord, null, 2)}\n`,
          repoRoot,
        );
      }
      writeSafeOutputFile(
        join(viewDir, `${slug}.md`),
        `${renderRecordToMarkdown(editedRecord)}\n`,
        repoRoot,
      );
    }

    const formattedReasons = decision.stopReasons.map((r) =>
      r === "missing reader" && onlyIn ? `only reader ${onlyIn}` : r,
    );
    const nonPctReason = formattedReasons.length > 0 ? formattedReasons.join("; ") : null;
    const resultReason =
      pageStatus === "machine_read" ? (nonPctReason ?? "below 90% agreement") : null;
    if (pageStatus === "machine_read") {
      pagesSentToPerson.push({
        source_ref: sourceRef,
        agreement_percent: agreement.percent,
        agreed: agreement.agreed,
        compared: agreement.compared,
        difference_count:
          classified.differences.length +
          classified.once_read.length +
          classified.both_unclear.length,
        reason: nonPctReason,
      });
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
      agreement,
      result: resultLabelForStatus(pageStatus),
      result_reason: resultReason,
      ...(answerConflicts.length > 0 ? { answer_conflicts: answerConflicts } : {}),
      ...(readerAnswerConflicts.length > 0 ? { reader_answer_conflicts: readerAnswerConflicts } : {}),
      ...(answerDisagreements.length > 0 ? { answer_disagreements: answerDisagreements } : {}),
      ...(expressionDisagreements.length > 0 ? { expression_disagreements: expressionDisagreements } : {}),
      only_in_reader: onlyIn,
      digest_mismatch: pair.digestMismatch,
      differences: editedByPerson
        ? stripKeptRecordLocations(classified.differences)
        : classified.differences,
      wording: classified.wording,
      once_read: editedByPerson
        ? stripKeptRecordLocations(classified.once_read)
        : classified.once_read,
      both_unclear: classified.both_unclear,
      one_unclear: classified.one_unclear,
      empty_answer: finalEmptyAnswers,
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
    pages_sent_to_person: pagesSentToPerson,
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
