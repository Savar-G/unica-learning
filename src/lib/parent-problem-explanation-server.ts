import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { childPlanAccess } from "@/lib/plan-access";
import { markingAccess } from "@/lib/scan-marking-server";
import { parentExplanationStore } from "@/lib/parent-problem-explanation-store";
import { explanationAiClient } from "@/lib/parent-problem-explanation-ai";
import { explainParentProblem, type ExplanationRef } from "@/lib/parent-problem-explanation";

/**
 * The plan part of who may ask: the open plan of this photo's child (src/lib/plan-access.ts). Each caller checks it beside marking
 * admission (src/lib/scan-marking-access.ts). A plan does not open a sibling's photo, and it grants no marking: with no marks on the
 * page the feature refuses, and with the price row disabled it makes no AI call.
 */
/** True only when the photo is this parent's and its child's plan is closed (#710). An unknown or another family's photo, or a failed read, is false. */
export async function explanationPlanClosed(db: SupabaseClient<Database>, parent: string, photo: string): Promise<boolean> {
  const { data, error } = await db.from("scan_photos").select("child_id").eq("id", photo).eq("parent_id", parent).maybeSingle();
  if (error || !data) return false;
  const access = await childPlanAccess({ parentId: parent, childId: data.child_id }, { db });
  return !access.open;
}

export async function explanationPlanOpen(db: SupabaseClient<Database>, parent: string, photo: string): Promise<boolean> {
  const { data, error } = await db.from("scan_photos").select("child_id").eq("id", photo).eq("parent_id", parent).maybeSingle();
  if (error || !data) return false;
  return (await childPlanAccess({ parentId: parent, childId: data.child_id }, { db })).open;
}

export async function parentProblemExplanation(db: SupabaseClient<Database>, ref: ExplanationRef, sessionActive: () => Promise<boolean>, signal: AbortSignal) {
  // SCAN_PAGES_ENABLED opens nothing here. Explanations follow marking admission (D-236, D-300), or this photo's child's open plan.
  const active = async () => await sessionActive() && (await markingAccess(db, ref.parent, process.env, { photo: ref.photo }) || await explanationPlanOpen(db, ref.parent, ref.photo));
  return explainParentProblem(parentExplanationStore(db), ref, crypto.randomUUID(), explanationAiClient(), { active, signal });
}
