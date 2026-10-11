import "server-only";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FactsTest, HelpAnswer, Placement, Province, ReportModel, StoredTest } from "@/lib/assessment";
import { isUuid } from "@/lib/assessment-store";
import { filterTests, type AdminFilters, type AnswerRecord, type FactAnswerRecord, type ReviewRecord } from "@/lib/admin-view";
import { pilotOn, requirePilot } from "@/lib/pilot";
import type { ReportView } from "@/lib/report-view";
import { sessionClient } from "@/lib/supabase-auth";
import type { AssessmentStatus } from "@/lib/test-api";
import { signWork } from "@/lib/work-store";

// The admin area's data (#77). The gate and every read are here, so no admin page reads the database on its own.
// Every read uses the admin's own session, never the secret key: the database decides what they see. The tables a
// parent can read come through the admin_* functions (migration add_admin_area), which return every row to an admin
// and nothing to anyone else; answers, work_reviews, email_log and the quick facts tables have an admin read policy;
// the drawings are signed with the admin's session under the bucket's admin read policy.

export interface AdminSession {
  /** The admin's own session client: row-level security and the admin_* functions apply to it. */
  db: SupabaseClient;
  userId: string;
  email: string;
}

/**
 * The signed-in admin, or null: the pilot is off, there is no session, the token does not verify (getUser checks
 * its identity with Auth), or the user has no admin_users row (is_admin, run by the database with the same token).
 * #78: a route calls this and answers 404 when it is null.
 */
export async function adminSession(): Promise<AdminSession | null> {
  if (!pilotOn()) return null;
  const db = await sessionClient();
  const { data, error: userError } = await db.auth.getUser();
  if (userError || !data.user) return null;
  const { data: admin, error } = await db.rpc("is_admin");
  if (error) {
    console.error("[admin] is_admin failed", error.message);
    return null;
  }
  return admin === true ? { db, userId: data.user.id, email: data.user.email ?? "" } : null;
}

/** For admin pages: the admin, or the site's 404 for everyone else (a parent, a visitor, a forged cookie). */
export async function requireAdmin(): Promise<AdminSession> {
  await requirePilot();
  const admin = await adminSession();
  if (!admin) notFound();
  return admin;
}

/** Rows per list, newest first. A longer list says so. */
export const LIST_MAX = 500;

type Result = { data: unknown; error: { message: string } | null };

/** The rows of a read, as T, or a thrown error (the page then shows the error page). The admin_* functions are not in
 * the client's types, so each call names the type of what it selected. */
function must<T>({ data, error }: Result, what: string): T {
  if (error) throw new Error(`[admin] ${what}: ${error.message}`);
  return data as T;
}

/** Ids per `in` filter, so a request URL stays short. */
const CHUNK = 100;

type RangeRead = { range: (from: number, to: number) => PromiseLike<Result>; order: (column: string) => RangeRead };

/** PostgREST caps each response. Page related rows too, so family details and totals are complete. */
async function allRows<T>(query: RangeRead, what: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += LIST_MAX) {
    const rows = must<T[]>(await query.range(from, from + LIST_MAX - 1), what);
    out.push(...rows);
    if (rows.length < LIST_MAX) return out;
  }
}

/** Rows of T for the ids, read CHUNK ids at a time. The rows' type comes from the caller: the query does not know it. */
async function byIds<T>(ids: Iterable<string>, what: string, read: (chunk: string[]) => RangeRead): Promise<T[]> {
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
  postal: string;
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
  if (f.grade) q = q.eq("grade", f.grade);
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
  answers: AnswerRecord[];
  reviews: ReviewRecord[];
  report: { id: string; created_at: string; questions: number; minutes: number; emailed_at: string | null; email_error: string | null; alerted_at: string | null; alert_error: string | null } | null;
  facts: { started_at: string; test: FactsTest; answers: FactAnswerRecord[] } | null;
  emails: EmailRow[];
  /** Short-lived signed URLs of the drawings, by stored path. */
  images: Record<string, string>;
}

const ANSWER_COLUMNS = "position, question_id, response, correct, misconception, time_ms, work_required, work_path, work_text";
const REVIEW_COLUMNS = "question_id, error_type, kind, comment, score, confidence, model";

