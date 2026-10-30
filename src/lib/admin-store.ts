import "server-only";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { FactsTest, HelpAnswer, Placement, Province, Route, StoredTest } from "@/lib/assessment";
import type { ProgressInput } from "@/lib/admin-progress";
import { isUuid } from "@/lib/assessment-store";
import { LEARNING_COLUMNS, type LearningRow } from "@/lib/learning-style";
import { filterTests, mainOnly, questionNumbers, type AdminFilters, type AnswerRecord, type FactAnswerRecord, type ReviewRecord, type ShownRecord } from "@/lib/admin-view";
import type { TestContextRecord } from "@/lib/admin-view";
import { sessionClient } from "@/lib/supabase-auth";
import type { AssessmentStatus } from "@/lib/test-api";
import { signWork } from "@/lib/work-store";
import { findSavedCard } from "@/lib/saved-card";
import { stripeCardProvider } from "@/lib/saved-card-server";
import { stripe } from "@/lib/stripe";
import type { DashboardRows, Delivery, EmailCopyView, RawCard, RawDelivery, RawChild, RawEmail, RawParent, RawReport, RawTest, RawWaitlist } from "@/lib/admin-dashboard";
import type { TemplateFilters, TemplateStat } from "@/lib/admin-templates";
import type { ExportReader, ExportRow, PagedTable } from "@/lib/admin-export";
import type { AnonymousTestRow } from "@/lib/anonymous-copy-export";
import { WORKBOOK_FILES_BUCKET, type Workbook, type WorkbookSummary } from "@/lib/workbook-content";
import { workbookStore } from "@/lib/workbook-store";

// The admin area's data (#77). The gate and every read are here, so no admin page reads the database on its own; the
// report view is read by the report-loading module with the admin's session (src/lib/report-loading-server.ts, #161).
// Every read uses the admin's own session, never the secret key: the database decides what they see. The tables a
// parent can read come through the admin_* functions (migration add_admin_area), which return every row to an admin
// and nothing to anyone else; answers, work_reviews, email_log and the quick facts tables have an admin read policy;
// the drawings are signed with the admin's session under the bucket's admin read policy.

export interface AdminSession {
  /** The admin's own session client: row-level security and the admin_* functions apply to it. */
  db: SupabaseClient<Database>;
  userId: string;
  email: string;
}

/**
 * The signed-in admin, or null: there is no session, the token does not verify (getUser checks
 * its identity with Auth), or the user has no admin_users row (is_admin, run by the database with the same token).
 * Both checks run at the same time and both must pass, so the gate costs one round trip, not two.
 * #78: a route calls this and answers 404 when it is null.
 */
export async function adminSession(): Promise<AdminSession | null> {
  const db = await sessionClient();
  const [{ data, error: userError }, { data: admin, error }] = await Promise.all([db.auth.getUser(), db.rpc("is_admin")]);
  if (userError || !data.user) return null;
  if (error) {
    console.error("[admin] is_admin failed", error.message);
    return null;
  }
  const isAdmin: boolean | null = admin;
  return isAdmin === true ? { db, userId: data.user.id, email: data.user.email ?? "" } : null;
}

/** For admin pages: the admin, or the site's 404 for everyone else (a parent, a visitor, a forged cookie). */
export async function requireAdmin(): Promise<AdminSession> {
  // Admin pages read cookies, so they render per request.
  await connection();
  const admin = await adminSession();
  if (!admin) notFound();
  return admin;
}

/** Rows per list, newest first. A longer list says so. */
export const LIST_MAX = 500;

type Result<T> = { data: T; error: null } | { data: unknown; error: { message: string } };

/**
 * What the schema can say about a type T that a page states for its rows: text in a union of values widens to text
 * (a value the page knows, such as a function's text column, that the schema types as text). Every column's name, null
 * and base type is checked, in embedded rows too. `unknown` stays unchecked.
 */
type StoredRows<T> = unknown extends T ? unknown
  : T extends null ? null
  : T extends string ? string : T extends number ? number : T extends boolean ? boolean
  : T extends readonly (infer E)[] ? StoredRows<E>[]
  : { [K in keyof T]: StoredRows<T[K]> };

/** The rows of a read as T, or a thrown error (the page then shows the error page). The read's own type, from the
 * schema, must fit T (StoredRows). */
function must<T>(result: Result<StoredRows<T>>, what: string): T {
  if (result.error) throw new Error(`[admin] ${what}: ${result.error.message}`);
  return result.data as T;
}

/** For a read whose columns are named at run time (the export): the schema cannot type its rows. */
function mustUntyped<T>(result: Result<unknown>, what: string): T {
  if (result.error) throw new Error(`[admin] ${what}: ${result.error.message}`);
  return result.data as T;
}

/** Ids per `in` filter, so a request URL stays short. */
const CHUNK = 100;

type RangeRead<T> = { range: (from: number, to: number) => PromiseLike<Result<StoredRows<T[]>>>; order: (column: "id") => RangeRead<T> };

/** Every row of a read, page by page, with the read's own type from the schema. PostgREST caps each response, so
 * related rows are paged too, and family details and totals are complete. */
async function allRead<R>(query: { range: (from: number, to: number) => PromiseLike<Result<R[]>> }, what: string): Promise<R[]> {
  const out: R[] = [];
  for (let from = 0; ; from += LIST_MAX) {
    const result = await query.range(from, from + LIST_MAX - 1);
    if (result.error) throw new Error(`[admin] ${what}: ${result.error.message}`);
    out.push(...result.data);
    if (result.data.length < LIST_MAX) return out;
  }
}

/** Every row of a read, as T; the read's own type must fit T (StoredRows). */
async function allRows<T>(query: RangeRead<T>, what: string): Promise<T[]> {
  return (await allRead(query, what)) as T[];
}

/** Rows of T for the ids, read CHUNK ids at a time. */
async function byIds<T>(ids: Iterable<string>, what: string, read: (chunk: string[]) => RangeRead<T>): Promise<T[]> {
  const list = [...new Set(ids)];
  const out: T[] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(...await allRows<T>(read(list.slice(i, i + CHUNK)).order("id"), what));
  return out;
}

/** A list cut at LIST_MAX: `more` when older rows were left out. */
export interface Page<T> {
  rows: T[];
  more: boolean;
}
const page = <T,>(rows: T[]): Page<T> => ({ rows: rows.slice(0, LIST_MAX), more: rows.length > LIST_MAX });

