import type { CheckProblemReason } from "@/lib/reference-record";
import type { PageStatus, RecordDifference, UnnamedTeachingMark } from "./compare";
import type {
  DuplicatePhotoReport,
  RemovedPhotoReport,
  TooSmallPhotoReport,
  UnreadablePhotoReport,
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
  // Why the check does not count now. Absent when the page is human_checked.
  check_problems?: CheckProblemReason[];
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
  expression_disagreements?: string[];
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
  // A person checked this page and the check does not count now. The compare step kept the record.
  check_problems?: CheckProblemReason[];
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
