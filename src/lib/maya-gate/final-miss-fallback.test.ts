import { describe, expect, it, vi } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { FIXTURES } from "./fixtures";
import { scenarioModel } from "./gate";

vi.mock("server-only", () => ({}));

const cases = [
  ["PT_LONG", ["115 minus 35 is 80."], "It's 5.", false],
  ["SPOT_MUL", ["7 times 640 is 4480."], "It's yes.", false],
  ["EV_TWO", ["7 times 640 is 4480.", "7 times 30 is 210.", "0", "9", "6", "4"], "It's 5.", true],
  ["M_TRY", ["236 times 6 is 1416."], "It's 5.", true],
  ["CLAIM_TF", ["6 times 8 is 48."], "It's false.", true],
  ["PVC", ["8", "4", "8 is bigger."], "It's false.", false],
  ["AREA_TF", ["6 times 3 is 18."], "It's false.", true],
] as const;

describe("committed final misses with the model down", () => {
  it.each(cases)("%s counts two misses and follows its answer policy", async (id, work, wrong, gives) => {
    const model = scenarioModel();
    const text = createTextSession({ callId: `final-miss-${id}`, package: FIXTURES[id], model, clock: () => 1000, random: 1 });
    model.next([], undefined);
    await text.start();
    for (const turn of work) { model.next([{ throws: true }], { start: "has_work" }); await text.child(turn); }
    expect(text.session.ladder.step).toBe("result");
    for (const n of [1, 2]) {
      model.next([{ throws: true }], undefined);
      await text.child(wrong);
      expect(text.session.finalMisses).toBe(n);
    }
    expect(text.session.solved === "maya").toBe(gives);
    if (!gives) {
      for (let i = 0; i < 12 && !text.session.outcome; i++) {
        model.next([{ throws: true }], undefined);
        await text.child("I'm stuck.");
      }
      expect(text.session.assistance).toContain("worked_example");
      expect(text.session.outcome?.reason).toBe("child_stopped");
    }
  }, 60_000);
});

for (const [id, work, wrong] of cases.slice(0, 2)) {
  it(`${id} reaches an honest close when the model always proposes the answer`, async () => {
    const model = scenarioModel();
    const text = createTextSession({ callId: `final-give-${id}`, package: FIXTURES[id], model, clock: () => 1000, random: 1 });
    model.next([], undefined);
    await text.start();
    for (const turn of work) { model.next([{ act: "give_answer", repair: { act: "give_answer" } }], { start: "has_work" }); await text.child(turn); }
    for (let i = 0; i < 2; i++) {
      model.next([{ act: "give_answer", repair: { act: "give_answer" } }], id === "PT_LONG" ? { answers: [[5, "result", "wrong"]] } : undefined);
      await text.child(wrong);
      expect(text.session.finalMisses).toBe(i + 1);
    }
    for (let i = 0; i < 12 && !text.session.outcome; i++) {
      model.next([{ act: "give_answer", repair: { act: "give_answer" } }], undefined);
      await text.child("I'm stuck.");
    }
    expect(text.session.assistance).toContain("worked_example");
    expect(text.session.assistance).not.toContain("answer_given");
    expect(text.session.outcome?.reason).toBe("child_stopped");
  }, 60_000);
}

it.each(["I think it's 5.", "Is it 5?", "Help, 5.", "My mom said 5.", "I copied 5."])("does not count a noncommitted final answer: %s", async (said) => {
  const model = scenarioModel();
  const text = createTextSession({ callId: `final-guard-${said}`, package: FIXTURES.PT_LONG, model, clock: () => 1000, random: 1 });
  model.next([], undefined); await text.start();
  model.next([{ throws: true }], undefined); await text.child("115 minus 35 is 80.");
  model.next([{ throws: true }], undefined); await text.child(said);
  expect(text.session.finalMisses).toBe(0);
});
