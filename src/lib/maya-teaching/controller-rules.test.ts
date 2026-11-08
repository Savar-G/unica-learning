import { describe, expect, it } from "vitest";
import { heldReason } from "@/lib/maya";
import { memoryTraceStore, runBehaviour, scenarioModel, type Plan, type Read } from "@/lib/maya-gate/gate";
import { ONE_STEP_BEHAVIOURS } from "@/lib/maya-gate/one-step-cases";
import { createTextSession } from "@/lib/maya-text";
import type { QuestionPackage } from "@/lib/question-package";
import { teachingPackage } from "./index";
import { givesAway } from "./examples";
import { addsThousandChain, bareSum, boxesThenSells, eachHasStory, putsInEachStory, subtractFromTenThousand, thousandsSum } from "./samples";

// The Maya lane's controller rules (wave-a-brief, 2026-11-07), for what the adapter adds.
const teach = (stored: QuestionPackage) => teachingPackage(stored) as QuestionPackage;

describe("rule 1: an easier example of the question's own shape, which Maya can teach", () => {
  it.each([
    ["10000 − 3615", subtractFromTenThousand("Leo", "stickers", [3, 6, 1, 4]), "10 − 3 = ?"],
    ["284 × 7", eachHasStory("crate", 284, "apples", "Nora", 7), "28 × 7 = ?"],
    ["4 × 6 (two single digits)", putsInEachStory("Theo", 4, "shells", "box", "boxes", 6), "3 × 6 = ?"],
    // 1600 + 300 = 1900 would give 19000 away (review of #724): a changed digit instead.
    ["16000 + 3000", thousandsSum(16200, 3900), "1500 + 300 = ?"],
    ["352418 + 41275", bareSum(352418, 41275), "35241 + 4127 = ?"],
  ])("%s", (_, stored, example) => {
    const made = teach(stored);
    expect(made.easierExample?.text).toBe(example);
    expect(made.easierExample?.operation.kind).toBe(made.operation?.kind);
    expect(heldReason(made)).toBeNull();
  });

  // Review of #724 (P2): taking a place off round numbers keeps the answer's digits, a giveaway.
  it.each([
    ["17000 + 3000 (a story)", thousandsSum(17700, 12800, { name: "Rui", things: "tickets" }), 20000, "1700 + 300", "1600 + 300 = ?"],
    ["18000 + 2000", thousandsSum(18500, 6700), 20000, "1800 + 200", "1700 + 200 = ?"],
    ["352410 + 41270", bareSum(352410, 41270), 393680, "35241 + 4127", "35242 + 4127 = ?"],
    ["16000 + 3000", thousandsSum(16200, 3900), 19000, "1600 + 300", "1500 + 300 = ?"],
  ])("%s: no example whose answer's digits begin the answer", (_, stored, answer, refused, example) => {
    const made = teach(stored);
    expect(made.answer?.value).toEqual({ type: "number", value: answer });
    expect(made.easierExample?.text).toBe(example);
    expect(made.easierExample?.text).not.toBe(`${refused} = ?`);
    expect(givesAway(made.answer!.value, made.easierExample!.answer)).toBe(false);
    expect(heldReason(made)).toBeNull();
  });

  it("refuses an answer's leading digits and its tenfold, and only those", () => {
    const n = (value: number) => ({ type: "number" as const, value });
    expect(givesAway(n(20000), n(2000))).toBe(true);
    expect(givesAway(n(393680), n(39368))).toBe(true);
    expect(givesAway(n(880), n(88))).toBe(true);
    expect(givesAway(n(6385), n(63))).toBe(true);
    expect(givesAway(n(20000), n(1900))).toBe(false);
    expect(givesAway(n(6385), n(7))).toBe(false);
    expect(givesAway(n(1988), n(196))).toBe(false);
  });

  it("gives a multi-step story an example of the same expression shape", () => {
    // "4 × 23 − 46" = 46 would give 460 away: its first number changed instead.
    expect(teach(boxesThenSells("Mo", 4, 236, "beads")).easierExample?.operation).toEqual({ kind: "evaluate", operands: ["3 × 23 − 46"] });
    // Evaluate (A2) holds a part above its one-step limits (73562 + 1000), so the adapter keeps the printed package.
    const chain = addsThousandChain(73562);
    expect(teach(chain)).toEqual(chain);
  });

  it("holds a question when no example of its shape passes, rather than teach a smaller example of another shape", () => {
    // 1 × 1: no smaller example of the same shape exists.
    const stored = putsInEachStory("Theo", 1, "shells", "box", "boxes", 1);
    expect(teach(stored).operation).toBeNull();
    expect(heldReason(teach(stored))).not.toBeNull();
  });
});

