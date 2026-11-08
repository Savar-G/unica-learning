// #472 Book 1 progress baseline. A trusted, immutable record that binds a child's first workbook, at one final draft
// revision, to the exact planning input that made it, the mastery it started from (none: the explicit empty passed map),
// and the steps it issued. The book 2 preview reads it through src/lib/workbook-progress-source.ts.
//
// Rules this module keeps:
// - A printed step does not prove that earlier steps were mastered. The proved starting mastery is the PlanInput's own
//   passed map, which a first book always has empty.
// - An initial issue is not an advance or a repeat. Book 1 has no earlier issued decisions; that empty list is valid only
//   with this record.
// - It binds the draft revision through the public approval functions (approvalProblems, approvedWorkbook), before an
//   approved workbooks row exists, and writes nothing: no draft, render, question or workbook row.
// - The planning input comes from the run frame's prospective capture, or from the pinned original planner
//   (src/lib/workbook-book1-recovery.ts). Never from today's profile.
//
// Pure TypeScript: no network, database, clock or randomness.
import "server-only";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as same } from "node:util";
import { storedChildProfile } from "./child-profile";
import { isUuid } from "./workbook-content";
import { curriculumFor, curriculumVersion } from "./workbook-curriculum";
import type { CurriculumSkill, CurriculumStep } from "./workbook-curriculum/types";
import type { RunFrame, RunPlanningCapture } from "./workbook-job";
import { planNextWorkbook } from "./workbook-placement";
import type { PlanInput, StepRef } from "./workbook-plan";
import { isPrintedRevision, isSha256 } from "./workbook-print-contract";
import { canonical, sourceHash } from "./workbook-progress-hash";
import { approvalProblems, approvedWorkbook, type DraftForApproval } from "./workbook-ship";
import { teachingFrame } from "./workbook-teaching-frame";

export const BOOK1_BASELINE_ENGINE = "book1-baseline/1";
export const BOOK1_MASTERY_POLICY = "book1-empty-passed/1";
export const MAX_BASELINE_BYTES = 4_000_000;

/** JSON as the database keeps it: undefined fields dropped. Hashes are always of this form. */
export const stored = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export const jsonHash = (v: unknown): string => sourceHash(stored(v));
export const payloadHash = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export interface Book1PlanningProof {
  version: 1;
  kind: "prospective-capture" | "exact-recovery";
  /** The code that planned Book 1. Recovery names the pinned commit, its tree and the placement blob it ran. */
  planner: { build: string | null; tree: string | null; placementBlob: string | null };
  input: PlanInput;
  inputHash: string;
  placement: RunPlanningCapture["placement"];
  placementHash: string;
  frame: { reference: string; hash: string };
  sources: { reference: string; version: string; hash: string }[];
}
export type Book1PlanningRefusal = "planning-capture-missing" | "not-book1" | "mastery-policy-unproved" | "planning-scope-mismatch" | "invalid-planning";
export type Book1PlanningResult = { ok: true; proof: Book1PlanningProof } | { ok: false; reason: Book1PlanningRefusal };

export interface Book1Baseline {
  version: 1;
  engine: typeof BOOK1_BASELINE_ENGINE;
  /** The save request id: a retry with the same id and payload is the same record. */
  id: string;
  parentId: string;
  childId: string;
  runId: string;
  /** Approval stores the draft under this id, so it is the workbook id too. */
  draftId: string;
  draftRevision: number;
  number: 1;
  binding: {
    printedRevision: string;
    contentHash: string;
    renderHash: string;
    printHash: string;
    workbookHash: string;
    frameHash: string;
    levels: number[];
  };
  curriculum: { key: string; version: string; skills: { skill: CurriculumSkill; steps: CurriculumStep[] }[] };
  planning: Book1PlanningProof;
  priorMastery: { policy: typeof BOOK1_MASTERY_POLICY; passed: Record<string, never>; evidence: string };
  /** The steps the book issued. Each is a first issue: not an advance, not a repeat, and no mastery. */
  initialIssues: { kind: "initial-issue"; selection: StepRef }[];
}
export interface Book1BaselineRecord { payload: string; hash: string }
export type Book1BaselineRefusal = "invalid-request" | "invalid-final-revision" | "not-book1" | "frame-mismatch"
  | "planning-proof-invalid" | "curriculum-version-changed" | "curriculum-conflict" | "baseline-bound";
