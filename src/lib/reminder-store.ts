import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bandFor, type Grade } from "@/lib/assessment";
import { toAttempt, type AttemptRow } from "@/lib/assessment-store";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { reminderEmail } from "@/lib/reminder-email";
import {
  LATE_LIMIT_MS,
  START_AFTER_MS,
  type DueReminder,
  type LogEntry,
  type ReminderChild,
  type ReminderParent,
  type ReminderState,
  type ReminderStore,
  type ReminderTest,
  type SendOutcome,
} from "@/lib/reminders";
import { hashToken, startPath } from "@/lib/sign-in-link";

// The reminder job's store (#73): reads and writes with the secret key. The rules are in src/lib/reminders.ts; this
// loads every child and test that could be due, and keeps the guards: the unique indexes on public.email_log make a
// second claim of the same reminder fail, and a retry takes a failed row back only once (a guarded update).

export interface LoadedParent extends ReminderParent {
  name: string;
  postal: string;
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

type TestRow = AttemptRow & { child_id: string; grade: number };
type LogRow = { id: string; kind: LogEntry["kind"]; parent_id: string; child_id: string | null; assessment_id: string | null; status: LogEntry["status"]; attempts: number };

export function reminderStore(admin: SupabaseClient): ReminderStore<LoadedState> {
  return {
    async load(now) {
      // Children who could be due: those with a test in progress or one that ran out of time lately, and those added
      // inside the start window.
      const [{ data: open, error: openError }, { data: fresh, error: freshError }] = await Promise.all([
        admin.from("assessments").select("child_id")
          .or(`status.eq.in_progress,and(status.eq.expired,resume_until.gte."${iso(now - LATE_LIMIT_MS - SLACK_MS)}")`)
          .returns<{ child_id: string }[]>(),
        admin.from("children").select("id")
          .lte("created_at", iso(now - START_AFTER_MS + SLACK_MS))
          .gte("created_at", iso(now - START_AFTER_MS - LATE_LIMIT_MS - SLACK_MS))
          .returns<{ id: string }[]>(),
      ]);
      if (openError || freshError) throw new Error(`reminder load: ${openError?.message ?? freshError?.message}`);
      const childIds = [...new Set([...(open ?? []).map((r) => r.child_id), ...(fresh ?? []).map((r) => r.id)])];

      // Every test of those children: the start screen's rules read all of them.
      const [childRows, testRows] = await Promise.all([
        inChunks(childIds, (ids) => admin.from("children").select("id, parent_id, first_name, grade, created_at").in("id", ids)
          .returns<{ id: string; parent_id: string; first_name: string; grade: Grade; created_at: string }[]>()),
        inChunks(childIds, (ids) => admin.from("assessments").select("id, child_id, grade, status, started_at, last_answer_at, resume_until, completed_at").in("child_id", ids)
          .returns<TestRow[]>()),
      ]);
      const parentIds = [...new Set(childRows.map((c) => c.parent_id))];
      const [parentRows, logRows, tests] = await Promise.all([
        inChunks(parentIds, (ids) => admin.from("parents").select("id, name, email, postal").in("id", ids)
          .returns<{ id: string; name: string; email: string; postal: string }[]>()),
        inChunks(parentIds, (ids) => admin.from("email_log").select("id, kind, parent_id, child_id, assessment_id, status, attempts").in("parent_id", ids)
          .returns<LogRow[]>()),
        Promise.all(testRows.map((row) => withAnswers(admin, row))),
      ]);
      return {
        parents: parentRows.map((p) => ({ id: p.id, name: p.name, email: p.email, postal: p.postal })),
        children: childRows.map((c) => ({ id: c.id, parentId: c.parent_id, firstName: c.first_name, grade: c.grade, createdAt: Date.parse(c.created_at) })),
        tests,
        log: logRows.map((e) => ({ id: e.id, kind: e.kind, parentId: e.parent_id, childId: e.child_id, assessmentId: e.assessment_id, status: e.status, attempts: e.attempts })),
      };
    },

    async claim(r, unsubscribeHash) {
      if (r.retry) {
        const { data, error } = await admin.from("email_log")
          .update({ status: "claimed", attempts: r.retry.attempts + 1, unsubscribe_hash: unsubscribeHash, error: null })
          .eq("id", r.retry.logId).eq("status", "failed").eq("attempts", r.retry.attempts)
          .select("id").returns<{ id: string }[]>();
        if (error) throw new Error(`claim retry: ${error.message}`);
        return data?.[0]?.id ?? null;
      }
      const { data, error } = await admin.from("email_log")
        .insert({ parent_id: r.parentId, child_id: r.childId, assessment_id: r.assessmentId, kind: r.kind, status: "claimed", attempts: 1, unsubscribe_hash: unsubscribeHash })
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

    async failed(logId, message) {
      const { error } = await admin.from("email_log").update({ status: "failed", error: message.slice(0, 500) }).eq("id", logId);
      if (error) console.error("[reminders] failed mark failed; the row stays claimed", logId, error.message);
    },
  };
}

/** A test row in the rules' terms. One in progress counts its answers: with every answer in, it waits to be scored. */
async function withAnswers(admin: SupabaseClient, row: TestRow): Promise<LoadedTest> {
  // The test length is fixed by grade band (D-083): stage 1 and the stage 2 form together.
  const total = bandFor(row.grade as Grade).length;
  if (row.status !== "in_progress") return { ...toAttempt(row), childId: row.child_id, answered: 0, total };
  const { count, error } = await admin.from("answers").select("id", { count: "exact", head: true }).eq("assessment_id", row.id);
  if (error) throw new Error(`answers count: ${error.message}`);
  const answered = count ?? 0;
  return { ...toAttempt(row, answered >= total), childId: row.child_id, answered, total };
}

/** Where a reminder's links go. The start screen sends a signed-out parent through sign-in and back. */
export const reminderLinks = (origin: string, r: DueReminder, token: string) => ({
  url: `${origin}${startPath(r.childId)}?reminder=${r.kind}`,
  unsubscribeUrl: `${origin}/unsubscribe?t=${token}`,
  /** RFC 8058 one-click: mail apps POST here from their own Unsubscribe button. */
  oneClickUrl: `${origin}/api/unsubscribe?t=${token}`,
});

/**
 * Sends one reminder through Resend from EMAIL_FROM. A refusal is a known outcome (a later run tries again); a request
 * that ends without an answer throws, because the email may have gone.
 */
export async function sendReminder(r: DueReminder, token: string, state: LoadedState, origin: string): Promise<SendOutcome> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { sent: false, error: "RESEND_API_KEY or EMAIL_FROM is not set" };
  const parent = state.parents.find((p) => p.id === r.parentId);
  const child = state.children.find((c) => c.id === r.childId);
  const test = state.tests.find((t) => t.id === r.assessmentId);
  if (!parent || !child || (r.kind !== "start" && !test)) return { sent: false, error: "parent, child or test not loaded" };

  const links = reminderLinks(origin, r, token);
  // A test's own length; for "start", the length of a test at the child's grade today.
  const common = {
    parentName: parent.name,
    childName: child.firstName,
    url: links.url,
    unsubscribeUrl: links.unsubscribeUrl,
    postal: parent.postal,
    total: test?.total ?? bandFor(child.grade).length,
  };
  const email = r.kind === "continue" && test
    ? reminderEmail({ ...common, kind: "continue", answered: test.answered, resumeUntil: test.resumeUntil })
    : reminderEmail({ ...common, kind: r.kind === "come_back" ? "come_back" : "start" });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [parent.email],
      reply_to: SUPPORT_EMAIL,
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: { "List-Unsubscribe": `<${links.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { sent: false, error: `Resend answered ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}` };
  const json = (await res.json().catch(() => ({}))) as { id?: unknown };
  return { sent: true, id: typeof json.id === "string" && json.id ? json.id : "sent" };
}

export type UnsubscribeState = "subscribed" | "unsubscribed" | "unknown";

/** The parent a reminder's unsubscribe token belongs to, or null. */
async function tokenParent(admin: SupabaseClient, token: unknown): Promise<string | null> {
  const hash = hashToken(token);
  if (!hash) return null;
  const { data, error } = await admin.from("email_log").select("parent_id").eq("unsubscribe_hash", hash).maybeSingle<{ parent_id: string }>();
  if (error) throw new Error(`unsubscribe lookup: ${error.message}`);
  return data?.parent_id ?? null;
}

/** Whether the parent behind this token still gets reminders. */
export async function unsubscribeState(admin: SupabaseClient, token: unknown): Promise<UnsubscribeState> {
  const parent = await tokenParent(admin, token);
  if (!parent) return "unknown";
  const { count, error } = await admin.from("email_log").select("id", { count: "exact", head: true }).eq("parent_id", parent).eq("kind", "unsubscribe");
  if (error) throw new Error(`unsubscribe state: ${error.message}`);
  return (count ?? 0) > 0 ? "unsubscribed" : "subscribed";
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
