// The child's profile (#303, spec #295): the profile part of the learning record. One current profile per child,
// versioned (CHILD_PROFILE_SCHEMA_VERSION, kept beside the JSON), built by code from the child's latest assessment
// profile (src/lib/assessment/profile.ts, one per finished test) plus every learning event of the child
// (src/lib/learning-events.ts). The workbook planner (#308), the generator (#311) and Maya (#323) read it through
// readChildProfile, never the raw events. Server written; admins read; parents do not.
//
// The facts, by BC standard:
// - The tally of a standard is the assessment profile's tally (right answers of the scored answers) plus one answer for
//   each counted event: "right" adds a right answer; "right_with_help", "wrong" and "blank" add an answer that is not
//   right. So a standard solved only with help is never secure (#295 story 12). The status and its certainty are the
//   assessment core's area rule (strandStatus, strandCertainty) on the combined tally.
// - Events from every source (call, marking, assessment) add to the same tally; each standard keeps its counts by
//   source and result, the hints, the stuck steps and the mistakes.
// - No double counting: the assessment profile already counts its own test's answers, so an event from the source
//   "assessment" on a question of that test (the backfill of its answers) is left out. Every other event counts: an
//   older test's answers (not in the profile), and a call or a marked page on one of the test's questions (help is not
//   in the profile). With no assessment profile (no BC test, or a stored profile at another schema version), every
//   event counts. The counts of both are in `events`.
// - A standard above the child's school grade is never "not yet secure" (D-084: never invent a weakness).
// - Evidence: each standard links to the assessment profile's test (when the test asked it) and to the ids of its
//   counted events, oldest first.
// The parent's answers on the learning card are read from the child, so a card change counts without a new test.
//
// The build is compare and set: the store gives each stored profile a revision (1, 2, ...). A rebuild reads the
// revision first, then its inputs, and stores only while the revision is the one it read. A rebuild that lost the
// race reads again and builds again, so a build from older inputs never replaces one from newer inputs. #304 adds AI
// findings with the same rule. The seams: the profile store (ChildProfileStore: Supabase in
// src/lib/child-profile-store.ts, in memory in src/lib/child-profile-memory.ts) and the events' store.
// Pure TypeScript: no Next.js, React, network, database or clock.
import {
  BC_SKILL_MAP,
  REPORTED_STRAND,
  curriculumOrder,
  storedProfile,
  strandCertainty,
  strandStatus,
  type Certainty,
  type Grade,
  type LearnerProfile,
  type Level,
  type ProfileLearning,
  type ReportedStrand,
  type StrandStatus,
} from "@/lib/assessment";
import { learningEvents, type EventSource, type LearningEvent, type LearningEventStore } from "@/lib/learning-events";
import type { Interest, LearningGoal, LearningStyle, MathFeeling, WeeklyTime } from "@/lib/learning-style";

/** The version of the child profile's JSON. A change that a reader of stored profiles must know about adds one. */
export const CHILD_PROFILE_SCHEMA_VERSION = 1;

/** What the counted events say about one standard. */
export interface StandardEvents {
  right: number;
  rightWithHelp: number;
  wrong: number;
  blank: number;
  /** Hints given, over the events. */
  hints: number;
  /** The worked step ids where the child got stuck, each once, oldest first. */
  stuckSteps: string[];
  /** The cause ids of the known wrong answers the child gave, each once, oldest first. */
  mistakes: string[];
  /** The counted events by source. */
  sources: Record<EventSource, number>;
  /** When the newest counted event happened; null when none. */
  lastAt: string | null;
}

/** One BC standard in the child's profile: the assessment profile's tally and the counted events, combined. */
export interface ChildStandard {
  code: string;
  /** The standard's BC text, from the skill map. */
  text: string;
  /** The grade where BC teaches it. */
  grade: Level;
  strand: ReportedStrand;
  /** Taught after the child's school grade: not a weakness (D-084). */
  aboveGrade: boolean;
  /** Right answers (with no help), and all answers, of the test and the events together. */
  correct: number;
  total: number;
  status: StrandStatus;
  certainty: Certainty;
  /** The assessment profile's tally of the standard; null when its test did not ask it. */
  assessment: { correct: number; total: number; status: StrandStatus } | null;
  events: StandardEvents;
  /** The test of the assessment profile (when it asked the standard) and the counted events' ids, oldest first. */
  evidence: { assessmentId: string | null; events: string[] };
}

/** The child's current profile. Never the child's name, the family or free text. */
export interface ChildLearnerProfile {
  schemaVersion: typeof CHILD_PROFILE_SCHEMA_VERSION;
  /** The child's school grade when the profile was built. */
  grade: Grade;
  /** The assessment profile the build started from, as it was stored; null when the child has none. */
  assessment: { assessmentId: string; completedAt: string | null; buildId: string | null; profile: LearnerProfile } | null;
  /** Each standard the test or a counted event touched, in curriculum order. */
  standards: ChildStandard[];
  /** The secure standards' codes, in curriculum order. */
  secure: string[];
  /** The standards at or below the school grade that are not secure: needs attention first, then developing; each in curriculum order. */
  notYetSecure: string[];
  /** How the child likes to learn and what interests them, from the learning card. Empty when not answered. */
  preferences: { styles: LearningStyle[]; interests: Interest[] };
  /** The parent's answers on the learning card. Null is no answer. */
  parent: { feeling: MathFeeling | null; goal: LearningGoal | null; weeklyTime: WeeklyTime | null };
  /** The child's events: those counted, and those left out because the assessment profile already counts them. */
  events: { counted: number; inAssessmentProfile: number; lastAt: string | null };
}

