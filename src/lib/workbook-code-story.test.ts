import { describe, expect, it } from "vitest";
import { bcStepProgressions } from "@/lib/workbook-curriculum";
import { codeStoryProblem, isNumberStory, sameStory } from "@/lib/workbook-code-story";
import { buildQuestion } from "@/lib/workbook-generator-items";
import { buildPlannedItem, type ItemPlan } from "@/lib/workbook-item-plan";
import { buildStepItem, stepAiItem, stepTemplateItem } from "@/lib/workbook-step-items";
import { prepareTemplate, seededRandom } from "@/lib/workbook-curriculum/template";
import { FRAMES, takeAwayProblem } from "@/lib/workbook-wording";
import { taskIdentity } from "@/lib/workbook-task-identity";
import { workbookQuality } from "@/lib/workbook-quality";
import type { GeneratedPage } from "@/lib/workbook-generator";

const BC = bcStepProgressions();
const place = { id: "p1q1", workbookId: "00000000-0000-4000-8000-0000000000b1", page: 9, question: 1, level: 16, skills: ["4.4-subtract-within-10000"], story: true };
const VERBS = ["puts", "places", "moves", "hides", "stores", "keeps"];

describe("a story's numbers and question are code's (Codex at e6d79b6a, B1)", () => {
  it("refuses every keeping verb, with or without a removal word in another clause", () => {
    for (const verb of VERBS) for (const tail of ["", " he uses for beads"]) {
      const text = `Max has 1010 beads. He ${verb} 17 in a jar${tail}. How many beads does he have now?`;
      expect(takeAwayProblem(text, 993), text).not.toBeNull();
    }
    expect(takeAwayProblem("Max has 1010 buttons and gives 17 away. How many buttons does he have now?", 993)).toBeNull();
    expect(takeAwayProblem("Max has 1010 buttons and puts 17 in a jar. How many buttons are outside the jar?", 993)).toBeNull();
  });

  it("prints code's wording, never the writer's, for a story with an operation", () => {
    for (const verb of VERBS) {
      const text = `Max has 1010 beads. He ${verb} 17 in a jar he uses for beads. How many beads does he have now?`;
      const raw = { slot: "1.1", skill: "4.4-subtract-within-10000", difficulty: 2, text, format: "show-work", operation: { kind: "subtract", operands: [1010, 17] }, wrongAnswers: [], easier: null, shownWrong: null, figure: null };
      const built = buildQuestion(raw, place as never);
      if (built.package) expect(built.package.text).not.toBe(text);
      if (built.package) expect(codeStoryProblem(built.package, null), built.package.text).toBeNull();
    }
  });

  it("keeps a house template's story words when the writer rewords them, and the book check refuses the reworded print", () => {
    let filled = null;
    for (let seed = 1; seed < 40 && !filled; seed++) {
      const f = stepTemplateItem({ curriculum: BC, skill: "5.9-multiply-tens", step: 2, place: "challenge", level: 16, day: 5, seed, attempt: 2, ordinal: 2 });
      if (f && /orders .* boxes/.test(f.text)) filled = f;
    }
    expect(filled).not.toBeNull();
    const plan: ItemPlan = { type: "template", source: "story", item: stepAiItem("1.3", filled!.ref, filled!.text), numbers: filled!.numbers, dayRange: { min: 0, max: 81000, help: "none", pictures: false } as never, template: filled!.ref };
    for (const verb of VERBS) {
      const reworded = filled!.text.replace(/It gives away/, `It ${verb}`);
      const out = buildPlannedItem(plan, { ...plan.item, text: reworded }, { ...place, level: 16, skills: [filled!.ref.skill] } as never);
      expect(out.package?.text).toBe(filled!.text);
      const page = { number: 42, day: 5, pageOfDay: 8, dayLabel: "Day 5", type: "challenge", qrToken: "token-000000000001", attempts: 0, fit: { status: "fits" },
        questions: [{ number: 1, slot: "1.3", part: "challenge", place: "challenge", attempts: 1, check: { status: "checked" }, itemPlan: plan, package: { ...out.package!, text: reworded } }] } as unknown as GeneratedPage;
      if (reworded !== filled!.text) expect(workbookQuality([page]).issues.some((i) => i.reason.includes("not code's")), reworded).toBe(true);
    }
  });

  it("holds every code take-away frame: its verb removes the counted things, or its question names the rest", () => {
    let frames = 0, templates = 0;
    // Code's own wordings.
    for (const f of FRAMES.filter((x) => x.op === "subtract")) {
      const text = f.f.replace(/\{name\}/g, "Mia").replace(/\{He\}/g, "She").replace(/\{he\}/g, "she").replace(/\{thing\}/g, "shells").replace(/\{other\}/g, "Ben").replace(/\{t\}/g, "9").replace(/\{b\}/g, "4");
      expect(takeAwayProblem(text, 5), text).toBeNull();
      frames++;
    }
    // Every step template of the U4 and U16 books whose answer takes one of its numbers from another.
    const levels = new Set(["U4", "U16", ...BC.levels.filter((l) => l.number < 16).map((l) => l.id)]);
    for (const skill of BC.levels.filter((l) => levels.has(l.id)).flatMap((l) => BC.levelSkills(l.id) ?? [])) for (const step of BC.skillSteps(skill.id) ?? []) for (const t of step.templates ?? []) {
      if (t.format !== "story" || !/^\s*\w+\s*-\s*\w+\s*$/.test(t.answer)) continue;
      let item;
      try { item = prepareTemplate(step, t, BC.contexts!).fill(seededRandom(3)); } catch { continue; }
      expect(takeAwayProblem(item.text, Number(item.answer)), `${skill.id}#${step.number}: ${item.text}`).toBeNull();
      templates++;
    }
    expect(frames).toBeGreaterThan(5);
    expect(templates).toBeGreaterThan(20);
  });

  it("reads a story by its words", () => {
    expect(isNumberStory("Mia has 7 shells.")).toBe(true);
    expect(isNumberStory("7 + 5 = ?")).toBe(false);
    expect(sameStory("Mia has 7 shells. She gets 2 more. How many shells now?", "Ben has 7 cars. He gets 2 more. How many cars now?")).toBe(true);
    expect(sameStory("Mia has 7 shells. She puts 2 in a jar. How many shells now?", "Mia has 7 shells. She gives away 2. How many shells now?")).toBe(false);
  });
});