export interface ParentRow {
  id: string;
  created_at: string;
  name: string;
  email: string;
  postal: string | null;
  source: Record<string, string>;
}

export interface ChildRow {
  id: string;
  created_at: string;
  parent_id: string;
  first_name: string;
  grade: number;
  province: Province;
}

const PARENT_COLUMNS = "id, created_at, name, email, postal, source";
const CHILD_COLUMNS = "id, created_at, parent_id, first_name, grade, province";

const parentsById = (a: AdminSession, ids: Iterable<string>) =>
  byIds<ParentRow>(ids, "parents", (chunk) => a.db.rpc("admin_parents").select(PARENT_COLUMNS).in("id", chunk));
const childrenById = (a: AdminSession, ids: Iterable<string>) =>
  byIds<ChildRow>(ids, "children", (chunk) => a.db.rpc("admin_children").select(CHILD_COLUMNS).in("id", chunk));
const index = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));

// Tests

/** One test in a list: its row, the counts the list shows, its child and parent, and its report. */
export interface TestRow {
  id: string;
  created_at: string;
  status: AssessmentStatus;
  grade: number;
  province: Province;
  child_id: string;
  parent_id: string;
  started_at: string;
  completed_at: string | null;
  last_answer_at: string | null;
  route: string | null;
  help: HelpAnswer | null;
  placement: Placement | null;
  answered: number;
  reviews: { total: number; low: number };
  flags: Placement["flags"] | null;
  child: ChildRow | null;
  parent: ParentRow | null;
  reportId: string | null;
}

const TEST_COLUMNS = "id, created_at, status, grade, province, child_id, parent_id, started_at, completed_at, last_answer_at, route, help, placement, answers(count), work_reviews(confidence)";
type TestQueryRow = Omit<TestRow, "answered" | "reviews" | "flags" | "child" | "parent" | "reportId"> & {
  answers: { count: number }[];
  work_reviews: { confidence: "high" | "low" }[];
};

async function withPeople(a: AdminSession, tests: TestQueryRow[]): Promise<TestRow[]> {
  const [children, parents, reports] = await Promise.all([
    childrenById(a, tests.map((t) => t.child_id)),
    parentsById(a, tests.map((t) => t.parent_id)),
    byIds<{ id: string; assessment_id: string }>(tests.map((t) => t.id), "reports", (chunk) =>
      a.db.rpc("admin_reports").select("id, assessment_id").in("assessment_id", chunk)),
  ]);
  const child = index(children);
  const parent = index(parents);
  const report = new Map(reports.map((r) => [r.assessment_id, r.id]));
  return tests.map(({ answers, work_reviews, ...t }) => ({
    ...t,
    answered: answers[0]?.count ?? 0,
    reviews: { total: work_reviews.length, low: work_reviews.filter((r) => r.confidence === "low").length },
    flags: t.placement ? (t.placement.flags ?? []) : null,
    child: child.get(t.child_id) ?? null,
    parent: parent.get(t.parent_id) ?? null,
    reportId: report.get(t.id) ?? null,
  }));
}

/**
 * The newest tests that pass the filters. Grade, province and status filter in the database; help likely and low AI
 * confidence filter each database page before pagination (the assessment core decides help likely).
 */
export async function listTests(a: AdminSession, f: AdminFilters, offset = 0): Promise<Page<TestRow>> {
  let q = a.db.rpc("admin_assessments").select(TEST_COLUMNS);
  if (f.status) q = q.eq("status", f.status);
  if (f.grade !== null) q = q.eq("grade", f.grade);
  if (f.province) q = q.eq("province", f.province);
  q = q.order("created_at", { ascending: false }).order("id", { ascending: false });
  if (!f.help && !f.flagged && !f.lowAi) {
    const { rows, more } = page(must<TestQueryRow[]>(await q.range(offset, offset + LIST_MAX), "tests"));
    return { rows: await withPeople(a, rows), more };
  }
  const kept: TestQueryRow[] = [];
  let skipped = 0;
  for (let start = 0; ; start += LIST_MAX) {
    const rows = must<TestQueryRow[]>(await q.range(start, start + LIST_MAX - 1), "tests");
    const low = new Set(rows.filter((t) => t.work_reviews.some((r) => r.confidence === "low")).map((t) => t.id));
    const matches = filterTests(rows.map((t) => ({ ...t, flags: t.placement?.flags ?? null })), f, low);
    for (const row of matches) {
      if (skipped++ < offset) continue;
      kept.push(row);
      if (kept.length > LIST_MAX) break;
    }
    if (kept.length > LIST_MAX || rows.length < LIST_MAX) break;
  }
  const { rows, more } = page(kept);
  return { rows: await withPeople(a, rows), more };
}

// One test

export interface TestDetail {
  test: TestRow & { seed: number; resume_until: string; stored: StoredTest };
  /** The test context (#185): the device and the halfway break. */
  context: TestContextRecord;
  /** The answers in test order. D-145: not those to the removed extra round's questions (#190, fromRemovedRound). */
  answers: AnswerRecord[];
  reviews: ReviewRecord[];
  report: { id: string; created_at: string; questions: number; minutes: number; emailed_at: string | null; email_error: string | null; alerted_at: string | null; alert_error: string | null } | null;
  facts: { started_at: string; test: FactsTest; answers: FactAnswerRecord[] } | null;
  /** When the server first served each question (#184). D-145: not the removed extra round's questions. */
  shows: ShownRecord[];
  emails: EmailRow[];
  /** Short-lived signed URLs of the drawings, by stored path. */
  images: Record<string, string>;
}

const ANSWER_COLUMNS = "position, question_id, response, correct, misconception, time_ms, work_required, work_path, work_text";
/** The answer timeline's columns (#184, migration add_answer_timeline). */
const TIMELINE_COLUMNS = "template_id, shown_at, answered_at, answer_changes, read_aloud_count, read_aloud_at_ms, away_count, away_ms";
const REVIEW_COLUMNS = "question_id, error_type, kind, comment, score, confidence, model";
/** The test context columns (#185). */
const CONTEXT_COLUMNS = "device, break_started_at, break_ended_at, break_skipped, break_ms";
/** The quick facts answer columns, with the time for each fact by the server and the browser (#185). */
const FACT_ANSWER_COLUMNS = "position, fact_id, response, correct, at_ms, server_ms, browser_ms";

