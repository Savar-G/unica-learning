// Synthetic public-interface fixtures. No stored family data is used.
import { BC_SKILL_MAP, type Grade } from "./assessment";
import { curriculumFor, curriculumVersion, type CurriculumSkill } from "./workbook-curriculum";
import { planLevel, type PlanInput, type UnresolvedMiss } from "./workbook-plan";
import { bookSignals } from "./workbook-signals";
import type { ProgressCurriculum, ProgressHistory, ProgressOriginal, ProgressSampleItem, ProgressSnapshot } from "./workbook-progress";

const bc = curriculumFor("bc")!;
export function planningFixture(levelNumber = 4): PlanInput {
  return { profile: { standards: [] }, grade: Math.floor((levelNumber - 1) / 3) as Grade,
    level: planLevel(bc, `U${levelNumber}`)!, passed: {}, workbook: { number: 2, inLevel: 1 },
    reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [] };
}
export const syntheticMiss = (skill: string, event = "older-event"): UnresolvedMiss => ({ skill, event,
  question: { source: "workbook", workbookId: "older-book", page: 1, question: 1 },
  result: "wrong", mistake: null, stuckStep: null });

export function legacyCases(): { name: string; input: PlanInput }[] {
  return [4, 16].flatMap(levelNumber => (["steps", "units"] as const).flatMap(progression => {
    const base = { ...planningFixture(levelNumber), progression };
    const skill = base.level.units.flatMap(u => u.skills).find(s => s.delivery === "new-step")!;
    const personal = { ...bookSignals({ grade: base.grade, profile: null }), hasAssessment: true };
    return [
      { name: "plain", input: base },
      { name: "personal", input: { ...base, personal } },
      { name: "review", input: { ...base, passed: { [skill.id]: 1 }, reviews: [{ skill: skill.id, step: 1, interval: 0, due: 1 }], missedReviews: [{ skill: skill.id, step: 1, interval: 0, due: 0 }] } },
      { name: "fix-it", input: { ...base, misses: [syntheticMiss(skill.id)] } },
      { name: "complete-level", input: { ...base, passed: Object.fromEntries(base.level.units.flatMap(u => u.skills.filter(s => s.delivery !== "warm-up").map(s => [s.id, s.steps.length || 3]))) } },
    ].map(x => ({ ...x, name: `U${levelNumber}-${progression}-${x.name}` }));
  }));
}

export function progressFixture(right = 80, total = 100, step = 2, levelNumber = 4, skillId?: string) {
  const planning = planningFixture(levelNumber);
  const skill = bc.levelSkills(`U${levelNumber}`)!.find(s => s.delivery === "new-step" && bc.skillSteps(s.id)!.length >= 3 && (!skillId || s.id === skillId))!;
  const curriculum: ProgressCurriculum & { skill: CurriculumSkill } = {
    key: "bc", version: curriculumVersion("bc")!, skill: structuredClone(skill), steps: structuredClone(bc.skillSteps(skill.id)!),
  };
  const selection = { unit: skill.unit, skill: skill.id, step };
  const snapshot: ProgressSnapshot = { version: 1, id: "synthetic-snapshot", parentId: "synthetic-parent", childId: "synthetic-child", cutoff: 1000,
    selection: { ...selection, approvalReference: "synthetic-approval" }, curriculum: { key: curriculum.key, version: curriculum.version },
    priorMastery: { passedSteps: step - 1, evidenceReference: "synthetic-prior-proof" },
    scope: [{ workbookId: "synthetic-book", printedRevision: "revision-1", days: [1, 2, 3, 4, 5, 6, 7] }],
    requiredSample: [], reviews: [], missedReviews: [] };
  const sample: ProgressSampleItem[] = [], originals: ProgressOriginal[] = [];
  for (let n = 0; n < total; n++) {
    const expected: ProgressSampleItem["expected"] = { identity: { workbookId: "synthetic-book", printedRevision: "revision-1", pageId: `page-${n}`, itemId: `item-${n}` },
      number: 1, method: "code", scoredRegions: ["answer"], mastery: { eligible: true, reason: null },
      teaching: { curriculum: snapshot.curriculum, part: "now-you", slot: `slot-${n}`, practiceType: "now-you", itemStep: selection } };
    sample.push({ expected, contextVersion: 1, day: 1, question: { source: "workbook", workbookId: "synthetic-book", page: n + 1, question: 1 }, resultVersion: 1 });
    originals.push({ parentId: snapshot.parentId, childId: snapshot.childId, day: 1,
      first: { at: 100, provenance: { eventId: `original-${n}`, model: "synthetic-reader", prompt: "synthetic-prompt" },
        observation: { version: 1, identity: expected.identity, evidence: { photoRevision: "synthetic-photo" }, readAnswerText: n < right ? "13" : "56",
          regions: [{ regionId: "answer", text: n < right ? "13" : "56", value: n < right ? "13" : "56", certainty: "certain" }],
          certainty: "certain", state: "scored", method: "code", result: n < right ? "right" : "wrong", teaching: expected.teaching,
          mastery: expected.mastery, help: "none", actor: "system", resultVersion: 1 } }, changes: [], secondTries: [], cause: { kind: "unknown" } });
  }
  snapshot.requiredSample = sample;
  planning.passed = { [skill.id]: step - 1 };
  const history: ProgressHistory = { version: 1, originals, issuedDecisions: [] };
  const schoolGrade = BC_SKILL_MAP.standards.find(s => s.code === skill.unit)!.grade;
  return { version: 1 as const, snapshot, curriculum, history, planning, sample, originals, schoolGrade };
}
