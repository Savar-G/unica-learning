import { expect, it, vi } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { scenarioModel } from "@/lib/maya-gate/gate";

vi.mock("server-only", () => ({}));

async function solved(work: string, fraction: boolean) {
  const model = scenarioModel();
  let now = 1000;
  const call = createTextSession({ callId: "own-math-regression", package: fraction ? FIXTURES.D : FIXTURES.PT_LONG, model, clock: () => now, random: 1, freeTalk: false });
  model.next([{ act: "open", lines: ["open.hello", "question.problem"] }], {});
  await call.start();
  if (!fraction) {
    now += 100;
    model.next([{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }], { answers: [[80, "e1", "right"]], start: "has_work" });
    await call.child("115 minus 35 is 80.");
  }
  now += 100;
  model.next([{ act: "accept_answer", lines: ["answer.right"] }], { answers: [[fraction ? { type: "fraction", numerator: 7, denominator: 8 } : 10, "result", "right"]] });
  await call.child(`${fraction ? "I got 7/8 because " : "You said to divide 80 by 8. I got 10 because "}${work}.`);
  return call.session.solved;
}

const pairs = [
  // Result 80 belongs to the problem. The unknown-result rule must not hide a false sum.
  ["seventy and ten is eighty", "seventy and nine is eighty"],
  ["forty and forty is eighty", "forty and seven is eighty"],
  ["70 plus 10 is... 80", "70 plus 9 is... 80"],
  ["seventy plus ten is... eighty", "seventy plus nine is... eighty"],
  ["70 plus 10 is… 80", "70 plus 9 is… 80"],
  ["two equal groups of one hundred and two is two hundred and four", "two equal groups of one hundred and two is two hundred and five"],
  ["two equal groups of one hundred and five is two hundred and ten", "two equal groups of one hundred and five is two hundred and five"],
  ["three groups of one hundred and twenty is three hundred and sixty", "three groups of one hundred and twenty is three hundred and fifty"],
  ["one hundred and fifteen minus thirty-five is eighty", "one hundred and fifteen minus thirty is eighty"],
] as const;

for (const fraction of [false, true]) {
  it.each(pairs)(`keeps true own math (${fraction ? "fraction" : "whole"}): %s`, async correct => {
    expect(await solved(correct, fraction)).toBe("child");
  });
  it.each(pairs)(`refuses false own math (${fraction ? "fraction" : "whole"}): %s`, async (_correct, wrong) => {
    expect(await solved(wrong, fraction)).toBeNull();
  });
}

it.each([
  ["forty and seven is forty-seven", "forty and seven is fifty-seven"],
  ["twenty and six make twenty-six", "twenty and six make twenty-seven"],
] as const)("keeps arithmetic and beside a fraction final: %s", async (correct, wrong) => {
  expect(await solved(correct, true)).toBe("child");
  expect(await solved(wrong, true)).toBeNull();
});

it.each([
  ["one hundred and two is one hundred and three", false],
  ["one hundred and fifteen is eighty", false],
  ["one hundred and fifteen is one hundred and fifteen", true],
] as const)("checks compound scalar claims beside a whole-number final: %s", async (work, accepted) => {
  expect(await solved(work, false)).toBe(accepted ? "child" : null);
});
