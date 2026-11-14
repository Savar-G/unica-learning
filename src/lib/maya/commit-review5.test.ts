// Re-review of dd794d02 (2026-11-12): the subject of a clause that holds the value is an allow-list, a small closed class
// in honest math talk (empty, I, we, it, that, this, these, those, a number expression, a place or column, "adding them",
// "the total", "the sum", "my answer", "the answer", and "they", "both" or "all" with a math verb only). Any other subject
// blocks, in any form and with any verb, and so does a person in a clause after "I heard", "I saw" or "I know".
import { describe, expect, it } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { CHILD_MS, GATE_T0, scenarioModel, type Plan, type Read } from "@/lib/maya-gate/gate";

const THROWS: Plan[] = [{ throws: true }];
type Turn = { text: string; read?: Read | null };
async function play(turns: Turn[]) {
  let now = GATE_T0;
  const model = scenarioModel("review5");
  const call = createTextSession({ callId: "review5", package: FIXTURES.A, model, clock: () => now, random: 1, grade: 4, freeTalk: false });
  model.next([], undefined);
  await call.start();
  for (const t of turns) {
    now += CHILD_MS;
    model.next(t.read === null ? THROWS : [], t.read ?? undefined);
    await call.child(t.text);
  }
  return { done: [...call.session.done], solved: call.session.solved !== null };
}
const read = (value: number, step: string): Read => ({ answers: [[value, step, "right"]] });
const ONES: Turn = { text: "16.", read: read(16, "ones") };
const TENS: Turn = { text: "6.", read: read(6, "tens") };

export const HONEST: [Turn[], string, number, string[]][] = [
  [[], "ones", 16, ["They make 16.", "Together they make 16.", "7 and 9, they make 16.", "They add up to 16.", "Those two make 16.", "I say 16."]],
  [[ONES], "tens", 6, ["They make 6."]],
  [[ONES, TENS], "result", 66, ["They add up to 66.", "Result: 66."]],
];
export const REFUSED: [Turn[], string, number, string[]][] = [
  [[], "ones", 16, ["Sam did 16.", "Sam made 16.", "Sam answered 16.", "Sam worked out 16.", "Sam counted 16.", "Sam was like, 16.", "Sam goes 16.",
    "Sam is saying 16.", "Sam reckons 16.", "Sam's is 16.", "Sam's answer was 16.", "The girl next to me got 16.", "I heard Sam got 16.", "I saw Sam got 16.",
    "I know Sam got 16.", "They got 16.", "They said 16.", "Let's go with 16."]],
];
const credited = async (before: Turn[], step: string, value: number, text: string) =>
  Promise.all([{ text, read: read(value, step) }, { text, read: null }].map(async (turn) => {
    const r = await play([...before, turn]);
    return step === "result" ? r.solved : r.done.includes(step);
  }));

describe("the subject allow-list", () => {
  for (const [before, step, value, turns] of HONEST) {
    it.each(turns)(`credits ${step} for %j on both paths`, async (text) => expect(await credited(before, step, value, text)).toEqual([true, true]));
  }
  for (const [before, step, value, turns] of REFUSED) {
    it.each(turns)(`refuses ${step} for %j on both paths`, async (text) => expect(await credited(before, step, value, text)).toEqual([false, false]));
  }
  it("does not refuse a product said with a colon: 'Product: 48.' on 6 x 4 is no name", async () => {
    // FIXTURES.C is 6 × 4 = 24; a colon after a math word is no speaker.
    let now = GATE_T0;
    const model = scenarioModel("review5-c");
    const call = createTextSession({ callId: "review5-c", package: FIXTURES.C, model, clock: () => now, random: 1, grade: 4, freeTalk: false });
    model.next([], undefined);
    await call.start();
    now += CHILD_MS;
    model.next(THROWS, undefined);
    await call.child("Product: 24.");
    expect(call.session.solved).not.toBeNull();
  });
});
