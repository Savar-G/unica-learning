import "server-only";
import { resultLate } from "@/lib/report-late";
import {
  BC_SKILL_MAP, REPORTED_STRAND_NAMES, areaLevels, attemptState, skillStates, storedLevelCertainty,
  type AreaAnswer, type AreaLabel, type Attempt, type Grade, type Level, type ReportModel, type ReportedStrand, type SkillMark, type SkillState, type SkillTestResult, type StandardSkillState,
} from "@/lib/assessment";
import { childStage, type StageView, type TabSwitches, type TestFact } from "@/lib/child-stage";
import { addDays, addMonths, familyZone, formatCalendarDate, localDateTime, localDay, localMonth, type FamilyZone } from "@/lib/family-time";
import type { LearningRow } from "@/lib/learning-style";
import { firstDeliveryMonth, offeredSummaryMonth } from "@/lib/monthly-summary-offer";
import { needsHelpStandards, type HelpMark } from "@/lib/needs-help";
import { nextBook, type NextBook } from "@/lib/next-book";
import type { ParentPlan } from "@/lib/parent-plan";
import type { CurriculumId } from "@/lib/signup";
import { WORKBOOK_DAYS, bookToday, dayNumber, weekCircles, workbookDay, type WeekDay } from "@/lib/parent-week";
import { firstBatchAt, progressSummary, type ProgressSummary, type StateChange } from "@/lib/progress-series";
import { skillMapView, topicBars, type TopicBarView } from "@/lib/skill-map-view";
import { confirmedWorkbookDelivery } from "@/lib/workbook-delivery-access";
import { workbookDelivery } from "@/lib/workbook-email";

// The parent view module (spec #544): the one server module for the dashboard's data. One seam: the reader, which is
// always one signed-in parent's and sees only that family's rows:
//   - Supabase (src/lib/parent-view-server.ts);
//   - in memory (src/lib/parent-view-memory.ts), for tests.
// The output holds only fields named here, copied one by one. The reader has no read of child_profiles, learning_events
// or maya_calls, and of learner_profiles only each standard's tally (`skillTests`), because parents get nothing from them
// directly (#295). The Workbooks read (#558) is `readWorkbooks`; the Overview read (#560) is `readOverview`; the monthly
// summary's (#562) is `readMonthlySummary`; the Progress read (#561, #1004) is `readProgress`.

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
/** What marking stored for one child, read in one consistent moment (the marking revision did not change). */
export interface OverviewProgress {
  /** Each eligible original result of a shipped page of its current print revision, as an area answer (D-303). */
  marks: AreaAnswer[];
  /**
   * Each marked item's effective original result (`effectiveSkillMarks`), dated by its original event (when its first
   * result was saved), not by its last change as the profile rebuild dates it.
   */
  skillMarks: SkillMark[];
  /**
   * The same marks with a `blank` flag, for the Needs help rule only (`src/lib/needs-help.ts`): a blank answer is an
   * unfinished page, not a wrong one. The skill state rule reads `skillMarks`, where a blank is not right.
   */
  helpMarks: HelpMark[];
}

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
  /** Stored weeks that apply to this next workbook, from the private billing ledger. */
  pauseWeeks?(childId: string, number: number): Promise<number>;
  plans(): Promise<PlanRecord[]>;
  /** Children whose own open plan opens a tab (src/lib/plan-access.ts). */
  switches(): Promise<TabSwitches & { scanPlanChildren?: ReadonlySet<string>; mayaPlanChildren?: ReadonlySet<string> }>;
  /** The family's saved time zone and postal code, for family time. */
  family(): Promise<{ timeZone: string | null; postal: string | null }>;
  /** One of the family's finished tests with a report, scored; null for a test the family does not have or with no report. */
  testResult(assessmentId: string): Promise<TestResultRecord | null>;
  /** The family's scans saved to a page (state `saved`). */
  savedScans(): Promise<SavedScanRecord[]>;
  /** The pages of one of the family's shipped workbooks, with their day labels. */
  workbookPages(workbookId: string): Promise<WorkbookPageRecord[]>;
  /** The learning card of each of the family's children. */
  learningCards(): Promise<LearningCardRecord[]>;
  /** Whether the parent has a PIN; null when it cannot be read. */
  pinSet(): Promise<boolean | null>;
  /**
   * How many of the child's Maya chats ended from `from` up to, not including, `to` (epoch ms). A chat counts when the
   * child sent Maya at least one message; an admin test call never counts. Only a number: never a call's words, notes or
   * outcome.
   */
  mayaCalls(childId: string, from: number, to: number): Promise<number>;
  /** Each finished test's tally of each standard it asked, for one child: what the skill state rule reads, and nothing else. */
  skillTests(childId: string): Promise<SkillTestResult[]>;
  /** One child's saved page results and recorded skill changes; null for a child that is not the parent's. */
  overviewProgress(childId: string): Promise<OverviewProgress | null>;
  /** The BC standards of one of the family's shipped workbooks. */
  workbookStandards(workbookId: string): Promise<string[]>;
  /** The standard of each question of one of the family's shipped workbooks, with the page it is on (null: no standard). */
  workbookQuestions(workbookId: string): Promise<{ pageId: string; standard: string | null }[]>;
  /**
   * Each recorded change of a BC standard's state for one child (public.skill_state_history), by `changed_at`. Parents may
   * not read the table: the server reads it, filtered on the parent and the child, and only these three fields leave.
   */
  skillHistory(childId: string): Promise<StateChange[]>;
}

