import "server-only";
import { attemptState, type Attempt, type Grade } from "@/lib/assessment";
import { childStage, type StageView, type TabSwitches, type TestFact } from "@/lib/child-stage";
import { familyZone, localDay } from "@/lib/family-time";
import { nextBook, type NextBook } from "@/lib/next-book";
import type { ParentPlan } from "@/lib/parent-plan";
import type { CurriculumId } from "@/lib/signup";
import { workbookDelivery } from "@/lib/workbook-email";

// The parent view module (spec #544): the one server module for the dashboard's data. One seam: the reader, which is
// always one signed-in parent's and sees only that family's rows:
//   - Supabase (src/lib/parent-view-server.ts);
//   - in memory (src/lib/parent-view-memory.ts), for tests.
// The output holds only fields named here, copied one by one. The reader has no read of child_profiles,
// learner_profiles, learning_events or maya_calls, because parents get nothing from them directly (#295). Later tickets
// add the Overview (#560) and Progress (#561) reads. The Workbooks read (#558) is `readWorkbooks`.

export interface ChildRecord {
  id: string;
  firstName: string;
  grade: Grade;
  /** For the family's time zone only (src/lib/family-time.ts). */
  province: string | null;
}
/** One try at the test. `answeredAll` is needed: a test with every answer in never expires. */
export type TestRecord = Attempt & { childId: string };
/** A report, with the curriculum of its test. */
export interface ReportRecord {
  id: string;
  childId: string;
  assessmentId: string;
  curriculum: CurriculumId;
}
export interface ShippedWorkbook {
  id: string;
  childId: string;
  number: number;
  shippedAt: string | null;
  hasPdf: boolean;
}
/** A confirmed delivery, as first recorded. */
export interface DeliveryRecord {
  childId: string;
  workbookId: string;
  deliveredAt: string;
}
/** A later correction of a delivery time; the highest `auditId` is the current time. */
export interface DeliveryCorrectionRecord {
  workbookId: string;
  deliveredAt: string;
  auditId: number;
}
/** The delivery details of a workbook's dispatch email, unchecked: the module checks them. */
export interface DispatchRecord {
  childId: string;
  number: number;
  delivery: unknown;
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
  deliveries(): Promise<DeliveryRecord[]>;
  deliveryCorrections(): Promise<DeliveryCorrectionRecord[]>;
  shippedWorkbooks(): Promise<ShippedWorkbook[]>;
  /** The family's dispatch emails' delivery details (carrier, tracking), one row per numbered workbook. */
  dispatches(): Promise<DispatchRecord[]>;
  plans(): Promise<PlanRecord[]>;
  switches(): Promise<TabSwitches>;
  /** The family's saved time zone and postal code, for family time. */
  family(): Promise<{ timeZone: string | null; postal: string | null }>;
}

export interface ChildView extends StageView {
  id: string;
  firstName: string;
  /** Parents may see this. The child, printed pages and the desk never show it (D-236). */
  schoolGrade: Grade;
  /** The newest shipped workbook, which opens the desk; null before the first one ships. */
  currentWorkbook: { number: number } | null;
  /** The child's reports, newest test first. */
  reportIds: string[];
  /** The tests with a report, newest first: the Assessment tab's list. */
  finishedTests: { reportId: string; finishedAt: number }[];
}

/** Where a child's test stands at `now`. Only the latest finished test counts, unless a test is open. */
function testFact(tests: readonly TestRecord[], reports: readonly ReportRecord[], now: number): TestFact {
  if (tests.some((t) => attemptState(t, now) === "open")) return { state: "running" };
  const latest = tests.reduce<TestRecord | null>((best, t) => (t.status === "completed" && t.completedAt !== null && (!best || t.completedAt > best.completedAt!) ? t : best), null);
  if (!latest) return { state: "none" };
  const report = reports.find((r) => r.assessmentId === latest.id);
  return report ? { state: "report_ready", curriculum: report.curriculum } : { state: "running" };
}

