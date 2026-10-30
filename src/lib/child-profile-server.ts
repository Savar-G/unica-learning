import "server-only";
import { rebuildChildProfile, type ChildProfileSeams, type RebuildResult } from "@/lib/child-profile";
import { assessmentQuestionReader } from "@/lib/assessment-questions";
import { childProfileAiClient, type QuestionReader } from "@/lib/child-profile-ai";
import { childProfileStore } from "@/lib/child-profile-store";
import { learningEventStore } from "@/lib/learning-events-store";
import { adminClient } from "@/lib/supabase-auth";
import { workbookStore } from "@/lib/workbook-store";

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
    const admin = adminClient();
    if (!admin) return null;
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
