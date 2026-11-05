import { PROFILE_SCHEMA_VERSION } from "@/lib/assessment";

/** Shared by real runs and read-only previews. Bump when the learner rebuild derives new workbook facts. */
export const WORKBOOK_LEARNER_DERIVED_VERSION = 1;

export function staleLearnerProfile(schemaVersion: number | null, value: unknown): boolean {
  const profile = value as { schemaVersion?: unknown; workbookDerivedVersion?: unknown; facts?: unknown } | null;
  return schemaVersion !== PROFILE_SCHEMA_VERSION || profile?.schemaVersion !== PROFILE_SCHEMA_VERSION
    || profile.workbookDerivedVersion !== WORKBOOK_LEARNER_DERIVED_VERSION || profile.facts === undefined;
}
