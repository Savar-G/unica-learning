import { describe, expect, it } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { workedSteps, type OperationPackage } from "@/lib/question-package";

const operation = { kind: "subtract" as const, operands: [73, 21] as [number, number] };
const pkg: OperationPackage = {
  ...(SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage), id: "synthetic-one-operand", text: "73 - 21 = ?",
  operation, steps: workedSteps(operation), answer: { value: { type: "number", value: 52 }, accepted: [], unit: null },
  wrongAnswers: [{ value: { type: "number", value: 42 }, cause: "O1", description: "Subtracts the tens incorrectly", step: "tens" }],
};
async function ready(say: string, stream: boolean) {
  let now = 1000;
  const parts: string[] = [], reviewer = fakeTalkReviewer();
  const model = conversationalFake({ answer: brief => brief.childTurn === "3 minus 1 is 2."
    ? reply("Yes, 3 minus 1 is 2. What is 7 minus 2?", "guide", { step: "tens", reading: { answers: [{ value: { type: "number", value: 2 }, step: "ones", problem: "target", verdict: "right" }] } })
    : reply(say, "confirm", { reading: { unclear: true, mathClaim: true } }),
    ...(stream ? { stream: { chunk: 1 } } : {}) });
  const session = createTextSession({ callId: "one-operand", package: pkg, model, reviewer, random: 3, clock: () => now += 100,
    modelRepair: false, ...(stream ? { onSayPart: (text: string) => parts.push(text) } : {}) });
  expect(session.session.contentProblem).toBeNull();
  await session.start(); await session.child("3 minus 1 is 2.");
  expect(session.session.done).toEqual(["ones"]);
  expect(session.session.ladder.step).toBe("tens");
  parts.length = 0; reviewer.requests.length = 0;
  return { session, parts, reviewer };
}
const roleForms = ["Three minus one is", "Three minus one was", "3 minus one is", "Three minus 1 was"];
describe("one is a numeric operand in column truth checks", () => {
  it.each(roleForms.flatMap(form => [false, true].map(stream => ({ form, stream }))))("refuses a false $form role, stream $stream", async ({ form, stream }) => {
    const sentence = `${form} the tens step!`;
    const c = await ready(`${sentence} Did you say 6?`, stream);
    const out = await c.session.child("3 minus 1 is 6.");
    expect(out.say.join(" ")).not.toContain(sentence);
    expect(c.parts).not.toContain(sentence);
    expect(c.reviewer.requests).toHaveLength(0);
    expect(c.session.session.done).toEqual(["ones"]);
    expect(c.session.session.solved).toBeNull();
    await c.session.finish();
  });
  it.each(roleForms.flatMap(form => [false, true].map(stream => ({ form, stream }))))("preserves a true $form role, stream $stream", async ({ form, stream }) => {
    const sentence = `${form} the ones step!`;
    const c = await ready(`${sentence} Did you say 6?`, stream);
    const out = await c.session.child("3 minus 1 is 6.");
    expect(out.say.join(" ")).toBe(`${sentence} Did you say 6?`);
    if (stream) expect(c.parts).toContain(sentence);
    expect(c.session.session.done).toEqual(["ones"]);
    expect(c.session.session.solved).toBeNull();
    await c.session.finish();
  });
  it.each(["three minus one is six.", "3 minus 1 is 6."].flatMap(child => [false, true].map(stream => ({ child, stream }))))("reads the child's whole expression with one: $child stream $stream", async ({ child, stream }) => {
    const say = "I heard 3 minus 1, but for the tens it's 7 minus 2. Did you say 6?";
    const c = await ready(say, stream);
    const out = await c.session.child(child);
    expect(out.say.join(" ")).toBe(say);
    expect(c.reviewer.requests).toHaveLength(0);
    expect(c.session.session.done).toEqual(["ones"]);
    expect(c.session.session.solved).toBeNull();
    await c.session.finish();
  });
});
