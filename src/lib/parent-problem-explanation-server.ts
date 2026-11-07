import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { childPlanAccess } from "@/lib/plan-access";
import { markingAccess } from "@/lib/scan-marking-server";
import { parentExplanationStore } from "@/lib/parent-problem-explanation-store";
import { explanationAiClient } from "@/lib/parent-problem-explanation-ai";
import { explainParentProblem, type ExplanationRef } from "@/lib/parent-problem-explanation";

/**
 * Who may ask: marking admission for this photo (src/lib/scan-marking-access.ts), or the open plan of this photo's child
 * (src/lib/plan-access.ts). A plan does not open a sibling's photo, and it grants no marking: with no marks on the page the
 * feature refuses, and with the price row disabled it makes no AI call.
 */
export async function explanationAccess(db: SupabaseClient<Database>, parent: string, photo: string): Promise<boolean> {
  if (await markingAccess(db, parent, process.env, { photo })) return true;
  const { data, error } = await db.from("scan_photos").select("child_id").eq("id", photo).eq("parent_id", parent).maybeSingle();
  if (error || !data) return false;
  return (await childPlanAccess({ parentId: parent, childId: data.child_id }, { db })).open;
}

export async function parentProblemExplanation(db: SupabaseClient<Database>, ref: ExplanationRef, sessionActive: () => Promise<boolean>, signal: AbortSignal) {
  // SCAN_PAGES_ENABLED opens nothing here. Only the gate above does: marking admission (D-236, D-300), or this photo's child's open plan.
  const active = async () => await sessionActive() && await explanationAccess(db, ref.parent, ref.photo);
  return explainParentProblem(parentExplanationStore(db), ref, crypto.randomUUID(), explanationAiClient(), { active, signal });
}
