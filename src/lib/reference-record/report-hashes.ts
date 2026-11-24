import { join } from "node:path";
import { isPlainObject, parseStrictUtf8Json } from "./import-photos";
import { readRegularFileIfExists } from "./read-file";
import { isSourceRef } from "./validate";

export interface ReportDigests {
  // The hash of the final record as the last compare wrote it.
  record: string | null;
  // The hash of the photo that the readers read.
  photo: string | null;
  // The hash of the photo that supplied the final text.
  finalPhoto: string | null;
}

export interface ReportSummary {
  digests: Map<string, ReportDigests>;
  // Pages that the report remembers as checked by a person (kept_human_checked or check_problems).
  checkedRefs: Set<string>;
}

// Two rows of one page may repeat a digest, but never give two different ones.
function mergeDigest(
  value: unknown,
  earlier: string | null | undefined,
  label: string,
  where: { index: number; ref: string },
): string | null {
  if (value === undefined || value === null) return earlier ?? null;
  if (typeof value !== "string") {
    throw new Error(`pages[${where.index}] (${where.ref}) has a ${label} that is not text`);
  }
  if ((earlier ?? value) !== value) {
    throw new Error(`pages[${where.index}] gives a second ${label} for ${where.ref}`);
  }
  return value;
}

// The digests and checked pages that the report of the last compare gives. A malformed report is an
// error: without its hashes, compare would write over a record that a person changed, and import
// would send it under a machine status or miss a checked page whose digest file is missing.
export function loadReportSummary(reportPath: string): ReportSummary {
  const digests = new Map<string, ReportDigests>();
  const checkedRefs = new Set<string>();
  try {
    const bytes = readRegularFileIfExists(reportPath);
    if (bytes === null) return { digests, checkedRefs };
    const parsed = parseStrictUtf8Json(bytes);
    const report = parsed as { pages?: unknown; kept_human_checked?: unknown } | null;
    const pages: unknown = report?.pages ?? [];
    if (!Array.isArray(pages)) throw new Error("pages is not a list");
    pages.forEach((page: unknown, index) => {
      if (!isPlainObject(page)) throw new Error(`pages[${index}] has no source_ref`);
      const ref = page.source_ref;
      if (typeof ref !== "string") throw new Error(`pages[${index}] has no source_ref`);
      const earlier = digests.get(ref);
      const where = { index, ref };
      digests.set(ref, {
        record: mergeDigest(page.final_record_sha256, earlier?.record, "hash", where),
        photo: mergeDigest(page.photo_sha256, earlier?.photo, "photo_sha256", where),
        finalPhoto: mergeDigest(page.final_photo_sha256, earlier?.finalPhoto, "final_photo_sha256", where),
      });
      const problems = page.check_problems;
      if (problems !== undefined && problems !== null) {
        if (!Array.isArray(problems)) {
          throw new Error(`pages[${index}] (${ref}) has check_problems that is not a list`);
        }
        if (problems.length > 0) checkedRefs.add(ref);
      }
    });
    if (report && report.kept_human_checked !== undefined) {
      if (!Array.isArray(report.kept_human_checked)) {
        throw new Error("kept_human_checked is not a list");
      }
      report.kept_human_checked.forEach((entry: unknown, index) => {
        if (!isPlainObject(entry) || !isSourceRef(entry.source_ref)) {
          throw new Error(`kept_human_checked[${index}] has no valid source_ref`);
        }
        checkedRefs.add(entry.source_ref);
      });
    }
  } catch (err) {
    throw new Error(
      `Malformed previous report ${reportPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return { digests, checkedRefs };
}

// The hash of each final record as the last compare wrote it. Another hash on disk means that a
// person changed the file.
export function loadPreviousHashes(reportPath: string): Map<string, string> {
  return new Map(
    [...loadReportSummary(reportPath).digests].flatMap(([ref, { record }]) =>
      record === null ? [] : [[ref, record] as const],
    ),
  );
}

// Import: a page with a machine status must be the file that the last compare wrote, and the photo
// that would be sent with it must be the one that the readers read. The digests of now are those of
// the bytes that the import read and would send. A human_checked page follows its own digests.
export function checkMachineDigests(args: {
  finalDir: string;
  statusByRef: ReadonlyMap<string, string>;
  recordSha256ByRef: ReadonlyMap<string, string>;
  plannedPhotos: ReadonlyMap<string, { sha256: string }>;
  problems: string[];
  report?: ReportSummary;
}): void {
  let digests: Map<string, ReportDigests>;
  if (args.report) {
    digests = args.report.digests;
  } else {
    try {
      digests = loadReportSummary(join(args.finalDir, "report.json")).digests;
    } catch (err) {
      args.problems.push(err instanceof Error ? err.message : String(err));
      return;
    }
  }
  for (const [ref, recordSha256] of args.recordSha256ByRef) {
    if (args.statusByRef.get(ref) === "human_checked") continue;
    const row = digests.get(ref);
    if (!row) continue;
    if (row.record !== null && row.record !== recordSha256) {
      args.problems.push(
        `${ref}: the record is not the file that report.json gives (it changed after reference:compare wrote it); run reference:compare again, then a person runs reference:check for this page`,
      );
    }
    const expectedPhoto = row.finalPhoto ?? row.photo;
    const photo = args.plannedPhotos.get(ref);
    if (expectedPhoto !== null && photo !== undefined && photo.sha256 !== expectedPhoto) {
      args.problems.push(
        `${ref}: the photo in the photos folder is another photo than the one that the readers read (report.json); give the records and the photos of the same work folder, or run reference:compare again`,
      );
    }
  }
}
