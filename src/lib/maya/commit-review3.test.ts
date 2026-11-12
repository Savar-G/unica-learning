// Opus review of the commit rule (70162a8d..1b5c3b50, 2026-11-12): turns the block-list credited that must be refused,
// on the model's reading and on code's fallback. Another person or a source of the number (P1-1), a hedge (P1-2), a
// request beside the value (P1-3), a step value said as the whole answer (P1-4), the final answer said back from Maya's
// words (P2-1), and an echo that holds two values (P3). The same turns are the "review" set of commit-corpus/negative.json.
import { describe, expect, it } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { FIXTURES, type FixtureId } from "@/lib/maya-gate/fixtures";
import { CHILD_MS, GATE_T0, scenarioModel, type Plan, type Read } from "@/lib/maya-gate/gate";

const THROWS: Plan[] = [{ throws: true }];
type Turn = { text: string; read?: Read | null };
async function play(turns: Turn[], fixture: FixtureId) {
  let now = GATE_T0;
  const model = scenarioModel("review3");
  const call = createTextSession({ callId: "review3", package: FIXTURES[fixture], model, clock: () => now, random: 1, grade: 4, freeTalk: false });
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
const A_ONES: Turn = { text: "16.", read: read(16, "ones") };
const A_TENS: Turn = { text: "6.", read: read(6, "tens") };
const B_ONES: Turn = { text: "4.", read: read(4, "ones") };

// [fixture, steps done first, the step, its value, the turns]
const CASES: [FixtureId, Turn[], string, number, string[]][] = [
  ["A", [], "ones", 16, [
    "Sam said 16.", "Alex got 16.", "Mia told me 16.", "Siri said 16.", "My iPad got 16.", "My partner got 16.", "My workbook has 16.", "The answer sheet has 16.",
    "The answer key: 16.", "I copied 16 from the board.", "I looked at the back and it's 16.", "The app showed 16.", "Maya said 16.", "It said 16 on the screen.",
    "I feel like it's 16.", "16, I reckon.", "It's about 16.", "Around 16.", "Roughly 16.", "Something like 16.", "Uh, 16-ish.", "Pretty sure it's 16.",
    "Just say if it's 16.", "16. Let me know.", "Tell me if it's 16.", "Say if it's right. 16.",
    "16, that's the answer.", "16. Done!", "16, I'm finished.",
    "You said 16 and 66.", "You said 6 and 16. So 16.",
  ]],
  ["A", [A_ONES], "tens", 6, ["Sam said 6.", "About 6.", "6, that's the answer.", "Just say if it's 6."]],
  ["B", [], "ones", 4, ["Sam got 4.", "Just say if it's 4.", "I feel like it's 4.", "Around 4."]],
  ["B", [B_ONES], "tens", 2, ["Sam got 2.", "Roughly 2."]],
  ["A", [A_ONES, A_TENS], "result", 66, ["Sam said 66.", "About 66.", "I feel like it's 66."]],
  ["A", [A_ONES], "result", 66, ["You said 66.", "You told me 66.", "Maya said 66."]],
  ["A", [], "result", 66, ["You told me it's 66.", "Okay! You said 66 is right, so I wrote it. I'm done!"]],
];

describe("review of the commit rule: each of these turns is refused on both paths", () => {
  for (const [fixture, before, step, value, turns] of CASES) {
    it.each(turns)(`${fixture} ${step}: %j`, async (text) => {
      for (const turn of [{ text, read: read(value, step) }, { text, read: null }]) {
        const r = await play([...before, turn], fixture);
        expect(step === "result" ? r.solved : r.done.includes(step), `${text} (${turn.read ? "model" : "fallback"})`).toBe(false);
      }
    });
  }

  it("still credits a take-back to the right value: '15. No wait, 16.'", async () => {
    for (const turn of [{ text: "15. No wait, 16.", read: read(16, "ones") }, { text: "15. No wait, 16.", read: null }]) {
      expect((await play([turn], "A")).done).toContain("ones");
    }
  });
});
