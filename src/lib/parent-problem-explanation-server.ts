import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { markingAccess } from "@/lib/scan-marking-server";
import { parentExplanationStore } from "@/lib/parent-problem-explanation-store";
import { explanationAiClient } from "@/lib/parent-problem-explanation-ai";
import { explainParentProblem, type ExplanationRef } from "@/lib/parent-problem-explanation";

export async function parentProblemExplanation(db: SupabaseClient<Database>, ref: ExplanationRef, sessionActive: () => Promise<boolean>, signal: AbortSignal) {
  // Explanations follow marking admission (D-236, D-300): test families and admins, and in families mode a child whose plan is running.
  const active = async () => await sessionActive() && await markingAccess(db, ref.parent, process.env, { photo: ref.photo });
  return explainParentProblem(parentExplanationStore(db), ref, crypto.randomUUID(), explanationAiClient(), { active, signal });
}
