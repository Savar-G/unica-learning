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

  // Review round 1 of 29e2b327: the fallback credits only one exact sentence. Words it cannot prove get the same help as on
  // 68eb43d4, with no "That's it" for them.
  it.each([
    "7 plus 9 is 16.", "9 plus 7 is 16.", "So 7 plus 9 is 16.", "Okay, 7 plus 9 is 16.", "Okay. 7 plus 9 is 16.", "7 plus 9 equals 16.", "7 plus 9 makes 16.", "seven plus nine is sixteen.",
  ])("hears the step's own sum: %s", async (text) => {
    const { told } = await play("A", [down(text)]);
    expect(told[1]).toMatchObject({ act: "guide", step: "tens", lines: ["check.right_step", "step.invite"] });
  });

  it.each([
    "7 is 16.", "9 and 16.", "My mom said 7 plus 9 is 16.", "I think 7 plus 9 is 16.", "Maybe 7 plus 9 is 16.", "I guess 7 plus 9 is 16.", "7 plus 9 is 16?", "16.", "It's 16.",
    "7 and 9 is 16.", "7 plus 9 plus 1 is 16.", "7 plus 7 is 16.", "7 plus 9 is not 16.", "7 plus 9 is 6.", "Mia says 7 plus 9 is 16.", "9 is 16.", "Then 7 plus 9 is 16.", "I know 7 plus 9 is 16.",
  ])("does not hear the ones in: %s", async (text) => {
    const { told } = await play("A", [down(text)]);
    expect(told[1].lines).not.toContain("check.right_step");
    expect(told[1].step ?? "ones").toBe("ones");
    expect(told[1].say).not.toMatch(/7 \+ 9 = 16/);
  });

  const afterOnes = (text: string) => play("A", [{ child: "7 plus 9 is 16.", read: { answers: [[16, "ones", "right"]] } }, down(text)]);
  it.each(["So 2 plus 3 plus 1 is 6.", "2 plus 3 plus 1 is 6.", "3 plus 2 plus 1 is 6."])("hears the tens with its carry: %s", async (text) => {
    const { told } = await afterOnes(text);
    expect(told[2]).toMatchObject({ act: "guide", step: "result", lines: ["check.right_step", "step.invite"] });
  });
  it.each(["3 is 6.", "2 and 6.", "1 and 6.", "2 plus 3 is 6.", "2 plus 3 is 5.", "1 plus 2 plus 3 is 6.", "2 plus 1 is 6.", "My mom said 2 plus 3 plus 1 is 6."])("does not hear the tens in: %s", async (text) => {
    const { told } = await afterOnes(text);
    expect(told[2].lines).not.toContain("check.right_step");
    expect(told[2].step).toBe("tens");
    expect(told[2].say).not.toMatch(/That's it|Yes|right/i);
  });

  it("treats the sum Maya just showed as a copy, the same as a lone number (H3)", async () => {
    const shown: Step = { child: "Show me the ones.", read: { help: "show" }, maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"] }] };
    for (const text of ["7 plus 9 is 16.", "16."]) {
      const { told } = await play("A", [shown, down(text)]);
      expect(told[2].lines).not.toContain("check.right_step");
      expect(told[2]).toMatchObject({ step: "ones" });
    }
  });

  // The same sentences when a model reading names them: code refuses the credit, whatever the model read.
  const named = (text: string, value: number, step: string, before: Step[] = []) => play("A", [...before, {
    child: text, read: { answers: [[value, step, "right"]] },
    maya: [{ act: "guide", step: step === "ones" ? "tens" : "result", level: 0, lines: ["check.right_step", "step.invite"], repair: { throws: true } }],
  }]);
  const ones: Step = { child: "7 plus 9 is 16.", read: { answers: [[16, "ones", "right"]] } };
  it.each([["7 is 16.", 16, "ones"], ["9 and 16.", 16, "ones"], ["My mom said 7 plus 9 is 16.", 16, "ones"], ["I think 7 plus 9 is 16.", 16, "ones"]] as const)("refuses a model's credit for: %s", async (text, value, step) => {
    const { told } = await named(text, value, step);
    expect(told[1].lines).not.toContain("check.right_step");
    expect(told[1].step ?? "ones").toBe("ones");
  });
  it.each([["3 is 6.", 6, "tens"], ["2 and 6.", 6, "tens"], ["1 and 6.", 6, "tens"], ["The 1 and 6.", 6, "tens"]] as const)("refuses a model's credit after the ones for: %s", async (text, value, step) => {
    const { told } = await named(text, value, step, [ones]);
    expect(told[2].lines).not.toContain("check.right_step");
    expect(told[2].step).toBe("tens");
  });
  it.each([["7 plus 9 is 16.", 16], ["9 plus 7 is 16.", 16], ["16.", 16], ["It's 16.", 16], ["6.", 6]] as const)("keeps a model's credit for: %s", async (text, value) => {
    const { told } = await named(text, value, "ones");
    expect(told[1]).toMatchObject({ act: "guide", step: "tens", lines: ["check.right_step", "step.invite"] });
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
