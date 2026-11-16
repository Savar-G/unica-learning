import { expect, it } from "vitest";
import { dayPageContent, groupedNumber, layoutDayPage, templateMethod } from "./workbook-book";
import { curriculumFor } from "./workbook-curriculum";
import { buildStepItem, stepTemplateItem } from "./workbook-step-items";
import { planNextWorkbook } from "./workbook-placement";
import type { PlannedPage } from "./workbook-plan";
import type { TemplateSource } from "./question-package-template";

function source(n: number, answer: string): TemplateSource {
  return { answer, check: null, derived: [], values: null,
    slots: [{ name: "n", value: { int: String(n) }, domain: { min: 1, max: 1_000_000_000 } }] };
}

it.each([
  [2, "prime", "factors 1 and 2"],
  [23, "prime", "None divides 23 exactly"],
  [51, "composite", "51 = 3 × 17"],
  [97, "prime", "None divides 97 exactly"],
])("teaches the factors behind the classification of %i", (n, answer, evidence) => {
  const method = templateMethod(source(Number(n), `'${answer}'`), `Is ${n} prime or composite? Write prime or composite.`, { skill: "6.4-prime-composite", step: 2 });
  expect(method).toContain(evidence);
  expect(method).toContain(answer);
  expect(method).not.toContain("Work it out");
});

it("does not teach 1 as composite or accept a contradictory prime key", () => {
  const scope = { skill: "6.4-prime-composite", step: 1 };
  expect(templateMethod(source(1, "'composite'"), "Is 1 prime or composite? Write prime or composite.", scope)).toBeNull();
  expect(templateMethod(source(51, "'prime'"), "Is 51 prime or composite? Write prime or composite.", scope)).toBeNull();
});

it.each([
  [125, 5, 1, "yes", "last digit is 5"],
  [123, 2, 1, "no", "odd"],
  [2714, 3, 2, "no", "2 + 7 + 1 + 4 = 14"],
  [2718, 9, 2, "yes", "2 + 7 + 1 + 8 = 18"],
  [1326, 4, 3, "no", "last 2 digits form 26"],
  [1326, 6, 3, "yes", "Both tests must pass"],
  [1328, 8, 3, "yes", "last 3 digits form 328"],
])("teaches the named divisibility test for %i by %i", (n, divisor, step, answer, evidence) => {
  const method = templateMethod(source(Number(n), `'${answer}'`), `Is ${n} divisible by ${divisor}? Write yes or no.`, { skill: "6.4-divisibility", step: Number(step) });
  expect(method).toContain(evidence);
  expect(method).toContain(`${groupedNumber(Number(n))} is${answer === "yes" ? "" : " not"} divisible by ${divisor}.`);
});

it("keeps unsupported blank-answer forms outside the scoped teaching methods", () => {
  for (const blank of ["__.", "?"]) {
    expect(templateMethod(source(2714, "14"), `The digit sum of 2714 is ${blank}`, { skill: "6.4-divisibility", step: 2 })).toBeNull();
    expect(templateMethod(source(51, "3"), `The smallest prime factor of 51 is ${blank}`, { skill: "6.4-prime-composite", step: 2 })).toBeNull();
  }
});

it("refuses mismatched numbers, answers, skill scopes and unsupported composite tasks", () => {
  const question = "Is 1326 divisible by 4? Write yes or no.";
  const scope = { skill: "6.4-divisibility", step: 3 };
  expect(templateMethod(source(1328, "'yes'"), question, scope)).toBeNull();
  expect(templateMethod(source(1326, "'yes'"), question, scope)).toBeNull();
  expect(templateMethod(source(1326, "'no'"), question)).toBeNull();
  expect(templateMethod(source(1326, "'no'"), question, { skill: "6.4-divisibility", step: 1 })).toBeNull();
  expect(templateMethod(source(1326, "'no'"), question, { skill: "6.4-factors", step: 3 })).toBeNull();
  expect(templateMethod(source(23, "'prime'"), "Is 23 prime or composite? Write prime or composite.", { skill: "6.4-prime-composite", step: 3 })).toBeNull();
  expect(templateMethod(source(29464, "'no'"), "Is 29464 divisible by both 4 and 6? Circle yes or no.", scope)).toBeNull();
  const hard: TemplateSource = { answer: "p + q", check: null, values: null, derived: [], slots: [
    { name: "p", value: { int: "31" }, domain: { min: 31, max: 97 } },
    { name: "q", value: { int: "37" }, domain: { min: 31, max: 97 } },
  ] };
  expect(templateMethod(hard, "Add only the primes: 31, 51, 37.", { skill: "6.4-prime-composite", step: 2 })).toBeNull();
});

