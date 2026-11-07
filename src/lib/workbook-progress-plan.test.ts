import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { planWorkbook, type WorkbookPlan } from "./workbook-plan";
import { bookSignals } from "./workbook-signals";
import { legacyCases, progressFixture, syntheticMiss } from "./workbook-progress-plan.fixture";
import { previewNextWorkbookPlan, type WorkbookPlanPreviewInput } from "./workbook-progress-plan";

// Exact public inputs and outputs captured before the optional planner edit, at 051215df.
// The 20-case artifact SHA256 is fe1476705042bf2a2e1571bcd4448bcb913d110ce6b308c1be6ffdf8ef287a0a.
// Keep these fixed hashes available to shallow CI checkouts without Git history.
const LEGACY_EXPECTED: Record<string, { input: string; result: string }> = {
  "U4-steps-plain": {
    "input": "556245540a8bf5e7c40b1a2a49cbe570b6548e4fc6516ed6404c9190bee30e2d",
    "result": "ba2be623afc9b14533556472b9a6d4fbcc734c50f07ad0b8d607cd8507786b97"
  },
  "U4-steps-personal": {
    "input": "bef773aaae1ecf11009b3bae5ff37e07c4d750351d255e76ec20c8896747940b",
    "result": "ef59c0f6d32e7ba68d706a4edd124960a09e7114061cc0ea3535c4f8a3dae485"
  },
  "U4-steps-review": {
    "input": "214449fff747233ea9bf03eddab1c760ef76e9eb752cd8ad5356890b65066bdf",
    "result": "93efc5bcbb1a633f91020ef6499031674af073379f25c0e61292adf50ab84385"
  },
  "U4-steps-fix-it": {
    "input": "e2c0f70fc2209096a10601b7332ab8b88d80d6340ad61b440a0d882f5c97d338",
    "result": "3efe12b7d56aa48528aee7f6169a1ce5319d25806fb5ed80ee09c23c50cbb6fd"
  },
  "U4-steps-complete-level": {
    "input": "6261fa44f06dd29ef2202b7e2fcc99ddef4e1ad55252cb8d8837467f8b33b6d9",
    "result": "592d27baa06fa34d576da28b83c41647436781c2e7a87b5eaa9bcc9ecdf03d6b"
  },
  "U4-units-plain": {
    "input": "fc271dc0a62eabe0f8ffa0f2c5a2d5b21fdbb2f8a89ac7836d78f81f98a7ed0d",
    "result": "03fe530425c9ba8a68df44163bbbd9dbefc08c54254b26669cfcb113f602b0ea"
  },
  "U4-units-personal": {
    "input": "9cd8d9079a53301b81e0beb3e798b67a740a010e026e926c521897063e18e780",
    "result": "4f1c499f04570d4be5a68e9a7ae0fdc94122cb34a3f73020a304a49ccfd82e2d"
  },
  "U4-units-review": {
    "input": "6f2751027535153e45cbed0d7fa0daae1f3f55c06b1e6e552081c906a404a5f5",
    "result": "70635b111fa780137e590234719fd9650c703e3ae17f084cc637fa424fff9a5e"
  },
  "U4-units-fix-it": {
    "input": "fa75263cafb6be784893fd5b5bf4dd2b8d9f2a9bdfad19d8470a3dfa6e4fb3c7",
    "result": "88c04d409ed19a95e8421cd4a8e40b92253bda98d0489ca890ec3d8da97ad866"
  },
  "U4-units-complete-level": {
    "input": "a0d7d384084adcd5b03781bf0b70cd33bb94e2e158de938e4637ef0366851434",
    "result": "9e1499c58de6dcd8f5db538bab3e3e582fcfdc2b1f0ec5d9274a403e1c7ad425"
  },
  "U16-steps-plain": {
    "input": "ee7113dd55ca8db0434b84c90b0519841e81aefc27385032e859c1d435308baf",
    "result": "143a268dffeaa0d82eb58124e0b50e36d955d6affe02255e4bea6e3cea263cbc"
  },
  "U16-steps-personal": {
    "input": "a9669f2e4971dba5ba849945a9c63381fe7cd5e27e7b2731721873eac8512145",
    "result": "7b3a28124a8317419fae116bebb6b57b398c935278165ae95a9165b0d59863c8"
  },
  "U16-steps-review": {
    "input": "dd2510c0f97c74fe723091267ed283fdeef52331a2c6932800538c248bc49658",
    "result": "8ff89b0720c8ebe24fa530c52e9becae1bc0609a1d7a65afdc663c93083a8c2b"
  },
  "U16-steps-fix-it": {
    "input": "4bf85a1437c7cb6a46030986599d3c4413c48545bde40860bcb76736972b4308",
    "result": "5999861da10960812cc70e6defe8655a8bfa9a1c443911ab7b82cb51f4927052"
  },
  "U16-steps-complete-level": {
    "input": "4772b52d69556e3a8597738750d60f3a51eb6d8e7229cca94898d48fd0ce40b4",
    "result": "1bd0fc27cb9a2c8b9d0455ec5b441bff0c6837dc0028e03e630f10a5ff3efa8d"
  },
  "U16-units-plain": {
    "input": "8d4d38241ae171afd394ebd3ec497f3e07c26d6dcb9dd7124d534cbb743fe61e",
    "result": "9b9825b948b2206ec563403cab6fe47ccae5bb819c87cb96c297146c98506e16"
  },
  "U16-units-personal": {
    "input": "a797a6cd65ae5e840bf7d7f8dea27b076104a59ab1a20d9b84e78b67940b89e0",
    "result": "1cc003605bbfdbac66ae7c9c8236be0b38085419cb2c13bfb88902b9fd61c362"
  },
  "U16-units-review": {
    "input": "acb2a3f803efdd6a7f9b4e762e530fea23fe254db10eb613bf9a8d70ba3e9976",
    "result": "91d4ae8d548f65dc89ac736c1d09f2a952ec878fb3545d780e59c7c0dde069c0"
  },
  "U16-units-fix-it": {
    "input": "c230d32e1163c715c3faf42705bd8897279c2aba87cfcdfe9466305fad5fc2d6",
    "result": "84aeffbc92998c69d5e3df0f65443f0c604d5854eed3e92b1d0be6370b34d89a"
  },
  "U16-units-complete-level": {
    "input": "b9e5180f14e76ceff3ca18bcfeb588db8d6609964df556aa7876b759f55242f9",
    "result": "22fa8db744db7142f1d563c383a494fcfee27458cd58dad5ed6c3971b8581fb7"
  }
};
const hash = (value: object) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