export type Book1BaselineResult = { ok: true; baseline: Book1Baseline; record: Book1BaselineRecord } | { ok: false; reason: Book1BaselineRefusal };

/** Where a PlanInput breaks the first-book starting-mastery policy, or null. */
export function masteryPolicyProblem(input: PlanInput): string | null {
  if (!input || typeof input !== "object") return "no input";
  if (Object.hasOwn(input, "progress")) return "a progress decision";
  if (!input.workbook || input.workbook.number !== 1 || input.workbook.inLevel !== 0) return "not workbook 1";
  if (!input.passed || typeof input.passed !== "object" || Object.keys(input.passed).length) return "passed steps";
  if (input.reviews?.length || input.missedReviews?.length || input.misses?.length) return "carried reviews or misses";
  if (input.pausedWeeks !== 0) return "paused weeks";
  return null;
}

/** The prospective capture a run frame stored at the planning boundary, as a Book 1 planning proof. */
export function proveBook1PlanningCapture(frame: RunFrame, frameReference: string): Book1PlanningResult {
  try {
    const f = stored(frame);
    const c = f.planning;
    if (!c) return { ok: false, reason: "planning-capture-missing" };
    if (c.version !== 1 || !c.input || !c.placement || typeof frameReference !== "string" || !frameReference) return { ok: false, reason: "invalid-planning" };
    if (c.placement.number !== 1 || c.placement.workbooks.length || f.workbooks.length) return { ok: false, reason: "not-book1" };
    if (masteryPolicyProblem(c.input)) return { ok: false, reason: "mastery-policy-unproved" };
    if (c.placement.grade !== f.grade || c.input.grade !== f.grade || c.placement.curriculum.key !== f.curriculum
      || c.placement.curriculum.version !== f.versions.curriculum || (f.profileRevision === null) !== (c.placement.profile === null)) {
      return { ok: false, reason: "planning-scope-mismatch" };
    }
    const frameHash = jsonHash(f);
    return { ok: true, proof: stored({ version: 1, kind: "prospective-capture",
      planner: { build: f.versions.build, tree: null, placementBlob: null },
      input: c.input, inputHash: jsonHash(c.input), placement: c.placement, placementHash: jsonHash(c.placement),
      frame: { reference: frameReference, hash: frameHash },
      sources: [{ reference: frameReference, version: String(f.version), hash: frameHash }] }) };
  } catch { return { ok: false, reason: "invalid-planning" }; }
}

function proofProblem(p: Book1PlanningProof, frame: RunFrame): boolean {
  const f = stored(frame);
  return p.version !== 1 || !["prospective-capture", "exact-recovery"].includes(p.kind) || p.inputHash !== jsonHash(p.input)
    || p.placementHash !== jsonHash(p.placement) || p.frame.hash !== jsonHash(f) || !p.frame.reference
    || !Array.isArray(p.sources) || !p.sources.length || p.sources.some(s => !s.reference || !s.version || !isSha256(s.hash))
    || !!masteryPolicyProblem(p.input) || p.placement.number !== 1 || p.placement.workbooks.length !== 0
    || p.placement.grade !== f.grade || p.input.grade !== f.grade || p.placement.curriculum.key !== f.curriculum
    || p.placement.curriculum.version !== f.versions.curriculum
    // A prospective proof is the frame's own capture; it cannot differ from it.
    || (p.kind === "prospective-capture" && (!f.planning || !same(stored(f.planning.input), p.input) || !same(stored(f.planning.placement), p.placement)))
    || (p.kind === "exact-recovery" && (!!f.planning || !p.planner.build || p.planner.build !== f.versions.build || !p.planner.tree || !p.planner.placementBlob));
}

