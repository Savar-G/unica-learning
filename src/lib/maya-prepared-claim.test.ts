// A child's claim ("Is 2 minus 8, 6?") takes the reply prepared for the same claim, and nothing looser (synthetic 52 - 28).
import { describe, expect, it } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { memorySpendSeam } from "@/lib/maya-spend-seam";
import { MAX_PREPARES_PER_TURN } from "@/lib/maya-prepared";
import { workedSteps, type QuestionPackage } from "@/lib/question-package";

const pkg = SAMPLE_PACKAGES["subtract-52-28"];
const num = (value: number) => ({ type: "number" as const, value });
const deskPackage: QuestionPackage = {
  ...pkg, id: "synthetic-532-178", text: "532 - 178 = ?", level: 10,
  skill: { standard: "3.3", skills: ["3.3-subtract-within-1000"] },
  answer: { value: num(354), accepted: [], unit: null }, operation: { kind: "subtract", operands: [532, 178] },
  steps: workedSteps({ kind: "subtract", operands: [532, 178] }),
  wrongAnswers: [{ value: num(446), cause: "O1", description: "Subtracts the smaller digit from the larger in each column", step: "ones" }],
};
const ask = () => reply("2 minus 8 isn't 6; 6 is 8 minus 2. Since 2 is smaller than 8, we take a ten. What is 12 minus 8?", "guide", { step: "ones", level: 2, reading: { answers: [{ value: num(6), step: "ones", problem: "target", verdict: "wrong" }] } });

async function turn(text: string, prepareExpected = true, more: { package?: QuestionPackage; freeTalk?: boolean; grade?: number } = {}) {
  let t = 1_000;
  const spend = memorySpendSeam(100);
  const model = conversationalFake({ answer: () => ask() });
  const recs: { reason?: string; kind: string; status: string }[] = [];
  const session = createTextSession({ callId: "claim", package: pkg, ...more, clock: () => t, model, spend, prepareExpected, reviewer: fakeTalkReviewer(), onPreparation: (r) => { recs.push(r); } });
  await session.start(); t += 5_000;
  const before = model.briefs.length;
  await session.child("Hi Maya."); t += 5_000;
  const n0 = model.briefs.length;
  const out = await session.child(text);
  const prepared = model.briefs.slice(before, n0).filter((b) => b.childTurn !== "Hi Maya.").length;
  await session.finish();
  return { out, recs, prepared, spend, model, session };
}

describe("a prepared claim", () => {
  it("leaves the third request for a wrong-value interim", async () => {
    let at = 1_000;
    const model = conversationalFake({ answer: () => reply("Let's look at the ones. What is 12 minus 8?", "guide", { step: "ones", level: 2 }) });
    const spend = memorySpendSeam(100);
    const session = createTextSession({ callId: "claim-interim", package: pkg, clock: () => at, model, spend, reviewer: fakeTalkReviewer() });
    await session.start(); at += 5_000;
    await session.child("Hi Maya.");
    expect(session.prepare({ text: "12 minus 8 is 5", reason: "interim" })).toBe(true);
    expect(await session.child("12 minus 8 is 5")).toMatchObject({ prepared: "hit", preparedKind: "interim" });
    await session.finish();
    expect(spend.settled.length + spend.givenBack.length).toBe(spend.taken.length);
  });
  it("is used for the same claim, and the reply passes the real-turn checks", async () => {
    const { out, recs, spend } = await turn("Is 2 minus 8, 6?");
    expect([out.prepared, out.preparedKind]).toEqual(["hit", "expected"]);
    expect(recs.filter((r) => r.status === "used")).toHaveLength(1);
    expect(out.say.join(" ")).toContain("12 minus 8");
    expect(spend.settled.length + spend.givenBack.length).toBe(spend.taken.length);
  });
  it.each([
    { surface: "admin", freeTalk: true, grade: 3, package: pkg },
    { surface: "desk", freeTalk: false, grade: 4, package: deskPackage },
  ])("uses the existing wrong-value request in the $surface settings", async ({ freeTalk, grade, package: question }) => {
    const { out, model, session } = await turn("Is 2 minus 8, 6?", true, { freeTalk, grade, package: question });
    expect(out).toMatchObject({ prepared: "hit", preparedKind: "expected" });
    expect(model.briefs.map((b) => b.childTurn)).not.toContain("Is 2 minus 8, 6?");
    expect(session.session.done).toEqual([]);
  });
  it("stays within the preparation cap", async () => {
    const { prepared } = await turn("Is 2 minus 8, 6?");
    expect(prepared).toBeGreaterThan(0);
    expect(prepared).toBeLessThanOrEqual(MAX_PREPARES_PER_TURN);
  });
  it.each([
    ["another order", "Is 8 minus 2, 6?"],
    ["another result", "Is 2 minus 8, 5?"],
    ["another operation", "Is 2 plus 8, 6?"],
    ["help words added", "Is 2 minus 8, 6? I need help"],
    ["stop words added", "Is 2 minus 8, 6? I want to stop"],
    ["safety words added", "Is 2 minus 8, 6? I want to die"],
    ["a hedge", "I think 2 minus 8 is 6?"],
    ["negation", "Is 2 minus 8 not 6?"],
    ["a committed answer, not a question", "2 minus 8 is 6"],
  ])("is never used for %s", async (_name, text) => {
    const { out } = await turn(text);
    expect(out.preparedKind).not.toBe("expected");
    expect(out.prepared === "hit").toBe(false);
  });
  it("keeps the real proposal checks after the claim selects a request", async () => {
    let at = 1_000;
    const spend = memorySpendSeam(100);
    const model = conversationalFake({ answer: (brief) => brief.childTurn === "6" ? reply("The answer is 24.", "guide", { step: "ones", level: 2 }) : ask() });
    const session = createTextSession({ callId: "claim-leak", package: pkg, model, spend, clock: () => at, reviewer: fakeTalkReviewer(), modelRepair: false });
    await session.start(); at += 5_000;
    await session.child("Hi Maya.");
    const out = await session.child("Is 2 minus 8, 6?");
    expect(out).toMatchObject({ prepared: "hit", preparedKind: "expected" });
    expect(out.say.join(" ")).not.toContain("24");
    expect(session.trace().counts.sayRefusals?.reveals_answer).toBeGreaterThan(0);
    expect(session.session.done).toEqual([]);
    await session.finish();
  });
  it("does not select an old claim after cancellation", async () => {
    let at = 1_000;
    const session = createTextSession({ callId: "claim-stale", package: pkg, model: conversationalFake({ answer: ask }), spend: memorySpendSeam(100), clock: () => at, reviewer: fakeTalkReviewer() });
    await session.start(); at += 5_000;
    await session.child("Hi Maya.");
    session.cancelPending();
    expect((await session.child("Is 2 minus 8, 6?")).prepared).not.toBe("hit");
    await session.finish();
  });
});
