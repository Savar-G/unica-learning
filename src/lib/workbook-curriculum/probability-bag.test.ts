import { expect, it } from "vitest";
import { bcStepProgressions } from "./index";
import { fillTemplate, prepareTemplate, seededRandom } from "./template";

const curriculum = bcStepProgressions();
const step = curriculum.skillSteps("4.17-predict-outcome")!.find((s) => s.number === 3)!;

it.each([0, 2])("keeps seeded bag template %i within 8 to 12 total items", (index) => {
  const template = step.templates![index];
  const totals = new Map<number, number>();
  const outcomes = new Set<string>();
  let outside = 0, equal = 0, wrongKey = 0;
  for (let seed = 1; seed <= 256; seed++) {
    const filled = fillTemplate(step, template, curriculum.contexts, seededRandom(seed));
    const counts = /(\d+) red, (\d+) blue and (\d+) green/.exec(filled.text);
    expect(counts, filled.text).not.toBeNull();
    const [a, b, c] = counts!.slice(1).map(Number);
    const total = a + b + c;
    totals.set(total, (totals.get(total) ?? 0) + 1);
    outside += Number(total < 8 || total > 12);
    equal += Number(a === b + c);
    const expected = index === 0 ? a > b + c ? "red" : "a different colour" : String(a > b + c);
    wrongKey += Number(filled.answer !== expected);
    outcomes.add(filled.answer);
  }
  console.log(JSON.stringify({ template: index + 1, seeds: 256, totals: Object.fromEntries([...totals].sort(([a], [b]) => a - b)), outside, equal, wrongKey }));
  expect(outside).toBe(0);
  expect(equal).toBe(0);
  expect(wrongKey).toBe(0);
  expect([...totals.keys()].sort((a, b) => a - b)).toEqual([8, 9, 10, 11, 12]);
  expect(outcomes.size).toBe(2);
});

it.each([0, 2])("admits exactly the valid count combinations for bag template %i", (index) => {
  const prepared = prepareTemplate(step, step.templates![index], curriculum.contexts);
  let accepted = 0, rejected = 0, wrongAdmission = 0;
  for (let a = 1; a <= 12; a++) for (let b = 1; b <= 12; b++) for (let c = 1; c <= 12; c++) {
    const randomValues = [a, b, c].map((n) => (n - 0.5) / 12);
    let cursor = 0, passed = false;
    try { prepared.fill(() => randomValues[cursor++] ?? 0, 1); passed = true; }
    catch (error) { expect(String(error)).toContain("within 1 attempts"); }
    const valid = a + b + c >= 8 && a + b + c <= 12 && a !== b + c;
    wrongAdmission += Number(passed !== valid);
    if (passed) accepted++; else rejected++;
  }
  console.log(JSON.stringify({ template: index + 1, combinations: 1728, accepted, rejected, wrongAdmission }));
  expect(wrongAdmission).toBe(0);
  expect(accepted).toBeGreaterThan(0);
  expect(accepted + rejected).toBe(1728);
});
