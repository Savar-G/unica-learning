// #472 Book 1 planning recovery: the verifier for a run frame stored before frames kept their planning input. It runs
// the pinned original planner (the commit the frame names as its build) on the immutable source records, and either
// returns the exact PlanInput the original planWorkbook call received, with its hash, or refuses with a reason.
//
// Contract:
// - Inputs are only the frame (as stored, immutable), the run's number, and the frozen profile revision the frame
//   names, with its build time. The report and device are the frame's own frozen copy (plan.personal.report). Today's
//   profile is never read; a profile built after the frame, or of another revision, is refused.
// - The engine is the pinned commit's own code, loaded by src/lib/workbook-book1-pinned.ts. Its pin must equal the
//   frame's build, and the engine reports the tree and placement blob it ran.
// - The pinned planner must call planWorkbook exactly once, and its plan must equal the frame's plan in every field but
//   the capacity fields (`days`, `extraPractice`), which the job's capacity step adds after planning to an approved-v1
//   frame. A legacy-policy frame must match in every field.
// - The input must keep the first-book starting-mastery policy (empty passed map, workbook 1, nothing carried).
//
// Pure: the engine is a port. No network, database, clock or randomness here.
import "server-only";
import { isDeepStrictEqual as same } from "node:util";
import type { RunFrame } from "./workbook-job";
import type { PlanInput } from "./workbook-plan";
import { jsonHash, masteryPolicyProblem, stored, type Book1PlanningProof } from "./workbook-book1-baseline";

export const CAPACITY_FIELDS = ["days", "extraPractice"] as const;

export interface PinnedPlanningEngine {
  pin: string;
  tree: string;
  placementBlob: string;
  curriculumVersion(key: string): string | null;
  /** Runs the pinned public planNextWorkbook once, recording every planWorkbook input it made. */
  plan(o: { curriculumKey: string; grade: number; profile: unknown; report?: { howWeHelp: unknown; minutes: unknown }; device?: unknown;
    workbooks: { number: number; levels: number[] }[]; number: number }): { profileReadable: boolean; calls: PlanInput[]; result: { ok: boolean; plan?: unknown } };
}
export interface Book1RecoverySources {
  version: 1;
  run: { id: string; number: number };
  frame: { reference: string; createdAt: string; value: RunFrame };
  /** The frozen profile revision the frame names, or null when the frame names none. */
  profile: null | { reference: string; revision: number; builtAt: string; value: unknown };
}
export type Book1RecoveryRefusal = "engine-unavailable" | "build-unknown" | "build-mismatch" | "invalid-sources" | "not-book1"
  | "frame-has-capture" | "profile-not-frozen" | "profile-revision-mismatch" | "profile-after-frame" | "profile-unreadable"
  | "curriculum-version-mismatch" | "frozen-report-missing" | "planner-refused" | "planner-call-count" | "plan-mismatch"
  | "mastery-policy-unproved";
export type Book1RecoveryResult = { ok: true; input: PlanInput; inputHash: string; proof: Book1PlanningProof } | { ok: false; reason: Book1RecoveryRefusal };

const sha40 = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{40}$/.test(v);
const time = (v: unknown) => typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(v) ? Date.parse(v) : NaN;

/** Verifies and recovers. Every failure is a refusal with a reason; nothing is guessed or filled in. */
export function recoverBook1PlanningInput(s: Book1RecoverySources, engine: PinnedPlanningEngine | null): Book1RecoveryResult {
  const refuse = (reason: Book1RecoveryRefusal): Book1RecoveryResult => ({ ok: false, reason });
  try {
    if (!s || s.version !== 1 || !s.frame || !s.run || typeof s.frame.reference !== "string" || !s.frame.reference) return refuse("invalid-sources");
    const frame = stored(s.frame.value), framedAt = time(s.frame.createdAt);
    if (!frame || frame.version !== 1 || !frame.plan || !frame.versions || !Number.isFinite(framedAt)) return refuse("invalid-sources");
    if (frame.planning) return refuse("frame-has-capture");
    if (!frame.versions.build) return refuse("build-unknown");
    if (!engine) return refuse("engine-unavailable");
    if (!sha40(engine.pin) || !sha40(engine.tree) || !sha40(engine.placementBlob)) return refuse("engine-unavailable");
    if (engine.pin !== frame.versions.build) return refuse("build-mismatch");
    if (s.run.number !== 1 || frame.workbooks.length !== 0) return refuse("not-book1");
    let profile: unknown = null;
    if (frame.profileRevision === null) {
      if (s.profile !== null) return refuse("profile-revision-mismatch");
    } else {
      if (!s.profile) return refuse("profile-not-frozen");
      if (s.profile.revision !== frame.profileRevision) return refuse("profile-revision-mismatch");
      const builtAt = time(s.profile.builtAt);
      if (!Number.isFinite(builtAt) || builtAt > framedAt) return refuse("profile-after-frame");
      profile = stored(s.profile.value);
    }
    if (engine.curriculumVersion(frame.curriculum) !== frame.versions.curriculum) return refuse("curriculum-version-mismatch");
    const personal = (frame.plan as { personal?: { report?: { howWeHelp: unknown; minutes: unknown; device: unknown } } }).personal;
    if (personal && !personal.report) return refuse("frozen-report-missing");
    const facts = personal ? { report: { howWeHelp: personal.report!.howWeHelp, minutes: personal.report!.minutes }, device: personal.report!.device } : {};
    const run = engine.plan({ curriculumKey: frame.curriculum, grade: frame.grade, profile, ...facts, workbooks: [], number: 1 });
    if (!run.profileReadable) return refuse("profile-unreadable");
    if (run.calls.length !== 1) return refuse("planner-call-count");
    if (!run.result.ok || !run.result.plan) return refuse("planner-refused");
    const planned = stored(run.result.plan) as Record<string, unknown>, framed = stored(frame.plan) as unknown as Record<string, unknown>;
    const skip = new Set<string>(frame.itemPolicy === "approved-v1" ? CAPACITY_FIELDS : []);
    const keys = new Set([...Object.keys(planned), ...Object.keys(framed)]);
    if ([...keys].some(k => !skip.has(k) && !same(planned[k], framed[k]))) return refuse("plan-mismatch");
    const input = stored(run.calls[0]);
    if (masteryPolicyProblem(input)) return refuse("mastery-policy-unproved");
    const placement = stored({ curriculum: { key: frame.curriculum, version: frame.versions.curriculum }, grade: frame.grade,
      profile: profile as Book1PlanningProof["placement"]["profile"], ...facts, workbooks: [], number: 1 }) as Book1PlanningProof["placement"];
    const frameHash = jsonHash(frame), inputHash = jsonHash(input);
    const sources = [{ reference: s.frame.reference, version: String(frame.version), hash: frameHash }];
    if (s.profile) sources.push({ reference: s.profile.reference, version: String(s.profile.revision), hash: jsonHash(profile) });
    return { ok: true, input, inputHash, proof: stored({ version: 1, kind: "exact-recovery",
      planner: { build: engine.pin, tree: engine.tree, placementBlob: engine.placementBlob },
      input, inputHash, placement, placementHash: jsonHash(placement), frame: { reference: s.frame.reference, hash: frameHash }, sources }) };
  } catch { return refuse("invalid-sources"); }
}