/** A finished test, as the report reads it. */
export interface TestResultRecord {
  /** The stored report's level (public.reports.model), before storedLevelCertainty. */
  level: ReportModel["level"];
  /**
   * One answer per scored question, tagged with its reported area and grade (testAreaAnswers); null when the stored test
   * cannot be replayed, the replay does not add up to the stored score, or the stored report does not show that score
   * (a test scored again after its report was made).
   */
  answers: AreaAnswer[] | null;
  /** The stored report has the reliability note (#189): `pace.unreliable`, so the report offers a new test. */
  unreliable: boolean;
}
export interface SavedScanRecord {
  workbookId: string;
  pageId: string;
  /** The photo expires then; an expired photo no longer counts. */
  expiresAt: string;
  /** When the photo was taken (uploaded). */
  takenAt: string;
}
export interface WorkbookPageRecord {
  id: string;
  /** "Day 1" to "Day 10"; null for a cover or another page with no day. */
  dayLabel: string | null;
}
export type LearningCardRecord = { childId: string } & LearningRow;

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
    }, { ...switches, scanPages: switches.scanPages || !!switches.scanPlanChildren?.has(child.id), maya: switches.maya || !!switches.mayaPlanChildren?.has(child.id) });
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
  /** A confirmed receipt, after its latest correction; null before delivery. */
  deliveredOn: string | null;
}

export interface WorkbooksView {
  child: ChildView;
  /** Today in family time (YYYY-MM-DD): the book's calendar day is counted from it (src/lib/parent-week.ts). */
  today: string;
  /** The newest shipped book; null before the first one ships. */
  current: CurrentWorkbookView | null;
  next: NextBook;
  /** Every shipped book, newest first. */
  books: ShippedBookView[];
  /**
   * Home's count for the child's current book (the newest with a confirmed delivery), so the Workbooks cover says the same
   * number: saved, unexpired photos over the book's day pages. Null when there is no such book or it cannot be read.
   */
  homeScan: { bookId: string; scanned: number; total: number } | null;
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
    const deliveredAt = confirmedWorkbookDelivery(deliveries, corrections, child.id, newest.id, now);
    const dispatch = dispatches.find((d) => d.childId === child.id && d.number === newest.number);
    current = {
      id: newest.id,
      number: newest.number,
      shippedOn: day(newest.shippedAt),
      deliveredOn: day(deliveredAt),
      delivery: dispatch ? deliveryView(dispatch.delivery) : null,
    };
  }
  const pausedWeeks = newest && reader.pauseWeeks ? await reader.pauseWeeks(child.id, newest.number + 1) : 0;
  const next: NextBook = current && current.shippedOn === null && !child.readOnly
    ? { kind: "none" }
    : nextBook({ shippedOn: current?.shippedOn ?? null, deliveredOn: current?.deliveredOn ?? null, today: localDay(now, zone), ended: child.readOnly, pausedWeeks });
  const shown = books.map((w) => ({ id: w.id, number: w.number, shippedOn: day(w.shippedAt), deliveredOn: day(confirmedWorkbookDelivery(deliveries, corrections, child.id, w.id, now)) }));
  // Home's book: the newest with a confirmed delivery. Its count is Home's: day pages (a page with a "Day N" label) that have
  // a saved photo that has not expired.
  const home = shown.find((b) => b.deliveredOn !== null);
  let homeScan: WorkbooksView["homeScan"] = null;
  if (home) {
    try {
      const [pages, scans] = await Promise.all([reader.workbookPages(home.id), reader.savedScans()]);
      const saved = new Set(scans.filter((s) => s.workbookId === home.id && Date.parse(s.expiresAt) > now).map((s) => s.pageId));
      const day = pages.filter((p) => dayNumber(p.dayLabel) !== null);
      homeScan = { bookId: home.id, scanned: day.filter((p) => saved.has(p.id)).length, total: day.length };
    } catch { homeScan = null; }
  }
  return { child, today: localDay(now, zone), current, next, books: shown, homeScan };
}

