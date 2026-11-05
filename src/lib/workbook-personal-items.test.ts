import { describe, expect, it } from "vitest";
import { curriculumFor, type CurriculumStep } from "@/lib/workbook-curriculum";
import { planNextWorkbook, type PersonalWorkbookPlan } from "@/lib/workbook-placement";
import { childSamMistakes, difficultyDay, interestEligible, interestShareProblems, interestTurn, samMistakeOf, storyThings, styleKinds, templateSpotShown, verifiedWatchOut, warmUpFact, warmUpShareProblems, warmUpSkill } from "@/lib/workbook-personal-items";
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
  // A U13 step whose coded mistake C2 verified (merged #524): "zero-placeholder" on 4.1 step 2.
  const skill = "4.1-place-value-10000";
  const step = BC.skillSteps(skill)![1];
  const coded = step.mistakes.find((m) => m.misconception === "zero-placeholder")!;
  const plan = (misconception: string, standard = "4.1"): WorkbookPlan => {
    const p = withMistake();
    return { ...p, personal: { ...p.personal!, mistakes: [{ standard, misconceptions: [misconception], stuckSteps: [], wrong: 1, withHelp: 0, blank: 0, hints: 0 }] } };
  };
  /** The step with its pair changed (by id: the loader's view gives fresh mistake objects on each read). */
  const changed = (pair: object | undefined) => ({ ...step, mistakes: step.mistakes.map((m) => m.misconception === "zero-placeholder" ? { ...m, watchOut: pair } : m) }) as CurriculumStep;
  it("prints the child's pair when C2 verified it for this step", () => {
    expect(coded.watchOut?.verified).toBe(true);
    expect(verifiedWatchOut(BC, plan("zero-placeholder"), skill, step)).toEqual({ wrong: coded.watchOut!.wrong, fix: coded.watchOut!.fix });
  });
  it("never prints an unverified, edited or moved pair", () => {
    const p = plan("zero-placeholder");
    const pair = coded.watchOut!;
    for (const bad of [undefined, { ...pair, verified: false }, { ...pair, verified: "true" }, { ...pair, verifierModel: undefined }, { ...pair, fix: `${pair.fix} Always.` }, { ...pair, verificationHash: "0".repeat(64) }])
      expect(verifiedWatchOut(BC, p, skill, changed(bad))).toBeNull();
    // The same pair on another step: its hash binds it to its own step.
    const other = BC.skillSteps(skill)![0];
    expect(verifiedWatchOut(BC, p, skill, { ...other, mistakes: [{ ...coded }] } as CurriculumStep)).toBeNull();
  });
  it("never prints a pair for another mistake, another standard or no signals", () => {
    expect(verifiedWatchOut(BC, plan("not-this-one"), skill, step)).toBeNull();
    expect(verifiedWatchOut(BC, plan("zero-placeholder", "4.3"), skill, step)).toBeNull();
    expect(verifiedWatchOut(BC, plain("U16"), skill, step)).toBeNull();
  });
  it("shows the child's own carry mistake on a step template Spot the error only with a verified pair", () => {
    const add = "4.4-add-within-10000";
    const third = BC.skillSteps(add)![2];
    const carry = third.mistakes.find((m) => m.misconception === "O3")!;
    expect(carry.watchOut?.verified).toBe(true);
    const p = plan("O3", "4.4");
    // Sam drops the carry from the ones: 3,456 + 2,789 = 6,245 is written 5,135 (each column's ones digit, carries lost).
    expect(templateSpotShown(BC, p, add, 3, "3,456 + 2,789 = ?")).toBe(5135);
    // An edited pair: today's plausible wrong answer.
    const edited = Object.assign(Object.create(BC), { skillSteps: (id: string) => id === add ? BC.skillSteps(add)!.map((x) => x.number === 3 ? { ...x, mistakes: x.mistakes.map((m) => m.misconception === "O3" ? { ...m, watchOut: { ...m.watchOut!, fix: "Carry." } } : m) } : x) : BC.skillSteps(id) }) as typeof BC;
    expect(templateSpotShown(edited, p, add, 3, "3,456 + 2,789 = ?")).toBeNull();
    // Not a bare sum, no carry to drop, no signals.
    expect(templateSpotShown(BC, p, add, 3, "Mia has 3,456 cards. She gets 2,789 more. How many now?")).toBeNull();
    expect(templateSpotShown(BC, p, add, 3, "1,234 + 1,234 = ?")).toBeNull();
    expect(templateSpotShown(BC, plain("U16"), add, 3, "3,456 + 2,789 = ?")).toBeNull();
  });
});

