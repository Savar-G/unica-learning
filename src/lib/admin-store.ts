import "server-only";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FactsTest, HelpAnswer, Placement, Province, StoredTest } from "@/lib/assessment";
import { isUuid } from "@/lib/assessment-store";
import { LEARNING_COLUMNS, type LearningRow } from "@/lib/learning-style";
import { filterTests, type AdminFilters, type AnswerRecord, type FactAnswerRecord, type ReviewRecord, type ShownRecord } from "@/lib/admin-view";
import type { TestContextRecord } from "@/lib/admin-view";
import { sessionClient } from "@/lib/supabase-auth";
import type { AssessmentStatus } from "@/lib/test-api";
import { signWork } from "@/lib/work-store";
import { findSavedCard } from "@/lib/saved-card";
import { stripeCardProvider } from "@/lib/saved-card-server";
import { stripe } from "@/lib/stripe";
import type { DashboardRows, Delivery, EmailCopyView, RawCard, RawDelivery, RawChild, RawEmail, RawParent, RawReport, RawTest, RawWaitlist } from "@/lib/admin-dashboard";

// The admin area's data (#77). The gate and every read are here, so no admin page reads the database on its own; the
// report view is read by the report-loading module with the admin's session (src/lib/report-loading-server.ts, #161).
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
 * The signed-in admin, or null: there is no session, the token does not verify (getUser checks
 * its identity with Auth), or the user has no admin_users row (is_admin, run by the database with the same token).
 * #78: a route calls this and answers 404 when it is null.
 */