/** Everything about one test, or null when there is no such test. */
export async function getTest(a: AdminSession, id: string): Promise<TestDetail | null> {
  if (!isUuid(id)) return null;
  // Everything keyed by the test id is read with the test row, not after it; the drawings are signed as soon as the
  // answers arrive. With no such test the other reads are thrown away.
  // D-145: the answers, serves and work reviews of the removed extra round's questions (#190), which two tests still
  // store, are left out here, so no part of the test page, its progress or its drawings shows them.
  const answersRead = a.db.from("answers").select(`${ANSWER_COLUMNS}, ${TIMELINE_COLUMNS}`).eq("assessment_id", id).order("position")
    .then((r) => mainOnly(must<AnswerRecord[]>(r, "answers")));
  const related = Promise.all([
    answersRead,
    a.db.from("work_reviews").select(REVIEW_COLUMNS).eq("assessment_id", id).then((r) => mainOnly(must<ReviewRecord[]>(r, "reviews"))),
    a.db.rpc("admin_reports").select("id, created_at, questions, minutes, emailed_at, email_error, alerted_at, alert_error").eq("assessment_id", id)
      .maybeSingle().then((r) => must<TestDetail["report"]>(r, "report")),
    a.db.from("assessment_facts").select("started_at, test").eq("assessment_id", id).maybeSingle()
      .then((r) => must<{ started_at: string; test: FactsTest } | null>(r, "facts")),
    a.db.from("fact_answers").select(FACT_ANSWER_COLUMNS).eq("assessment_id", id).order("position")
      .then((r) => must<FactAnswerRecord[]>(r, "fact answers")),
    emailRows(a, (q) => q.eq("assessment_id", id)),
    a.db.from("question_shows").select("position, question_id, shown_at").eq("assessment_id", id).order("position")
      .then((r) => mainOnly(must<ShownRecord[]>(r, "question shows"))),
    answersRead.then((answers) => signWork(a.db, answers.flatMap((x) => (x.work_path ? [x.work_path] : [])))),
  ]);
  // a failed read with no test row behind it must not become an unhandled rejection
  related.catch(() => {});
  const row = await a.db.rpc("admin_assessments").select(`${TEST_COLUMNS}, seed, resume_until, test, ${CONTEXT_COLUMNS}`).eq("id", id).maybeSingle()
    .then((r) => must<(TestQueryRow & { seed: number; resume_until: string; test: StoredTest } & TestContextRecord) | null>(r, "test"));
  if (!row) return null;
  const { device, break_started_at, break_ended_at, break_skipped, break_ms, ...withoutContext } = row;
  const context: TestContextRecord = { device, break_started_at, break_ended_at, break_skipped, break_ms };
  const { test: stored, seed, resume_until, ...listRow } = withoutContext;
  const [[test], [answers, reviews, report, facts, factAnswers, emails, shows, images]] = await Promise.all([withPeople(a, [listRow]), related]);
  return {
    test: { ...test, seed, resume_until, stored },
    context,
    answers,
    reviews,
    report,
    facts: facts ? { ...facts, answers: factAnswers } : null,
    shows,
    emails: emails.rows,
    images,
  };
}

/**
 * The whiteboard strokes of one test (#186), by question id: a short-lived signed URL for the replay, or null when the
 * strokes are stored but could not be signed. A question without strokes is not in the map: its drawing shows alone.
 * Signed with the admin's session: the storage policy lets only admins read stroke files (migration add_answer_strokes).
 */
export async function getStrokes(a: AdminSession, id: string): Promise<Record<string, string | null>> {
  if (!isUuid(id)) return {};
  const rows = mainOnly(must<{ question_id: string; strokes_path: string }[]>(
    await a.db.from("answers").select("question_id, strokes_path").eq("assessment_id", id).not("strokes_path", "is", null), "strokes"));
  const urls = await signWork(a.db, rows.map((r) => r.strokes_path));
  return Object.fromEntries(rows.map((r) => [r.question_id, urls[r.strokes_path] ?? null]));
}

// The learner profile (#196)

/** One test's learner profile (public.learner_profiles: admins read it), with the test, its child and its parent. */
export interface ProfileDetail {
  test: { id: string; child_id: string; parent_id: string; grade: number; province: Province; status: AssessmentStatus; completed_at: string | null; child: ChildRow | null; parent: ParentRow | null };
  /** The stored profile; null when none is stored for the test. `profile` is the stored JSON, at any schema version. */
  stored: { created_at: string; built_at: string; schema_version: number; profile: unknown } | null;
  /** Question id to its number in the test (questionNumbers), for the help flags. */
  numbers: ReadonlyMap<string, number>;
}

/** The learner profile of one test, or null when there is no such test. */
export async function getProfile(a: AdminSession, id: string): Promise<ProfileDetail | null> {
  if (!isUuid(id)) return null;
  const test = await a.db.rpc("admin_assessments").select("id, child_id, parent_id, grade, province, status, completed_at").eq("id", id).maybeSingle()
    .then((r) => must<Omit<ProfileDetail["test"], "child" | "parent"> | null>(r, "profile test"));
  if (!test) return null;
  const [[child], [parent], stored, answers] = await Promise.all([
    childrenById(a, [test.child_id]),
    parentsById(a, [test.parent_id]),
    a.db.from("learner_profiles").select("created_at, built_at, schema_version, profile").eq("assessment_id", id).maybeSingle()
      .then((r) => must<ProfileDetail["stored"]>(r, "learner profile")),
    a.db.from("answers").select("position, question_id").eq("assessment_id", id)
      .then((r) => mainOnly(must<Pick<AnswerRecord, "position" | "question_id">[]>(r, "answers"))),
  ]);
  return { test: { ...test, child: child ?? null, parent: parent ?? null }, stored, numbers: questionNumbers(answers) };
}

// The child's profile (#303)

/** One learning event as the admin page lists it (public.learning_events: admins read it). */
export interface LearningEventRow {
  id: string;
  occurred_at: string;
  source: Database["public"]["Tables"]["learning_events"]["Row"]["source"];
  question_source: Database["public"]["Tables"]["learning_events"]["Row"]["question_source"];
  workbook_id: string | null;
  workbook_page: number | null;
  workbook_question: number | null;
  assessment_id: string | null;
  assessment_question_id: string | null;
  skill_standard: string;
  result: Database["public"]["Tables"]["learning_events"]["Row"]["result"];
  stuck_step: string | null;
  mistake: string | null;
  hints: number;
  time_ms: number | null;
  evidence_kind: Database["public"]["Tables"]["learning_events"]["Row"]["evidence_kind"];
  evidence_id: string | null;
}

