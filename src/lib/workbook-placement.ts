// Workbook personalization P0-P9 (D-233). Pure TypeScript: no network, database, clock or randomness.
import type { Grade } from "@/lib/assessment";
import type { ChildLearnerProfile } from "@/lib/child-profile";
import type { Curriculum, CurriculumLevel } from "@/lib/workbook-curriculum";
import { planLevel, planWorkbook, type WorkbookPlan } from "@/lib/workbook-plan";
import { bookSignals, type BookSignals, type BookStandard } from "@/lib/workbook-signals";

export const PLACEMENT_CEILING = 27;
export interface PlacementInput {
  curriculum: Curriculum;
  grade: Grade;
  profile: ChildLearnerProfile | null;
  workbooks: readonly { number: number; levels: readonly number[] }[];
}
export interface PlacementTrace {
  rule: "P0" | "P1" | "P2" | "P3" | "P4" | "P5" | "P9";
  reason: string;
  level: string;
  home: string;
  support: string | null;
  rules: string[];
}
interface PlacedChild {
  level: CurriculumLevel;
  inLevel: number;
  first: boolean;
  support: string | null;
  trace: PlacementTrace;
}
export type PersonalWorkbookPlan = WorkbookPlan & { personal?: BookSignals & { start: PlacementTrace } };
export type NextWorkbookResult = ({ ok: true; plan: PersonalWorkbookPlan } | { ok: false; reason: string }) & { levelId?: string; placement?: PlacementTrace };

/** The first level of a grade, with the existing Kindergarten and U27 bounds. */
function firstLevel(levels: readonly CurriculumLevel[], grade: number): CurriculumLevel {
  const atOrBelow = levels.filter(l => l.schoolGrade <= grade);
  return atOrBelow.find(l => l.schoolGrade === grade) ?? atOrBelow.at(-1) ?? levels[0];
}
function weakLevels(levels: readonly CurriculumLevel[], standards: readonly BookStandard[]) {
  return standards.flatMap(standard => {
    const level = levels.find(l => l.units.includes(standard.code));
    return level ? [{ standard, level }] : [];
  }).sort((a,b) => a.level.number - b.level.number || a.standard.code.localeCompare(b.standard.code, undefined, { numeric: true }));
}
function supportFor(levels: readonly CurriculumLevel[], home: CurriculumLevel, signals: BookSignals): string | null {
  const clear = weakLevels(levels, signals.clearlyWeak);
  if (clear.length >= 2 || clear.some(s => home.schoolGrade - s.standard.grade >= 2)) return null;
  if (clear.length === 1 && clear[0].level.number < home.number) return clear[0].standard.code;
  const early = weakLevels(levels, signals.earlyWeak).filter(s => s.level.number < home.number);
  // Parent catch-up request: the lowest of at least two early gaps takes the one support slot. P6 keeps the others.
  return signals.parent.goal === "catch_up" && early.length >= 2 ? early[0].standard.code : null;
}

/** The first matching placement rule decides the start. Existing workbooks always come first. */
export function placeChild(o: PlacementInput): PlacedChild {
  const levels = o.curriculum.levels.filter(l => l.number <= PLACEMENT_CEILING);
  const signals = bookSignals(o);
  const home = firstLevel(levels, Math.min(signals.working?.working ?? o.grade, 9));
  const decide = (level: CurriculumLevel, rule: PlacementTrace["rule"], reason: string, inLevel = 0, first = true, support: string | null = null): PlacedChild => ({
    level, inLevel, first, support,
    trace: { rule, reason, level: level.id, home: home.id, support, rules: [...new Set([rule, ...(signals.working?.atCeiling && rule === "P5" ? ["P7"] : []), "P8", ...(o.grade === 0 || level.number === PLACEMENT_CEILING ? ["P9"] : [])])] },
  });
  const newest = [...o.workbooks].sort((a,b) => b.number-a.number)[0];
  if (newest && newest.levels.length > 0) {
    const at = Math.min(Math.max(...newest.levels), PLACEMENT_CEILING);
    const level = levels.find(l => l.number === at) ?? levels[levels.length-1];
    const inLevel = o.workbooks.filter(w => w.levels.includes(level.number)).length;
    const support = signals.hasAssessment && level.number === home.number && inLevel < 2 ? supportFor(levels, home, signals) : null;
    return decide(level, "P0", "Continue at the newest workbook's level.", inLevel, false, support);
  }
  if (o.grade === 0) return decide(firstLevel(levels, 0), "P9", "Kindergarten starts at U1.");
  if (!signals.hasAssessment) {
    const notSecure = new Set(o.profile?.notYetSecure ?? []);
    const weak = levels.filter(l => l.schoolGrade <= o.grade).find(l => l.units.some(u => notSecure.has(u)));
    return decide(weak ?? firstLevel(levels, o.grade), "P1", "No measured working level: use the previous grade-and-standards placement.");
  }
  if (signals.working!.working > o.grade && !signals.adjustments.trustedAboveGrade) {
    return decide(firstLevel(levels, o.grade), "P2", "An above-grade start needs a clear level, normal confidence, no likely help and no rushing.");
  }
  const clear = weakLevels(levels, signals.clearlyWeak);
  if (clear.length >= 2 || clear.some(s => home.schoolGrade - s.standard.grade >= 2)) {
    return decide(clear[0].level, "P3", "Start at the lowest clearly weak unit: multiple clear gaps or a gap at least two grades below home.");
  }
  const support = supportFor(levels, home, signals);
  if (support) return decide(home, "P4", "Start at home and use the lower weak unit in the support slot for two books.", 0, true, support);
  return decide(home, "P5", "Start at the measured working level; early gaps below it do not lower the start.");
}

