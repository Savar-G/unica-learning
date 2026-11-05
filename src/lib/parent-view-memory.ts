// The parent view module's reader (src/lib/parent-view.ts) in memory, for tests. It keeps the database's access rules:
// a parent reads only their own rows of each table, and only shipped workbooks. It hands back whole rows, with any extra
// field a test puts on them, so a test can tell that the module copies only the fields it names. It counts the reads of
// each table, and a table in `fail` throws when read.
import type { AreaAnswer, AttemptStatus, Grade, ReportModel } from "@/lib/assessment";
import type { TabSwitches } from "@/lib/child-stage";
import type { LearningRow } from "@/lib/learning-style";
import type { ParentViewReader, PlanRecord } from "@/lib/parent-view";
import type { CurriculumId } from "@/lib/signup";

interface Owned {
  parentId: string;
  childId: string;
}
export interface MemoryChild {
  id: string;
  parentId: string;
  firstName: string;
  grade: number;
  createdAt: string;
  /** Defaults to BC. */
  province?: string;
  /** The learning card; every answer empty when left out. */
  learning?: Partial<LearningRow>;
}
export interface MemoryTest extends Owned {
  id: string;
  province: CurriculumId;
  status: AttemptStatus;
  startedAt: number;
  lastAnswerAt: number | null;
  resumeUntil: number;
  completedAt: number | null;
  answeredAll?: boolean;
  /** The stored test's `pace.unreliable` (#189). */
  unreliable?: boolean;
}
export interface MemoryReport extends Owned {
  /** Defaults to `report-<assessmentId>`. */
  id?: string;
  assessmentId: string;
}
export interface MemoryCard extends Owned {
  cardSavedAt: string | null;
}
export interface MemoryWorkbook extends Owned {
  number: number;
  status: string;
  /** Defaults to `wb-<child>-<number>`. */
  id?: string;
  shippedAt?: string | null;
  pdfPath?: string | null;
}
export interface MemoryDelivery extends Owned {
  /** Defaults to an id that matches no workbook. */
  workbookId?: string;
  deliveredAt?: string;
}
export interface MemoryCorrection extends Owned {
  workbookId: string;
  deliveredAt: string;
  auditId: number;
}
export interface MemoryDispatch extends Owned {
  number: number;
  delivery: unknown;
}
export type MemoryPlan = Owned & Pick<PlanRecord, "kind">;
/** A finished test's stored report level and its scored answers (null: the stored test cannot be replayed). */
export interface MemoryResult extends Owned {
  assessmentId: string;
  level: ReportModel["level"];
  answers: AreaAnswer[] | null;
  /** The stored report has the reliability note; false when left out. */
  unreliable?: boolean;
}
export interface MemoryScan extends Owned {
  workbookId: string;
  pageId: string;
  state: string;
  expiresAt: string;
  /** Defaults to 2026-01-01. */
  takenAt?: string;
}
/** A Maya minutes grant (public.maya_minute_grants): a call counts only as a child's, settled with time used. */
export interface MemoryMayaGrant extends Owned {
  kind: "child" | "parent_demo";
  createdAt: string;
  /** Null while the call is open. */
  usedSeconds: number | null;
}
export interface MemoryPage {
  parentId: string;
  workbookId: string;
  id: string;
  dayLabel: string | null;
}
/** One finished test's tally of one standard, as the learner profiles hold it. */
export interface MemorySkillTest extends Owned {
  standard: string;
  correct: number;
  total: number;
  at: string;
  /** The test the tally is from: with no report of it, no tally leaves; its result says whether the report calls it unreliable. */
  assessmentId: string;
}
/** One question of a workbook: its standard, as the question package names it. */
export interface MemoryWorkbookQuestion {
  parentId: string;
  workbookId: string;
  standard: string | null;
}

const TABLES = ["children", "tests", "reports", "cards", "deliveries", "workbooks", "plans", "switches", "corrections", "dispatches", "family", "results", "scans", "pages", "learning", "pin", "maya", "skillTests", "questions"] as const;
type Table = (typeof TABLES)[number];

export interface MemoryParentViewTables {
  children: MemoryChild[];
  tests?: MemoryTest[];
  reports?: MemoryReport[];
  cards?: MemoryCard[];
  deliveries?: MemoryDelivery[];
  corrections?: MemoryCorrection[];
  workbooks?: MemoryWorkbook[];
  /** The workbook emails' dispatch rows (admin-only in the database; the server reads them for the parent). */
  dispatches?: MemoryDispatch[];
  plans?: MemoryPlan[];
  /** One value for every parent; no saved zone or postal code when left out. */
  family?: { timeZone: string | null; postal: string | null };
  /** One value for every parent; every switch is off when left out. */
  switches?: TabSwitches;
  results?: MemoryResult[];
  scans?: MemoryScan[];
  pages?: MemoryPage[];
  /** One value for every parent; true when left out. */
  pinSet?: boolean | null;
  maya?: MemoryMayaGrant[];
  skillTests?: MemorySkillTest[];
  questions?: MemoryWorkbookQuestion[];
  fail?: Table[];
}

