import { describe, expect, it } from "vitest";
import { createSession, step } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { type Behaviour, judge, memoryTraceStore, type Plan, type Read, runBehaviour, type Step } from "@/lib/maya-gate/gate";

const THROWS: Plan[] = [{ throws: true }];

const down = (text: string): Step => ({ child: text, maya: THROWS });

/** The child's turn, read by a model as the ones step right, and the model's next step; its repair call fails. */
const named = (text: string): Step => ({
  child: text, read: { answers: [[16, "ones", "right"]] },
  maya: [{ act: "guide", step: "tens", level: 0, lines: ["check.right_step", "step.invite"], repair: { throws: true } }],
});

const NEXT = { act: "guide", step: "tens", lines: ["check.right_step", "step.invite"] };

interface Told { act: string | undefined; step: string | undefined; lines: string[]; say: string }

async function play(steps: Step[]) {
  const b: Behaviour = { id: "sentence-commit", title: "sentence commit", fixture: "A", status: "passing", steps, expect: { outcome: {} } };
  const store = memoryTraceStore();
  await runBehaviour(b, store);
  const saved = store.load(b.id)!;
  const trace = JSON.parse(saved) as { turns: { kind: string; output?: { act: string; say: string[] }; attempts?: { proposal?: { act?: string; step?: string; parts?: { line?: string }[] } }[] }[] };
  const told: Told[] = trace.turns.filter((t) => t.kind === "maya" && t.output).map((t) => {
    const p = t.attempts!.at(-1)!.proposal ?? {};
    return { act: t.output!.act, step: p.step, lines: (p.parts ?? []).flatMap((x) => (x.line ? [x.line] : [])), say: t.output!.say.join(" ") };
  });
  const hard = judge(b, saved).failures.map((f) => `${f.code}: ${f.detail}`).filter((x) => /^(?:hint_skipped|answer_too_early|flow_mismatch)/.test(x));
  return { told, hard };
}

/** The probe of 2026-11-12: one child turn after the open, then a model's guide that names the ones right. */
function probe(text: string): string {
  let s = createSession({ callId: "probe", package: FIXTURES.A });
  let at = Date.UTC(2026, 10, 12, 16, 0, 0);
  s = step(s, { type: "start", at }).session;
  s = step(s, { type: "proposal", at, proposal: { version: 2, act: "open", parts: [{ line: "open.hello", slots: {} }, { line: "question.problem", slots: {} }] } as never }).session;
  at += 4000;
  s = step(s, { type: "child_turn", at, text }).session;
  const r = step(s, { type: "proposal", at, proposal: { version: 2, act: "guide", step: "tens", level: 0, parts: [{ line: "check.right_step", slots: { step: "ones" } }, { line: "step.invite", slots: { step: "tens" } }], reading: { answers: [{ value: { type: "number", value: 16 }, step: "ones", verdict: "right" }] } } as never });
  return r.refusal ? r.refusal.code : "credited";
}

const CREDITED = [
  "Like you showed me, I add the ones first. 7 + 9 is 16.",
  "I add the ones, 7 and 9, that's 16.",
  "Okay. I already got 16 for that.",
  "7 + 9 is 16.",
  "I add the ones first. 7 plus 9 is 16.",
  "I add 7 and 9. That's 16.",
  "Like I said, I start with the ones. I got 16.",
  "Like you showed me, it's 16.",
  "I added the ones first. 7 + 9 is 16.",
  "I added the ones. I got 16.",
];

describe("sentence-level commit: one committing sentence and harmless others", () => {
  it.each(CREDITED)("the probe credits %j", (text) => {
    expect(probe(text)).toBe("credited");
  });

  it.each(CREDITED)("credits the ones for %j on both paths", async (text) => {
    for (const first of [named(text), down(text)]) {
      const { told, hard } = await play([first]);
      expect([text, told[1]], JSON.stringify(told[1])).toMatchObject([text, NEXT]);
      expect(told[1].say).toContain("16");
      expect(hard).toEqual([]);
    }
  });
});

// Rule A (2026-11-12): these turns were refused by the allow-list; each states the ones as the child's own with no blocker
// (3 is the tens' own operand, the tens' 6 is right in order, the value said twice is still the child's own).
describe("rule A: turns the allow-list refused that the block-list credits", () => {
  it.each(["7 + 9 is 16. I add 3 first.", "7 + 9 is 16. The tens are 6.", "That's 16. I got 16."])("credits the ones for %j", async (text) => {
    expect(probe(text)).toBe("credited");
    for (const first of [named(text), down(text)]) expect((await play([first])).told[1].lines, text).toContain("check.right_step");
  });
});

