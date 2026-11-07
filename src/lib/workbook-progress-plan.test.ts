import { beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { planWorkbook, type WorkbookPlan } from "./workbook-plan";
import { bookSignals } from "./workbook-signals";
import { legacyCases, progressFixture, syntheticMiss } from "./workbook-progress-plan.fixture";
import { previewNextWorkbookPlan, type WorkbookPlanPreviewInput } from "./workbook-progress-plan";

const BASE = "051215dfcff447a3ebe85762a9b2e5a029c18f6b";
let basePlanner: typeof planWorkbook;
beforeAll(async () => {
  // Load only the pinned planner from Git into memory. Resolve its unchanged imports in this checkout.
  const root = process.cwd();
  const source = execFileSync("git", ["show", `${BASE}:src/lib/workbook-plan.ts`], { encoding: "utf8" });
  const result = await build({ stdin: { contents: 'export {planWorkbook} from "./src/lib/workbook-plan";', resolveDir: root, loader: "ts" },
    bundle: true, write: false, platform: "node", format: "cjs", target: "node22", logLevel: "silent",
    tsconfigRaw: { compilerOptions: {} }, alias: { "@": root + "/src" },
    plugins: [{ name: "fixed-base-planner", setup(b) { b.onLoad({ filter: /[/\\]workbook-plan\.ts$/ }, () => ({ contents: source, loader: "ts", resolveDir: root + "/src/lib" })); } }],
  });
  const mod = { exports: {} as { planWorkbook: typeof planWorkbook } };
  new Function("module", "exports", "require", result.outputFiles[0].text)(mod, mod.exports, createRequire(import.meta.url));
  basePlanner = mod.exports.planWorkbook;
});

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
  it.each(legacyCases())("$name", ({ input }) => {
    const previous = basePlanner(input);
    expect(previous.ok).toBe(true);
    expect(JSON.stringify(planWorkbook(input))).toBe(JSON.stringify(previous));
    const result = planWorkbook({ ...input, progress: undefined });
    expect(JSON.stringify(result)).toBe(JSON.stringify(previous));
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
    const ignored = basePlanner(r.planningInput);
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
    const ignored = basePlanner(r.planningInput);
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