export function memoryParentViewReaders(tables: MemoryParentViewTables) {
  const reads = Object.fromEntries(TABLES.map((t) => [t, 0])) as Record<Table, number>;
  const read = (table: Table) => {
    reads[table]++;
    if (tables.fail?.includes(table)) throw new Error(`${table} read failed`);
  };

  const parent = (parentId: string): ParentViewReader => {
    const own = <T extends { parentId: string }>(rows: T[] | undefined) => (rows ?? []).filter((r) => r.parentId === parentId);
    return {
      async children() {
        read("children");
        return own(tables.children)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
          .map((c) => ({ ...c, grade: c.grade as Grade, province: c.province ?? "BC" }));
      },
      async tests() {
        read("tests");
        return own(tables.tests);
      },
      async reports() {
        read("reports");
        const tests = own(tables.tests);
        return own(tables.reports).flatMap((r) => {
          const test = tests.find((t) => t.id === r.assessmentId);
          return test ? [{ ...r, id: r.id ?? `report-${r.assessmentId}`, curriculum: test.province }] : [];
        });
      },
      async cardsSaved() {
        read("cards");
        return own(tables.cards).filter((c) => c.cardSavedAt !== null);
      },
      async deliveries() {
        read("deliveries");
        return own(tables.deliveries).map((d) => ({ ...d, workbookId: d.workbookId ?? "no-workbook", deliveredAt: d.deliveredAt ?? "2026-01-01T00:00:00Z" }));
      },
      async deliveryCorrections() {
        read("corrections");
        return own(tables.corrections);
      },
      async shippedWorkbooks() {
        read("workbooks");
        return own(tables.workbooks).filter((w) => w.status === "shipped")
          .map((w) => ({ ...w, id: w.id ?? `wb-${w.childId}-${w.number}`, shippedAt: w.shippedAt ?? null, hasPdf: (w.pdfPath ?? null) !== null }));
      },
      async dispatches() {
        read("dispatches");
        return own(tables.dispatches);
      },
      async family() {
        read("family");
        return tables.family ?? { timeZone: null, postal: null };
      },
      async plans() {
        read("plans");
        return own(tables.plans);
      },
      async switches() {
        read("switches");
        return tables.switches ?? { progress: false, maya: false, scanPages: false };
      },
      async testResult(assessmentId) {
        read("results");
        // As the database: only the family's own test, and only one with a report.
        const reported = own(tables.reports).some((r) => r.assessmentId === assessmentId);
        const row = own(tables.results).find((r) => r.assessmentId === assessmentId);
        return reported && row ? { level: row.level, answers: row.answers, unreliable: row.unreliable ?? false } : null;
      },
      async savedScans() {
        read("scans");
        return own(tables.scans).filter((s) => s.state === "saved").map((s) => ({ ...s, takenAt: s.takenAt ?? "2026-01-01T00:00:00Z" }));
      },
      async workbookPages(workbookId) {
        read("pages");
        const shipped = own(tables.workbooks).some((w) => (w.id ?? `wb-${w.childId}-${w.number}`) === workbookId && w.status === "shipped");
        return shipped ? own(tables.pages).filter((p) => p.workbookId === workbookId) : [];
      },
      async learningCards() {
        read("learning");
        return own(tables.children).map((c) => ({
          ...c, childId: c.id, learning_styles: null, interests: null, learning_note: null, math_feeling: null, learning_goal: null, weekly_time: null, ...c.learning,
        }));
      },
      async mayaCalls(childId, from, to) {
        read("maya");
        return own(tables.maya).filter((g) => g.kind === "child" && g.childId === childId && g.usedSeconds !== null && g.usedSeconds > 0
          && Date.parse(g.createdAt) >= from && Date.parse(g.createdAt) < to).length;
      },
      async skillTests(childId) {
        read("skillTests");
        // As the server: a test with no report yet gives no tally, and whether the test's stored report calls it
        // unreliable comes from that report, not from the tally.
        const reported = new Set(own(tables.reports).map((r) => r.assessmentId));
        const unreliable = new Set(own(tables.results).filter((r) => r.unreliable).map((r) => r.assessmentId));
        return own(tables.skillTests).filter((t) => t.childId === childId && reported.has(t.assessmentId)).map((t) => ({ ...t, unreliable: unreliable.has(t.assessmentId) }));
      },
      async workbookStandards(workbookId) {
        read("questions");
        // As the database: a parent reads only the questions of a shipped workbook of the family.
        const shipped = own(tables.workbooks).some((w) => (w.id ?? `wb-${w.childId}-${w.number}`) === workbookId && w.status === "shipped");
        if (!shipped) return [];
        return [...new Set(own(tables.questions).filter((q) => q.workbookId === workbookId).flatMap((q) => q.standard ?? []))];
      },
      async pinSet() {
        // As the server: a PIN that cannot be read is null, not an error.
        reads.pin++;
        if (tables.fail?.includes("pin")) return null;
        return tables.pinSet === undefined ? true : tables.pinSet;
      },
    };
  };
  return { parent, reads };
}