describe("a task is its maths, not its distractors (Codex at e6d79b6a, B2)", () => {
  it("finds the real decompose templates' pairs one task", () => {
    const step = BC.skillSteps("1.2-decompose-within-10")![0];
    const plain = step.templates!.findIndex((t) => /^\{w\} is \{p\} and __/.test(t.text));
    const chosen = step.templates!.findIndex((t) => /which number/.test(t.text));
    expect(plain).toBeGreaterThanOrEqual(0);
    expect(chosen).toBeGreaterThanOrEqual(0);
    const fills = new Map<string, { a?: string; b?: string; pa?: ReturnType<typeof buildStepItem>; pb?: ReturnType<typeof buildStepItem> }>();
    for (let seed = 1; seed <= 400; seed++) for (const [k, index] of [["a", plain], ["b", chosen]] as const) {
      const f = stepTemplateItem({ curriculum: BC, skill: "1.2-decompose-within-10", step: 1, place: "on-your-own", level: 4, day: 3, seed, attempt: 0, ordinal: 1, usedOnPage: new Map(step.templates!.map((_, i) => [i, i === index ? 0 : 9])) });
      if (!f || f.ref.index !== index) continue;
      const m = /^(\d+) is (\d+) and/.exec(f.text);
      if (!m) continue;
      const key = `${m[1]}-${m[2]}`;
      const e = fills.get(key) ?? {};
      if (!e[k]) { e[k] = f.text; e[k === "a" ? "pa" : "pb"] = buildStepItem(f.ref, f.text, { ...place, level: 4, skills: [f.ref.skill] } as never, "code"); }
      fills.set(key, e);
    }
    const pair = [...fills.values()].find((e) => e.pa?.package && e.pb?.package);
    expect(pair, "a seed fills both templates with one whole and part").toBeTruthy();
    expect(taskIdentity(pair!.pa!.package!)).toBe(taskIdentity(pair!.pb!.package!));
    const q = (n: number, b: ReturnType<typeof buildStepItem>) => ({ number: n, slot: `1.${n}`, part: "practice", place: "on-your-own", attempts: 1, check: { status: "checked" }, package: b.package });
    const page = { number: 24, day: 3, pageOfDay: 6, dayLabel: "Day 3", type: "practice", qrToken: "token-000000000001", attempts: 0, fit: { status: "fits" }, questions: [q(1, pair!.pa!), q(5, pair!.pb!)] } as unknown as GeneratedPage;
    expect(workbookQuality([page]).issues.some((i) => i.kind === "repeat"), `${pair!.a} / ${pair!.b}`).toBe(true);
  });
});

