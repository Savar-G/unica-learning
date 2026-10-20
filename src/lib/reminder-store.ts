import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bandFor, testLength, type Grade, type Route, type StoredTest } from "@/lib/assessment";
import { toAttempt, type AttemptRow } from "@/lib/assessment-store";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { saveEmailCopy } from "@/lib/email-copies";
import type { EmailMessage, SendLedger } from "@/lib/email-delivery";
import { reminderEmail } from "@/lib/reminder-email";
import {
  LATE_LIMIT_MS,
  MAX_SEND_ATTEMPTS,
  START_AFTER_MS,
  START_WINDOW_MS,
  type DueReminder,
  type LogEntry,
  type ReminderChild,
  type ReminderParent,
  type ReminderState,
  type ReminderStore,
  type ReminderTest,
} from "@/lib/reminders";
import { hashToken, startPath } from "@/lib/sign-in-link";

// The reminder job's store (#73): reads and writes with the secret key. The rules are in src/lib/reminders.ts; this
// loads every child and test that could be due, and keeps the claims in public.email_log (the email log ledger, #152).

export interface LoadedParent extends ReminderParent {
  name: string;
  postal: string | null;
}
export interface LoadedChild extends ReminderChild {
  firstName: string;
  grade: Grade;
}
/** A test, with how many questions it has and how many the child answered. */
export type LoadedTest = ReminderTest & { answered: number; total: number };
export interface LoadedState extends ReminderState {
  parents: LoadedParent[];
  children: LoadedChild[];
  tests: LoadedTest[];
}

const iso = (ms: number) => new Date(ms).toISOString();
/** Reads a few minutes wider than the rules, so a row at a window's edge is never left out. */
const SLACK_MS = 60 * 60_000;
/** Ids per `in` filter, so a request URL stays short. */
const CHUNK = 100;

async function inChunks<T>(ids: readonly string[], read: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await read(ids.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
  }
  return out;
}

/** Supabase returns at most this many rows to one request. */
const PAGE = 1000;

/** Every row of a query, page by page, so a long list is never cut short without an error. */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`reminder load: ${error.message}`);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) return out;
  }
}

type TestRow = AttemptRow & { child_id: string; grade: number; route: Route | null };
type LogRow = { id: string; created_at: string; kind: LogEntry["kind"]; parent_id: string; child_id: string | null; assessment_id: string | null; status: LogEntry["status"]; attempts: number };

export function reminderStore(admin: SupabaseClient): ReminderStore<LoadedState> {
  return {
    async load(now) {
      // Children who could be due: those with an unfinished test whose deadline is ahead or ended inside the late limit
      // ("continue" needs an open test, "come back" one at most LATE_LIMIT_MS past its deadline), and those added inside
      // the start window (both start reminders). A test left in progress for good is not read again once it is past every rule.
      const [open, fresh] = await Promise.all([
        allRows((from, to) => admin.from("assessments").select("child_id")
          .in("status", ["in_progress", "expired"]).gte("resume_until", iso(now - LATE_LIMIT_MS - SLACK_MS))
          .order("id").range(from, to).returns<{ child_id: string }[]>()),
        allRows((from, to) => admin.from("children").select("id")
          .lte("created_at", iso(now - START_AFTER_MS + SLACK_MS))
          .gte("created_at", iso(now - START_WINDOW_MS - SLACK_MS))
          .order("id").range(from, to).returns<{ id: string }[]>()),
      ]);
      const childIds = [...new Set([...open.map((r) => r.child_id), ...fresh.map((r) => r.id)])];

      // Every test of those children: the start screen's rules read all of them.
      const [childRows, testRows] = await Promise.all([
        inChunks(childIds, (ids) => admin.from("children").select("id, parent_id, first_name, grade, created_at").in("id", ids)
          .returns<{ id: string; parent_id: string; first_name: string; grade: Grade; created_at: string }[]>()),
        inChunks(childIds, (ids) => admin.from("assessments").select("id, child_id, grade, route, status, started_at, last_answer_at, resume_until, completed_at").in("child_id", ids)
          .returns<TestRow[]>()),
      ]);
      const parentIds = [...new Set(childRows.map((c) => c.parent_id))];
      const [parentRows, logRows, tests] = await Promise.all([
        inChunks(parentIds, (ids) => admin.from("parents").select("id, name, email, postal").in("id", ids)
          .returns<{ id: string; name: string; email: string; postal: string | null }[]>()),
        inChunks(parentIds, (ids) => admin.from("email_log").select("id, created_at, kind, parent_id, child_id, assessment_id, status, attempts").in("parent_id", ids)
          .returns<LogRow[]>()),
        Promise.all(testRows.map((row) => withAnswers(admin, row))),
      ]);
      return {
        parents: parentRows.map((p) => ({ id: p.id, name: p.name, email: p.email, postal: p.postal })),
        children: childRows.map((c) => ({ id: c.id, parentId: c.parent_id, firstName: c.first_name, grade: c.grade, createdAt: Date.parse(c.created_at) })),
        tests,
        log: logRows.map((e) => ({ id: e.id, kind: e.kind, parentId: e.parent_id, childId: e.child_id, assessmentId: e.assessment_id, status: e.status, attempts: e.attempts, at: Date.parse(e.created_at) })),
      };
    },

    ledger: emailLogLedger(admin),
  };
}

