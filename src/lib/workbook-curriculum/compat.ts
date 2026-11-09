// Whether a book planned on one curriculum version can be followed by a book planned on today's (new-book planning only:
// book2Planning and planNextBookFromSnapshot). Exact replay (workbook-preview-record.ts) and the baseline recovery
// verifier keep their exact version check.
//
// The rule: the same fingerprint is compatible, as before. A different fingerprint is compatible only when the frozen
// version's structure, from the archive (./history), equals today's structure in full: every level, unit, skill and step,
// with their order, numbers, position codes, levels and step names (./structure.ts). Templates, practice, number ranges
// and wording may differ. Whole-structure equality, not only the parts a book references: it is the simplest rule that
// covers every frozen fact (placement standards, issued steps, the bound levels) and every level the planner reads next,
// and it refuses on any doubt. A frozen version not in the archive refuses. Pure TypeScript.
import { curriculumStructure, curriculumVersion } from ".";
import { archivedCurriculumStructure } from "./history";
import { structureDifference, type CurriculumStructure } from "./structure";

/** Where the check reads the curriculum now and the frozen structures. Tests pass their own. */
export interface CurriculumCompatSource {
  version(key: string): string | null;
  structure(key: string): CurriculumStructure | null;
  frozen(key: string, version: string): CurriculumStructure | null;
}
export const CURRENT_CURRICULUM: CurriculumCompatSource = { version: curriculumVersion, structure: curriculumStructure, frozen: archivedCurriculumStructure };

export type CurriculumCompatRefusal = "curriculum-version-changed" | "curriculum-history-missing" | "curriculum-incompatible";
export type CurriculumCompat = { ok: true; same: boolean } | { ok: false; reason: CurriculumCompatRefusal; difference?: string };

/** Whether the next book may be planned on today's curriculum `key` after a book frozen at `version`. */
export function nextBookCurriculumCompat(key: string, version: string, source: CurriculumCompatSource = CURRENT_CURRICULUM): CurriculumCompat {
  try {
    const now = source.version(key);
    // An unknown curriculum keeps the reason it always had.
    if (now === null) return { ok: false, reason: "curriculum-version-changed" };
    if (now === version) return { ok: true, same: true };
    const frozen = source.frozen(key, version);
    if (!frozen) return { ok: false, reason: "curriculum-history-missing" };
    const today = source.structure(key);
    if (!today) return { ok: false, reason: "curriculum-incompatible", difference: `no structure for ${key} now` };
    const difference = structureDifference(frozen, today);
    return difference === null ? { ok: true, same: false } : { ok: false, reason: "curriculum-incompatible", difference };
  } catch { return { ok: false, reason: "curriculum-incompatible", difference: "the structures could not be compared" }; }
}
