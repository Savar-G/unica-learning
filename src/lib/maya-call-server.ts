import "server-only";
import type { AdminSession } from "@/lib/admin-store";
import type { Question, Route, StoredTest } from "@/lib/assessment";
import { assessmentQuestionReader } from "@/lib/assessment-questions";
import { rebuildChildProfileNow } from "@/lib/child-profile-server";
import { mayaCalls, recordView, FAKE_MODEL_ID, type CallStatus, type CallView, type FlagLevel, type MayaCalls } from "@/lib/maya-call";
import { alertState } from "@/lib/maya-call-alert-store";
import { callModel, callSeams } from "@/lib/maya-call-seams";
import { fromCallRow } from "@/lib/maya-call-store";
import type { Outcome } from "@/lib/maya";
import { livekitProject } from "@/lib/maya-voice";
import { lookupStoredQuestion, SUPPORTED_ASSESSMENT_TEMPLATES, templateSkillName } from "@/lib/question-package-assessment";
import { valueText } from "@/lib/question-package";
import type { Database } from "@/lib/database";
import { adminClient } from "@/lib/supabase-auth";

// Maya's admin test calls on the server (#323): the call module (src/lib/maya-call.ts) with its seams
// (src/lib/maya-call-seams.ts, shared with the voice worker). Writes use the secret key; the admin pages read with the
// admin's own session (row-level security: admins read public.maya_calls). The model: Maya's model through OpenRouter
// when the server has OPENROUTER_API_KEY, else the fake rule player (src/lib/maya-model-fake.ts). A call keeps the
// model it started with. Free talk is on (D-197), with its review (callReviewer). Voice calls (#326) start here; Maya's
// voice worker runs them (worker/maya-voice). A flagged call's internal alert (#333) goes to SIGNUP_NOTIFY_EMAIL through
// Resend, with a link to the admin call page on the request's own site.

export { callModel, callReviewer } from "@/lib/maya-call-seams";

/** The model a new call would use now, for the admin screen. */
export function nextCallModel(): { id: string; fake: boolean } {
  const model = callModel(null)!;
  return { id: model.id, fake: model.id === FAKE_MODEL_ID };
}

/** Whether this server can start voice calls: it has its LiveKit project (LIVEKIT_URL, key and secret). */
export const voiceReady = () => livekitProject(process.env) !== null;

/** The call module with the secret key, or null without it. `origin`: the site the alert's admin link points to (see callSeams). */
export function serverMayaCalls(origin?: string): MayaCalls | null {
  const db = adminClient();
  if (!db) return null;
  return mayaCalls(callSeams(db, { origin, rebuild: async (childId) => (await rebuildChildProfileNow(childId))?.built === true }));
}

