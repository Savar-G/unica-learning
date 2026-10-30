import "server-only";
import { rebuildChildProfile, type ChildProfileSeams, type RebuildResult } from "@/lib/child-profile";
import { childProfileStore } from "@/lib/child-profile-store";
import { learningEventStore } from "@/lib/learning-events-store";
import { adminClient } from "@/lib/supabase-auth";

// The child profile's rebuild (src/lib/child-profile.ts, #303) on the server, with the secret key. The report job
// calls it last, after a finished test's profile and its AI parts are stored; the learning card's route calls it after
// the test's profile is built again with the new answers. Later, the steps that write call and marking events call it.

/**
 * Rebuilds the child's profile. Never throws: a failure is logged, and the next rebuild carries what this one missed.
 * Null without the secret key or on a failure. `seams`: tests give the in-memory ones (src/lib/child-profile-memory.ts).
 */
export async function rebuildChildProfileNow(childId: string, seams?: ChildProfileSeams): Promise<RebuildResult | null> {
  let db = seams;
  if (!db) {
    const admin = adminClient();
    if (!admin) return null;
    db = { profiles: childProfileStore(admin), events: learningEventStore(admin) };
  }
  try {
    const result = await rebuildChildProfile(childId, db);
    if (!result.built && result.reason !== "nothing_to_build") console.info("[child profile] not built", childId, JSON.stringify(result));
    return result;
  } catch (e) {
    console.error("[child profile] rebuild failed", childId, e instanceof Error ? e.message : String(e));
    return null;
  }
}
