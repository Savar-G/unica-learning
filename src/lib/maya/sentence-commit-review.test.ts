// Review of the sentence-level commit rule (a8cbd7e1..46b61ba1, 2026-11-12). P1: an operand said again in another clause
// is no harmless description ("I add 9. I add 9. That's 16." describes 9 + 9). P2: a request to Maya ("Show me.", "Now you
// add.") is no harmless clause, so the turn is not credited and the request is not ignored. P3: Maya never asks a step's
// confirm for a step she showed (shownStep), because the yes to it cannot credit. FIXTURES.A is 27 + 39.
import { describe, expect, it } from "vitest";
import { memoryTraceStore, runBehaviour, type Behaviour, type Plan, type Read, type Step } from "@/lib/maya-gate/gate";

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
  it.each(["Show me. That's 16.", "You show me. 16.", "Now you add. 16.", "Show me the ones. That's 16.", "You add 7 and 9. That's 16."])("does not credit %j", async (text) => {
    for (const first of [named(text), down(text)]) {
      const told = await play([first]);
      expect(rightLines(told), text).toBe(0);
      expect(told[1].step ?? "ones", text).toBe("ones");
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