const EVENT_COLUMNS = "id, occurred_at, source, question_source, workbook_id, workbook_page, workbook_question, assessment_id, assessment_question_id, skill_standard, result, stuck_step, mistake, hints, time_ms, evidence_kind, evidence_id";

/** One child's current profile (public.child_profiles: admins read it), with the child and every event of the child, oldest first. */
export interface ChildProfileDetail {
  child: ChildRow;
  /** The stored profile; null when none is stored. `profile` is the stored JSON, at any schema version. */
  stored: { created_at: string; built_at: string; revision: number; schema_version: number; assessment_id: string | null; profile: unknown } | null;
  events: LearningEventRow[];
}

/** The current profile of one child and its evidence, or null when there is no such child. */
export async function getChildProfile(a: AdminSession, id: string): Promise<ChildProfileDetail | null> {
  if (!isUuid(id)) return null;
  const [[child], stored, events] = await Promise.all([
    childrenById(a, [id]),
    a.db.from("child_profiles").select("created_at, built_at, revision, schema_version, assessment_id, profile").eq("child_id", id).maybeSingle()
      .then((r) => must<ChildProfileDetail["stored"]>(r, "child profile")),
    allRows<LearningEventRow>(a.db.from("learning_events").select(EVENT_COLUMNS).eq("child_id", id).order("occurred_at").order("id"), "learning events"),
  ]);
  return child ? { child, stored, events } : null;
}

// Parents and children

export interface ParentListRow extends ParentRow {
  children: ChildRow[];
  tests: { total: number; completed: number };
}

export async function listParents(a: AdminSession, offset = 0): Promise<Page<ParentListRow>> {
  const { rows, more } = page(must<ParentRow[]>(await a.db.rpc("admin_parents").select(PARENT_COLUMNS).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + LIST_MAX), "parents"));
  const ids = rows.map((p) => p.id);
  const [children, tests] = await Promise.all([
    byIds<ChildRow>(ids, "children", (chunk) => a.db.rpc("admin_children").select(CHILD_COLUMNS).in("parent_id", chunk).order("created_at")),
    byIds<{ parent_id: string; status: AssessmentStatus }>(ids, "tests", (chunk) => a.db.rpc("admin_assessments").select("id, parent_id, status").in("parent_id", chunk)),
  ]);
  return {
    more,
    rows: rows.map((p) => {
      const mine = tests.filter((t) => t.parent_id === p.id);
      return { ...p, children: children.filter((c) => c.parent_id === p.id), tests: { total: mine.length, completed: mine.filter((t) => t.status === "completed").length } };
    }),
  };
}

export interface CardSetupRow {
  id: string;
  created_at: string;
  updated_at: string;
  parent_id: string;
  child_id: string;
  report_id: string | null;
  plan: "one" | "both";
  price: number;
  stripe_customer_id: string | null;
  card_saved_at: string | null;
}

export interface WaitlistRow {
  id: string;
  created_at: string;
  parent_id: string;
  child_id: string;
  report_id: string | null;
  province: Province;
}

export interface ParentDetail {
  parent: ParentRow;
  children: ChildRow[];
  tests: TestRow[];
  cards: CardSetupRow[];
  waitlist: WaitlistRow[];
  emails: EmailRow[];
}

/** One family: the parent, their children and tests, the next steps they took, and the emails sent to them. */
export async function getParent(a: AdminSession, id: string): Promise<ParentDetail | null> {
  if (!isUuid(id)) return null;
  // the family's records are read with the parent row, not after it. The parent decides first: with no such parent
  // the answer is null (a 404), even when another read failed; their errors count only for a family that exists.
  const related = Promise.all([
    allRows<ChildRow>(a.db.rpc("admin_children").select(CHILD_COLUMNS).eq("parent_id", id).order("id"), "children"),
    allRows<TestQueryRow>(a.db.rpc("admin_assessments").select(TEST_COLUMNS).eq("parent_id", id).order("created_at", { ascending: false }).order("id"), "tests")
      .then((rows) => withPeople(a, rows)),
    allRows<CardSetupRow>(a.db.rpc("admin_card_setups").select("*").eq("parent_id", id).order("id"), "card setups"),
    allRows<WaitlistRow>(a.db.rpc("admin_waitlist_joins").select("*").eq("parent_id", id).order("id"), "waitlist"),
    familyEmails(a, id),
  ]);
  related.catch(() => {});
  const parent = await a.db.rpc("admin_parents").select(PARENT_COLUMNS).eq("id", id).maybeSingle().then((r) => must<ParentRow | null>(r, "parent"));
  if (!parent) return null;
  const [children, tests, cards, waitlist, emails] = await related;
  return { parent, children, tests, cards, waitlist, emails };
}

export interface ChildListRow extends ChildRow {
  parent: ParentRow | null;
  tests: { total: number; completed: number; lastAt: string | null };
}

export async function listChildren(a: AdminSession, f: Pick<AdminFilters, "grade" | "province">, offset = 0): Promise<Page<ChildListRow>> {
  let q = a.db.rpc("admin_children").select(CHILD_COLUMNS);
  if (f.grade !== null) q = q.eq("grade", f.grade);
  if (f.province) q = q.eq("province", f.province);
  const { rows, more } = page(must<ChildRow[]>(await q.order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + LIST_MAX), "children"));
  const [parents, tests] = await Promise.all([
    parentsById(a, rows.map((c) => c.parent_id)),
    byIds<{ child_id: string; status: AssessmentStatus; created_at: string }>(rows.map((c) => c.id), "tests", (chunk) =>
      a.db.rpc("admin_assessments").select("id, child_id, status, created_at").in("child_id", chunk)),
  ]);
  const parent = index(parents);
  return {
    more,
    rows: rows.map((c) => {
      const mine = tests.filter((t) => t.child_id === c.id);
      const lastAt = mine.reduce<string | null>((last, t) => (!last || t.created_at > last ? t.created_at : last), null);
      return { ...c, parent: parent.get(c.parent_id) ?? null, tests: { total: mine.length, completed: mine.filter((t) => t.status === "completed").length, lastAt } };
    }),
  };
}

