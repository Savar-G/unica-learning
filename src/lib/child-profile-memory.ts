// The child's profile's seams (src/lib/child-profile.ts, #303) in memory, for tests: the profile store and the learning
// events' store (src/lib/learning-events-memory.ts) over the same families. It keeps the database's rules: one profile
// per child, stored as JSON, its schema version beside it; a save only over the build token it expects (compare and
// set), each save a new token; no write for a family whose deletion is requested, or on another family's test (the
// family write fence); a child under its parent and a test of that child (the foreign keys); a test that is gone asks
// for a new build. deleteTest deletes a test as the database's cascades do: the profile built on it and its events. The latest assessment profile is the stored profile of the child's test that finished last. A save with history rows keeps the rules of save_child_profile_and_skill_changes_from_tests: the rows go with the build or not at all, and neither is stored when a test they came from is gone; `history()` reads its rows.
import type { Grade, ProfileLearning, SkillEvidence, SkillState, SkillStateReason } from "@/lib/assessment";
import type { ChildProfileStore, StoredChildProfile } from "@/lib/child-profile";
import type { LearningEventStore } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import type { WorkbookStatus } from "@/lib/workbook-content";

export interface MemoryChildFamilies {
  children: { id: string; parentId: string; grade: Grade }[];
  /** Each finished test of a child, with its stored assessment profile (the JSON, with its buildId) or null. */
  tests?: { id: string; childId: string; completedAt: string; profile: unknown }[];
  /** The parents' answers on the learning card, by child id. */
  learning?: Record<string, ProfileLearning>;
  /** The parents whose family deletion is requested. */
  deleting?: string[];
  /** Each workbook of a child, with the BC standards of its questions. */
  workbooks?: { childId: string; number: number; status: WorkbookStatus; standards: string[] }[];
}

/** One row of the skill state history. */
export interface MemorySkillStateRow {
  childId: string;
  parentId: string;
  standard: string;
  state: SkillState;
  reason: SkillStateReason;
  evidenceSource: SkillEvidence;
  evidenceAt: string | null;
  changedAt: string;
}

/** A value as the database stores JSON. */
const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

export function memoryChildProfiles(families: MemoryChildFamilies) {
  const rows = new Map<string, StoredChildProfile & { parentId: string; assessmentId: string | null }>();
  // The families' own list: a test added to it later counts, and deleteTest removes from it.
  const tests = families.tests ?? (families.tests = []);
  const workbooks = families.workbooks ?? (families.workbooks = []);
  const deleting = families.deleting ?? (families.deleting = []);
  const history: MemorySkillStateRow[] = [];
  const profiles: ChildProfileStore = {
    async skillInputs(childId) {
      const shipped = workbooks.filter((w) => w.childId === childId && w.status === "shipped").sort((a, b) => b.number - a.number)[0];
      return {
        tests: tests.filter((t) => t.childId === childId && t.profile !== null).map((t) => ({ assessmentId: t.id, completedAt: t.completedAt, profile: json(t.profile) })),
        workbookStandards: [...(shipped?.standards ?? [])],
        history: history.filter((r) => r.childId === childId).map((r) => ({ standard: r.standard, state: r.state })),
      };
    },
    async current(childId) {
      const row = rows.get(childId);
      return row ? { revision: row.revision, buildToken: row.buildToken, builtAt: row.builtAt, schemaVersion: row.schemaVersion, profile: json(row.profile) } : null;
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
    async save({ childId, parentId, assessmentId, profile, skillChanges }, expected) {
      if (deleting.includes(parentId)) return { refused: "family_unavailable" };
      // Before anything else, as the function locks the tests first. Only when there are rows, as the store only then calls it.
      if (skillChanges?.rows.length && !skillChanges.tests.every((id) => tests.some((t) => t.id === id && t.childId === childId))) return "changed";
      if (assessmentId !== null) {
        const test = tests.find((t) => t.id === assessmentId);
        // A test that is gone asks for a new build; a test of another family is out of the family's scope.
        if (!test) return "changed";
        if (families.children.find((c) => c.id === test.childId)?.parentId !== parentId) return { refused: "family_scope" };
        if (test.childId !== childId) return { refused: "the test is not the child's" };
      }
      if (!families.children.some((c) => c.id === childId && c.parentId === parentId)) return { refused: "the child is not under that parent" };
      if ((rows.get(childId)?.buildToken ?? null) !== (expected?.buildToken ?? null)) return "changed";
      const revision = (expected?.revision ?? 0) + 1;
      const buildToken = crypto.randomUUID();
      rows.set(childId, { revision, buildToken, builtAt: new Date().toISOString(), schemaVersion: profile.schemaVersion, profile: json(profile), parentId, assessmentId });
      const changedAt = new Date().toISOString();
      history.push(...(skillChanges?.rows ?? []).map((c) => ({ childId, parentId, standard: c.standard, state: c.state, reason: c.reason, evidenceSource: c.evidence, evidenceAt: c.evidenceAt, changedAt })));
      return { revision, buildToken };
    },
  };
  const stored = memoryLearningEventStore({
    children: families.children,
    tests: tests.map((t) => ({ id: t.id, childId: t.childId })),
    deleting,
  });
  // The deleted tests' events are gone, as the cascade from the test deletes them.
  const deleted = new Set<string>();
  const kept = (e: { question: { source: string; assessmentId?: string } }) => e.question.source !== "assessment" || !deleted.has(e.question.assessmentId!);
  const events: LearningEventStore = {
    async insert(event) {
      if (event.question.source === "assessment" && deleted.has(event.question.assessmentId)) return { refused: "the test is not the child's" };
      return stored.insert(event);
    },
    async range(childId, range) {
      return (await stored.range(childId, range)).filter(kept);
    },
  };
  /** Deletes a test as the database does: the test, the child's profile built on it, and the test's events. */
  function deleteTest(id: string) {
    const at = tests.findIndex((t) => t.id === id);
    if (at >= 0) tests.splice(at, 1);
    for (const [childId, row] of rows) if (row.assessmentId === id) rows.delete(childId);
    deleted.add(id);
  }
  return { profiles, events, tests, workbooks, deleting, deleteTest, history: () => [...history], rows: () => [...rows.entries()].map(([childId, row]) => ({ childId, ...row })) };
}
