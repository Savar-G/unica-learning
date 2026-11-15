import { describe, expect, it } from "vitest";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession } from "@/lib/maya-text";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { memorySpendSeam } from "@/lib/maya-spend-seam";
import { workedSteps, type OperationPackage } from "@/lib/question-package";
import { step, streamPlan, streamSentence } from "@/lib/maya";

const operation = { kind: "subtract" as const, operands: [532, 178] as [number, number] };
const pkg: OperationPackage = {
  ...(SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage),
  id: "desk-hearing-synthetic", text: "532 - 178 = ?", operation, steps: workedSteps(operation),
  answer: { value: { type: "number", value: 354 }, accepted: [], unit: null },
  wrongAnswers: [{ value: { type: "number", value: 464 }, cause: "O1", description: "Takes the smaller digit from the larger", step: "ones" }],
};
const HEARING = "I heard 12 minus 8, but for the tens it's 12 minus 7.";
const VALID = `${HEARING} Did you say 6 for the answer?`;
const DESK = `${HEARING} Did you say 5 for the answer?`;

async function desk(say: string, stream: boolean, passing = false, prepared = false) {
  let now = Date.UTC(2026, 10, 14, 16);
  const reviewer = fakeTalkReviewer(() => passing ? { verdict: "pass" } : { verdict: "fail", rules: ["unkind"], reason: "test refuses all reviews" });
  const parts: string[] = [];
  const spend = memorySpendSeam(100);
  const model = conversationalFake({
    answer: (brief) => brief.childTurn === "12 minus 8 is 4."
      ? reply("Yes, 12 minus 8 is 4. What is 12 minus 7?", "guide", { step: "tens", reading: { answers: [{ value: { type: "number", value: 4 }, step: "ones", problem: "target", verdict: "right" }] } })
      : reply(say, "confirm", { reading: { unclear: true, mathClaim: true } }),
    ...(stream ? { stream: { chunk: 5 } } : {}),
  });
  const session = createTextSession({ callId: "desk-hearing", package: pkg, model, clock: () => now += 500, random: 3, reviewer,
    ...(prepared ? { spend, prepareExpected: false } : {}),
    modelRepair: false, ...(stream ? { onSayPart: (text: string) => parts.push(text) } : {}) });
  await session.start();
  await session.child("12 minus 8 is 4.");
  expect(session.session.done).toContain("ones");
  expect(session.session.ladder.step).toBe("tens");
  parts.length = 0;
  reviewer.requests.length = 0;
  return { session, reviewer, parts, model, spend };
}