/** One reported area's bar (D-243). The school grade line is the child's `schoolGrade`. */
export interface AreaBarView {
  area: ReportedStrand;
  /** The area's name, as the report names it. */
  name: string;
  level: Level;
  label: AreaLabel;
  /** Too few answers to be sure: the bar shows lighter and says "Early sign". */
  earlySign: boolean;
}

/** The Level tile: the working level stored in the latest finished test's result. */
export interface LevelTileView {
  working: Level;
  /** An estimated level reads as an Early sign, as on the report. */
  earlySign: boolean;
  /** The day the test finished, in family time. */
  testedOn: string;
  /**
   * The report calls the test unreliable (its reliability note, `pace.unreliable`): no area bars, and one sentence in
   * their place (D-258, #579). The Level tile stays, as the report keeps the level beside its note.
   */
  unreliable: boolean;
}

/** One thing to do, in the spec's order; the Overview shows only the first that applies (D-248). */
export type ActionItem = "start_test" | "continue_test" | "payment_failed" | "no_pin" | "learning_card_empty";

/** One skill on Home (#1003): its name from the skill map and, for a Mastered skill, when the record says it was mastered. */
export interface SkillItemView {
  code: string;
  name: string;
  /** "today", a weekday ("Wednesday") within the last week, else a date ("Nov 3"), in family time; null with no recorded row. */
  masteredOn: string | null;
}

/**
 * The three lists since the child started, from the skill state rule and the dashboard's Needs help rule (`src/lib/needs-help.ts`):
 * Mastered; Learning (working on, not struggling now); Needs help (needs review, or struggling now with a Learning skill).
 */
export interface HomeSkillsView {
  mastered: SkillItemView[];
  learning: SkillItemView[];
  needsHelp: SkillItemView[];
}

/** The workbook card on Home. */
export interface WorkbookCardView {
  number: number;
  /** The workbook day the child is on, 1 to `days`. */
  day: number;
  days: number;
  /** Pages scanned of the book's day pages, as a whole percent; null before any page is scanned. */
  percent: number | null;
  /**
   * The day row; null once the book's last day has passed or the plan has ended: the card then shows only the book and its
   * percent done.
   */
  today: {
    /** "Today"; "Friday" on a weekend; "Day 1 · Monday" before the book's first weekday (a weekend delivery). */
    label: string;
    /** The skill most of the day's questions are on; null when the book's questions cannot be read. */
    topic: string | null;
    scanned: number;
    pages: number;
  } | null;
}

export interface OverviewView {
  child: ChildView;
  /** The newest finished test's report is not ready, so no older result shows in its place. */
  resultPreparing: boolean;
  /** The report is more than an hour late (src/lib/report-late.ts): the report job and its retries have not made it yet. */
  resultLate: boolean;
  /** Monday to Friday of this week; null until the current book is delivered. */
  week: WeekDay[] | null;
  /** The newest book with a confirmed delivery; null until one is delivered. */
  workbook: WorkbookCardView | null;
  /** The number of a newer book that is mailed and not delivered yet ("Workbook 2 is on its way"); null when there is none. */
  onTheWay: number | null;
  /** The family has no saved scan yet: "Scan the first pages when they're done". Null after the first scan. */
  scanPrompt: { day: number; pages: number } | null;
  /** Null when the inputs are unavailable, or the Progress tab is off (the skill map is not released yet: #194). */
  skills: HomeSkillsView | null;
  /**
   * The monthly summary's month (YYYY-MM, family time) that the dashboard offers: the last finished month, from the month
   * after the child's first confirmed delivery (D-248). Home no longer shows it (#1003); the monthly email agrees with it.
   */
  summaryMonth: string | null;
}

/** The newest delivered book's day pages and scans, for one child. */
interface BookDays {
  id: string;
  number: number;
  /** The family-time day it was delivered. */
  start: string;
  /** The page ids of each workbook day. */
  pages: Map<number, string[]>;
  /** The page ids with a saved photo that has not expired. */
  saved: ReadonlySet<string>;
  /** The days whose every page has a saved photo. */
  doneDays: ReadonlySet<number>;
}

