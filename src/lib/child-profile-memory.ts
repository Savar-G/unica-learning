// The child's profile's seams (src/lib/child-profile.ts, #303) in memory, for tests: the profile store and the learning
// events' store (src/lib/learning-events-memory.ts) over the same families. It keeps the database's rules: one profile
// per child, stored as JSON, its schema version beside it; a save only over the revision it expects (compare and set);
// a child under its parent (the foreign key); no write for a family whose deletion is requested (the family write
// fence). The latest assessment profile is the stored profile of the child's test that finished last.
import type { Grade, ProfileLearning } from "@/lib/assessment";
import type { ChildProfileStore, StoredChildProfile } from "@/lib/child-profile";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";

export interface MemoryChildFamilies {
  children: { id: string; parentId: string; grade: Grade }[];
  /** Each finished test of a child, with its stored assessment profile (the JSON, with its buildId) or null. */
  tests?: { id: string; childId: string; completedAt: string; profile: unknown }[];
  /** The parents' answers on the learning card, by child id. */
  learning?: Record<string, ProfileLearning>;
  /** The parents whose family deletion is requested. */
  deleting?: string[];
}

/** A value as the database stores JSON. */
const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

export function memoryChildProfiles(families: MemoryChildFamilies) {
  const rows = new Map<string, StoredChildProfile & { parentId: string; assessmentId: string | null }>();
  const tests = families.tests ?? [];
  const profiles: ChildProfileStore = {
    async current(childId) {
      const row = rows.get(childId);
      return row ? { revision: row.revision, builtAt: row.builtAt, schemaVersion: row.schemaVersion, profile: json(row.profile) } : null;
    },
    async inputs(childId) {
      const child = families.children.find((c) => c.id === childId);
      if (!child) return null;
      const latest = tests.filter((t) => t.childId === childId && t.profile !== null).sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
      const buildId = (latest?.profile as { buildId?: unknown } | undefined)?.buildId;
      return {
        parentId: child.parentId,
        grade: child.grade,
        learning: families.learning?.[childId] ? structuredClone(families.learning[childId]) : null,
        assessment: latest ? { assessmentId: latest.id, completedAt: latest.completedAt, buildId: typeof buildId === "string" ? buildId : null, profile: json(latest.profile) } : null,
      };
    },
    async save({ childId, parentId, assessmentId, profile }, expected) {
      if (families.deleting?.includes(parentId)) return { refused: "family_unavailable" };
      if (!families.children.some((c) => c.id === childId && c.parentId === parentId)) return { refused: "the child is not under that parent" };
      if ((rows.get(childId)?.revision ?? 0) !== expected) return "changed";
      const revision = expected + 1;
      rows.set(childId, { revision, builtAt: new Date().toISOString(), schemaVersion: profile.schemaVersion, profile: json(profile), parentId, assessmentId });
      return { revision };
    },
  };
  const events = memoryLearningEventStore({
    children: families.children,
    tests: tests.map((t) => ({ id: t.id, childId: t.childId })),
    deleting: families.deleting,
  });
  return { profiles, events, rows: () => [...rows.entries()].map(([childId, row]) => ({ childId, ...row })) };
}
