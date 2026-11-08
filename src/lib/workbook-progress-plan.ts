// Pure, opt-in public preview for #472. This module does not issue or save a workbook.
import { BC_SKILL_MAP } from "./assessment";
import type { CurriculumSkill } from "./workbook-curriculum/types";
import { planWorkbook, type PlanInput, type ProgressPlanInput, type WorkbookPlan } from "./workbook-plan";
import { deriveWorkbookProgress, WORKBOOK_PROGRESS_VERSION, type ProgressCurriculum, type ProgressHistory,
  type ProgressSnapshot, type WorkbookProgressDecision, type WorkbookProgressResult } from "./workbook-progress";

export const WORKBOOK_PLAN_PREVIEW_VERSION = 1;
export interface WorkbookPlanPreviewInput {
  version: 1;
  snapshot: ProgressSnapshot;
  /** The approved frozen skill, including its level and teaching delivery, from the named curriculum version. */
  curriculum: ProgressCurriculum & { skill: CurriculumSkill };
  history: ProgressHistory;
  /** Ordinary validated planning input, with the prior (not newly computed) passed prefix. */
  planning: Omit<PlanInput, "progress">;
}
export type PlanPreviewRefusal = Extract<WorkbookProgressResult, { ok: false }>["reason"]
  | "invalid-preview-version" | "planning-scope-mismatch" | "planning-mastery-mismatch"
  | "planning-review-mismatch" | "planning-miss-mismatch" | "unsupported-plan-policy" | "planner-refused";
export type UnsupportedPlanPolicy = "unit-progression" | "non-teaching-skill" | "school-scope"
  | "advance-with-higher-prefix" | "target-not-scheduled" | "invalid-decision";
export type WorkbookPlanPreviewResult = { ok: false; version: 1; reason: PlanPreviewRefusal; policy?: UnsupportedPlanPolicy } | {
  ok: true;
  version: 1;
  inputVersions: { snapshot: 1; history: 1; progress: 1; planning: 1 };
  snapshot: Pick<ProgressSnapshot, "id" | "cutoff" | "curriculum" | "scope" | "priorMastery">;
  decision: WorkbookProgressDecision;
  /** Exact input consumed by the public planner, for later explicit snapshot storage. */
  planningInput: PlanInput;
  plan: WorkbookPlan;
  evidence: {
    used: WorkbookProgressDecision["consumed"];
    held: { items: WorkbookProgressDecision["items"]; originals: WorkbookProgressDecision["deferredOriginals"] };
  };
};

const sameReviews = (a: ProgressSnapshot["reviews"], b: PlanInput["reviews"]) =>
  JSON.stringify(a.map(r => [r.skill, r.step, r.interval, r.due])) === JSON.stringify(b.map(r => [r.skill, r.step, r.interval, r.due]));
const sameQuestion = (a: PlanInput["misses"][number]["question"], b: PlanInput["misses"][number]["question"]) =>
  a.source === b.source && (a.source === "workbook" && b.source === "workbook"
    ? a.workbookId === b.workbookId && a.page === b.page && a.question === b.question : JSON.stringify(a) === JSON.stringify(b));

