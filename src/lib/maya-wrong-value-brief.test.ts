import { describe, expect, it } from "vitest";
import { workedSteps, type QuestionPackage } from "@/lib/question-package";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { memorySpendSeam } from "@/lib/maya-spend-seam";
import { createTextSession } from "@/lib/maya-text";
import type { TurnBrief } from "@/lib/maya-model";

// Live practice at 980571e0 (voice, two calls): the child had the ones right ("12 minus 8 is 4.") and said "12 minus 8 is
// 5." next. Code's only plan was "Did you say 5?" (rule mustAsk), but the brief never named 5, so the model's reply was
// refused (missing_number), its repair refused too (false_equation, reveals_step) and code's fallback came 2 s later.
// Words below are the children's own turns, with no names or ids. The brief must carry the obligation, in code's words.

const T0 = Date.UTC(2026, 10, 13, 16, 0, 0);
const num = (value: number) => ({ type: "number" as const, value });
const FIFTY_TWO = SAMPLE_PACKAGES["subtract-52-28"];
const op = { kind: "subtract" as const, operands: [532, 178] as [number, number] };
const FIVE_THIRTY_TWO: QuestionPackage = {
  ...FIFTY_TWO, id: "subtract-532-178", text: "532 - 178 = ?", answer: { value: num(354), accepted: [], unit: null },
  operation: op, steps: workedSteps(op),
  wrongAnswers: [{ value: num(446), cause: "O1", description: "Takes the smaller ones digit from the larger", step: "ones" }, { value: num(364), cause: "regroup-forget", description: "Does not take the ten from the tens", step: "tens" }],
  easierExample: { text: "52 - 28 = ?", operation: { kind: "subtract", operands: [52, 28] }, answer: num(24), steps: workedSteps({ kind: "subtract", operands: [52, 28] }) },
};

const credit = (say: string) => reply(say, "guide", { step: "tens", level: 0, reading: { mathClaim: true, answers: [{ step: "ones", value: num(4), problem: "target", verdict: "right" }] } });
// The captured replies that credited the ones, one per question.
const CREDIT = new Map([[FIFTY_TWO.id, credit("Yes, 12 minus 8 is 4. Now the tens are 4, since we took one ten. What is 4 minus 2?")],
  [FIVE_THIRTY_TWO.id, credit("Yes, 12 minus 8 is 4, and you took a ten to make 12 ones. Now the tens are 2 after regrouping. What can you do in the tens?")]]);
const ONES_RIGHT = CREDIT.get(FIFTY_TWO.id)!;
const BAD = (brief: TurnBrief) => reply(brief.childTurn?.includes("5") ? "It sounds like you stopped halfway through. Take your time. We already did 12 minus 8. What is 4 minus 2?" : "x", "confirm", { reading: { unclear: true } });

/** The model reads the notes the way a good model does: when code says to confirm a number, its say asks it. */
const OBEYS = (pkg: QuestionPackage) => (brief: TurnBrief, n: number) => {
  if (n === 0) return CREDIT.get(pkg.id)!;
  const asked = brief.notes.join(" ").match(/Did you say (\d+)\?/);
  return asked ? reply(`Did you say ${asked[1]}?`, "confirm", { reading: { unclear: true } }) : BAD(brief);
};

function call(pkg: QuestionPackage, answer: (brief: TurnBrief, n: number) => unknown, more: Partial<Parameters<typeof createTextSession>[0]> = {}) {
  let now = T0;
  const model = conversationalFake({ answer });
  const session = createTextSession({ callId: "wrong-brief", package: pkg, model, clock: () => (now += 500), random: 3, childName: "Ava", reviewer: fakeTalkReviewer(), prepareExpected: false, ...more });
  return { session, model };
}