/** One child with how they learn (#126), which the book plan reads. */
export type ChildDetail = ChildRow & LearningRow & { learning_updated_at: string | null };

/** One child and their family records. #78 can use the parent id for the future deletion action. */
export async function getChild(a: AdminSession, id: string): Promise<{ child: ChildDetail; family: ParentDetail } | null> {
  if (!isUuid(id)) return null;
  const child = await a.db.rpc("admin_children").select(`${CHILD_COLUMNS}, ${LEARNING_COLUMNS}, learning_updated_at`).eq("id", id).maybeSingle()
    .then((r) => must<ChildDetail | null>(r, "child"));
  if (!child) return null;
  const family = await getParent(a, child.parent_id);
  return family ? { child, family: { ...family, tests: family.tests.filter((t) => t.child_id === id) } } : null;
}

// Workbooks (#299)

/** A signed page image URL works this long; the page signs new ones each time it loads. */
const WORKBOOK_URL_SECONDS = 10 * 60;

/** A child's workbooks, newest first, read through the workbook store with the admin's session. */
export async function getChildWorkbooks(a: AdminSession, childId: string): Promise<WorkbookSummary[]> {
  return workbookStore(a.db).childWorkbooks(childId);
}

export interface WorkbookDetail {
  workbook: Workbook;
  child: ChildRow | null;
  /** Short-lived URLs of the page images, by path, signed with the admin's session under the bucket's admin policy. */
  images: Record<string, string>;
}

/** One workbook with its pages, questions and page images, or null. */
export async function getWorkbook(a: AdminSession, id: string): Promise<WorkbookDetail | null> {
  const workbook = await workbookStore(a.db).workbook(id);
  if (!workbook) return null;
  const paths = workbook.pages.flatMap((p) => (p.image ? [p.image.path] : []));
  const [children, signed] = await Promise.all([
    childrenById(a, [workbook.childId]),
    paths.length ? a.db.storage.from(WORKBOOK_FILES_BUCKET).createSignedUrls(paths, WORKBOOK_URL_SECONDS) : Promise.resolve({ data: [], error: null }),
  ]);
  if (signed.error) console.error("[admin] workbook images sign failed", signed.error.message);
  const images: Record<string, string> = {};
  for (const item of signed.data ?? []) if (item.path && item.signedUrl && !item.error) images[item.path] = item.signedUrl;
  return { workbook, child: children[0] ?? null, images };
}

// AI reviews

export interface ReviewListRow extends ReviewRecord {
  created_at: string;
  assessment_id: string;
  test: { grade: number; province: Province; child: ChildRow | null } | null;
}

/** The newest AI reviews of shown work (#68); `lowOnly`: only those the report did not show a comment for. */
export async function listReviews(a: AdminSession, { lowOnly }: { lowOnly: boolean }, offset = 0): Promise<Page<ReviewListRow>> {
  let q = a.db.from("work_reviews").select(`created_at, assessment_id, ${REVIEW_COLUMNS}`);
  if (lowOnly) q = q.eq("confidence", "low");
  const { rows, more } = page(must<(ReviewRecord & { created_at: string; assessment_id: string })[]>(await q.order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + LIST_MAX), "reviews"));
  const tests = await byIds<{ id: string; grade: number; province: Province; child_id: string }>(rows.map((r) => r.assessment_id), "tests", (chunk) =>
    a.db.rpc("admin_assessments").select("id, grade, province, child_id").in("id", chunk));
  const child = index(await childrenById(a, tests.map((t) => t.child_id)));
  const test = new Map(tests.map((t) => [t.id, { grade: t.grade, province: t.province, child: child.get(t.child_id) ?? null }]));
  return { more, rows: rows.map((r) => ({ ...r, test: test.get(r.assessment_id) ?? null })) };
}

// Next steps and emails

export interface NextSteps {
  cards: Page<CardSetupRow & { child: ChildRow | null; parent: ParentRow | null }>;
  waitlist: Page<WaitlistRow & { child: ChildRow | null; parent: ParentRow | null }>;
}

/** Card setups and waitlist joins from the report (#66), newest first. Read only: Stripe is the record of saved cards. */
export async function listNextSteps(a: AdminSession, offset = 0): Promise<NextSteps> {
  const [cards, waitlist] = await Promise.all([
    a.db.rpc("admin_card_setups").select("*").order("updated_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + LIST_MAX).then((r) => page(must<CardSetupRow[]>(r, "card setups"))),
    a.db.rpc("admin_waitlist_joins").select("*").order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + LIST_MAX).then((r) => page(must<WaitlistRow[]>(r, "waitlist"))),
  ]);
  const all = [...cards.rows, ...waitlist.rows];
  const [children, parents] = await Promise.all([childrenById(a, all.map((r) => r.child_id)), parentsById(a, all.map((r) => r.parent_id))]);
  const child = index(children);
  const parent = index(parents);
  const people = <T extends { child_id: string; parent_id: string }>(r: T) => ({ ...r, child: child.get(r.child_id) ?? null, parent: parent.get(r.parent_id) ?? null });
  return { cards: { ...cards, rows: cards.rows.map(people) }, waitlist: { ...waitlist, rows: waitlist.rows.map(people) } };
}

export interface EmailRow {
  id: string;
  created_at: string;
  parent_id: string;
  child_id: string | null;
  assessment_id: string | null;
  kind: "continue" | "come_back" | "start" | "start_followup" | "unsubscribe";
  status: "claimed" | "sent" | "failed" | null;
  attempts: number;
  sent_at: string | null;
  error: string | null;
  parent: ParentRow | null;
  child: ChildRow | null;
}

const EMAIL_COLUMNS = "id, created_at, parent_id, child_id, assessment_id, kind, status, attempts, sent_at, error";
const emailQuery = (db: SupabaseClient<Database>) => db.from("email_log").select(EMAIL_COLUMNS);
/** The email log read with its own row type, so a filter added to it keeps the columns checked. */
type EmailQuery = ReturnType<typeof emailQuery>;