export async function adminSession(): Promise<AdminSession | null> {
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
  // Admin pages read cookies, so they render per request.
  await connection();
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
  /** The test context (#185): the device and the halfway break. */
  context: TestContextRecord;
  answers: AnswerRecord[];
  reviews: ReviewRecord[];
  report: { id: string; created_at: string; questions: number; minutes: number; emailed_at: string | null; email_error: string | null; alerted_at: string | null; alert_error: string | null } | null;
  facts: { started_at: string; test: FactsTest; answers: FactAnswerRecord[] } | null;
  /** When the server first served each question (#184). */
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
  const row = must<(TestQueryRow & { seed: number; resume_until: string; test: StoredTest } & TestContextRecord) | null>(
    await a.db.rpc("admin_assessments").select(`${TEST_COLUMNS}, seed, resume_until, test, ${CONTEXT_COLUMNS}`).eq("id", id).maybeSingle(), "test");
  if (!row) return null;
  const { device, break_started_at, break_ended_at, break_skipped, break_ms, ...withoutContext } = row;
  const context: TestContextRecord = { device, break_started_at, break_ended_at, break_skipped, break_ms };
  const { test: stored, seed, resume_until, ...listRow } = withoutContext;
  const [[test], answers, reviews, report, facts, factAnswers, emails, shows] = await Promise.all([
    withPeople(a, [listRow]),
    a.db.from("answers").select(`${ANSWER_COLUMNS}, ${TIMELINE_COLUMNS}`).eq("assessment_id", id).order("position").then((r) => must<AnswerRecord[]>(r, "answers")),
    a.db.from("work_reviews").select(REVIEW_COLUMNS).eq("assessment_id", id).then((r) => must<ReviewRecord[]>(r, "reviews")),
    a.db.rpc("admin_reports").select("id, created_at, questions, minutes, emailed_at, email_error, alerted_at, alert_error").eq("assessment_id", id)
      .maybeSingle().then((r) => must<TestDetail["report"]>(r, "report")),
    a.db.from("assessment_facts").select("started_at, test").eq("assessment_id", id).maybeSingle()
      .then((r) => must<{ started_at: string; test: FactsTest } | null>(r, "facts")),
    a.db.from("fact_answers").select(FACT_ANSWER_COLUMNS).eq("assessment_id", id).order("position")
      .then((r) => must<FactAnswerRecord[]>(r, "fact answers")),
    emailRows(a, (q) => q.eq("assessment_id", id)),
    a.db.from("question_shows").select("position, question_id, shown_at").eq("assessment_id", id).order("position")
      .then((r) => must<ShownRecord[]>(r, "question shows")),
  ]);
  const paths = answers.flatMap((x) => (x.work_path ? [x.work_path] : []));
  return {
    test: { ...test, seed, resume_until, stored },
    context,
    answers,
    reviews,
    report,
    facts: facts ? { ...facts, answers: factAnswers } : null,
    shows,
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

/** One child with how they learn (#126), which the book plan reads. */
export type ChildDetail = ChildRow & LearningRow & { learning_updated_at: string | null };

/** One child and their family records. #78 can use the parent id for the future deletion action. */
export async function getChild(a: AdminSession, id: string): Promise<{ child: ChildDetail; family: ParentDetail } | null> {
  if (!isUuid(id)) return null;
  const child = must<ChildDetail | null>(await a.db.rpc("admin_children").select(`${CHILD_COLUMNS}, ${LEARNING_COLUMNS}, learning_updated_at`).eq("id", id).maybeSingle(), "child");
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
  kind: "continue" | "come_back" | "start" | "start_followup" | "unsubscribe";
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

// The dashboard and activity log (D-099)

/**
 * Every row the dashboard needs, all of them: the model counts families, tests and emails over any range. Fine at
 * today's size (hundreds of families); move the counts into SQL when a page load gets slow. Payment status comes from
 * Stripe, read only: the subscriptions of the customers that saved a card.
 */
export async function dashboardRows(a: AdminSession): Promise<DashboardRows> {
  const [parents, children, tests, reports, cards, waitlist, emails] = await Promise.all([
    allRows<RawParent>(a.db.rpc("admin_parents").select(PARENT_COLUMNS).order("id"), "parents"),
    allRows<RawChild>(a.db.rpc("admin_children").select(CHILD_COLUMNS).order("id"), "children"),
    allRows<Omit<RawTest, "answered"> & { answers: { count: number }[] }>(a.db.rpc("admin_assessments").select("id, created_at, status, parent_id, child_id, grade, province, started_at, completed_at, last_answer_at, answers(count)").order("id"), "tests"),
    allRows<RawReport>(a.db.rpc("admin_reports").select("id, created_at, assessment_id, parent_id, child_id, emailed_at, email_error, alerted_at, alert_error, email_clicks, email_first_clicked_at").order("id"), "reports"),
    allRows<RawCard>(a.db.rpc("admin_card_setups").select("id, created_at, updated_at, parent_id, child_id, plan, price, stripe_customer_id, card_saved_at").order("id"), "card setups"),
    allRows<RawWaitlist>(a.db.rpc("admin_waitlist_joins").select("id, created_at, parent_id, child_id, province").order("id"), "waitlist"),
    allRows<RawEmail>(a.db.from("email_log").select("id, created_at, parent_id, child_id, assessment_id, kind, status, attempts, sent_at, error, clicks, first_clicked_at").order("id"), "email log"),
  ]);
  const [stripeRead, testIds, deliveries] = await Promise.all([cardSubscriptions(cards), testAccountIds(a), deliveryRows(a), confirmCardsInStripe(cards)]);
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
 */
async function cardSubscriptions(cards: RawCard[]): Promise<StripeRead> {
  const s = stripe();
  if (!s) return { subscriptions: [], stripeMode: null, stripeNote: "No Stripe key here, so the page cannot tell who is paying." };
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const stripeMode = key.startsWith("sk_live_") || key.startsWith("rk_live_") ? "live" : "test";
  const customers = new Set(cards.flatMap((c) => (c.stripe_customer_id ? [c.stripe_customer_id] : [])));
  try {
    const all = await s.subscriptions.list({ status: "all", limit: 100 }).autoPagingToArray({ limit: SUBSCRIPTIONS_MAX });
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
  const row = must<EmailCopyRow | null>(
    await (which ? query.eq("report_id", id).eq("report_email", which === "report" ? "parent" : "alert") : query.eq("email_log_id", id)).maybeSingle(),
    "email copy",
  );
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
