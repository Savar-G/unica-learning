import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import type { AdminSession } from "@/lib/admin-store";
import { aiClient } from "@/lib/ai-client";
import type { Question, Route, StoredTest } from "@/lib/assessment";
import { assessmentQuestionReader } from "@/lib/assessment-questions";
import { rebuildChildProfileNow } from "@/lib/child-profile-server";
import { learningEvents } from "@/lib/learning-events";
import { learningEventStore } from "@/lib/learning-events-store";
import { mayaCalls, recordView, FAKE_MODEL_ID, type CallStatus, type CallView, type MayaCalls } from "@/lib/maya-call";
import { fromCallRow, mayaCallStore } from "@/lib/maya-call-store";
import { aiMayaModel, type MayaModel } from "@/lib/maya-model";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import type { Outcome } from "@/lib/maya";
import { lookupStoredQuestion, SUPPORTED_ASSESSMENT_TEMPLATES } from "@/lib/question-package-assessment";
import { valueText } from "@/lib/question-package";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { adminClient } from "@/lib/supabase-auth";

// Maya's admin test calls on the server (#323): the call module (src/lib/maya-call.ts) with its seams. Writes use the
// secret key; the admin pages read with the admin's own session (row-level security: admins read public.maya_calls).
// The model: Maya's model through OpenRouter when the server has OPENROUTER_API_KEY, else the fake rule player
// (src/lib/maya-model-fake.ts). A call keeps the model it started with.

/** The model a call uses: null asks for the one a new call uses now. */
export function callModel(id: string | null): MayaModel | null {
  const client = aiClient();
  if (id === null) return client ? aiMayaModel(client) : ruleMayaModel();
  if (id === FAKE_MODEL_ID) return ruleMayaModel();
  return client && client.model === id ? aiMayaModel(client) : null;
}

/** The model a new call would use now, for the admin screen. */
export function nextCallModel(): { id: string; fake: boolean } {
  const model = callModel(null)!;
  return { id: model.id, fake: model.id === FAKE_MODEL_ID };
}

async function isTestFamily(db: SupabaseClient<Database>, parentId: string): Promise<boolean> {
  const { data, error } = await db.from("test_accounts").select("parent_id").eq("parent_id", parentId).maybeSingle();
  if (error) throw new Error(`test family check: ${error.message}`);
  return data !== null;
}

/** The call module with the secret key, or null without it. */
export function serverMayaCalls(): MayaCalls | null {
  const db = adminClient();
  if (!db) return null;
  return mayaCalls({
    store: mayaCallStore(db),
    events: learningEvents(learningEventStore(db)),
    rebuild: async (childId) => (await rebuildChildProfileNow(childId))?.built === true,
    model: callModel,
    isTestFamily: (parentId) => isTestFamily(db, parentId),
    clock: () => Date.now(),
    newId: () => randomUUID(),
    seed: () => randomInt(0, 2 ** 32),
  });
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
              ? [{ assessmentId: t.id, questionId: q.id, number: i + 1, text: found.package.text, answer: found.package.answer ? valueText(found.package.answer.value) : "", templateId: q.templateId }]
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
  model: string;
  outcome: Outcome["reason"] | null;
  assistance: Outcome["assistance"] | null;
  seconds: number | null;
  learningEvent: boolean;
}

/** The newest test calls. */
export async function listCalls(a: AdminSession, limit = 50): Promise<CallListRow[]> {
  const rows = must<{ id: string; created_at: string; child_id: string; question_text: string | null; status: CallStatus; model: string; outcome_reason: Outcome["reason"] | null; assistance: Outcome["assistance"] | null; call_seconds: number | null; learning_event_id: string | null }[]>(
    await a.db.from("maya_calls").select("id, created_at, child_id, question_text, status, model, outcome_reason, assistance, call_seconds, learning_event_id").order("created_at", { ascending: false }).limit(limit),
    "maya calls",
  );
  const ids = [...new Set(rows.map((r) => r.child_id))];
  const names = ids.length ? must<{ id: string; first_name: string }[]>(await a.db.rpc("admin_children").select("id, first_name").in("id", ids), "children") : [];
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    childId: r.child_id,
    childName: names.find((n) => n.id === r.child_id)?.first_name ?? null,
    questionText: r.question_text,
    status: r.status,
    model: r.model,
    outcome: r.outcome_reason,
    assistance: r.assistance,
    seconds: r.call_seconds,
    learningEvent: r.learning_event_id !== null,
  }));
}

/** One call for the admin call page, with the child's first name. */
export async function readCall(a: AdminSession, id: string): Promise<{ view: CallView; childName: string | null } | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const row = must<Database["public"]["Tables"]["maya_calls"]["Row"] | null>(await a.db.from("maya_calls").select("*").eq("id", id.toLowerCase()).maybeSingle(), "maya call");
  if (!row) return null;
  const view = recordView(fromCallRow(row));
  if (!view) return null;
  const child = must<{ first_name: string } | null>(await a.db.rpc("admin_children").select("first_name").eq("id", row.child_id).maybeSingle(), "child");
  return { view, childName: child?.first_name ?? null };
}