/**
 * The child's current book as the Home and the Progress tab count it: the newest book with a confirmed delivery (a newer
 * book still in the mail does not hide it), with its day pages. A day
 * is done when every page with that day label has a saved photo that has not expired. Null before delivery.
 * Pages to scan and the Day 7 rule (#475) will count days from the print manifest; until then this counts whole days.
 */
async function readBookDays(
  reader: ParentViewReader, child: ChildView, now: number, zone: FamilyZone,
  { workbooks, deliveries, corrections, scans }: { workbooks: readonly ShippedWorkbook[]; deliveries: readonly DeliveryRecord[]; corrections: readonly DeliveryCorrectionRecord[]; scans: readonly SavedScanRecord[] },
): Promise<BookDays | null> {
  let book: ShippedWorkbook | undefined, deliveredAt: string | null = null;
  for (const w of workbooks.filter((w) => w.childId === child.id).sort((a, b) => b.number - a.number)) {
    deliveredAt = confirmedWorkbookDelivery(deliveries, corrections, child.id, w.id, now);
    if (deliveredAt !== null) { book = w; break; }
  }
  if (!book || deliveredAt === null) return null;
  const pages = new Map<number, string[]>();
  for (const page of await reader.workbookPages(book.id)) {
    const day = dayNumber(page.dayLabel);
    if (day !== null) pages.set(day, [...(pages.get(day) ?? []), page.id]);
  }
  const saved = new Set(scans.filter((s) => s.workbookId === book.id && Date.parse(s.expiresAt) > now).map((s) => s.pageId));
  const doneDays = new Set([...pages].filter(([, ids]) => ids.every((id) => saved.has(id))).map(([day]) => day));
  return { id: book.id, number: book.number, start: localDay(deliveredAt, zone), pages, saved, doneDays };
}

const capital = (text: string) => `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`;
const standardText = new Map(BC_SKILL_MAP.standards.map((s) => [s.code, capital(s.text)]));

/** The standard most of a day's questions are on (the first on a tie, in page order); its text from the skill map. */
function dayTopic(pageIds: readonly string[], questions: readonly { pageId: string; standard: string | null }[]): string | null {
  const counts = new Map<string, number>();
  for (const id of pageIds) for (const q of questions) if (q.pageId === id && q.standard && standardText.has(q.standard)) counts.set(q.standard, (counts.get(q.standard) ?? 0) + 1);
  const best = [...counts].reduce<[string, number] | null>((top, entry) => (!top || entry[1] > top[1] ? entry : top), null);
  return best ? standardText.get(best[0])! : null;
}

/** "today", a weekday within the last week, else "Nov 3": a day in family time. */
function dayWords(day: string, today: string): string {
  if (day >= today) return "today";
  return day > addDays(today, -7) ? formatCalendarDate(day, { weekday: "long" }) : formatCalendarDate(day, { month: "short", day: "numeric" });
}

/**
 * The rule's states and the history rows, for one child, as Home and Progress read them; null when an input cannot be
 * read. A failed history read gives no rows and `historyFailed`: Home then shows no dates, and Progress shows nothing,
 * because an empty history would count every skill mastered as new.
 */
async function readSkillStates(reader: ParentViewReader, child: ChildView, book: { id: string } | undefined, marks: readonly SkillMark[]): Promise<{ states: StandardSkillState[]; history: StateChange[]; historyFailed: boolean; tests: SkillTestResult[]; workbookStandards: string[] } | null> {
  let historyFailed = false;
  const [workbookStandards, results, history] = await Promise.all([
    book ? reader.workbookStandards(book.id).catch(() => null) : [],
    reader.skillTests(child.id).catch(() => null),
    reader.skillHistory(child.id).catch((e) => {
      historyFailed = true;
      console.error("[parent-view] skill history read failed", e instanceof Error ? e.message : "failed");
      return [] as StateChange[];
    }),
  ]);
  if (!workbookStandards || !results) return null;
  const tests = tallies(results);
  return { states: skillStates({ schoolGrade: child.schoolGrade, workbookStandards, tests, marks }), history, historyFailed, tests, workbookStandards };
}

/**
 * One child's Home (#560, #1003, spec #544): this week's circles, the current workbook and the skills since the child
 * started. Null for a child that is not the parent's, and for a child whose stage has no Overview. A part with no data is
 * null. Each number comes from stored rows: scans and pages (the card, the circles), the skill state rule (the three
 * counts) and `skill_state_history.changed_at` (the date a skill was mastered). No percent right, no count of wrong
 * answers and nothing from a raw profile, a Maya call, an AI finding or a parent's judgement (D-303).
 *
 * The workbook day is a calendar rule (src/lib/parent-week.ts): Day 1 is the delivery day (or the next Monday-to-Friday
 * day), and each later Monday-to-Friday day is the next. Skills show whether or not the Progress tab is
 * on (Cedric, 2026-11-14); only the tab stays behind PROGRESS_TAB_ENABLED.
 */