/**
 * The email log as the delivery module's send ledger (#152): one row per reminder, keyed by kind K for test or child
 * Y. The guards: the unique indexes on public.email_log make a second claim of the same reminder fail, and a retry
 * takes a failed row back only once (a guarded update), and only before MAX_SEND_ATTEMPTS tries. Refused marks the row
 * failed, so a later run tries again; unknown keeps it claimed, so no run sends it again. The writes after a claim
 * never throw: a write that fails leaves the row claimed, so the email is never sent twice.
 */
export function emailLogLedger(admin: SupabaseClient): SendLedger<DueReminder, string> {
  return {
    // The unsubscribe token hash goes in the claim's own write, so the link in an email that may have gone works.
    async claim(r, { unsubscribe_hash }) {
      if (r.retry) {
        const { data, error } = await admin.from("email_log")
          .update({ status: "claimed", attempts: r.retry.attempts + 1, unsubscribe_hash, error: null })
          .eq("id", r.retry.logId).eq("status", "failed").eq("attempts", r.retry.attempts).lt("attempts", MAX_SEND_ATTEMPTS)
          .select("id").returns<{ id: string }[]>();
        if (error) throw new Error(`claim retry: ${error.message}`);
        return data?.[0]?.id ?? null;
      }
      const { data, error } = await admin.from("email_log")
        .insert({ parent_id: r.parentId, child_id: r.childId, assessment_id: r.assessmentId, kind: r.kind, status: "claimed", attempts: 1, unsubscribe_hash })
        .select("id").single<{ id: string }>();
      // One row per reminder (unique index): another run claimed it first.
      if (error?.code === "23505") return null;
      if (error) throw new Error(`claim: ${error.message}`);
      return data.id;
    },

    async sent(logId, emailId) {
      const { error } = await admin.from("email_log").update({ status: "sent", sent_at: new Date().toISOString(), email_id: emailId.slice(0, 100), error: null }).eq("id", logId);
      if (error) console.error("[reminders] sent mark failed; the row stays claimed", logId, error.message);
    },

    async refused(logId, message) {
      const { error } = await admin.from("email_log").update({ status: "failed", error: message.slice(0, 500) }).eq("id", logId);
      if (error) console.error("[reminders] failed mark failed; the row stays claimed", logId, error.message);
    },

    async unknown(logId, message) {
      // The email may have gone: the row stays claimed. Only the error is stored, so Savar can check by hand.
      const { error } = await admin.from("email_log").update({ error: message.slice(0, 500) }).eq("id", logId);
      if (error) console.error("[reminders] unknown mark failed; the row stays claimed", logId, error.message);
    },

    // The admin's email view (D-103): the reminder as it was sent, beside its log row.
    keepCopy: (logId, r, copy) => saveEmailCopy(admin, { emailLogId: logId }, r.parentId, copy),
  };
}

/** The test's length as stored: stage 1 plus the stored route's form (#214). The band's length only while the route is not chosen. */
async function lengthOf(admin: SupabaseClient, row: TestRow): Promise<number> {
  const band = bandFor(row.grade as Grade).length;
  // A test the child can no longer continue is never named in an email, so its (large) stored test is not read.
  if (!row.route || (row.status !== "in_progress" && row.status !== "expired")) return band;
  const { data, error } = await admin.from("assessments").select("test").eq("id", row.id).maybeSingle<{ test: StoredTest | null }>();
  if (error) throw new Error(`test load: ${error.message}`);
  return data?.test ? testLength(data.test, row.route) : band;
}

/** A test row in the rules' terms. One in progress counts its answers: with every answer in, it waits to be scored. */
async function withAnswers(admin: SupabaseClient, row: TestRow): Promise<LoadedTest> {
  const total = await lengthOf(admin, row);
  if (row.status !== "in_progress") return { ...toAttempt(row), childId: row.child_id, answered: 0, total };
  const { count, error } = await admin.from("answers").select("id", { count: "exact", head: true }).eq("assessment_id", row.id);
  if (error) throw new Error(`answers count: ${error.message}`);
  const answered = count ?? 0;
  return { ...toAttempt(row, answered >= total), childId: row.child_id, answered, total };
}