/** Frozen inputs only. No clock, environment, store, network, model or renderer is read. */
export function previewNextWorkbookPlan(input: WorkbookPlanPreviewInput): WorkbookPlanPreviewResult {
  const refuse = (reason: PlanPreviewRefusal, policy?: UnsupportedPlanPolicy): WorkbookPlanPreviewResult =>
    ({ ok: false, version: 1, reason, ...(policy ? { policy } : {}) });
  try {
    if (input.version !== WORKBOOK_PLAN_PREVIEW_VERSION) return refuse("invalid-preview-version");
    const { snapshot: s, curriculum: c, history: h, planning: p } = input;
    const derived = deriveWorkbookProgress(s, c, h);
    if (!derived.ok) return refuse(derived.reason);
    const d = derived.decision, skill = c.skill;
    const matches = p.level.units.flatMap(u => u.skills.filter(s => s.id === skill.id).map(s => ({ ...s, unit: u.code })));
    const own = matches[0];
    const standard = BC_SKILL_MAP.standards.find(s => s.code === skill.unit);
    const mapSkill = standard?.skills.find(s => s.id === skill.id);
    if (Object.hasOwn(p, "progress") || matches.length !== 1 || !standard || !mapSkill
      || skill.level !== `U${p.level.number}` || own.unit !== skill.unit || own.delivery !== skill.delivery
      || own.pages !== skill.pages || own.steps.length !== c.steps.length
      || own.steps.some((x, i) => x.pages !== c.steps[i].pages)
      || JSON.stringify([...skill.requires].sort()) !== JSON.stringify([...mapSkill.requires].sort())
      || !Number.isInteger(p.grade) || p.grade < 1 || p.grade > 9
      || (p.personal?.hasAssessment && p.personal.grade !== p.grade)) return refuse("planning-scope-mismatch");
    if ((p.passed[skill.id] ?? 0) !== s.priorMastery.passedSteps) return refuse("planning-mastery-mismatch");
    // These are saved, caller-validated schedules. No new review calculator runs here.
    if (!sameReviews(s.reviews, p.reviews) || !sameReviews(s.missedReviews, p.missedReviews)) return refuse("planning-review-mismatch");
    if ((p.progression ?? "steps") !== "steps") return refuse("unsupported-plan-policy", "unit-progression");
    if (skill.delivery !== "new-step") return refuse("unsupported-plan-policy", "non-teaching-skill");
    if (standard.grade > p.grade && !p.profile.standards.some(s => s.code === standard.code && s.status === "secure")) {
      return refuse("unsupported-plan-policy", "school-scope");
    }
    if (d.action === "advance" && d.target.step !== d.passed[skill.id] + 1) return refuse("unsupported-plan-policy", "advance-with-higher-prefix");
    const originals = new Map(d.items.filter(i => i.first).map(i => [i.first!.provenance.eventId, i]));
    for (const miss of p.misses.filter(m => m.skill === skill.id)) {
      const item = originals.get(miss.event);
      if (item && !sameQuestion(miss.question, item.question)) return refuse("planning-miss-mismatch");
    }
    // Replace only represented selected-skill originals. Keep other skills and selected-skill work outside this sample.
    // With no required sample, the core's deferred originals remain held and every prior miss stays intact.
    const misses = [...p.misses.filter(m => m.skill !== skill.id || !originals.has(m.event)), ...d.misses];
    const { version, snapshotId, cutoff, curriculum, selection, target, status, action, reason, passed,
      representation, parentFollowUp, focusedPractice, repeatIncrement } = d;
    const progress: ProgressPlanInput = { version: 1, priorPassedSteps: s.priorMastery.passedSteps,
      decision: { version, snapshotId, cutoff, curriculum, selection, target, status, action, reason, passed,
        representation, parentFollowUp, focusedPractice, repeatIncrement } };
    const planningInput: PlanInput = structuredClone({ ...p, passed: { ...p.passed, ...d.passed }, misses, progress });
    const result = planWorkbook(planningInput);
    if (!result.ok) return result.reason.includes("progress")
      ? refuse("unsupported-plan-policy", result.reason.startsWith("unsupported progress target") ? "target-not-scheduled" : "invalid-decision")
      : refuse("planner-refused");
    // The result owns its full graph. Mutating any caller input or returned plan cannot rewrite the other.
    return structuredClone({ ok: true, version: 1,
      inputVersions: { snapshot: s.version, history: h.version, progress: WORKBOOK_PROGRESS_VERSION, planning: progress.version },
      snapshot: { id: s.id, cutoff: s.cutoff, curriculum: s.curriculum, scope: s.scope, priorMastery: s.priorMastery },
      decision: d, planningInput, plan: result.plan,
      evidence: { used: d.consumed, held: { items: d.items.filter(i => i.status !== "resolved" && i.status !== "excluded"), originals: d.deferredOriginals } },
    });
  } catch { return refuse("invalid-contract"); }
}
