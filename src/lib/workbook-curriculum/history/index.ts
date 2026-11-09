// The curriculum structure archive: the structure of each curriculum version a Book 1 baseline was frozen on, keyed by
// curriculum key and curriculumVersion fingerprint. Each file is written by scripts/curriculum-history.mjs only for the
// Git commit whose curriculum data gives that exact fingerprint; the file names the commit. New-book planning reads it
// (../compat.ts). Add an entry when a baseline is frozen on a version that is not here: docs/next-book-curriculum-history.md.
import { readCurriculumStructureRecord, structureOfRecord, type CurriculumStructure } from "../structure";
import bc_0c03a54a51742c070ffff230599f from "./bc-0c03a54a51742c070ffff230599f.json";

const ARCHIVE: readonly unknown[] = [bc_0c03a54a51742c070ffff230599f];

/** The frozen structure of curriculum `key` at fingerprint `version`, from the files given; null when none is there or it is malformed. */
export function archivedStructureIn(files: readonly unknown[], key: string, version: string): CurriculumStructure | null {
  const found = files.flatMap(f => f && typeof f === "object" && (f as { key?: unknown }).key === key && (f as { digest?: unknown }).digest === version ? [f] : []);
  if (found.length !== 1) return null;
  const record = readCurriculumStructureRecord(found[0], key, version);
  return record ? structureOfRecord(record) : null;
}

/** The frozen structure of curriculum `key` at fingerprint `version` from the committed archive, or null. */
export const archivedCurriculumStructure = (key: string, version: string): CurriculumStructure | null => archivedStructureIn(ARCHIVE, key, version);