export async function readOverview(reader: ParentViewReader, childId: string, now: number): Promise<OverviewView | null> {
  const [child, children, family, tests, reports, workbooks, scans, deliveries, corrections] = await Promise.all([
    readChild(reader, childId, now), reader.children(), reader.family(), reader.tests(), reader.reports(), reader.shippedWorkbooks(),
    reader.savedScans(), reader.deliveries(), reader.deliveryCorrections(),
  ]);
  if (!child || !child.tabs.includes("overview")) return null;
  const zone = familyZone({ timeZone: family.timeZone, postal: family.postal, province: children[0]?.province ?? null });
  const today = localDay(now, zone);

  const latest = tests
    .filter((t) => t.childId === child.id && t.status === "completed" && t.completedAt !== null)
    .reduce<TestRecord | null>((best, t) => (!best || t.completedAt! > best.completedAt! ? t : best), null);
  const resultPreparing = latest !== null && !reports.some((r) => r.assessmentId === latest.id);
  const late = resultPreparing && resultLate(latest!.completedAt!, now);

  const days = await readBookDays(reader, child, now, zone, { workbooks, deliveries, corrections, scans });
  let week: OverviewView["week"] = null;
  let workbook: OverviewView["workbook"] = null;
  let scanPrompt: OverviewView["scanPrompt"] = null;
  // A newer shipped book than the delivered one is in the mail: it has no confirmed delivery, or `days` would be it.
  const newest = workbooks.filter((w) => w.childId === child.id).sort((a, b) => b.number - a.number)[0];
  const onTheWay = newest && newest.id !== days?.id ? newest.number : null;
  if (days) {
    week = weekCircles(today, days.start, days.doneDays, { ended: child.readOnly });
    const row = bookToday(days.start, today, { ended: child.readOnly });
    // With no row (the book is over, or the plan ended) the card still shows the book at its last day.
    const day = row?.day ?? workbookDay(days.start, today) ?? 1;
    const dayPages = days.pages.get(day) ?? [];
    const questions = row ? await reader.workbookQuestions(days.id).catch(() => []) : [];
    const all = [...days.pages.values()].flat();
    const scanned = all.filter((id) => days.saved.has(id)).length;
    workbook = {
      number: days.number, day, days: WORKBOOK_DAYS,
      // Floor, never round: a ring never says "100% done" with a page left.
      percent: scanned > 0 && all.length > 0 ? Math.floor((scanned / all.length) * 100) : null,
      today: row && { label: row.label, topic: dayTopic(dayPages, questions), scanned: dayPages.filter((id) => days.saved.has(id)).length, pages: dayPages.length },
    };
    // The Scan tab covers scanning; only a family with no saved photo at all gets this prompt, and only where the tab is.
    if (row && scans.length === 0 && child.tabs.includes("scan_pages")) scanPrompt = { day, pages: dayPages.length };
  }

  // Home shows the skills whether or not the Progress tab is on (Cedric, 2026-11-14); only the tab stays behind its switch.
  let skills: OverviewView["skills"] = null;
  {
    const progress = await reader.overviewProgress(child.id).catch(markingReadFailed);
    const book = workbooks.filter((w) => w.childId === child.id).sort((a, b) => b.number - a.number)[0];
    const read = progress ? await readSkillStates(reader, child, book, progress.skillMarks) : null;
    // A failed history read leaves the dates out and keeps the counts from the rule.
    if (read) skills = homeSkills(read.states, progress!.helpMarks, read.historyFailed ? [] : read.history, now, zone);
  }

  const summaryMonth = offeredSummaryMonth(await readFirstDeliveryMonth(reader, child.id, zone), now, zone);
  return { child, resultPreparing, resultLate: late, week, workbook, onTheWay, scanPrompt, skills, summaryMonth };
}