describe("sentence-level commit: a trailing question about the value goes to the confirm question", () => {
  const ASKED = ["7 + 9 is 16. Is that right?", "I got 16. Is that right?", "7 plus 9 is 16. Am I right?", "I add the ones first. 7 + 9 is 16. Is that correct?"];

  it.each(ASKED)("the probe does not credit %j as is", (text) => {
    expect(probe(text)).toBe("answer_not_committed");
  });

  it.each(ASKED)("asks the step's confirm for %j on both paths, and a yes credits the ones", async (text) => {
    for (const first of [named(text), down(text)]) {
      const { told } = await play([first, down("Yes.")]);
      expect(told[1], text).toMatchObject({ act: "confirm" });
      expect(told[1].say).toContain("16");
      expect(told[1].lines).not.toContain("check.right_step");
      expect(told[2], text).toMatchObject(NEXT);
    }
  });
});

describe("sentence-level commit: a turn with any harmful sentence is not credited", () => {
  it.each([
    ["another person after", "7 + 9 is 16. My brother wrote it."],
    ["another person before", "My mom showed me. 7 + 9 is 16."],
    ["another person in a lead", "Like my teacher showed me, 7 + 9 is 16."],
    ["another person after a claim", "I add the ones, 7 and 9, that's 16. My mom told me."],
    ["another number as an operand", "I add the ones, 7 and 8, that's 16."],
    ["a hedge before", "I add the ones first. Maybe 7 + 9 is 16."],
    ["a hedge after", "7 + 9 is 16. I don't know."],
    ["another value offered", "7 + 9 is 16, or 17."],
    ["a question with another value", "7 + 9 is 16. Is it 17?"],
    ["the value only inside a question", "I add the ones first. Is it 16?"],
    ["a wrong value, then the right value", "7 + 9 is 15. 7 + 9 is 16."],
    ["a wrong claim, then the right claim", "That's 15. I already got 16 for that."],
    ["another column named", "I add the tens first. 7 + 9 is 16."],
    ["a negation", "I don't add the ones. 7 + 9 is 16."],
  ])("never credits %s: %j", async (_name, text) => {
    expect(probe(text)).not.toBe("credited");
    for (const first of [named(text), down(text)]) {
      const { told } = await play([first]);
      expect(told.slice(1).flatMap((x) => x.lines), text).not.toContain("check.right_step");
      expect(told[1].step, text).not.toBe("tens");
    }
  });
});

