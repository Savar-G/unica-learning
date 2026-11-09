// The step-credit loop the #698 practice suite found (bef51538): a child who did the ones step right got no credit, so
// Maya asked the ones again until close.stuck or the turn cap. Each script replays the run's child words on the scripted
// model (27 + 39): a model that reads the step right, and a model that gives no proposal (code's fallback).
import { describe, expect, it } from "vitest";
import { readAnswer, readOptionsFor } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { judge, memoryTraceStore, runBehaviour, type Behaviour, type Plan, type Read, type Step } from "@/lib/maya-gate/gate";
import type { OperationPackage } from "@/lib/question-package";

const THROWS: Plan[] = [{ throws: true }];
const down = (text: string): Step => ({ child: text, maya: THROWS });
const NEXT = { act: "guide", step: "tens", lines: ["check.right_step", "step.invite"] };

interface Told { act: string | undefined; step: string | undefined; level: number | undefined; lines: string[]; say: string; refusals: string[] }
async function play(steps: Step[]) {
  const b: Behaviour = { id: "loop-698", title: "loop 698", fixture: "A", status: "passing", steps, expect: { outcome: {} } };
  const store = memoryTraceStore();
  await runBehaviour(b, store);
  const saved = store.load(b.id)!;
  const trace = JSON.parse(saved) as { turns: { kind: string; output?: { act: string; say: string[] }; attempts?: { refusal: { code: string; reason: string } | null; proposal?: { act?: string; step?: string; level?: number; parts?: { line?: string }[] } }[] }[]; outcome: { reason: string; assistance: string[] } | null };
  const told: Told[] = trace.turns.filter((t) => t.kind === "maya" && t.output).map((t) => {
    const p = t.attempts!.at(-1)!.proposal ?? {};
    return {
      act: t.output!.act, step: p.step, level: p.level, lines: (p.parts ?? []).flatMap((x) => (x.line ? [x.line] : [])), say: t.output!.say.join(" "),
      refusals: t.attempts!.flatMap((a) => (a.refusal ? [`${a.refusal.code}: ${a.refusal.reason}`] : [])),
    };
  });
  const hard = judge(b, saved).failures.map((f) => `${f.code}: ${f.detail}`).filter((x) => /^(?:hint_skipped|answer_too_early|flow_mismatch)/.test(x));
  return { told, hard, outcome: trace.outcome };
}

/** The child's turn, read by a model as the ones step right, and the model's next step. */
const named = (text: string): Step => ({
  child: text, read: { answers: [[16, "ones", "right"]] },
  maya: [{ act: "guide", step: "tens", level: 0, lines: ["check.right_step", "step.invite"], repair: { throws: true } }],
});

// The turns of the practice run (C02 and others) that state the ones step's own result.
const CREDITS = [
  "I got 16 for the ones. What do I do next?",
  "For the ones, I added 7 and 9. I got 16, so I wrote the 6.",
  "Ones first: 7 + 9 is 16.",
  "7 plus 9 is 16. I wrote the 6.",
  "I already did that one. It's 16, and I wrote the 6.",
];