/** Reminder emails and unsubscribes (#73), newest first, with who they were for. */
export async function emailRows(a: AdminSession, narrow: (q: EmailQuery) => EmailQuery = (q) => q, offset = 0): Promise<Page<EmailRow>> {
  const query = narrow(emailQuery(a.db)).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + LIST_MAX);
  const { rows, more } = page(must<Omit<EmailRow, "parent" | "child">[]>(await query, "email log"));
  const [parents, children] = await Promise.all([
    parentsById(a, rows.map((r) => r.parent_id)),
    childrenById(a, rows.flatMap((r) => (r.child_id ? [r.child_id] : []))),
  ]);
  const parent = index(parents);
  const child = index(children);
  return { more, rows: rows.map((r) => ({ ...r, parent: parent.get(r.parent_id) ?? null, child: r.child_id ? (child.get(r.child_id) ?? null) : null })) };
}

async function familyEmails(a: AdminSession, id: string): Promise<EmailRow[]> {
  const rows: EmailRow[] = [];
  for (let offset = 0; ; offset += LIST_MAX) {
    const result = await emailRows(a, (q) => q.eq("parent_id", id), offset);
    rows.push(...result.rows);
    if (!result.more) return rows;
  }
}

// Question templates (#199)

/** One item of `wrong`, the jsonb list the function builds (jsonb_agg), so the schema cannot type it. */
type WrongCount = { response: string; misconception: string | null; count: number | string };

/**
 * The counts per question template across children (admin_template_stats_v2): the database
 * counts served positions and answers, so the page reads one row per template. `templateId`: only that template's row.
 */
export async function templateStats(a: AdminSession, f: TemplateFilters, templateId?: string): Promise<TemplateStat[]> {
  const args = { with_tests: f.withTests, school_grade: f.grade, curriculum: f.province };
  const q = a.db.rpc("admin_template_stats_v2", args).select("*");
  const rows = await allRead((templateId === undefined ? q : q.eq("template_id", templateId)).order("template_id"), "template stats");
  return rows.map((r) => ({
    template_id: r.template_id,
    shown: Number(r.shown),
    answered: Number(r.answered),
    correct: Number(r.correct),
    median_ms: r.median_ms === null ? null : Number(r.median_ms),
    wrong: (r.wrong as WrongCount[]).map((w) => ({ response: w.response, misconception: w.misconception, count: Number(w.count) })),
  }));
}

// The raw data export (#200)

/** Rows per database read of the export. Each read goes on until a page comes back empty, so a lower cap loses nothing. */
const EXPORT_READ = 1000;

/** A filter for the rows after `last` in the order of `keys` (each key's value is a uuid or a whole number). */
function afterRow(keys: readonly string[], last: ExportRow): string {
  const is = (k: string, op: "eq" | "gt") => `${k}.${op}.${String(last[k])}`;
  return keys.map((k, i) => (i === 0 ? is(k, "gt") : `and(${[...keys.slice(0, i).map((p) => is(p, "eq")), is(k, "gt")].join(",")})`)).join(",");
}

/**
 * The export's reads (src/lib/admin-export.ts), with the admin's session: tests and children through the admin_*
 * functions, the rest through the admin read policies. Keyset pages (after the last row's key), so rows written during
 * the export are never read twice or skipped.
 */
export function exportReader(a: AdminSession): ExportReader {
  const paged = (table: PagedTable, columns: string) => a.db.rpc(table === "assessments" ? "admin_assessments" : "admin_children").select(columns);
  return {
    testFamilies: () => testAccountIds(a),
    page: async (table, columns, after, limit) => {
      const q = paged(table, columns.join(", "));
      return mustUntyped<ExportRow[]>(await (after === null ? q : q.gt("id", after)).order("id").limit(limit), `export ${table}`);
    },
    ofTests: async (table, columns, order, testIds) => {
      const keys = ["assessment_id", ...order];
      const out: ExportRow[] = [];
      for (let last: ExportRow | null = null; ;) {
        let q = a.db.from(table).select([...new Set([...keys, ...columns])].join(", ")).in("assessment_id", testIds);
        if (last) q = q.or(afterRow(keys, last));
        for (const k of keys) q = q.order(k);
        const rows = mustUntyped<ExportRow[]>(await q.limit(EXPORT_READ), `export ${table}`);
        if (rows.length === 0) return out;
        out.push(...rows);
        last = rows[rows.length - 1];
      }
    },
  };
}

// The dashboard and activity log (D-099)

/**
 * Every row the dashboard needs, all of them: the model counts families, tests and emails over any range. Fine at
 * today's size (hundreds of families); move the counts into SQL when a page load gets slow. Payment status comes from
 * Stripe, read only: the subscriptions of the customers that saved a card. Every read starts at once: the Stripe reads
 * wait only for the card setups, so a page load is about as long as its slowest read, not the sum of two rounds.
 */
export async function dashboardRows(a: AdminSession): Promise<DashboardRows> {
  const cardRows = allRows<RawCard>(a.db.rpc("admin_card_setups").select("id, created_at, updated_at, parent_id, child_id, plan, price, stripe_customer_id, card_saved_at").order("id"), "card setups");
  const [parents, children, tests, reports, cards, waitlist, emails, stripeRead, testIds, deliveries] = await Promise.all([
    allRows<RawParent>(a.db.rpc("admin_parents").select(PARENT_COLUMNS).order("id"), "parents"),
    allRows<RawChild>(a.db.rpc("admin_children").select(CHILD_COLUMNS).order("id"), "children"),
    allRows<Omit<RawTest, "answered"> & { answers: { count: number }[] }>(a.db.rpc("admin_assessments").select("id, created_at, status, parent_id, child_id, grade, province, started_at, completed_at, last_answer_at, answers(count)").order("id"), "tests"),
    allRows<RawReport>(a.db.rpc("admin_reports").select("id, created_at, assessment_id, parent_id, child_id, emailed_at, email_error, alerted_at, alert_error, email_clicks, email_first_clicked_at").order("id"), "reports"),
    // the cards come back once Stripe has filled in the saved cards the site never recorded
    cardRows.then(async (rows) => (await confirmCardsInStripe(rows), rows)),
    allRows<RawWaitlist>(a.db.rpc("admin_waitlist_joins").select("id, created_at, parent_id, child_id, province").order("id"), "waitlist"),
    allRows<RawEmail>(a.db.from("email_log").select("id, created_at, parent_id, child_id, assessment_id, kind, status, attempts, sent_at, error, clicks, first_clicked_at").order("id"), "email log"),
    cardSubscriptions(cardRows),
    testAccountIds(a),
    deliveryRows(a),
  ]);
  return {
    parents, children, reports, cards, waitlist, emails, deliveries, testIds, ...stripeRead,
    tests: tests.map(({ answers, ...t }) => ({ ...t, answered: answers[0]?.count ?? 0 })),
  };
}

