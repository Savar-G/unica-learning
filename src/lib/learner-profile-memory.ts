// The learner profile's store (src/lib/learner-profile.ts, #196) in memory, for tests. It reads the tests from the
// report-loading module's in-memory tables (src/lib/report-loading-memory.ts), as in one database, and keeps the
// database's rules: one profile per test, stored as JSON, its schema version beside it. The parents' answers on the
// learning card are its own, by child id; a test may change them. It counts its reads in the readers' counter.
import type { ProfileLearning } from "@/lib/assessment";
import type { LearnerProfileStore } from "@/lib/learner-profile";
import { countRead, type MemoryReportTables } from "@/lib/report-loading-memory";

/** A row of public.learner_profiles. `profile` is the stored JSON. */
export interface MemoryProfileRow {
  assessmentId: string;
  parentId: string;
  childId: string;
  schemaVersion: number;
  profile: unknown;
}

/**
 * The store over the tables. `reads`: the read counter (memoryReportReaders().reads). `learning`: each child's answers
 * on the card, by child id. `rows()` gives the stored profiles, in the order first stored.
 */
export function memoryLearnerProfileStore(
  tables: MemoryReportTables,
  { reads = {}, learning = {} }: { reads?: Record<string, number>; learning?: Record<string, ProfileLearning> } = {},
) {
  const rows: MemoryProfileRow[] = [];
  const store: LearnerProfileStore = {
    async learning(childId) {
      countRead(reads, "children");
      return learning[childId] ? structuredClone(learning[childId]) : null;
    },
    async latestFinished(childId) {
      countRead(reads, "assessments");
      const finished = (tables.assessments ?? []).filter((a) => a.childId === childId && a.status === "completed" && a.completedAt);
      return finished.sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))[0]?.id ?? null;
    },
    async save({ assessmentId, parentId, childId, profile }) {
      if (!(tables.assessments ?? []).some((a) => a.id === assessmentId)) throw new Error("learner_profiles: no such test"); // the foreign key
      const row: MemoryProfileRow = { assessmentId, parentId, childId, schemaVersion: profile.schemaVersion, profile: JSON.parse(JSON.stringify(profile)) };
      const at = rows.findIndex((r) => r.assessmentId === assessmentId);
      if (at === -1) rows.push(row);
      else rows[at] = row;
    },
  };
  return { store, learning, rows: () => rows };
}