describe("the desk hearing contrast uses the child's operation and the current effective column", () => {
  it.each([false, true])("accepts the complete valid reply with zero reviews (stream %s)", async (stream) => {
    const c = await desk(VALID, stream);
    const out = await c.session.child("12 minus 8 is 6.");
    expect(out.say.join(" ")).toBe(VALID);
    expect(c.reviewer.requests).toHaveLength(0);
    expect(c.session.session.done).toEqual(["ones"]);
    if (stream) expect(c.parts).toEqual([HEARING, "Did you say 6 for the answer?"]);
  });
  it.each([false, true])("refuses the exact desk combination that supplies the open tens result (stream %s)", async (stream) => {
    const c = await desk(DESK, stream, true);
    const before = c.session.trace().counts.fallbacks;
    const out = await c.session.child("12 minus 8 is 5.");
    expect(out.say.join(" ")).not.toContain(HEARING);
    expect(out.say.join(" ")).toMatch(/5\?$/);
    expect(c.parts).not.toContain(HEARING);
    expect(c.parts.join(" ")).not.toContain("Did you say 5 for the answer?");
    expect(c.reviewer.requests).toHaveLength(0);
    expect(c.session.session.done).toEqual(["ones"]);
    expect(c.session.session.solved).toBeNull();
    expect(c.session.trace().counts.sayRefusals?.reveals_step).toBeGreaterThan(0);
    expect(c.session.trace().counts.fallbacks).toBe(before + 1);
  });
  it.each([
    "I heard 12 minus 7, but for the tens it's 12 minus 7.",
    "I heard 8 minus 12, but for the tens it's 12 minus 7.",
    "I heard 12 plus 8, but for the tens it's 12 minus 7.",
    "I heard 12 minus 8, but for the ones it's 12 minus 7.",
    "I heard 12 minus 8, but for the hundreds it's 12 minus 7.",
    "I heard 12 minus 8, but for the tens it's 3 minus 7.",
    "I heard 12 minus 8, but for the tens it's 7 minus 12.",
    "I heard 12 minus 8, but for the tens it's 12 plus 7.",
    "12 minus 8 is the tens step.",
    "12 minus 8 was the tens step.",
    "12 minus 8 is the tens step!",
    "12 minus 8 was the tens step!",
    "Twelve minus eight is the tens step.",
    "Twelve minus eight was the tens step.",
  ])("a passing reviewer cannot authorize false column facts: %s", async (sentence) => {
    for (const stream of [false, true]) {
      const c = await desk(`${sentence} Did you say 6?`, stream, true);
      const out = await c.session.child("12 minus 8 is 6.");
      expect(out.say.join(" ")).not.toContain(sentence);
      expect(c.parts).not.toContain(sentence);
      expect(c.session.session.done).toEqual(["ones"]);
    }
  });
  it.each([
    "12 minus 8 is the ones step!",
    "12 minus 8 was the ones step!",
    "Twelve minus eight is the ones step.",
    "Twelve minus eight was the ones step.",
  ])("preserves true role statements: %s", async (sentence) => {
    for (const stream of [false, true]) {
      const c = await desk(`${sentence} Did you say 6?`, stream, true);
      const out = await c.session.child("12 minus 8 is 6.");
      expect(out.say.join(" ")).toBe(`${sentence} Did you say 6?`);
      if (stream) expect(c.parts).toContain(sentence);
    }
  });
  it.each([
    "I heard twelve minus eight, but for the tens it's twelve minus seven.",
    "I heard 12 minus 8, but for the tens it's 12 minus 7!",
  ])("a true noncanonical hearing form retains its review: %s", async (sentence) => {
    for (const stream of [false, true]) {
      const c = await desk(`${sentence} Did you say 6?`, stream, true);
      const out = await c.session.child("12 minus 8 is 6.");
      expect(out.say.join(" ")).toBe(`${sentence} Did you say 6?`);
      expect(c.reviewer.requests.map(request => request.line)).toContain(sentence);
    }
  });
  it.each(["5.", "12 minus 8 is 5. Help.", "12 minus 8 is 5. Stop.", "Maybe 12 minus 8 is 5.", "I am sad. 12 minus 8 is 5.", "12 minus 8 is 5. I am unsafe."])("no closed hearing exemption for %s", async (child) => {
    for (const stream of [false, true]) {
      const c = await desk(VALID, stream);
      const out = await c.session.child(child);
      expect(out.say.join(" ")).not.toContain(HEARING);
      expect(c.parts).not.toContain(HEARING);
    }
  });
  it.each(["I heard 12 minus 8, but for the tens it's 12 minus 7, trust me.", "I heard 12 minus 8, but for the tens it's 12 minus 7 today."])("an unrelated suffix keeps its review: %s", async (sentence) => {
    const c = await desk(`${sentence} Did you say 6?`, true);
    const out = await c.session.child("12 minus 8 is 6.");
    expect(out.say.join(" ")).not.toContain(sentence);
    expect(c.parts).not.toContain(sentence);
    expect(c.reviewer.requests.map((request) => request.line)).toContain(sentence);
  });
  it("the stream uses code's child read even when the model labels the turn math", async () => {
    const c = await desk(VALID, false);
    const heard = step(c.session.session, { type: "child_turn", at: c.session.session.now! + 500, text: "My cat is sad. 12 minus 8 is 5." }).session;
    const plan = streamPlan(heard)!;
    expect(streamSentence(HEARING, plan, 0, 0, false)).toBe("stop");
  });
  it.each([
    [VALID, "12 minus 8 is 6.", true],
    ["I heard 8 minus 12, but for the tens it's 12 minus 7. Did you say 6?", "12 minus 8 is 6.", false],
    [DESK, "12 minus 8 is 5.", false],
  ])("validates a prepared proposal again on use: %s", async (say, child, accepted) => {
    const c = await desk(say, true, true, true);
    expect(c.session.prepare({ text: child, reason: "interim" })).toBe(true);
    const out = await c.session.child(child);
    expect(out).toMatchObject({ prepared: "hit", preparedKind: "interim" });
    expect(out.say.join(" ") === say).toBe(accepted);
    expect(c.reviewer.requests).toHaveLength(0);
    expect(c.session.session.done).toEqual(["ones"]);
    await c.session.finish();
    expect(c.spend.settled.length + c.spend.givenBack.length).toBe(c.spend.taken.length);
  });
  it.each(["twelve minus eight is six.", "12 minus 8 is 6."])("reads the heard operation from the child's whole words: %s", async (child) => {
    const c = await desk(VALID, true);
    expect((await c.session.child(child)).say.join(" ")).toBe(VALID);
    expect(c.reviewer.requests).toHaveLength(0);
  });
});