/** The reports, newest test first, with the time each test finished (0 when its test cannot be read). */
function reportsByTime(tests: readonly TestRecord[], reports: readonly ReportRecord[]): { reportId: string; finishedAt: number }[] {
  return reports.map((r) => ({ reportId: r.id, finishedAt: tests.find((t) => t.id === r.assessmentId)?.completedAt ?? 0 })).sort((a, b) => b.finishedAt - a.finishedAt);
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
    const own = { tests: tests.filter((t) => t.childId === child.id), reports: reports.filter((r) => r.childId === child.id) };
    const view = childStage({
      test: testFact(own.tests, own.reports, now),
      cardSaved: cards.some((c) => c.childId === child.id),
      delivered: deliveries.some((d) => d.childId === child.id),
      plan: plans.find((p) => p.childId === child.id)?.kind ?? "unknown",
    }, switches);
    const finished = reportsByTime(own.tests, own.reports);
    return { id: child.id, firstName: child.firstName, schoolGrade: child.grade, ...view, currentWorkbook: newest > 0 ? { number: newest } : null, reportIds: finished.map((f) => f.reportId), finishedTests: finished.filter((f) => f.finishedAt > 0) };
  });
}

/** One child of the signed-in parent. Another family's child, and an id that does not exist, read as not found (null). */
export async function readChild(reader: ParentViewReader, childId: string, now: number): Promise<ChildView | null> {
  return (await listChildren(reader, now)).find((c) => c.id === childId) ?? null;
}

/** How a book travels. Mail always has a carrier and a tracking number; the tracking link is optional. */
export type WorkbookDeliveryView = { method: "hand" } | { method: "mail"; carrier: string; trackingNumber: string; trackingUrl: string | null };

export interface CurrentWorkbookView {
  id: string;
  number: number;
  /** Calendar days in family time. */
  shippedOn: string | null;
  deliveredOn: string | null;
  /** Null until the dispatch email holds checked details. */
  delivery: WorkbookDeliveryView | null;
}

export interface ShippedBookView {
  id: string;
  number: number;
  shippedOn: string | null;
  hasPdf: boolean;
}

export interface WorkbooksView {
  child: ChildView;
  /** The newest shipped book; null before the first one ships. */
  current: CurrentWorkbookView | null;
  next: NextBook;
  /** Every shipped book, newest first. */
  books: ShippedBookView[];
}

function deliveryView(value: unknown): WorkbookDeliveryView | null {
  const d = workbookDelivery(value);
  if (!d) return null;
  return d.method === "hand" ? { method: "hand" } : { method: "mail", carrier: d.carrier, trackingNumber: d.trackingNumber, trackingUrl: d.trackingUrl || null };
}

/**
 * One child's Workbooks tab (#558): the current book, its tracking, the next book's range and the shipped books.
 * Null for a child that is not the parent's, and for a child whose stage has no Workbooks tab.
 */
export async function readWorkbooks(reader: ParentViewReader, childId: string, now: number): Promise<WorkbooksView | null> {
  const [child, children, family, workbooks, deliveries, corrections, dispatches] = await Promise.all([
    readChild(reader, childId, now), reader.children(), reader.family(), reader.shippedWorkbooks(), reader.deliveries(), reader.deliveryCorrections(), reader.dispatches(),
  ]);
  if (!child || !child.tabs.includes("workbooks")) return null;
  // The reader gives the children oldest first, so the first one's province is the family's fallback.
  const zone = familyZone({ timeZone: family.timeZone, postal: family.postal, province: children[0]?.province ?? null });
  const day = (at: string | null) => (at === null ? null : localDay(at, zone));
  const books = workbooks.filter((w) => w.childId === child.id).sort((a, b) => b.number - a.number);
  const newest = books[0] ?? null;
  let current: CurrentWorkbookView | null = null;
  if (newest) {
    const receipt = deliveries.find((d) => d.childId === child.id && d.workbookId === newest.id);
    const corrected = corrections.filter((c) => c.workbookId === newest.id).reduce<DeliveryCorrectionRecord | null>((best, c) => (!best || c.auditId > best.auditId ? c : best), null);
    const dispatch = dispatches.find((d) => d.childId === child.id && d.number === newest.number);
    current = {
      id: newest.id,
      number: newest.number,
      shippedOn: day(newest.shippedAt),
      deliveredOn: receipt ? day(corrected?.deliveredAt ?? receipt.deliveredAt) : null,
      delivery: dispatch ? deliveryView(dispatch.delivery) : null,
    };
  }
  const next: NextBook = current && current.shippedOn === null && !child.readOnly
    ? { kind: "none" }
    : nextBook({ shippedOn: current?.shippedOn ?? null, deliveredOn: current?.deliveredOn ?? null, today: localDay(now, zone), ended: child.readOnly });
  return { child, current, next, books: books.map((w) => ({ id: w.id, number: w.number, shippedOn: day(w.shippedAt), hasPdf: w.hasPdf })) };
}