/**
 * Where a reminder's links go. The start screen sends a signed-out parent through sign-in and back, and counts the
 * click (D-105); a continue or come back reminder names its test (`a`), so the click finds its one log row.
 */
export const reminderLinks = (origin: string, r: DueReminder, token: string) => ({
  url: `${origin}${startPath(r.childId)}?reminder=${r.kind}${r.assessmentId ? `&a=${r.assessmentId}` : ""}`,
  unsubscribeUrl: `${origin}/unsubscribe?t=${token}`,
  /** RFC 8058 one-click: mail apps POST here from their own Unsubscribe button. */
  oneClickUrl: `${origin}/api/unsubscribe?t=${token}`,
});

/**
 * The reminder email for `r`, to the parent from EMAIL_FROM, with `token` in its unsubscribe link and in the RFC 8058
 * one-click headers (CASL). Null when the state lacks the parent, the child, or the test.
 */
export function reminderMessage(r: DueReminder, token: string, state: LoadedState, origin: string): EmailMessage | null {
  const parent = state.parents.find((p) => p.id === r.parentId);
  const child = state.children.find((c) => c.id === r.childId);
  const test = state.tests.find((t) => t.id === r.assessmentId);
  if (!parent || !child) return null;

  const links = reminderLinks(origin, r, token);
  const common = { parentName: parent.name, childName: child.firstName, url: links.url, unsubscribeUrl: links.unsubscribeUrl, postal: parent.postal };
  let email: ReturnType<typeof reminderEmail>;
  if (r.kind === "continue") {
    if (!test) return null;
    email = reminderEmail({ ...common, kind: "continue", total: test.total, answered: test.answered, resumeUntil: test.resumeUntil });
  } else {
    // A new test: its length at the child's grade today (a new test is drawn at the child's current grade).
    email = reminderEmail({ ...common, kind: r.kind, total: bandFor(child.grade).length });
  }

  return {
    sender: { to: "parent" },
    to: parent.email,
    replyTo: SUPPORT_EMAIL,
    subject: email.subject,
    text: email.text,
    html: email.html,
    headers: { "List-Unsubscribe": `<${links.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

export type UnsubscribeState = "subscribed" | "unsubscribed" | "unknown";

/**
 * The parent an unsubscribe token belongs to, or null: a reminder's token (email_log), or a report email's (reports,
 * #80). Both stop the same thing: reminders and emails about our plans.
 */
async function tokenParent(admin: SupabaseClient, token: unknown): Promise<string | null> {
  const hash = hashToken(token);
  if (!hash) return null;
  const { data, error } = await admin.from("email_log").select("parent_id").eq("unsubscribe_hash", hash).maybeSingle<{ parent_id: string }>();
  if (error) throw new Error(`unsubscribe lookup: ${error.message}`);
  if (data) return data.parent_id;
  const report = await admin.from("reports").select("parent_id").eq("unsubscribe_hash", hash).maybeSingle<{ parent_id: string }>();
  if (report.error) throw new Error(`unsubscribe lookup: ${report.error.message}`);
  return report.data?.parent_id ?? null;
}

/** Whether this parent unsubscribed from reminders and emails about our plans. */
export async function parentUnsubscribed(admin: SupabaseClient, parentId: string): Promise<boolean> {
  const { count, error } = await admin.from("email_log").select("id", { count: "exact", head: true }).eq("parent_id", parentId).eq("kind", "unsubscribe");
  if (error) throw new Error(`unsubscribe state: ${error.message}`);
  return (count ?? 0) > 0;
}

/** Whether the parent behind this token still gets reminders. */
export async function unsubscribeState(admin: SupabaseClient, token: unknown): Promise<UnsubscribeState> {
  const parent = await tokenParent(admin, token);
  if (!parent) return "unknown";
  return (await parentUnsubscribed(admin, parent)) ? "unsubscribed" : "subscribed";
}

/** Stops every reminder to the parent behind this token. Doing it twice is fine. */
export async function unsubscribe(admin: SupabaseClient, token: unknown): Promise<"unsubscribed" | "unknown"> {
  const parent = await tokenParent(admin, token);
  if (!parent) return "unknown";
  const { error } = await admin.from("email_log").insert({ parent_id: parent, kind: "unsubscribe" });
  // One unsubscribe row per parent (unique index): already done.
  if (error && error.code !== "23505") throw new Error(`unsubscribe: ${error.message}`);
  return "unsubscribed";
}
