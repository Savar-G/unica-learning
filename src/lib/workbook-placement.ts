// Workbook personalization P0-P9 (D-233). Pure TypeScript: no network, database, clock or randomness.
import type { Grade } from "@/lib/assessment";
import type { ChildLearnerProfile } from "@/lib/child-profile";
import type { Curriculum, CurriculumLevel } from "@/lib/workbook-curriculum";
import { planLevel, planWorkbook, type WorkbookPlan, type PlanInput } from "@/lib/workbook-plan";
import { bookSignals, type BookSignals, type BookStandard } from "@/lib/workbook-signals";
import { workbookWhy } from "@/lib/workbook-why";
import { difficultyLabel, instructionsEmpty, type InstructionOutcome, type WorkbookInstructions } from "@/lib/workbook-instructions";

export const PLACEMENT_CEILING = 27;
export interface PlacementInput {
  report?: import("./workbook-signals").BookSignalsInput["report"];
  device?: import("./workbook-signals").BookSignalsInput["device"];
  curriculum: Curriculum;
  grade: Grade;
  profile: ChildLearnerProfile | null;
  workbooks: readonly { number: number; levels: readonly number[] }[];
  /** The admin's book instructions for the child (workbook-instructions.ts); absent or empty: placement as without. */
  instructions?: WorkbookInstructions | null;
}
export interface PlacementTrace {
  /** I1: the admin's start level. */
  rule: "P0" | "P1" | "P2" | "P3" | "P4" | "P5" | "P9" | "I1";
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

/** The admin's start level, when it can apply: else the plain reason. Kindergarten keeps U1 (P9); never above U27. */
export function instructedStart(o: PlacementInput): { level: CurriculumLevel } | { reason: string } | null {
  const id = o.instructions?.startLevel;
  if (!id) return null;
  const level = o.curriculum.level(id);
  if (!level) return { reason: `The curriculum has no level ${id}.` };
  if (level.number > PLACEMENT_CEILING) return { reason: `It is above U${PLACEMENT_CEILING}, the highest level a book can start at.` };
  if (o.grade === 0) return { reason: "Kindergarten starts at U1." };
  return { level };
}

/** The first matching placement rule decides the start. An admin start level (I1) comes first, then existing workbooks. */
export function placeChild(o: PlacementInput): PlacedChild {
  const levels = o.curriculum.levels.filter(l => l.number <= PLACEMENT_CEILING);
  const signals = bookSignals(o);
  const home = firstLevel(levels, Math.min(signals.working?.working ?? o.grade, 9));
  const decide = (level: CurriculumLevel, rule: PlacementTrace["rule"], reason: string, inLevel = 0, first = true, support: string | null = null): PlacedChild => ({
    level, inLevel, first, support,
    trace: { rule, reason, level: level.id, home: home.id, support, rules: [...new Set([rule, ...(signals.working?.atCeiling && rule === "P5" ? ["P7"] : []), "P8", ...(o.grade === 0 || level.number === PLACEMENT_CEILING ? ["P9"] : [])])] },
  });
  const newest = [...o.workbooks].sort((a,b) => b.number-a.number)[0];
  const wanted = instructedStart(o);
  if (wanted && "level" in wanted) {
    // One level per book (Option A). Weak topics below it get the P6 checks, not the support slot.
    const inLevel = o.workbooks.filter(w => w.levels.includes(wanted.level.number)).length;
    return decide(wanted.level, "I1", `Admin instruction: start at ${wanted.level.id}.`, inLevel, !(newest && newest.levels.length > 0));
  }
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
export function planNextWorkbook(o: PlacementInput & { number: number }, capture?: (input: PlanInput) => void): NextWorkbookResult {
  const ins = instructionsEmpty(o.instructions) ? null : o.instructions!;
  const place = placeChild(ins ? o : { ...o, instructions: null });
  const level = planLevel(o.curriculum, place.level.id);
  if (!level) return { ok: false, reason: `the curriculum has no level ${place.level.id}` };
  const signals = bookSignals({ ...o, allowedStandards: o.curriculum.levels.filter(l => l.number <= place.level.number).flatMap(l => [...l.units]) });
  const outcomes: InstructionOutcome[] = [];
  if (ins?.startLevel) {
    const wanted = instructedStart(o)!;
    const auto = placeChild({ ...o, instructions: null });
    outcomes.push("level" in wanted
      ? { section: "start-level", value: ins.startLevel, applied: true, note: auto.level.id === wanted.level.id
        ? "Same as the automatic placement." : `Instead of the automatic ${auto.level.id}. Weak topics below it get review checks.` }
      : { section: "start-level", value: ins.startLevel, applied: false, note: `${wanted.reason} The book uses the automatic ${auto.level.id}.` });
  }
  if (ins?.difficulty) {
    if (!signals.hasAssessment) outcomes.push({ section: "difficulty", value: ins.difficulty, applied: false, note: "It needs a finished assessment: the stretch rules read the test's results." });
    else {
      // The admin's choice replaces the automatic stretch (section 4, item 2), inside the same curriculum bounds.
      signals.adjustments.stretchShift = ins.difficulty === "harder" ? 2 : 0;
      signals.adjustments.hardChallenge = ins.difficulty === "harder";
      outcomes.push({ section: "difficulty", value: ins.difficulty, applied: true, note: `${difficultyLabel(ins.difficulty)}: ${ins.difficulty === "harder"
        ? "the day's numbers and difficulty start 2 days ahead, and the Challenge uses the hardest allowed questions from Day 1." : "no stretch shift, and the Challenge keeps its usual questions."}` });
    }
  }
  // Teach less units the test found secure (clear or early sign), before a first book's own level marks early ones developing.
  const secureLess = (codes: readonly string[]) => {
    const found = codes.filter(code => signals.hasAssessment && o.profile?.standards.some(s => s.code === code && s.status === "secure"));
    return found.length ? { securePerTest: found } : {};
  };
  const known = new Set((o.profile?.standards ?? []).map(s => s.code));
  const own = new Set(place.level.units);
  const standards = (o.profile?.standards ?? []).map(s => signals.hasAssessment && place.first && own.has(s.code) && s.status === "secure" && s.certainty !== "clear" ? { code: s.code, status: "developing" as const } : s);
  const unassessedUnits = place.first ? place.level.units.filter(u => !known.has(u)) : [];
  const planning: PlanInput = {
    profile: { standards }, grade: o.grade, level, passed: {},
    ...(signals.hasAssessment ? { personal: signals } : {}),
    workbook: { number: o.number, inLevel: place.inLevel },
    reviews: [], missedReviews: [], misses: [], pausedWeeks: 0,
    support: place.support, unassessedUnits,
    ...(ins ? { instructions: { teachMore: [...ins.teachMore], teachLess: [...ins.teachLess], addReview: [...ins.addReview],
      ...secureLess(ins.teachLess), ...(place.trace.rule === "I1" ? { weakBelowChecks: true } : {}) } } : {}),
  };
  // Capture the exact public planner input. A consumer cannot change the plan through this copy.
  capture?.(structuredClone(planning));
  const result = planWorkbook(planning);
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
  if (ins) {
    // In the form's order: by section, then as the admin listed them (the lower gaps after the level itself).
    const sections = ["start-level", "teach-more", "teach-less", "add-review", "difficulty"];
    const listed = (o: InstructionOutcome) => {
      const list = o.section === "teach-more" ? ins.teachMore : o.section === "teach-less" ? ins.teachLess : o.section === "add-review" ? ins.addReview : [ins.startLevel, ins.difficulty];
      const at = list.indexOf(o.value);
      return at < 0 ? list.length : at;
    };
    const all = [...outcomes, ...(plan.instructions?.outcomes ?? [])];
    plan.instructions = { instructions: structuredClone(ins), outcomes: all.map((o, i) => ({ o, i }))
      .sort((a, b) => sections.indexOf(a.o.section) - sections.indexOf(b.o.section) || listed(a.o) - listed(b.o) || a.i - b.i).map(x => x.o) };
  }
  if (plan.personal) plan.personal.why = workbookWhy(plan)!;
  return { ok: true, plan, levelId: place.level.id, placement: trace };
}