describe("G1 Spot the error (item 3): C2's closed Sam table", () => {
  it("maps only listed ids", () => {
    expect(samMistakeOf("O3")).toBe("forgot-carry");
    expect(samMistakeOf("digit-reversal")).toBe("swapped-digits");
    expect(samMistakeOf("forgot-carry")).toBeNull();
    expect(samMistakeOf("unknown-id")).toBeNull();
    expect(samMistakeOf("toString")).toBeNull();
  });
  it("offers the child's mistake only where the level shows it", () => {
    const at = (level: number): WorkbookPlan => { const p = withMistake(level); return { ...p, personal: { ...p.personal!, mistakes: [{ standard: "4.4", misconceptions: ["O3"], stuckSteps: [], wrong: 1, withHelp: 0, blank: 0, hints: 0 }] } }; };
    expect(childSamMistakes(at(16))).toEqual(["forgot-carry"]);
    // U4 shows counting mistakes only: no column carry.
    expect(childSamMistakes(at(4))).toEqual([]);
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

describe("G1 warm-up facts are code's (item 4)", () => {
  const plan = placed();
  const skills = ["5.8-extend-facts", "5.9-recall-facts"];
  it("prints the first customer's ×3 and ×4 facts for 5.9 and tens facts for 5.8, never the writer's choice", () => {
    const taken = new Set<string>();
    const facts = Array.from({ length: 12 }, (_, k) => { const f = warmUpFact(BC, plan, "5.9-recall-facts", k * 7, taken)!; taken.add(f.text); return f; });
    expect(facts.every((f) => f.kind === "multiply" && f.operands.some((x) => x === 3 || x === 4))).toBe(true);
    expect(new Set(facts.map((f) => f.text)).size).toBe(12);
    const tens = warmUpFact(BC, plan, "5.8-extend-facts", 3, new Set())!;
    expect(tens.operands.every((x) => x % 10 === 0)).toBe(true);
    expect(warmUpFact(BC, plain("U16"), "5.9-recall-facts", 0, new Set())).toBeNull();
  });
  const day = (ops: [string, number, number][]) => [{ number: 3, day: 1, questions: ops.map(([kind, a, b]) => ({ place: "warm-up", package: { operation: { kind, operands: [a, b] } } })) }];
  it("fails a day whose printed warm-up is the known families' addition, labels aside", () => {
    expect(warmUpShareProblems(BC, plan, day(Array.from({ length: 12 }, () => ["add", 56, 15])))).toHaveLength(1);
    const mixed: [string, number, number][] = Array.from({ length: 12 }, (_, k) => k % 3 === 2 ? ["add", 30, 90] : ["multiply", 3 + (k % 2), 7]);
    expect(warmUpShareProblems(BC, plan, day(mixed))).toEqual([]);
    expect(warmUpShareProblems(BC, plain("U16"), day(Array.from({ length: 12 }, () => ["add", 56, 15])))).toEqual([]);
    expect(warmUpSkill(BC, plan, 1, skills, 0)).toBe("5.9-recall-facts");
  });
});

describe("G1 interests (item 5)", () => {
  it("checks the printed share of eligible code stories", () => {
    const plan = placed(bookPersona("on-level").profile);
    const story = (text: string) => ({ itemPlan: { source: "story", item: { thing: "x" } }, package: { text } });
    const pages = (named: number, of: number) => [{ number: 5, questions: Array.from({ length: of }, (_, k) => story(k < named ? "Ava has 12 medals." : "Ava has 12 stickers.")) }];
    expect(interestShareProblems(BC, plan, pages(6, 10))).toEqual([]);
    expect(interestShareProblems(BC, plan, pages(2, 10))).toHaveLength(1);
    expect(interestShareProblems(BC, plan, pages(9, 10))).toHaveLength(1);
    expect(interestShareProblems(BC, placed(), pages(0, 10))).toEqual([]);
    expect(interestEligible(BC, { source: "code", item: {} })).toBe(false);
  });
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
