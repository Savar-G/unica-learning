import { describe, expect, it } from "vitest";
import { createSession, drawOffers, fallbacks, lineOffers, PHRASES, type Proposal, PROPOSAL_SCHEMA, readAnswer, readOptionsFor, SAFETY_GUIDANCE, type SessionEvent, step, valuesIn } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { type Behaviour, judge, memoryTraceStore, type Plan, type Read, runBehaviour, scenarioModel, type Step } from "@/lib/maya-gate/gate";
import { fakeMayaModel } from "@/lib/maya-model-fake";
import { createTextSession } from "@/lib/maya-text";
import { checkQuestionPackage, type Operation, type OperationPackage, workedSteps } from "@/lib/question-package";

const THROWS: Plan[] = [{ throws: true }];

const down = (text: string): Step => ({ child: text, maya: THROWS });

const frac = (numerator: number, denominator: number) => ({ type: "fraction" as const, numerator, denominator });

interface Told { act: string | undefined; step: string | undefined; level: number | undefined; lines: string[]; say: string }

async function play(fixture: Behaviour["fixture"], steps: Step[]) {
  const b: Behaviour = { id: "first-ship", title: "first ship", fixture, status: "passing", steps, expect: { outcome: {} } };
  const store = memoryTraceStore();
  await runBehaviour(b, store);
  const saved = store.load(b.id)!;
  const trace = JSON.parse(saved) as { turns: { kind: string; output?: { act: string; say: string[] }; attempts?: { refusal: unknown; proposal?: { act?: string; step?: string; level?: number; parts?: { line?: string }[] } }[] }[]; outcome: { reason: string; assistance: string } | null };
  const told: Told[] = trace.turns.filter((t) => t.kind === "maya" && t.output).map((t) => {
    const p = t.attempts!.at(-1)!.proposal ?? {};
    return { act: t.output!.act, step: p.step, level: p.level, lines: (p.parts ?? []).flatMap((x) => (x.line ? [x.line] : [])), say: t.output!.say.join(" ") };
  });
  const hard = judge(b, saved).failures.map((f) => `${f.code}: ${f.detail}`).filter((x) => /^(?:hint_skipped|answer_too_early|flow_mismatch)/.test(x));
  return { told, hard, outcome: trace.outcome };
}

/** The same replay on another addition: [the child's words, what a model reads, its plans]. */
async function playSum(a: number, b: number, turns: { child: string; read?: Read; maya?: Plan[] }[]): Promise<Told[]> {
  const operation: Operation = { kind: "add", operands: [a, b] };
  const pkg = { ...FIXTURES.A, text: `${a} + ${b} = ?`, operation, steps: workedSteps(operation), answer: { value: { type: "number" as const, value: a + b }, accepted: [], unit: null }, wrongAnswers: [{ value: { type: "number" as const, value: a + b - 10 }, cause: "O3", description: "Forgets the carry", step: "tens" }] };
  expect(checkQuestionPackage(pkg)).toMatchObject({ ok: true });
  let now = 1000;
  const model = scenarioModel();
  const session = createTextSession({ callId: "first-ship-sum", package: pkg, model, clock: () => now, random: 7 });
  await session.start();
  for (const turn of turns) {
    now += 4000;
    model.next(turn.maya ?? [], turn.read);
    await session.child(turn.child);
  }
  const trace = JSON.parse(JSON.stringify(session.trace())) as { turns: { kind: string; output?: { act: string; say: string[] }; attempts?: { proposal?: { step?: string; level?: number; parts?: { line?: string }[] } }[] }[] };
  const told = trace.turns.filter((t) => t.kind === "maya" && t.output).map((t) => {
    const p = t.attempts!.at(-1)!.proposal ?? {};
    return { act: t.output!.act, step: p.step, level: p.level, lines: (p.parts ?? []).flatMap((x) => (x.line ? [x.line] : [])), say: t.output!.say.join(" ") };
  });
  // An opening and one Maya turn per child turn: a held question would pass every "no credit" check with no call at all.
  return (expect(told.length).toBeGreaterThanOrEqual(turns.length + 1), told);
}