/** The three lists: every BC standard by its state now. Mastered newest first, the others in the skill map's order. */
function homeSkills(states: readonly StandardSkillState[], marks: readonly HelpMark[], history: readonly StateChange[], now: number, zone: FamilyZone): HomeSkillsView {
  const today = localDay(now, zone);
  // Needs help is the rule's needs_review plus a Learning skill the child is struggling with now; Learning is what is left.
  const help = needsHelpStandards(states, marks, now, zone);
  // The child's first batch of rows is the starting state, recorded when the table began or at the first rebuild, so a skill
  // in it has no date (firstBatchAt).
  const first = firstBatchAt(history);
  // The row in effect for a standard is its last one; a Mastered skill's date is when a rebuild recorded that row.
  const lastRow = new Map<string, StateChange & { at: number }>();
  for (const row of history) {
    const at = Date.parse(row.changedAt);
    if (Number.isFinite(at) && at >= (lastRow.get(row.standard)?.at ?? -Infinity)) lastRow.set(row.standard, { ...row, at });
  }
  const items = (state: SkillState, keep: (standard: string) => boolean = () => true): (SkillItemView & { at: number })[] => states.filter((s) => s.state === state && keep(s.standard)).map((s) => {
    const row = state === "mastered" ? lastRow.get(s.standard) : undefined;
    const recorded = row?.state === "mastered" && row.at !== first ? row : undefined;
    return { code: s.standard, name: standardText.get(s.standard) ?? s.standard, masteredOn: recorded ? dayWords(localDay(recorded.at, zone), today) : null, at: recorded?.at ?? 0 };
  });
  const plain = ({ code, name, masteredOn }: SkillItemView): SkillItemView => ({ code, name, masteredOn });
  return {
    mastered: items("mastered").sort((a, b) => b.at - a.at).map(plain),
    learning: items("working_on", (standard) => !help.has(standard)).map(plain),
    // The skill map's order: the rule's needs_review and the struggling Learning skills in one list, as `states` orders them.
    needsHelp: states.filter((s) => help.has(s.standard)).map((s) => plain({ code: s.standard, name: standardText.get(s.standard) ?? s.standard, masteredOn: null })),
  };
}

/** The Level tile and the area bars of one finished test with a report, scored by the assessment core. */
async function testLevel(reader: ParentViewReader, test: TestRecord, schoolGrade: Grade, zone: FamilyZone, marks: readonly AreaAnswer[] = []): Promise<{ level: LevelTileView | null; areas: AreaBarView[] }> {
  const result = await reader.testResult(test.id);
  if (!result) return { level: null, areas: [] };
  // D-258 (#579): a test the report calls unreliable shows no bars. A fall back to the overall level would invent a
  // weakness (D-108). Only the stored report's note decides: the sentence says the report offers a new test, and a
  // rescore can change the test's pace flag without changing the report the parent reads.
  const unreliable = result.unreliable;
  const level: LevelTileView = {
    working: result.level.working,
    earlySign: result.level.confidence === "low" || storedLevelCertainty(result.level) === "early-sign",
    testedOn: localDay(test.completedAt!, zone),
    unreliable,
  };
  const areas: AreaBarView[] = result.answers && !unreliable
    ? areaLevels({ answers: [...result.answers, ...marks], schoolGrade, workingLevel: result.level.working })
      .map((a) => ({ area: a.area, name: REPORTED_STRAND_NAMES[a.area], level: a.level, label: a.label, earlySign: a.certainty !== "clear" }))
    : [];
  return { level, areas };
}

/** The family-time month of the child's first confirmed delivery, through the reader. */
async function readFirstDeliveryMonth(reader: ParentViewReader, childId: string, zone: FamilyZone): Promise<string | null> {
  const [deliveries, corrections] = await Promise.all([reader.deliveries(), reader.deliveryCorrections()]);
  return firstDeliveryMonth(deliveries, corrections, childId, zone);
}

/** The Progress tab (#561, #1004): the tiles, the weekly and monthly line, and the math topics. */
export interface ProgressView {
  child: ChildView;
  /** Null before the first marked page, and when `unavailable`: the tab then shows no chart and no numbers. */
  progress: ProgressNumbers | null;
  /**
   * A read it rests on failed (the marks or the history): the tab says it cannot load, never "starts after the first
   * marked pages", and never numbers from a partial read.
   */
  unavailable: boolean;
}

export interface ProgressNumbers {
  /** Mastered and Needs help now, and the three periods' gain, Moved up and line (src/lib/progress-series.ts). */
  summary: ProgressSummary;
  /** Days done this week, of 5: the week's circles that are done. Null until the book is delivered. */
  weekDaysDone: number | null;
  /** Days of the current workbook with every page scanned; null until it is delivered. */
  bookDaysDone: number | null;
  workbookNumber: number | null;
  /** The family-time day the child started, as "Nov 7"; null with no finished test. */
  startedOn: string | null;
  /** The current family-time month's name, "November". */
  monthName: string;
  topics: TopicBarView[];
}

