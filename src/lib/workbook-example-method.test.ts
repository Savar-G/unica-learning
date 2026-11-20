import { expect, it } from "vitest";
import { templateMethod } from "./workbook-book";
import type { TemplateSource } from "./question-package-template";
import { curriculumFor } from "./workbook-curriculum";
import { stepTemplateItem } from "./workbook-step-items";

const source: TemplateSource = {
  answer: "'true' if flip == 0 else 'false'", check: null, values: null,
  slots: [
    { name: "b", value: { int: "10" }, domain: { min: 8, max: 20 } },
    { name: "flip", value: { int: "0" }, domain: { min: 0, max: 1 } },
  ],
  derived: [["bad", "b * 10"]],
};

it("does not teach a sensible estimate with its distractor's calculation", () => {
  expect(templateMethod(source, "True or false: about 10 pencils fit in a pencil case.")).toBeNull();
});

it("keeps a calculation that the true-or-false question actually prints", () => {
  expect(templateMethod(source, "True or false: 10 × 10 = 100.")).toBe("Work it out: 10 × 10 = 100.");
});

it("does not match a printed calculation by a fragment of its operands", () => {
  expect(templateMethod(source, "True or false: 110 × 100 = 11,000.")).toBeNull();
});

it("uses the printed operation rather than a different derived calculation", () => {
  expect(templateMethod({ ...source, derived: [["bad", "b * 10"], ["sum", "b + 10"]] }, "True or false: 10 + 10 = 20.")).toBe("Work it out: 10 + 10 = 20.");
});

it("teaches angle classification from the checked example's opening rather than an unrelated sum", () => {
  const curriculum = curriculumFor("bc")!;
  const answers = new Set<string>();
  for (let attempt = 0; attempt < 40; attempt++) {
    const filled = stepTemplateItem({ curriculum, skill: "6.13-classify-angles", step: 1, place: "worked-example",
      level: 19, day: 5, seed: 121, attempt, ordinal: 0 });
    if (!filled || !["acute", "right", "obtuse"].includes(filled.ref.answer)) continue;
    answers.add(filled.ref.answer);
    const method = templateMethod(filled.ref.source, filled.text, filled.ref);
    expect(method, filled.text).toContain("square corner");
    expect(method).toContain(filled.ref.answer);
    expect(method).not.toMatch(/Work it out|\d+ [+=×]/);
  }
  expect([...answers].sort()).toEqual(["acute", "obtuse", "right"]);
});

it("does not substitute an angle-opening rule for the third-angle reasoning of a triangle", () => {
  const src: TemplateSource = { answer: "'acute'", check: null, values: null, derived: [], slots: [] };
  expect(templateMethod(src, "A triangle has angles of 70 and 60 degrees. Is the triangle acute, right or obtuse?", { skill: "6.15-classify-by-angles", step: 3 })).toBeNull();
  expect(templateMethod(src, "Is this angle acute, right or obtuse?")).toBeNull();
});

it("teaches straight and reflex examples from their own checked classifications", () => {
  const curriculum = curriculumFor("bc")!;
  const answers = new Set<string>();
  for (let attempt = 0; attempt < 40; attempt++) {
    const filled = stepTemplateItem({ curriculum, skill: "6.13-classify-angles", step: 2, place: "worked-example",
      level: 19, day: 8, seed: 121, attempt, ordinal: 0 });
    if (!filled || !["straight", "reflex"].includes(filled.ref.answer)) continue;
    answers.add(filled.ref.answer);
    const method = templateMethod(filled.ref.source, filled.text, filled.ref);
    expect(method).toContain("turn");
    expect(method).toContain(filled.ref.answer);
    expect(method).not.toMatch(/Work it out|\d+ [+=×]/);
  }
  expect([...answers].sort()).toEqual(["reflex", "straight"]);
});