/** Everything about one test, or null when there is no such test. */
export async function getTest(a: AdminSession, id: string): Promise<TestDetail | null> {
  if (!isUuid(id)) return null;
  const row = must<(TestQueryRow & { seed: number; resume_until: string; test: StoredTest }) | null>(
    await a.db.rpc("admin_assessments").select(`${TEST_COLUMNS}, seed, resume_until, test`).eq("id", id).maybeSingle(), "test");
  if (!row) return null;
  const { test: stored, seed, resume_until, ...listRow } = row;
  const [[test], answers, reviews, report, facts, factAnswers, emails] = await Promise.all([
    withPeople(a, [listRow]),
    a.db.from("answers").select(ANSWER_COLUMNS).eq("assessment_id", id).order("position").then((r) => must<AnswerRecord[]>(r, "answers")),
    a.db.from("work_reviews").select(REVIEW_COLUMNS).eq("assessment_id", id).then((r) => must<ReviewRecord[]>(r, "reviews")),
    a.db.rpc("admin_reports").select("id, created_at, questions, minutes, emailed_at, email_error, alerted_at, alert_error").eq("assessment_id", id)
      .maybeSingle().then((r) => must<TestDetail["report"]>(r, "report")),
    a.db.from("assessment_facts").select("started_at, test").eq("assessment_id", id).maybeSingle()
      .then((r) => must<{ started_at: string; test: FactsTest } | null>(r, "facts")),
    a.db.from("fact_answers").select("position, fact_id, response, correct, at_ms").eq("assessment_id", id).order("position")
      .then((r) => must<FactAnswerRecord[]>(r, "fact answers")),
    emailRows(a, (q) => q.eq("assessment_id", id)),
  ]);
  const paths = answers.flatMap((x) => (x.work_path ? [x.work_path] : []));
  return {
    test: { ...test, seed, resume_until, stored },
    answers,
    reviews,
    report,
    facts: facts ? { ...facts, answers: factAnswers } : null,
    emails: emails.rows,
    images: await signWork(a.db, paths),
  };
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
  const parent = must<ParentRow | null>(await a.db.rpc("admin_parents").select(PARENT_COLUMNS).eq("id", id).maybeSingle(), "parent");
  if (!parent) return null;
  const [children, tests, cards, waitlist, emails] = await Promise.all([
    allRows<ChildRow>(a.db.rpc("admin_children").select(CHILD_COLUMNS).eq("parent_id", id).order("id"), "children"),
    allRows<TestQueryRow>(a.db.rpc("admin_assessments").select(TEST_COLUMNS).eq("parent_id", id).order("created_at", { ascending: false }).order("id"), "tests")
      .then((rows) => withPeople(a, rows)),
    allRows<CardSetupRow>(a.db.rpc("admin_card_setups").select("*").eq("parent_id", id).order("id"), "card setups"),
    allRows<WaitlistRow>(a.db.rpc("admin_waitlist_joins").select("*").eq("parent_id", id).order("id"), "waitlist"),
    familyEmails(a, id),
  ]);
  return { parent, children, tests, cards, waitlist, emails };
}

export interface ChildListRow extends ChildRow {
  parent: ParentRow | null;
  tests: { total: number; completed: number; lastAt: string | null };
}

export async function listChildren(a: AdminSession, f: Pick<AdminFilters, "grade" | "province">, offset = 0): Promise<Page<ChildListRow>> {
  let q = a.db.rpc("admin_children").select(CHILD_COLUMNS);
  if (f.grade) q = q.eq("grade", f.grade);
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

/** One child and their family records. #78 can use the parent id for the future deletion action. */
export async function getChild(a: AdminSession, id: string): Promise<{ child: ChildRow; family: ParentDetail } | null> {
  if (!isUuid(id)) return null;
  const child = must<ChildRow | null>(await a.db.rpc("admin_children").select(CHILD_COLUMNS).eq("id", id).maybeSingle(), "child");
  if (!child) return null;
  const family = await getParent(a, child.parent_id);
  return family ? { child, family: { ...family, tests: family.tests.filter((t) => t.child_id === id) } } : null;
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
  kind: "continue" | "come_back" | "start" | "unsubscribe";
  status: "claimed" | "sent" | "failed" | null;
  attempts: number;
  sent_at: string | null;
  error: string | null;
  parent: ParentRow | null;
  child: ChildRow | null;
}

const EMAIL_COLUMNS = "id, created_at, parent_id, child_id, assessment_id, kind, status, attempts, sent_at, error";
type EmailQuery = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;

/** Reminder emails and unsubscribes (#73), newest first, with who they were for. */
export async function emailRows(a: AdminSession, narrow: (q: EmailQuery) => EmailQuery = (q) => q, offset = 0): Promise<Page<EmailRow>> {
  const query = narrow(a.db.from("email_log").select(EMAIL_COLUMNS)).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + LIST_MAX);
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

// The report

/** A stored report as the parent's report page shows it, with the drawings signed for the admin; null if none. */
export async function getReportView(a: AdminSession, id: string): Promise<{ view: ReportView; assessmentId: string } | null> {
  if (!isUuid(id)) return null;
  const report = must<{ id: string; assessment_id: string; child_id: string; model: ReportModel; questions: number; minutes: number } | null>(
    await a.db.rpc("admin_reports").select("id, assessment_id, child_id, model, questions, minutes").eq("id", id).maybeSingle(), "report");
  if (!report) return null;
  const [test, [child]] = await Promise.all([
    a.db.rpc("admin_assessments").select("completed_at, province").eq("id", report.assessment_id).maybeSingle()
      .then((r) => must<{ completed_at: string; province: Province } | null>(r, "test")),
    childrenById(a, [report.child_id]),
  ]);
  if (!test || !child) return null;
  const paths = (report.model.work ?? []).flatMap((w) => (w.image ? [w.image] : []));
  return {
    assessmentId: report.assessment_id,
    view: {
      id: report.id,
      childName: child.first_name,
      province: test.province,
      completedAt: test.completed_at,
      questions: report.questions,
      minutes: report.minutes,
      model: report.model,
      workImages: await signWork(a.db, paths),
    },
  };
}
