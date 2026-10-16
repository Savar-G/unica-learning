import "server-only";
import { learnerProfile, type LearnerProfile, type ProfileLearning } from "@/lib/assessment";
import { loadReportInputs, type ReportInputs, type ReportReader } from "@/lib/report-loading";
import { secretKeyReportReader } from "@/lib/report-loading-server";
import { adminClient } from "@/lib/supabase-auth";
import { learnerProfileStore } from "@/lib/learner-profile-store";

// The learner profile's build (#196, spec #181, D-115). The assessment core writes the facts (learnerProfile, in
// src/lib/assessment/profile.ts); this module gives it the finished test and the parent's answers on the learning
// card, and stores the profile: one per test, in public.learner_profiles (server only; admins read). Built:
//   - by the report job after finish, from the report's own inputs (storeLearnerProfile), and again on each later run
//     of the job: an extra round (#190) runs the job again when it finishes;
//   - on its own for one test (rebuildLearnerProfile), for a step that changes the test without the job;
//   - for the child's latest finished test when the parent answers the learning card (rebuildLatestProfile): the card
//     is on the report, so it is answered after the first build.
// A build replaces the stored profile. Not built for a test not scored against BC. The seam: the profile store
// (src/lib/learner-profile-store.ts), Supabase with the secret key; tests give src/lib/learner-profile-memory.ts.

/** A profile to store: the facts of one test, for its family and child. */
export interface NewProfile {
  assessmentId: string;
  parentId: string;
  childId: string;
  profile: LearnerProfile;
}

/** The profile's reads and writes. A database error throws; a missing row is null. */
export interface LearnerProfileStore {
  /** The parent's answers on the learning card (#126, #195) for the child; null when none, or no child row. */
  learning(childId: string): Promise<ProfileLearning | null>;
  /** The id of the child's latest finished test; null when the child has none. */
  latestFinished(childId: string): Promise<string | null>;
  /** Stores the test's profile, in place of one built before: one profile per test. */
  save(profile: NewProfile): Promise<void>;
}

/**
 * Builds the profile of a finished test from its report inputs and the child's learning answers, and stores it.
 * Returns it; null when the test was not scored against BC (nothing is stored). A store error throws.
 */
export async function storeLearnerProfile(store: LearnerProfileStore, inputs: Pick<ReportInputs, "assessment" | "profileAnswers">): Promise<LearnerProfile | null> {
  const { assessment: a } = inputs;
  const profile = learnerProfile({ placement: a.placement, answers: inputs.profileAnswers(), help: a.help, learning: await store.learning(a.childId) });
  if (!profile) return null;
  await store.save({ assessmentId: a.id, parentId: a.parentId, childId: a.childId, profile });
  return profile;
}

/** The seams of a build on its own. Each one left out is Supabase with the secret key. */
export interface RebuildOptions {
  reader?: ReportReader;
  store?: LearnerProfileStore;
}

/** The given seams; the missing ones with the secret key. Null without the key. */
function seams({ reader, store }: RebuildOptions) {
  if (reader && store) return { reader, store };
  const admin = adminClient();
  if (!admin) return null;
  return { reader: reader ?? secretKeyReportReader(admin), store: store ?? learnerProfileStore(admin) };
}

// The profile does not use the comparison: the report inputs never ask for it here.
const noComparison = () => Promise.reject(new Error("the learner profile reads no comparison"));

/**
 * Builds the profile of one test again, from the stored test as it is now (#190 can call it after an extra round).
 * Null when the test is not finished, not scored against BC, or there is no secret key. A database error throws.
 */
export async function rebuildLearnerProfile(assessmentId: string, options: RebuildOptions = {}): Promise<LearnerProfile | null> {
  const db = seams(options);
  if (!db) return null;
  const inputs = await loadReportInputs(db.reader, assessmentId, noComparison);
  return inputs ? storeLearnerProfile(db.store, inputs) : null;
}

/**
 * After the parent answers the learning card: the profile of the child's latest finished test, built again with the
 * answers. Null when the child has no finished test (or as rebuildLearnerProfile). Never throws: a failure is logged,
 * and the next build of the test's profile carries the answers.
 */
export async function rebuildLatestProfile(childId: string, options: RebuildOptions = {}): Promise<LearnerProfile | null> {
  const db = seams(options);
  if (!db) return null;
  try {
    const latest = await db.store.latestFinished(childId);
    return latest ? await rebuildLearnerProfile(latest, db) : null;
  } catch (e) {
    console.error("[profile] rebuild failed", childId, e instanceof Error ? e.message : String(e));
    return null;
  }
}