it.each([
  ["6.4-prime-composite", 1], ["6.4-prime-composite", 2],
  ["6.4-divisibility", 1], ["6.4-divisibility", 2], ["6.4-divisibility", 3],
])("has supported real teaching templates for %s step %i", (skill, step) => {
  const curriculum = curriculumFor("bc")!;
  let checked = 0;
  for (let attempt = 0; attempt < 40; attempt++) {
    const filled = stepTemplateItem({ curriculum, skill: String(skill), step: Number(step), place: "worked-example", level: 19, day: 10, seed: 121, attempt, ordinal: 0 });
    if (!filled || !/^Is [\d,\s\u00a0\u202f]+ (?:prime or composite|divisible by (?:2|3|4|5|6|8|9|10)\?)/.test(filled.text)) continue;
    checked++;
    expect(templateMethod(filled.ref.source, filled.text, filled.ref), filled.text).not.toBeNull();
  }
  expect(checked).toBeGreaterThan(0);
});

it("keeps distinct native reminder questions when their checked word answers agree", () => {
  const curriculum = curriculumFor("bc")!;
  const placed = planNextWorkbook({ curriculum, grade: 6, profile: null, workbooks: [], number: 1,
    instructions: { version: 1, startLevel: "U19", teachMore: [], teachLess: [], addReview: [], difficulty: null } });
  if (!placed.ok) throw new Error(placed.reason);
  const page: PlannedPage = { number: 3, type: "unit-b", unit: "B", instructions: "text",
    parts: [{ kind: "new-idea", unit: "B", step: { unit: "6.4", skill: "6.4-divisibility", step: 3 }, skills: ["6.4-divisibility"], items: 0, hints: true }],
    capacity: [{ slot: "reminder", part: 0, items: 0 }] };
  const seen = new Set<string>();
  const reminders: string[][] = [];
  for (let attempt = 0; attempt < 80 && reminders.length < 2; attempt++) {
    const filled = stepTemplateItem({ curriculum, skill: "6.4-divisibility", step: 3, place: "worked-example", level: 19, day: 10, seed: 121, attempt, ordinal: 0 });
    if (!filled || filled.ref.answer !== "no" || !/^Is [\d,\s\u00a0\u202f]+ divisible by 4\?/.test(filled.text) || seen.has(filled.text)) continue;
    const built = buildStepItem(filled.ref, filled.text, { id: `example:${attempt}`, workbookId: "00000000-0000-4000-8000-000000001114", page: 3, question: 1, level: 19, skills: ["6.4-divisibility"] }, "code");
    expect(built.check.status).toBe("checked");
    if (!built.package) throw new Error("missing checked example");
    const content = dayPageContent({ curriculum, plan: placed.plan, day: 1, page, layout: layoutDayPage(curriculum, placed.plan, 1, page), questions: [], examples: [{ slot: 0, package: built.package }], child: "Synthetic", workbook: 1 });
    if (content.kind !== "day") throw new Error("not a day page");
    const lines = content.blocks[0].lines ?? [];
    expect(lines).toContain(filled.text);
    expect(lines.join(" ")).toContain("Answer: [no]");
    seen.add(filled.text);
    reminders.push(lines);
  }
  expect(reminders).toHaveLength(2);
  expect(reminders[0]).not.toEqual(reminders[1]);
});