describe("#698 loop: the ones step is credited when the child states its own result", () => {
  it.each(CREDITS)("credits the ones for %j and goes on to the tens (model reads it)", async (text) => {
    const { told, hard } = await play([named(text)]);
    expect(told[1]).toMatchObject(NEXT);
    expect(told[1].say).toContain("16");
    expect(told[1].refusals).toEqual([]);
    expect(hard).toEqual([]);
  });

  it.each(CREDITS)("credits the ones for %j with no model proposal (code's fallback)", async (text) => {
    const { told } = await play([down(text)]);
    expect(told[1]).toMatchObject(NEXT);
  });

  it.each([
    "I got 16 for the ones. What's next?",
    "I got 16 for the ones. Then what?",
    "I got 16 for the ones. What do I do with the 1?",
    "I got 16 for the ones. Where does the 1 go?",
    "I got 16 for the ones. Is the 1 the carry?",
    "I added 7 and 9. I got 16, so I wrote the 6.",
    "I got 16, so I wrote the 6.",
    "7 plus 9 is 16, so I wrote the 6.",
    "Seven plus nine is sixteen. I wrote the six.",
    "I already did that. It's 16, and I wrote the 6.",
    "I already got 16 for the ones. What do I do next?",
    "Okay, 7 and 9 makes 16. I wrote the 6. Where does the 1 go?",
    "Sixteen. I wrote the 6.",
    "For the ones, I got 16.",
    "Sixteen. Then I wrote the 6.",
  ])("credits a close variant: %j", async (text) => {
    for (const first of [named(text), down(text)]) {
      const { told } = await play([first]);
      // A question about the carry gets the line about it after the credit (C26).
      expect([text, told[1].act, told[1].step, told[1].lines[0]]).toEqual([text, NEXT.act, NEXT.step, "check.right_step"]);
    }
  });

  it.each([
    ["another speaker", "My mom got 16 for the ones."],
    ["Maya's number", "You said 16."],
    ["a false sum", "7 plus 8 is 16. I wrote the 6."],
    ["a wrong sum", "7 plus 9 is 15. I wrote the 5."],
    ["a wrong written digit", "7 plus 9 is 16, I wrote 5."],
    ["a wrong written digit after the total", "I got 16 for the ones. I wrote the 5."],
    ["a written digit in another column", "7 plus 9 is 16. I wrote the 6 in the tens."],
    ["a wrong carry", "7 plus 9 is 16. I wrote the 6 and carried the 2."],
    ["a hedge", "I think I got 16 for the ones."],
    ["a maybe", "Maybe 7 plus 9 is 16. I wrote the 6."],
    ["a bare question", "Is it 16?"],
    ["a check question after the sum", "Ones first: 7 + 9 is 16. Is that right?"],
    ["a question in the middle", "I got 16 for the ones. What do I do next? I wrote the 6."],
    ["another column named", "I got 16 for the tens."],
    ["16 in the ones place", "16 in the ones."],
    ["what was added, with no total", "For the ones, I added 7 and 9."],
    ["another sentence", "7 plus 9 is 16. My mom told me."],
    ["a negation", "I didn't get 16 for the ones."],
  ])("never credits %s: %j", async (_name, text) => {
    for (const first of [named(text), down(text)]) {
      const { told } = await play([first]);
      expect(told.slice(1).flatMap((x) => x.lines), text).not.toContain("check.right_step");
      expect(told[1].step, text).not.toBe("tens");
    }
  });

  it("gives no credit for a copy of the step Maya showed at H3, and goes past it", async () => {
    // Three help requests take the ones to H3 (step.show); the copy after it passes the step with no credit (copiedStep).
    const help = (level: number): Step => ({ child: "Help me.", maya: [{ act: "guide", step: "ones", level: level as 0, repair: { throws: true } }] });
    const { told } = await play([help(1), help(2), help(3), named("7 plus 9 is 16. I wrote the 6.")]);
    expect(told[3].lines).toContain("step.show");
    expect(told[4].lines).not.toContain("check.right_step");
    expect(told[4].step).not.toBe("ones");
  });
});

describe("#698 loop: a sure final answer with an explanation of where it came from", () => {
  const opts = readOptionsFor(FIXTURES.A as OperationPackage);
  it.each([
    "Yes, it's 66. I got it from the steps you showed me.",
    "Yes, I said 66. I got it from the steps you showed me.",
    "I said 66, because you showed me the steps.",
    "It's 66. I got it from the steps you showed me.",
    "Yes, 66. That's what I got.",
  ])("reads %j as sure", (text) => {
    expect(readAnswer(text, opts)).toMatchObject({ final: { type: "number", value: 66 }, sure: true });
  });
  it.each([
    "Yes, I think it's 66. I got it from the steps you showed me.",
    "Maybe 66. I got it from the steps you showed me.",
    "Is it 66? I got it from the steps you showed me.",
    "I said 66, because I think you showed me the steps.",
    "Yes, 66. My mom got it from the steps.",
  ])("keeps the confirm for %j", (text) => {
    expect(readAnswer(text, opts).sure).toBe(false);
  });
  it.each(["Yes, it's 66. I got it from the steps you showed me.", "Yes, I said 66. I got it from the steps you showed me."])("accepts %j after the confirm", async (text) => {
    const { told } = await play([{ child: "Is it 66?", maya: [{ act: "confirm", heard: "66", repair: { throws: true } }] }, { child: text, read: { answers: [[66, "result", "right"]] }, maya: [{ act: "accept_answer", repair: { throws: true } }] }]);
    expect(told.map((t) => t.act)).toEqual(["open", "confirm", "accept_answer"]);
    expect(told[2].refusals).toEqual([]);
    const fallback = await play([{ child: "Is it 66?", maya: [{ act: "confirm", heard: "66", repair: { throws: true } }] }, down(text)]);
    expect(fallback.told.map((t) => t.act)).toEqual(["open", "confirm", "accept_answer"]);
  });
});
