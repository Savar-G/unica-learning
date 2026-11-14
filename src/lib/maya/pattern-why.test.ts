// F2 (practice pass 2026-11-12, judge J06 "conversational response"): a child who asks why on a pattern question ("Why do
// I divide by eight?", "Why only three steps?") gets code's answer to the why (step.why), on the model's repair and on
// code's fallback alike, never the plan line again ("Share the increase across 8 equal steps."). The answer to why the
// increase is shared says the jumps from the 1st term to the term asked for, not the plan line in other words.
import { describe, expect, it } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { PATTERN_FIXTURES } from "@/lib/maya-gate/pattern-cases";
import { CHILD_MS, GATE_T0, scenarioModel, type Plan, type Read } from "@/lib/maya-gate/gate";

type Turn = { text: string; read?: Read; plans: Plan[] };
async function play(pkg: (typeof PATTERN_FIXTURES)[keyof typeof PATTERN_FIXTURES], turns: Turn[]) {
  let now = GATE_T0;
  const model = scenarioModel("pattern-why");
  const call = createTextSession({ callId: "pattern-why", package: pkg, model, clock: () => now, random: 1, grade: 3, freeTalk: false });
  model.next([], undefined);
  await call.start();
  const said: string[] = [];
  for (const t of turns) {
    now += CHILD_MS;
    model.next(t.plans, t.read);
    said.push((await call.child(t.text)).say.join(" "));
  }
  return said;
}
const repairFails = (step: string): Plan[] => [{ act: "guide", step, level: 0, lines: ["step.invite"], repair: { act: "guide", step, level: 0, lines: ["step.invite"] } }];
const modelDown: Plan[] = [{ throws: true }, { throws: true }];

describe("a why question on a pattern gets code's answer to the why (F2)", () => {
  it.each([["the model's repair", repairFails("result")], ["code's fallback", modelDown]] as const)("PTP1, 'Why do I divide by eight?' (%s)", async (_name, plans) => {
    const said = await play(PATTERN_FIXTURES.PT_LONG, [
      { text: "115 minus 35 is 80.", read: { answers: [[80, "e1", "right"]] }, plans: [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }] },
      { text: "Why do I divide by eight?", plans: [...plans] },
    ]);
    expect(said[1]).toContain("The 1st and 9th terms are 8 equal jumps apart.");
    expect(said[1]).toContain("Find one jump: 80 ÷ 8.");
    expect(said[1]).not.toMatch(/Share the increase across 8 equal steps/);
  });

  it.each([["the model's repair", repairFails("e1")], ["code's fallback", modelDown]] as const)("PTP2, 'Why only three steps?' (%s)", async (_name, plans) => {
    const said = await play(PATTERN_FIXTURES.PT_TERM, [{ text: "Why only three steps? I thought the fourth term needs four.", plans: [...plans] }]);
    expect(said[0]).toMatch(/The 4th term is 3 steps after it/);
  });
});
