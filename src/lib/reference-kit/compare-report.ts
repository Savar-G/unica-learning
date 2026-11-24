import type { PageStatus, RecordDifference, UnnamedTeachingMark } from "./compare";
import {
  MIN_LONG_SIDE_PX,
  MIN_SHORT_SIDE_PX,
  type DuplicatePhotoReport,
  type RemovedPhotoReport,
  type TooSmallPhotoReport,
  type UnreadablePhotoReport,
} from "./prepare";
import type { ReaderMeta } from "./read";

export interface FailedPhotoReport {
  slot: "a" | "b";
  photo: string;
  original_name?: string | null;
  status: string;
  reason?: string;
}

export interface DigestMismatchInfo {
  a: string | null;
  b: string | null;
}

export interface KeptHumanCheckedReport {
  source_ref: string;
  in_current_batch: boolean;
  differs_from_reader_a: boolean;
  differs_from_reader_b: boolean;
  diff_count_a: number;
  diff_count_b: number;
  // The checked file could not be read as a valid record. It is kept as it is.
  invalid?: boolean;
}

// A photo that claims a page id that another photo won. It gets no final record and keeps its readings.
export interface SamePageIdConflict {
  source_ref: string;
  winner_original_name: string | null;
  winner_photo: string | null;
  photo: string | null;
  original_name: string | null;
  photo_sha256: string | null;
  reader_a_source_ref: string | null;
  reader_b_source_ref: string | null;
}

export interface PageAgreement {
  agreed: number;
  compared: number;
  percent: number | null;
}

export type PageResultLabel =
  | "double read"
  | "accepted by the 90% rule"
  | "sent to a person"
  | "checked by a person";

export interface PageSentToPerson {
  source_ref: string;
  agreement_percent: number | null;
  agreed: number;
  compared: number;
  difference_count: number;
  reason: string | null;
}

export interface PageCompareReport {
  source_ref: string;
  photo: string | null;
  original_name: string | null;
  photo_sha256: string | null;
  status: PageStatus;
  agreement?: PageAgreement;
  result?: PageResultLabel;
  result_reason?: string | null;
  answer_conflicts?: string[];
  reader_answer_conflicts?: string[];
  answer_disagreements?: string[];
  only_in_reader: "a" | "b" | null;
  digest_mismatch: DigestMismatchInfo | null;
  differences: RecordDifference[];
  // Differences in the reader's own wording (do not block double_read). Absent in reports of older runs.
  wording?: RecordDifference[];
  once_read: RecordDifference[];
  both_unclear: RecordDifference[];
  one_unclear: RecordDifference[];
  // Answer places of the final record with no answer. Absent in reports of older runs.
  empty_answer?: RecordDifference[];
  needs_person_read: boolean;
  unnamed_teaching_marks: UnnamedTeachingMark[];
  reader_notes: { a: string[]; b: string[] };
  // sha256 of the final record file as the compare step wrote it. A file with another hash was
  // changed by a person.
  final_record_sha256?: string | null;
  // The final record was changed by a person and is not checked yet. The compare step kept it.
  edited_by_person?: boolean;
}

export interface CompareWorkReport {
  reader_a: ReaderMeta | null;
  reader_b: ReaderMeta | null;
  pages: PageCompareReport[];
  pages_sent_to_person?: PageSentToPerson[];
  single_reader_pages: Array<{ source_ref: string; reader: "a" | "b" }>;
  failed_photos: FailedPhotoReport[];
  too_small_photos: TooSmallPhotoReport[];
  could_not_read_photos: UnreadablePhotoReport[];
  kept_human_checked: KeptHumanCheckedReport[];
  removed_stale_pages: string[];
  duplicate_photos: DuplicatePhotoReport[];
  removed_photos: RemovedPhotoReport[];
  same_page_id_conflicts: SamePageIdConflict[];
}

function formatVal(v: unknown): string {
  return JSON.stringify(v);
}

export function formatAgreementPercent(percent: number | null): string {
  if (percent === null) return "-";
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
}

export function resultLabelForStatus(status: PageStatus): PageResultLabel {
  switch (status) {
    case "double_read":
      return "double read";
    case "agreement_accepted":
      return "accepted by the 90% rule";
    case "human_checked":
      return "checked by a person";
    case "machine_read":
      return "sent to a person";
  }
}

function formatResultWithReason(p: PageCompareReport): string {
  const label = p.result ?? resultLabelForStatus(p.status);
  return p.result_reason ? `${label} (${p.result_reason})` : label;
}