/** Up to this many of the account's newest subscriptions are read; far more than a launch needs. */
const SUBSCRIPTIONS_MAX = 2000;

const INTERVALS = ["day", "week", "month", "year"] as const;

type StripeRead = Pick<DashboardRows, "subscriptions" | "stripeNote" | "stripeMode">;

/**
 * The Stripe subscriptions of the customers that saved a card. Read only: Savar starts each subscription himself.
 * Stripe is always asked, even with no saved cards, so the dashboard shows whether the key can read subscriptions.
 * Stripe is asked while the card setups are still being read; a failed card read fails the page, as before.
 */
async function cardSubscriptions(cardRows: Promise<RawCard[]>): Promise<StripeRead> {
  const s = stripe();
  if (!s) return { subscriptions: [], stripeMode: null, stripeNote: "No Stripe key here, so the page cannot tell who is paying." };
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const stripeMode = key.startsWith("sk_live_") || key.startsWith("rk_live_") ? "live" : "test";
  const listed = s.subscriptions.list({ status: "all", limit: 100 }).autoPagingToArray({ limit: SUBSCRIPTIONS_MAX })
    .then((all) => ({ all }), (e: unknown) => ({ failed: e }));
  const customers = new Set((await cardRows).flatMap((c) => (c.stripe_customer_id ? [c.stripe_customer_id] : [])));
  try {
    const read = await listed;
    if ("failed" in read) throw read.failed;
    const { all } = read;
    return {
      stripeMode,
      stripeNote: all.length >= SUBSCRIPTIONS_MAX ? `Stripe has more than ${SUBSCRIPTIONS_MAX} subscriptions; only the newest ${SUBSCRIPTIONS_MAX} were read.` : null,
      subscriptions: all.flatMap((sub) => {
        const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        if (!customers.has(customer)) return [];
        const item = sub.items.data[0];
        const ended = sub.ended_at ?? sub.canceled_at;
        return [{
          id: sub.id, customer, status: sub.status,
          created: new Date((sub.start_date ?? sub.created) * 1000).toISOString(),
          endedAt: ended ? new Date(ended * 1000).toISOString() : null,
          trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          amount: item?.price.unit_amount ?? null, quantity: item?.quantity ?? 1,
          interval: INTERVALS.find((i) => i === item?.price.recurring?.interval) ?? null, intervalCount: item?.price.recurring?.interval_count ?? 1,
          currency: item?.price.currency ?? null,
        }];
      }),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[admin] stripe subscriptions failed", message);
    return { subscriptions: [], stripeMode: null, stripeNote: `Stripe did not answer, so the page cannot tell who is paying. Stripe said: ${message.slice(0, 200)}` };
  }
}

/**
 * The site records a saved card when the parent returns to the thank-you page or opens the report again. A parent who
 * does neither has a saved card in Stripe that the site never recorded. For each card setup with no saved time, ask
 * the saved-card module what Stripe says, with the same rules as the report, and take the card's time. Read only;
 * nothing is written back.
 */
async function confirmCardsInStripe(cards: RawCard[]): Promise<void> {
  const s = stripe();
  const open = cards.filter((c) => c.stripe_customer_id && !c.card_saved_at);
  if (!s || open.length === 0) return;
  const provider = stripeCardProvider(s);
  await Promise.all(open.map(async (c) => {
    const answer = await findSavedCard(c, provider);
    if (answer.state === "saved") Object.assign(c, { card_saved_at: answer.evidence.savedAt, saved_in_stripe_only: true });
    else if (answer.state === "unknown") console.error("[admin] stripe saved card check failed", c.id);
  }));
}

/** The admins' user ids. PostgREST returns a set of scalars as plain values; an object row is read too, to be safe. */
async function teamIds(a: AdminSession): Promise<string[]> {
  const rows = must<(string | Record<string, string>)[]>(await a.db.rpc("admin_team_ids"), "team ids");
  return rows.map((r) => (typeof r === "string" ? r : Object.values(r)[0]));
}

/** Admin accounts and families marked as a test (migration add_test_accounts): left out of the dashboard's numbers. */
export async function testAccountIds(a: AdminSession): Promise<string[]> {
  const [team, marked] = await Promise.all([
    teamIds(a),
    allRows<{ parent_id: string }>(a.db.from("test_accounts").select("parent_id").order("parent_id"), "test accounts"),
  ]);
  return [...new Set([...team, ...marked.map((m) => m.parent_id)])];
}

/** Whether a family is marked as a test, and whether it is an admin's own (always left out; it cannot be unmarked). */
export async function testAccountState(a: AdminSession, parentId: string): Promise<{ marked: boolean; admin: boolean }> {
  const [team, marked] = await Promise.all([
    teamIds(a),
    a.db.from("test_accounts").select("parent_id").eq("parent_id", parentId).maybeSingle().then((r) => must<{ parent_id: string } | null>(r, "test account")),
  ]);
  return { marked: !!marked, admin: team.includes(parentId) };
}

/** Marks or unmarks a family as a test. Row-level security allows it for admins only. */
export async function setTestAccount(a: AdminSession, parentId: string, test: boolean): Promise<void> {
  const { error } = test
    ? await a.db.from("test_accounts").upsert({ parent_id: parentId, marked_by: a.userId }, { onConflict: "parent_id", ignoreDuplicates: true })
    : await a.db.from("test_accounts").delete().eq("parent_id", parentId);
  if (error) throw new Error(`[admin] test account: ${error.message}`);
}

/**
 * The kept copy of a logged email (D-103), by its id in the email list: a reminder's log id, or "<report id>:report" or
 * "<report id>:alert". Null when there is no copy: the email went before copies were kept, or its copy failed.
 */
export async function getEmailCopy(a: AdminSession, emailId: string): Promise<EmailCopyView | null> {
  const [id, which, ...rest] = emailId.split(":");
  if (!isUuid(id) || rest.length > 0 || (which !== undefined && which !== "report" && which !== "alert")) return null;
  const query = a.db.from("email_copies").select("outcome, email_id, from_address, to_address, reply_to, subject, text_body, html_body, updated_at");
  const row = await (which ? query.eq("report_id", id).eq("report_email", which === "report" ? "parent" : "alert") : query.eq("email_log_id", id)).maybeSingle()
    .then((r) => must<EmailCopyRow | null>(r, "email copy"));
  if (!row) return null;
  const events = row.email_id
    ? must<{ type: Delivery["type"]; occurred_at: string; detail: string | null }[]>(
        await a.db.from("email_events").select("type, occurred_at, detail").eq("email_id", row.email_id).order("occurred_at"),
        "email events",
      ).map((e) => ({ type: e.type, at: e.occurred_at, detail: e.detail }))
    : [];
  return { outcome: row.outcome, from: row.from_address, to: row.to_address, replyTo: row.reply_to, subject: row.subject, text: row.text_body, html: row.html_body, keptAt: row.updated_at, events };
}
type EmailCopyRow = { outcome: EmailCopyView["outcome"]; email_id: string | null; from_address: string | null; to_address: string; reply_to: string | null; subject: string; text_body: string; html_body: string | null; updated_at: string };

/**
 * Resend's delivery events (D-104) of every email with a kept copy, each with the email it belongs to. Events of
 * emails without a copy (sign-in links, signup alerts) are left out.
 */
async function deliveryRows(a: AdminSession): Promise<RawDelivery[]> {
  const [copies, events] = await Promise.all([
    allRows<{ email_id: string; email_log_id: string | null; report_id: string | null; report_email: "parent" | "alert" | null }>(
      a.db.from("email_copies").select("email_id, email_log_id, report_id, report_email").not("email_id", "is", null).order("id"), "email copies"),
    allRows<{ email_id: string; type: RawDelivery["type"]; occurred_at: string; detail: string | null }>(
      a.db.from("email_events").select("email_id, type, occurred_at, detail").order("id"), "email events"),
  ]);
  const byEmail = new Map(copies.map((c) => [c.email_id, c]));
  return events.flatMap((e) => {
    const c = byEmail.get(e.email_id);
    return c ? [{ email_log_id: c.email_log_id, report_id: c.report_id, report_email: c.report_email, type: e.type, occurred_at: e.occurred_at, detail: e.detail }] : [];
  });
}

/**
 * Every copy without names (#201, public.anonymous_tests: admins read it), for the export. Each row is the copy's random
 * id and its JSON; nothing in it links to a family.
 */
export async function anonymousTestRows(a: AdminSession): Promise<AnonymousTestRow[]> {
  return allRows<AnonymousTestRow>(a.db.from("anonymous_tests").select("id, copy").order("id"), "anonymous tests");
}

// Live test progress

/** At most this many tests per progress read (the dashboard's open tests, or a poll's ids), asked PROGRESS_CHUNK at a time. */
export const PROGRESS_MAX = 500;
/** Ids per database call: public.admin_test_progress_for() returns at most 50 rows. */
const PROGRESS_CHUNK = 50;

/** One row of public.admin_test_progress_for() (migration add_admin_test_progress_for). */
type ProgressQueryRow = {
  id: string; status: AssessmentStatus; route: Route | null;
  started_at: string; last_answer_at: string | null; completed_at: string | null; resume_until: string;
  break_started_at: string | null; break_ended_at: string | null;
  stage1: number; up: number; stay: number; down: number; answered: number;
  last_shown_position: number | null; last_shown_at: string | null;
  facts_started_at: string | null; facts_answered: number; facts_tried: number; facts_drawn: number; next_prompt: string | null;
};

/**
 * How far each of these tests got, by test id (admin-progress.ts). The page names the tests (the families it shows),
 * so hidden test families never take the place of real ones. One small row per test from the database: counts, lengths
 * and the next prompt, never the stored test, so a poll every few seconds stays cheap.
 */
export async function progressRows(a: AdminSession, ids: readonly string[]): Promise<Map<string, ProgressInput>> {
  const wanted = [...new Set(ids.filter(isUuid))].slice(0, PROGRESS_MAX);
  const chunks = Array.from({ length: Math.ceil(wanted.length / PROGRESS_CHUNK) }, (_, i) => wanted.slice(i * PROGRESS_CHUNK, (i + 1) * PROGRESS_CHUNK));
  const rows = (await Promise.all(chunks.map(async (chunk) =>
    must<ProgressQueryRow[]>(await a.db.rpc("admin_test_progress_for", { ids: chunk }), "test progress")))).flat();
  return new Map(rows.map((r) => [r.id, {
    status: r.status, route: r.route, answered: r.answered, nextPrompt: r.next_prompt,
    lengths: { stage1: r.stage1, up: r.up, stay: r.stay, down: r.down },
    lastShown: r.last_shown_position === null || !r.last_shown_at ? null : { position: r.last_shown_position, at: r.last_shown_at },
    startedAt: r.started_at, lastAnswerAt: r.last_answer_at, completedAt: r.completed_at, resumeUntil: r.resume_until,
    breakStartedAt: r.break_started_at, breakEndedAt: r.break_ended_at,
    factsStartedAt: r.facts_started_at, factsAnswered: r.facts_answered, factsTried: r.facts_tried, factsDrawn: r.facts_drawn,
  }]));
}

/** One test's progress records from its full detail, so the test page needs no second read for its first render. */
export function detailProgress(d: TestDetail): ProgressInput {
  const { stored } = d.test;
  const route = d.test.route as Route | null;
  const shown = d.shows.reduce<ShownRecord | null>((a, s) => (!a || s.position > a.position ? s : a), null);
  const n = d.answers.length;
  const onRoute = [...stored.stage1, ...(route ? stored.stage2[route] : [])];
  return {
    status: d.test.status, route, answered: n,
    nextPrompt: n < stored.stage1.length || route ? (onRoute[n]?.prompt ?? null) : null,
    lengths: { stage1: stored.stage1.length, up: stored.stage2.up.length, stay: stored.stage2.stay.length, down: stored.stage2.down.length },
    lastShown: shown ? { position: shown.position, at: shown.shown_at } : null,
    startedAt: d.test.started_at, lastAnswerAt: d.test.last_answer_at, completedAt: d.test.completed_at, resumeUntil: d.test.resume_until,
    breakStartedAt: d.context.break_started_at, breakEndedAt: d.context.break_ended_at,
    factsStartedAt: d.facts?.started_at ?? null, factsAnswered: d.facts?.answers.filter((f) => f.response !== "").length ?? 0,
    factsTried: d.facts?.answers.length ?? 0, factsDrawn: d.facts?.test.facts.length ?? 0,
  };
}