describe("sentence commit regressions", () => {
  const THROWS: Plan[] = [{ throws: true }];

  const down = (text: string): Step => ({ child: text, maya: THROWS });

  /** The child's turn, read by a model as this step right (its value), and the model's next step; its repair call fails. */
  const named = (text: string, value = 16, step = "ones"): Step => ({
    child: text, read: { answers: [[value, step, "right"]] },
    maya: [{ act: "guide", step: step === "ones" ? "tens" : "result", level: 0, lines: ["check.right_step", "step.invite"], repair: { throws: true } }],
  });

  const ONES = named("7 plus 9 is 16.");

  interface Told { act: string | undefined; step: string | undefined; lines: string[]; say: string }

  async function play(steps: Step[]) {
    const b: Behaviour = { id: "sentence-commit-review", title: "review", fixture: "A", status: "passing", steps, expect: { outcome: {} } };
    const store = memoryTraceStore();
    await runBehaviour(b, store);
    const trace = JSON.parse(store.load(b.id)!) as { turns: { kind: string; output?: { act: string; say: string[] }; attempts?: { proposal?: { step?: string; parts?: { line?: string }[] } }[] }[] };
    return trace.turns.filter((t) => t.kind === "maya" && t.output).map((t): Told => {
      const p = t.attempts!.at(-1)!.proposal ?? {};
      return { act: t.output!.act, step: p.step, lines: (p.parts ?? []).flatMap((x) => (x.line ? [x.line] : [])), say: t.output!.say.join(" ") };
    });
  }

  const rightLines = (told: Told[]) => told.flatMap((t) => t.lines).filter((l) => l === "check.right_step").length;

  describe("P1: each operand at most once in the whole turn", () => {
    it.each([
      ["I add 9. I add 9. That's 16.", "ones"], ["I add 7. I add 7. That's 16.", "ones"], ["Add 9, add 9. That's 16.", "ones"],
      ["I add 3. I add 3. That's 6.", "tens"], ["I add 2. I add 2. That's 6.", "tens"],
    ])("does not credit %j (%s)", async (text, step) => {
      const value = step === "ones" ? 16 : 6;
      const before = step === "ones" ? [] : [ONES];
      for (const first of [named(text, value, step), down(text)]) {
        const told = await play([...before, first]);
        expect(rightLines(told), text).toBe(before.length);
        expect(told.at(-1)!.step ?? step, text).toBe(step);
      }
    });

    it("gives no confirm whose yes credits for 'I add 9. I add 9. That's 16. Is that right?'", async () => {
      for (const first of [named("I add 9. I add 9. That's 16. Is that right?"), down("I add 9. I add 9. That's 16. Is that right?")]) {
        const told = await play([first, down("Yes.")]);
        expect(told[1].act).not.toBe("confirm");
        expect(rightLines(told)).toBe(0);
      }
    });

    it("still credits each operand said once across clauses: 'I add 7. I add 9. That's 16.'", async () => {
      for (const first of [named("I add 7. I add 9. That's 16."), down("I add 7. I add 9. That's 16.")]) {
        expect((await play([first]))[1]).toMatchObject({ act: "guide", step: "tens", lines: ["check.right_step", "step.invite"] });
      }
    });
  });

  describe("P2: a request to Maya is not harmless", () => {
    it.each(["Show me. That's 16.", "You show me. 16.", "Now you add. 16.", "Show me the ones. That's 16.", "You add 7 and 9. That's 16.",
      "Then you add 9. 16.", "Okay, you start. 16.", "I add 7 and 9. That's 16. Show me.", "7 and 9. You add. That's 16.", "Can you check? 7 + 9 is 16.",
      "7 + 9 is 16. Can you check?", "Now show me. That's 16.",
      // Re-check of 6965a1dd: a lead word does not turn a request into narration.
      "Then show me. 16.", "Then show me. That's 16.", "So show me. That's 16.", "So, show me. 16.", "And show me. 16.", "First show me. 16.",
      "7 and 9, then show me. 16.", "I add 7 and 9. Then show me. 16.", "So add. 16."])("does not credit %j", async (text) => {
      for (const first of [named(text), down(text)]) {
        const told = await play([first]);
        expect(rightLines(told), text).toBe(0);
        expect(told[1].step ?? "ones", text).toBe("ones");
      }
    });

    // Re-review (2026-11-12): only a bare present imperative at the start of a clause, or "you" before a verb, is a request.
    // A past or -ing form, or a verb after "then", is the child's own description.
    it.each(["Added 7 and 9. That's 16.", "I add 7, then add 9. That's 16.", "First I add 7, then add 9, that's 16.", "I added 7, then added 9, so 16.",
      "Adding 7 and 9, I got 16.", "Started with 7. That's 16.", "You taught me this. 16.",
      "And then add 9. That's 16.", "I add 7, then add the ones. That's 16.", "I add 9, then start with 7. That's 16."])("credits the ones for %j", async (text) => {
      for (const first of [named(text), down(text)]) {
        expect((await play([first]))[1], text).toMatchObject({ act: "guide", step: "tens", lines: ["check.right_step", "step.invite"] });
      }
    });

    it("still credits 'Like you showed me, I add the ones first. 7 + 9 is 16.'", async () => {
      const text = "Like you showed me, I add the ones first. 7 + 9 is 16.";
      for (const first of [named(text), down(text)]) {
        expect((await play([first]))[1]).toMatchObject({ act: "guide", step: "tens", lines: ["check.right_step", "step.invite"] });
      }
    });
  });

  describe("P3: no step confirm for a step Maya showed", () => {
    const SHOW: Step = { child: "Show me the ones.", read: { help: "show" }, maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"] }] };
    // The ones shown at H3, then the easier example (way out) and the new try, on code's fallback: the ladder is below H3.
    const AFTER_EXAMPLE: Step[] = [SHOW, down("Um."), down("Okay.")];
    const read: Read = { answers: [[16, "ones", "right"]] };
    it.each(["Is it 16?", "7 + 9 is 16. Is that right?"])("asks no confirm for %j after the show and the example", async (text) => {
      const before = await play(AFTER_EXAMPLE);
      const told = await play([...AFTER_EXAMPLE, { child: text, read, maya: [{ act: "confirm", heard: "16", repair: { throws: true } }] }, down("Yes.")]);
      expect(told[before.length].act, JSON.stringify(told[before.length])).not.toBe("confirm");
      expect(rightLines(told)).toBe(0);
    });
  });
});
