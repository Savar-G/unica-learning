// The parent view module's reader (src/lib/parent-view.ts) in memory, for tests. It keeps the database's access rules:
// a parent reads only their own rows of each table, and only shipped workbooks. It hands back whole rows, with any extra
// field a test puts on them, so a test can tell that the module copies only the fields it names. It counts the reads of
// each table, and a table in `fail` throws when read.
import type { AttemptStatus, Grade } from "@/lib/assessment";
import type { TabSwitches } from "@/lib/child-stage";
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
}
export type MemoryPlan = Owned & Pick<PlanRecord, "kind">;

const TABLES = ["children", "tests", "reports", "cards", "deliveries", "workbooks", "plans", "switches"] as const;
type Table = (typeof TABLES)[number];

export interface MemoryParentViewTables {
  children: MemoryChild[];
  tests?: MemoryTest[];
  reports?: MemoryReport[];
  cards?: MemoryCard[];
  deliveries?: Owned[];
  workbooks?: MemoryWorkbook[];
  plans?: MemoryPlan[];
  /** One value for every parent; every switch is off when left out. */
  switches?: TabSwitches;
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
          .map((c) => ({ ...c, grade: c.grade as Grade }));
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
        return own(tables.deliveries);
      },
      async shippedWorkbooks() {
        read("workbooks");
        return own(tables.workbooks).filter((w) => w.status === "shipped");
      },
      async plans() {
        read("plans");
        return own(tables.plans);
      },
      async switches() {
        read("switches");
        return tables.switches ?? { progress: false, maya: false, scanPages: false };
      },
    };
  };
  return { parent, reads };
}
