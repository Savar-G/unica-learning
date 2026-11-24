import { join } from "node:path";
import { parseStrictUtf8Json } from "./import-photos";
import { readRegularFileIfExists } from "./read-file";

export interface ReportDigests {
  // The hash of the final record as the last compare wrote it.
  record: string | null;
  // The hash of the photo that the readers read.
  photo: string | null;
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

// The digests that the report of the last compare gives for each page. A malformed report is an
// error: without its hashes, compare would write over a record that a person changed, and import
// would send it under a machine status.
function loadReportDigests(reportPath: string): Map<string, ReportDigests> {
  const digests = new Map<string, ReportDigests>();
  try {
    const bytes = readRegularFileIfExists(reportPath);
    const report = bytes === null ? null : (parseStrictUtf8Json(bytes) as { pages?: unknown } | null);
    const pages: unknown = report?.pages ?? [];
    if (!Array.isArray(pages)) throw new Error("pages is not a list");
    pages.forEach((page: unknown, index) => {
      const row = (page ?? {}) as Record<string, unknown>;
      const ref = row.source_ref;
      if (typeof ref !== "string") throw new Error(`pages[${index}] has no source_ref`);
      const earlier = digests.get(ref);
      const where = { index, ref };
      digests.set(ref, {
        record: mergeDigest(row.final_record_sha256, earlier?.record, "hash", where),
        photo: mergeDigest(row.photo_sha256, earlier?.photo, "photo_sha256", where),
      });
    });
  } catch (err) {
    throw new Error(
      `Malformed previous report ${reportPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return digests;
}

// The hash of each final record as the last compare wrote it. Another hash on disk means that a
// person changed the file.
export function loadPreviousHashes(reportPath: string): Map<string, string> {
  return new Map(
    [...loadReportDigests(reportPath)].flatMap(([ref, { record }]) =>
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
}): void {
  let digests: Map<string, ReportDigests>;
  try {
    digests = loadReportDigests(join(args.finalDir, "report.json"));
  } catch (err) {
    args.problems.push(err instanceof Error ? err.message : String(err));
    return;
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
    const photo = args.plannedPhotos.get(ref);
    if (row.photo !== null && photo !== undefined && photo.sha256 !== row.photo) {
      args.problems.push(
        `${ref}: the photo in the photos folder is another photo than the one that the readers read (report.json); give the records and the photos of the same work folder, or run reference:compare again`,
      );
    }
  }
}