type Fixture = ReturnType<typeof progressFixture>;
function preview(f: WorkbookPlanPreviewInput) {
  const r = previewNextWorkbookPlan(f);
  expect(r.ok, JSON.stringify(r)).toBe(true);
  if (!r.ok) throw new Error(r.reason);
  // Replaying the public planner must produce the complete same plan, not only the metadata.
  expect(planWorkbook(r.planningInput)).toEqual({ ok: true, plan: r.plan });
  return r;
}
const parts = (p: WorkbookPlan) => p.days.flatMap(d => d.pages.flatMap(page => page.parts.map(part => ({ ...part, day: d.day, page: page.number }))));
const selectedTeaching = (p: WorkbookPlan, skill: string) => parts(p).filter(p => p.step?.skill === skill);
const fixItems = (p: WorkbookPlan) => parts(p).flatMap(p => p.fixIt ?? []);
function assertHeld(p: WorkbookPlan, skill: string, target: number) {
  const teaching = selectedTeaching(p, skill);
  expect(teaching.length).toBeGreaterThan(0);
  expect([...new Set(teaching.map(p => p.step!.step))]).toEqual([target]);
}
function establish(f: Fixture, kind: "conceptual" | "careless") {
  const selected = f.curriculum.steps[f.snapshot.selection.step - 1];
  const index = selected.mistakes.findIndex(m => m.kind === "conceptual");
  expect(index).toBeGreaterThanOrEqual(0);
  for (const [n, o] of f.originals.entries()) if (o.first.observation.result === "wrong") o.cause = kind === "careless"
    ? { kind, evidenceId: `cause-${n}`, resultVersion: 1 }
    : { kind, evidenceId: `cause-${n}`, resultVersion: 1, mistake: { stepPosition: selected.position, index } };
}
function repeats(f: Fixture, count: number) {
  f.history.issuedDecisions = Array.from({ length: count }, (_, n) => ({ version: 1, id: `issued-${n}`, workbookId: `issued-book-${n}`,
    parentId: f.snapshot.parentId, childId: f.snapshot.childId, issuedAt: n + 1, curriculum: f.snapshot.curriculum,
    selection: { unit: f.snapshot.selection.unit, skill: f.snapshot.selection.skill, step: f.snapshot.selection.step }, action: "repeat" }));
}
function parentMark(f: Fixture, n: number, result: "right" | "wrong" | "blank") {
  const c = structuredClone(f.originals[n].first);
  c.at = 200; c.provenance = { eventId: `parent-${n}`, model: null, prompt: null };
  Object.assign(c.observation, { method: "parent", state: "parent-checked", actor: "parent", result, resultVersion: 2 });
  f.originals[n].changes = [c]; f.sample[n].resultVersion = 2;
}
function freeze(v: unknown) {
  if (v && typeof v === "object") { Object.freeze(v); Object.values(v).forEach(freeze); }
}
function objects(v: unknown, set = new Set<object>()) {
  if (v && typeof v === "object" && !set.has(v)) { set.add(v); Object.values(v).forEach(x => objects(x, set)); }
  return set;
}