function formatAgreementCell(agreement: PageAgreement | undefined): string {
  if (!agreement || agreement.compared <= 0) return "-";
  return `${formatAgreementPercent(agreement.percent)} (${agreement.agreed}/${agreement.compared})`;
}

function sentToPersonItems(report: CompareWorkReport): PageSentToPerson[] {
  if (report.pages_sent_to_person !== undefined) return report.pages_sent_to_person;
  return report.pages
    .filter((p) => p.status === "machine_read")
    .map((p) => ({
      source_ref: p.source_ref,
      agreement_percent: p.agreement?.percent ?? null,
      agreed: p.agreement?.agreed ?? 0,
      compared: p.agreement?.compared ?? 0,
      difference_count: p.differences.length + p.once_read.length + p.both_unclear.length,
      reason: p.result_reason && p.result_reason !== "below 90% agreement" ? p.result_reason : null,
    }));
}

function formatSentToPersonLine(item: PageSentToPerson): string {
  const pct =
    item.agreement_percent === null
      ? "no agreement"
      : `${formatAgreementPercent(item.agreement_percent)} agreement`;
  const diffWord = item.difference_count === 1 ? "difference" : "differences";
  const reasonPart = item.reason ? ` (${item.reason})` : "";
  return `${item.source_ref}: ${pct}, ${item.difference_count} ${diffWord}${reasonPart}`;
}

export function formatPagesSentToPerson(report: CompareWorkReport): string {
  const list = sentToPersonItems(report);
  if (list.length === 0) return "Pages sent to a person: none.";
  const lines = [`Pages sent to a person (${list.length}):`];
  for (const item of list) {
    lines.push(`  - ${formatSentToPersonLine(item)}`);
  }
  return lines.join("\n");
}

function hasReaderBNeighbours(d: RecordDifference): boolean {
  return d.reader_b_after !== undefined || d.reader_b_before !== undefined;
}

function formatReaderBNeighbours(d: RecordDifference): string {
  const noun = d.path.startsWith("topics[") ? "topic" : "item";
  const after = d.reader_b_after ?? null;
  const before = d.reader_b_before ?? null;
  if (after !== null && before !== null) {
    return `reader b has it after ${noun} ${after} and before ${noun} ${before}`;
  }
  if (after === null && before !== null) {
    return `reader b has it first, before ${noun} ${before}`;
  }
  if (after !== null && before === null) {
    return `reader b has it last, after ${noun} ${after}`;
  }
  return `reader b has it as the only ${noun}`;
}

type ReviewInstructionKind =
  | "edited_check"
  | "once_read_heading_fresh"
  | "once_read_heading_kept"
  | "both_unclear_heading"
  | "empty_answer_heading"
  | "missing_step_note"
  | "kept_find_place"
  | "located_insert_before"
  | "located_reader_a"
  | "located_reader_b";

const REVIEW_INSTRUCTIONS: Record<ReviewInstructionKind, { action: string; neutral: string }> = {
  edited_check: { action: " Run reference:check for this page.", neutral: "" },
  once_read_heading_fresh: {
    action:
      ' (look at the photo; copy an entry that is on the page into the final record at the given path, where "[]" means the end of that list and "insert before" means insert ahead of that element)',
    neutral: "",
  },
  once_read_heading_kept: {
    action: " (look at the photo; a person changed the final record, so find the place in that record)",
    neutral: "",
  },
  both_unclear_heading: {
    action: ' (look at the photo and write the value, or keep "unclear" and mark the page checked)',
    neutral: "",
  },
  empty_answer_heading: { action: ' (write the answer from the photo, or "unclear")', neutral: "" },
  missing_step_note: {
    action: "; its step is missing from reader A's record and must be added first",
    neutral: "; step absent from reader A's record",
  },
  kept_find_place: {
    action: " has it; a person changed the final record, so find the place in that record",
    neutral: "",
  },
  located_insert_before: { action: " has it; insert before", neutral: "; location in final record before" },
  located_reader_a: { action: " has it; already in the final record at", neutral: "; in final record at" },
  located_reader_b: { action: " has it; belongs in the final record at", neutral: "; location in final record" },
};

// Every review instruction goes through this gate so non-machine_read pages never ask for action.
function reviewInstruction(status: PageStatus, kind: ReviewInstructionKind): string {
  const entry = REVIEW_INSTRUCTIONS[kind];
  return status === "machine_read" ? entry.action : entry.neutral;
}

