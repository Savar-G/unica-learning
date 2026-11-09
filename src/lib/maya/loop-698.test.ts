// The step-credit loop the #698 practice suite found (bef51538): a child who did the ones step right got no credit, so
// Maya asked the ones again until close.stuck or the turn cap. Each script replays the run's child words on the scripted
// model (27 + 39): a model that reads the step right, and a model that gives no proposal (code's fallback).
import { describe, expect, it } from "vitest";
import { readAnswer, readOptionsFor } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { judge, memoryTraceStore, runBehaviour, scenarioModel, type Behaviour, type Plan, type Read, type Step } from "@/lib/maya-gate/gate";
import { createTextSession, type SavedTextSession } from "@/lib/maya-text";
import { checkQuestionPackage, operationText, workedSteps, type Operation, type OperationPackage } from "@/lib/question-package";

const THROWS: Plan[] = [{ throws: true }];
const down = (text: string): Step => ({ child: text, maya: THROWS });
const NEXT = { act: "guide", step: "tens", lines: ["check.right_step", "step.invite"] };

interface Told { act: string | undefined; step: string | undefined; level: number | undefined; lines: string[]; say: string; refusals: string[] }
async function play(steps: Step[], fixture: Behaviour["fixture"] = "A") {
  const b: Behaviour = { id: "loop-698", title: "loop 698", fixture, status: "passing", steps, expect: { outcome: {} } };
  const store = memoryTraceStore();
  await runBehaviour(b, store);
  const saved = store.load(b.id)!;
  const trace = JSON.parse(saved) as { turns: { kind: string; detail?: string; output?: { act: string; say: string[] }; attempts?: { refusal: { code: string; reason: string } | null; proposal?: { act?: string; step?: string; level?: number; parts?: { line?: string }[] } }[] }[]; outcome: { reason: string; assistance: string[] } | null };
  const told: Told[] = trace.turns.filter((t) => t.kind === "maya" && t.output).map((t) => {
    const p = t.attempts!.at(-1)!.proposal ?? {};
    return {
      act: t.output!.act, step: p.step, level: p.level, lines: (p.parts ?? []).flatMap((x) => (x.line ? [x.line] : [])), say: t.output!.say.join(" "),
      refusals: t.attempts!.flatMap((a) => (a.refusal ? [`${a.refusal.code}: ${a.refusal.reason}`] : [])),
    };
  });
  const hard = judge(b, saved).failures.map((f) => `${f.code}: ${f.detail}`).filter((x) => /^(?:hint_skipped|answer_too_early|flow_mismatch)/.test(x));
  return { told, hard, outcome: trace.outcome, technical: trace.turns.filter(t => t.kind === "technical" && t.detail !== "the behaviour script ended before the call ended"), misses: trace.turns.filter(t => t.kind === "maya").map(t => (t as unknown as { finalMisses?: number }).finalMisses ?? 0) };
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

  // Round 5 changed this test: the turn after the easier example is a real turn (P1-3), so the help climbs once more from
  // below the show (H2, then the second and last show) before the honest close. Before round 5 the call closed on the first
  // turn after the example. Each part of the ladder, before and after the example, still climbs with no level twice.
  it.each(paths)("goes on up to the honest close, never the same step line three times in a row (%s)", async (_name, repair) => {
    const { told, outcome } = await play(Array.from({ length: 12 }, () => refusedOnes(held, repair)));
    noThreeInARow(told);
    const example = told.findIndex((t) => t.act === "example_step");
    expect(example).toBeGreaterThan(0);
    for (const part of [told.slice(0, example), told.slice(example)]) {
      const levels = part.filter((t) => t.act === "guide").map((t) => t.level!);
      expect(levels).toEqual([...levels].sort((a, b) => a - b));
      expect(new Set(levels).size).toBe(levels.length);
    }
    const shows = told.filter((t) => t.lines.includes("step.show")).length;
    expect(shows).toBeLessThanOrEqual(2);
    expect(told.length).toBeLessThanOrEqual(21);
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

// Sol review of 4b268e7d (#698 round 2, P1 c): the source explanation is left out only after a declared answer. A question
// in any punctuation, a hedge or "right" keeps the turn as said, so it keeps its confirm and is never solved at once.
describe("#698 round 2: an explanation after a question or a hedge keeps the confirm", () => {
  const opts = readOptionsFor(FIXTURES.A as OperationPackage);
  const UNSURE = [
    "Is it 66. I followed the steps.",
    "Is it 66 because you showed me the steps.",
    "Is it 66 I followed the steps",
    "Maybe 66. I followed the steps.",
    "66 right. I followed the steps.",
    "I think it's 66. That's what I got.",
  ];
  it.each(UNSURE)("reads %j as not sure", (text) => {
    expect(readAnswer(text, opts).sure).toBe(false);
  });
  const paths: [string, Plan[]][] = [
    ["the model's repair", [{ act: "accept_answer" }]],
    ["code's fallback after a refused accept", [{ act: "accept_answer", repair: { throws: true } }]],
    ["code's fallback with the model down", THROWS],
  ];
  it.each(UNSURE.flatMap((text) => paths.map(([name, maya]) => [text, name, maya] as const)))("asks the confirm for %j and does not accept it (%s)", async (text, _name, maya) => {
    const { told, outcome } = await play([{ child: text, read: { answers: [[66, "result", "right"]] }, maya }]);
    expect(told[1], JSON.stringify(told[1])).toMatchObject({ act: "confirm", lines: ["confirm.heard"] });
    expect(told.map((t) => t.act)).not.toContain("accept_answer");
    expect(outcome?.reason).not.toBe("solved");
  });
  it.each(["Yes, it's 66. I got it from the steps you showed me.", "Yes, I said 66. I got it from the steps you showed me."])("still reads %j as sure", (text) => {
    expect(readAnswer(text, opts)).toMatchObject({ final: { type: "number", value: 66 }, sure: true });
  });
});

// Sol review of 4b268e7d (#698 round 2, P1 e): turns that fail before checkAnswers holds them still looped on the same
// step prompt. The guard counts Maya's repeated step prompts apart from credit: never a third in a row, and at H3 never a
// second show in a row; at the top the easier example, then close.stuck. No credit, no miss, no answer.
describe("#698 round 2 loop guard: repeated step prompts outside the held total", () => {
  const TURNS = ["7 plus 9 is 16, I wrote 5.", "I got 16 and 15.", "What is 7 plus 9?"];
  const turn = (text: string, repair: Plan): Step => ({
    child: text, read: { answers: [[16, "ones", "right"]] },
    maya: [{ act: "guide", step: "tens", level: 0, lines: ["check.right_step", "step.invite"], repair }],
  });
  const paths: [string, (text: string) => Step][] = [
    // A repair that drops the bad answer reading and asks the ones again at H0, every time.
    ["the model's repair", (text) => turn(text, { act: "guide", step: "ones", level: 0, lines: ["step.invite"], read: {} })],
    ["code's fallback after a refused step", (text) => turn(text, { throws: true })],
    ["code's fallback with the model down", (text) => down(text)],
  ];
  const prompt = (t: Told) => (t.act === "guide" ? JSON.stringify([t.step, t.lines.filter((l) => l.startsWith("step."))]) : null);
  it.each(TURNS.flatMap((text) => paths.map(([name, step]) => [text, name, step] as const)))("%j repeated (%s) climbs to close.stuck", async (text, _name, step) => {
    const { told, outcome } = await play(Array.from({ length: 10 }, () => step(text)));
    const guides = told.filter((t) => t.act === "guide");
    for (let i = 2; i < told.length; i++) {
      const k = prompt(told[i]);
      expect(k !== null && k === prompt(told[i - 1]) && k === prompt(told[i - 2]), `${i}: ${k}`).toBe(false);
    }
    // At H3 never a second show of the step in a row, and never a third show at all.
    for (let i = 1; i < told.length; i++) expect(told[i].lines.includes("step.show") && told[i - 1].lines.includes("step.show"), `${i}`).toBe(false);
    expect(guides.filter((t) => t.lines.includes("step.show")).length).toBeLessThanOrEqual(2);
    // It climbs: help above H0 is given, and the call ends with the honest close.
    expect(Math.max(...guides.map((t) => t.level ?? 0))).toBeGreaterThan(0);
    expect(told.at(-1)).toMatchObject({ act: "close" });
    expect(told.at(-1)!.lines).toContain("close.stuck");
    expect(outcome?.reason).not.toBe("technical_issue");
    expect(outcome?.reason).not.toBe("solved");
    // No credit and no final answer.
    expect(told.flatMap((t) => t.lines)).not.toContain("check.right_step");
    expect(told.map((t) => t.act)).not.toContain("give_answer");
    expect(told.map((t) => t.say).join(" ")).not.toMatch(/66/);
  });
});

// Sol review of 67fcd928 (#698 round 3, P1 e): the round 2 guard refused only the exact same prompt (step, level and step
// lines), so a model that changed the lines (H3 "step.show" with and without "step.invite") or went down a level and back
// up (H1 "step.point", H0 "step.invite", H1 ...) asked the same unfinished step until the call time limit. The guard now
// counts guides by step: after the show once, or after two guides with no help above the row's highest, a guide with no
// progress must give more help, and at the top the stuck way out comes (the easier example, then close.stuck). A right
// step, a right answer or a copy of the shown step goes on; a confirm, a wait or a redirect does not reset the count.
describe("#698 round 3 loop guard: guides are counted per unfinished step, not per line set", () => {
  const SHOW: Step = { child: "Show me the ones.", read: { help: "show" }, maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"] }] };
  // The three ways Maya's words come: the model's own proposal (code's fallback when it is refused), the model's repair of
  // a refused proposal (code's fallback when the repair is refused too), and code's fallback with the model down.
  const paths: [string, (text: string, guide: Plan) => Step][] = [
    ["the model", (text, guide) => ({ child: text, maya: [{ ...guide, repair: { throws: true } }] })],
    ["the model's repair", (text, guide) => ({ child: text, maya: [{ act: "give_answer", repair: { ...guide, repair: { throws: true } } }] })],
    ["code's fallback with the model down", (text) => down(text)],
  ];
  /** The guard's rule, read from the trace: in a row of guides on one step, after the show once or after two guides with no help above the row's highest, the next guide is higher. */
  function climbs(told: Told[]) {
    let row: { step: string; top: number; times: number } | null = null;
    for (const [i, t] of told.entries()) {
      if (t.act !== "guide" || !t.lines.some((l) => l.startsWith("step."))) {
        if (["example_step", "try_target", "close", "accept_answer", "give_answer"].includes(t.act ?? "")) row = null;
        continue;
      }
      const level = t.level ?? 0;
      if (row && row.step === t.step && row.times >= (row.top >= 3 ? 1 : 2)) expect(level, `${i}: ${JSON.stringify(t)}`).toBeGreaterThan(row.top);
      row = row && row.step === t.step ? { step: row.step, top: Math.max(row.top, level), times: level > row.top ? 1 : row.times + 1 } : { step: t.step!, top: level, times: 1 };
    }
  }
  const safe = (r: Awaited<ReturnType<typeof play>>) => {
    expect(r.hard).toEqual([]);
    expect(r.technical).toEqual([]);
    expect(r.outcome?.reason).not.toBe("technical_issue");
    expect(r.told.map((t) => t.act)).not.toContain("give_answer");
    expect(r.told.map((t) => t.act)).not.toContain("accept_answer");
    expect(r.told.flatMap((t) => t.lines)).not.toContain("check.right_step");
    expect(r.misses.every((n) => n === 0)).toBe(true);
    expect(r.told.slice(1).map((t) => t.say).join(" ")).not.toMatch(/\b66\b/);
  };

  // Round 4 changed this test: after the easier example the child's new try is a real turn, so the step may be shown once
  // more after the example (never in a row with the first show, never a third time), then close.stuck.
  it.each(paths)("after the show, a second show comes only after the easier example and a lower help, never a third, whatever lines go with it (%s)", async (_name, make) => {
    const r = await play([SHOW, ...Array.from({ length: 10 }, (_, i) => make("What is 7 plus 9?", { act: "guide", step: "ones", level: 3, lines: i % 2 === 0 ? ["step.show", "step.invite"] : ["step.show"] }))]);
    expect(r.told[1]).toMatchObject({ act: "guide", lines: ["step.show"] });
    expect(r.told[2].act).toBe("example_step");
    const guides = r.told.filter((t) => t.act === "guide");
    expect(guides.filter((t) => t.lines.includes("step.show")).length).toBeLessThanOrEqual(2);
    for (let i = 1; i < guides.length; i++) expect(guides[i].lines.includes("step.show") && guides[i - 1].lines.includes("step.show"), `${i}`).toBe(false);
    expect(r.told.at(-1)).toMatchObject({ act: "close", lines: ["close.stuck", "close.together"] });
    climbs(r.told);
    safe(r);
  });

  it.each(paths)("H1, H0, H1 on the same step with no progress is one row: the help climbs, then the way out (%s)", async (_name, make) => {
    const r = await play(Array.from({ length: 12 }, (_, i) => make(i === 0 ? "Help me." : "Um.", { act: "guide", step: "ones", level: i % 2 === 0 ? 1 : 0, lines: i % 2 === 0 ? ["step.point"] : ["step.invite"] })));
    climbs(r.told);
    expect(r.told.filter((t) => t.act === "guide").length).toBeLessThanOrEqual(8);
    expect(r.told.at(-1)).toMatchObject({ act: "close" });
    expect(r.told.at(-1)!.lines).toContain("close.stuck");
    safe(r);
  });

  // A guide with no step line gives no help: it counts in the row below every level, and is never the next help up.
  it.each<[string, Plan]>([
    ["a check only (check.thinking)", { lines: ["check.thinking"] }],
    ["a warm phrase only", { lines: [], warm: "encourage" }],
  ])("a guide with %s on every turn cannot repeat until the call time limit", async (_name, plan) => {
    const guide: Plan = { act: "guide", step: "ones", level: 0, ...plan };
    const r = await play(Array.from({ length: 14 }, () => ({ child: "Um.", maya: [{ ...guide, repair: { ...guide, repair: { throws: true } } }] })));
    expect(r.told.filter((t) => t.act === "guide").length).toBeLessThanOrEqual(8);
    expect(r.told.at(-1)).toMatchObject({ act: "close" });
    expect(r.told.at(-1)!.lines).toContain("close.stuck");
    climbs(r.told);
    safe(r);
  });

  it("a confirm between does not reset the show count", async () => {
    const r = await play([SHOW,
      { child: "Is it 66?", maya: [{ act: "confirm", heard: "66" }] },
      { child: "Maybe.", maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show", "step.invite"], repair: { throws: true } }] },
    ]);
    expect(r.told[2].act).toBe("confirm");
    expect(r.told[3].lines).not.toContain("step.show");
    expect(r.technical).toEqual([]);
  });

  it.each(["I'm still writing.", "Maya, are you a robot?"])("a wait or a redirect between (%j) does not reset the show count", async (text) => {
    const r = await play([SHOW, down(text), { child: "Um.", maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show", "step.invite"], repair: { throws: true } }] }]);
    expect(r.told[2].act).not.toBe("guide");
    expect(r.told.at(-1)?.lines).not.toContain("step.show");
    expect(r.technical).toEqual([]);
  });

  it.each(paths)("a right ones step at the limit goes on to the tens with its credit (%s)", async (_name, make) => {
    const low = (text: string, level: 0 | 1, line: "step.invite" | "step.point"): Step => ({ child: text, maya: [{ act: "guide", step: "ones", level, lines: [line] }] });
    const work = "7 plus 9 is 16. I wrote the 6.";
    const last = _name === "code's fallback with the model down" ? make(work, {}) : { ...make(work, { act: "guide", step: "tens", level: 0, lines: ["check.right_step", "step.invite"] }), read: { answers: [[16, "ones", "right"]] } } as Step;
    const r = await play([low("Help me.", 1, "step.point"), low("Um.", 0, "step.invite"), last]);
    expect(r.told[3]).toMatchObject({ act: "guide", step: "tens" });
    expect(r.told[3].lines).toContain("check.right_step");
    expect(r.technical).toEqual([]);
  });

  it.each(paths)("a right final answer after the show is accepted (%s)", async (_name, make) => {
    const last = _name === "code's fallback with the model down" ? make("66.", {}) : { ...make("66.", { act: "accept_answer", lines: ["answer.right"] }), read: { answers: [[66, "result", "right"]] } } as Step;
    const r = await play([SHOW, last]);
    expect(r.told[2].act).toBe("accept_answer");
    expect(r.technical).toEqual([]);
  });

  it.each(["16.", "7 plus 9 is 16."])("a copy of the shown step (%j) is no repeat: the tens come next, with no credit", async (text) => {
    const r = await play([SHOW, down(text)]);
    expect(r.told[2]).toMatchObject({ act: "guide", step: "tens" });
    expect(r.told[2].lines).not.toContain("check.right_step");
    expect(r.technical).toEqual([]);
  });

  it.each(["A", "B", "C", "D", "E", "F"] as const)("only \"Um.\" on every turn ends with the honest close for fixture %s, on every path", async (fixture) => {
    for (const [name, make] of paths) {
      const r = await play(Array.from({ length: 20 }, () => make("Um.", { act: "guide", level: 0, lines: ["step.invite"] })), fixture);
      expect(r.outcome?.reason, `${name} ${JSON.stringify(r.told)}`).not.toBe("technical_issue");
      expect(r.told.at(-1)?.act, `${name} ${JSON.stringify(r.told)}`).toBe("close");
      expect(r.told.map((t) => t.act)).not.toContain("give_answer");
      expect(r.told.map((t) => t.act)).not.toContain("accept_answer");
    }
  });

  it.each(["12 minus 8 is 4. I wrote 5.", "I got 4 and 5.", "What is 12 minus 8?"])("a held-back subtraction turn %j repeated ends on every path", async (text) => {
    const steps: Step[] = [
      { child: text, read: { answers: [[4, "ones", "right"]] }, maya: [{ act: "guide", step: "tens", level: 0, repair: { act: "guide", step: "ones", level: 0, lines: ["step.invite"], read: {} } }] },
      { child: text, read: { answers: [[4, "ones", "right"]] }, maya: [{ act: "guide", step: "tens", level: 0, repair: { throws: true } }] },
      down(text),
    ];
    for (const st of steps) {
      const r = await play(Array.from({ length: 16 }, () => st), "B");
      expect(r.technical).toEqual([]);
      expect(r.told.at(-1)?.act).toBe("close");
      expect(r.told.flatMap((t) => t.lines)).not.toContain("check.right_step");
      expect(r.misses.every((n) => n === 0)).toBe(true);
      expect(r.told.map((t) => t.act)).not.toContain("accept_answer");
    }
  });

  it.each([
    ["no prompt (before round 2)", (saved: SavedTextSession) => { delete saved.session.prompt; }],
    ["a prompt with no top (round 2)", (saved: SavedTextSession) => { expect(saved.session.prompt).toBeDefined(); delete saved.session.prompt!.top; }],
  ] as const)("a saved session with %s still loads and ends safely", async (_name, strip) => {
    for (const fixture of ["A", "B", "C", "D", "E", "F"] as const) {
      let now = 1000;
      const model = scenarioModel();
      const options = { callId: `legacy-${fixture}`, package: FIXTURES[fixture], model, clock: () => now };
      const old = createTextSession(options);
      await old.start();
      now += 4000; model.next([{ throws: true }], undefined); await old.child("Um.");
      const saved: SavedTextSession = JSON.parse(JSON.stringify(await old.saved()));
      saved.v = 1; delete saved.log; delete saved.checkpoint; delete saved.initial;
      strip(saved);
      const resumed = createTextSession({ ...options, resume: saved });
      for (let i = 0; i < 20 && !resumed.ended; i++) { now += 4000; model.next([{ throws: true }], undefined); await resumed.child("Um."); }
      expect(resumed.ended).toBe(true);
      expect(resumed.session.outcome?.reason).not.toBe("technical_issue");
      expect(resumed.trace().turns.filter((t) => t.kind === "technical")).toEqual([]);
    }
  });

  const small = (operation: Operation, answer: number, easier: Operation, easyAnswer: number): OperationPackage => ({
    ...(FIXTURES.A as OperationPackage), operation, text: `${operationText(operation)} = ?`, steps: workedSteps(operation),
    answer: { value: { type: "number", value: answer }, accepted: [], unit: null },
    wrongAnswers: [{ value: { type: "number", value: answer + 1 }, cause: "O3", description: "Wrong result", step: null }],
    easierExample: { text: `${operationText(easier)} = ?`, operation: easier, steps: workedSteps(easier), answer: { type: "number", value: easyAnswer } },
  });
  it.each([
    ["one column", small({ kind: "add", operands: [2, 1] }, 3, { kind: "add", operands: [1, 1] }, 2)],
    ["division", small({ kind: "divide", operands: [8, 2] }, 4, { kind: "divide", operands: [6, 2] }, 3)],
    ["an easier example that would say the answer", small({ kind: "divide", operands: [8, 2] }, 4, { kind: "divide", operands: [4, 2] }, 2)],
  ] as const)("no final answer and no dead end for %s with the model down", async (_name, pkg) => {
    expect(checkQuestionPackage(pkg)).toMatchObject({ ok: true });
    let now = 1000;
    const model = scenarioModel();
    const session = createTextSession({ callId: "small-r3", package: pkg, model, clock: () => now });
    await session.start();
    for (let i = 0; i < 20 && !session.ended; i++) { now += 4000; model.next([{ throws: true }], undefined); await session.child("Um."); }
    expect(session.ended).toBe(true);
    expect(session.session.outcome?.reason).not.toBe("technical_issue");
    expect(session.session.outcome?.reason).not.toBe("content_issue");
    const trace = session.trace();
    expect(trace.turns.filter((t) => t.kind === "technical")).toEqual([]);
    const says = trace.turns.flatMap((t) => (t.kind === "maya" ? t.output?.say ?? [] : [])).join(" ");
    expect(says).not.toMatch(new RegExp(`\\b${pkg.answer.value.type === "number" ? pkg.answer.value.value : -1}\\b`));
  });
});

// The 3-run practice suite on round 3 (6a0581bd, 14 of 66 passed) and the partial run on bef51538: the loop guard ended
// calls for children who were still working. (1) After "Did you say 66?" a doubtful yes with the right answer was
// confirmed again and again, and code's fallback closed with close.stuck as a technical_issue (F02-r1, F02-r2, F03-r3,
// C04-r1); D-253 item 17 checks it together instead. (2) The first turn back on the child's own question after the easier
// example went straight to close.stuck (C03-r1, C05-r1, C01-r1). (3) and (4) A copy of the shown step, or of the step the
// easier example worked, in a question, with "You said", with "I did that" or with work on the next column, was no copy, so
// Maya asked the ones again until the stuck close. Each script is the run's child words, on the model's own proposal, on
// its repair, and on code's fallback with the model down.
describe("#698 round 4: the loop guard never closes a child who is still working", () => {
  const SHOW: Step = { child: "Show me the ones.", read: { help: "show" }, maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"] }] };
  const NO_START: Step = { child: "Hi. I don't know how to start this one.", read: { start: "no_start" }, maya: [{ act: "example_step", step: "ones", lines: ["example.intro", "example.step"] }, { act: "example_step", step: "tens" }, { act: "example_step", step: "result" }] };
  /** The ones shown at H3, then the easier example (way out) and the new try, on code's fallback. */
  const AFTER_EXAMPLE: Step[] = [SHOW, down("Um."), down("Okay.")];
  const PATHS: [string, (text: string, plan: Plan, read?: Read) => Step][] = [
    ["the model", (text, plan, read) => ({ child: text, ...(read ? { read } : {}), maya: [{ ...plan, repair: { throws: true } }] })],
    ["the model's repair", (text, plan, read) => ({ child: text, ...(read ? { read } : {}), maya: [{ act: "give_answer", repair: { ...plan, repair: { throws: true } } }] })],
    ["code's fallback with the model down", (text) => down(text)],
  ];
  const ACCEPT: Plan = { act: "accept_answer", lines: ["answer.right"] };
  const RIGHT66: Read = { answers: [[66, "result", "right"]] };
  /** From turn `from` on: no close, no technical turn, no hard failure, no answer given. */
  const working = (r: Awaited<ReturnType<typeof play>>, from: number) => {
    expect(r.told.slice(from).map((t) => t.act), JSON.stringify(r.told.slice(from))).not.toContain("close");
    expect(r.technical).toEqual([]);
    expect(r.hard).toEqual([]);
    expect(r.told.map((t) => t.act)).not.toContain("give_answer");
  };

  describe("(1) a doubtful yes with the right answer is checked together, never confirmed a third time", () => {
    it.each(PATHS)("F02-r1: \"Yes, 66! Did I get it right?\" after \"Did you say 66?\" gets the check together on the tens (%s)", async (_name, make) => {
      const r = await play([SHOW,
        make("You said write the 6 and carry 1. So I got 66!", ACCEPT, RIGHT66),
        make("Yes, 66! Did I get it right?", { act: "guide", step: "tens", level: 2, lines: ["check.together", "step.operation"] }, RIGHT66)]);
      expect(r.told[2]).toMatchObject({ act: "confirm", lines: ["confirm.heard"] });
      expect(r.told[3]).toMatchObject({ act: "guide", step: "tens", lines: ["check.together", "step.operation"] });
      expect(r.told[3].say).not.toMatch(/\b66\b/);
      working(r, 2);
    });

    it.each(PATHS)("F02-r1: a yes that is not sure gets the check together once, and never a third confirm (%s)", async (_name, make) => {
      const r = await play([SHOW,
        make("You said write the 6 and carry 1. So I got 66!", ACCEPT, RIGHT66),
        make("Yes, I got 66! You said write the 6 and carry 1, so I did.", ACCEPT, RIGHT66),
        make("Yes, 66! I wrote the 6 and carried the 1 like you said.", ACCEPT, RIGHT66)]);
      const acts = r.told.map((t) => t.act);
      for (let i = 2; i < acts.length; i++) expect(acts[i] === "confirm" && acts[i - 1] === "confirm" && acts[i - 2] === "confirm", `${i}`).toBe(false);
      const checks = r.told.filter((t) => t.lines.includes("check.together"));
      expect(checks).toHaveLength(1);
      expect(checks[0]).toMatchObject({ act: "guide", step: "tens", lines: ["check.together", "step.operation"] });
      expect(r.told.at(-1)).toMatchObject({ act: "guide", step: "tens" });
      working(r, 2);
    });

    it.each(PATHS)("C04-r1: \"Yes, I guessed 66.\" after the easier example and its new try gets check.guess on the tens (%s)", async (_name, make) => {
      const r = await play([...AFTER_EXAMPLE,
        make("I wrote the 6, but I don't know the tens. Is it 66?", { act: "confirm", heard: "66" }, RIGHT66),
        make("Yes, I guessed 66. I didn't work it out.", { act: "guide", step: "tens", level: 2, lines: ["check.guess", "step.operation"] }, RIGHT66)]);
      expect(r.told.at(-2)).toMatchObject({ act: "confirm" });
      expect(r.told.at(-1)).toMatchObject({ act: "guide", step: "tens", lines: ["check.guess", "step.operation"] });
      working(r, 5);
    });

    it.each(PATHS)("F03-r3: \"Yes, my answer is 66. Is that right?\" after the tens were shown gets the check together (%s)", async (_name, make) => {
      const r = await play([
        named("I got 16 for the ones."),
        { child: "Show me the tens.", read: { help: "show" }, maya: [{ act: "guide", step: "tens", level: 3, lines: ["step.show"] }] },
        make("You said write 6, so I wrote the 6 in the tens. My answer is 66, right?", { act: "confirm", heard: "66" }, RIGHT66),
        make("Yes, my answer is 66. Is that right?", { act: "guide", step: "result", level: 0, lines: ["check.together", "step.invite"] }, RIGHT66)]);
      expect(r.told[3]).toMatchObject({ act: "confirm" });
      expect(r.told[4]).toMatchObject({ act: "guide", step: "result" });
      expect(r.told[4].lines[0]).toBe("check.together");
      working(r, 3);
    });

    it("the whole F02-r1 tail on code's fallback never confirms a third time in a row, checks once, and ends with no technical_issue", async () => {
      const r = await play([SHOW, ...[
        "You said write the 6 and carry 1. So I got 66!", "Yes, I got 66! You said write the 6 and carry 1, so I did.",
        "Yes, 66! I wrote the 6 and carried the 1 like you said.", "Okay. So is my answer for 27 plus 39 right? I got 66.",
        "Yes, it's 66! I wrote the 6 and carried the 1 like you said. Is it right?", "Okay. I think it's 66. I wrote the 6 and carried the 1 like you said.",
        "Yes, I think it's 66. I wrote the 6 and carried the 1 like you said.", "Yes, 66! Did I get it right?",
        ...Array.from({ length: 12 }, () => "Yes, 66! Did I get it right?"),
      ].map(down)]);
      // At 6a0581bd this call ended with close.stuck from the confirm, as a technical_issue.
      expect(r.told.at(-1)).toMatchObject({ act: "close", lines: ["close.stuck", "close.together"] });
      expect(r.outcome?.reason).toBe("child_stopped");
      expect(r.technical).toEqual([]);
      const acts = r.told.map((t) => t.act);
      for (let i = 2; i < acts.length; i++) expect(acts[i] === "confirm" && acts[i - 1] === "confirm" && acts[i - 2] === "confirm", `${i}`).toBe(false);
      expect(r.told.filter((t) => t.lines.includes("check.together")).length).toBe(1);
      expect(r.told.filter((t) => t.lines.includes("step.show")).length).toBeLessThanOrEqual(3);
    });

    it("a close.stuck Maya chooses while a confirm is open is never a technical_issue", async () => {
      // The ones shown twice and the easier example done: after "Did you say 66?" the model takes the stuck way out.
      const r = await play([...AFTER_EXAMPLE, down("Um."), down("Um."),
        { child: "Is it 66?", maya: [{ act: "confirm", heard: "66", repair: { throws: true } }] },
        { child: "Yes, 66? I'm not sure.", maya: [{ act: "close", lines: ["close.stuck", "close.together"], repair: { throws: true } }] }]);
      expect(r.told.at(-2)).toMatchObject({ act: "confirm" });
      expect(r.told.at(-1)).toMatchObject({ act: "close", lines: ["close.stuck", "close.together"] });
      expect(r.outcome?.reason).toBe("child_stopped");
      expect(r.technical).toEqual([]);
    });
  });

  describe("(2) the first turn back on the child's own question after the easier example is a real turn", () => {
    it.each(PATHS)("C03-r1: \"I wrote the 6. Then 2 plus 3 is 5, so I got 56.\" gets the tens and its error response, not close.stuck (%s)", async (name, make) => {
      const r = await play([...AFTER_EXAMPLE.slice(0, 2), down("Wait, so the carried 1 goes with the 2 and 3, like your 1 plus 1 plus 1?"),
        make("Okay. I wrote the 6. Then 2 plus 3 is 5, so I got 56.", { act: "guide", step: "tens", level: 1, lines: ["check.not_yet", "step.regroup"] }, { answers: [[5, "tens", "wrong"], [56, "result", "wrong"]] })]);
      expect(r.told[r.told.length - 2].act).toBe("try_target");
      expect(r.told.at(-1)).toMatchObject({ act: "guide", step: "tens" });
      if (name !== "code's fallback with the model down") expect(r.told.at(-1)!.lines).toEqual(["check.not_yet", "step.regroup"]);
      expect(r.told.flatMap((t) => t.lines)).not.toContain("check.right_step");
      working(r, 2);
    });

    it.each(PATHS)("a wrong ones answer after the new try gets the error response and a guide, not close.stuck (%s)", async (name, make) => {
      const r = await play([...AFTER_EXAMPLE, make("7 plus 9 is 15. I wrote the 5.", { act: "guide", step: "ones", level: 2, lines: ["check.not_yet", "step.operation"] }, { answers: [[15, "ones", "wrong"]] })]);
      expect(r.told.at(-1)).toMatchObject({ act: "guide", step: "ones" });
      expect(r.told.at(-1)!.lines).not.toContain("step.show");
      if (name !== "code's fallback with the model down") expect(r.told.at(-1)!.lines).toEqual(["check.not_yet", "step.operation"]);
      working(r, 2);
    });

    it.each(PATHS)("C05-r1 at bef51538: a help request after the new try gets a guide, not close.stuck (%s)", async (_name, make) => {
      const r = await play([...AFTER_EXAMPLE, make("Umm, I don't get the carry part. Where does the 1 go in 27 plus 39?", { act: "guide", step: "ones", level: 2, lines: ["step.operation"] })]);
      expect(r.told.at(-1)).toMatchObject({ act: "guide", step: "ones" });
      expect(r.told.at(-1)!.lines).not.toContain("step.show");
      working(r, 2);
    });

    it.each(PATHS)("no progress after the new try climbs to one more show, never a third, then close.stuck (%s)", async (_name, make) => {
      const r = await play([...AFTER_EXAMPLE, ...Array.from({ length: 10 }, () => make("Um.", { act: "guide", step: "ones", level: 3, lines: ["step.show"] }))]);
      const guides = r.told.filter((t) => t.act === "guide");
      expect(guides.filter((t) => t.lines.includes("step.show")).length).toBe(2);
      for (let i = 1; i < guides.length; i++) expect(guides[i].lines.includes("step.show") && guides[i - 1].lines.includes("step.show"), `${i}`).toBe(false);
      expect(r.told.at(-1)).toMatchObject({ act: "close", lines: ["close.stuck", "close.together"] });
      expect(r.told.filter((t) => t.act === "example_step" && t.lines.includes("example.intro")).length).toBe(1);
      expect(r.outcome?.reason).toBe("child_stopped");
      expect(r.technical).toEqual([]);
      expect(r.hard).toEqual([]);
    });
  });

  describe("(3, 4) a copy of the shown step, or of the step the example worked, goes on to the next step with no credit", () => {
    const TENS: Plan = { act: "guide", step: "tens", level: 0, lines: ["step.invite"] };
    const help = (level: number): Step => ({ child: "Help me.", maya: [{ act: "guide", step: "ones", level: level as 0, repair: { throws: true } }] });
    const AFTER_SHOW = [
      "You said 7 plus 9 is 16. So I write the 6, right?", // C05-r1
      "Okay, I wrote the 6. What do I do with the tens?", // C04-r1, C05-r2
      "You said write 6 and carry 1. Okay, I did that. What do I do with the tens?", // C01-r1 at bef51538
      "I wrote the 6. Now what do I do with the 1?", // C05-r1 at bef51538
      "You said 7 plus 9 is 16. So I wrote the 6. Now what do I do with the 1?", // C05-r1 at bef51538
      "Okay, I wrote 6. You said carry 1 ten. What do I do with the tens now?", // C05-r2
      "Okay, you said write 6 and carry 1. I did that. But I still don't know what to add for the tens.", // C01-r2
      "I did that already! I wrote the 6 and carried the 1. Now the tens?", // F02-r1
      "Okay, I wrote the 6. Do I add the 1 ten to the tens now?", // C05-r2
    ];
    it.each(AFTER_SHOW.flatMap((text) => PATHS.map(([name, make]) => [text, name, make] as const)))("after the show, %j goes on to the tens (%s)", async (text, _name, make) => {
      const r = await play([help(1), help(2), help(3), make(text, TENS)]);
      expect(r.told[3].lines).toContain("step.show");
      expect(r.told[4]).toMatchObject({ act: "guide", step: "tens" });
      expect(r.told.flatMap((t) => t.lines)).not.toContain("check.right_step");
      working(r, 1);
    });

    const AFTER_EXAMPLE_TRY = [
      "Okay. You said to write the 6 and carry the 1, right?", // C05-r1
      "I'd write the 6 and carry the 1 ten, like your example.", // C01-r1 at bef51538
      "Okay, I'll try. 7 + 9 is 16. In your example you wrote 3 and carried 1 ten, so do I write 6 and carry 1?", // C01-r1 at bef51538
    ];
    // Round 5 changed this test (P1-1): it also ran each turn after the easier example with no show of the ones before it
    // (a no-start child), and expected the tens. The example is another problem, so its steps never pass a step of the
    // child's own question: with no show, the turn now stays on the ones (#735 keeps it no-credit). After the ones were
    // shown, the copy in the ones' own numbers still goes on.
    it.each(AFTER_EXAMPLE_TRY.flatMap((text) => PATHS.map(([name, make]) => [text, name, make] as const)))("after the show, the easier example and its new try, %j goes on to the tens (%s)", async (text, _name, make) => {
      const r = await play([...AFTER_EXAMPLE, make(text, TENS)]);
      expect(r.told.at(-2)!.act).toBe("try_target");
      expect(r.told.at(-1), JSON.stringify(r.told.at(-1))).toMatchObject({ act: "guide", step: "tens" });
      expect(r.told.flatMap((t) => t.lines)).not.toContain("check.right_step");
      working(r, 1);
    });

    it.each(AFTER_EXAMPLE_TRY.flatMap((text) => PATHS.map(([name, make]) => [text, name, make] as const)))("after only the easier example and its new try (no show), %j stays on the ones (%s)", async (text, _name, make) => {
      const r = await play([NO_START, down("Okay."), make(text, TENS)]);
      expect(r.told.at(-2)!.act).toBe("try_target");
      expect(r.told.at(-1), JSON.stringify(r.told.at(-1))).toMatchObject({ act: "guide", step: "ones" });
      expect(r.told.flatMap((t) => t.lines)).not.toContain("check.right_step");
      working(r, 1);
    });

    it.each(PATHS)("C01-r1: after the tens were shown, \"You said write 6, so I wrote 6 in the tens. What about the ones?\" goes on (%s)", async (_name, make) => {
      const r = await play([named("I got 16 for the ones."),
        { child: "Show me the tens.", read: { help: "show" }, maya: [{ act: "guide", step: "tens", level: 3, lines: ["step.show"] }] },
        make("You said write 6, so I wrote 6 in the tens. What about the ones?", { act: "guide", step: "result", level: 0, lines: ["step.invite"] })]);
      expect(r.told[3]).toMatchObject({ act: "guide", step: "result" });
      working(r, 1);
    });

    it.each([
      "Yes.", "Okay.", "6.", "I wrote it.", "Is it 16?", "I think it's 16.", "My mom said 16.", "7 plus 9 is 15.", "I wrote the 5.",
      "I wrote the 6 and carried the 2.", "I wrote the 6 in the tens.", "16 in the ones.", "I wrote the 6. It's 15.", "I wrote the 6. 7 plus 9 is 15.",
      "I wrote the 6. What is 7 plus 9?", "I didn't write the 6.", "I think I write the 6.", "My mom wrote the 6.", "I wrote the 6. I don't know the ones.",
      "You said 16, so I wrote 16.", "I wrote the 6. I carried the 2.", "I wrote the 6. Is it 15?",
    ])("after the show, %j does not go past the ones", async (text) => {
      const r = await play([SHOW, down(text)]);
      expect(r.told[2].step === "tens" || r.told[2].step === "result", JSON.stringify(r.told[2])).toBe(false);
      expect(r.told.flatMap((t) => t.lines)).not.toContain("check.right_step");
    });

    it.each(["7 plus 9 is 16, I wrote 6 and carried 1.", "I'd write the 6 and carry the 1 ten.", "You said write 6 and carry 1. Okay, I did that."])("with no show and no example, %j stays no-credit on the ones (#735)", async (text) => {
      for (const first of [named(text), down(text)]) {
        const r = await play([first]);
        expect(r.told[1].step, text).not.toBe("tens");
        expect(r.told.flatMap((t) => t.lines)).not.toContain("check.right_step");
      }
    });
  });
});

// Adversarial review of 94c8fbb7 (#698 round 4). P1-1: a copy passed a step after only the easier example ("I did that.",
// "The ones are done.", "I carried the 1." after 18 + 15 skipped the ones, and the model's tens line then said the ones
// digit). P1-2: the carry and why lines and the setup echo were outside the loop guard with no limit ("Why?" fourteen
// times got step.why eleven times, "So 2 plus 3 plus 1?" got the echo thirteen times, and the call never ended). P1-3:
// after progress on the ones and the tens shown, the first turn after the easier example got close.stuck. Each script
// runs on the model's own proposal, on its repair and on code's fallback with the model down where it applies.
describe("#698 round 5: copies pass only this question's shown step; carry and echo lines count; a real turn after the example", () => {
  const NO_START: Step = { child: "Hi. I don't know how to start this one.", read: { start: "no_start" }, maya: [{ act: "example_step", step: "ones", lines: ["example.intro", "example.step"] }, { act: "example_step", step: "tens" }, { act: "example_step", step: "result" }] };
  const SHOW: Step = { child: "Show me the ones.", read: { help: "show" }, maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"] }] };
  const ONES_RIGHT: Step = { child: "I got 16 for the ones.", read: { answers: [[16, "ones", "right"]] }, maya: [{ act: "guide", step: "tens", level: 0, lines: ["check.right_step", "step.invite"], repair: { throws: true } }] };
  const PATHS: [string, (text: string, plan: Plan) => Step][] = [
    ["the model", (text, plan) => ({ child: text, maya: [{ ...plan, repair: { throws: true } }] })],
    ["the model's repair", (text, plan) => ({ child: text, maya: [{ act: "give_answer", repair: { ...plan, repair: { throws: true } } }] })],
    ["code's fallback with the model down", (text) => down(text)],
  ];
  /** No answer and no part of it: no 66, no "Write 6" (a digit of 66), no answer act, no credit. */
  const noAnswer = (r: Awaited<ReturnType<typeof play>>) => {
    expect(r.told.map((t) => t.act)).not.toContain("give_answer");
    expect(r.told.slice(1).map((t) => t.say).join(" ")).not.toMatch(/\b66\b/);
    expect(r.technical).toEqual([]);
    expect(r.hard).toEqual([]);
  };
  /** The call ended with the honest close within 20 of Maya's turns after her opening, with no technical issue. */
  const ends = (r: Awaited<ReturnType<typeof play>>) => {
    expect(r.told.at(-1), JSON.stringify(r.told.map((t) => [t.act, t.step, t.level, t.lines]))).toMatchObject({ act: "close" });
    expect(r.told.at(-1)!.lines).toContain("close.stuck");
    expect(r.told.length - 1).toBeLessThanOrEqual(20);
    expect(r.outcome?.reason).toBe("child_stopped");
  };

  describe("P1-1: the easier example's steps never pass a step of the child's own question", () => {
    const AFTER_EXAMPLE_ONLY = [
      "I did that.", "I already did the ones.", "The ones are done.", "I carried the 1.", "You carry the 1, right?", "Then I carry the 1.",
      "I did that. Is it 33?", "Okay, I'm ready. I did that.", "Like your example, I carry the 1.", "So you carry the 1 ten to the tens.",
      "I'd carry the 1 like you did.", "I finished that.", "I did it.", "I did this.", "Yes, I did that already.", "I did that. 33.",
      "I did that. Then I got 33.", "I did that. So the answer is 33.", "I did that. My answer is 33.",
    ];
    // The model's plan is the round 4 probe's: the tens at H1 with the regroup line, which says the ones digit of 66.
    const TENS_REGROUP: Plan = { act: "guide", step: "tens", level: 1, lines: ["step.regroup"] };
    it.each(AFTER_EXAMPLE_ONLY.flatMap((text) => PATHS.map(([name, make]) => [text, name, make] as const)))("after only the easier example and its new try, %j stays on the ones (%s)", async (text, _name, make) => {
      const r = await play([NO_START, down("Okay."), make(text, TENS_REGROUP)]);
      expect(r.told.at(-2)!.act).toBe("try_target");
      expect(r.told.at(-1), JSON.stringify(r.told.at(-1))).toMatchObject({ act: "guide", step: "ones" });
      expect(r.told.at(-1)!.say).not.toMatch(/Write 6/);
      expect(r.told.flatMap((t) => t.lines)).not.toContain("check.right_step");
      noAnswer(r);
    });

    it.each(PATHS)("\"I did that.\" twice after only the example asks the ones both times, never \"So what is 27 + 39?\" (%s)", async (_name, make) => {
      const r = await play([NO_START, down("Okay."), make("I did that.", { act: "guide", step: "tens", level: 0, lines: ["step.invite"] }), make("I did that.", { act: "guide", step: "result", level: 0, lines: ["step.invite"] })]);
      expect(r.told.slice(-2).map((t) => [t.act, t.step])).toEqual([["guide", "ones"], ["guide", "ones"]]);
      noAnswer(r);
    });

    it("\"I already did the ones.\" and help after only the example are help on the ones (model down)", async () => {
      const r = await play([NO_START, down("Okay."), down("I already did the ones."), down("Help me."), down("Help me.")]);
      expect(r.told.slice(-3).every((t) => t.act === "guide" && t.step === "ones"), JSON.stringify(r.told.slice(-3))).toBe(true);
      expect(r.told.map((t) => t.say).join(" ")).not.toMatch(/Only the 6 goes in the ones/);
      noAnswer(r);
    });

    it.each(PATHS)("\"Oh, so you carry the 1.\" about the example, before the new try, passes nothing (%s)", async (_name, make) => {
      const r = await play([NO_START, down("Oh, so you carry the 1."), make("Help me.", { act: "guide", step: "tens", level: 1, lines: ["step.regroup"] })]);
      expect(r.told.at(-2)!.act).toBe("try_target");
      expect(r.told.at(-1)).toMatchObject({ act: "guide", step: "ones" });
      noAnswer(r);
    });

    it.each(PATHS)("after the tens were shown and the example worked, \"I did that.\" or \"Oh I see.\" does not pass the tens (%s)", async (_name, make) => {
      for (const text of ["I did that.", "Oh I see.", "I carried the 1."]) {
        const r = await play([ONES_RIGHT, { child: "Show me the tens.", read: { help: "show" }, maya: [{ act: "guide", step: "tens", level: 3, lines: ["step.show"] }] }, down("Um."), make(text, { act: "guide", step: "result", level: 0, lines: ["step.invite"] })]);
        expect(r.told.some((t) => t.act === "example_step"), text).toBe(true);
        expect(r.told.at(-1), `${text} ${JSON.stringify(r.told.at(-1))}`).toMatchObject({ act: "guide", step: "tens" });
        noAnswer(r);
      }
    });

    it.each(PATHS)("right after this question's show, \"I did that.\" still passes the ones with no credit (%s)", async (_name, make) => {
      for (const text of ["I did that.", "I carried the 1.", "Got it."]) {
        const r = await play([SHOW, make(text, { act: "guide", step: "tens", level: 0, lines: ["step.invite"] })]);
        expect(r.told[2], text).toMatchObject({ act: "guide", step: "tens" });
        expect(r.told.flatMap((t) => t.lines)).not.toContain("check.right_step");
        noAnswer(r);
      }
    });

    it.each(PATHS)("after the show, the example and its new try, the ones in their own numbers still pass, \"I did that.\" alone does not (%s)", async (_name, make) => {
      const AFTER = [SHOW, down("Um."), down("Okay.")];
      const own = await play([...AFTER, make("I wrote the 6 and carried the 1.", { act: "guide", step: "tens", level: 0, lines: ["step.invite"] })]);
      expect(own.told.at(-1)).toMatchObject({ act: "guide", step: "tens" });
      const bare = await play([...AFTER, make("I did that.", { act: "guide", step: "tens", level: 0, lines: ["step.invite"] })]);
      expect(bare.told.at(-1)).toMatchObject({ act: "guide", step: "ones" });
      noAnswer(own);
      noAnswer(bare);
    });
  });

  describe("P1-2: carry, why and setup echo lines have a limit, then count in the loop guard", () => {
    const tensLoop = (text: string, plan: Plan): Step => ({ child: text, maya: [{ ...plan, repair: { throws: true } }] });
    it.each(["What is 2 plus 3 plus 1?", "Why?", "Why does the 1 go to the tens?", "Where does the 1 go?", "So 2 plus 3 plus 1?"])("ones credited, then %j fourteen times with the model down ends with the honest close", async (text) => {
      const r = await play([down("I got 16 for the ones."), ...Array.from({ length: 14 }, () => down(text))]);
      ends(r);
      noAnswer(r);
      const carry = r.told.filter((t) => t.lines.some((l) => l === "step.why" || l === "step.regroup")).length;
      expect(carry).toBeLessThanOrEqual(4);
      expect(r.told.filter((t) => t.lines.includes("step.show")).length).toBeLessThanOrEqual(2);
    });

    it("the model's setup echo fourteen times: said back once, then the help climbs to the honest close", async () => {
      const r = await play([ONES_RIGHT, ...Array.from({ length: 14 }, () => tensLoop("So 2 plus 3 plus 1?", { act: "guide", step: "tens", level: 2, lines: ["step.operation"] }))]);
      ends(r);
      noAnswer(r);
      // Before the example: one echo that is no new help, then at most two H2 guides in the loop guard's row before it climbs.
      const before = r.told.slice(0, r.told.findIndex((t) => t.act === "example_step"));
      expect(before.filter((t) => t.act === "guide" && t.lines.includes("step.operation")).length).toBeLessThanOrEqual(3);
      expect(before.some((t) => t.lines.includes("step.show"))).toBe(true);
    });

    it.each(["What is 2 plus 3 plus 1?", "So 2 plus 3 plus 1?"])("the model's setup echo for %j fourteen times ends", async (text) => {
      const r = await play([ONES_RIGHT, ...Array.from({ length: 14 }, () => tensLoop(text, { act: "guide", step: "tens", level: 2, lines: ["step.operation"] }))]);
      ends(r);
      noAnswer(r);
    });

    it.each(["Um.", "Why does the 1 go to the tens?", "Why?"])("the model's step.why after each %j ends with the honest close", async (text) => {
      const r = await play([ONES_RIGHT, tensLoop("Help me.", { act: "guide", step: "tens", level: 1, lines: ["step.regroup"] }),
        ...Array.from({ length: 14 }, () => tensLoop(text, { act: "guide", step: "tens", level: 1, lines: ["step.why"] }))]);
      ends(r);
      noAnswer(r);
      // The first two carry explanations are no repeat; after them the help climbs above H1 before any more.
      const carry = r.told.flatMap((t, i) => (t.lines.some((l) => l === "step.why" || l === "step.regroup") ? [i] : []));
      const firstClimb = r.told.findIndex((t, i) => i > carry[1] && t.act === "guide" && (t.level ?? 0) >= 2);
      expect(firstClimb, JSON.stringify(r.told.map((t) => [t.act, t.level, t.lines]))).toBeGreaterThan(0);
      expect(carry.filter((i) => i < firstClimb).length).toBeLessThanOrEqual(4);
    });

    it.each(["Why?", "Why do I trade a ten?", "Where does the 10 come from?"])("fixture B: %j fourteen times with the model down ends", async (text) => {
      const r = await play([down("Help me."), ...Array.from({ length: 14 }, () => down(text))], "B");
      ends(r);
      expect(r.told.slice(1).map((t) => t.say).join(" ")).not.toMatch(/\b24\b/);
      expect(r.told.filter((t) => t.lines.some((l) => l === "step.why" || l === "step.regroup")).length).toBeLessThanOrEqual(4);
    });

    it("fixture B: the model's subtract.why after each \"Why?\" ends", async () => {
      const r = await play([down("Help me."), ...Array.from({ length: 14 }, () => tensLoop("Why?", { act: "guide", step: "ones", level: 2, lines: ["step.why"] }))], "B");
      ends(r);
      expect(r.told.slice(1).map((t) => t.say).join(" ")).not.toMatch(/\b24\b/);
    });

    it("a carry question still gets its explanation once the ones are credited (D-253 item 6 kept)", async () => {
      for (const first of [ONES_RIGHT, down("I got 16 for the ones.")]) {
        const r = await play([first, down("Why does the 1 go to the tens?")]);
        expect(r.told.at(-1)!.lines.some((l) => l === "step.why" || l === "step.regroup" || l === "step.point"), JSON.stringify(r.told.at(-1))).toBe(true);
      }
    });
  });

  describe("P1-3: after progress and the easier example, the child gets a real turn on the step they were on", () => {
    const helpTens = (level: number): Step => ({ child: "Help me.", maya: [{ act: "guide", step: "tens", level: level as 0, repair: { throws: true } }] });
    const BEFORE: Step[] = [ONES_RIGHT, helpTens(1), helpTens(2), helpTens(3), down("Help me.")];
    it.each(["Okay.", "Okay, let me try.", "Hmm, so I add 2 and 3 and the 1?", "Um.", "Oh I see."])("%j after the example gets a guide on the tens, not close.stuck (model down)", async (text) => {
      const r = await play([...BEFORE, down(text)]);
      expect(r.told.filter((t) => t.act === "example_step").length).toBeGreaterThan(0);
      expect(r.told.at(-1), JSON.stringify(r.told.at(-1))).toMatchObject({ act: "guide", step: "tens" });
      expect(r.told.at(-1)!.lines).not.toContain("step.show");
      noAnswer(r);
    });

    it.each(PATHS)("the model's H2 on the tens after the example is said (%s)", async (name, make) => {
      const r = await play([...BEFORE, make("Okay, let me try.", { act: "guide", step: "tens", level: 2, lines: ["step.operation"] })]);
      expect(r.told.at(-1)).toMatchObject({ act: "guide", step: "tens" });
      if (name !== "code's fallback with the model down") expect(r.told.at(-1)).toMatchObject({ level: 2, lines: ["step.operation"] });
      expect(r.told.at(-1)!.refusals.filter((x) => !x.startsWith("act_not_allowed"))).toEqual([]);
      noAnswer(r);
    });

    it.each(PATHS)("no progress after the example climbs to one more show, never two in a row or a third, then close.stuck (%s)", async (_name, make) => {
      const r = await play([...BEFORE, ...Array.from({ length: 10 }, () => make("Um.", { act: "guide", step: "tens", level: 3, lines: ["step.show"] }))]);
      const guides = r.told.filter((t) => t.act === "guide");
      expect(guides.filter((t) => t.lines.includes("step.show")).length).toBe(2);
      for (let i = 1; i < r.told.length; i++) expect(r.told[i].lines.includes("step.show") && r.told[i - 1].lines.includes("step.show"), `${i}`).toBe(false);
      const example = r.told.findIndex((t) => t.act === "example_step");
      expect(r.told.slice(example).filter((t) => t.act === "guide").length).toBeGreaterThan(0);
      ends(r);
      noAnswer(r);
    });

    // Decision (a) of #735 is kept: a turn that only asks for help right after the example, when the step's show came
    // before it, gets the honest close. Every other turn gets the real turn above.
    it.each(["Help me.", "I'm stuck."])("%j right after the example, after the tens were shown, still gets the honest close (decision (a))", async (text) => {
      const r = await play([...BEFORE, down(text)]);
      ends(r);
      noAnswer(r);
    });

    it("a right tens step after the example is credited and goes on (model down)", async () => {
      const r = await play([...BEFORE, down("2 plus 3 plus 1 is 6.")]);
      expect(r.told.at(-1)).toMatchObject({ act: "guide", step: "result" });
      noAnswer(r);
    });

    it("fixture B: ones right, tens shown, example, then \"Okay.\" gets a guide on the tens, and the call still ends", async () => {
      const head: Step[] = [{ child: "12 minus 8 is 4.", read: { answers: [[4, "ones", "right"]] }, maya: [{ act: "guide", step: "tens", level: 0, repair: { throws: true } }] },
        down("Help me."), down("Help me."), down("Help me."), down("Help me.")];
      const r = await play([...head, down("Okay.")], "B");
      expect(r.told.at(-1), JSON.stringify(r.told.at(-1))).toMatchObject({ act: "guide", step: "tens" });
      const all = await play([...head, ...Array.from({ length: 10 }, () => down("Okay."))], "B");
      ends(all);
      expect(all.told.filter((t) => t.lines.includes("step.show")).length).toBe(2);
      expect(all.told.slice(1).map((t) => t.say).join(" ")).not.toMatch(/\b24\b/);
    });
  });
});