describe("no progress input: exact fixed-base public plan identity", () => {
  it("retains the full fixed baseline distribution", () => {
    expect(legacyCases().map(c => c.name).sort()).toEqual(Object.keys(LEGACY_EXPECTED).sort());
  });
  it.each(legacyCases())("$name", ({ name, input }) => {
    const expected = LEGACY_EXPECTED[name];
    expect(hash(input)).toBe(expected.input);
    const legacy = planWorkbook(input);
    expect(legacy.ok).toBe(true);
    expect(hash(legacy)).toBe(expected.result);
    const result = planWorkbook({ ...input, progress: undefined });
    expect(hash(result)).toBe(expected.result);
    if (result.ok) expect(result.plan).not.toHaveProperty("progress");
  });
});

describe("the preview consumes the public planner", () => {
  it.each([4, 16])("uses every complete boundary distribution at U%i", level => {
    for (const right of [74, 75, 89, 90, 100]) {
      const f = progressFixture(right, 100, 2, level), r = preview(f), skill = f.curriculum.skill.id;
      expect(r.decision.score).toMatchObject({ required: 100, resolved: 100, independentFirstRight: right, percent: right });
      expect(r.plan.progress?.decision.action).toBe(right >= 90 ? "advance" : right >= 75 ? "repeat-new-numbers" : "retain-review");
      expect(r.plan.progress?.decision.representation.request).toBe("keep");
      expect(r.planningInput.passed[skill]).toBe(right >= 90 ? 2 : 1);
      if (right < 90) assertHeld(r.plan, skill, 2);
      else {
        expect(selectedTeaching(r.plan, skill)[0].step?.step).toBe(3);
        expect(selectedTeaching(r.plan, skill).every(p => p.step!.step >= 3)).toBe(true);
      }
      const fix = fixItems(r.plan).find(i => i.skill === skill);
      if (right < 100) {
        expect(fix?.avoid.events).toEqual(r.decision.misses.map(m => m.event));
        expect(fix?.avoid.questions).toEqual(r.decision.misses.map(m => m.question));
        expect(fix?.avoid.events).toHaveLength(100 - right);
      } else expect(fix).toBeUndefined();
    }
  });
  it("returns exact versions, frozen references and used result versions", () => {
    const f = progressFixture(), r = preview(f);
    expect(r.inputVersions).toEqual({ snapshot: 1, history: 1, progress: 1, planning: 1 });
    expect(r.version).toBe(1);
    expect(r.snapshot).toEqual({ id: f.snapshot.id, cutoff: 1000, curriculum: f.snapshot.curriculum,
      scope: f.snapshot.scope, priorMastery: f.snapshot.priorMastery });
    expect(r.evidence.used).toEqual(r.decision.consumed);
    expect(r.evidence.used).toHaveLength(100);
    expect(r.evidence.used.every(x => x.firstVersion === 1 && x.effectiveVersion === 1)).toBe(true);
    expect(r.evidence.held).toEqual({ items: [], originals: [] });
    expect(r.plan.progress).toMatchObject({ version: 1, priorPassedSteps: 1, checkWork: false,
      decision: { version: 1, snapshotId: f.snapshot.id, cutoff: 1000, action: "repeat-new-numbers", reason: "practice" } });
  });
  it("retains an incomplete observed-100 sample without increasing repeat history", () => {
    const f = progressFixture(100);
    f.history.originals = f.originals.slice(0, 99); f.sample[99].resultVersion = null; repeats(f, 2);
    const r = preview(f);
    expect(r.decision).toMatchObject({ action: "retain-unfinished", reason: "incomplete-sample", repeatIncrement: 0,
      score: { required: 100, resolved: 99, independentFirstRight: 99, percent: null } });
    expect(r.plan.progress?.decision.action).toBe("retain-unfinished");
    expect(r.evidence.held.items).toEqual([expect.objectContaining({ status: "missing" })]);
    assertHeld(r.plan, f.curriculum.skill.id, 2);
    expect(preview(f).decision).toEqual(r.decision);
  });
  it.each([null, []])("retains deferred history and caller misses without a sample %j", sample => {
    const f = progressFixture(0, 2); f.snapshot.requiredSample = sample;
    f.planning.misses = [syntheticMiss(f.curriculum.skill.id)];
    const r = preview(f);
    expect(r.decision.action).toBe("retain-unfinished");
    expect(r.decision.repeatIncrement).toBe(0);
    expect(r.evidence.used).toEqual([]);
    expect(r.evidence.held.originals).toEqual(f.originals);
    expect(r.evidence.held.originals[0].first.observation.readAnswerText).toBe("56");
    expect(r.planningInput.misses).toEqual(f.planning.misses);
    expect(fixItems(r.plan)[0].avoid.events).toEqual(["older-event"]);
    assertHeld(r.plan, f.curriculum.skill.id, 2);
  });
  it("uses known conceptual errors for regression and focused-practice intent", () => {
    const f = progressFixture(74); establish(f, "conceptual");
    const r = preview(f), skill = f.curriculum.skill.id;
    assertHeld(r.plan, skill, 1);
    expect(new Set(selectedTeaching(r.plan, skill).map(p => p.day)).size).toBeGreaterThan(1);
    expect(r.planningInput.passed[skill]).toBe(1);
    expect(r.plan.progress).toMatchObject({ checkWork: false, decision: { action: "regress-represent", reason: "conceptual",
      representation: { current: f.curriculum.steps[1].representation, request: "another", maya: false }, parentFollowUp: false } });
    expect(r.plan.progress?.decision.focusedPractice[0]).toMatchObject({ occurrences: 26, stepPosition: f.curriculum.steps[1].position });
    expect(r.plan.progress?.decision.focusedPractice[0].keys).toHaveLength(26);
    expect(fixItems(r.plan)[0].avoid.events).toHaveLength(26);
  });
  it("keeps unknown causes explicit and careless errors on check-work", () => {
    const unknown = progressFixture(74), retained = preview(unknown);
    expect(retained.plan.progress?.decision).toMatchObject({ action: "retain-review", reason: "unknown-cause", focusedPractice: [] });
    assertHeld(retained.plan, unknown.curriculum.skill.id, 2);
    const careless = progressFixture(74); establish(careless, "careless");
    const r = preview(careless);
    assertHeld(r.plan, careless.curriculum.skill.id, 2);
    expect(r.plan.progress).toMatchObject({ checkWork: true, decision: { action: "repeat-check-work", reason: "careless", representation: { request: "keep" } } });
    expect(fixItems(r.plan)[0].avoid.events).toHaveLength(26);
  });
  it.each([0, 1, 2])("consumes %i issued repeats without counting duplicate photos", count => {
    const f = progressFixture(); repeats(f, count);
    f.history.originals = f.originals.flatMap(o => [o, structuredClone(o)]);
    const r = preview(f);
    assertHeld(r.plan, f.curriculum.skill.id, 2);
    expect(r.decision.score.required).toBe(100);
    expect(r.plan.progress?.decision).toMatchObject({ action: count === 2 ? "change-approach" : "repeat-new-numbers",
      repeatIncrement: count === 2 ? 0 : 1, parentFollowUp: count === 2,
      representation: { request: count === 2 ? "another" : "keep", maya: count === 2 } });
    expect(fixItems(r.plan)[0].avoid.events).toHaveLength(20);
  });
  it.each(["repeat", "regress", "change-approach"])("has a binding ignored-input negative control for %s", kind => {
    const f = progressFixture(kind === "regress" ? 74 : 80);
    if (kind === "regress") establish(f, "conceptual");
    if (kind === "change-approach") repeats(f, 2);
    const r = preview(f), skill = f.curriculum.skill.id, target = r.decision.target.step;
    assertHeld(r.plan, skill, target);
    const ignored = planWorkbook({ ...r.planningInput, progress: undefined });
    expect(ignored.ok).toBe(true);
    if (!ignored.ok) throw new Error(ignored.reason);
    expect(() => assertHeld(ignored.plan, skill, target)).toThrow();
    expect(ignored.plan).not.toHaveProperty("progress");
  });
  it.each([74, 80, 90])("blocks the level-count test shortcut with %i percent and an unfinished skill", right => {
    const f = progressFixture(right); f.planning.workbook.inLevel = 100;
    const r = preview(f);
    expect(r.plan.testWorkbook).toBe(false);
    expect(parts(r.plan).some(p => p.kind === "level-test")).toBe(false);
    if (right < 90) assertHeld(r.plan, f.curriculum.skill.id, 2);
    else expect(selectedTeaching(r.plan, f.curriculum.skill.id)[0].step?.step).toBe(3);
    const ignored = planWorkbook({ ...r.planningInput, progress: undefined });
    expect(ignored.ok && ignored.plan.testWorkbook).toBe(true);
  });
  it.each([0, 4])("preserves proven prefix %i during explicit regression", prefix => {
    const f = progressFixture(74); establish(f, "conceptual");
    f.snapshot.priorMastery.passedSteps = prefix; f.planning.passed = { [f.curriculum.skill.id]: prefix };
    const r = preview(f);
    expect(r.planningInput.passed[f.curriculum.skill.id]).toBe(prefix);
    assertHeld(r.plan, f.curriculum.skill.id, 1);
  });
  it("retains a later selected step with zero prior mastery without inventing an earlier pass", () => {
    const f = progressFixture(); f.snapshot.priorMastery.passedSteps = 0; f.planning.passed = {};
    const r = preview(f);
    expect(r.planningInput.passed[f.curriculum.skill.id]).toBe(0);
    assertHeld(r.plan, f.curriculum.skill.id, 2);
  });
  it("keeps the first step valid during regression and advances the first step with a zero prefix", () => {
    const f = progressFixture(0, 3, 1); establish(f, "conceptual");
    const r = preview(f); assertHeld(r.plan, f.curriculum.skill.id, 1);
    expect(r.plan.progress?.decision.representation.request).toBe("another");
    const first = progressFixture(100, 100, 1), advanced = preview(first);
    expect(advanced.planningInput.passed[first.curriculum.skill.id]).toBe(1);
    expect(selectedTeaching(advanced.plan, first.curriculum.skill.id)[0].step?.step).toBe(2);
  });
  it("consumes final-step completion and preserves final-step repeats", () => {
    const f = progressFixture(100, 100, 4), r = preview(f);
    expect(r.decision.action).toBe("skill-complete");
    expect(r.plan.progress?.decision.target.step).toBe(4);
    expect(r.planningInput.passed[f.curriculum.skill.id]).toBe(4);
    expect(selectedTeaching(r.plan, f.curriculum.skill.id)).toEqual([]);
    const repeat = progressFixture(80, 100, 4), next = preview(repeat);
    assertHeld(next.plan, repeat.curriculum.skill.id, 4);
  });
});