function formatLocatedEntry(
  prefix: string,
  d: RecordDifference,
  opts: { status: PageStatus; keptRecord: boolean },
): string {
  const entry = d.reader === "a" ? d.a : d.b;
  if (d.reader === "b" && hasReaderBNeighbours(d)) {
    return `${prefix}: ${formatReaderBNeighbours(d)}: ${formatVal(entry)}`;
  }
  const missingStepNote = d.missing_step ? reviewInstruction(opts.status, "missing_step_note") : "";
  if (d.reader && d.final_path !== undefined && !opts.keptRecord) {
    const whereKind: ReviewInstructionKind =
      d.insert_before !== undefined
        ? "located_insert_before"
        : d.final_path.endsWith("[]")
          ? "located_reader_b"
          : d.reader === "a"
            ? "located_reader_a"
            : "located_reader_b";
    return `${prefix}: only reader ${d.reader}${reviewInstruction(opts.status, whereKind)} \`${d.final_path}\`${missingStepNote}: ${formatVal(entry)}`;
  }
  if (d.reader && opts.keptRecord) {
    return `${prefix}: only reader ${d.reader}${reviewInstruction(opts.status, "kept_find_place")}${missingStepNote}: ${formatVal(entry)}`;
  }
  return `${prefix}: a=${formatVal(d.a)} | b=${formatVal(d.b)}`;
}

