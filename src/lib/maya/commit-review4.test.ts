// Re-review of the commit rule (d956aadf, 2026-11-12). P2-a: honest turns the subject check and the whole-answer words
// refused ("7 and 9 gives 16.", "The ones have 16.", "I'm done with the ones, it's 16."). P1: sources and hedges still
// credited ("Sam: 16.", "16, according to Sam.", "Most likely 16.", "16 is the whole answer."). P2-b: the final answer with
// Maya's words tagged after it ("66, like you said."). The same turns are the review sets of the corpus files.
import { describe, expect, it } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { CHILD_MS, GATE_T0, scenarioModel, type Plan, type Read } from "@/lib/maya-gate/gate";

const THROWS: Plan[] = [{ throws: true }];
type Turn = { text: string; read?: Read | null };
async function play(turns: Turn[]) {
  let now = GATE_T0;
  const model = scenarioModel("review4");
  const call = createTextSession({ callId: "review4", package: FIXTURES.A, model, clock: () => now, random: 1, grade: 4, freeTalk: false });
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
  [[], "ones", 16, ["7 and 9 gives 16.", "Adding them gives 16.", "That gives 16.", "The ones have 16.", "The ones got 16.", "The ones column has 16.",
    "I'm done with the ones, it's 16.", "The ones are done. 16.", "16. Now the tens, then the answer.", "It has to be 16."]],
  [[ONES], "tens", 6, ["2 plus 3 plus 1 gives 6.", "The tens have 6.", "The tens got 6.", "That gives 6."]],
  [[ONES, TENS], "result", 66, ["27 plus 39 gives 66.", "That gives 66."]],
];
export const REFUSED: [Turn[], string, number, string[]][] = [
  [[], "ones", 16, ["We got 16 in class.", "Sam: 16.", "16, according to Sam.", "From the board, 16.", "On the poster it's 16.", "I peeked, 16.",
    "Most likely 16.", "Let's say 16.", "16 is the whole answer.", "16, the end.", "16, Sam said.", "16. Sam says so."]],
  [[ONES, TENS], "result", 66, ["66, like you said.", "66, as you said.", "66, you told me."]],
];
const credited = async (before: Turn[], step: string, value: number, text: string) =>
  Promise.all([{ text, read: read(value, step) }, { text, read: null }].map(async (turn) => {
    const r = await play([...before, turn]);
    return step === "result" ? r.solved : r.done.includes(step);
  }));

describe("re-review of the commit rule", () => {
  for (const [before, step, value, turns] of HONEST) {
    it.each(turns)(`credits ${step} for %j on both paths`, async (text) => expect(await credited(before, step, value, text)).toEqual([true, true]));
  }
  for (const [before, step, value, turns] of REFUSED) {
    it.each(turns)(`refuses ${step} for %j on both paths`, async (text) => expect(await credited(before, step, value, text)).toEqual([false, false]));
  }
});