/** A failed marking read hides the marks and the tile; the log says so, so a lasting fault is seen. */
const markingReadFailed = (e: unknown) => {
  console.error("[parent-view] marking read failed", e instanceof Error ? e.message : "failed");
  return null;
};

/** Field by field: a tally reaches the rule, and nothing else of the record does. */
const tallies = (results: readonly SkillTestResult[]): SkillTestResult[] =>
  results.map((r) => ({ standard: r.standard, correct: r.correct, total: r.total, at: r.at, unreliable: r.unreliable }));

/**
 * One child's Progress tab (#561, #1004). Null for a child that is not the parent's, and for a child with no Progress tab:
 * its stage has none, or the switch for #194 is off. The numbers come from the skill state rule (now) and the recorded
 * history (before now, by `changed_at` in family time); the topics from the skill map (src/lib/skill-map-view.ts). Nothing
 * comes from an AI finding. A child with no marked page has no `progress`: there is no learning to chart yet. A failed
 * marking read or a failed history read is `unavailable`, not empty and not partial: the marks and the history are what
 * every number rests on, and a missing history would count each mastered skill as new.
 */
export async function readProgress(reader: ParentViewReader, childId: string, now: number): Promise<ProgressView | null> {
  const child = await readChild(reader, childId, now);
  if (!child || !child.tabs.includes("progress")) return null;
  let markingFailed = false;
  const [children, family, tests, reports, workbooks, marking, scans, deliveries, corrections] = await Promise.all([
    reader.children(), reader.family(), reader.tests(), reader.reports(), reader.shippedWorkbooks(),
    reader.overviewProgress(child.id).catch((e) => { markingFailed = true; return markingReadFailed(e); }), reader.savedScans(), reader.deliveries(), reader.deliveryCorrections(),
  ]);
  if (markingFailed) return { child, progress: null, unavailable: true };
  if (!marking || marking.skillMarks.length === 0) return { child, progress: null, unavailable: false };
  const zone = familyZone({ timeZone: family.timeZone, postal: family.postal, province: children[0]?.province ?? null });
  const own = tests.filter((t) => t.childId === child.id && t.status === "completed" && t.completedAt !== null);
  const latest = own.reduce<TestRecord | null>((best, t) => (!best || t.completedAt! > best.completedAt! ? t : best), null);
  const first = own.reduce<TestRecord | null>((best, t) => (!best || t.completedAt! < best.completedAt! ? t : best), null);
  const { level } = latest && reports.some((r) => r.assessmentId === latest.id)
    ? await testLevel(reader, latest, child.schoolGrade, zone)
    : { level: null };
  const book = workbooks.filter((w) => w.childId === child.id).sort((a, b) => b.number - a.number)[0];
  const read = await readSkillStates(reader, child, book, marking.skillMarks);
  if (!read) throw new Error("progress: skill inputs unavailable");
  if (read.historyFailed) return { child, progress: null, unavailable: true };
  const startDay = first ? localDay(first.completedAt!, zone) : null;
  // The one Needs help set: the summary's tile and the topic words read the same standards as Home.
  const help = needsHelpStandards(read.states, marking.helpMarks, now, zone);
  const summary = progressSummary({
    now, zone, current: new Map(read.states.map((s) => [s.standard, s.state])), history: read.history, startDay,
    needsHelp: help,
  });
  const days = await readBookDays(reader, child, now, zone, { workbooks, deliveries, corrections, scans });
  const areas = skillMapView({
    firstName: child.firstName, schoolGrade: child.schoolGrade, workingLevel: level?.working ?? null, tests: read.tests,
    workbookStandards: read.workbookStandards, workbookNumber: book?.number ?? null, marks: marking.skillMarks, day: (at) => localDay(at, zone),
  });
  return {
    child,
    unavailable: false,
    progress: {
      summary,
      weekDaysDone: days ? weekCircles(localDay(now, zone), days.start, days.doneDays, { ended: child.readOnly }).filter((d) => d.state === "done" || d.state === "today_done").length : null,
      bookDaysDone: days ? [...days.doneDays].filter((d) => d >= 1 && d <= WORKBOOK_DAYS).length : null,
      workbookNumber: days?.number ?? null,
      startedOn: startDay ? formatCalendarDate(startDay, { month: "short", day: "numeric" }) : null,
      monthName: formatCalendarDate(`${localMonth(now, zone)}-01`, { month: "long" }),
      topics: topicBars(areas, help),
    },
  };
}

