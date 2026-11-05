import { describe, expect, it } from "vitest";
import { curriculumFor, type CurriculumStep } from "@/lib/workbook-curriculum";
import { planNextWorkbook, type PersonalWorkbookPlan } from "@/lib/workbook-placement";
import { childSamMistakes, difficultyDay, interestTurn, samMistakeOf, storyThings, styleKinds, verifiedWatchOut, warmUpSkill } from "@/lib/workbook-personal-items";
import { bookPersona, firstCustomerProfile, sampleChild, samplePlanInput } from "@/lib/workbook-sample-profiles";
import { planWorkbook, type WorkbookPlan } from "@/lib/workbook-plan";
import { THINGS } from "@/lib/workbook-wording";
import { WORKBOOK_INTERESTS } from "@/lib/workbook-interests";

const BC = curriculumFor("bc")!;
const placed = (profile = firstCustomerProfile()): PersonalWorkbookPlan => {
  const r = planNextWorkbook({ curriculum: BC, grade: 4, profile, workbooks: [], number: 1 });
  if (!r.ok) throw new Error(r.reason);
  return r.plan;
};
const plain = (level: string): WorkbookPlan => {
  const r = planWorkbook(samplePlanInput(BC, sampleChild(BC, level)!, "first"));
  if (!r.ok) throw new Error(r.reason);
  return r.plan;
};
/** The catch-up persona's plan at U16, with its 4.4 mistake: a plan C3 made from its signals. */
const withMistake = (level = 16): WorkbookPlan => ({ ...plain(`U${level}`), level, personal: placed(bookPersona("catch-up").profile).personal });

describe("G1 personal choices with no signals keep today's book", () => {
  it("every choice gives today's answer for a plan with no personal signals", () => {
    const plan = plain("U16");
    for (const day of [1, 5, 10]) expect(difficultyDay(plan, day)).toBe(day);
    expect(childSamMistakes(plan)).toEqual([]);
    expect(warmUpSkill(BC, plan, 1, ["5.8-extend-facts", "5.9-recall-facts"], 0)).toBeNull();
    expect(storyThings(plan)).toBe(THINGS);
    expect(styleKinds(plan, ["story", "picture"], true)).toEqual(["story", "picture"]);
  });
});

describe("G1 stretch (item 2)", () => {
  it("moves the first customer's Day 1 to today's Day 3, never past Day 10", () => {
    const plan = placed();
    expect(plan.level).toBe(16);
    expect([1, 5, 9, 10].map((d) => difficultyDay(plan, d))).toEqual([3, 7, 10, 10]);
  });
});

describe("G1 Watch out (item 3) fails closed", () => {
  const skill = "4.4-add-within-10000";
  const step = BC.skillSteps(skill)![1];
  const coded = step.mistakes.find((m) => m.misconception);
  const plan = (misconception: string): WorkbookPlan => {
    const p = withMistake();
    return { ...p, personal: { ...p.personal!, mistakes: [{ standard: "4.4", misconceptions: [misconception], stuckSteps: [], wrong: 1, withHelp: 0, blank: 0, hints: 0 }] } };
  };
  const withPair = (verified: unknown): CurriculumStep => ({ ...step, mistakes: step.mistakes.map((m) => m === coded ? { ...m, watchOut: { wrong: "Sam writes 4,100.", fix: "carry the 1 to the hundreds.", verified } } : m) } as CurriculumStep);
  it("prints the child's pair only when it is marked verified: true", () => {
    expect(coded).toBeDefined();
    const p = plan(coded!.misconception!);
    expect(verifiedWatchOut(BC, p, skill, withPair(true))).toEqual({ wrong: "Sam writes 4,100.", fix: "carry the 1 to the hundreds." });
    for (const verified of [undefined, false, "true", 1, null]) expect(verifiedWatchOut(BC, p, skill, withPair(verified))).toBeNull();
  });
  it("never prints a pair for another mistake, another standard or no signals", () => {
    expect(verifiedWatchOut(BC, plan("not-this-one"), skill, withPair(true))).toBeNull();
    const other = plan(coded!.misconception!);
    other.personal!.mistakes = [{ ...other.personal!.mistakes[0], standard: "4.3" }];
    expect(verifiedWatchOut(BC, other, skill, withPair(true))).toBeNull();
    expect(verifiedWatchOut(BC, plain("U16"), skill, withPair(true))).toBeNull();
  });
  it("has no pair at all in today's data, so today's line prints", () => {
    const p = plan(coded!.misconception!);
    expect(verifiedWatchOut(BC, p, skill, step)).toBeNull();
  });
});

describe("G1 Spot the error (item 3): the closed Sam table", () => {
  it("maps only listed ids", () => {
    expect(samMistakeOf("O3")).toBe("forgot-carry");
    expect(samMistakeOf("forgot-carry")).toBe("forgot-carry");
    expect(samMistakeOf("digit-reversal")).toBe("swapped-digits");
    expect(samMistakeOf("unknown-id")).toBeNull();
    expect(samMistakeOf("toString")).toBeNull();
  });
  it("offers the child's mistake only where the level shows it", () => {
    expect(childSamMistakes(withMistake(16))).toEqual(["forgot-carry"]);
    // U4 shows counting mistakes only: no column carry.
    expect(childSamMistakes(withMistake(4))).toEqual([]);
  });
});

describe("G1 warm-up families (item 4)", () => {
  it("gives the first customer's unmeasured ×3 and ×4 facts at least half of Days 1 to 5, known at most a third", () => {
    const plan = placed();
    const skills = ["5.8-extend-facts", "5.9-recall-facts"];
    for (const day of [1, 2, 3, 4, 5]) {
      const aimed = Array.from({ length: 12 }, (_, k) => warmUpSkill(BC, plan, day, skills, k));
      expect(aimed.filter((s) => s === "5.9-recall-facts").length).toBeGreaterThanOrEqual(6);
      expect(aimed.filter((s) => s === "5.8-extend-facts").length).toBeLessThanOrEqual(4);
    }
    // Days 6 to 10 mix evenly, as today.
    expect(warmUpSkill(BC, plan, 6, skills, 0)).toBeNull();
  });
});

describe("G1 interests (item 5)", () => {
  it("offers interest things in 3 of every 5 turns and keeps today's list otherwise", () => {
    const plan = placed(bookPersona("on-level").profile);
    const list = storyThings(plan);
    const interest = new Set<string>([...WORKBOOK_INTERESTS.sports.things, ...WORKBOOK_INTERESTS.space.things]);
    const first = list.slice(0, 100);
    const share = first.filter((t) => interest.has(t)).length / first.length;
    expect(share).toBeGreaterThanOrEqual(0.5);
    expect(share).toBeLessThanOrEqual(2 / 3);
    expect(first.every((t, i) => interest.has(t) === interestTurn(i))).toBe(true);
    expect(list.every((t) => interest.has(t) || THINGS.includes(t))).toBe(true);
  });
});

describe("G1 style (item 6)", () => {
  it("puts the child's style kind first only where the skill has it", () => {
    const plan = placed(bookPersona("catch-up").profile);
    expect(styleKinds(plan, ["story", "picture", "fact"], true)).toEqual(["picture", "story", "fact"]);
    expect(styleKinds(plan, ["story", "fact"], true)).toEqual(["story", "fact"]);
    expect(styleKinds(plan, ["story", "picture"], false)).toEqual(["story", "picture"]);
  });
});