it.each([
  [4, 6, "Multiples of 4: 4, 8, 12. Of 6: 6, 12. First shared: 12."],
  [12, 18, "Multiples of 12: 12, 24, 36. Of 18: 18, 36. First shared: 36."],
  [2, 8, "Multiples of 2: 2, 4, 6, 8. Of 8: 8. First shared: 8."],
] as const)("works the first shared multiple of %i and %i from the example's own numbers", (a, b, expected) => {
  const src: TemplateSource = { answer: "lcm(a, b)", check: null, values: null, derived: [], slots: [
    { name: "a", value: { int: String(a) }, domain: { min: 1, max: 30 } },
    { name: "b", value: { int: String(b) }, domain: { min: 1, max: 30 } },
  ] };
  expect(templateMethod(src, `LCM of ${a} and ${b}?`, { skill: "6.4-lcm", step: 1 })).toBe(expected);
  expect(templateMethod(src, `LCM of ${a} and ${b}?`)).toBeNull();
  expect(templateMethod(src, "Use prime factors to find the LCM.", { skill: "6.4-lcm", step: 3 })).toBeNull();
  expect(templateMethod({ ...src, answer: "lcm(a, b) // a" }, "Find the missing factor.", { skill: "6.4-lcm", step: 1 })).toBeNull();
});

it.each(["worked-example", "word-problems"] as const)("keeps degree-based %s outside the opening-only angle method", place => {
  const curriculum = curriculumFor("bc")!;
  let checked = 0;
  for (let attempt = 0; attempt < 80; attempt++) {
    const filled = stepTemplateItem({ curriculum, skill: "6.13-classify-angles", step: 3, place,
      level: 20, day: 9, seed: 121, attempt, ordinal: 0 });
    if (!filled || filled.ref.answer !== "obtuse") continue;
    checked++;
    expect(templateMethod(filled.ref.source, filled.text, filled.ref)).toBeNull();
  }
  expect(checked).toBeGreaterThan(0);
});

it.each([1, 2])("teaches the printed angle count for step %i instead of its sampling expression", step => {
  const curriculum = curriculumFor("bc")!;
  let checked = 0;
  for (let attempt = 0; attempt < 80; attempt++) {
    const filled = stepTemplateItem({ curriculum, skill: "6.13-classify-angles", step, place: "on-your-own",
      level: 19, day: step === 1 ? 5 : 8, seed: 121, attempt, ordinal: 0 });
    if (!filled || !/^(Of |There (?:is|are) )/.test(filled.text)) continue;
    checked++;
    const method = templateMethod(filled.ref.source, filled.text, filled.ref);
    expect(method).toContain(step === 1 ? "Only acute angles" : "Only reflex angles");
    expect(method).toContain(`angles: ${filled.ref.answer}.`);
    expect(method).not.toContain("Work it out");
  }
  expect(checked).toBeGreaterThan(0);
});

it("does not pass a turn-composition Challenge with an opening definition alone", () => {
  const curriculum = curriculumFor("bc")!;
  let checked = 0;
  for (let attempt = 0; attempt < 80; attempt++) {
    const filled = stepTemplateItem({ curriculum, skill: "6.13-classify-angles", step: 2, place: "challenge",
      level: 19, day: 8, seed: 121, attempt, ordinal: 0 });
    if (!filled || !/quarter|half/.test(filled.text)) continue;
    checked++;
    expect(templateMethod(filled.ref.source, filled.text, filled.ref)).toBeNull();
  }
  expect(checked).toBeGreaterThan(0);
});

it("does not teach an estimation method for a different group size or an unsupported step", () => {
  const src: TemplateSource = { answer: "g * n", check: null, values: null, derived: [], slots: [
    { name: "g", value: { int: "25" }, domain: { min: 25, max: 25 } },
    { name: "n", value: { int: "4" }, domain: { min: 4, max: 4 } },
  ] };
  const text = "A box holds 25 beads. About how many beads are in 4 boxes?";
  expect(templateMethod(src, text, { skill: "3.1-estimate-quantity", step: 1 })).toContain("4 × 25 = 100");
  expect(templateMethod(src, text, { skill: "3.1-estimate-quantity", step: 2 })).toBeNull();
  expect(templateMethod(src, text, { skill: "3.1-estimate-quantity", step: 4 })).toBeNull();
});
