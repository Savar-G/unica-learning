import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { goalsFromRow, needsGoals, type ChildGoals } from "@/lib/child-goals";

type Db = SupabaseClient<Database>;

export interface GoalsChild {
  id: string;
  firstName: string;
  answers: ReturnType<typeof goalsFromRow>;
}

/**
 * The parent's children that must answer the goals before the test (D-325), oldest first, read with the parent's own
 * session. A failed read returns an empty list: the goals never stop a test because the database did not answer.
 */
export async function childrenNeedingGoals(db: Db, parent: string, onlyChild?: string): Promise<GoalsChild[]> {
  // The parent filter matters: an admin's session reads every family's rows.
  let query = db.from("children").select("id, first_name, learning_goal, math_feeling, math_help").eq("parent_id", parent).order("created_at").order("id");
  if (onlyChild) query = query.eq("id", onlyChild);
  const c = await query;
  if (c.error) {
    console.error("[child-goals] read failed", c.error.message);
    return [];
  }
  const kids = c.data ?? [];
  if (kids.length === 0) return [];
  const t = await db.from("assessments").select("child_id").in("child_id", kids.map((k) => k.id));
  if (t.error) {
    console.error("[child-goals] read failed", t.error.message);
    return [];
  }
  const tested = new Set((t.data ?? []).map((r) => r.child_id));
  return kids
    .filter((k) => needsGoals(k, tested.has(k.id)))
    .map((k) => ({ id: k.id, firstName: k.first_name, answers: goalsFromRow(k) }));
}

/** Whether this one child must answer the goals before the test. A failed read answers false (see above). */
export async function childNeedsGoals(db: Db, parent: string, childId: string): Promise<boolean> {
  return (await childrenNeedingGoals(db, parent, childId)).length > 0;
}

/**
 * Saves one child's three answers with the secret key, only on the parent's own child (the parent filter); the family
 * write fence on public.children refuses a family being deleted. False when nothing was saved. A second save replaces
 * the answers.
 */
export async function saveChildGoals(admin: Db, parent: string, childId: string, goals: ChildGoals): Promise<boolean> {
  const { data, error } = await admin
    .from("children")
    .update({ learning_goal: goals.goal, math_feeling: goals.feeling, math_help: goals.help })
    .eq("id", childId)
    .eq("parent_id", parent)
    .select("id");
  if (error) console.error("[child-goals] save failed", error.message);
  return !error && (data ?? []).length === 1;
}
