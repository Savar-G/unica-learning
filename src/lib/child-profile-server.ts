import "server-only";
import { readChildProfile, rebuildChildProfile, type ChildProfileSeams, type RebuildResult } from "@/lib/child-profile";
import { learnerProfile, PROFILE_SCHEMA_VERSION, type LearnerProfile } from "@/lib/assessment";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AiClient } from "@/lib/ai-client";
import type { Database } from "@/lib/database";
import { assessmentQuestionReader } from "@/lib/assessment-questions";
import { childProfileAiClient, type QuestionReader } from "@/lib/child-profile-ai";
import { childProfileStore } from "@/lib/child-profile-store";
import { learningEventStore } from "@/lib/learning-events-store";
import { SUPABASE_URL } from "@/lib/supabase-public";
import { workbookStore } from "@/lib/workbook-store";
import type { LearnerProfileStore } from "@/lib/learner-profile";
import { learnerProfileStore } from "@/lib/learner-profile-store";
import { profileAiClient, writeProfileAi } from "@/lib/learner-profile-ai";
import { secretKeyReportReader } from "@/lib/report-loading-server";
import { loadReportInputs, type ReportReader } from "@/lib/report-loading";

// The child profile's rebuild (src/lib/child-profile.ts, #303) on the server, with the secret key. The report job
// calls it last, after a finished test's profile and its AI parts are stored; the learning card's route calls it after
// the test's profile is built again with the new answers. Later, the steps that write call and marking events call it.
// #304: with the AI client's switch on (OPENROUTER_API_KEY), the rebuild adds the AI findings after the facts. The AI
// reads each event's question from the trusted question data (R355-1): a workbook question from the workbook store, an
// assessment question from the stored test through the assessment adapter.

/**
 * Rebuilds the child's profile. Never throws: a failure is logged, and the next rebuild carries what this one missed.
 * Null without the secret key or on a failure. `seams`: tests give the in-memory ones (src/lib/child-profile-memory.ts).
 */