/** The stored assessment profile the build starts from: public.learner_profiles, as stored. */
export interface BaseAssessment {
  assessmentId: string;
  /** When the test finished. */
  completedAt: string | null;
  /** The stored profile's build id (`buildId` in its JSON); null when it has none. */
  buildId: string | null;
  /** The stored JSON, at any schema version. */
  profile: unknown;
}

/** What the facts are built from. */
export interface ChildProfileInput {
  /** The child's school grade. */
  grade: Grade;
  /** The parent's answers on the learning card; null when none. */
  learning: ProfileLearning | null;
  /** The child's latest stored assessment profile; null when none. */
  assessment: BaseAssessment | null;
  /** Every learning event of the child, oldest first. */
  events: readonly LearningEvent[];
}

const STANDARDS = new Map(BC_SKILL_MAP.standards.map((s) => [s.code, s]));
const SEVERITY: Record<StrandStatus, number> = { "needs-attention": 0, developing: 1, secure: 2 };

const newest = (times: readonly string[]) => times.reduce<string | null>((last, t) => (last === null || t > last ? t : last), null);

/**
 * The child's profile facts (see the header for the rules), or null when there is nothing to build from: no
 * assessment profile this version reads and no event.
 */
export function childProfileFacts(input: ChildProfileInput): ChildLearnerProfile | null {
  const facts = buildFacts(input);
  return facts.assessment || facts.events.counted > 0 ? facts : null;
}

/** The facts, also when there is nothing to build from (no standard): a rebuild stores that over an older profile. */
function buildFacts(input: ChildProfileInput): ChildLearnerProfile {
  const base = input.assessment ? storedProfile(input.assessment.profile) : null;
  const baseId = base ? input.assessment!.assessmentId : null;
  const inProfile = (e: LearningEvent) => e.source === "assessment" && e.question.source === "assessment" && e.question.assessmentId === baseId;
  const counted = input.events.filter((e) => !inProfile(e));

  const fromTest = new Map((base?.standards ?? []).map((s) => [s.code, s]));
  const codes = [...new Set([...fromTest.keys(), ...counted.map((e) => e.skill.standard)])].filter((code) => STANDARDS.has(code));
  const standards = codes.map((code): ChildStandard => {
    const mine = counted.filter((e) => e.skill.standard === code);
    const known = STANDARDS.get(code)!;
    const tested = fromTest.get(code);
    const count = (result: LearningEvent["result"]) => mine.filter((e) => e.result === result).length;
    const source = (s: EventSource) => mine.filter((e) => e.source === s).length;
    const events: StandardEvents = {
      right: count("right"),
      rightWithHelp: count("right_with_help"),
      wrong: count("wrong"),
      blank: count("blank"),
      hints: mine.reduce((n, e) => n + e.hints, 0),
      stuckSteps: [...new Set(mine.flatMap((e) => e.stuckStep ?? []))],
      mistakes: [...new Set(mine.flatMap((e) => e.mistake ?? []))],
      sources: { call: source("call"), marking: source("marking"), assessment: source("assessment") },
      lastAt: newest(mine.map((e) => e.occurredAt)),
    };
    // Only a right answer with no help is right: right with help, wrong and blank are answers that are not.
    const correct = (tested?.correct ?? 0) + events.right;
    const total = (tested?.total ?? 0) + mine.length;
    return {
      code,
      text: known.text,
      grade: known.grade,
      strand: REPORTED_STRAND[known.strand],
      aboveGrade: known.grade > input.grade,
      correct,
      total,
      status: strandStatus(correct, total),
      certainty: strandCertainty(correct, total),
      assessment: tested ? { correct: tested.correct, total: tested.total, status: tested.status } : null,
      events,
      evidence: { assessmentId: tested ? baseId : null, events: mine.map((e) => e.id) },
    };
  }).sort(curriculumOrder);

  const { learning } = input;
  return {
    schemaVersion: CHILD_PROFILE_SCHEMA_VERSION,
    grade: input.grade,
    assessment: base ? { assessmentId: baseId!, completedAt: input.assessment!.completedAt, buildId: input.assessment!.buildId, profile: base } : null,
    standards,
    secure: standards.filter((s) => s.status === "secure").map((s) => s.code),
    notYetSecure: standards
      .filter((s) => !s.aboveGrade && s.status !== "secure")
      .sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || curriculumOrder(a, b))
      .map((s) => s.code),
    // Field by field, so the free text never comes along.
    preferences: { styles: [...(learning?.styles ?? [])], interests: [...(learning?.interests ?? [])] },
    parent: { feeling: learning?.feeling ?? null, goal: learning?.goal ?? null, weeklyTime: learning?.weeklyTime ?? null },
    events: { counted: counted.length, inAssessmentProfile: input.events.length - counted.length, lastAt: newest(counted.map((e) => e.occurredAt)) },
  };
}

