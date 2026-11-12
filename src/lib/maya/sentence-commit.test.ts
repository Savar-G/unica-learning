// Sentence-level commit rule for an addition column (2026-11-12, approved by Savar). Real children talk in several
// sentences: a turn commits the step's value when ONE sentence or clause of it is a committing template (the value, the
// step's own sum, a first-person claim such as "that's 16" or "I already got 16 for that", or a checked written-digit
// claim) and every other sentence is harmless: no other number than the step's own operands, no other person, no question
// about the value, no hedge. A trailing question about the value ("Is that right?") goes to the step's confirm question.
// The model's reading and code's fallback use the one check (stepTurnHeard), so they cannot disagree. FIXTURES.A is 27 + 39.
import { describe, expect, it } from "vitest";
import { createSession, step } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { judge, memoryTraceStore, runBehaviour, type Behaviour, type Plan, type Step } from "@/lib/maya-gate/gate";

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
    ["another number in a sentence", "7 + 9 is 16. I add 3 first."],
    ["another column's value", "7 + 9 is 16. The tens are 6."],
    ["a hedge before", "I add the ones first. Maybe 7 + 9 is 16."],
    ["a hedge after", "7 + 9 is 16. I don't know."],
    ["another value offered", "7 + 9 is 16, or 17."],
    ["a question with another value", "7 + 9 is 16. Is it 17?"],
    ["the value only inside a question", "I add the ones first. Is it 16?"],
    ["a wrong value, then the right value", "7 + 9 is 15. 7 + 9 is 16."],
    ["a wrong claim, then the right claim", "That's 15. I already got 16 for that."],
    ["another column named", "I add the tens first. 7 + 9 is 16."],
    ["a negation", "I don't add the ones. 7 + 9 is 16."],
    ["the value twice", "That's 16. I got 16."],
  ])("never credits %s: %j", async (_name, text) => {
    expect(probe(text)).not.toBe("credited");
    for (const first of [named(text), down(text)]) {
      const { told } = await play([first]);
      expect(told.slice(1).flatMap((x) => x.lines), text).not.toContain("check.right_step");
      expect(told[1].step, text).not.toBe("tens");
    }
  });
});