/** Plans from clear secure results only at the first start level. Legacy input keeps the previous plan unchanged. */
export function planNextWorkbook(o: PlacementInput & { number: number }): NextWorkbookResult {
  const place = placeChild(o);
  const level = planLevel(o.curriculum, place.level.id);
  if (!level) return { ok: false, reason: `the curriculum has no level ${place.level.id}` };
  const signals = bookSignals({ ...o, allowedStandards: o.curriculum.levels.filter(l => l.number <= place.level.number).flatMap(l => [...l.units]) });
  const known = new Set((o.profile?.standards ?? []).map(s => s.code));
  const own = new Set(place.level.units);
  const standards = (o.profile?.standards ?? []).map(s => signals.hasAssessment && place.first && own.has(s.code) && s.status === "secure" && s.certainty !== "clear" ? { code: s.code, status: "developing" as const } : s);
  const unassessedUnits = place.first ? place.level.units.filter(u => !known.has(u)) : [];
  const result = planWorkbook({
    profile: { standards }, grade: o.grade, level, passed: {},
    ...(signals.hasAssessment ? { personal: signals } : {}),
    workbook: { number: o.number, inLevel: place.inLevel },
    reviews: [], missedReviews: [], misses: [], pausedWeeks: 0,
    support: place.support, unassessedUnits,
  });
  if (!result.ok) return { ...result, levelId: place.level.id, placement: place.trace };
  const trace: PlacementTrace = { ...place.trace, rules: [...place.trace.rules] };
  if (signals.hasAssessment) {
    if (place.first && standards.some(s => s.status === "developing" && o.profile?.standards.some(original => original.code === s.code && original.status === "secure"))) trace.rules.push("P5a");
    if (unassessedUnits.length) trace.rules.push("P5b");
    if (weakLevels(o.curriculum.levels, signals.earlyWeak).some(s => s.level.number < place.level.number)) trace.rules.push("P6");
  }
  const plan: PersonalWorkbookPlan = { ...result.plan, personal: result.plan.personal ? { ...result.plan.personal, start: trace } : undefined };
  if (!signals.hasAssessment) delete plan.personal;
  if (place.support && plan.units.support) {
    const unit = o.curriculum.unit(place.support)!;
    const skills = (o.curriculum.levelSkills(unit.level) ?? []).filter(s => s.unit === place.support).map(s => s.id);
    const ownSupport = new Set(skills);
    // Step progression adds earlier Unit A steps to general reviews. Keep the dedicated support slot on its own unit.
    for (const day of plan.days) for (const page of day.pages) for (const part of page.parts) {
      if ((part.kind === "mini-test" || (part.kind === "remember-these" && part.reviews === undefined)) && part.skills.some(s => ownSupport.has(s))) {
        part.skills = [...skills];
        part.reviewSteps = skills.map(skill => ({ skill, step: null }));
      }
    }
  }
  return { ok: true, plan, levelId: place.level.id, placement: trace };
}
