import "server-only";
import { isDeepStrictEqual as same } from "node:util";
import { isUuid, workbookProblem, type WorkbookInput } from "./workbook-content";
import { approvalProblems, approvedWorkbook, type DraftForApproval } from "./workbook-ship";
import { manifestProblem, printContractProblem, teachingProblem } from "./workbook-print-contract";
import { planWorkbook, type PlanInput, type WorkbookPlan, type StepRef } from "./workbook-plan";
import type { WorkbookPlanPreviewInput } from "./workbook-progress-plan";
import { sourceHash } from "./workbook-progress-hash";

export const BOOK1_BASELINE_ENGINE = "book1-baseline/1;placement-empty-passed/1";
export const ORIGINAL_BOOK1_PIN = "de9404ee545517387a241d79f19f1d70ab1e3201";
export const ORIGINAL_BOOK1_TREE = "958b1b49304e8db1bff5c4675c96ea15fb6f50b9";
export const ORIGINAL_PLACEMENT_BLOB = "7c562372dc30bab0e259572ecaf4a1b8403c4ec8";
export const storedJson = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const hash = (value: unknown) => sourceHash(storedJson(value));
const validTime = (n: number) => Number.isSafeInteger(n) && n >= 0;
const sha = (s: string) => /^[0-9a-f]{64}$/.test(s);
export interface PlanningSourceVersion {
  reference: string;
  version: string;
  hash: string;
}
export interface ProvenBook1Planning {
  version: 1;
  kind: "public-boundary" | "exact-recovery";
  engine: typeof BOOK1_BASELINE_ENGINE;
  pin: string;
  sourceTree: string;
  sources: PlanningSourceVersion[];
  input: PlanInput;
  inputHash: string;
  originalPlanHash: string;
  priorMasteryPolicy: "explicit-empty-passed-map";
}
export type RecoveryRefusal = "original-engine-unavailable" | "original-inputs-incomplete" | "source-version-conflict"
  | "original-plan-conflict" | "not-book1" | "unproved-mastery-policy";
export type PlanningProof = { ok: true; planning: ProvenBook1Planning } | { ok: false; reason: RecoveryRefusal };
/** Only a trusted reader can attest these immutable versions. A profile revision match is not this contract. */
export interface OriginalPlanningSources {
  version: 1;
  frameBuild: string;
  frameHash: string;
  plannedAt: number;
  originalPlanHash: string;
  /** Explicit records include proved absence (null), never an omitted report, device or profile. */
  records: { name: "profile" | "report" | "device" | "workbooks" | "grade" | "curriculum";
    reference: string; version: string; hash: string; validFrom: number; validThrough: number; value: unknown }[];
}
/**
 * The controller supplies a runner loaded from this exact Git tree, including transitive imports.
 * No current profile, reconstructed result-plan input, or browser-supplied runner is permitted.
 * evaluate returns the PlanInput at the original public planWorkbook call and the final placement plan.
 */