/** The monthly summary (#562, D-248): one child's calendar month in family time, for the one-page PDF. */
export interface MonthlySummaryView {
  firstName: string;
  schoolGrade: Grade;
  /** YYYY-MM in family time. */
  month: string;
  /** The day the summary was made, in family time. */
  madeOn: string;
  /** From the newest test finished by the month's end with its report ready; null with none. */
  level: LevelTileView | null;
  /** From the same test; empty with no level, a test that cannot be replayed, or a test the report calls unreliable. */
  areas: AreaBarView[];
  /** The child's workbooks shipped in the month, oldest first, with the day each shipped. */
  mailed: { number: number; shippedOn: string }[];
  /** Days of work scanned in the month: a day of a shipped workbook whose every page has a saved photo, counted in the month of its last photo. */
  daysScanned: number;
  /** The child's Maya chats that ended in the month, with at least one message from the child. */
  mayaCalls: number;
  /** The next book's range today; null when there is no range to show. */
  next: { earliest: string; latest: string } | null;
}

/**
 * One child's monthly summary (#562). Null for a child that is not the parent's, a stage with no Overview, and a month
 * the Overview does not offer: before the month of the first confirmed delivery, the current month and later. Nothing
 * comes from a transcript, a photo, a raw profile, a learning event or an AI finding; no percent right, no count of
 * wrong answers, no other child. "Skills mastered that month" waits for the skill map (#578, #575).
 */
export async function readMonthlySummary(reader: ParentViewReader, childId: string, month: string, now: number): Promise<MonthlySummaryView | null> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [child, children, family] = await Promise.all([readChild(reader, childId, now), reader.children(), reader.family()]);
  if (!child || !child.tabs.includes("overview")) return null;
  const zone = familyZone({ timeZone: family.timeZone, postal: family.postal, province: children[0]?.province ?? null });
  const first = await readFirstDeliveryMonth(reader, child.id, zone);
  if (first === null || month < first || month >= localMonth(now, zone)) return null;
  const inMonth = (at: string | number) => localMonth(at, zone) === month;

  const [tests, reports, workbooks, scans, mayaCalls, books] = await Promise.all([
    reader.tests(), reader.reports(), reader.shippedWorkbooks(), reader.savedScans(),
    reader.mayaCalls(child.id, localDateTime(`${month}-01`, zone), localDateTime(`${addMonths(month, 1)}-01`, zone)),
    readWorkbooks(reader, child.id, now),
  ]);
  // The newest test that finished by the month's end, as the Overview would have shown it then.
  const latest = tests
    .filter((t) => t.childId === child.id && t.status === "completed" && t.completedAt !== null && localMonth(t.completedAt, zone) <= month)
    .reduce<TestRecord | null>((best, t) => (!best || t.completedAt! > best.completedAt! ? t : best), null);
  const { level, areas } = latest && reports.some((r) => r.assessmentId === latest.id)
    ? await testLevel(reader, latest, child.schoolGrade, zone)
    : { level: null, areas: [] };

  const own = workbooks.filter((w) => w.childId === child.id);
  const mailed = own.filter((w) => w.shippedAt !== null && inMonth(w.shippedAt)).sort((a, b) => a.number - b.number)
    .map((w) => ({ number: w.number, shippedOn: localDay(w.shippedAt!, zone) }));

  let daysScanned = 0;
  const bookIds = new Set(scans.filter((s) => own.some((w) => w.id === s.workbookId)).map((s) => s.workbookId));
  for (const id of bookIds) {
    // Each page's first saved photo; a day is scanned when its last page got one.
    const firstPhoto = new Map<string, number>();
    for (const s of scans) {
      if (s.workbookId !== id) continue;
      const at = Date.parse(s.takenAt);
      if (Number.isFinite(at)) firstPhoto.set(s.pageId, Math.min(firstPhoto.get(s.pageId) ?? Infinity, at));
    }
    const days = new Map<string, number | null>();
    for (const p of await reader.workbookPages(id)) {
      if (p.dayLabel === null) continue;
      const at = firstPhoto.get(p.id) ?? null;
      const so = days.has(p.dayLabel) ? days.get(p.dayLabel)! : 0;
      days.set(p.dayLabel, so === null || at === null ? null : Math.max(so, at));
    }
    daysScanned += [...days.values()].filter((at) => at !== null && inMonth(at)).length;
  }

  const next = books?.next.kind === "range" ? { earliest: books.next.earliest, latest: books.next.latest } : null;
  return { firstName: child.firstName, schoolGrade: child.schoolGrade, month, madeOn: localDay(now, zone), level, areas, mailed, daysScanned, mayaCalls, next };
}
