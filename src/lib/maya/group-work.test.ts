import { expect, it, vi } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { scenarioModel } from "@/lib/maya-gate/gate";

vi.mock("server-only", () => ({}));

it.each([
  ["two groups of four", 8, true],
  ["two groups of four", 9, false],
  ["two equal groups of four", 8, true],
  ["two equal groups of four", 9, false],
  ["one equal group of eight", 8, true],
  ["one equal group of eight", 9, false],
  ["two equal groups of one", 2, true],
  ["two equal groups of one", 3, false],
  ["two groups of one", 3, false],
  ["one equal group of one", "one", true],
  ["two equal groups of four", "one", false],
  ["ten equal groups of one", 10, true],
  ["ten equal groups of one", 8, false],
  ["one equal group of ten", 10, true],
  ["one equal group of ten", 8, false],
  ["one hundred equal groups of zero", 0, true],
  ["one hundred equal groups of zero", 8, false],
  ["two equal groups of one hundred and one", "two hundred and two", true],
  ["two equal groups of one hundred and one", "two hundred and one", false],
  ["1,000 equal groups of one", 1000, true],
  ["1,000 equal groups of one", 1001, false],
] as const)("checks own group work beside a final answer: %s is %s", async (work, result, accepted) => {
  const model = scenarioModel();
  let now = 1000;
  const call = createTextSession({ callId: "own-group-work", package: FIXTURES.PT_LONG, model, clock: () => now, random: 1, freeTalk: false });
  model.next([{ act: "open", lines: ["open.hello", "question.problem"] }], {});
  await call.start();
  now += 100;
  model.next([{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }], { answers: [[80, "e1", "right"]], start: "has_work" });
  await call.child("115 minus 35 is 80.");
  now += 100;
  model.next([{ act: "accept_answer", lines: ["answer.right"] }], { answers: [[10, "result", "right"]] });
  await call.child(`You said to divide 80 by 8. I got 10 because ${work} is ${result}.`);
  expect(call.session.solved).toBe(accepted ? "child" : null);
  const turn = call.trace().turns.filter(t => t.kind === "maya").at(-1);
  if (!accepted) expect(turn?.attempts[0].refusal?.code).toBe("answer_not_committed");
});

it.each([
  ["one hundred equal groups of zero is zero", true],
  ["one hundred equal groups of zero is eight", false],
  ["one hundred and one equal groups of zero is zero", true],
  ["one hundred and one equal groups of zero is eight", false],
  ["two hundred and five groups of zero is zero", true],
  ["two hundred and five groups of zero is eight", false],
  ["two groups of three is six", true],
  ["two groups of three is eight", false],
  ["two equal groups of one is two", true],
  ["two equal groups of one is three", false],
] as const)("checks compound group work beside a fraction answer: %s", async (work, accepted) => {
  const model = scenarioModel();
  let now = 1000;
  const call = createTextSession({ callId: "fraction-group-work", package: FIXTURES.D, model, clock: () => now, random: 1, freeTalk: false });
  model.next([{ act: "open", lines: ["open.hello", "question.problem"] }], {});
  await call.start();
  now += 100;
  model.next([{ act: "accept_answer", lines: ["answer.right"] }], { answers: [[{ type: "fraction", numerator: 7, denominator: 8 }, "result", "right"]] });
  await call.child(`I got 7/8 because ${work}.`);
  expect(call.session.solved).toBe(accepted ? "child" : null);
});
