// The step-credit loop the #698 practice suite found (bef51538): a child who did the ones step right got no credit, so
// Maya asked the ones again until close.stuck or the turn cap. Each script replays the run's child words on the scripted
// model (27 + 39): a model that reads the step right, and a model that gives no proposal (code's fallback).
import { describe, expect, it } from "vitest";
import { readAnswer, readOptionsFor } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { judge, memoryTraceStore, runBehaviour, type Behaviour, type Plan, type Step } from "@/lib/maya-gate/gate";
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

describe("#698 loop guard: never the same step line a third time", () => {
  const held = "I know 7 and 9 make 16.";
  /** The model reads the ones right; its tens step is refused (not committed), and code chooses the repair or the fallback. */
  const refusedOnes = (text: string, repair: Plan | undefined): Step => ({
    child: text, read: { answers: [[16, "ones", "right"]] },
    maya: [{ act: "guide", step: "tens", level: 0, lines: ["check.right_step", "step.invite"], ...(repair ? { repair } : {}) }],
  });
  const key = (t: Told) => JSON.stringify([t.act, t.step, t.lines]);
  const noThreeInARow = (told: Told[]) => {
    for (let i = 2; i < told.length; i++) expect(key(told[i]) === key(told[i - 1]) && key(told[i]) === key(told[i - 2]), `${i}: ${key(told[i])}`).toBe(false);
  };
  const paths: [string, Plan | undefined][] = [["the model's repair", undefined], ["code's fallback", { throws: true }]];

  it.each(paths)("two turns held back lead to the step confirm, and a third climbs the ladder (%s)", async (_name, repair) => {
    const { told } = await play([refusedOnes(held, repair), refusedOnes(held, repair), refusedOnes(held, repair)]);
    expect(told[1]).toMatchObject({ act: "guide", step: "ones" });
    expect(told[2]).toMatchObject({ act: "confirm", lines: ["confirm.heard"] });
    expect(told[2].say).toContain("16");
    expect(told[3].act === "close" || (told[3].act === "guide" && told[3].step === "ones" && told[3].level! > told[1].level!), JSON.stringify(told[3])).toBe(true);
    expect(told.flatMap((t) => t.lines)).not.toContain("check.right_step");
    noThreeInARow(told);
  });

  it.each(paths)("goes on up to the honest close, never the same step line three times in a row (%s)", async (_name, repair) => {
    const { told, outcome } = await play(Array.from({ length: 8 }, () => refusedOnes(held, repair)));
    noThreeInARow(told);
    const levels = told.filter((t) => t.act === "guide").map((t) => t.level!);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(new Set(levels).size).toBe(levels.length);
    expect(told.at(-1)).toMatchObject({ act: "close", lines: ["close.stuck", "close.together"] });
    expect(outcome?.reason).not.toBe("technical_issue");
    expect(told.map((t) => t.say).join(" ")).not.toMatch(/66/);
  });

  it.each(paths)("credits the ones after a plain yes to the confirm (%s)", async (_name, repair) => {
    const { told } = await play([refusedOnes(held, repair), refusedOnes(held, repair), { child: "Yes.", maya: [{ act: "guide", step: "tens", level: 0, lines: ["check.right_step", "step.invite"], ...(repair ? { repair } : {}) }] }]);
    expect(told[2]).toMatchObject({ act: "confirm" });
    expect(told[3]).toMatchObject(NEXT);
  });

  it("asks no confirm for a total in a named place, which may mean 16 written in the ones, and climbs instead", async () => {
    for (const repair of [undefined, { throws: true } as Plan]) {
      const { told } = await play([refusedOnes("16 in the ones.", repair), refusedOnes("16 in the ones.", repair), refusedOnes("16 in the ones.", repair), { child: "Yes.", maya: repair ? [{ ...repair }] : [] }]);
      expect(told.map((t) => t.act)).not.toContain("confirm");
      expect(told.flatMap((t) => t.lines)).not.toContain("check.right_step");
      noThreeInARow(told);
    }
  });
});

describe("#698 loop: step credit never releases the answer (D-199)", () => {
  it("counts no miss, unlocks no H3 and gives no answer after the steps are credited", async () => {
    const { told, outcome } = await play([
      // The model asks to show the tens at once after the ones credit: H3 is not unlocked by a credit.
      { child: "I got 16 for the ones.", read: { answers: [[16, "ones", "right"]] }, maya: [{ act: "guide", step: "tens", level: 3, lines: ["check.right_step", "step.show"], repair: { act: "guide", step: "tens", level: 0, lines: ["check.right_step", "step.invite"] } }] },
      // The model tries to give the answer after the tens credit: never offered.
      { child: "2 plus 3 plus 1 is 6. I wrote the 6.", read: { answers: [[6, "tens", "right"]] }, maya: [{ act: "give_answer", repair: { act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] } }] },
      { child: "66.", read: { answers: [[66, "result", "right"]] } },
    ]);
    expect(told[1]).toMatchObject({ ...NEXT, level: 0 });
    expect(told[1].refusals.join(" ")).toMatch(/^hint_too_high/);
    expect(told[2]).toMatchObject({ act: "guide", step: "result", lines: ["check.right_step", "step.invite"] });
    expect(told[2].refusals.join(" ")).toMatch(/^act_not_allowed: The answer is not offered/);
    expect(told.slice(0, 3).map((t) => t.say).join(" ")).not.toMatch(/66/);
    expect(told[3]).toMatchObject({ act: "accept_answer" });
    expect(outcome).toMatchObject({ assistance: "independent" });
  });

  it("does not count a credited step as a committed miss: only the wrong final answer after them counts", async () => {
    const steps: Step[] = [
      named("I got 16 for the ones."),
      { child: "2 plus 3 plus 1 is 6. I wrote the 6.", read: { answers: [[6, "tens", "right"]] }, maya: [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }] },
      { child: "56.", read: { answers: [[56, "result", "wrong"]] } },
    ];
    const store = memoryTraceStore();
    const b: Behaviour = { id: "loop-698-misses", title: "misses", fixture: "A", status: "passing", steps, expect: { outcome: {} } };
    await runBehaviour(b, store);
    const trace = JSON.parse(store.load(b.id)!) as { turns: { kind: string; finalMisses?: number }[] };
    // The opening, the two step credits, then the one wrong final answer.
    expect(trace.turns.filter((t) => t.kind === "maya").map((t) => t.finalMisses ?? 0)).toEqual([0, 0, 0, 1]);
  });
});

// #735 (Chief of Staff, 2026-11-09): a written digit with its carry after the step's own sum stays no-credit in #698. It
// fails closed and the loop guard climbs past it (the PR #624 review tests require no credit). #735 decides whether it
// credits.
describe("#735: a step's sum with its written digit and carry", () => {
  it.skip.each(["7 plus 9 is 16, I wrote 6 and carried 1."])("credits the ones for %j (model reads it, and code's fallback)", async (text) => {
    expect((await play([named(text)])).told[1]).toMatchObject(NEXT);
    expect((await play([down(text)])).told[1]).toMatchObject(NEXT);
  });
});
