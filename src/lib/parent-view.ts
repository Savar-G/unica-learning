import "server-only";
import { attemptState, type Attempt, type Grade } from "@/lib/assessment";
import { childStage, type StageView, type TabSwitches, type TestFact } from "@/lib/child-stage";
import type { ParentPlan } from "@/lib/parent-plan";
import type { CurriculumId } from "@/lib/signup";

// The parent view module (spec #544): the one server module for the dashboard's data. One seam: the reader, which is
// always one signed-in parent's and sees only that family's rows:
//   - Supabase (src/lib/parent-view-server.ts);
//   - in memory (src/lib/parent-view-memory.ts), for tests.
// The output holds only fields named here, copied one by one. The reader has no read of child_profiles,
// learner_profiles, learning_events or maya_calls, because parents get nothing from them directly (#295). Later tickets
// add the Overview (#560), Progress (#561) and Workbooks (#558) reads.

export interface ChildRecord {
  id: string;
  firstName: string;
  grade: Grade;
}
/** One try at the test. `answeredAll` is needed: a test with every answer in never expires. */
export type TestRecord = Attempt & { childId: string };
/** A report, with the curriculum of its test. */
export interface ReportRecord {
  childId: string;
  assessmentId: string;
  curriculum: CurriculumId;
}
export interface ShippedWorkbook {
  childId: string;
  number: number;
}
/** The stored plan state of one child (#548). A child with no row reads as `unknown`. */
export interface PlanRecord {
  childId: string;
  kind: ParentPlan["kind"];
}

/** Who reads: the seam. A read error throws. A row the reader may not see is not an error: it is left out. */
export interface ParentViewReader {
  /** The family's children, oldest first. */
  children(): Promise<ChildRecord[]>;
  tests(): Promise<TestRecord[]>;
  reports(): Promise<ReportRecord[]>;
  /** The children with a saved card. */
  cardsSaved(): Promise<{ childId: string }[]>;
  /** The children with a confirmed delivery, one row per delivered workbook. */
  deliveries(): Promise<{ childId: string }[]>;
  shippedWorkbooks(): Promise<ShippedWorkbook[]>;
  plans(): Promise<PlanRecord[]>;
  switches(): Promise<TabSwitches>;
}

export interface ChildView extends StageView {
  id: string;
  firstName: string;
  /** Parents may see this. The child, printed pages and the desk never show it (D-236). */
  schoolGrade: Grade;
  /** The newest shipped workbook, which opens the desk; null before the first one ships. */
  currentWorkbook: { number: number } | null;
}

/** Where a child's test stands at `now`. Only the latest finished test counts, unless a test is open. */
function testFact(tests: readonly TestRecord[], reports: readonly ReportRecord[], now: number): TestFact {
  if (tests.some((t) => attemptState(t, now) === "open")) return { state: "running" };
  const latest = tests.reduce<TestRecord | null>((best, t) => (t.status === "completed" && t.completedAt !== null && (!best || t.completedAt > best.completedAt!) ? t : best), null);
  if (!latest) return { state: "none" };
  const report = reports.find((r) => r.assessmentId === latest.id);
  return report ? { state: "report_ready", curriculum: report.curriculum } : { state: "running" };
}

/**
 * A failed plan read reads as no plan rows, so every plan is `unknown` and a delivered child stays in `active`. The plan
 * tells only `active` from `ended`, so it must not take the whole dashboard down. Every other failed read throws: read
 * as empty, it would show a paying family "Start the test".
 */
async function plansOf(reader: ParentViewReader): Promise<PlanRecord[]> {
  try {
    return await reader.plans();
  } catch (e) {
    console.error("[parent-view] plan read failed", e instanceof Error ? e.message : "failed");
    return [];
  }
}

/** The signed-in parent's children with their stages, oldest first. */
export async function listChildren(reader: ParentViewReader, now: number): Promise<ChildView[]> {
  const [children, tests, reports, cards, deliveries, workbooks, plans, switches] = await Promise.all([
    reader.children(), reader.tests(), reader.reports(), reader.cardsSaved(), reader.deliveries(), reader.shippedWorkbooks(), plansOf(reader), reader.switches(),
  ]);
  return children.map((child): ChildView => {
    const newest = Math.max(...workbooks.filter((w) => w.childId === child.id).map((w) => w.number), 0);
    const view = childStage({
      test: testFact(tests.filter((t) => t.childId === child.id), reports.filter((r) => r.childId === child.id), now),
      cardSaved: cards.some((c) => c.childId === child.id),
      delivered: deliveries.some((d) => d.childId === child.id),
      plan: plans.find((p) => p.childId === child.id)?.kind ?? "unknown",
    }, switches);
    return { id: child.id, firstName: child.firstName, schoolGrade: child.grade, ...view, currentWorkbook: newest > 0 ? { number: newest } : null };
  });
}

/** One child of the signed-in parent. Another family's child, and an id that does not exist, read as not found (null). */
export async function readChild(reader: ParentViewReader, childId: string, now: number): Promise<ChildView | null> {
  return (await listChildren(reader, now)).find((c) => c.id === childId) ?? null;
}