describe("C28, C29: a done step is not asked again when the model gives no reading", () => {
  it("goes on to the tens after '7 plus 9 is 16', and never asks the ones again (C28-r1)", async () => {
    const { told, hard } = await play("A", [down("Okay. 7 plus 9 is 16."), down("I carry the ten. It's 66."), down("I'm done. It's 66.")]);
    expect(told[1]).toMatchObject({ act: "guide", step: "tens", level: 0, lines: ["check.right_step", "step.invite"] });
    expect(told[1].say).toContain("16");
    expect(told[2]).toMatchObject({ act: "accept_answer" });
    expect(told.slice(1).filter((t) => t.step === "ones")).toEqual([]);
    expect(hard).toEqual([]);
  });

  it("accepts the stated result with no second confirmation (C29-r1)", async () => {
    const { told, outcome } = await play("A", [down("7 plus 9 is 16."), down("I already said 16. So I carry the ten, and I get 66."), down("Okay, I'm done.")]);
    expect(told.map((t) => t.act)).toEqual(["open", "guide", "accept_answer", "close"]);
    expect(told.filter((t) => t.step === "ones")).toEqual([]);
    expect(outcome).toMatchObject({ reason: "solved" });
  });

  it("takes 'Yes, it's 66.' after a confirmation as the answer, not back to the ones (C28-r1)", async () => {
    const { told } = await play("A", [down("Is it 66?"), down("Yes, it's 66.")]);
    expect(told.map((t) => t.act)).toEqual(["open", "confirm", "accept_answer"]);
  });

  it.each([
    ["a number about something else", "My dog is 16."],
    ["a wrong sum", "7 plus 9 is 15."],
    ["a question", "What is 7 plus 9?"],
    ["a question with the sum", "Is 7 plus 9 16?"],
    ["a right sum with a wrong digit written", "7 plus 9 is 16, I wrote 5."],
    ["a sum taken back", "7 plus 9 is 16. No wait, I don't know."],
  ])("does not count %s as the ones done", async (_name, text) => {
    const { told } = await play("A", [down(text)]);
    expect(told[1].lines).not.toContain("check.right_step");
    expect(told[1].step ?? "ones").toBe("ones");
  });

  // Review rounds of 29e2b327 and 771d2127: a step is heard only when the WHOLE turn is one template, on both paths.
  const ones: Step = { child: "7 plus 9 is 16.", read: { answers: [[16, "ones", "right"]] } };
  const shown: Step = { child: "Show me the ones.", read: { help: "show" }, maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"] }] };
  /** The model names this step right and asks to go on; its repair call fails, so code decides. */
  const named = (text: string, value: number, step: string): Step => ({
    child: text, read: { answers: [[value, step, "right"]] },
    maya: [{ act: "guide", step: step === "ones" ? "tens" : "result", level: 0, lines: ["check.right_step", "step.invite"], repair: { throws: true } }],
  });
  const NEXT = { act: "guide", lines: ["check.right_step", "step.invite"] };

  // [turn, the value a model would name]
  const HEARD_ONES: [string, number][] = [
    ["16.", 16], ["16", 16], ["16!", 16], ["Okay, 16.", 16], ["So 16.", 16], ["Um, 16.", 16], ["sixteen", 16],
    ["7 plus 9 is 16.", 16], ["9 plus 7 is 16.", 16], ["So 7 plus 9 is 16.", 16], ["Okay, 7 plus 9 is 16.", 16], ["Okay. 7 plus 9 is 16.", 16],
    ["7 plus 9 equals 16.", 16], ["7 plus 9 makes 16.", 16], ["seven plus nine is sixteen.", 16], ["seven and nine make sixteen", 16], ["7 and 9 is 16.", 16], ["9 + 7 = 16", 16], ["9+7=16", 16],
    ["It's 16.", 16], ["I got 16.", 16], ["So it's 16.", 16], ["Oh, I got 16.", 16], ["Oh, 16.", 16], ["Oh, 7 plus 9 is 16.", 16],
    ["I wrote 6 and carried 1.", 6], ["So I wrote 6 and carried 1.", 6], ["I put 6 in the ones and carried 1.", 6], ["6, carry the 1", 6],
    // Rule A (2026-11-12): the ones said as the child's own with no blocker (the whole-turn rule refused these).
    ["Then 7 plus 9 is 16.", 16], ["I know 7 plus 9 is 16.", 16], ["The ones make 16.", 16], ["It's 16. I got 16.", 16], ["7 plus 9 is 16, so I write 6.", 16], ["I write 6 and carry 1 ten.", 6],
  ];
  it.each(HEARD_ONES)("hears the ones in %j on both paths", async (text, value) => {
    expect((await play("A", [down(text)])).told[1]).toMatchObject({ ...NEXT, step: "tens" });
    expect((await play("A", [named(text, value, "ones")])).told[1]).toMatchObject({ ...NEXT, step: "tens" });
  });

  const NOT_HEARD_ONES: [string, number][] = [
    ["7 plus 9 is 16. My mom told me.", 16], ["My mom said so. 7 plus 9 is 16.", 16], ["7 plus 9 is 16. I don't know.", 16], ["7 plus 9 is 16. Or not.", 16], ["7 plus 9 is 16. It's 15.", 16],
    ["My mom wrote 6.", 6], ["She wrote 6.", 6], ["They wrote 6.", 6], ["Mom says I wrote 6.", 6], ["16. My mom said.", 16],
    ["Is it 16?", 16], ["Uh, 16?", 16], ["16?", 16], ["7 plus 9 is 16?", 16], ["I wrote 6?", 6],
    ["7 and 9 make 16 and 3.", 16], ["66 is 16.", 16], ["16 or 15", 16],
    ["7 is 16.", 16], ["9 and 16.", 16], ["9 is 16.", 16], ["My mom said 7 plus 9 is 16.", 16], ["Mia says 7 plus 9 is 16.", 16], ["I think 7 plus 9 is 16.", 16], ["Maybe 7 plus 9 is 16.", 16], ["I guess 7 plus 9 is 16.", 16],
    ["7 plus 9 is not 16.", 16], ["It's 16, I think.", 16], ["16 in the ones.", 16], ["My mom got 16.", 16], ["It's not 16.", 16], ["It is 16?", 16], ["I got 16?", 16],
    // A lone written digit is not the column's total (decision after review of fec3dac4).
    ["6", 6], ["6.", 6], ["It's 6.", 6], ["I got 6.", 6], ["I wrote 6.", 6], ["Wrote 6.", 6], ["So I wrote 6.", 6], ["I put 6 in the ones.", 6], ["I wrote 6 in the tens.", 6],
    ["16 and 3.", 16], ["I didn't write 6.", 6], ["I wrote 6. I think.", 6],
  ];
  // One number, the column's total, no claim: the only turns that get a step confirm (review of 6528f2ca).
  // Rule D (2026-11-12): a right total held back only by a hedge or a question gets the confirm too.
  const STEP_CONFIRM = new Set(["Is it 16?", "Uh, 16?", "16?", "It's 16, I think.", "I got 16?", "It is 16?",
    "7 plus 9 is 16. I don't know.", "7 plus 9 is 16. Or not.", "7 plus 9 is 16?", "I guess 7 plus 9 is 16.", "I think 7 plus 9 is 16.", "Maybe 7 plus 9 is 16."]);
  it.each(NOT_HEARD_ONES)("does not hear the ones in %j, and asks a step confirm only for the total alone", async (text, value) => {
    const down1 = (await play("A", [down(text)])).told[1];
    expect(down1.lines).not.toContain("check.right_step");
    expect(down1.say).not.toMatch(/7 \+ 9 = 16/);
    expect(down1.step ?? "ones").toBe("ones");
    const model = (await play("A", [named(text, value, "ones")])).told[1];
    expect(model.lines).not.toContain("check.right_step");
    expect(model.say).not.toMatch(/7 \+ 9 = 16/);
    if (STEP_CONFIRM.has(text)) expect(model.act).toBe("confirm");
    else expect(model.act).not.toBe("confirm");
  });

  it("gives '16 or 15' no step confirm and no credit, with the help Maya gives anyway", async () => {
    const { told } = await play("A", [named("16 or 15", 16, "ones")]);
    expect(told[1]).toMatchObject({ act: "guide", step: "ones" });
    expect(told[1].lines).not.toContain("check.right_step");
  });

  // Another expression is outside the question: scope answers it (redirect.workbook), and the ones get no credit.
  it.each(["7 times 9 is 16.", "7 times 9 is 16", "7 plus 9 plus 1 is 16.", "7 plus 7 is 16.", "16 is 66."])("never credits the ones for another sum: %j", async (text) => {
    for (const step of [down(text), named(text, 16, "ones")]) {
      const told = (await play("A", [step])).told[1];
      expect(told.lines).not.toContain("check.right_step");
      expect(told.say).not.toMatch(/7 \+ 9 = 16/);
    }
  });

  const HEARD_TENS: [string, number][] = [["So 2 plus 3 plus 1 is 6.", 6], ["2 plus 3 plus 1 is 6.", 6], ["3 plus 2 plus 1 is 6.", 6], ["1 plus 2 plus 3 is 6.", 6], ["two and three and one make six", 6], ["6.", 6], ["It's 6.", 6], ["I wrote 6 in the tens.", 6]];
  it.each(HEARD_TENS)("hears the tens in %j on both paths", async (text, value) => {
    expect((await play("A", [ones, down(text)])).told[2]).toMatchObject({ ...NEXT, step: "result" });
    expect((await play("A", [ones, named(text, value, "tens")])).told[2]).toMatchObject({ ...NEXT, step: "result" });
  });

  const NOT_HEARD_TENS: [string, number][] = [
    ["3 plus 2 plus 1 is 6. My mom said.", 6], ["3 is 6.", 6], ["2 and 6.", 6], ["1 and 6.", 6], ["The 1 and 6.", 6], ["2 plus 3 is 6.", 6], ["2 plus 1 is 6.", 6], ["My mom said 2 plus 3 plus 1 is 6.", 6],
    // Review of fec3dac4: another column, or no column named, on a step that takes a carry.
    ["I wrote 6.", 6], ["I wrote 6 in the ones.", 6],
  ];
  it.each(NOT_HEARD_TENS)("does not hear the tens in %j", async (text, value) => {
    const down1 = (await play("A", [ones, down(text)])).told[2];
    expect(down1.lines).not.toContain("check.right_step");
    expect(down1.step).toBe("tens");
    const model = (await play("A", [ones, named(text, value, "tens")])).told[2];
    expect(model.lines).not.toContain("check.right_step");
    expect(model.act).not.toBe("confirm");
    expect(model).toMatchObject({ act: "guide", step: "tens" });
  });

  // A copy of the shown total or sum after H3 is no credit, and the ladder goes past the shown step (fault B of the
  // subscription practice run at 361a05c9, C04-r2: the ones came again until Maya gave the answer). A lone digit is no copy
  // of the step: Maya stays on it.
  it.each([["7 plus 9 is 16.", 16], ["9 + 7 = 16", 16], ["16.", 16]] as const)("treats %j after H3 as a copy on both paths, and goes on with no credit", async (text, value) => {
    for (const step of [down(text), named(text, value, "ones")]) {
      const { told, outcome } = await play("A", [shown, step]);
      expect(told[2].lines).not.toContain("check.right_step");
      expect(told[2].say).not.toMatch(/7 \+ 9 = 16/);
      expect(told[2]).toMatchObject({ act: "guide", step: "tens" });
      expect(outcome?.assistance).not.toBe("independent");
    }
  });

  it.each([["6.", 6]] as const)("treats %j after H3 as no copy of the step on both paths", async (text, value) => {
    for (const step of [down(text), named(text, value, "ones")]) {
      const told = (await play("A", [shown, step])).told[2];
      expect(told.lines).not.toContain("check.right_step");
      expect(told.step ?? "ones").toBe("ones");
    }
  });

  // A plain yes to Maya's own "Did you say 16?" (decision after review of 27a0ea5b), as the final answer's confirm (P11b).
  const asked16: Step = { child: "Is it 16?", read: { answers: [[16, "ones", "right"]] }, maya: [{ act: "confirm", heard: "16", repair: { throws: true } }] };
  const nextAfterYes = (text: string, value: number): Step => named(text, value, "ones");
  const yesRead: Step = { child: "Yes.", read: { answers: [[16, "ones", "right"]] }, maya: [{ act: "guide", step: "tens", level: 0, lines: ["check.right_step", "step.invite"], repair: { throws: true } }] };

  it("asks with the number it will credit", async () => {
    expect((await play("A", [asked16])).told[1]).toMatchObject({ act: "confirm", lines: ["confirm.heard"] });
    expect((await play("A", [asked16])).told[1].say).toContain("16");
  });

  it.each([["Yes.", 16], ["yes", 16], ["Yeah.", 16], ["yep", 16], ["Yes 16", 16], ["Yes, 16.", 16], ["Yes it's 16.", 16], ["Yes, it's 16", 16]] as const)("credits %j after 'Did you say 16?' on both paths", async (text, value) => {
    expect((await play("A", [asked16, down(text)])).told[2]).toMatchObject({ ...NEXT, step: "tens" });
    expect((await play("A", [asked16, nextAfterYes(text, value)])).told[2]).toMatchObject({ ...NEXT, step: "tens" });
  });

  it("credits a plain yes when the model reads no number in it", async () => {
    const { told } = await play("A", [asked16, { child: "Yes.", maya: [{ act: "guide", step: "tens", level: 0, lines: ["check.right_step", "step.invite"] }] }]);
    expect(told[2]).toMatchObject({ ...NEXT, step: "tens" });
  });

  it("gives an other-speaker turn no confirm, so a yes credits nothing", async () => {
    const asked: Step = { child: "My mom said 16.", read: { answers: [[16, "ones", "right"]] }, maya: [{ act: "confirm", heard: "16", repair: { throws: true } }] };
    const { told } = await play("A", [asked, down("Yes.")]);
    expect(told[1].act).not.toBe("confirm");
    expect(told[2].lines).not.toContain("check.right_step");
  });

  it.each(["Yes, I think 16.", "Yes, 16. I think.", "Yes?", "Yes maybe.", "Yes, 15.", "Yes it's 15.", "Yes, 16. My mom said.", "Yes, I guess.", "Yes, but I don't know.", "No.", "Yes. Yes."])("does not credit %j after 'Did you say 16?', and asks again", async (text) => {
    for (const step of [down(text), nextAfterYes(text, 16)]) {
      const told = (await play("A", [asked16, step])).told[2];
      expect(told.lines).not.toContain("check.right_step");
      expect(told.say).not.toMatch(/7 \+ 9 = 16/);
    }
  });

  const yesReadRight = (value: number): Step => ({ child: "Yes.", read: { answers: [[value, "ones", "right"]] }, maya: [{ act: "guide", step: "tens", level: 0, lines: ["check.right_step", "step.invite"], repair: { throws: true } }] });

  it("does not credit a yes to a value that is not this step's", async () => {
    // 9 is one of the question's numbers, so Maya may say it back; it does not answer the ones.
    const asked9: Step = { child: "Is it 9?", maya: [{ act: "confirm", heard: "9" }] };
    for (const step of [down("Yes."), yesReadRight(9)]) {
      const { told } = await play("A", [asked9, step]);
      expect(told[1]).toMatchObject({ act: "confirm" });
      expect(told[1].say).toContain("9");
      expect(told[2].lines).not.toContain("check.right_step");
      expect(told[2].step ?? "ones").toBe("ones");
    }
  });

  it("does not credit the tens for a yes to the ones' value", async () => {
    const asked16AtTens: Step = { child: "Is it 16?", maya: [{ act: "confirm", heard: "16" }] };
    const { told } = await play("A", [ones, asked16AtTens, down("Yes.")]);
    expect(told[2]).toMatchObject({ act: "confirm" });
    expect(told[3].lines).not.toContain("check.right_step");
    expect(told[3].step ?? "tens").toBe("tens");
  });

  it("never asks 'Did you say' for a wrong number outside the question, so no yes can credit one", async () => {
    const { told } = await play("A", [{ child: "Is it 15?", maya: [{ act: "confirm", heard: "15" }] }, down("Yes.")]);
    expect(told[1].say).not.toContain("15");
    expect(told.at(-1)!.lines).not.toContain("check.right_step");
  });

  it.each([["at the opening", []], ["after a guide", [{ child: "I don't know." } as Step]]] as const)("does not credit a yes with no confirm pending, %s", async (_name, before) => {
    for (const step of [down("Yes."), nextAfterYes("Yes.", 16)]) {
      const told = (await play("A", [...before, step])).told.at(-1)!;
      expect(told.lines).not.toContain("check.right_step");
      expect(told.say).not.toMatch(/7 \+ 9 = 16/);
    }
  });

  it("does not credit a yes after confirm.answer, which names no number", async () => {
    const asked: Step = { child: "Hmm, sixty something.", maya: [{ act: "confirm", lines: ["confirm.answer"] }] };
    const told = (await play("A", [asked, down("Yes.")])).told[2];
    expect(told.lines).not.toContain("check.right_step");
  });

  it("treats a yes after H3 as a copy", async () => {
    const asked: Step = { child: "Is it 16?", read: {}, maya: [{ act: "confirm", heard: "16" }] };
    const told = (await play("A", [shown, asked, down("Yes.")])).told.at(-1)!;
    expect(told.lines).not.toContain("check.right_step");
    expect(told.step ?? "ones").toBe("ones");
  });

  it("asks no confirm for the lone digit in another speaker's words, and a yes credits nothing", async () => {
    const asked6: Step = { child: "My mom wrote 6.", read: { answers: [[6, "ones", "right"]] }, maya: [{ act: "guide", step: "tens", level: 0, lines: ["check.right_step", "step.invite"], repair: { throws: true } }] };
    const { told } = await play("A", [asked6, down("Yes.")]);
    expect(told[1].act).not.toBe("confirm");
    expect(told[2].lines).not.toContain("check.right_step");
  });

  // Review of fec3dac4. A written digit or carry judged wrong is not a hearing problem: no confirm, and no yes can credit it.
  describe.each(["7 plus 9 is 16. I wrote 16.", "16. I carried 6.", "7 plus 9 is 16, I carried 6."])("a wrong claim: %j", (text) => {
    const yesCredited = (told: Told[]) => told.some((x) => x.lines.includes("check.right_step") || /7 \+ 9 = 16/.test(x.say));
    it("gets no confirm when a model names the step, and a yes credits nothing", async () => {
      const { told } = await play("A", [named(text, 16, "ones"), yesRead]);
      expect(told[1].act).not.toBe("confirm");
      expect(yesCredited(told)).toBe(false);
    });
    it("refuses a model's confirm, and a yes credits nothing", async () => {
      const { told } = await play("A", [{ child: text, maya: [{ act: "confirm", heard: "16", repair: { throws: true } }] }, yesRead]);
      expect(told[1].act).not.toBe("confirm");
      expect(yesCredited(told)).toBe(false);
    });
    it("gets a confirm only for a reading of unclear, and a yes to it credits nothing", async () => {
      const { told } = await play("A", [{ child: text, read: { unclear: true }, maya: [{ act: "confirm", heard: "16" }] }, yesRead]);
      expect(yesCredited(told)).toBe(false);
    });
    it("with the model down, gets no confirm and a yes credits nothing", async () => {
      const { told } = await play("A", [down(text), down("Yes.")]);
      expect(told[1].act).not.toBe("confirm");
      expect(yesCredited(told)).toBe(false);
    });
  });

  it.each(["I wrote 6 in the tens.", "I put 6 in the tens and carried 1."])("gives no credit on the ones for a claim about the tens, before or after H3: %j", async (text) => {
    for (const step of [down(text), named(text, 6, "ones")]) {
      const first = (await play("A", [step])).told.at(-1)!;
      expect(first.lines).not.toContain("check.right_step");
      expect(first.say).not.toMatch(/7 \+ 9 = 16/);
      // After H3 she never says the claim was right, and never guides past the ones. The show is not said a second time
      // in a row: the easier example comes instead (#698 round 2, P1 e).
      const after = (await play("A", [shown, step])).told.slice(2);
      expect(after.flatMap((t) => t.lines)).not.toContain("check.right_step");
      expect(after.filter((t) => t.act === "guide").map((t) => t.step ?? "ones")).not.toContain("tens");
      expect(after.filter((t) => t.act === "guide").map((t) => t.step ?? "ones")).not.toContain("result");
      expect(after.length).toBeGreaterThan(0);
    }
  });

  it.each(["2 plus 3 plus 1 is 6.", "I wrote 6 in the tens."])("gives no tens credit before the ones: %j", async (text) => {
    for (const step of [down(text), named(text, 6, "tens")]) {
      const told = (await play("A", [step])).told[1];
      expect(told.lines).not.toContain("check.right_step");
      expect(told.step ?? "ones").toBe("ones");
    }
  });

  it("refuses the plan to write 16 in the ones, with no credit after a yes (C01b's original reading)", async () => {
    const plan: Step = { child: "Seven plus nine is 16. I write 16 under the ones.", read: { answers: [[16, "ones", "right"]] }, maya: [{ act: "guide", step: "tens", level: 0, lines: ["check.right_step", "step.invite"], repair: { act: "guide", step: "ones", level: 1, lines: ["step.regroup"] } }] };
    const { told } = await play("A", [plan, down("Yes."), yesRead]);
    expect(told[1]).toMatchObject({ act: "guide", step: "ones", lines: ["step.regroup"] });
    for (const later of told.slice(2)) expect(later.lines).not.toContain("check.right_step");
  });

  // Rule A (2026-11-12): the child works the tens in two true steps and says 6 as their own, so the tens are credited.
  it("credits the tens for an intermediate result in a sentence: 'Two plus three is five, plus the one is six.'", async () => {
    const text = "Two plus three is five, plus the one is six.";
    const said = await play("A", [ones, named(text, 6, "tens")]);
    expect(said.told[2]).toMatchObject({ act: "guide", step: "result" });
    expect(said.told[2].lines).toContain("check.right_step");
    const modelDown = await play("A", [ones, down(text)]);
    expect(modelDown.told[2].lines).toContain("check.right_step");
    expect(modelDown.told[2].step).toBe("result");
  });

  // Review of 6528f2ca: a step confirm only for one number, the column's total, with no claim in the turn.
  const creditFree = (told: Told[]) => expect(told.flatMap((x) => x.lines)).not.toContain("check.right_step");
  const THROWS_REPAIR: Plan = { act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"], repair: { throws: true } };
  const onesDone = { child: "7 plus 9 is 16.", read: { answers: [[16, "ones", "right"]] } as Read };

  it.each(["I wrote 6 in the ones.", "I wrote 6."])("gives the tens no confirm and no credit for %j, then a yes (27 + 39)", async (text) => {
    for (const first of [
      { child: text, read: { answers: [[6, "tens", "right"]] } as Read, maya: [THROWS_REPAIR] },
      { child: text, maya: [{ act: "confirm" as const, heard: "6", repair: { throws: true } }] },
      { child: text },
    ]) {
      const told = await playSum(27, 39, [onesDone, first, { child: "Yes.", read: { answers: [[6, "tens", "right"]] }, maya: [THROWS_REPAIR] }]);
      expect(told[2].act).not.toBe("confirm");
      expect(told[2].say).not.toMatch(/2 \+ 3 \+ 1 = 6/);
      expect(told[3].lines).not.toContain("check.right_step");
      expect(told[3].say).not.toMatch(/That's it|= 6\b/);
    }
  });

  it("gives the hundreds no confirm and no credit for 'I wrote 3.', then a yes (156 + 237)", async () => {
    const before = [
      { child: "6 plus 7 is 13.", read: { answers: [[13, "ones", "right"]] } as Read },
      { child: "5 plus 3 plus 1 is 9.", read: { answers: [[9, "tens", "right"]] } as Read },
    ];
    for (const first of [
      { child: "I wrote 3.", read: { answers: [[3, "hundreds", "right"]] } as Read, maya: [THROWS_REPAIR] },
      { child: "I wrote 3.", maya: [{ act: "confirm" as const, heard: "3", repair: { throws: true } }] },
    ]) {
      const told = await playSum(156, 237, [...before, first, { child: "Yes.", read: { answers: [[3, "hundreds", "right"]] }, maya: [THROWS_REPAIR] }]);
      expect(told[3].act).not.toBe("confirm");
      expect(told[4].lines).not.toContain("check.right_step");
    }
  });

  it("never asks about a lone digit it will not credit (27 + 39 ones)", async () => {
    for (const text of ["6", "6.", "It's 6.", "I got 6.", "Is it 6?"]) {
      for (const first of [named(text, 6, "ones"), { child: text, maya: [{ act: "confirm" as const, heard: "6", repair: { throws: true } }] }, down(text)]) {
        const { told } = await play("A", [first as Step, down("Yes.")]);
        expect([text, told[1].act]).not.toEqual([text, "confirm"]);
        creditFree(told);
      }
    }
  });

  it("never credits a carry alone, even where it equals the written digit (156 + 235)", async () => {
    for (const first of [{ child: "I carried 1." }, { child: "I carried 1.", read: { answers: [[1, "ones", "right"]] } as Read, maya: [{ act: "guide" as const, step: "tens", level: 0, lines: ["check.right_step", "step.invite"] as const, repair: { throws: true } }] as unknown as Plan[] }]) {
      creditFree(await playSum(156, 235, [{ ...first, maya: first.maya ?? THROWS }]));
    }
  });

  it.each(["I wrote 1 and carried 1.", "1, carry the 1"])("still credits a written digit with its carry: %j (156 + 235)", async (text) => {
    const told = await playSum(156, 235, [{ child: text, maya: THROWS }]);
    expect(told[1]).toMatchObject({ ...NEXT, step: "tens" });
  });

  it("credits nothing for a yes after 'I wrote one six.'", async () => {
    for (const first of [down("I wrote one six."), { child: "I wrote one six.", maya: [{ act: "confirm" as const, heard: "6", repair: { throws: true } }] }, { child: "I wrote one six.", read: { unclear: true }, maya: [{ act: "confirm" as const, repair: { throws: true } }] }]) {
      creditFree((await play("A", [first as Step, down("Yes."), yesRead])).told);
    }
  });

  it("credits nothing for a yes after 'I wrote one six.' on the tens, where 6 is the total (27 + 39)", async () => {
    for (const first of [{ child: "I wrote one six.", maya: [{ act: "confirm" as const, heard: "6", repair: { throws: true } }] }, { child: "I wrote one six.", read: { unclear: true } as Read, maya: [{ act: "confirm" as const, heard: "6", repair: { throws: true } }] }, { child: "I wrote one six.", maya: THROWS }]) {
      const told = await playSum(27, 39, [onesDone, first, { child: "Yes.", maya: [THROWS_REPAIR] }]);
      expect(told.at(-1)!.lines).not.toContain("check.right_step");
      expect(told.at(-1)!.say).not.toMatch(/2 \+ 3 \+ 1 = 6/);
    }
  });

  it.each([["Is it 16?"], ["16?"], ["Uh, 16?"], ["It's 16, I think."], ["Maybe 16."], ["I guess 16."], ["I think it's 16."], ["Hmm, I got 16?"], ["I got 16?"]])("may ask about one number that is the total, and the yes credits it: %j", async (text) => {
    const { told } = await play("A", [named(text, 16, "ones"), down("Yes.")]);
    expect(told[1]).toMatchObject({ act: "confirm", lines: ["confirm.heard"] });
    expect(told[1].say).toContain("16");
    expect(told[2]).toMatchObject({ ...NEXT, step: "tens" });
  });

  // Review of 66491fd5: after removing the one number, every other word must be on a short list.
  const noStepConfirm = async (a: number, b: number, before: { child: string; read?: Read; maya?: Plan[] }[], text: string, value: number, step: string) => {
    const yes = { child: "Yes.", read: { answers: [[value, step, "right"]] } as Read, maya: [THROWS_REPAIR] };
    for (const first of [
      { child: text, read: { answers: [[value, step, "right"]] } as Read, maya: [THROWS_REPAIR] },
      { child: text, maya: [{ act: "confirm" as const, heard: String(value), repair: { throws: true } }] },
      { child: text, maya: THROWS },
    ]) {
      const told = await playSum(a, b, [...before, first, yes]);
      expect([text, told[before.length + 1].act]).not.toEqual([text, "confirm"]);
      expect(told.slice(before.length + 1).flatMap((x) => x.lines)).not.toContain("check.right_step");
    }
  };
  it.each(["6 in the ones.", "The ones are 6.", "I got 6 for the ones.", "6 tens?"])("gives the tens no confirm and no credit: %j (27 + 39)", async (text) => {
    await noStepConfirm(27, 39, [onesDone], text, 6, "tens");
  });
  it.each(["16 in the tens.", "The tens make 16.", "16 tens?", "The answer is 16.", "My mom said 16.", "16. My mom said.", "16 in the ones."])("gives the ones no confirm and no credit: %j (27 + 39)", async (text) => {
    await noStepConfirm(27, 39, [], text, 16, "ones");
  });
  // #698 loop round (practice at bef51538): the child names the ones and their total in their own words, so it credits.
  // "16 in the ones." stays above: it may mean 16 written in the ones place.
  it("credits the ones for 'I got 16 for the ones.' (27 + 39)", async () => {
    for (const first of [{ child: "I got 16 for the ones.", read: { answers: [[16, "ones", "right"]] } as Read, maya: [THROWS_REPAIR] }, { child: "I got 16 for the ones.", maya: THROWS }]) {
      const told = await playSum(27, 39, [first]);
      expect(told[1]).toMatchObject({ ...NEXT, step: "tens" });
    }
  });
  it("gives the hundreds no confirm and no credit: '3 in the ones?' (156 + 237)", async () => {
    await noStepConfirm(156, 237, [{ child: "6 plus 7 is 13.", read: { answers: [[13, "ones", "right"]] } }, { child: "5 plus 3 plus 1 is 9.", read: { answers: [[9, "tens", "right"]] } }], "3 in the ones?", 3, "hundreds");
  });
  // Rule A (2026-11-12): "The tens make 16." is the tens' own total for 77 + 89, so it is credited (see below).
  it.each(["6 in the ones.", "The ones are 16.", "16 in the ones.", "16 tens?"])("gives the tens no confirm and no credit: %j (77 + 89)", async (text) => {
    await noStepConfirm(77, 89, [{ child: "7 plus 9 is 16.", read: { answers: [[16, "ones", "right"]] } }], text, 16, "tens");
  });
  it("still credits the tens for 'Is it 16?' then a yes (77 + 89)", async () => {
    const told = await playSum(77, 89, [{ child: "7 plus 9 is 16.", read: { answers: [[16, "ones", "right"]] } }, { child: "Is it 16?", read: { answers: [[16, "tens", "right"]] }, maya: [THROWS_REPAIR] }, { child: "Yes.", maya: THROWS }]);
    expect(told[2]).toMatchObject({ act: "confirm" });
    expect(told[3].lines).toContain("check.right_step");
  });

  // Review of 66491fd5: a plan or a wrong claim beside a right final answer. No yes can pass over it.
  it.each([
    ["a model that names the answer", { child: "I wrote 16 in the ones. It is 66.", read: { answers: [[66, "result", "right"]] }, maya: [{ act: "accept_answer" as const, repair: { throws: true } }] }],
    ["a model's confirm", { child: "I wrote 16 in the ones. It is 66.", maya: [{ act: "confirm" as const, heard: "66", repair: { throws: true } }] }],
    ["a model's unclear reading", { child: "I wrote 16 in the ones. It is 66.", read: { unclear: true } as Read, maya: [{ act: "confirm" as const, heard: "66", repair: { throws: true } }] }],
    ["the model down", down("I wrote 16 in the ones. It is 66.")],
  ] as const)("does not pass over 'I wrote 16 in the ones. It is 66.' with a yes: %s", async (_name, first) => {
    for (const yes of [down("Yes."), { child: "Yes.", read: { answers: [[66, "result", "right"]] }, maya: [{ act: "accept_answer" as const, repair: { throws: true } }] } as Step]) {
      const { told } = await play("A", [first as Step, yes]);
      expect(told[1].act).not.toBe("confirm");
      expect(told.map((x) => x.act)).not.toContain("accept_answer");
      expect(told.map((x) => x.say).join(" ")).not.toMatch(/= 66/);
    }
  });

  // Review of 66491fd5: an unclear turn gets a confirm only when that confirm could credit something.
  it.each(["Is it 6?", "6", "It's 6."])("uses the normal help for an unclear %j on the ones", async (text) => {
    for (const first of [{ child: text, read: { unclear: true } as Read, maya: [{ act: "confirm" as const, heard: "6", repair: { throws: true } }] }, { child: text, uncertain: true, maya: THROWS }]) {
      const { told } = await play("A", [first as Step, down("Yes.")]);
      expect(told[1]).toMatchObject({ act: "guide", step: "ones" });
      expect(told[2].lines).not.toContain("check.right_step");
    }
  });
  it("uses the normal help for an unclear 'I carried 1.' (156 + 235)", async () => {
    const told = await playSum(156, 235, [{ child: "I carried 1.", read: { unclear: true }, maya: [{ act: "confirm", heard: "1", repair: { throws: true } }] }, { child: "Yes.", maya: THROWS }]);
    expect(told[1]).toMatchObject({ act: "guide", step: "ones" });
    expect(told[2].lines).not.toContain("check.right_step");
  });
  it.each(["Is it 16?", "Is it 66?"])("still confirms an unclear %j, which a yes can credit", async (text) => {
    const { told } = await play("A", [{ child: text, read: { unclear: true }, maya: [{ act: "confirm", heard: text.includes("66") ? "66" : "16" }] }]);
    expect(told[1].act).toBe("confirm");
  });

  it("keeps the final answer's confirm (P11)", async () => {
    const { told } = await play("A", [{ child: "Is it 66?", maya: [{ act: "confirm", heard: "66" }] }, { child: "Yes." }]);
    expect(told.map((x) => x.act)).toEqual(["open", "confirm", "accept_answer"]);
  });

  it("gives no credit to a step beside a right final answer, and still accepts the answer", async () => {
    const { told } = await play("A", [ones, { child: "Six, so 66.", read: { answers: [[6, "tens", "right"], [66, "result", "right"]] } }]);
    expect(told[2].act).toBe("accept_answer");
  });

  it("reads a carry sentence as no second answer only with the point-at forms or the step's real carry", () => {
    const opts = readOptionsFor(FIXTURES.A as OperationPackage);
    for (const text of ["I carry the ten. It's 66.", "I carried the one. It's 66.", "I carry 1. It's 66.", "So I carry the ten. It's 66."]) {
      expect([text, readAnswer(text, opts).sure]).toEqual([text, true]);
    }
    for (const text of ["I carry 6. It's 66.", "I carried 7. It's 66.", "I carry the 6. It's 66.", "I carry 10. It's 66.", "I got 5. It's 66.", "I carried 5. It's 66.", "It's 16. It's 66.", "It's 66. I carry the ten."]) {
      expect([text, readAnswer(text, opts).sure]).toEqual([text, false]);
    }
  });

  it("does not commit a turn whose carry is not the question's, and asks no confirm over a wrong claim", async () => {
    for (const text of ["I carry 6. It's 66.", "I carried 7. It's 66."]) {
      const { told } = await play("A", [down(text)]);
      expect(told[1].act).not.toBe("accept_answer");
      expect(told[1].act).not.toBe("confirm");
      expect(told[1].say).not.toMatch(/= 66/);
    }
  });

  it("lets 'already said' point back only at the child's earlier turns or done steps", async () => {
    const opts = readOptionsFor(FIXTURES.A as OperationPackage);
    expect(readAnswer("I already said 16. It's 66.", opts).sure).toBe(false);
    expect(readAnswer("I already said 16. It's 66.", { ...opts, saidBefore: [16] }).sure).toBe(true);
    expect(readAnswer("I already said 5. It's 66.", { ...opts, saidBefore: [16] }).sure).toBe(false);
    const never = await play("A", [down("I already said 16. It's 66.")]);
    expect(never.told[1]).toMatchObject({ act: "confirm" });
    const said = await play("A", [down("Is it 16?"), down("I already said 16. It's 66.")]);
    expect(said.told.at(-1)).toMatchObject({ act: "accept_answer" });
    const other = await play("A", [down("Is it 16?"), down("I already said 7. It's 66.")]);
    expect(other.told.at(-1)).toMatchObject({ act: "confirm" });
  });
});

describe("C38: a right final answer with no method shown", () => {
  const accept = (text: string, read: Read, plan: Plan = {}): Step => ({ child: text, read, maya: [{ act: "accept_answer", ...plan }] });
  const right = { answers: [[frac(7, 8), "result", "right"]] } as Read;

  it("reads 'that one' as no number in a fraction call, so no restate is asked (C38-r1)", () => {
    const opts = readOptionsFor(FIXTURES.D as OperationPackage);
    expect(readAnswer("Hi Maya! I got 7/8 for that one.", opts)).toMatchObject({ final: frac(7, 8), sure: true });
    expect(readAnswer("I got 7/8 for this one", opts)).toMatchObject({ final: frac(7, 8), sure: true });
    // "one" in a spoken fraction stays a number.
    expect(readAnswer("I got one third.", opts).final).toEqual(frac(1, 3));
  });

  it("asks how the child got it in the accept turn, with code's approved line (C38-r1)", async () => {
    const { told, outcome } = await play("D", [accept("Hi Maya! I got 7/8 for that one.", right), { child: "Yay, I'm done with that one!" }]);
    expect(told.map((t) => t.act)).toEqual(["open", "accept_answer", "close"]);
    expect(told[1].say).toMatch(/7\/8/);
    expect(told[1].say).toMatch(/\b(?:how|thinking|think of it|did it|figured it out)\b/i);
    expect(outcome).toMatchObject({ reason: "solved" });
  });

  it("does the same when the model gives nothing", async () => {
    const { told } = await play("D", [down("I got 7/8.")]);
    expect(told[1].act).toBe("accept_answer");
    expect(told[1].say).toMatch(/\b(?:how|thinking|think of it|did it|figured it out)\b/i);
  });

  it("asks only once when the model already chose a check", async () => {
    const { told } = await play("D", [accept("I got 7/8.", right, { lines: ["answer.right", "check.thinking"] })]);
    expect(told[1].say.match(/[.?!](?:\s|$)/g)).toHaveLength(2);
  });

  it.each([
    ["an explanation in the turn", "I got 7/8 because I used eighths.", "D", right],
    ["working in the turn", "7 plus 9 is 16, so I carried a ten, and I got 66.", "A", { answers: [[66, "result", "right"]] } as Read],
    ["a child who is done", "I got 7/8. I'm done.", "D", right],
  ] as const)("adds no question after %s", async (_name, text, fixture, read) => {
    const { told } = await play(fixture, [accept(text, read)]);
    expect(told[1].act).toBe("accept_answer");
    expect(told[1].say).not.toMatch(/\b(?:how|thinking|think of it|did it|figured it out)\b/i);
  });

  it("adds no question after the child worked the steps in this call", async () => {
    const { told } = await play("A", [
      { child: "7 plus 9 is 16.", read: { answers: [[16, "ones", "right"]] } },
      { child: "2 plus 3 plus 1 is 6.", read: { answers: [[6, "tens", "right"]] } },
      accept("66.", { answers: [[66, "result", "right"]] }),
    ]);
    expect(told.at(-1)!.act).toBe("accept_answer");
    expect(told.at(-1)!.say).not.toMatch(/\b(?:how|thinking|think of it|did it|figured it out)\b/i);
  });
});

describe("C04: the fallback path keeps to the hint ladder", () => {
  // The child's words of C04-r1, turn by turn, with the model down on every turn.
  const C04 = ["Hi Maya! Is it 60?", "Um, is it 70?", "Is it 66?", "I think it's 66. Is it right?", "I don't know. I just guessed 66.", "Yes, 66. I just guessed it.", "Okay. I don't know what 7 plus 9 is.", "I don't know how to do that one.", "Okay, I wrote the 6. Is the 1 for the tens?", "I still don't get the 1. Is it 66?", "Yes, I said 66. I just guessed it.", "I don't know that one. I just guessed.", "I don't know what 7 plus 9 is.", "Okay, the 6 goes in the ones. What do I do next?", "Okay, I wrote the 6. I still don't get the 1, sorry.", "Okay, I wrote the 6 down. Now what do I do with the 1?", "I'm still lost, sorry. I think it's 66.", "I still don't get it. I think it's 66, I guessed.", "Yes, I guessed 66.", "I don't know. I just guessed.", "Okay, I wrote 66. I just guessed it."];

  // #735, decision (a): the help request after H3 ("I don't know. I just guessed.") gets the easier example, never the answer.
  it("gives the easier example only straight after H3, with no hint skipped and no answer (C04-r1)", async () => {
    const { told, hard } = await play("A", C04.map(down));
    expect(hard).toEqual([]);
    expect(told.map((t) => t.act)).not.toContain("give_answer");
    const at = told.findIndex((t) => t.act === "example_step");
    expect(at).toBeGreaterThan(0);
    expect(told.slice(0, at).filter((t) => t.act === "guide").at(-1)!.level).toBe(3);
  });

  // Changed in #698 round 4: the guessed yes after the show is checked together once (D-253 item 17), with the step's
  // question below the show. The old reason for no lower check was a given answer after H2 (hint_skipped); Maya gives no
  // answer now (D-326). Never a second show in a row, and the check does not count in the loop guard's row: no progress
  // after it gives the easier example.
  it("checks a guessed yes together once after the step was shown, then the easier example", async () => {
    const { told, hard } = await play("A", [
      { child: "Show me the ones.", read: { help: "show" }, maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"] }] },
      down("Is it 66?"), down("Yes, I said 66. I just guessed it."), down("I don't know."),
    ]);
    expect(hard).toEqual([]);
    expect(told[2]).toMatchObject({ act: "confirm" });
    expect(told[3]).toMatchObject({ act: "guide", step: "ones", level: 2, lines: ["check.guess", "step.operation"] });
    expect(told[4]).toMatchObject({ act: "example_step" });
    expect(told.slice(2).flatMap((t) => t.lines)).not.toContain("step.show");
  });

  it("closes without the answer after a miss at H3", async () => {
    // The model reads the miss and shows the step again; that is refused, so code's fallback gives the answer.
    const miss: Step = { child: "15.", read: { answers: [[15, "ones", "wrong"]] }, maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"], repair: { throws: true } }] };
    const { told } = await play("A", [...C04.slice(0, 13).map(down), miss]);
    const close = told.find((t) => t.act === "close")!;
    expect(close.lines).toEqual(["close.stuck", "close.together"]);
    expect(close.say).not.toMatch(/\b66\b/);
  });
});

describe("backup handling", () => {
  const n=(value:number)=>({type:'number',value});

  function rig(pkg=FIXTURES.A, grade?:number){
   let s=createSession({grade,callId:'independent-r3',package:pkg});let at=1000;const trace:unknown[]=[];
   const send=(e:Record<string, unknown>)=>{at=(e.at as number|undefined)??at;const before={state:s.state,ladder:s.ladder,finalMisses:s.finalMisses,done:s.done,passed:s.passed,exampleShown:s.exampleShown};const r=step(s,{at,...e} as SessionEvent);s=r.session;trace.push({event:e,before,refusal:r.refusal,effects:r.effects});return r;};
   const child=(text:string,extra={})=>send({type:'child_turn',at:at+4000,text,...extra});
   const prop=(p:Record<string, unknown>,extra={})=>send({type:'proposal',proposal:{version:2,...p},...extra});
   const fb=(refused:unknown[]=[]): {act:string; text?:string; proposal?:Proposal; effects?:unknown[]; rejects?:unknown[]}=>{const rejects=[];for(const p of fallbacks(s,refused as Parameters<typeof fallbacks>[1])){const r=prop(p as unknown as Record<string, unknown>,{fallback:true});if(!r.refusal)return {act:p.act,text:r.effects.filter(e=>e.kind==='say').map(e=>e.text).join(' '),effects:r.effects,proposal:p};rejects.push(r.refusal);}return {act:'DEAD',rejects};};
   const show=(id:string)=>{expect(prop({act:'guide',step:id,level:3,parts:[{line:'step.show',slots:{step:id}}],reading:{help:'show'}}).refusal).toBeNull();};
   send({type:'start'});expect(fb().act).toBe('open');
   return {get s(){return s},trace,send,child,prop,fb,show};
  }

  function setup(stage:string){const r=rig();if(stage==='h3'||stage==='passed'||stage==='example'){r.child('Show me the ones.');r.show('ones');}
   if(stage==='passed'||stage==='example'){r.child('16.');r.fb();r.child('Show me the tens.');r.show('tens');r.child('6.');r.fb();expect(r.s.passed).toEqual(['ones','tens']);}
   if(stage==='done'){r.child('7 plus 9 is 16.');r.fb();r.child('2 plus 3 plus 1 is 6.');r.fb();expect(r.s.done).toEqual(['ones','tens']);}
   if(stage==='example'){r.child("I'm stuck.");for(let i=0;i<8&&r.s.expect==='maya'&&!r.s.outcome;i++)expect(r.fb().act).not.toBe('DEAD');expect(r.s.exampleShown).toBe(FIXTURES.A.easierExample!.steps.length);}
   return r;}

  it('refuses the answer after a wrong shown column', () => {
   const r=setup('h3'); r.child('15.');
   const p={act:'give_answer',parts:[],reading:{answers:[{value:n(15),step:'ones',verdict:'wrong'}]}};
   expect(r.prop(p).refusal).not.toBeNull();
   const out=r.fb([p]); expect(out.act).toBe('close'); expect(out.text ?? '').not.toMatch(/\b66\b/); expect(r.s.assistance).not.toContain('answer_given');
  });

  it('does not count repeated operand lists as committed answers', () => {
   const r=setup('passed');
   for(let i=0;i<2;i++){r.child('27 39');const p={act:'give_answer',parts:[],reading:{answers:[{value:n(39),step:'result',verdict:'wrong'}]}};const direct=r.prop(p);expect(direct.refusal).not.toBeNull();const out=r.fb([p]);expect(out.text ?? '').not.toMatch(/\b66\b/);}
   expect(r.s.finalMisses).toBe(0);
  });

  it.each(["A", "B", "C"] as const)("does not release the %s answer on model, retained and fallback paths", (id) => {
   const pkg = FIXTURES[id];
   const answer = pkg.answer!.value;
   expect(answer.type).toBe("number");
   for (const turn of ["Help.", "I'm stuck.", "Is it 15?", "Maybe 15.", "You said 15.", "15.", "27 39"]) {
    for (const mode of ["model", "kept", "fallback"] as const) {
     const r = rig(pkg); r.child(turn);
     const proposal = { act: "give_answer", parts: [], reading: { answers: [{ value: n(15), step: "result", verdict: "wrong" }] } };
     const rejected = r.prop(proposal); expect(rejected.refusal).not.toBeNull();
     const out = r.fb(mode === "fallback" ? [] : [proposal]);
     expect(out.act).not.toBe("give_answer");
     expect(out.act).not.toBe("DEAD");
     const text = out.text ?? "";
     expect(valuesIn(text).some((v) => v.type === "number" && answer.type === "number" && v.value === answer.value)).toBe(false);
    }
   }
  });

  it('closes after two committed final misses without the answer', () => {
   const r=setup('done');
   for(const value of [56,65]) {
    r.child(`${value}.`);
    const p={act:'give_answer',parts:[],reading:{answers:[{value:n(value),step:'result',verdict:'wrong'}]}};
    expect(r.prop(p).refusal).not.toBeNull();
    const out=r.fb([p]);
    expect(out.act).toBe(value===65 ? 'close' : 'guide');
    expect(out.text ?? '').not.toMatch(/\b66\b/);
   }
   expect(r.s.finalMisses).toBe(2);
   expect(r.s.outcome?.reason).toBe('maya_closed');
   expect(r.s.assistance).not.toContain('answer_given');
  });

  it("does not expose give_answer to the model schema", () => {
   expect(PROPOSAL_SCHEMA.properties.act.enum).not.toContain("give_answer");
  });

  it.each(["A", "B", "C"] as const)("keeps the %s answer private in the closing minute", (id) => {
   const pkg=FIXTURES[id]; const answer=pkg.answer!.value; const r=rig(pkg);
   r.send({type:"tick",at:542000}); r.child("I'm stuck.");
   const p={act:"give_answer",parts:[],reading:{answers:[{value:n(15),step:"result",verdict:"wrong"}]}};
   expect(r.prop(p).refusal).not.toBeNull();
   const out=r.fb([p]); expect(out.act).not.toBe("DEAD");
   expect(valuesIn(out.text ?? "").some(v => v.type === "number" && answer.type === "number" && v.value === answer.value)).toBe(false);
  });

  it('uses only close.stuck when the expression contains the answer', async () => {
   const { workedSteps, checkQuestionPackage } = await import('@/lib/question-package');
   const operation={kind:'add' as const, operands:[3,0] as [number,number]};
   const easier={kind:'add' as const, operands:[1,0] as [number,number]};
   const pkg={...FIXTURES.A,text:'3 + 0 = ?',operation,steps:workedSteps(operation),wrongAnswers:[{value:n(4) as {type:'number';value:number},cause:'O3',description:'Wrong sum',step:null}],answer:{value:n(3) as {type:'number';value:number},accepted:[],unit:null},easierExample:{text:'1 + 0 = ?',operation:easier,answer:n(1) as {type:'number';value:number},steps:workedSteps(easier)}};
   expect(checkQuestionPackage(pkg), JSON.stringify(checkQuestionPackage(pkg))).toMatchObject({ok:true});
   const r=rig(pkg); r.send({type:'tick',at:542000}); r.child("I'm stuck.");
   const out=r.fb(); expect(out.act).toBe('close');
   expect(out.proposal?.parts.map((p)=>('line' in p ? p.line : undefined))).toEqual(['close.stuck']);
   expect(out.text ?? '').not.toMatch(/\b3\b/);
  });

  it('uses both approved close lines when the expression does not contain the answer', () => {
   const r=setup('done');
   for(const value of [56,65]) {
    r.child(`${value}.`);
    const p={act:'give_answer',parts:[],reading:{answers:[{value:n(value),step:'result',verdict:'wrong'}]}};
    r.prop(p); const out=r.fb([p]);
    if(value===65) expect(out.proposal?.parts.map((part)=>('line' in part ? part.line : undefined))).toEqual(['close.stuck','close.together']);
   }
  });

  it('requires both honest close lines in the closing minute after work', () => {
   const r=setup('done');
   r.send({type:'tick',at:542000}); r.child("I'm stuck.");
   const alone={act:'close',parts:[{line:'close.stuck'}]};
   expect(r.prop(alone).refusal).not.toBeNull();
   expect(r.prop({act:'close',parts:[{line:'close.stuck'},{line:'close.together'}]}).refusal).toBeNull();
  });

  it.each([
   ['add',3,0,1,0], ['subtract',2,1,1,1], ['multiply',6,1,2,1],
   ['add',0,1,0,0], ['multiply',9,4,2,2], ['add',7,7,2,2],
  ] as const)('does not offer a final-answer show for %s %i %i', async (kind,a,b,x,y) => {
   const { workedSteps, checkQuestionPackage } = await import('@/lib/question-package');
   const operation={kind,operands:[a,b] as [number,number]};
   const easier={kind,operands:[x,y] as [number,number]};
   const calculate=(k:string,u:number,v:number)=> k==='add'?u+v:k==='subtract'?u-v:u*v;
   const answer=calculate(kind,a,b); const easyAnswer=calculate(kind,x,y);
   const pkg={...FIXTURES.A,text:`${a} ? ${b}`,operation,steps:workedSteps(operation),answer:{value:n(answer) as {type:'number';value:number},accepted:[],unit:null},wrongAnswers:[{value:n(answer+2) as {type:'number';value:number},cause:'O3',description:'Wrong result',step:null}],easierExample:{text:`${x} ? ${y}`,operation:easier,answer:n(easyAnswer) as {type:'number';value:number},steps:workedSteps(easier)}};
   expect(checkQuestionPackage(pkg),JSON.stringify(checkQuestionPackage(pkg))).toMatchObject({ok:true});
   const r=rig(pkg); const id=pkg.steps[0].id; r.child('Show me.');
   expect(lineOffers(r.s).guide?.some(o=>o.line==='step.show' && o.slots.step===id) ?? false).toBe(false);
   expect(drawOffers(r.s).guide?.some(o=>o.id==='line.step.show') ?? false).toBe(false);
   for (const draw of [undefined,[{offer:'line.step.show'}]]) {
     expect(r.prop({act:'guide',step:id,level:3,parts:[{line:'step.show',slots:{step:id}}],reading:{help:'show'},...(draw?{draw}:{})}).refusal).not.toBeNull();
   }
   const out=r.fb(); expect(out.act).not.toBe('DEAD');
   expect(out.proposal?.parts.some(p=>'line' in p && p.line==='step.show')).toBe(false);
  });

  it('accepts the honest close for answer one in the closing minute', async () => {
   const { workedSteps } = await import('@/lib/question-package');
   const operation={kind:'subtract' as const,operands:[2,1] as [number,number]};
   const easier={kind:'subtract' as const,operands:[1,1] as [number,number]};
   const pkg={...FIXTURES.B,text:'2 - 1 = ?',operation,steps:workedSteps(operation),answer:{value:n(1) as {type:'number';value:number},accepted:[],unit:null},wrongAnswers:[{value:n(3) as {type:'number';value:number},cause:'O3',description:'Wrong difference',step:null}],easierExample:{text:'1 - 1 = ?',operation:easier,answer:n(0) as {type:'number';value:number},steps:workedSteps(easier)}};
   const r=rig(pkg,2); r.send({type:'tick',at:542000}); r.child('I am stuck.');
   const out=r.fb(); expect(out.act).toBe('close'); expect(out.proposal?.parts.map(p=>'line' in p && p.line)).toEqual(['close.stuck']);
   expect(r.s.outcome?.reason).not.toBe('technical_issue');
  });

  it('still offers the non-final ones show for 27 + 39', () => {
   const r=rig(); r.child('Show me.');
   expect(lineOffers(r.s).guide?.some(o=>o.line==='step.show' && o.slots.step==='ones')).toBe(true);
   r.show('ones');
  });

  it('refuses a math slot that equals the answer', async () => {
   const { workedSteps } = await import('@/lib/question-package');
   const operation = { kind: 'add' as const, operands: [3, 0] as [number, number] };
   const easier = { kind: 'add' as const, operands: [0, 0] as [number, number] };
   const pkg = { ...FIXTURES.A, operation, steps: workedSteps(operation), text: '3 + 0',
    answer: { value: { type: 'number' as const, value: 3 }, accepted: [], unit: null },
    wrongAnswers: [{ value: { type: 'number' as const, value: 4 }, cause: 'O3', description: 'Wrong sum', step: null }],
    easierExample: { text: '0 + 0', operation: easier, answer: { type: 'number' as const, value: 0 }, steps: workedSteps(easier) } };
   const r = rig(pkg); r.child('Help.');
   expect(r.prop({ act: 'guide', step: pkg.steps[0].id, level: 1, parts: [{ line: 'step.point', slots: { step: pkg.steps[0].id } }] }).refusal).toMatchObject({ code: 'reveals_answer' });
  });
});

// Calm tone, feelings, cheer-off, close, and template checks live in src/lib/maya/first-ship-practice-tone.test.ts.

describe("example collision", () => {
  it.each([
    { target: [52, 48], answer: 4, example: [4, 1], exampleAnswer: 3 },
    { target: [52, 28], answer: 24, example: [24, 7], exampleAnswer: 17 },
    { target: [52, 48], answer: 4, example: [52, 28], exampleAnswer: 24 },
  ])("closes safely when an example operand is the answer: $answer", async (c) => {
    const operation = { kind: "subtract" as const, operands: c.target as [number, number] };
    const easier = { kind: "subtract" as const, operands: c.example as [number, number] };
    const pkg = { ...FIXTURES.B, text: `${c.target[0]} - ${c.target[1]} = ?`, operation,
      answer: { value: { type: "number" as const, value: c.answer }, accepted: [], unit: null }, steps: workedSteps(operation),
      easierExample: { text: `${c.example[0]} - ${c.example[1]} = ?`, operation: easier,
        answer: { type: "number" as const, value: c.exampleAnswer }, steps: workedSteps(easier) } };
    expect(checkQuestionPackage(pkg).ok).toBe(true);
    let at = 1000;
    const session = createTextSession({ callId: "collision", package: pkg, grade: 2, clock: () => at,
      model: fakeMayaModel({ answer: () => { throw new Error("model unavailable"); } }) });
    await session.start();
    let output;
    for (let i = 0; i < 12; i++) {
      at += 4000;
      output = await session.child("I'm stuck.");
      if (output.ended) break;
    }
    expect(output?.ended?.reason).toBe("maya_closed");
    expect(output?.say.join(" ")).toContain("We worked on");
  });

  it.each(Object.entries(FIXTURES))("has a fallback for help sequences on fixture %s", async (_id, pkg) => {
    const help = ["I'm stuck.", "Help.", "Show me."];
    for (const first of help) for (const second of help) for (const third of help) {
      let at = 1000;
      const session = createTextSession({ callId: "help-invariant", package: pkg, grade: 2, clock: () => at,
        model: fakeMayaModel({ answer: () => { throw new Error("model unavailable"); } }) });
      let output = await session.start();
      const turns = [first, second, third];
      for (let i = 0; i < 20 && !output.ended; i++) {
        at += 4000;
        output = await session.child(turns[i] ?? "I'm stuck.");
      }
      expect(output.ended, turns.join(" / ")).not.toBeNull();
      expect(output.ended?.reason, turns.join(" / ")).not.toBe("technical_issue");
    }
  }, 30000);

  it("has a fallback when the model reads no start before an unsafe example", async () => {
    const operation = { kind: "subtract" as const, operands: [52, 48] as [number, number] };
    const easier = { kind: "subtract" as const, operands: [4, 1] as [number, number] };
    const pkg = { ...FIXTURES.B, text: "52 - 48 = ?", operation,
      answer: { value: { type: "number" as const, value: 4 }, accepted: [], unit: null }, steps: workedSteps(operation),
      easierExample: { text: "4 - 1 = ?", operation: easier, answer: { type: "number" as const, value: 3 }, steps: workedSteps(easier) } };
    let at = 1000;
    const model = fakeMayaModel({ answer: () => ({ version: 2, act: "example_step", parts: [], reading: { start: "no_start" } }) });
    const session = createTextSession({ callId: "collision-no-start", package: pkg, grade: 2, clock: () => at, model });
    await session.start(); at += 4000;
    const out = await session.child("I don't know how to start.");
    expect(out.ended?.reason).toBe("maya_closed");
    expect(out.say.join(" ")).toContain("We worked on");
  });

  it.each(["Help.", "Help!", "help me"])("escapes repeated bare %s requests with the model down", async (help) => {
    let at = 1000;
    const session = createTextSession({ callId: "bare-help", package: FIXTURES.A, grade: 2, clock: () => at,
      model: fakeMayaModel({ answer: () => { throw new Error("model unavailable"); } }) });
    let output = await session.start();
    for (let i = 0; i < 20 && !output.ended; i++) {
      at += 4000;
      output = await session.child(help);
    }
    expect(output.ended?.reason).toBe("maya_closed");
  });

  it.each([[2, 1], [12, 11]])("closes safely with answer 1 for %i - %i when the model is down", async (a, b) => {
    const operation = { kind: "subtract" as const, operands: [a, b] as [number, number] };
    const easier = { kind: "subtract" as const, operands: (a === 2 ? [1, 1] : [4, 2]) as [number, number] };
    const pkg = { ...FIXTURES.B, text: `${a} - ${b} = ?`, operation, steps: workedSteps(operation),
      answer: { value: { type: "number" as const, value: 1 }, accepted: [], unit: null },
      wrongAnswers: [{ value: { type: "number" as const, value: 3 }, cause: "O3" as const, description: "Wrong difference", step: null }],
      easierExample: { text: `${easier.operands[0]} - ${easier.operands[1]} = ?`, operation: easier, answer: { type: "number" as const, value: easier.operands[0] - easier.operands[1] }, steps: workedSteps(easier) } };
    expect(checkQuestionPackage(pkg), JSON.stringify(checkQuestionPackage(pkg))).toMatchObject({ ok: true });
    let at = 1000;
    const session = createTextSession({ callId: "answer-one", package: pkg, grade: 2, clock: () => at,
      model: fakeMayaModel({ answer: () => { throw new Error("model unavailable"); } }) });
    let output = await session.start();
    for (let i = 0; i < 20 && !output.ended; i++) { at += 4000; output = await session.child("I'm stuck."); }
    expect(output.ended?.reason).toBe("maya_closed");
    expect(output.say.join(" ")).toMatch(/stop/i);
  });

  it.each([[3, 0], [0, 1]])("advances on repeated help for %i + %i with the model down", async (a, b) => {
    const operation = { kind: "add" as const, operands: [a, b] as [number, number] };
    const easier = { kind: "add" as const, operands: [0, 0] as [number, number] };
    const pkg = { ...FIXTURES.A, text: `${a} + ${b}`, operation, steps: workedSteps(operation),
      answer: { value: { type: "number" as const, value: a + b }, accepted: [], unit: null },
      wrongAnswers: [{ value: { type: "number" as const, value: 9 }, cause: "O3", description: "Wrong sum", step: null }],
      easierExample: { text: "0 + 0", operation: easier, answer: { type: "number" as const, value: 0 }, steps: workedSteps(easier) } };
    expect(checkQuestionPackage(pkg), JSON.stringify(checkQuestionPackage(pkg))).toMatchObject({ ok: true });
    let at = 1000;
    const session = createTextSession({ callId: "help-zero", package: pkg, grade: 2, clock: () => at,
      model: fakeMayaModel({ answer: () => { throw new Error("offline"); } }) });
    let output = await session.start();
    for (let i = 0; i < 20 && !output.ended; i++) { at += 4000; output = await session.child("Help."); }
    expect(output.ended?.reason).toBe("maya_closed");
  });
});

describe("retained copy and safety close", () => {
  describe("#698 round 5 review regressions", () => {
    it("keeps a safe next step when a refused reading credits a copied H3 step", async () => {
      const model = scenarioModel();
      const raw = { version: 2, act: "guide", step: "tens", level: 0,
          parts: [{ line: "check.right_step", slots: { step: "ones" } }, { line: "step.invite", slots: { step: "tens" } }],
          reading: { answers: [{ value: { type: "number", value: 16 }, step: "ones", verdict: "right" }] } };
      let now = 1000;
      const session = createTextSession({ callId: "retained-copy", package: FIXTURES.A, model, clock: () => now, random: 1 });
      await session.start();
      model.next([{ act: "guide", step: "ones", level: 3, lines: ["step.show"] }], { help: "show" });
      now += 4000; await session.child("Show me the ones.");
      expect(session.session.ladder.hint).toBe(3);
      model.next([{ throws: true }], undefined);
      now += 4000; await session.child("Um.");
      model.next([{ raw, repair: { throws: true } }], undefined);
      now += 4000;
      const output = await session.child("I get 16 for the ones.");
      expect(output.ended?.reason).not.toBe("technical_issue");
      expect(session.session.passed).toContain("ones");
      expect(session.session.done).not.toContain("ones");
      expect(output.say.join(" ")).not.toContain("66");
    });

    it.each([false, true])("closes after safety guidance without model or bank words, free talk %s", async (freeTalk) => {
      const model = fakeMayaModel({ answer(_input, n) {
        if (n === 0) return { version: 2, act: "open", parts: [{ line: "open.hello" }] };
        if (n === 1) return { version: 2, act: "safety", parts: [], reading: { safety: "concern" } };
        return { version: 2, act: "close", parts: [{ warm: "smalltalk", pick: PHRASES.smalltalk.indexOf("Let's save the stories for later.") + 1 }] };
      } });
      const session = createTextSession({ callId: "safety-close", package: FIXTURES.A, model, clock: () => 1000, random: 1, freeTalk });
      await session.start();
      const output = await session.child("Someone at home hits me. Don't tell.");
      expect(output.ended).toMatchObject({ reason: "safety", safetyFlag: true });
      expect(output.say).toEqual([SAFETY_GUIDANCE.concern]);
    });
  });
});
