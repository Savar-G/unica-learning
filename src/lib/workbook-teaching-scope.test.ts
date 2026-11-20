import { expect, it } from "vitest";
import { templateMethod } from "./workbook-book";
import { curriculumFor } from "./workbook-curriculum";
import { stepTemplateItem } from "./workbook-step-items";
import type { TemplateSource } from "./question-package-template";

function source(answer: string, numbers: Record<string, number>): TemplateSource {
  return { answer, check: null, values: null, derived: [], slots: Object.entries(numbers).map(([name, value]) => ({
    name, value: { int: String(value) }, domain: { min: 0, max: 10000 },
  })) };
}

it.each([1, 2])("teaches approved step %i estimation from the printed benchmark", step => {
  const curriculum = curriculumFor("bc")!;
  let groups = 0;
  for (let attempt = 0; attempt < 120; attempt++) {
    const filled = stepTemplateItem({ curriculum, skill: "3.1-estimate-quantity", step,
      place: "worked-example", level: 10, day: 3, seed: 121, attempt, ordinal: 0 });
    if (!filled || !["g * n", "n"].includes(filled.ref.source.answer)) continue;
    const method = templateMethod(filled.ref.source, filled.text, filled.ref);
    expect(method, filled.text).toContain("about");
    expect(method).toContain(filled.ref.answer);
    expect(method).not.toContain("Work it out");
    if (filled.ref.source.answer === "n") expect(method).toContain("÷");
    else { groups++; expect(method).toContain("×"); }
  }
  expect(groups).toBeGreaterThan(0);
  const g = step === 1 ? 25 : 100;
  const inverse = templateMethod(source("n", { g, n: 4, t: g * 4 }),
    `About ${g} beads in each group. ${g * 4} beads in all. How many groups?`,
    { skill: "3.1-estimate-quantity", step });
  expect(inverse).toContain(`${g * 4} ÷ ${g} = 4`);
});

it("requires the stated group convention before teaching approximate true/false equality", () => {
  const src = source("'true' if flip == 0 else 'false'", { g: 25, n: 2, flip: 1, shown: 55 });
  const scope = { skill: "3.1-estimate-quantity", step: 1 };
  expect(templateMethod(src, "True or false: 2 groups of about 25 is about 55.", scope)).toBeNull();
  const method = templateMethod(src, "Use 25 for every group. True or false: 2 groups of about 25 gives an estimate of 55.", scope);
  expect(method).toContain("2 × 25 = 50");
  expect(method).toContain("55 does not match 50");
});

it("does not use a correct multiplication to teach the wrong estimation step", () => {
  expect(templateMethod(source("g * n", { g: 100, n: 4 }), "A box holds 100 cards. About how many cards in 4 boxes?",
    { skill: "3.1-estimate-quantity", step: 1 })).toBeNull();
  expect(templateMethod(source("a + b", { a: 13, b: 29 }), "13 + 29 = ?",
    { skill: "3.1-estimate-quantity", step: 3 })).toBeNull();
});

it("requires a printed capacity guide, and teaches its own quantities without an impossibility claim", () => {
  const src = source("str(b)", { b: 30, bad: 300 });
  const scope = { skill: "3.1-estimate-quantity", step: 3 };
  const question = "Books on a classroom shelf. Which guess is sensible: 30 or 300?";
  expect(templateMethod(src, question, scope)).toBeNull();
  expect(templateMethod(src, `Use about 30 books per shelf as a guide. ${question}`, scope)).toContain("matches that guide");
  expect(templateMethod(src, `Use about 300 books per shelf as a guide. ${question}`, scope)).toBeNull();
  expect(templateMethod(src, `Use about 30 pencils per pencil case as a guide. ${question}`, scope)).toBeNull();
});

it("does not expose a source recipe as the child's trading method", () => {
  const src = source("100 * h + 10 * t + o", { h: 4, t: 13, o: 12 });
  const method = templateMethod(src, "4 hundreds + 13 tens + 12 ones = ?", { skill: "3.1-place-value-1000", step: 3 });
  expect(method).toContain("Trade 10 ones for 1 ten");
  expect(method).toContain("Trade 10 tens for 1 hundred");
  expect(method).toContain("5 hundreds, 4 tens, 2 ones make 542");
  expect(templateMethod(src, "What is the number?", { skill: "3.1-place-value-1000", step: 3 })).toBeNull();
});

it.each([
  ["3.6-increasing-pattern", "a + (n - 1) * d", "Start at 7, add 4 each time. Number 4 in the pattern is __ (The start is number 1.)", "7, 11, 15, 19"],
  ["3.6-decreasing-pattern", "a - (n - 1) * d", "Start at 80, take away 4 each time. Number 4 in the pattern is __ (The start is number 1.)", "80, 76, 72, 68"],
] as const)("counts the jumps from term one for %s", (skill, answer, text, expected) => {
  const a = skill === "3.6-increasing-pattern" ? 7 : 80;
  const method = templateMethod(source(answer, { a, d: 4, n: 4 }), text, { skill, step: 2 });
  expect(method).toContain("3 jumps");
  expect(method).toContain(expected);
});

it("requires the angle's printed opening even when its template index and key are familiar", () => {
  const scope = { skill: "6.13-classify-angles", step: 1, index: 0 };
  const src = source("'obtuse'", {});
  expect(templateMethod(src, "The angle has long sides. What kind is it?", scope)).toBeNull();
  expect(templateMethod(src, "The angle is wider than a square corner. What kind is it?", scope)).toBeNull();
  expect(templateMethod(src, "The angle is wider than a square corner but narrower than a straight line. What kind is it?", scope)).toContain("obtuse");
});

it("shows the grouping method before adjusting the estimated total", () => {
  const scope = { skill: "3.1-estimate-quantity", step: 2 };
  const method = templateMethod(source("a * g - g - b", { a: 5, g: 100, b: 20 }),
    "5 boxes hold about 100 cards each. Take away 1 box and 20 more cards. About how many cards are left?", scope);
  expect(method).toContain("5 × 100 = 500");
  expect(method).toContain("500 − 100 − 20 = 380");
  expect(templateMethod(source("a * g - g - b", { a: 5, g: 100, b: 20 }),
    "5 boxes hold about 100 cards each. Take away 20 cards. About how many cards are left?", scope)).toBeNull();
});
