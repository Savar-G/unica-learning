// A child's claim ("Is 2 minus 8, 6?") takes the reply prepared for the same claim, and nothing looser (synthetic 52 - 28).
import { describe, expect, it } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { memorySpendSeam } from "@/lib/maya-spend-seam";
import { MAX_PREPARES_PER_TURN } from "@/lib/maya-prepared";

const pkg = SAMPLE_PACKAGES["subtract-52-28"];
const num = (value: number) => ({ type: "number" as const, value });
const ask = () => reply("2 minus 8 isn't 6; 6 is 8 minus 2. Since 2 is smaller than 8, we take a ten. What is 12 minus 8?", "guide", { step: "ones", level: 2, reading: { answers: [{ value: num(6), step: "ones", problem: "target", verdict: "wrong" }] } });

async function turn(text: string, prepareExpected = true) {
  let t = 1_000;
  const spend = memorySpendSeam(100);
  const model = conversationalFake({ answer: () => ask() });
  const recs: { reason?: string; kind: string; status: string }[] = [];
  const session = createTextSession({ callId: "claim", package: pkg, clock: () => t, model, spend, prepareExpected, reviewer: fakeTalkReviewer(), onPreparation: (r) => { recs.push(r); } });
  await session.start(); t += 5_000;
  const before = model.briefs.length;
  await session.child("Hi Maya."); t += 5_000;
  const n0 = model.briefs.length;
  const out = await session.child(text);
  const prepared = model.briefs.slice(before, n0).filter((b) => b.childTurn !== "Hi Maya.").length;
  await session.finish();
  return { out, recs, prepared, spend };
}

describe("a prepared claim", () => {
  it("is used for the same claim, and the reply passes the real-turn checks", async () => {
    const { out, recs, spend } = await turn("Is 2 minus 8, 6?");
    expect([out.prepared, out.preparedKind]).toEqual(["hit", "expected"]);
    expect(recs.filter((r) => r.status === "used")).toHaveLength(1);
    expect(out.say.join(" ")).toContain("12 minus 8");
    expect(spend.settled.length + spend.givenBack.length).toBe(spend.taken.length);
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
    ["a committed answer, not a question", "2 minus 8 is 6"],
  ])("is never used for %s", async (_name, text) => {
    const { out } = await turn(text);
    expect(out.preparedKind).not.toBe("expected");
    expect(out.prepared === "hit").toBe(false);
  });
});