export function formatCompareReportMarkdown(report: CompareWorkReport): string {
  const lines: string[] = [];
  lines.push("# Reference Comparison Report");
  lines.push("");
  lines.push(
    `- **Reader A:** ${report.reader_a ? `${report.reader_a.family} (${report.reader_a.model})` : "none"}`,
  );
  lines.push(
    `- **Reader B:** ${report.reader_b ? `${report.reader_b.family} (${report.reader_b.model})` : "none"}`,
  );
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(
    "| Page | Photo | Status | Agreement | Result | Differences | Wording | Once-read | Both unclear | Empty answers | Has prose |",
  );
  lines.push("|---|---|---|---|---|---:|---:|---:|---:|---:|---|");
  for (const p of report.pages) {
    const photoCol = p.original_name ?? p.photo ?? "-";
    lines.push(
      `| ${p.source_ref} | ${photoCol} | ${p.status} | ${formatAgreementCell(p.agreement)} | ${formatResultWithReason(p)} | ${p.differences.length} | ${(p.wording ?? []).length} | ${p.once_read.length} | ${p.both_unclear.length} | ${(p.empty_answer ?? []).length} | ${p.needs_person_read ? "yes" : "no"} |`,
    );
  }
  lines.push("");

  if (report.too_small_photos.length > 0) {
    lines.push("## Too small to read");
    lines.push("");
    lines.push(
      `Photos need at least ${MIN_LONG_SIDE_PX} px on the long side and ${MIN_SHORT_SIDE_PX} px on the short side.`,
    );
    lines.push("");
    for (const item of report.too_small_photos) {
      lines.push(`- \`${item.original_name}\` (${item.width} x ${item.height})`);
    }
    lines.push("");
  }

  if (report.could_not_read_photos.length > 0) {
    lines.push("## Could not be read");
    lines.push("");
    for (const item of report.could_not_read_photos) {
      lines.push(`- \`${item.original_name}\`: ${item.reason}`);
    }
    lines.push("");
  }

  if (report.duplicate_photos.length > 0) {
    lines.push("## Duplicate photos");
    lines.push("");
    for (const item of report.duplicate_photos) {
      lines.push(
        `- \`${item.original_name}\`: duplicate_photo, the same photo as \`${item.duplicate_of}\` (not read)`,
      );
    }
    lines.push("");
  }

  if (report.removed_photos.length > 0) {
    lines.push("## Removed photos");
    lines.push("");
    for (const item of report.removed_photos) {
      const ref = item.source_ref ? ` (${item.source_ref})` : "";
      const outcome = item.kept_human_checked
        ? "kept: checked by a person"
        : "no longer in the photos folder; its readings and final record were removed";
      lines.push(`- \`${item.original_name}\`${ref}: ${outcome}`);
    }
    lines.push("");
  }

  if (report.same_page_id_conflicts.length > 0) {
    lines.push("## Same page id for two photos");
    lines.push("");
    for (const c of report.same_page_id_conflicts) {
      const name = c.original_name ?? c.photo ?? "unknown photo";
      const winner = c.winner_original_name ?? c.winner_photo ?? "another photo";
      lines.push(
        `- \`${name}\` also claims ${c.source_ref} (reader a: ${c.reader_a_source_ref ?? "none"}, reader b: ${c.reader_b_source_ref ?? "none"}). The final record comes from \`${winner}\`. This photo has no final record; its readings are kept.`,
      );
    }
    lines.push("");
  }

  const allUnnamed: Array<{ source_ref: string; mark: UnnamedTeachingMark }> = [];
  for (const p of report.pages) {
    for (const mark of p.unnamed_teaching_marks) {
      allUnnamed.push({ source_ref: p.source_ref, mark });
    }
  }
  if (allUnnamed.length > 0) {
    lines.push("## Unnamed teaching marks");
    lines.push("");
    for (const { source_ref, mark } of allUnnamed) {
      lines.push(`- ${source_ref} (${mark.kind} \`${mark.path}\`, reader ${mark.reader}): ${mark.description}`);
    }
    lines.push("");
  }

  if (report.kept_human_checked.length > 0) {
    lines.push("## Kept: checked by a person");
    lines.push("");
    for (const k of report.kept_human_checked) {
      if (k.invalid) {
        lines.push(
          `- ${k.source_ref}: kept as it is, but the file is not a valid record now. Correct it, then run reference:check for this page.`,
        );
      } else if (!k.in_current_batch) {
        lines.push(`- ${k.source_ref}: stale human_checked page kept (not in current batch)`);
      } else if (k.differs_from_reader_a || k.differs_from_reader_b) {
        const parts: string[] = [];
        if (k.differs_from_reader_a) parts.push(`reader a differs (${k.diff_count_a})`);
        if (k.differs_from_reader_b) parts.push(`reader b differs (${k.diff_count_b})`);
        lines.push(
          `- ${k.source_ref}: kept human_checked record; current readings differ (${parts.join(", ")})`,
        );
      } else {
        lines.push(`- ${k.source_ref}: kept human_checked record (matches current readings)`);
      }
    }
    lines.push("");
  }

  if (report.removed_stale_pages.length > 0) {
    lines.push("## Removed stale pages");
    lines.push("");
    for (const ref of report.removed_stale_pages) {
      lines.push(`- ${ref}`);
    }
    lines.push("");
  }

  if (report.single_reader_pages.length > 0) {
    lines.push("## Pages Present For One Reader Only");
    lines.push("");
    for (const item of report.single_reader_pages) {
      lines.push(`- ${item.source_ref} (reader ${item.reader} only)`);
    }
    lines.push("");
  }

  if (report.failed_photos.length > 0) {
    lines.push("## Failed Photos");
    lines.push("");
    for (const f of report.failed_photos) {
      const label = f.original_name ? `${f.original_name} (${f.photo})` : f.photo;
      lines.push(`- Reader ${f.slot}: \`${label}\` (${f.status})${f.reason ? ` - ${f.reason}` : ""}`);
    }
    lines.push("");
  }

  lines.push("## Per-Page Details");
  lines.push("");
  for (const p of report.pages) {
    lines.push(`### ${p.source_ref} (${p.status})`);
    lines.push(`- Result: ${formatResultWithReason(p)}`);
    if (p.agreement && p.agreement.compared > 0) {
      lines.push(
        `- Agreement: ${formatAgreementPercent(p.agreement.percent)} (${p.agreement.agreed}/${p.agreement.compared} compared fields)`,
      );
    }
    if (p.edited_by_person) {
      lines.push(
        `- A person changed the final record and it is not checked yet. The file was kept.${reviewInstruction(p.status, "edited_check")}`,
      );
    }
    if (p.original_name && p.photo && p.original_name !== p.photo) {
      lines.push(`- Photo: \`${p.original_name}\` (\`${p.photo}\`)`);
    } else if (p.original_name ?? p.photo) {
      lines.push(`- Photo: \`${p.original_name ?? p.photo}\``);
    }
    if (p.only_in_reader) lines.push(`- Present only in reader ${p.only_in_reader}`);
    if (p.digest_mismatch) {
      lines.push(
        `- Photo digest mismatch (kept machine_read): reader a=${p.digest_mismatch.a ?? "none"} | reader b=${p.digest_mismatch.b ?? "none"}`,
      );
    }
    if (p.needs_person_read) {
      if (p.status === "agreement_accepted") {
        lines.push(
          "- Has worked examples or prose. Differing fields are in single_read and show as not checked.",
        );
      } else if (p.status === "double_read") {
        lines.push("- Has worked examples or prose (both readers agreed).");
      } else {
        lines.push("- Has worked examples or prose.");
      }
    }

    if (p.unnamed_teaching_marks.length > 0) {
      lines.push("- Unnamed teaching marks:");
      for (const mark of p.unnamed_teaching_marks) {
        lines.push(`  - ${mark.kind} \`${mark.path}\` (reader ${mark.reader}): ${mark.description}`);
      }
    }

    // A record that a person edited or checked is kept; reader a's words and indexes may not fit it.
    const keptRecord = p.edited_by_person === true || p.status === "human_checked";

    if (p.differences.length > 0) {
      lines.push("- Differences:");
      for (const d of p.differences) {
        const prefix = `  - \`${d.path}\` (${d.kind})`;
        if (d.reader && (hasReaderBNeighbours(d) || d.final_path !== undefined || keptRecord)) {
          lines.push(formatLocatedEntry(prefix, d, { status: p.status, keptRecord }));
        } else {
          lines.push(`${prefix}: a=${formatVal(d.a)} | b=${formatVal(d.b)}`);
        }
      }
    }

    const wording = p.wording ?? [];
    if (wording.length > 0) {
      lines.push(
        keptRecord
          ? "- Wording differences: the readers describe the same thing in other words; the edited record is kept; no action needed"
          : "- Wording differences: the readers describe the same thing in other words; reader A's words are kept; no action needed",
      );
      for (const d of wording) {
        lines.push(`  - \`${d.path}\`: a=${formatVal(d.a)} | b=${formatVal(d.b)}`);
      }
    }

    if (p.once_read.length > 0) {
      const headingNote = reviewInstruction(
        p.status,
        keptRecord ? "once_read_heading_kept" : "once_read_heading_fresh",
      );
      lines.push(`- Once-read teaching fields${headingNote}:`);
      for (const d of p.once_read) {
        lines.push(formatLocatedEntry(`  - \`${d.path}\``, d, { status: p.status, keptRecord }));
      }
    }

    if (p.both_unclear.length > 0) {
      lines.push(`- Both readers marked unclear${reviewInstruction(p.status, "both_unclear_heading")}:`);
      for (const d of p.both_unclear) {
        lines.push(`  - \`${d.path}\``);
      }
    }

    const emptyAnswers = p.empty_answer ?? [];
    if (emptyAnswers.length > 0) {
      lines.push(`- Answer places with no answer${reviewInstruction(p.status, "empty_answer_heading")}:`);
      for (const d of emptyAnswers) {
        lines.push(`  - \`${d.path}\`: a=${formatVal(d.a)} | b=${formatVal(d.b)}`);
      }
    }

    const answerConflicts = p.answer_conflicts ?? [];
    if (answerConflicts.length > 0) {
      lines.push("- Answer conflicts (stored answer does not match computed answer):");
      for (const msg of answerConflicts) {
        lines.push(`  - ${msg}`);
      }
    }

    const readerAnswerConflicts = p.reader_answer_conflicts ?? [];
    if (readerAnswerConflicts.length > 0) {
      lines.push("- Reader answer conflicts (a reader's answer differs from the computed answer):");
      for (const path of readerAnswerConflicts) {
        lines.push(`  - \`${path}\``);
      }
    }

    const answerDisagreements = p.answer_disagreements ?? [];
    if (answerDisagreements.length > 0) {
      lines.push("- Answer disagreements (readers disagree on an answer):");
      for (const path of answerDisagreements) {
        lines.push(`  - \`${path}\``);
      }
    }

    if (p.reader_notes.a.length > 0 || p.reader_notes.b.length > 0) {
      lines.push("- Reader answer notes:");
      for (const note of p.reader_notes.a) lines.push(`  - reader a: ${note}`);
      for (const note of p.reader_notes.b) lines.push(`  - reader b: ${note}`);
    }

    if (
      p.differences.length === 0 &&
      wording.length === 0 &&
      p.once_read.length === 0 &&
      p.both_unclear.length === 0 &&
      emptyAnswers.length === 0 &&
      answerConflicts.length === 0 &&
      readerAnswerConflicts.length === 0 &&
      answerDisagreements.length === 0 &&
      p.unnamed_teaching_marks.length === 0 &&
      !p.only_in_reader &&
      !p.digest_mismatch &&
      !p.needs_person_read
    ) {
      lines.push("- Exact match across both readers.");
    }
    lines.push("");
  }

  lines.push("## Pages sent to a person");
  lines.push("");
  const sent = sentToPersonItems(report);
  if (sent.length === 0) {
    lines.push("No pages sent to a person.");
  } else {
    for (const item of sent) {
      lines.push(`- ${formatSentToPersonLine(item)}`);
    }
  }
  lines.push("");

  return `${lines.join("\n")}\n`;
}
