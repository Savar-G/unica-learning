import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { BC_SKILL_MAP } from "@/lib/assessment";
import { bookSignals, type BookSignals, type BookStandard } from "@/lib/workbook-signals";
import { planNextWorkbook } from "@/lib/workbook-placement";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { dayDifficulty, planWorkbook, type PlanInput, type WorkbookPlan } from "@/lib/workbook-plan";
import { bookPersona, firstCustomerProfile, sampleChild, samplePlanInput } from "@/lib/workbook-sample-profiles";

const BC = curriculumFor("bc")!;
const plan = (i: PlanInput): WorkbookPlan => {
  const r = planWorkbook(i);
  if (!r.ok) throw new Error(r.reason);
  return r.plan;
};
const first = (level: string) => plan(samplePlanInput(BC, sampleChild(BC, level)!, "first"));

describe("the step progression (#489)", () => {
  it("starts the next step on every teaching day, spread over a window of the level's skills, with no second unit", () => {
    for (const level of ["U4", "U10", "U14", "U26"]) {
      const p = first(level);
      expect(p.units.B, level).toBeNull();
      expect(p.newSteps.map((s) => s.day), level).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      // The first skill in skeleton order starts the book; each skill's steps come in their own order.
      const own = BC.levelSkills(level)!;
      expect(p.newSteps[0].skill, level).toBe(own.find((s) => s.delivery !== "warm-up" && s.requires.every((r) => !own.some((o) => o.id === r)))!.id);
      for (const skill of new Set(p.newSteps.map((s) => s.skill))) {
        const mine = p.newSteps.filter((s) => s.skill === skill).map((s) => s.step);
        expect(mine, `${level} ${skill}`).toEqual([...mine].sort((a, b) => a - b));
      }
      // A skill starts only when its prerequisites in the level are all taught on earlier days.
      for (const s of p.newSteps) for (const r of BC.skill(s.skill)!.requires.filter((r) => own.some((o) => o.id === r))) {
        const steps = BC.skillSteps(r)!.length;
        expect(p.newSteps.filter((x) => x.skill === r && x.day < s.day).length, `${level} ${s.skill} needs ${r}`).toBe(steps);
      }
      // Several of the level's skills, not one for most of the book (the U4 review, item 13).
      expect(new Set(p.newSteps.map((s) => s.skill)).size, level).toBeGreaterThanOrEqual(3);
      expect(p.days.flatMap((d) => d.pages).some((pg) => pg.type === "unit-b"), level).toBe(false);
    }
  });

  it("aims every teaching part at the day's step, the Challenge too", () => {
    const p = first("U4");
    for (const d of p.days.filter((d) => d.day <= 9)) {
      const today = p.newSteps.find((s) => s.day === d.day)!;
      for (const part of d.pages.flatMap((pg) => pg.parts).filter((x) => x.step)) expect(part.step, `day ${d.day} ${part.kind}`).toEqual({ unit: today.unit, skill: today.skill, step: today.step });
      expect(d.pages.flatMap((pg) => pg.parts).some((x) => x.kind === "challenge" && x.step?.skill === today.skill && x.step.step === today.step)).toBe(true);
    }
  });

  it("reviews only steps already done before the day: this book's earlier days, passed steps or earlier levels", () => {
    for (const level of ["U4", "U14"]) {
      const p = first(level);
      const own = new Set(BC.levelSkills(level)!.map((s) => s.id));
      for (const d of p.days) for (const part of d.pages.flatMap((pg) => pg.parts)) {
        for (const r of part.reviewSteps ?? []) {
          if (["unit-check", "already-know-it", "level-test"].includes(part.kind)) continue;
          if (own.has(r.skill)) expect(p.newSteps.some((s) => s.skill === r.skill && s.step === r.step && s.day < d.day) || part.kind === "show-what-you-know", `${level} day ${d.day} ${part.kind} ${r.skill}#${r.step}`).toBe(true);
          else expect(BC.levelOfSkill(r.skill)!.number, `${level} ${r.skill}`).toBeLessThan(BC.level(level)!.number);
        }
      }
    }
  });

  it("keeps the unit A and B schedule on request, for plans made before #489", () => {
    const i = samplePlanInput(BC, sampleChild(BC, "U10")!, "first");
    expect(plan({ ...i, progression: "units" }).units.B).not.toBeNull();
  });
});