export interface OriginalPlanningEngine {
  pin: typeof ORIGINAL_BOOK1_PIN;
  sourceTree: typeof ORIGINAL_BOOK1_TREE;
  placementBlob: typeof ORIGINAL_PLACEMENT_BLOB;
  evaluate(records: OriginalPlanningSources["records"]): { input: PlanInput; plan: WorkbookPlan };
}
function planningProof(input: PlanInput, provenance: Omit<ProvenBook1Planning, "version" | "engine" | "input" | "inputHash" | "priorMasteryPolicy">): PlanningProof {
  try {
    if (input.workbook.number !== 1 || input.workbook.inLevel !== 0) return { ok: false, reason: "not-book1" };
    if (Object.hasOwn(input, "progress") || Object.keys(input.passed).length || input.reviews.length || input.missedReviews.length || input.misses.length)
      return { ok: false, reason: "unproved-mastery-policy" };
    if (!provenance.sources.length || provenance.sources.some(s => !s.reference || !s.version || !sha(s.hash))
      || !/^[0-9a-f]{40}$/.test(provenance.pin) || !/^[0-9a-f]{40}$/.test(provenance.sourceTree) || !sha(provenance.originalPlanHash))
      return { ok: false, reason: "source-version-conflict" };
    if (!planWorkbook(input).ok) return { ok: false, reason: "original-plan-conflict" };
    return { ok: true, planning: storedJson({ version: 1, engine: BOOK1_BASELINE_ENGINE, ...provenance,
      input, inputHash: hash(input), priorMasteryPolicy: "explicit-empty-passed-map" }) };
  } catch { return { ok: false, reason: "original-inputs-incomplete" }; }
}
/** Prospective use: pass the captured copy from planNextWorkbook's public planning boundary and immutable frame provenance. */
export function proveBook1PlanningCapture(input: PlanInput, provenance: {
  pin: string; sourceTree: string; frameReference: string; frameVersion: string; frameHash: string; originalPlan: WorkbookPlan;
}): PlanningProof {
  return planningProof(input, { kind: "public-boundary", pin: provenance.pin, sourceTree: provenance.sourceTree,
    sources: [{ reference: provenance.frameReference, version: provenance.frameVersion, hash: provenance.frameHash }], originalPlanHash: hash(provenance.originalPlan) });
}
export function verifyBook1OriginalInputRecovery(s: OriginalPlanningSources, engine: OriginalPlanningEngine | null): PlanningProof {
  try {
    if (!engine || engine.pin !== ORIGINAL_BOOK1_PIN || engine.sourceTree !== ORIGINAL_BOOK1_TREE || engine.placementBlob !== ORIGINAL_PLACEMENT_BLOB
      || s.frameBuild !== ORIGINAL_BOOK1_PIN) return { ok: false, reason: "original-engine-unavailable" };
    const names = ["curriculum", "device", "grade", "profile", "report", "workbooks"];
    if (s.version !== 1 || !same(s.records.map(r => r.name).sort(), names) || !sha(s.frameHash) || !validTime(s.plannedAt))
      return { ok: false, reason: "original-inputs-incomplete" };
    if (s.records.some(r => !r.reference || !r.version || r.hash !== hash(r.value) || !validTime(r.validFrom)
      || !validTime(r.validThrough) || r.validFrom > s.plannedAt || r.validThrough < s.plannedAt)) return { ok: false, reason: "source-version-conflict" };
    if (!same(s.records.find(r => r.name === "workbooks")!.value, [])) return { ok: false, reason: "not-book1" };
    const recovered = engine.evaluate(structuredClone(s.records));
    if (hash(recovered.plan) !== s.originalPlanHash) return { ok: false, reason: "original-plan-conflict" };
    return planningProof(recovered.input, { kind: "exact-recovery", pin: engine.pin, sourceTree: engine.sourceTree,
      originalPlanHash: s.originalPlanHash, sources: [
        { reference: `original-frame:${s.frameBuild}`, version: "1", hash: s.frameHash },
        ...s.records.map(({ reference, version, hash }) => ({ reference, version, hash })),
      ] });
  } catch { return { ok: false, reason: "original-inputs-incomplete" }; }
}
export interface Book1Baseline {
  version: 1;
  engine: typeof BOOK1_BASELINE_ENGINE;
  parentId: string;
  childId: string;
  workbookId: string;
  runId: string;
  draftRevision: number;
  capturedAt: number;
  binding: { draftHash: string; renderHash: string; frameHash: string; workbookHash: string; printedRevision: string };
  planning: ProvenBook1Planning;
  curriculum: WorkbookPlanPreviewInput["curriculum"][];
  /** First issue is separate from advance/repeat decisions. It supplies no mastery. */
  initialIssues: { kind: "first-issue"; selection: StepRef; planningHash: string; printedRevision: string }[];
  /** Keep the exact final immutable revision for validation without an approved workbooks row. */
  final: DraftForApproval;
}
export type BaselineResult = { ok: true; baseline: Book1Baseline; hash: string } | {
  ok: false; reason: "invalid-final-revision" | "planning-proof-unavailable" | "curriculum-conflict";
};
export function createBook1Baseline(o: { parentId: string; childId: string; capturedAt: number;
  final: DraftForApproval; planning: ProvenBook1Planning; curriculum: Book1Baseline["curriculum"] }): BaselineResult {
  try {
    const d = o.final, p = o.planning;
    if (![o.parentId, o.childId, d.draftId, d.runId].every(isUuid) || !validTime(o.capturedAt) || !Number.isSafeInteger(d.revision) || d.revision < 1
      || d.draft.childId !== o.childId || d.draft.id !== d.draftId || d.draft.number !== 1 || approvalProblems(d).length) return { ok: false, reason: "invalid-final-revision" };
    const w = approvedWorkbook(d);
    if (!w.printedRevision || workbookProblem(w) || !w.printManifest || !d.frame || !d.rendering
      || manifestProblem(w.printManifest, w.pages) || w.pages.some(page => printContractProblem(page.printContract)
        || page.questions.some(q => teachingProblem(q.teaching)))) return { ok: false, reason: "invalid-final-revision" };
    const checked = planningProof(p.input, p);
    if (!checked.ok || p.version !== 1 || p.engine !== BOOK1_BASELINE_ENGINE || p.priorMasteryPolicy !== "explicit-empty-passed-map"
      || p.inputHash !== hash(p.input) || !same(p, checked.planning)) return { ok: false, reason: "planning-proof-unavailable" };
    const steps = new Map<string, StepRef>();
    for (const page of w.pages) for (const q of page.questions) {
      for (const step of [q.teaching?.plannedStep, q.teaching?.itemStep]) if (step) steps.set(sourceHash(step), step);
    }
    if (!o.curriculum.length || new Set(o.curriculum.map(c => c.skill.id)).size !== o.curriculum.length
      || o.curriculum.some(c => c.key !== w.printManifest!.curriculum.key || c.version !== w.printManifest!.curriculum.version
        || c.skill.curriculum !== c.key || !same(c.steps, c.skill.steps))) return { ok: false, reason: "curriculum-conflict" };
    for (const step of steps.values()) {
      const c = o.curriculum.find(c => c.skill.id === step.skill);
      if (!c || c.skill.unit !== step.unit || !c.steps.some(s => s.number === step.step)) return { ok: false, reason: "curriculum-conflict" };
    }
    const baseline: Book1Baseline = storedJson({ version: 1, engine: BOOK1_BASELINE_ENGINE, parentId: o.parentId, childId: o.childId,
      workbookId: d.draftId, runId: d.runId, draftRevision: d.revision, capturedAt: o.capturedAt, planning: p, curriculum: o.curriculum,
      binding: { draftHash: hash(d.draft), renderHash: hash(d.rendering), frameHash: hash(d.frame), workbookHash: hash(w), printedRevision: w.printedRevision },
      initialIssues: [...steps.values()].sort((a, b) => a.unit.localeCompare(b.unit) || a.skill.localeCompare(b.skill) || a.step - b.step)
        .map(selection => ({ kind: "first-issue", selection, planningHash: p.inputHash, printedRevision: w.printedRevision })), final: d });
    return { ok: true, baseline, hash: hash(baseline) };
  } catch { return { ok: false, reason: "invalid-final-revision" }; }
}
export function validateBook1Baseline(b: Book1Baseline, expectedHash: string): boolean {
  const rebuilt = createBook1Baseline({ parentId: b.parentId, childId: b.childId, capturedAt: b.capturedAt, final: b.final, planning: b.planning, curriculum: b.curriculum });
  return rebuilt.ok && same(b, rebuilt.baseline) && expectedHash === rebuilt.hash;
}
/** Later approval must produce this exact immutable contract, including packages and QR tokens. */
export function book1MatchesApproved(b: Book1Baseline, w: WorkbookInput): boolean {
  return hash(w) === b.binding.workbookHash && w.printedRevision === b.binding.printedRevision;
}