describe.each([["52 - 28", FIFTY_TWO], ["532 - 178", FIVE_THIRTY_TWO]] as const)("the captured turn, %s", (_name, pkg) => {
  it("the brief names the child's number and the question code will ask, and never a secret", async () => {
    const { session, model } = call(pkg, OBEYS(pkg));
    await session.start();
    await session.child("12 minus 8 is 4.");
    await session.child("12 minus 8 is 5.");
    const brief = model.briefs[1];
    expect(brief.acts).toContain("confirm");
    expect(brief.childTurn).toBe("12 minus 8 is 5.");
    const notes = brief.notes.join(" ");
    expect(notes).toContain("Did you say 5?");
    expect(notes).toMatch(/never as an equation/i);
    for (const secret of brief.numbers.secret) expect(notes).not.toMatch(new RegExp(`\\b${secret}\\b`));
    const answer = pkg.answer?.value;
    if (answer?.type !== "number") throw new Error("The captured fixture needs a numeric answer.");
    expect(notes).not.toMatch(new RegExp(`\\b${answer.value}\\b`));
  });

  it("live: the model that follows the note passes the strict checks with no repair and no fallback", async () => {
    const { session, model } = call(pkg, OBEYS(pkg));
    await session.start();
    await session.child("12 minus 8 is 4.");
    const out = await session.child("12 minus 8 is 5.");
    expect(out.say).toEqual(["Did you say 5?"]);
    expect(model.briefs).toHaveLength(2);
    const attempts = session.trace().turns.filter((t) => t.kind === "maya").at(-1)!.attempts!;
    expect(attempts.map((a) => [a.source, a.refusal?.say ?? null])).toEqual([["model", null]]);
  });

  it("prepared: a reply prepared for the same wrong value was asked with the obligation, so code accepts it", async () => {
    const spend = memorySpendSeam(10);
    const { session, model } = call(pkg, OBEYS(pkg), { spend });
    await session.start();
    await session.child("12 minus 8 is 4.");
    expect(session.prepare("12 minus 8 is 5.")).toBe(true);
    const out = await session.child("12 minus 8 is 5.");
    expect(out.prepared).toBe("hit");
    expect(out.say).toEqual(["Did you say 5?"]);
    expect(model.briefs).toHaveLength(2);
    expect(model.briefs[1].notes.join(" ")).toContain("Did you say 5?");
    const attempts = session.trace().turns.filter((t) => t.kind === "maya").at(-1)!.attempts!;
    expect(attempts.map((a) => [a.source, a.refusal?.say ?? null])).toEqual([["model", null]]);
    // One handle, settled once and used: the obligation adds no request.
    expect(spend.taken).toHaveLength(1);
    expect(spend.settled).toHaveLength(1);
    expect(spend.givenBack).toHaveLength(0);
  });

  it("prepared: a reply prepared for a turn with no number is not used for the number, so the live model sees the obligation", async () => {
    const spend = memorySpendSeam(10);
    const { session, model } = call(pkg, OBEYS(pkg), { spend });
    await session.start();
    await session.child("12 minus 8 is 4.");
    expect(session.prepare("12 minus 8 is")).toBe(true);
    const out = await session.child("12 minus 8 is 5.");
    expect(out.prepared).not.toBe("hit");
    expect(out.say).toEqual(["Did you say 5?"]);
    expect(model.briefs.at(-1)!.notes.join(" ")).toContain("Did you say 5?");
    expect(session.trace().preparations?.some((x) => x.status === "used")).toBe(false);
    expect(spend.settled).toHaveLength(spend.taken.length - spend.givenBack.length);
  });
});

describe("the checks stay strict (negative controls)", () => {
  const refused = async (say: string) => {
    const { session } = call(FIFTY_TWO, (brief, n) => (n === 0 ? ONES_RIGHT : reply(say, "confirm", { reading: { unclear: true } })));
    await session.start();
    await session.child("12 minus 8 is 4.");
    await session.child("12 minus 8 is 5.");
    const attempts = session.trace().turns.filter((t) => t.kind === "maya").at(-1)!.attempts!;
    return attempts[0].refusal?.say ?? null;
  };
  it("a confirm that does not name the child's number is still refused", async () => {
    expect(await refused("It sounds like you stopped halfway through. Take your time. We already did 12 minus 8. What is 4 minus 2?")).toBe("missing_number");
  });
  it("a confirm that makes an equation of the number is still refused", async () => {
    expect(await refused("I heard 12 minus 8 is 5. Did you mean 5?")).toBe("false_equation");
  });
  it("a confirm that gives the answer or the next result is still refused", async () => {
    expect(await refused("Did you say 5? The answer is 24.")).toBe("reveals_answer");
    expect(await refused("Did you say 5? Then 4 minus 2 is 2.")).toMatch(/reveals_step|false_equation|reveals_answer/);
  });
  it("no number is named when code has no confirm to ask, and a number named is always one the child said", async () => {
    const { session, model } = call(FIFTY_TWO, () => reply("Let's look at the ones. What is 12 minus 8?", "guide", { step: "ones", level: 2 }));
    await session.start();
    await session.child("Is 2 minus 8, 6?");
    expect(model.briefs[0].notes.join(" ")).not.toMatch(/Did you say/);
    await session.child("12 minus 8 is 4.");
    await session.child("12 minus 8 is 5.");
    for (const brief of model.briefs) {
      const asked = brief.notes.join(" ").match(/Did you say (\d+)\?/);
      if (asked) expect(brief.childTurn).toMatch(new RegExp(`\\b${asked[1]}\\b`));
    }
  });
});
