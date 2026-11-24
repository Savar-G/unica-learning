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

export interface PageCompareReport {
  source_ref: string;
  photo: string | null;
  original_name: string | null;
  photo_sha256: string | null;
  status: PageStatus;
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
    "| Page | Photo | Status | Differences | Wording | Once-read | Both unclear | Empty answers | Person read |",
  );
  lines.push("|---|---|---|---:|---:|---:|---:|---:|---|");
  for (const p of report.pages) {
    const photoCol = p.original_name ?? p.photo ?? "-";
    lines.push(
      `| ${p.source_ref} | ${photoCol} | ${p.status} | ${p.differences.length} | ${(p.wording ?? []).length} | ${p.once_read.length} | ${p.both_unclear.length} | ${(p.empty_answer ?? []).length} | ${p.needs_person_read ? "yes" : "no"} |`,
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
    if (p.edited_by_person) {
      lines.push(
        "- A person changed the final record and it is not checked yet. The file was kept. Run reference:check for this page.",
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
      lines.push("- A person must read the prose on this page");
    }

    if (p.unnamed_teaching_marks.length > 0) {
      lines.push("- Unnamed teaching marks:");
      for (const mark of p.unnamed_teaching_marks) {
        lines.push(`  - ${mark.kind} \`${mark.path}\` (reader ${mark.reader}): ${mark.description}`);
      }
    }

    if (p.differences.length > 0) {
      lines.push("- Differences:");
      for (const d of p.differences) {
        lines.push(`  - \`${d.path}\` (${d.kind}): a=${formatVal(d.a)} | b=${formatVal(d.b)}`);
      }
    }

    // A record that a person edited or checked is kept; reader a's words and indexes may not fit it.
    const keptRecord = p.edited_by_person === true || p.status === "human_checked";

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
      lines.push(
        '- Once-read teaching fields (look at the photo; copy an entry that is on the page into the final record at the given path, where "[]" means the end of that list and "insert before" means insert ahead of that element):',
      );
      for (const d of p.once_read) {
        const entry = d.reader === "a" ? d.a : d.b;
        const missingStepNote = d.missing_step
          ? "; its step is missing from reader A's record and must be added first"
          : "";
        if (d.reader && d.final_path !== undefined) {
          const where = keptRecord
            ? "found in the kept final record at"
            : d.reader === "a"
              ? "already in the final record at"
              : d.insert_before !== undefined
                ? "insert before"
                : "belongs in the final record at";
          lines.push(
            `  - \`${d.path}\`: only reader ${d.reader} has it; ${where} \`${d.final_path}\`${keptRecord ? "" : missingStepNote}: ${formatVal(entry)}`,
          );
        } else if (d.reader && keptRecord) {
          lines.push(
            `  - \`${d.path}\`: only reader ${d.reader} has it; a person changed the final record, so find the place in that record${missingStepNote}: ${formatVal(entry)}`,
          );
        } else {
          lines.push(`  - \`${d.path}\`: a=${formatVal(d.a)} | b=${formatVal(d.b)}`);
        }
      }
    }

    if (p.both_unclear.length > 0) {
      lines.push(
        '- Both readers marked unclear (look at the photo and write the value, or keep "unclear" and mark the page checked):',
      );
      for (const d of p.both_unclear) {
        lines.push(`  - \`${d.path}\``);
      }
    }

    const emptyAnswers = p.empty_answer ?? [];
    if (emptyAnswers.length > 0) {
      lines.push('- Answer places with no answer (write the answer from the photo, or "unclear"):');
      for (const d of emptyAnswers) {
        lines.push(`  - \`${d.path}\`: a=${formatVal(d.a)} | b=${formatVal(d.b)}`);
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
      p.unnamed_teaching_marks.length === 0 &&
      !p.only_in_reader &&
      !p.digest_mismatch &&
      !p.needs_person_read
    ) {
      lines.push("- Exact match across both readers.");
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
