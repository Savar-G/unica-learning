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

// Captured before C3 from main b9eafdd3. Hash the complete serialized result, including property order.
const GOLDEN: Record<string, string> = {
  "U1-first": "7c177267cce542a8f25abb6e5f1d1814e26900c0c82703e691aefbccaa8b68c2",
  "U1-second": "0efc9603b7e656458a6ff2d2c4605df04df705c3727ada6ab2758e807fffb95f",
  "U1-test": "b7309b5032fb2e448c26b1259e915b1f338bfdaa5873a47ca9c00234f181c373",
  "U4-first": "ba2be623afc9b14533556472b9a6d4fbcc734c50f07ad0b8d607cd8507786b97",
  "U4-second": "331dca7bd47a8bdc6457a2ff388316ad7b6e459afd3fdab742a99fdaba6259db",
  "U4-test": "592d27baa06fa34d576da28b83c41647436781c2e7a87b5eaa9bcc9ecdf03d6b",
  "U10-first": "06a0bb949ffd6dc3722416964fecef2ccd4e26052c8a2a76ec45a78309e7460c",
  "U10-second": "85cdf81482f5365133d5cb1780ec3dcf33eb7edf55e23b563ad8e978a31e9ea2",
  "U10-test": "784fa3ce5ecbd03237c76fa12e66d5caa9c2fada1654795767779de091694963",
  "U16-first": "17b0b8a273fb94cd78229a60afc8468321f891052c51f737f415dd98152bef3c",
  "U16-second": "4c057e4f915c71eaf72248a520d104d4ada910697a0a44a3aef598e7b7e1fde0",
  "U16-test": "60c91ffb13904cfd4950851cbe2eb70c46d41a4cdfbf1908688e84df04e715f9",
  "U19-first": "4a463c30fd898208ef32e2233209b2e2778c2fc9c7048e972487b7b4c8e7297d",
  "U19-second": "6218984be0d94e42fc3e12f6c2608ab640e5ace3b543fef1b51c312105fd90cc",
  "U19-test": "6f47cf0c5d1080c9ed2c0912a31fba6f65c756f218b00ffeb3b94142aefcf6c3",
  "U27-first": "d5a9acdc35fcedeaddf8c116a16095facb58e12b58c074de0bd0ff485812b749",
  "U27-second": "321a9d9bccd3ca4492c0b12aed91b7eb80d59a1defe6c21ccb231d4679bd368c",
  "U27-test": "6c4268f0bb2e75d638c9002df2bb1387de2b85ab0a857f4551da599a26c4a6fa",
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
  it("keeps 18 absent-personal plans byte-identical to the pre-change golden results", () => {
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
    expect(extra[0].pg.parts[0]).toMatchObject({ kind: "practice", items: 8 });
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

  it("7: avoids caps stretch at one day and makes the whole Challenge block Extra", () => {
    const profile = firstCustomerProfile();
    profile.parent.feeling = "avoids";
    const i = personalInput();
    i.personal = bookSignals({ grade: 4, profile });
    const p = plan(i);
    expect(p.days[0].difficulty!.rangeFraction).toBe(dayDifficulty(16, 2).rangeFraction);
    expect(dayParts(p, 1).filter(p => p.kind === "challenge")).toEqual([expect.objectContaining({ extra: true, items: 3 })]);
  });

  it.each(["under_1h", "1_to_2h"] as const)("7/Q6: %s makes whole blocks Extra in order without removing items or pages", weeklyTime => {
    const i = personalInput();
    i.personal.parent.weeklyTime = weeklyTime;
    const p = plan(i);
    const plain = plan(personalInput());
    expect(p.days.map(d => d.pages.map(pg => pg.parts.map(p => p.items)))).toEqual(plain.days.map(d => d.pages.map(pg => pg.parts.map(p => p.items))));
    for (const d of p.days) {
      expect(d.time!.required).toBeLessThanOrEqual(weeklyTime === "under_1h" ? 20 : 25);
      expect(d.time!.estimated).toBeLessThan(35);
      const optional = d.pages.flatMap(pg => pg.parts).filter(p => p.extra);
      expect(optional.length).toBeGreaterThan(0);
      expect(optional.some(p => p.kind === "challenge")).toBe(true);
      const practice = d.pages.filter(pg => pg.parts.some(p => p.kind === "practice"));
      const firstRequired = practice.findIndex(pg => pg.parts.some(p => p.extra));
      if (firstRequired >= 0) expect(practice.slice(firstRequired).every(pg => pg.parts.every(p => p.extra))).toBe(true);
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
      expect(d.time!.required).toBeLessThanOrEqual(d.time!.target);
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
