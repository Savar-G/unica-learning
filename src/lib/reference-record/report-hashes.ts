import { join } from "node:path";
import { parseStrictUtf8Json } from "./import-photos";
import { readRegularFileIfExists } from "./read-file";

// The hash of each final record as the last compare wrote it. Another hash on disk means that a
// person changed the file. A malformed report is an error: without its hashes, compare would write
// over a record that a person changed, and import would send it under a machine status.
export function loadPreviousHashes(reportPath: string): Map<string, string> {
  const hashes = new Map<string, string>();
  try {
    const bytes = readRegularFileIfExists(reportPath);
    const report = bytes === null ? null : (parseStrictUtf8Json(bytes) as { pages?: unknown } | null);
    const pages: unknown = report?.pages ?? [];
    if (!Array.isArray(pages)) throw new Error("pages is not a list");
    pages.forEach((page: unknown, i) => {
      const row = (page ?? {}) as { source_ref?: unknown; final_record_sha256?: unknown };
      const hash = row.final_record_sha256 ?? null;
      if (typeof row.source_ref !== "string") throw new Error(`pages[${i}] has no source_ref`);
      if (hash === null) return;
      if (typeof hash !== "string") {
        throw new Error(`pages[${i}] (${row.source_ref}) has a hash that is not text`);
      }
      if ((hashes.get(row.source_ref) ?? hash) !== hash) {
        throw new Error(`pages[${i}] gives a second hash for ${row.source_ref}`);
      }
      hashes.set(row.source_ref, hash);
    });
  } catch (err) {
    throw new Error(
      `Malformed previous report ${reportPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return hashes;
}

// Import: a page with a machine status must be the file that the last compare wrote. The hash is of
// the bytes that the import read and would send. A human_checked page follows its digests instead.
export function checkMachineRecordHashes(args: {
  finalDir: string;
  statusByRef: ReadonlyMap<string, string>;
  recordSha256ByRef: ReadonlyMap<string, string>;
  problems: string[];
}): void {
  let hashes: Map<string, string>;
  try {
    hashes = loadPreviousHashes(join(args.finalDir, "report.json"));
  } catch (err) {
    args.problems.push(err instanceof Error ? err.message : String(err));
    return;
  }
  for (const [ref, recordSha256] of args.recordSha256ByRef) {
    const hash = hashes.get(ref);
    if (args.statusByRef.get(ref) === "human_checked") continue;
    if (hash === undefined || hash === recordSha256) continue;
    args.problems.push(
      `${ref}: the record is not the file that report.json gives (it changed after reference:compare wrote it); run reference:compare again, then a person runs reference:check for this page`,
    );
  }
}
