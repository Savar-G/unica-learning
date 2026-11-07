// The controller faults the first-ship paid practice run found (PR #698, traces first-ship-68eb43d4, D-298). Each script
// replays the run's child words on the scripted model; `{ throws: true }` is the run's 402: Maya's model gave no proposal.
import { describe, expect, it } from "vitest";
import { readAnswer, readOptionsFor } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { judge, memoryTraceStore, runBehaviour, type Behaviour, type Plan, type Read, type Step } from "@/lib/maya-gate/gate";
import type { OperationPackage } from "@/lib/question-package";

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
    ["16.", 16], ["16", 16], ["16!", 16], ["Okay, 16.", 16], ["So 16.", 16], ["Um, 16.", 16], ["sixteen", 16], ["6.", 6],
    ["7 plus 9 is 16.", 16], ["9 plus 7 is 16.", 16], ["So 7 plus 9 is 16.", 16], ["Okay, 7 plus 9 is 16.", 16], ["Okay. 7 plus 9 is 16.", 16],
    ["7 plus 9 equals 16.", 16], ["7 plus 9 makes 16.", 16], ["seven plus nine is sixteen.", 16], ["seven and nine make sixteen", 16], ["7 and 9 is 16.", 16], ["9 + 7 = 16", 16], ["9+7=16", 16],
    ["It's 16.", 16], ["I got 16.", 16], ["So it's 16.", 16], ["Oh, I got 16.", 16], ["Oh, 16.", 16], ["Oh, 7 plus 9 is 16.", 16], ["It's 6.", 6], ["I got 6.", 6],
    ["I wrote 6.", 6], ["I wrote 6 and carried 1.", 6], ["I put 6 in the ones.", 6], ["6, carry the 1", 6], ["Wrote 6.", 6], ["So I wrote 6.", 6],
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
    ["7 plus 9 is not 16.", 16], ["Then 7 plus 9 is 16.", 16], ["I know 7 plus 9 is 16.", 16], ["The ones make 16.", 16], ["It's 16. I got 16.", 16], ["It's 16, I think.", 16], ["I got 16 for the ones.", 16], ["My mom got 16.", 16], ["It's not 16.", 16], ["It is 16?", 16], ["I got 16?", 16], ["7 plus 9 is 16, so I write 6.", 16], ["I write 6 and carry 1 ten.", 6],
    ["16 and 3.", 16], ["I didn't write 6.", 6], ["I wrote 6. I think.", 6],
  ];
  it.each(NOT_HEARD_ONES)("does not hear the ones in %j, and goes to the confirm question when a model names it", async (text, value) => {
    const down1 = (await play("A", [down(text)])).told[1];
    expect(down1.lines).not.toContain("check.right_step");
    expect(down1.say).not.toMatch(/7 \+ 9 = 16/);
    expect(down1.step ?? "ones").toBe("ones");
    const model = (await play("A", [named(text, value, "ones")])).told[1];
    expect(model.lines).not.toContain("check.right_step");
    expect(model.say).not.toMatch(/7 \+ 9 = 16/);
    expect(model.act).toBe("confirm");
  });

  // Another expression is outside the question: scope answers it (redirect.workbook), and the ones get no credit.
  it.each(["7 times 9 is 16.", "7 times 9 is 16", "7 plus 9 plus 1 is 16.", "7 plus 7 is 16.", "16 is 66."])("never credits the ones for another sum: %j", async (text) => {
    for (const step of [down(text), named(text, 16, "ones")]) {
      const told = (await play("A", [step])).told[1];
      expect(told.lines).not.toContain("check.right_step");
      expect(told.say).not.toMatch(/7 \+ 9 = 16/);
    }
  });

  const HEARD_TENS: [string, number][] = [["So 2 plus 3 plus 1 is 6.", 6], ["2 plus 3 plus 1 is 6.", 6], ["3 plus 2 plus 1 is 6.", 6], ["1 plus 2 plus 3 is 6.", 6], ["two and three and one make six", 6], ["6.", 6], ["I wrote 6.", 6]];
  it.each(HEARD_TENS)("hears the tens in %j on both paths", async (text, value) => {
    expect((await play("A", [ones, down(text)])).told[2]).toMatchObject({ ...NEXT, step: "result" });
    expect((await play("A", [ones, named(text, value, "tens")])).told[2]).toMatchObject({ ...NEXT, step: "result" });
  });

  const NOT_HEARD_TENS: [string, number][] = [
    ["3 plus 2 plus 1 is 6. My mom said.", 6], ["3 is 6.", 6], ["2 and 6.", 6], ["1 and 6.", 6], ["The 1 and 6.", 6], ["2 plus 3 is 6.", 6], ["2 plus 1 is 6.", 6], ["My mom said 2 plus 3 plus 1 is 6.", 6],
  ];
  it.each(NOT_HEARD_TENS)("does not hear the tens in %j", async (text, value) => {
    const down1 = (await play("A", [ones, down(text)])).told[2];
    expect(down1.lines).not.toContain("check.right_step");
    expect(down1.step).toBe("tens");
    const model = (await play("A", [ones, named(text, value, "tens")])).told[2];
    expect(model.lines).not.toContain("check.right_step");
    expect(model.act).toBe("confirm");
  });

  it.each([["7 plus 9 is 16.", 16], ["9 + 7 = 16", 16], ["16.", 16], ["6.", 6]] as const)("treats %j after H3 as a copy on both paths", async (text, value) => {
    for (const step of [down(text), named(text, value, "ones")]) {
      const told = (await play("A", [shown, step])).told[2];
      expect(told.lines).not.toContain("check.right_step");
      expect(told.step ?? "ones").toBe("ones");
    }
  });

  // A plain yes to Maya's own "Did you say 16?" (decision after review of 27a0ea5b), as the final answer's confirm (P11b).
  const asked16: Step = { child: "My mom said 7 plus 9 is 16.", read: { answers: [[16, "ones", "right"]] }, maya: [{ act: "confirm", heard: "16", repair: { throws: true } }] };
  const asked6: Step = { child: "My mom wrote 6.", read: { answers: [[6, "ones", "right"]] }, maya: [{ act: "guide", step: "tens", level: 0, lines: ["check.right_step", "step.invite"], repair: { throws: true } }] };
  const nextAfterYes = (text: string, value: number): Step => named(text, value, "ones");

  it("asks with the number it will credit", async () => {
    expect((await play("A", [asked16])).told[1]).toMatchObject({ act: "confirm", lines: ["confirm.heard"] });
    expect((await play("A", [asked16])).told[1].say).toContain("16");
    expect((await play("A", [asked6])).told[1].say).toContain("6");
  });

  it.each([["Yes.", 16], ["yes", 16], ["Yeah.", 16], ["yep", 16], ["Yes 16", 16], ["Yes, 16.", 16], ["Yes it's 16.", 16], ["Yes, it's 16", 16]] as const)("credits %j after 'Did you say 16?' on both paths", async (text, value) => {
    expect((await play("A", [asked16, down(text)])).told[2]).toMatchObject({ ...NEXT, step: "tens" });
    expect((await play("A", [asked16, nextAfterYes(text, value)])).told[2]).toMatchObject({ ...NEXT, step: "tens" });
  });

  it("credits a plain yes when the model reads no number in it", async () => {
    const { told } = await play("A", [asked16, { child: "Yes.", maya: [{ act: "guide", step: "tens", level: 0, lines: ["check.right_step", "step.invite"] }] }]);
    expect(told[2]).toMatchObject({ ...NEXT, step: "tens" });
  });

  it("credits a plain yes after an other-speaker turn: the child now owns the number", async () => {
    expect((await play("A", [asked6, down("Yes.")])).told[2]).toMatchObject({ ...NEXT, step: "tens" });
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

  it("confirms a turn whose carry is not the question's, with no 'Yes' for it", async () => {
    for (const text of ["I carry 6. It's 66.", "I carried 7. It's 66."]) {
      const { told } = await play("A", [down(text)]);
      expect(told[1]).toMatchObject({ act: "confirm", lines: ["confirm.heard"] });
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

  it("gives the answer only straight after H3, with no hint skipped (C04-r1)", async () => {
    const { told, hard } = await play("A", C04.map(down));
    expect(hard).toEqual([]);
    const at = told.findIndex((t) => t.act === "give_answer");
    expect(at).toBeGreaterThan(0);
    expect(told.slice(0, at).filter((t) => t.act === "guide").at(-1)!.level).toBe(3);
  });

  it("does not step back to a lower check once the step was shown", async () => {
    const { told } = await play("A", [
      { child: "Show me the ones.", read: { help: "show" }, maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"] }] },
      down("Is it 66?"), down("Yes, I said 66. I just guessed it."),
    ]);
    expect(told.at(-1)).toMatchObject({ act: "guide", step: "ones", level: 3 });
    expect(told.at(-1)!.lines).not.toContain("check.guess");
  });

  it("says no question about a step in the turn that gives the answer", async () => {
    const { told } = await play("A", C04.map(down));
    const given = told.find((t) => t.act === "give_answer")!;
    expect(given.lines).toEqual([]);
  });
});
