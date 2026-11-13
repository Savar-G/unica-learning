// The independent review of the wave A and B merge (9884b94e, on #760) found three defects. Each test gives the input the
// review named and the output it asked for, through the text adapter and the gate's scripted model.
import { describe, expect, it, vi } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { createSession, step } from "@/lib/maya";
import { committedValue } from "@/lib/maya/session";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { scenarioModel } from "@/lib/maya-gate/gate";

vi.mock("server-only", () => ({}));

const start = async (id: keyof typeof FIXTURES) => {
  const model = scenarioModel();
  const text = createTextSession({ callId: `review-760-${id}`, package: FIXTURES[id], model, clock: () => 1000, random: 1 });
  model.next([], undefined);
  await text.start();
  return { model, text };
};

describe("review of 9884b94e (#760)", () => {
  it("P1: two committed wrong words on a claim get the easier example, then the honest close, never the answer word", async () => {
    const { model, text } = await start("CLAIM_GT");
    model.next([{ throws: true }], { start: "has_work" });
    await text.child("360 times 4 is 1440.");
    const said: string[] = [];
    for (let i = 0; i < 2; i++) {
      model.next([{ throws: true }], undefined);
      said.push(...(await text.child("It's no.")).say);
    }
    expect(text.session.finalMisses).toBe(2);
    for (let i = 0; i < 12 && !text.session.outcome; i++) {
      model.next([{ throws: true }], undefined);
      said.push(...(await text.child("I'm stuck.")).say);
    }
    // The given word's lines (answer.give.claim, write.claim): "The answer is yes. Now circle yes." The easier example's
    // own word ("So in the end, we circle yes.", for 2 × 2 > 3) is another problem's.
    expect(said.join(" "), said.join(" | ")).not.toMatch(/answer is yes|so it's yes|that means yes|(?:now|please|can you) circle yes|circle yes on your/i);
    expect(text.session.solved).toBeNull();
    expect(text.session.assistance).not.toContain("answer_given");
    expect(text.session.assistance).toContain("worked_example");
    expect(text.session.outcome?.reason).toBe("maya_closed");
  });

  /** The session right after the child's turn, before Maya answers it. */
  const after = (id: keyof typeof FIXTURES, text: string) => {
    let s = createSession({ callId: `review-760-${id}`, package: FIXTURES[id] });
    s = step(s, { type: "start", at: 1000 }).session;
    s = step(s, { type: "proposal", at: 1000, proposal: { version: 2, act: "open", parts: [{ line: "open.hello" }, { line: "question.problem" }] } }).session;
    return step(s, { type: "child_turn", at: 5000, text }).session;
  };
  const miss = (id: keyof typeof FIXTURES, text: string, value: number) => {
    const s = after(id, text);
    return committedValue(s, { value: { type: "number", value }, step: s.ladder.step, verdict: "wrong" });
  };

  it.each([["5.", true], ["The digit is 5.", true], ["5 ten thousands", true], ["Help, 5.", false], ["I think the digit is 5.", false]] as const)(
    "P2: %j on the ten thousands digit of 785243 is a miss: %s", (text, counts) => {
      expect(miss("PVV", text, 5)).toBe(counts);
    });

  it.each([["5.7.", true], ["It's 5.7.", true], ["Help, 5.7.", false], ["I copied 5.7.", false], ["I'm copying 5.7.", false], ["Maybe 5.7.", false]] as const)(
    "P2: %j on 5 wholes and 8 tenths is a miss: %s", (text, counts) => {
      expect(miss("PVB", text, 5.7)).toBe(counts);
    });
});