/** The steps a printed book issued, from its frozen teaching contexts, in one stable order. */
export function issuedSteps(questions: readonly { teaching?: { plannedStep: StepRef | null; itemStep: StepRef | null } | null }[]): StepRef[] {
  const steps = new Map<string, StepRef>();
  for (const q of questions) for (const s of [q.teaching?.plannedStep, q.teaching?.itemStep]) {
    if (s) steps.set(JSON.stringify([s.unit, s.skill, s.step]), { unit: s.unit, skill: s.skill, step: s.step });
  }
  return [...steps.values()].sort((a, b) => a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : a.skill < b.skill ? -1 : a.skill > b.skill ? 1 : a.step - b.step);
}

/**
 * The baseline for a final draft revision. `final` is what approval reads (workbookShipStore.draftForApproval); `frame` is
 * the run's stored RunFrame. Nothing is written: the caller saves the record through the baseline command.
 */
export function createBook1Baseline(o: { id: string; parentId: string; childId: string; final: DraftForApproval; frame: RunFrame;
  planning: Book1PlanningProof }): Book1BaselineResult {
  try {
    const d = o.final;
    if (![o.id, o.parentId, o.childId, d.runId, d.draftId].every(isUuid)) return { ok: false, reason: "invalid-request" };
    if (d.draft.number !== 1) return { ok: false, reason: "not-book1" };
    if (approvalProblems(d).length || d.draft.id !== d.draftId || d.draft.childId !== o.childId || !Number.isSafeInteger(d.revision)
      || d.revision < 1 || !d.frame || !d.rendering?.pdfSha256) return { ok: false, reason: "invalid-final-revision" };
    // The frame approval reads must be the stored run frame this proof names.
    if (!same(stored(teachingFrame(o.frame)), stored(d.frame))) return { ok: false, reason: "frame-mismatch" };
    const w = approvedWorkbook(d);
    if (!w.printedRevision || !isPrintedRevision(w.printedRevision) || !w.printManifest || !isSha256(w.pdfSha256)) return { ok: false, reason: "invalid-final-revision" };
    if (proofProblem(o.planning, o.frame)) return { ok: false, reason: "planning-proof-invalid" };
    const key = o.planning.placement.curriculum.key, version = o.planning.placement.curriculum.version;
    const curriculum = curriculumFor(key);
    if (!curriculum || curriculumVersion(key) !== version) return { ok: false, reason: "curriculum-version-changed" };
    if (w.printManifest.curriculum.key !== key || w.printManifest.curriculum.version !== version) return { ok: false, reason: "curriculum-conflict" };
    const issues = issuedSteps(w.pages.flatMap(p => p.questions));
    const skills: Book1Baseline["curriculum"]["skills"] = [];
    for (const id of [...new Set(issues.map(s => s.skill))].sort()) {
      const skill = curriculum.levels.flatMap(l => curriculum.levelSkills(l.id) ?? []).find(s => s.id === id), steps = curriculum.skillSteps(id);
      if (!skill || !steps) return { ok: false, reason: "curriculum-conflict" };
      skills.push({ skill: structuredClone(skill), steps: structuredClone([...steps]) });
    }
    for (const s of issues) {
      const c = skills.find(x => x.skill.id === s.skill);
      if (!c || c.skill.unit !== s.unit || !c.steps.some(x => x.number === s.step)) return { ok: false, reason: "curriculum-conflict" };
    }
    const baseline: Book1Baseline = stored({
      version: 1, engine: BOOK1_BASELINE_ENGINE, id: o.id, parentId: o.parentId, childId: o.childId, runId: d.runId, draftId: d.draftId,
      draftRevision: d.revision, number: 1,
      binding: { printedRevision: w.printedRevision, contentHash: jsonHash(d.draft), renderHash: jsonHash(d.rendering), printHash: w.pdfSha256!,
        workbookHash: jsonHash(w), frameHash: jsonHash(o.frame), levels: [...d.draft.levels] },
      curriculum: { key, version, skills },
      planning: o.planning,
      priorMastery: { policy: BOOK1_MASTERY_POLICY, passed: {}, evidence: o.planning.inputHash },
      initialIssues: issues.map(selection => ({ kind: "initial-issue" as const, selection })),
    });
    const payload = canonical(baseline);
    if (Buffer.byteLength(payload, "utf8") > MAX_BASELINE_BYTES) return { ok: false, reason: "baseline-bound" };
    return { ok: true, baseline, record: { payload, hash: payloadHash(payload) } };
  } catch { return { ok: false, reason: "invalid-final-revision" }; }
}

