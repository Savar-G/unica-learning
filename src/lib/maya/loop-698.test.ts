// The step-credit loop the #698 practice suite found (bef51538): a child who did the ones step right got no credit, so
// Maya asked the ones again until close.stuck or the turn cap. Each script replays the run's child words on the scripted
// model (27 + 39): a model that reads the step right, and a model that gives no proposal (code's fallback).
import { describe, expect, it } from "vitest";
import { readAnswer, readOptionsFor } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { judge, memoryTraceStore, runBehaviour, scenarioModel, type Behaviour, type Plan, type Step } from "@/lib/maya-gate/gate";
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

  it.each(paths)("after the show, a second show never comes, whatever lines go with it (%s)", async (_name, make) => {
    const r = await play([SHOW, ...Array.from({ length: 10 }, (_, i) => make("What is 7 plus 9?", { act: "guide", step: "ones", level: 3, lines: i % 2 === 0 ? ["step.show", "step.invite"] : ["step.show"] }))]);
    expect(r.told[1]).toMatchObject({ act: "guide", lines: ["step.show"] });
    expect(r.told[2].act).toBe("example_step");
    expect(r.told.slice(2).flatMap((t) => t.lines)).not.toContain("step.show");
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
