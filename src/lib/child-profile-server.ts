import "server-only";
import { childProfileFacts, readChildProfile, rebuildChildProfile, type ChildProfileSeams, type RebuildResult } from "@/lib/child-profile";
import { learnerProfile, type LearnerProfile } from "@/lib/assessment";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AiClient } from "@/lib/ai-client";
import type { Database } from "@/lib/database";
import { assessmentQuestionReader } from "@/lib/assessment-questions";
import { childProfileAiClient, type QuestionReader } from "@/lib/child-profile-ai";
import { childProfileStore } from "@/lib/child-profile-store";
import { learningEvents } from "@/lib/learning-events";
import { effectiveMarkingEvents } from "@/lib/scan-marking";
import { WORKBOOK_COUNTS_CALL_EVENTS } from "@/lib/workbook-call-policy";
import { learningEventStore } from "@/lib/learning-events-store";
import { SUPABASE_URL } from "@/lib/supabase-public";
import { workbookStore } from "@/lib/workbook-store";
import type { LearnerProfileStore } from "@/lib/learner-profile";
import { learnerProfileStore } from "@/lib/learner-profile-store";
import { profileAiClient, writeProfileAi } from "@/lib/learner-profile-ai";
import { secretKeyReportReader } from "@/lib/report-loading-server";
import { loadReportInputs, type ReportReader } from "@/lib/report-loading";

import { staleLearnerProfile, WORKBOOK_LEARNER_DERIVED_VERSION } from "@/lib/workbook-profile-freshness";
export { WORKBOOK_LEARNER_DERIVED_VERSION } from "@/lib/workbook-profile-freshness";

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
  const derived = learnerProfile({ placement: a.placement, answers: inputs.profileAnswers(), help: a.help, learning: await db.store.learning(a.childId) });
  if (!derived) return null;
  const facts = { ...derived, workbookDerivedVersion: WORKBOOK_LEARNER_DERIVED_VERSION };
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
  latestFinishedBc(childId: string): Promise<{ assessmentId: string; completedAt: string | null; schemaVersion: number | null; profile: unknown } | null>;
  rebuildLearner(assessmentId: string): Promise<LearnerProfile | null>;
  child: ChildProfileSeams;
}

/** P2: called only when a run plans. A failed build or read must not give a child with a test a generic book. */
export async function prepareChildProfileForWorkbook(childId: string, seams: WorkbookProfileSeams): Promise<
  { ok: true; profile: Awaited<ReturnType<typeof readChildProfile>> } | { ok: false }
> {
  try {
    const latest = await seams.latestFinishedBc(childId);
    if (latest && staleLearnerProfile(latest.schemaVersion, latest.profile)) {
      const rebuilt = await seams.rebuildLearner(latest.assessmentId);
      if (!rebuilt || staleLearnerProfile(rebuilt.schemaVersion, rebuilt)) return { ok: false };
    }
    const built = await rebuildChildProfileNow(childId, seams.child);
    const profile = await readChildProfile(seams.child.profiles, childId);
    // Recheck after both the build and the profile read. A test may have finished since the first read returned null.
    const after = await seams.latestFinishedBc(childId);
    if (after) {
      const assessment = profile?.profile.assessment;
      if (!built?.built || !assessment || staleLearnerProfile(assessment.profile.schemaVersion, assessment.profile)) return { ok: false };
      const later = assessment.completedAt !== null && after.completedAt !== null
        && Date.parse(assessment.completedAt) > Date.parse(after.completedAt);
      if (assessment.assessmentId !== after.assessmentId && !later) return { ok: false };
    }
    if (WORKBOOK_COUNTS_CALL_EVENTS || !profile) return { ok: true, profile };
    // Read a consistent source snapshot. Never save this workbook-only view.
    const before = await seams.child.profiles.current(childId);
    if (!before || before.revision !== profile.revision || before.builtAt !== profile.builtAt) return { ok: false };
    const raw = await learningEvents(seams.child.events).read(childId, { from: "2000-01-01T00:00:00.000Z", to: "9999-01-01T00:00:00.000Z" });
    if (!raw.some((event) => event.source === "call") && !profile.profile.standards.some((standard) => standard.events.sources.call > 0)) return { ok: true, profile };
    const source = await seams.child.profiles.inputs(childId);
    const marks = await seams.child.profiles.marks?.(childId);
    const events = marks ? effectiveMarkingEvents(raw, marks.items) : raw;
    const afterProfile = await seams.child.profiles.current(childId);
    const afterMarks = marks ? await seams.child.profiles.marks!(childId) : undefined;
    if (!source || afterProfile?.buildToken !== before.buildToken || (marks && marks.revision !== afterMarks?.revision)) return { ok: false };
    const nonCall = events.filter((event) => event.source !== "call");
    const facts = childProfileFacts({ ...source, events: nonCall });
    const nonCallIds = new Set([...raw, ...nonCall].filter((event) => event.source !== "call").map((event) => event.id));
    const ai = profile.profile.ai;
    const filteredAi = ai ? { ...ai, findings: ai.findings.filter((finding) =>
      finding.events.length > 0 && finding.events.every((id) => nonCallIds.has(id))) } : null;
    return { ok: true, profile: facts ? { ...profile, profile: { ...facts, ai: filteredAi } } : null };
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
      const tests = await admin.from("assessments").select("id, completed_at").eq("child_id", childId).eq("status", "completed")
        .eq("placement->>scoredAgainst", "BC").order("completed_at", { ascending: false }).order("id").limit(1).maybeSingle();
      if (tests.error) throw new Error(tests.error.message);
      if (!tests.data) return null;
      const stored = await admin.from("learner_profiles").select("schema_version, profile").eq("assessment_id", tests.data.id).maybeSingle();
      if (stored.error) throw new Error(stored.error.message);
      return { assessmentId: tests.data.id, completedAt: tests.data.completed_at, schemaVersion: stored.data?.schema_version ?? null, profile: stored.data?.profile ?? null };
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