// Reviewed eight-page plans across all bands. Hash the complete serialized result, including property order.
// Updated 2026-11-17 after a path-by-path diff against 32c54d09: eight pages a day at U1, U19 and U27, learning
// stages, Watch one taught once, the per-day application cap (applicationItems) and the counts these move. No page made
// optional, no hints or day count changed. Tool and record: the overnight brief "plan snapshot hash".
const GOLDEN: Record<string, string> = {
  "U1-first": "bdb813ebb6b7646592e072762965dc3f88fd94e097e2aa5ff50bb6000858aad9",
  "U1-second": "f84df7bf6a4dbe7ef396f47011d409fd8d425805e9d1f59a490fd73ba3655dfc",
  "U1-test": "e55ea5a4858e6fad0706388043bcf1731caff87dced8f82aefcf1d7482599f22",
  "U4-first": "6f45f29400af9b7784f38c05b8be8dad80e324461f207319f7fc5cfa603603c1",
  "U4-second": "08ef9250caa7ead62482ba1b3062c1bfee35410d9b3b142864d270b1f33afd06",
  "U4-test": "a933145b0600deb539194f048209d4777f217e96abd7a2c4fb32b3a541e30f30",
  "U10-first": "74b26e56cc409d9915b8a4fb16735d49551693a965047dec5b91c3f191eca5d7",
  "U10-second": "ff5f33583b042227709b0b1c6630dd2ce0dd8f5833f6c67d4d5cf4e7c4f74277",
  "U10-test": "35093b3429519eb3bae8f690a5e56382dafe9740e8b273f45f4c41cf45416069",
  "U16-first": "b6f594b2583841fc66f98c79c5c5f68a2dc24a944ae2e353c17c8ec78cc88aeb",
  "U16-second": "1c7a336e988290bc0a5e09684d3f881aaceb05d9cb373eadcd93380a659b0955",
  "U16-test": "3003a3de23131abb4c8f1fe1dc75bbd5f9255e9f708356ca0e0741bdd055711d",
  "U19-first": "b18e2f35b3aee7c38b58c74bd79081d2542c9bd9fe8757381ece7c5f14ac5a7c",
  "U19-second": "4b6a838c18164e113421e1fdddf9253c8ada06375bd9672d8ecc9d397281e77c",
  "U19-test": "512efc6a70befceb34c9cf026a5cb9747dd61e2b886637401b428d44e5d83e00",
  "U27-first": "55790aad0d1b60b0564f1c35d1fe6930c821afc9e055eacb615a61a10793a1be",
  "U27-second": "db90fc679ad20e51bd3b15fb07473cbede958eba948c387d3e29b19e0ec8548a",
  "U27-test": "0c57ec11fed49abc4c21fa4e079d6b754d955c5b2a04cdfcf77423dc0a7df4fb",
};

const personalInput = (level = "U16", persona: "ahead" | "catch-up" | "on-level" | "rushed" = "ahead"): PlanInput & { personal: BookSignals } => {
  const profile = bookPersona(persona).profile;
  const i = samplePlanInput(BC, sampleChild(BC, level)!, "first");
  return { ...i, grade: 4, personal: bookSignals({ grade: 4, profile }) };
};
const withWeak = (i: ReturnType<typeof personalInput>, codes: string[], certainty: BookStandard["certainty"] = "early-sign") => {
  const result = structuredClone(i);
  result.personal.weak = codes.map(code => ({ code, grade: BC_SKILL_MAP.standards.find(s => s.code === code)!.grade, status: "needs-attention", certainty, aboveGrade: Number(code.split(".")[0]) > i.grade }));
  result.personal.earlyWeak = result.personal.weak.filter(s => s.certainty === "early-sign");
  result.personal.clearlyWeak = result.personal.weak.filter(s => s.certainty === "clear");
  result.personal.secure = result.personal.secure.filter(s => !codes.includes(s.code));
  return result;
};
const dayParts = (p: WorkbookPlan, day: number) => p.days[day - 1].pages.flatMap(pg => pg.parts);