describe("rule 2: the new place words block a step confirm, as the one-word places do", () => {
  // 352418 + 41275: the ones, tens, hundreds and thousands done, so the ten thousands (5 + 4 = 9) is the step.
  const pkg = teach(bareSum(352418, 41275));
  const before: { child: string; read: Read }[] = [
    { child: "8 plus 5 is 13.", read: { start: "has_work", answers: [[13, "ones", "right"]] } as Read },
    { child: "1 plus 7 plus 1 is 9.", read: { answers: [[9, "tens", "right"]] } as Read },
    { child: "4 plus 2 is 6.", read: { answers: [[6, "hundreds", "right"]] } as Read },
    { child: "2 plus 1 is 3.", read: { answers: [[3, "thousands", "right"]] } as Read },
  ];
  const CREDIT: Plan = { act: "guide", step: "hundred thousands", level: 0, lines: ["check.right_step", "step.invite"], repair: { throws: true } };

  async function play(turns: { child: string; read?: Read; maya?: Plan[] }[]) {
    let now = 1000;
    const model = scenarioModel();
    const session = createTextSession({ callId: "places-confirm", package: pkg, model, clock: () => now, random: 7 });
    await session.start();
    const all: { child: string; read?: Read; maya?: Plan[] }[] = [...before, ...turns];
    for (const turn of all) {
      now += 4000;
      model.next(turn.maya ?? [], turn.read);
      await session.child(turn.child);
    }
    const trace = JSON.parse(JSON.stringify(session.trace())) as { turns: { kind: string; output?: { act: string; say: string[] }; attempts?: { proposal?: { parts?: { line?: string }[] } }[] }[] };
    return trace.turns.filter((t) => t.kind === "maya" && t.output).map((t) => ({
      act: t.output!.act, say: t.output!.say.join(" "), lines: (t.attempts!.at(-1)!.proposal?.parts ?? []).flatMap((x) => (x.line ? [x.line] : [])),
    }));
  }

  it.each(["9 ten thousands.", "9 in the ten thousands.", "Nine ten thousands.", "I got 9 ten thousands.", "9 for the ten thousands."])("%j: no confirm, and no credit after a yes", async (text) => {
    for (const first of [
      { child: text, read: { answers: [[9, "ten thousands", "right"]] } as Read, maya: [CREDIT] },
      { child: text, maya: [{ act: "confirm" as const, heard: "9", repair: { throws: true } }] },
      { child: text },
    ]) {
      const told = await play([first, { child: "Yes.", read: { answers: [[9, "ten thousands", "right"]] }, maya: [CREDIT] }]);
      expect(told).toHaveLength(7);
      expect(told[5].act, text).not.toBe("confirm");
      expect(told[5].lines).not.toContain("check.right_step");
      expect(told[6].lines).not.toContain("check.right_step");
      expect(told[6].say).not.toMatch(/5 \+ 4 = 9/);
    }
  });

  it("the bare total still gets the step's confirm path, as before: '9.' is heard as the column's total", async () => {
    const told = await play([{ child: "9.", read: { answers: [[9, "ten thousands", "right"]] }, maya: [CREDIT] }]);
    expect(told[5].lines).toContain("check.right_step");
  });
});

describe("J06 (#698 practice): a right step is acknowledged, not asked again; a question about the step is answered", () => {
  async function told(id: string) {
    const b = ONE_STEP_BEHAVIOURS.find((x) => x.id === id)!;
    const store = memoryTraceStore();
    await runBehaviour(b, store);
    const trace = JSON.parse(store.load(id)!) as { turns: { kind: string; text?: string; output?: { act: string; say: string[] }; attempts?: { proposal?: { step?: string; parts?: { line?: string }[] } }[] }[] };
    return trace.turns.flatMap((t, i, all) => (t.kind === "maya" && t.output ? [{ after: [...all.slice(0, i)].reverse().find((x) => x.kind === "child")?.text ?? null, act: t.output.act, say: t.output.say.join(" "), step: t.attempts!.at(-1)!.proposal?.step ?? null, lines: (t.attempts!.at(-1)!.proposal?.parts ?? []).flatMap((p) => (p.line ? [p.line] : [])) }] : []));
  }

  it("W6b: the ones said early in the child's own words is acknowledged once, then never asked again", async () => {
    const turns = await told("W6b");
    const ack = turns.findIndex((t) => t.after === "I wrote 3 and carried 1.");
    expect(turns[ack].lines).toEqual(["check.right_step", "step.invite"]);
    expect(turns[ack].say).toMatch(/8 \+ 5 = 13/);
    expect(turns.slice(ack + 1).filter((t) => t.step === "ones")).toEqual([]);
    expect(turns.slice(ack + 1).filter((t) => /the ones/.test(t.say))).toEqual([]);
  });

  it.each([
    ["W6c", "Why does the 1 go to the tens?", "tens", /1 ten goes to the tens/],
    ["W5d", "Why do I have to regroup?", "ones", /make it 10 ones/],
  ])("%s: %j gets a code-written answer on the current step, before going on", async (id, question, step, answer) => {
    const turns = await told(id);
    const reply = turns.find((t) => t.after === question)!;
    expect(reply).toMatchObject({ act: "guide", step, lines: ["step.regroup"] });
    expect(reply.say).toMatch(answer);
  });
});