const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const exactKeys = (v: unknown, keys: string[]) => !!v && typeof v === "object" && !Array.isArray(v) && same(Object.keys(v).sort(), [...keys].sort());

/**
 * Reads a saved record back. It checks the exact bytes, the hash, every inner hash and the planning policy again. It
 * cannot see the draft, so the caller binds it to a book with book1BindingProblem.
 */
export function readBook1Baseline(record: Book1BaselineRecord): Book1Baseline | null {
  try {
    if (typeof record?.payload !== "string" || Buffer.byteLength(record.payload, "utf8") > MAX_BASELINE_BYTES || payloadHash(record.payload) !== record.hash) return null;
    const b = JSON.parse(record.payload) as Book1Baseline;
    if (canonical(b) !== record.payload) return null;
    if (!exactKeys(b, ["version", "engine", "id", "parentId", "childId", "runId", "draftId", "draftRevision", "number", "binding", "curriculum", "planning", "priorMastery", "initialIssues"])
      || b.version !== 1 || b.engine !== BOOK1_BASELINE_ENGINE || ![b.id, b.parentId, b.childId, b.runId, b.draftId].every(isUuid)
      || !Number.isSafeInteger(b.draftRevision) || b.draftRevision < 1 || b.number !== 1) return null;
    const x = b.binding;
    if (!exactKeys(x, ["printedRevision", "contentHash", "renderHash", "printHash", "workbookHash", "frameHash", "levels"]) || !isPrintedRevision(x.printedRevision)
      || ![x.contentHash, x.renderHash, x.printHash, x.workbookHash, x.frameHash].every(isSha256)
      || !Array.isArray(x.levels) || !x.levels.length || x.levels.some(l => !Number.isSafeInteger(l) || l < 1 || l > 30)) return null;
    const p = b.planning;
    if (!exactKeys(p, ["version", "kind", "planner", "input", "inputHash", "placement", "placementHash", "frame", "sources"]) || p.version !== 1
      || !["prospective-capture", "exact-recovery"].includes(p.kind) || p.inputHash !== jsonHash(p.input) || p.placementHash !== jsonHash(p.placement)
      || masteryPolicyProblem(p.input) || p.placement.number !== 1 || p.placement.workbooks.length !== 0 || p.frame.hash !== x.frameHash
      || !text(p.frame.reference) || !p.sources.length || p.sources.some(s => !text(s.reference) || !text(s.version) || !isSha256(s.hash))
      || (p.kind === "exact-recovery" && (!text(p.planner.build) || !text(p.planner.tree) || !text(p.planner.placementBlob)))) return null;
    if (!same(b.priorMastery, { policy: BOOK1_MASTERY_POLICY, passed: {}, evidence: p.inputHash })) return null;
    const c = b.curriculum;
    if (c.key !== p.placement.curriculum.key || c.version !== p.placement.curriculum.version || !Array.isArray(c.skills)
      || new Set(c.skills.map(s => s.skill.id)).size !== c.skills.length
      || c.skills.some(s => s.skill.curriculum !== c.key || !s.steps.length || s.steps.some((step, i) => step.number !== i + 1 || step.skill !== s.skill.id || step.curriculum !== c.key))) return null;
    if (!Array.isArray(b.initialIssues) || !b.initialIssues.length || !same(b.initialIssues.map(i => i.selection), issuedSteps(b.initialIssues.map(i => ({ teaching: { plannedStep: i.selection, itemStep: null } }))))
      || b.initialIssues.some(i => !exactKeys(i, ["kind", "selection"]) || i.kind !== "initial-issue"
        || !c.skills.some(s => s.skill.id === i.selection.skill && s.skill.unit === i.selection.unit && s.steps.some(x => x.number === i.selection.step)))) return null;
    return b;
  } catch { return null; }
}