describe("C3 personal plan", () => {
  it("R599-P1: plans the first Kindergarten book with today's steps when no earlier review exists", () => {
    const profile = firstCustomerProfile();
    profile.grade = 0;
    profile.assessment!.profile.test.grade = 0;
    profile.assessment!.profile.level = { working: 0, certainty: "clear", confidence: "normal", atCeiling: false };
    profile.standards = BC.level("U1")!.units.map(code => ({ ...profile.standards[0], code, status: "needs-attention", certainty: "clear", aboveGrade: false }));
    const r = planNextWorkbook({ curriculum: BC, grade: 0, profile, workbooks: [], number: 1 });
    if (!r.ok) throw new Error(r.reason);
    expect(r.levelId).toBe("U1");
    const today = r.plan.newSteps.filter(s => s.day === 1).map(({ skill, step }) => ({ skill, step }));
    expect(today.length).toBeGreaterThan(0);
    const reviews = dayParts(r.plan, 1).filter(p => p.kind === "remember-these");
    expect(reviews.length).toBeGreaterThan(0);
    for (const p of reviews) {
      expect(p.reviewSteps).toEqual(today);
      expect(p.skills).toEqual(today.map(s => s.skill));
      expect(p.items).toBeGreaterThan(0);
    }
    for (const d of r.plan.days) {
      expect(d.pages).toHaveLength(8);
      for (const p of dayParts(r.plan, d.day)) if (p.items > 0) expect(p.skills.length).toBeGreaterThan(0);
    }
    expect(r.plan.personal).toMatchObject({ reviewFallbacks: expect.arrayContaining([
      expect.objectContaining({ day: 1, part: "remember-these", source: "today", steps: today }),
    ]) });
  });

  it("checks Kindergarten without hints when pause days have no learning to review", () => {
    const i = personalInput("U1");
    i.pausedWeeks = 2;
    const p = plan(i);
    expect(p.newSteps.some(s => s.day <= 2)).toBe(false);
    for (const day of p.days.slice(0, 2)) {
      expect(day.pages).toHaveLength(8);
      for (const page of day.pages) expect(page.parts.reduce((sum, part) => sum + part.items, 0)).toBeGreaterThan(0);
      const checks = dayParts(p, day.day).filter(part => part.kind === "already-know-it");
      expect(checks.length).toBeGreaterThan(0);
      for (const check of checks) {
        expect(check.hints).toBe(false);
        expect(check.items).toBeGreaterThanOrEqual(6);
        expect(check.step).toBeNull();
        expect(check.skills.every(skill => BC.levelOfSkill(skill)!.number === 1)).toBe(true);
      }
    }
    expect(p.personal!.reviewFallbacks!.some(f => f.source === "placement-check")).toBe(true);
  });

  it("R599-P1: uses code steps below the start when the day has no teaching step", () => {
    const i = personalInput("U4");
    i.pausedWeeks = 2;
    i.personal.secure = [];
    i.profile.standards = [];
    // Coins are not among U4's prerequisite review candidates.
    i.level.codeReviewSteps = { "K11-describe-coins": [2] };
    const p = plan(i);
    expect(p.newSteps.some(s => s.day <= 2)).toBe(false);
    const reviews = dayParts(p, 1).filter(p => p.kind === "remember-these");
    expect(reviews.length).toBeGreaterThan(0);
    for (const r of reviews) {
      expect(r.reviewSteps).toEqual([{ skill: "K11-describe-coins", step: 2 }]);
      for (const s of r.reviewSteps ?? []) {
        expect(BC.levelOfSkill(s.skill)!.number).toBeLessThan(4);
        expect(s.step !== null && i.level.codeReviewSteps![s.skill].includes(s.step)).toBe(true);
      }
    }
    expect(p.personal).toMatchObject({ reviewFallbacks: expect.arrayContaining([
      expect.objectContaining({ day: 1, source: "below-start" }),
    ]) });
  });

  it("reviews only workbook-taught steps or code steps below the start in the first customer's book", () => {
    const r = planNextWorkbook({ curriculum: BC, grade: 4, profile: firstCustomerProfile(), workbooks: [], number: 1 });
    if (!r.ok) throw new Error(r.reason);
    const forbidden = new Set(["5.2", "5.3", "5.4", "5.5", "5.6"]);
    for (const d of r.plan.days) for (const p of dayParts(r.plan, d.day)) {
      if (p.step || ["warm-up", "in-your-head", "unit-check", "already-know-it", "level-test"].includes(p.kind)) continue;
      for (const skill of p.skills) {
        expect(forbidden.has(BC.skill(skill)!.unit), `day ${d.day} ${p.kind}: ${skill}`).toBe(false);
        expect(p.reviewSteps?.some(s => s.skill === skill), `day ${d.day} ${p.kind}: ${skill} needs a review step`).toBe(true);
      }
      for (const s of p.reviewSteps ?? []) {
        const level = BC.levelOfSkill(s.skill)!.number;
        if (level < 16) {
          const step = BC.skillSteps(s.skill)!.find(t => t.number === s.step);
          expect(step?.templates?.length, s.skill).toBeGreaterThan(0);
        } else expect(r.plan.newSteps.some(t => t.skill === s.skill && t.step === s.step && t.day < d.day)
          || p.kind === "show-what-you-know" && r.plan.newSteps.some(t => t.skill === s.skill && t.step === s.step && t.day <= d.day), `day ${d.day}: ${s.skill}#${s.step}`).toBe(true);
      }
    }
    expect(r.plan.personal).toMatchObject({ notReviewed: expect.arrayContaining([...forbidden].map(unit => expect.objectContaining({
      unit, reason: "not reviewed: taught in a later book",
    }))) });
  });

  it("keeps a same-level step passed in an earlier workbook in personal review", () => {
    const i = personalInput();
    const skill = BC.levelSkills("U16")!.find(s => s.unit === "5.5")!.id;
    i.passed = { [skill]: 1 };
    i.workbook = { number: 2, inLevel: 1 };
    const p = plan(i);
    const reviews = dayParts(p, 1).filter(p => p.kind === "remember-these");
    expect(reviews.flatMap(p => p.skills)).toContain(skill);
    expect(reviews.flatMap(p => p.reviewSteps ?? [])).toContainEqual({ skill, step: 1 });
  });

  it.each([{ codeSteps: [] }, { codeSteps: [2] }])("uses only the supplied code review steps for a lower-level skill: $codeSteps", ({ codeSteps }) => {
    const i = withWeak(personalInput(), ["4.4"]);
    const skill = BC_SKILL_MAP.standards.find(s => s.code === "4.4")!.skills[0].id;
    i.level.codeReviewSteps = { ...i.level.codeReviewSteps, [skill]: codeSteps };
    i.profile = { standards: [{ code: "4.4", status: "developing" }] };
    const p = plan(i);
    const refs = p.days.flatMap(d => dayParts(p, d.day).flatMap(p => p.reviewSteps ?? [])).filter(s => s.skill === skill);
    if (!codeSteps.length) expect(refs).toEqual([]);
    else {
      expect(refs.length).toBeGreaterThan(0);
      expect(refs.every(s => s.step !== null && codeSteps.includes(s.step))).toBe(true);
    }
  });

  it("does not treat a missed workbook question as proof that its unit was taught", () => {
    const i = personalInput();
    const skill = BC.levelSkills("U16")!.find(s => s.unit === "5.5")!.id;
    i.grade = 5;
    i.workbook = { number: 2, inLevel: 1 };
    i.profile = { standards: [{ code: "5.5", status: "needs-attention" }] };
    i.misses = [{ skill, question: { source: "workbook", workbookId: "00000000-0000-4000-8000-000000000001", page: 9, question: 1 },
      event: "untaught-review", result: "wrong", mistake: null, stuckStep: null }];
    const p = plan(i);
    const fixes = dayParts(p, 1).filter(p => p.kind === "fix-it");
    expect(fixes.flatMap(p => p.skills)).not.toContain(skill);
    expect(fixes.flatMap(p => p.fixIt ?? []).some(f => f.skill === skill)).toBe(false);
  });

  it("R523-P1: keeps lower secure skills out of the first customer's Remember these candidates before their review is due", () => {
    const profile = firstCustomerProfile();
    const r = planNextWorkbook({ curriculum: BC, grade: 4, profile, workbooks: [], number: 1 });
    if (!r.ok) throw new Error(r.reason);
    const lowerSecure = new Set(profile.standards.filter(s => s.status === "secure")
      .flatMap(s => BC_SKILL_MAP.standards.find(t => t.code === s.code)!.skills.map(s => s.id))
      .filter(id => BC.levelOfSkill(id)!.number < 16));
    const firstReview = r.plan.days[0].pages[6].parts.find(p => p.kind === "remember-these")!;
    expect(firstReview.items).toBe(8);
    expect(firstReview.skills.length).toBeGreaterThan(0);
    for (const d of r.plan.days) for (const p of dayParts(r.plan, d.day).filter(p => p.kind === "remember-these")) {
      expect(p.skills.filter(id => lowerSecure.has(id)), `day ${d.day}: skills`).toEqual([]);
      expect((p.reviewSteps ?? []).filter(s => lowerSecure.has(s.skill)), `day ${d.day}: steps`).toEqual([]);
    }
    // The rule limits Remember these, not the prerequisites available to story and mixed-work parts.
    expect(r.plan.days.flatMap(d => d.pages.flatMap(pg => pg.parts.filter(p => ["word-problems", "mixed-set"].includes(p.kind))
      .flatMap(p => p.reviewSteps ?? []))).some(s => lowerSecure.has(s.skill))).toBe(true);
  });

  it("R523-P1: allows a lower secure skill in Remember these when its carried review becomes due", () => {
    const i = personalInput();
    const skill = BC_SKILL_MAP.standards.find(s => s.code === "4.4")!.skills[0].id;
    i.reviews = [{ skill, step: 1, interval: 2, due: 3 }];
    const p = plan(i);
    for (const day of [1, 2]) {
      const remember = dayParts(p, day).filter(p => p.kind === "remember-these");
      expect(remember.flatMap(p => p.skills)).not.toContain(skill);
      expect(remember.flatMap(p => p.reviewSteps ?? []).some(r => r.skill === skill)).toBe(false);
    }
    const due = dayParts(p, 3).filter(p => p.kind === "remember-these");
    expect(due.flatMap(p => p.skills)).toContain(skill);
    expect(due.flatMap(p => p.reviewSteps ?? [])).toContainEqual({ skill, step: 1 });
  });

  it.each(["U7", "U27"])("R523-P2: %s test workbooks keep all blocks and record a weekly-time shortfall instead of refusing", level => {
    const i = samplePlanInput(BC, sampleChild(BC, level)!, "test");
    const profile = firstCustomerProfile();
    profile.grade = i.grade;
    profile.standards = [];
    profile.assessment!.profile.test.grade = i.grade;
    profile.assessment!.profile.level = { working: i.grade, certainty: "clear", confidence: "normal", atCeiling: false };
    profile.assessment!.profile.standards = [];
    const personal = bookSignals({ grade: i.grade, profile });
    const baseline = plan({ ...i, personal });
    personal.parent.weeklyTime = "under_1h";
    const p = plan({ ...i, personal });
    const contents = (p: WorkbookPlan) => p.days.map(d => d.pages.map(pg => pg.parts.map(p => ({ kind: p.kind, items: p.items }))));
    expect(contents(p)).toEqual(contents(baseline));
    const last = p.days[9];
    expect(last.time!.estimated).toBeLessThan(35);
    expect(last.time!.required).toBeGreaterThan(last.time!.target);
    expect(last.time!.target).toBe(20);
    expect(last.pages.flatMap(pg => pg.parts.filter(p => p.kind === "challenge" || p.kind === "practice")).every(p => !p.extra)).toBe(true);
    expect(p.personal).toMatchObject({ timeShortfalls: expect.arrayContaining([
      expect.objectContaining({ day: 10, target: 20, required: last.time!.required, shortfall: Number((last.time!.required - 20).toFixed(1)) }),
    ]) });
    expect(personal).not.toHaveProperty("timeShortfalls");
  });

  it("R523-P2: placement preserves the shortfall trace for Why this book", () => {
    const profile = firstCustomerProfile();
    profile.grade = 2;
    profile.parent.weeklyTime = "under_1h";
    profile.assessment!.profile.test.grade = 2;
    profile.assessment!.profile.level = { working: 2, certainty: "clear", confidence: "normal", atCeiling: false };
    profile.standards = BC.level("U7")!.units.map(code => ({ ...profile.standards[0], code, status: "secure", certainty: "clear", aboveGrade: false }));
    const r = planNextWorkbook({ curriculum: BC, grade: 2, profile, workbooks: [], number: 1 });
    if (!r.ok) throw new Error(r.reason);
    expect(r.plan.level).toBe(7);
    expect(r.plan.personal).toMatchObject({
      start: { level: "U7" },
      timeShortfalls: expect.arrayContaining([expect.objectContaining({ day: 10, target: 20 })]),
    });
  });

  it("keeps 18 absent-personal plans at the approved warm-up shape", () => {
    for (const [key, hash] of Object.entries(GOLDEN)) {
      const [level, kind] = key.split("-");
      const i = samplePlanInput(BC, sampleChild(BC, level)!, kind as "first" | "second" | "test");
      expect(createHash("sha256").update(JSON.stringify(planWorkbook(i))).digest("hex"), key).toBe(hash);
      expect(plan({ ...i, personal: bookSignals({ grade: i.grade, profile: null }) })).toEqual(plan(i));
    }
  });

  it("1: orders weak units first, but completes every prerequisite before starting its dependent skill", () => {
    const i = withWeak(personalInput("U13"), ["4.9"]);
    const p = plan(i);
    expect(p.newSteps[0].unit).toBe("4.9");
    for (const level of ["U4", "U10", "U16", "U19", "U27"]) {
      const own = BC.levelSkills(level)!;
      const q = plan(withWeak(personalInput(level), BC.level(level)!.units.filter(code => Number(code.split(".")[0]) <= 4)));
      for (const s of q.newSteps) for (const r of BC.skill(s.skill)!.requires.filter(r => own.some(o => o.id === r && o.delivery !== "warm-up"))) {
        expect(q.newSteps.filter(x => x.skill === r && x.day < s.day).length, `${level}: ${s.skill} needs ${r}`).toBe(BC.skillSteps(r)!.length);
      }
    }
  });

  it("1: a weak unit replaces only its first day's stories page with one full practice page", () => {
    const plain = plan(personalInput());
    const p = plan(withWeak(personalInput(), ["5.10"]));
    // Above school grade never becomes weak.
    expect(p.days.flatMap(d => d.pages).filter(pg => pg.weakPractice)).toHaveLength(0);
    const i = withWeak(personalInput("U13"), ["4.9"]);
    const changed = plan(i);
    const extra = changed.days.flatMap(d => d.pages.filter(pg => pg.weakPractice).map(pg => ({ day: d.day, pg })));
    expect(extra).toHaveLength(1);
    expect(extra[0].day).toBe(changed.newSteps.find(s => s.unit === "4.9")!.day);
    expect(extra[0].pg.type).toBe("practice");
    expect(extra[0].pg.parts[0]).toMatchObject({ kind: "practice", items: 6, learningStage: "application" });
    expect(changed.days.map(d => d.pages.length)).toEqual(plain.days.map(d => d.pages.length));
    expect(extra[0].pg.number).toBe(5);
    expect(changed.days[extra[0].day - 1].pages[3].type).toBe("practice-2");
    expect(dayParts(changed, extra[0].day).filter(p => p.kind === "challenge").reduce((n,p) => n+p.items,0)).toBe(3);
  });

  it("1: starts a weak skill's review two days after its first taught day", () => {
    const p = plan(withWeak(personalInput("U13"), ["4.9"]));
    const first = p.newSteps.find(s => s.unit === "4.9")!;
    expect(dayParts(p, first.day + 2).flatMap(p => p.reviews ?? [])).toContainEqual({ skill: first.skill, step: first.step, interval: 0 });
  });

  it("P6: reserves two items per lower early weakness on Days 2-4, one Friday item, and review from Day 2", () => {
    const i = withWeak(personalInput(), ["4.3"]);
    const p = plan(i);
    expect(p.level).toBe(16);
    for (const day of [2, 3, 4, 5]) {
      const checks = dayParts(p, day).flatMap(p => p.weakChecks ?? []);
      expect(checks.filter(c => c.unit === "4.3").map(c => c.items)).toEqual([day === 5 ? 1 : 2]);
      expect(checks[0].skills.every(id => BC.levelOfSkill(id)!.number < 16)).toBe(true);
    }
    expect(dayParts(p, 2).flatMap(p => p.reviews ?? []).some(r => BC_SKILL_MAP.standards.find(s => s.code === "4.3")!.skills.some(s => s.id === r.skill))).toBe(true);
    expect(plan(personalInput()).days.flatMap(d => d.pages.flatMap(pg => pg.parts.flatMap(p => p.weakChecks ?? [])))).toEqual([]);
  });

  it("2: secure lower skills start at the 15-day interval instead of weak review", () => {
    const p = plan(personalInput());
    const lower = p.personal!.secure.flatMap(s => BC_SKILL_MAP.standards.find(t => t.code === s.code)!.skills.map(s => s.id)).filter(id => BC.levelOfSkill(id)!.number < 16);
    expect(lower.length).toBeGreaterThan(0);
    for (const skill of lower) expect(p.reviewsAfter).toContainEqual({ skill, step: 1, interval: 2, due: 5 });
    expect(p.days.flatMap(d => d.pages.flatMap(pg => pg.parts.flatMap(p => p.reviews ?? []))).some(r => lower.includes(r.skill))).toBe(false);
    // A stories page can still use a known operation before the current level teaches another one.
    expect(dayParts(p, 1).flatMap(p => p.reviewSteps ?? []).some(r => lower.includes(r.skill))).toBe(true);
  });

  it("2/Q4: the first customer starts at U16, teaches 5.1, 5.9 and 5.10, and stretches from Day 1", () => {
    const r = planNextWorkbook({ curriculum: BC, grade: 4, profile: firstCustomerProfile(), workbooks: [], number: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.plan;
    expect(p.level).toBe(16);
    expect([...new Set(p.newSteps.map(s => s.unit))]).toEqual(["5.1", "5.9", "5.10"]);
    expect(p.days[0].difficulty).toMatchObject({ ...dayDifficulty(16, 3), helpLevel: "pictures", maxMinutes: 35 });
    expect(p.days[0].difficulty!.numberRange.max).toBeGreaterThan(dayDifficulty(16, 1).numberRange.max);
    expect(dayParts(p, 1).find(p => p.kind === "challenge")).toMatchObject({ items: 3, templateDifficulty: "hard" });
    expect(p.days[9].difficulty!.numberRange).toEqual(dayDifficulty(16, 10).numberRange);
    expect(p.days.flatMap(d => d.pages.flatMap(pg => pg.parts)).some(p => p.skills.some(s => BC_SKILL_MAP.standards.find(t => t.code === "5.13")!.skills.some(t => t.id === s)))).toBe(false);
  });

  it("7: catch-up keeps pictures through Day 5; get-ahead stretches only when every area is secure", () => {
    expect(plan(personalInput("U13", "catch-up")).days.slice(0, 5).every(d => d.difficulty!.helpLevel === "pictures")).toBe(true);
    const p = plan(personalInput("U13", "on-level"));
    expect(p.days[0].difficulty!.rangeFraction).toBe(dayDifficulty(13, 3).rangeFraction);
    const profile = bookPersona("on-level").profile;
    profile.assessment!.profile.strands[0].status = "developing";
    const i = personalInput("U13");
    i.personal = bookSignals({ grade: 4, profile });
    expect(plan(i).days[0].difficulty!.rangeFraction).toBe(dayDifficulty(13, 1).rangeFraction);
  });

  it("7: avoids caps stretch at one day while keeping Challenge required", () => {
    const profile = firstCustomerProfile();
    profile.parent.feeling = "avoids";
    const i = personalInput();
    i.personal = bookSignals({ grade: 4, profile });
    const p = plan(i);
    expect(p.days[0].difficulty!.rangeFraction).toBe(dayDifficulty(16, 2).rangeFraction);
    expect(dayParts(p, 1).filter(p => p.kind === "challenge")).toEqual([expect.objectContaining({ items: 3 })]);
    expect(dayParts(p, 1).filter(p => p.kind === "challenge").some(part => part.extra)).toBe(false);
  });

  it.each(["under_1h", "1_to_2h"] as const)("7/Q6: %s records the time gap while preserving eight required learning pages", weeklyTime => {
    const i = personalInput();
    i.personal.parent.weeklyTime = weeklyTime;
    const p = plan(i);
    const plain = plan(personalInput());
    expect(p.days.map(d => d.pages.map(pg => pg.parts.map(part => part.items)))).toEqual(plain.days.map(d => d.pages.map(pg => pg.parts.map(part => part.items))));
    for (const d of p.days) {
      expect(d.pages).toHaveLength(8);
      expect(d.time!.estimated).toBeLessThan(35);
      expect(d.time!.required).toBe(d.time!.estimated);
      expect(d.pages.flatMap(pg => pg.parts).some(part => part.extra)).toBe(false);
      expect(d.time!.target).toBeLessThanOrEqual(weeklyTime === "under_1h" ? 20 : 25);
      if (d.time!.required > d.time!.target) expect(p.personal!.timeShortfalls).toContainEqual({
        day: d.day, target: d.time!.target, required: d.time!.required,
        shortfall: Number((d.time!.required - d.time!.target).toFixed(1)),
      });
    }
  });

  it("7: keep-up or no weekly answer adds no Extra block", () => {
    const i = personalInput();
    i.personal.parent.goal = "keep_up";
    expect(plan(i).days.flatMap(d => d.pages.flatMap(pg => pg.parts)).some(p => p.extra)).toBe(false);
  });

  it("8: three read-aloud questions keep story share at 0.2, including Days 8-10, and request short frames", () => {
    const i = personalInput("U16", "catch-up");
    const p = plan(i);
    expect(p.days.every(d => d.shortStories && d.difficulty!.storyShare === .2)).toBe(true);
    expect(plan(personalInput()).days[9].difficulty!.storyShare).toBe(.4);
    const profile = firstCustomerProfile();
    profile.assessment!.profile.behaviour.readAloud = { recorded: 42, questions: 2, uses: 9 };
    i.personal = bookSignals({ grade: 4, profile });
    expect(plan(i).days[9]).toMatchObject({ shortStories: false, difficulty: { storyShare: .4 } });
  });

  it("8: a late drop reduces the required target by five minutes", () => {
    const i = personalInput();
    i.personal.behaviour!.lateDrop = true;
    const p = plan(i);
    for (const d of p.days) {
      expect(d.time!.target).toBeCloseTo(d.time!.estimated - 5, 1);
      expect(d.time!.required).toBe(d.time!.estimated);
      expect(p.personal!.timeShortfalls).toContainEqual({ day: d.day, target: d.time!.target, required: d.time!.required, shortfall: 5 });
    }
  });

  it("8: rushing cancels stretch even at the ceiling and with a parent get-ahead request", () => {
    const p = plan(personalInput("U13", "rushed"));
    expect(p.days[0].difficulty!.rangeFraction).toBe(dayDifficulty(13, 1).rangeFraction);
    expect(dayParts(p, 1).find(p => p.kind === "challenge")!.templateDifficulty).toBeUndefined();
  });

  it("8: pace, shown work, test minutes and device have no effect on planned content", () => {
    const i = personalInput();
    const baseline = plan(i);
    i.personal.behaviour!.medianMs = 999999;
    i.personal.behaviour!.whiteboard = { required: 7, requiredWithWork: 7, optionalWithWork: 7 };
    i.personal.report.minutes = 999;
    i.personal.report.device = { deviceClass: "phone", input: "touch", screenWidth: 300, screenHeight: 600, browser: "safari" };
    const changed = plan(i);
    expect(changed.days).toEqual(baseline.days);
    expect(changed.newSteps).toEqual(baseline.newSteps);
  });


  it("2: other Challenge cards prefer secure steps already taught or reviewed, never a future step", () => {
    const i = personalInput();
    const p = plan(i);
    const second = dayParts(p, 2).find(p => p.kind === "challenge")!;
    expect(second.reviewSteps).toContainEqual({ skill: p.newSteps[0].skill, step: 1 });
    expect(second.preferStandards).toContain("5.1");
    for (const d of p.days) for (const part of dayParts(p, d.day).filter(p => p.kind === "challenge")) {
      for (const r of part.reviewSteps ?? []) {
        expect(BC.levelOfSkill(r.skill)!.number < p.level || p.newSteps.some(s => s.skill === r.skill && s.step === r.step && s.day < d.day)).toBe(true);
      }
    }
    i.personal.soft.challengeOrder = ["6.12", "5.13", "9.5"];
    expect(plan(i).days).toEqual(p.days);
  });

  it("gives all four personas different daily plan choices", () => {
    const features = ["ahead", "catch-up", "on-level", "rushed"].map(persona => {
      const profile = bookPersona(persona as "ahead").profile;
      const r = planNextWorkbook({ curriculum: BC, grade: 4, profile, workbooks: [], number: 1 });
      if (!r.ok) throw new Error(r.reason);
      return JSON.stringify({ level: r.plan.level, days: r.plan.days });
    });
    expect(new Set(features).size).toBe(4);
  });
});
