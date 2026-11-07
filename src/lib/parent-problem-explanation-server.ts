import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { markingAccess } from "@/lib/scan-marking-server";
import { parentExplanationStore } from "@/lib/parent-problem-explanation-store";
import { explanationAiClient } from "@/lib/parent-problem-explanation-ai";
import { explainParentProblem, type ExplanationRef } from "@/lib/parent-problem-explanation";

export async function parentProblemExplanation(db: SupabaseClient<Database>, ref: ExplanationRef, sessionActive: () => Promise<boolean>, signal: AbortSignal) {
  // D236 stays closed to real families even if the broad scan release is enabled later.
  const active = async () => await sessionActive() && await markingAccess(db, ref.parent);
  return explainParentProblem(parentExplanationStore(db), ref, crypto.randomUUID(), explanationAiClient(), { active, signal });
}