describe("real Fix it and the effective original", () => {
  it.each(["none", "math-help"] as const)("removes a successful %s fix without improving first accuracy", help => {
    const f = progressFixture(75), skill = f.curriculum.skill.id;
    f.planning.misses = [{ ...syntheticMiss(skill, "original-99"), question: f.sample[99].question }];
    f.originals[99].secondTries = [{ id: "fixed", at: 300, basedOnResultVersion: 1, result: "right", help }];
    const r = preview(f), fix = fixItems(r.plan).find(i => i.skill === skill)!;
    expect(r.decision.score.percent).toBe(75);
    assertHeld(r.plan, skill, 2);
    expect(fix.avoid.events).toHaveLength(24);
    expect(fix.avoid.events).not.toContain("original-99");
    expect(fix.avoid.questions).not.toContainEqual(f.sample[99].question);
    expect(r.planningInput.misses).not.toContainEqual(f.planning.misses[0]);
  });
  it("distinguishes a parent original adjudication from a later successful try", () => {
    const f = progressFixture(89), skill = f.curriculum.skill.id;
    Object.assign(f.originals[99].first.observation, { state: "pending", result: null, certainty: "uncertain", readAnswerText: "5?", regions: [] });
    parentMark(f, 99, "right");
    const r = preview(f);
    expect(r.decision.score.percent).toBe(90);
    expect(selectedTeaching(r.plan, skill)[0].step?.step).toBe(3);
    expect(r.decision.items.find(i => i.first?.provenance.eventId === "original-99")?.first?.observation.readAnswerText).toBe("5?");
    expect(fixItems(r.plan)[0].avoid.events).not.toContain("original-99");
    const later = progressFixture(89);
    later.originals[99].secondTries = [{ id: "later-fix", at: 300, basedOnResultVersion: 1, result: "right", help: "none" }];
    const fixed = preview(later);
    expect(fixed.decision.score.percent).toBe(89);
    assertHeld(fixed.plan, skill, 2);
  });
  it("retains a later wrong parent original despite an older successful fix", () => {
    const f = progressFixture(89); parentMark(f, 99, "wrong");
    f.originals[99].secondTries = [{ id: "old-fix", at: 150, basedOnResultVersion: 1, result: "right", help: "none" }];
    const r = preview(f);
    expect(fixItems(r.plan)[0].avoid.events).toContain("original-99");
    expect(fixItems(r.plan)[0].avoid.questions).toContainEqual(f.sample[99].question);
  });
  it("keeps every other skill's passed, reviews, misses and avoidance", () => {
    const f = progressFixture(), other = f.planning.level.units[0].skills[3].id;
    f.planning.passed = { ...f.planning.passed, [other]: 1 };
    f.planning.reviews = [{ skill: other, step: 1, interval: 2, due: 8 }];
    f.planning.missedReviews = [{ skill: other, step: 1, interval: 0, due: 0 }];
    f.snapshot.reviews = structuredClone(f.planning.reviews); f.snapshot.missedReviews = structuredClone(f.planning.missedReviews);
    f.planning.misses = [syntheticMiss(other), syntheticMiss(f.curriculum.skill.id, "outside-this-step")];
    const r = preview(f);
    expect(r.planningInput.passed[other]).toBe(1);
    expect(r.planningInput.reviews).toEqual(f.planning.reviews);
    expect(r.planningInput.missedReviews).toEqual(f.planning.missedReviews);
    for (const m of f.planning.misses) expect(r.planningInput.misses).toContainEqual(m);
    const fix = fixItems(r.plan).find(i => i.skill === other)!;
    expect(fix.avoid).toEqual({ events: ["older-event"], questions: [f.planning.misses[0].question] });
    expect(fix.reviews).toEqual([{ step: 1, interval: 0 }]);
    expect(parts(r.plan).flatMap(p => p.reviews ?? [])).toContainEqual({ skill: other, step: 1, interval: 2 });
  });
  it("preserves personal review ownership and Fix it before the selected skill's teaching day", () => {
    const f = progressFixture(); f.planning.personal = { ...bookSignals({ grade: f.planning.grade, profile: null }), hasAssessment: true };
    const r = preview(f);
    assertHeld(r.plan, f.curriculum.skill.id, 2);
    expect(fixItems(r.plan)[0].avoid.events).toHaveLength(20);
    expect(r.plan.days.every(d => d.pages.length === 8)).toBe(true);
    expect(parts(r.plan).filter(p => p.kind === "fix-it").every(p => p.page === 1 && p.day <= 5 && p.items <= 3)).toBe(true);
  });
});