/** The voice facts of a call for its token: its family, mode and status, read with the secret key. */
export async function voiceCallFacts(id: string) {
  const db = adminClient();
  if (!db || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const { data, error } = await db.from("maya_calls").select("id, parent_id, child_id, mode, status").eq("id", id.toLowerCase()).maybeSingle();
  if (error) throw new Error(`voice call load: ${error.message}`);
  return data && { id: data.id, parentId: data.parent_id, childId: data.child_id, mode: data.mode, status: data.status };
}

/** What a new call needs about a test question: the family, the child's first name and the package. */
export async function testQuestion(assessmentId: string, questionId: string) {
  const db = adminClient();
  if (!db) return null;
  const { data, error } = await db.from("assessments").select("id, parent_id, child_id, children(first_name)").eq("id", assessmentId).maybeSingle();
  if (error) throw new Error(`test question load: ${error.message}`);
  if (!data) return null;
  const found = await assessmentQuestionReader(db).question({ source: "assessment", assessmentId: data.id, questionId });
  if (found.status !== "found") return null;
  return { parentId: data.parent_id, childId: data.child_id, childName: data.children?.first_name ?? null, package: found.package };
}

/** The child's first name for a call's next turn (Maya may say it). */
export async function childFirstName(childId: string): Promise<string | null> {
  const db = adminClient();
  if (!db) return null;
  const { data } = await db.from("children").select("first_name").eq("id", childId).maybeSingle();
  return data?.first_name ?? null;
}

// ---------- reads for the admin pages, with the admin's session ----------

/** One question Maya can work on: a supported question a test family's child was given in a test. */
export interface DemoQuestion {
  assessmentId: string;
  questionId: string;
  number: number;
  text: string;
  answer: string;
  templateId: string;
  /** The skill the question tests, in plain words; null when the template has no skill tag. */
  skill: string | null;
}

export interface DemoChild {
  childId: string;
  parentId: string;
  firstName: string;
  tests: { assessmentId: string; startedAt: string; status: string; questions: DemoQuestion[] }[];
}

const must = <T,>(r: { data: unknown; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`[admin] ${what}: ${r.error.message}`);
  return r.data as T;
};

/** The test families' children, with the supported questions of each of their tests, newest test first. */
export async function demoChildren(a: AdminSession): Promise<DemoChild[]> {
  const marked = must<{ parent_id: string }[]>(await a.db.from("test_accounts").select("parent_id"), "test accounts").map((m) => m.parent_id);
  if (marked.length === 0) return [];
  const [children, tests] = await Promise.all([
    a.db.rpc("admin_children").select("id, parent_id, first_name").in("parent_id", marked).then((r) => must<{ id: string; parent_id: string; first_name: string }[]>(r, "children")),
    a.db.rpc("admin_assessments").select("id, child_id, parent_id, started_at, status, route, test").in("parent_id", marked).order("started_at", { ascending: false })
      .then((r) => must<{ id: string; child_id: string; started_at: string; status: string; route: Route | null; test: StoredTest }[]>(r, "tests")),
  ]);
  const supported = new Set(SUPPORTED_ASSESSMENT_TEMPLATES);
  return children
    .map((c) => ({
      childId: c.id,
      parentId: c.parent_id,
      firstName: c.first_name,
      tests: tests
        .filter((t) => t.child_id === c.id)
        .map((t) => {
          const given: Question[] = [...t.test.stage1, ...(t.route ? t.test.stage2[t.route] : [])];
          const questions = given.flatMap((q, i): DemoQuestion[] => {
            if (!supported.has(q.templateId)) return [];
            const found = lookupStoredQuestion({ source: "assessment", assessmentId: t.id, questionId: q.id }, { test: t.test, route: t.route });
            return found.status === "found"
              ? [{ assessmentId: t.id, questionId: q.id, number: i + 1, text: found.package.text, answer: found.package.answer ? valueText(found.package.answer.value) : "", templateId: q.templateId, skill: templateSkillName(q.templateId) }]
              : [];
          });
          return { assessmentId: t.id, startedAt: t.started_at, status: t.status, questions };
        })
        .filter((t) => t.questions.length > 0),
    }))
    .filter((c) => c.tests.length > 0);
}

export interface CallListRow {
  id: string;
  createdAt: string;
  childId: string;
  childName: string | null;
  questionText: string | null;
  status: CallStatus;
  model: { id: string; fake: boolean };
  outcome: Outcome["reason"] | null;
  assistance: Outcome["assistance"] | null;
  seconds: number | null;
  learningEvent: boolean;
  mode: "text" | "voice";
  /** Voice calls: seconds the child and Maya were both connected. */
  connectedSeconds: number | null;
  /** Signs of mishearing: numbers Maya asked to confirm, and "no, I said" corrections. */
  mishearing: { confirmations: number; corrections: number } | null;
  flag: FlagLevel | null;
  /** The outcome's own safety, for a call saved before flags existed (R393-L3). */
  safetySeverity: Outcome["safetySeverity"];
  safetyFlag: boolean;
}

/** The newest calls within each flag level. Apply the limit after priority, including older safety records. */
export async function listCalls(a: AdminSession, limit = 50): Promise<CallListRow[]> {
  const filters = [
    "flag.eq.safety_immediate,and(flag.is.null,safety_severity.eq.immediate)",
    "flag.eq.safety_concern,and(flag.is.null,safety_severity.eq.concern),and(flag.is.null,safety_severity.is.null,safety_flag.eq.true)",
    "flag.eq.unsafe_request",
    "and(flag.is.null,safety_severity.is.null,safety_flag.eq.false)",
  ];
  // The groups are disjoint and already in priority order. Each reads at most `limit`, so an old flag cannot be
  // lost behind newer ordinary calls. Each read uses the admin's session and the existing row-level security.
  const groups = await Promise.all(filters.map(async (filter) => must<Database["public"]["Tables"]["maya_calls"]["Row"][]>(
    await a.db.from("maya_calls").select("id, created_at, child_id, question_text, status, model, outcome_reason, assistance, call_seconds, learning_event_id, mode, connected_seconds, mishearing_confirmations, mishearing_corrections, flag, safety_severity, safety_flag")
      .or(filter).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit),
    "maya calls",
  )));
  // A live call can move to a higher group while these reads run. Keep its highest-priority copy only.
  const seen = new Set<string>();
  const rows = groups.flat().filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  }).slice(0, limit);
  const ids = [...new Set(rows.map((r) => r.child_id))];
  const names = ids.length ? must<{ id: string; first_name: string }[]>(await a.db.rpc("admin_children").select("id, first_name").in("id", ids), "children") : [];
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    childId: r.child_id,
    childName: names.find((n) => n.id === r.child_id)?.first_name ?? null,
    questionText: r.question_text,
    status: r.status,
    model: { id: r.model, fake: r.model === FAKE_MODEL_ID },
    outcome: r.outcome_reason,
    assistance: r.assistance,
    seconds: r.call_seconds,
    learningEvent: r.learning_event_id !== null,
    mode: r.mode,
    connectedSeconds: r.connected_seconds,
    mishearing: r.mishearing_confirmations === null ? null : { confirmations: r.mishearing_confirmations, corrections: r.mishearing_corrections ?? 0 },
    flag: r.flag,
    safetySeverity: r.safety_severity,
    safetyFlag: r.safety_flag,
  }));
}

/** One call for the admin call page, with the child's first name. */
export async function readCall(a: AdminSession, id: string): Promise<{ view: CallView; childName: string | null } | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const row = must<Database["public"]["Tables"]["maya_calls"]["Row"] | null>(await a.db.from("maya_calls").select("*").eq("id", id.toLowerCase()).maybeSingle(), "maya call");
  if (!row) return null;
  const alerts = row.flag
    ? must<Database["public"]["Tables"]["maya_call_alerts"]["Row"][]>(await a.db.from("maya_call_alerts").select("*").eq("call_id", row.id).order("created_at"), "maya call alerts").map(alertState)
    : [];
  const view = recordView(fromCallRow(row), alerts);
  if (!view) return null;
  const child = must<{ first_name: string } | null>(await a.db.rpc("admin_children").select("first_name").eq("id", row.child_id).maybeSingle(), "child");
  return { view, childName: child?.first_name ?? null };
}
