import "server-only";
import type { AiClient } from "@/lib/ai-client";
import { learnerProfile, type LearnerProfile, type ProfileLearning } from "@/lib/assessment";
import { PROFILE_AI_MS, profileAiClient, writeProfileAi } from "@/lib/learner-profile-ai";
import { loadReportInputs, type ReportInputs, type ReportReader } from "@/lib/report-loading";
import { secretKeyReportReader } from "@/lib/report-loading-server";
import { adminClient } from "@/lib/supabase-auth";
import { learnerProfileStore } from "@/lib/learner-profile-store";

// The learner profile's build (#196, spec #181, D-115). The assessment core writes the facts (learnerProfile, in
// src/lib/assessment/profile.ts); this module gives it the finished test and the parent's answers on the learning
// card, and stores the profile: one per test, in public.learner_profiles (server only; admins read). Built:
//   - by the report job after finish, from the report's own inputs (the facts before the report's emails, the AI parts
//     after them), and again on each later run of the job: an extra round (#190) runs the job again when it finishes;
//   - on its own for one test (rebuildLearnerProfile), for a step that changes the test without the job;
//   - for the child's latest finished test when the parent answers the learning card (rebuildLatestProfile): the card
//     is on the report, so it is answered after the first build.
// A build replaces the stored profile. Not built for a test not scored against BC. The seam: the profile store
// (src/lib/learner-profile-store.ts), Supabase with the secret key; tests give src/lib/learner-profile-memory.ts.
// The AI parts (#197, src/lib/learner-profile-ai.ts): each build stores the facts first (storeProfileFacts), then, when
// the AI client is on, asks the AI for its parts and stores the profile again with the parts that pass the checks
// (addProfileAi). When the AI is off, fails, takes too long or writes nothing that passes, the stored profile has the
// facts only: a build never keeps the AI parts of an earlier build, which were written from other facts. The second
// save is a compare and set: the store gives each build an id, and the AI parts are stored only while the stored
// profile is still their build's. A build stored while the AI wrote (the learning card's rebuild, or another run of the
// job) holds newer facts, so the late parts, and the older facts they came with, are not stored over it.

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
  /**
   * Stores the test's profile, in place of one built before: one profile per test. Returns the build's id, new for each
   * save and kept with the stored profile (its `buildId`).
   */
  save(profile: NewProfile): Promise<string>;
  /**
   * Stores the test's profile again, with its AI parts, only while the stored profile is the build `buildId` (compare
   * and set): the build id stays. False when nothing was stored: a later save replaced the build, or there is no row.
   */
  saveAi(profile: NewProfile, buildId: string): Promise<boolean>;
}

/** A build whose facts are stored: its AI parts may follow (addProfileAi). */
export interface ProfileBuild extends NewProfile {
  /** The id the store gave the build's facts. */
  buildId: string;
}

/** The AI parts' seam of a build. */
export interface ProfileAiOptions {
  /** The AI client; null when the AI is off. */
  ai?: AiClient | null;
  /** The AI parts' time limit (PROFILE_AI_MS). */
  aiMs?: number;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Builds the profile of a finished test from its report inputs and the child's learning answers, and stores it: the
 * facts. Null when the test was not scored against BC (nothing is stored). A store error throws.
 */
export async function storeProfileFacts(
  store: LearnerProfileStore,
  inputs: Pick<ReportInputs, "assessment" | "profileAnswers">,
): Promise<ProfileBuild | null> {
  const { assessment: a } = inputs;
  const profile = learnerProfile({ placement: a.placement, answers: inputs.profileAnswers(), help: a.help, learning: await store.learning(a.childId) });
  if (!profile) return null;
  const owned = { assessmentId: a.id, parentId: a.parentId, childId: a.childId, profile };
  return { ...owned, buildId: await store.save(owned) };
}

/**
 * With an AI client, asks for the AI parts of a build whose facts are stored, and stores the profile again with the
 * parts that pass the checks, while the stored profile is still this build's. Returns the build's profile with the AI
 * parts when they were stored, else its facts. An AI failure is logged, and the facts stay stored; a store error throws.
 */
export async function addProfileAi(store: LearnerProfileStore, build: ProfileBuild, { ai = null, aiMs = PROFILE_AI_MS }: ProfileAiOptions = {}): Promise<LearnerProfile> {
  const { buildId, profile: facts, ...owner } = build;
  if (!ai) return facts;
  let written;
  try {
    written = await writeProfileAi(ai, facts, aiMs);
  } catch (e) {
    console.error("[profile] AI failed", owner.assessmentId, message(e));
    return facts;
  }
  // What the checks dropped: part, standard code and rule, never the AI's text.
  if (written.dropped.length) console.info("[profile] AI parts dropped", owner.assessmentId, JSON.stringify(written.dropped));
  if (Object.keys(written.ai).length === 0) return facts;
  const profile: LearnerProfile = { ...facts, ai: written.ai };
  if (await store.saveAi({ ...owner, profile }, buildId)) return profile;
  // The parts were written from this build's facts; the stored profile now has a later build's.
  console.info("[profile] AI parts not stored: a later build replaced the profile", owner.assessmentId);
  return facts;
}

/**
 * Builds and stores the profile of a finished test (storeProfileFacts), then adds its AI parts (addProfileAi). Returns
 * the profile as this build stored it; null when the test was not scored against BC. A store error throws.
 */
export async function storeLearnerProfile(
  store: LearnerProfileStore,
  inputs: Pick<ReportInputs, "assessment" | "profileAnswers">,
  options: ProfileAiOptions = {},
): Promise<LearnerProfile | null> {
  const build = await storeProfileFacts(store, inputs);
  return build && addProfileAi(store, build, options);
}

/** The seams of a build on its own. Each database seam left out is Supabase with the secret key; the AI left out is profileAiClient. */
export interface RebuildOptions extends ProfileAiOptions {
  reader?: ReportReader;
  store?: LearnerProfileStore;
}

/** The given seams; the missing ones with the secret key and the AI client's switch. Null without the key. */
function seams({ reader, store, ai, aiMs }: RebuildOptions) {
  const withAi = { ai: ai === undefined ? profileAiClient() : ai, aiMs };
  if (reader && store) return { reader, store, ...withAi };
  const admin = adminClient();
  if (!admin) return null;
  return { reader: reader ?? secretKeyReportReader(admin), store: store ?? learnerProfileStore(admin), ...withAi };
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
  return inputs ? storeLearnerProfile(db.store, inputs, db) : null;
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