describe("bounded refusal and input ownership", () => {
  it("keeps mastery-gap as a refusal", () => {
    const f = progressFixture(100); f.snapshot.priorMastery.passedSteps = 0; f.planning.passed = {};
    expect(previewNextWorkbookPlan(f)).toEqual({ ok: false, version: 1, reason: "mastery-gap" });
  });
  it.each(["preview", "snapshot", "history", "curriculum", "context", "result", "child", "unit", "skill", "step", "level", "page-budget", "prior", "review", "missed-review", "miss-question"])("refuses a %s mismatch", part => {
    const f = progressFixture();
    if (part === "preview") Object.assign(f, { version: 2 });
    if (part === "snapshot") Object.assign(f.snapshot, { version: 2 });
    if (part === "history") Object.assign(f.history, { version: 2 });
    if (part === "curriculum") f.curriculum.version = "other-version";
    if (part === "context") f.sample[0].contextVersion = 2;
    if (part === "result") f.sample[0].resultVersion = 2;
    if (part === "child") f.originals[0].childId = "foreign-child";
    if (part === "unit") f.snapshot.selection.unit = "other-unit";
    if (part === "skill") f.snapshot.selection.skill = "other-skill";
    if (part === "step") f.snapshot.selection.step = 999;
    if (part === "level") f.planning.level.number = 16;
    if (part === "page-budget") f.curriculum.steps = f.curriculum.steps.map((s, i) => ({ ...s, pages: s.pages + (i === 0 ? 1 : 0) }));
    if (part === "prior") f.planning.passed = {};
    if (part === "review") f.planning.reviews = [{ skill: f.curriculum.skill.id, step: 1, interval: 0, due: 1 }];
    if (part === "missed-review") f.planning.missedReviews = [{ skill: f.curriculum.skill.id, step: 1, interval: 0, due: 1 }];
    if (part === "miss-question") f.planning.misses = [syntheticMiss(f.curriculum.skill.id, "original-99")];
    const r = previewNextWorkbookPlan(f);
    expect(r.ok).toBe(false); expect(r).not.toHaveProperty("plan"); expect(r).not.toHaveProperty("decision");
    expect(JSON.stringify(r)).not.toContain("56");
  });
  it("refuses unsafe unit progression, school scope and contradictory advance prefixes", () => {
    const units = progressFixture(); units.planning.progression = "units";
    expect(previewNextWorkbookPlan(units)).toMatchObject({ ok: false, reason: "unsupported-plan-policy", policy: "unit-progression" });
    const above = progressFixture(80, 100, 2, 16); above.planning.grade = 1;
    expect(previewNextWorkbookPlan(above)).toMatchObject({ ok: false, reason: "unsupported-plan-policy", policy: "school-scope" });
    const prefix = progressFixture(100); prefix.snapshot.priorMastery.passedSteps = 4; prefix.planning.passed = { [prefix.curriculum.skill.id]: 4 };
    expect(previewNextWorkbookPlan(prefix)).toMatchObject({ ok: false, reason: "unsupported-plan-policy", policy: "advance-with-higher-prefix" });
  });
  it("does not unlock dependent skills just by scheduling retained work", () => {
    const f = progressFixture(), r = preview(f), skill = f.curriculum.skill.id;
    const dependants = f.planning.level.units.flatMap(u => u.skills).filter(s => s.id !== skill && s.id === "1.1-read-write-20");
    expect(dependants).toHaveLength(1);
    expect(r.plan.newSteps.some(s => dependants.some(d => d.id === s.skill))).toBe(false);
  });
  it("returns an explicit refusal when a selected target cannot be scheduled", () => {
    const f = progressFixture(80, 100, 2, 4, "1.1-read-write-20");
    expect(previewNextWorkbookPlan(f)).toEqual({ ok: false, version: 1, reason: "unsupported-plan-policy", policy: "target-not-scheduled" });
    // The same target fits once its required skill has an explicit proven prefix.
    f.planning.passed = { ...f.planning.passed, "1.1-count-to-20": 4 };
    const r = preview(f);
    assertHeld(r.plan, f.curriculum.skill.id, 2);
  });
  it.each(["version", "target", "passed", "action", "representation"])("public planner refuses malformed progress %s", part => {
    const r = preview(progressFixture()), p = structuredClone(r.planningInput), d = p.progress!.decision;
    if (part === "version") Object.assign(p.progress!, { version: 2 });
    if (part === "target") d.target.step = 999;
    if (part === "passed") d.passed = {};
    if (part === "action") Object.assign(d, { action: "unknown-action" });
    if (part === "representation") d.representation.request = "another";
    expect(planWorkbook(p).ok).toBe(false);
  });
  it("refuses malformed runtime JSON", () => {
    expect(previewNextWorkbookPlan(null as unknown as WorkbookPlanPreviewInput)).toEqual({ ok: false, version: 1, reason: "invalid-contract" });
  });
  it("owns its output and preserves frozen caller objects", () => {
    const f = progressFixture(), before = JSON.stringify(f); freeze(f);
    const r = preview(f), inputObjects = objects(f);
    expect([...objects(r)].filter(o => inputObjects.has(o))).toEqual([]);
    expect(JSON.stringify(f)).toBe(before);
    r.plan.days[0].pages[0].parts[0].skills.length = 0;
    r.decision.items[0].first!.observation.readAnswerText = "mutated output";
    expect(JSON.stringify(f)).toBe(before);
    const next = progressFixture(), result = preview(next), saved = JSON.stringify(result);
    next.originals[0].first.observation.readAnswerText = "mutated caller";
    next.planning.level.units = [];
    expect(JSON.stringify(result)).toBe(saved);
  });
});
