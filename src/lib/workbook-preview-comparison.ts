import type { WorkbookPlan } from "./workbook-plan";
import type { WorkbookProgressDecision } from "./workbook-progress";

export interface ComparablePreview {
  childId: string;
  workbookId: string;
  selection: { unit: string; skill: string; step: number };
  cutoff: number;
  consumedVersions: WorkbookProgressDecision["consumed"];
  decision: WorkbookProgressDecision;
  plan: WorkbookPlan;
}

/** Compare saved evidence, not inferred causes. Return null when the two plans are not comparable. */
export function compareWorkbookPreviews(earlier: ComparablePreview, later: ComparablePreview) {
  if (earlier.childId !== later.childId || earlier.workbookId !== later.workbookId || earlier.cutoff > later.cutoff
    || JSON.stringify(earlier.selection) !== JSON.stringify(later.selection)) return null;
  const before = new Map(earlier.consumedVersions.map(v => [v.key, v]));
  const after = new Map(later.consumedVersions.map(v => [v.key, v]));
  const newMarks = later.consumedVersions.filter(v => !before.has(v.key));
  const changedMarks = later.consumedVersions.filter(v => before.has(v.key) && before.get(v.key)!.effectiveVersion !== v.effectiveVersion);
  const removedMarks = earlier.consumedVersions.filter(v => !after.has(v.key));
  const pages = (p: WorkbookPlan) => new Map(p.days.flatMap(d => d.pages.map(page => [`${d.day}:${page.number}`, page] as const)));
  const a = pages(earlier.plan), b = pages(later.plan);
  const changedPages = [...new Set([...a.keys(), ...b.keys()])].filter(k => JSON.stringify(a.get(k)) !== JSON.stringify(b.get(k)))
    .map(k => { const [day, page] = k.split(":").map(Number); return { day, page }; });
  const stepKey = (s: WorkbookPlan["newSteps"][number]) => JSON.stringify([s.unit, s.skill, s.step]);
  const oldSteps = new Map(earlier.plan.newSteps.map(s => [stepKey(s), s]));
  const newSteps = new Map(later.plan.newSteps.map(s => [stepKey(s), s]));
  const addedSteps = later.plan.newSteps.filter(s => !oldSteps.has(stepKey(s)));
  const removedSteps = earlier.plan.newSteps.filter(s => !newSteps.has(stepKey(s)));
  const movedSteps = later.plan.newSteps.flatMap(s => {
    const old = oldSteps.get(stepKey(s));
    return old && (old.day !== s.day || old.track !== s.track) ? [{ before: old, after: s }] : [];
  });
  return { newMarks, changedMarks, removedMarks, changedPages, addedSteps, removedSteps, movedSteps,
    stepsChanged: !!(addedSteps.length || removedSteps.length || movedSteps.length),
    decisionChanged: JSON.stringify([earlier.decision.action, earlier.decision.target]) !== JSON.stringify([later.decision.action, later.decision.target]) };
}