// The store seam, the read and the rebuild

/** A stored child profile, as the store gives it: its revision, when it was built, and its JSON at any schema version. */
export interface StoredChildProfile {
  revision: number;
  builtAt: string;
  schemaVersion: number;
  profile: unknown;
}

/** The child's inputs other than the events. */
export interface ChildProfileSource {
  parentId: string;
  grade: Grade;
  learning: ProfileLearning | null;
  assessment: BaseAssessment | null;
}

/** A profile to store, for its family and child; `assessmentId` is the test of its assessment profile. */
export interface NewChildProfile {
  childId: string;
  parentId: string;
  assessmentId: string | null;
  profile: ChildLearnerProfile;
}

/** The profile's reads and writes. A database error throws; a missing row is null. */
export interface ChildProfileStore {
  /** The child's stored profile; null when none is stored. */
  current(childId: string): Promise<StoredChildProfile | null>;
  /**
   * The child's parent, school grade and learning card answers, and the stored assessment profile of the child's
   * latest finished test that has one; null when there is no such child.
   */
  inputs(childId: string): Promise<ChildProfileSource | null>;
  /**
   * Stores the profile as the next revision, only while the stored revision is `expected` (0: none stored): compare and
   * set. "changed" when the stored revision is another; `refused` when the family's deletion is requested or the child
   * is not under that parent (nothing is stored).
   */
  save(profile: NewChildProfile, expected: number): Promise<{ revision: number } | "changed" | { refused: string }>;
}

/** The seams of a rebuild: the profile store and the learning events' store. */
export interface ChildProfileSeams {
  profiles: ChildProfileStore;
  events: LearningEventStore;
}

export type RebuildResult =
  | { built: true; revision: number; profile: ChildLearnerProfile }
  /**
   * no_child: no such child. nothing_to_build: no assessment profile, no event and no stored profile (a stored one is
   * replaced by an empty build). refused: the family write fence. busy: other builds stored first, every try.
   */
  | { built: false; reason: "no_child" | "nothing_to_build" | "busy" }
  | { built: false; reason: "refused"; detail: string };

/** A rebuild tries this many times when other builds store first. */
export const REBUILD_TRIES = 3;
/** Every event of a child: the events' read needs a range. */
const ALL_TIME = { from: "2000-01-01T00:00:00.000Z", to: "9999-01-01T00:00:00.000Z" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The stored JSON as this version's profile; null when it was written at another schema version. */
export function storedChildProfile(value: unknown): ChildLearnerProfile | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return (value as { schemaVersion?: unknown }).schemaVersion === CHILD_PROFILE_SCHEMA_VERSION ? (value as ChildLearnerProfile) : null;
}

/**
 * The one read of the child's current profile, for the workbook planner, the generator and Maya. Null when none is
 * stored, or it was stored at another schema version (the next rebuild replaces it).
 */
export async function readChildProfile(store: ChildProfileStore, childId: string): Promise<{ revision: number; builtAt: string; profile: ChildLearnerProfile } | null> {
  if (!UUID.test(childId)) return null;
  const stored = await store.current(childId.toLowerCase());
  const profile = stored && storedChildProfile(stored.profile);
  return profile ? { revision: stored!.revision, builtAt: stored!.builtAt, profile } : null;
}

/**
 * The one rebuild entry point: builds the child's profile from what is stored now and stores it as the next revision
 * (compare and set; see the header). Called after a finished test's report job and after a learning card change; later
 * after calls and marked pages. A database error throws.
 */
export async function rebuildChildProfile(childId: string, { profiles, events }: ChildProfileSeams): Promise<RebuildResult> {
  if (!UUID.test(childId)) return { built: false, reason: "no_child" };
  const id = childId.toLowerCase();
  for (let tries = 0; tries < REBUILD_TRIES; tries++) {
    // The revision first: a build stored after this read makes the save below fail, so these inputs are never stale.
    const expected = (await profiles.current(id))?.revision ?? 0;
    const source = await profiles.inputs(id);
    if (!source) return { built: false, reason: "no_child" };
    const profile = buildFacts({ ...source, events: await learningEvents(events).read(id, ALL_TIME) });
    // With nothing to build from, a stored profile is still replaced: its inputs are gone (a test or events deleted).
    if (!profile.assessment && profile.events.counted === 0 && expected === 0) return { built: false, reason: "nothing_to_build" };
    const saved = await profiles.save({ childId: id, parentId: source.parentId, assessmentId: profile.assessment?.assessmentId ?? null, profile }, expected);
    if (saved === "changed") continue;
    if ("refused" in saved) return { built: false, reason: "refused", detail: saved.refused };
    return { built: true, revision: saved.revision, profile };
  }
  return { built: false, reason: "busy" };
}