describe("the writer edits no story text (Codex at cb78c56b, B1a and B1b)", () => {
  const story = () => {
    for (let seed = 1; seed < 60; seed++) {
      const f = stepTemplateItem({ curriculum: BC, skill: "5.9-multiply-tens", step: 2, place: "challenge", level: 16, day: 5, seed, attempt: 2, ordinal: 2 });
      if (f && /orders .* boxes .* gives away/.test(f.text)) return f;
    }
    throw new Error("no story fill");
  };
  const page = (pkg: unknown, plan: ItemPlan | undefined, codeText?: string) => ({ number: 42, day: 5, pageOfDay: 8, dayLabel: "Day 5", type: "challenge", qrToken: "token-000000000001", attempts: 0, fit: { status: "fits" },
    questions: [{ number: 1, slot: "1.3", part: "challenge", place: "challenge", attempts: 1, check: { status: "checked" }, ...(plan ? { itemPlan: plan } : {}), ...(codeText ? { codeText } : {}), package: pkg }] }) as unknown as GeneratedPage;

  it("B1a: prints code's story whatever person or thing the writer swaps in, and the book check refuses every swap", () => {
    const f = story();
    const plan: ItemPlan = { type: "template", source: "story", item: stepAiItem("1.3", f.ref, f.text), numbers: f.numbers, dayRange: { min: 0, max: 81000, help: "none", pictures: false } as never, template: f.ref };
    const thing = /with \d+ ([a-z ]+?) in each/.exec(f.text)![1];
    const who = /^([A-Z][a-z]+)'s/.exec(f.text)![1];
    const swaps = [
      f.text.replaceAll(thing, "tickets").replaceAll(who, "Noah"),
      f.text.replace(`How many ${thing}`, "How many boxes"),
      f.text.replace(`How many ${thing}`, "How many jars"),
      f.text.replace(/with (\d+) /, "with $1 boxes of "),
      f.text.replace(`${who}'s`, "Noah's"),
      f.text.replace("does the school have now", `does ${who === "Mia" ? "Noah" : "Mia"} have now`),
    ];
    for (const text of swaps) {
      const out = buildPlannedItem(plan, { ...plan.item, text }, { ...place, level: 16, skills: [f.ref.skill] } as never);
      expect(out.package?.text, text).toBe(f.text);
      expect(workbookQuality([page({ ...out.package!, text }, plan)]).issues.some((i) => i.reason.includes("not code's")), text).toBe(true);
    }
    expect(workbookQuality([page(buildPlannedItem(plan, plan.item, { ...place, level: 16, skills: [f.ref.skill] } as never).package, plan)]).issues.some((i) => i.reason.includes("code's"))).toBe(false);
  });

  it("B1b: Solve it two ways prints code's sum, never the writer's story, and the book check refuses the story", () => {
    for (const text of [
      "Max has 1010 beads. He puts 17 in a jar he uses for beads. How many beads does he have now?",
      "Max has 1010 beads. He puts 17 in a jar. How many beads now?",
      "Max has 1010 beads. He gets 17 more. How many beads does he have now?",
    ]) {
      const num = (value: number) => ({ type: "number", value, numerator: null, denominator: null, whole: null, unit: null, hours: null, minutes: null, period: null, parts: [], text: null });
      const sub = (a: number, b: number) => ({ kind: "subtract", operands: [num(a), num(b)], expression: null, unit: null, denominator: null, values: [] });
      const raw = { slot: "1.1", skill: "4.4-subtract-within-10000", difficulty: 2, text, format: "two-ways", operation: sub(1010, 17), wrongAnswers: [{ value: num(992), cause: "count", description: "x", step: null }], easier: { text: "1000 - 17 = ?", operation: sub(1000, 17) }, shownWrong: null, figure: null, numbers: [], places: null, direction: null, sequence: null, pattern: null, relation: null, figureShows: null };
      const built = buildQuestion(raw, place as never);
      expect(built.package, JSON.stringify(built.check)).not.toBeNull();
      expect(built.package!.text, text).not.toBe(text);
      expect(isNumberStory(built.package!.text)).toBe(false);
      expect(workbookQuality([page({ ...built.package!, text }, undefined)]).issues.some((i) => i.reason.includes("code's")), text).toBe(true);
    }
  });
});