/** The shipped (or approved) book's frozen rows, as the source loader holds them. */
export interface Book1BoundBook {
  book: { id: string; parent_id: string; child_id: string; number: number; printed_revision: string | null };
  questions: readonly { teaching: unknown }[];
  approvals: readonly { run_id: string | null; workbook_id: string | null; action: string; detail: unknown }[];
  frames: readonly { run_id: string; frame: unknown }[];
}
export type Book1BindingProblem = "owner" | "book" | "revision" | "approval" | "frame" | "issues";
/**
 * Why a later book is not the one the baseline bound, or null. A new draft revision (R3), a changed printed revision,
 * QR token or package changes the printed revision or the approved revision, and the binding fails.
 */
export function book1BindingProblem(b: Book1Baseline, x: Book1BoundBook): Book1BindingProblem | null {
  if (x.book.parent_id !== b.parentId || x.book.child_id !== b.childId) return "owner";
  if (x.book.id !== b.draftId || x.book.number !== 1) return "book";
  if (x.book.printed_revision !== b.binding.printedRevision) return "revision";
  const approved = x.approvals.filter(a => a.action === "workbook-approved");
  if (!approved.length || approved.some(a => a.run_id !== b.runId || a.workbook_id !== b.draftId || !a.detail || typeof a.detail !== "object"
    || (a.detail as { revision?: unknown }).revision !== b.draftRevision
    || (a.detail as { printedRevision?: unknown }).printedRevision !== b.binding.printedRevision)) return "approval";
  const frames = x.frames.filter(f => f.run_id === b.runId);
  if (frames.length !== 1 || jsonHash(frames[0].frame) !== b.binding.frameHash) return "frame";
  const printed = issuedSteps(x.questions.map(q => ({ teaching: q.teaching as { plannedStep: StepRef | null; itemStep: StepRef | null } | null })));
  if (!same(printed, b.initialIssues.map(i => i.selection))) return "issues";
  return null;
}

export type Book2PlanningResult = { ok: true; input: PlanInput } | { ok: false; reason: "curriculum-version-changed" | "profile-unreadable" | "next-planner-refused" | "invalid-planning" };
/**
 * The next book's planning input, from the frozen Book 1 placement facts and the bound book, through the one public
 * planner (planNextWorkbook). The baseline's own PlanInput is never changed. No spaced review is added here (#473).
 */
export function book2Planning(b: Book1Baseline): Book2PlanningResult {
  try {
    const placement = structuredClone(b.planning.placement);
    const curriculum = curriculumFor(placement.curriculum.key);
    if (!curriculum || curriculumVersion(placement.curriculum.key) !== placement.curriculum.version) return { ok: false, reason: "curriculum-version-changed" };
    const captured: PlanInput[] = [];
    // Book 1's admin instructions are not Book 2's: a next run reads the child's current set, so this plan leaves them out.
    const { curriculum: _version, workbooks, number, profile: frozenProfile, instructions: _book1Instructions, ...facts } = placement;
    void _version; void _book1Instructions;
    // The frozen Book 1 profile, read by today's reader. Never the child's current profile.
    const profile = frozenProfile === null ? null : storedChildProfile(frozenProfile);
    if (frozenProfile !== null && !profile) return { ok: false, reason: "profile-unreadable" };
    const planned = planNextWorkbook({ ...facts, profile, curriculum, workbooks: [...workbooks, { number, levels: [...b.binding.levels] }], number: number + 1 },
      input => { captured.push(input); });
    if (!planned.ok || captured.length !== 1) return { ok: false, reason: "next-planner-refused" };
    const input = stored(captured[0]);
    if (input.workbook.number !== b.number + 1 || Object.hasOwn(input, "progress")) return { ok: false, reason: "invalid-planning" };
    return { ok: true, input };
  } catch { return { ok: false, reason: "invalid-planning" }; }
}