export async function rebuildChildProfileNow(childId: string, seams?: ChildProfileSeams): Promise<RebuildResult | null> {
  let db = seams;
  if (!db) {
    // Existing server callers may omit the seams. This fallback never imports cookie-based session auth.
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!key) return null;
    const admin = createClient<Database>(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const workbooks = workbookStore(admin);
    const tests = assessmentQuestionReader(admin);
    const questions: QuestionReader = { question: (ref) => (ref.source === "workbook" ? workbooks.question(ref) : tests.question(ref)) };
    db = { profiles: childProfileStore(admin), events: learningEventStore(admin), ai: childProfileAiClient(), questions };
  }
  try {
    const result = await rebuildChildProfile(childId, db);
    if (!result.built && result.reason !== "nothing_to_build") console.info("[child profile] not built", childId, JSON.stringify(result));
    // What the findings' checks dropped: index, standard and rule, never the AI's text.
    if (result.built && !["off", "no_events", "stored"].includes(result.findings.outcome)) console.info("[child profile] findings not stored", childId, JSON.stringify(result.findings));
    else if (result.built && result.findings.outcome === "stored" && result.findings.dropped.length) console.info("[child profile] findings dropped", childId, JSON.stringify(result.findings.dropped));
    return result;
  } catch (e) {
    console.error("[child profile] rebuild failed", childId, e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * The workbook's learner rebuild takes every dependency explicitly. The existing server entry in learner-profile.ts
 * imports cookie-based auth even when given seams, so the standalone worker cannot import that entry.
 * Keep the same facts-first save, normal AI writer and compare-and-set rule.
 */
export async function rebuildWorkbookLearnerProfile(assessmentId: string, db: {
  reader: ReportReader; store: LearnerProfileStore; ai: AiClient | null;
}): Promise<LearnerProfile | null> {
  const inputs = await loadReportInputs(db.reader, assessmentId, () => Promise.reject(new Error("the learner profile reads no comparison")));
  if (!inputs) return null;
  const a = inputs.assessment;
  const facts = learnerProfile({ placement: a.placement, answers: inputs.profileAnswers(), help: a.help, learning: await db.store.learning(a.childId) });
  if (!facts) return null;
  const owned = { assessmentId, parentId: a.parentId, childId: a.childId };
  const buildId = await db.store.save({ ...owned, profile: facts });
  if (!db.ai) return facts;
  let written;
  try {
    written = await writeProfileAi(db.ai, facts);
  } catch (e) {
    console.error("[workbook profile] learner AI failed", assessmentId, e instanceof Error ? e.message : String(e));
    return facts;
  }
  if (written.dropped.length) console.info("[workbook profile] learner AI parts dropped", assessmentId, JSON.stringify(written.dropped));
  if (Object.keys(written.ai).length === 0) return facts;
  const profile = { ...facts, ai: written.ai };
  return await db.store.saveAi({ ...owned, profile }, buildId) ? profile : facts;
}

/** Reads of the latest finished BC-scored test, and the two profile builds, for a new workbook plan. */
export interface WorkbookProfileSeams {
  latestFinishedBc(childId: string): Promise<{ assessmentId: string; schemaVersion: number | null; profile: unknown } | null>;
  rebuildLearner(assessmentId: string): Promise<LearnerProfile | null>;
  child: ChildProfileSeams;
}

/** Missing schema-1 additions need a rebuild too. A test without a facts round has no family results to add. */
function staleLearnerProfile(schemaVersion: number | null, value: unknown): boolean {
  const profile = value as { schemaVersion?: unknown; facts?: { byFamily?: unknown } | null } | null;
  return schemaVersion !== PROFILE_SCHEMA_VERSION || profile?.schemaVersion !== PROFILE_SCHEMA_VERSION
    || profile.facts === undefined || (profile.facts !== null && profile.facts.byFamily == null);
}

/** P2: called only when a run plans. A failed build or read must not give a child with a test a generic book. */
export async function prepareChildProfileForWorkbook(childId: string, seams: WorkbookProfileSeams): Promise<
  { ok: true; profile: Awaited<ReturnType<typeof readChildProfile>> } | { ok: false }
> {
  try {
    const latest = await seams.latestFinishedBc(childId);
    if (latest && staleLearnerProfile(latest.schemaVersion, latest.profile)) {
      if (!(await seams.rebuildLearner(latest.assessmentId))) return { ok: false };
    }
    const built = await rebuildChildProfileNow(childId, seams.child);
    if (latest && !built?.built) return { ok: false };
    const profile = await readChildProfile(seams.child.profiles, childId);
    // A stale row, or a build which lost its test, is not enough for this plan.
    if (latest && profile?.profile.assessment?.assessmentId !== latest.assessmentId) return { ok: false };
    return { ok: true, profile };
  } catch (e) {
    console.error("[workbook profile] preparation failed", childId, e instanceof Error ? e.message : String(e));
    return { ok: false };
  }
}

/** The same secret-key client and normal AI switches on the site and the Mac worker. No read or write until called. */
export function workbookProfileBuilder(admin: SupabaseClient<Database>, env: Record<string, string | undefined> = process.env) {
  const profiles = childProfileStore(admin);
  const tests = assessmentQuestionReader(admin);
  const workbooks = workbookStore(admin);
  const seams: WorkbookProfileSeams = {
    async latestFinishedBc(childId) {
      const tests = await admin.from("assessments").select("id").eq("child_id", childId).eq("status", "completed")
        .eq("placement->>scoredAgainst", "BC").order("completed_at", { ascending: false }).order("id").limit(1).maybeSingle();
      if (tests.error) throw new Error(tests.error.message);
      if (!tests.data) return null;
      const stored = await admin.from("learner_profiles").select("schema_version, profile").eq("assessment_id", tests.data.id).maybeSingle();
      if (stored.error) throw new Error(stored.error.message);
      return { assessmentId: tests.data.id, schemaVersion: stored.data?.schema_version ?? null, profile: stored.data?.profile ?? null };
    },
    rebuildLearner: (assessmentId) => rebuildWorkbookLearnerProfile(assessmentId, {
      reader: secretKeyReportReader(admin), store: learnerProfileStore(admin), ai: profileAiClient(env),
    }),
    child: {
      profiles, events: learningEventStore(admin), ai: childProfileAiClient(env),
      questions: { question: (ref) => ref.source === "workbook" ? workbooks.question(ref) : tests.question(ref) },
    },
  };
  return (childId: string) => prepareChildProfileForWorkbook(childId, seams);
}
