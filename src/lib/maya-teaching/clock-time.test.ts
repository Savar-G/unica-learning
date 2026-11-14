// Clock-time questions (C3c): "What time is 50 minutes after 6:13?" derived as time-add, with an easier example of the
// same shape, taught by count-on lines, and its way out the honest close. Synthetic packages with the book's shapes.
import { describe, expect, it, vi } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { scenarioModel } from "@/lib/maya-gate/gate";
import { gateWordCount } from "@/lib/maya-gate/word-count";
import { learningEvent } from "@/lib/maya/session";
import { packageLines } from "@/lib/maya/lines";
import { speechWords } from "@/lib/maya/speech";
import { checkQuestionPackage, type OperationPackage, type QuestionPackage } from "@/lib/question-package";
import { teachingPackage } from "./index";
import { deriveClockTime } from "./topic-derivers";
import { clockPrinted } from "./topic-samples";

vi.mock("server-only", () => ({}));

const time = (hours: number, minutes: number) => ({ type: "time", hours, minutes, period: null });
const legs = (p: { steps: { kind: string }[] }) => p.steps.filter((s) => s.kind === "count-on").length;
const numbersOf = (p: QuestionPackage) => {
  const op = p.operation as { operands: [{ hours: number; minutes: number }, { value: number }] };
  return [op.operands[0].hours, op.operands[0].minutes, op.operands[1].value];
};

describe("deriving a clock-time question", () => {
  it.each([[6, 13, 50, time(7, 3)], [4, 25, 50, time(5, 15)], [9, 0, 40, time(9, 40)], [7, 0, 45, time(7, 45)], [11, 30, 50, time(12, 20)]])(
    "%i:%i + %i min: time-add with its answer, and an easier example of the same shape with none of its numbers",
    (h, m, d, answer) => {
      const made = deriveClockTime(clockPrinted(h, m, d)) as OperationPackage;
      expect(made, `${h}:${m}`).not.toBeNull();
      expect(made.operation.kind).toBe("time-add");
      expect(made.answer.value).toEqual(answer);
      expect(checkQuestionPackage(made).ok).toBe(true);
      const example = made.easierExample;
      expect(legs(example)).toBe(legs(made));
      const own = numbersOf(made);
      const exampleNumbers = numbersOf({ operation: example.operation } as QuestionPackage).filter((n) => n !== 0);
      for (const n of exampleNumbers) expect(own, `example ${JSON.stringify(example.operation)}`).not.toContain(n);
      expect(example.answer).not.toEqual(made.answer.value);
    });

  it("goes through the session adapter", () => {
    expect((teachingPackage(clockPrinted(6, 13, 50)) as QuestionPackage).operation?.kind).toBe("time-add");
  });

  it("stays held when the text, the template or the key disagree", () => {
    const p = clockPrinted(6, 13, 50);
    expect(deriveClockTime({ ...p, text: "What time is 50 minutes after 6:14?" })).toBeNull();
    const key = structuredClone(p);
    (key.item!.regions[0] as { answer: unknown }).answer = { type: "text", value: "7:13" };
    expect(deriveClockTime(key)).toBeNull();
    const slot = structuredClone(p);
    (slot.item!.checks[0] as { source: { slots: { name: string; value: unknown }[] } }).source.slots.find((x) => x.name === "m")!.value = { int: "51" };
    expect(deriveClockTime(slot)).toBeNull();
  });
});

describe("teaching a clock-time question", () => {
  const two = deriveClockTime(clockPrinted(6, 13, 50)) as OperationPackage;
  const one = deriveClockTime(clockPrinted(9, 0, 40)) as OperationPackage;

  it("says times as the book prints them, and counts on in code's words", () => {
    const l = packageLines(two);
    expect(l.question()[0].texts[0]).toBe("First count on to the next hour, 7:00. Then count the minutes left. Our question is 50 minutes after 6:13.");
    const help = l.help("to-hour").flatMap((o) => o.texts);
    expect(help).toContain("Start at 6:13. First count on to 7:00, the next hour.");
    expect(help).toContain("How many minutes from 6:13 to 7:00?");
    expect(l.help("minutes").flatMap((o) => o.texts)).toContain("What time is 3 minutes after 7:00?");
    expect(l.answerRight()[0].texts.join(" ")).toContain("7:03");
    expect(l.answerRight()[0].texts.join(" ")).not.toContain("07:03");
  });

  it("fits a 25-word turn at grade 3 in every line it offers", () => {
    for (const pkg of [two, one, deriveClockTime(clockPrinted(11, 30, 50)) as OperationPackage]) {
      const l = packageLines(pkg);
      const texts = [...l.question(), ...l.assess(), ...l.exampleIntro(), ...l.stepIds.flatMap((id) => l.help(id)), ...l.help("result"),
        ...pkg.easierExample.steps.flatMap((s) => l.exampleStep(s.id)), ...l.answerRight(), ...l.closeHonest()].flatMap((o) => o.texts);
      for (const t of texts) expect(speechWords(t), t).toBeLessThanOrEqual(25);
    }
  });

  it.each([["two counts", two], ["one count", one]])("%s: help-only turns reach the easier example, then the honest close with no time in it", async (_, pkg) => {
    const script = scenarioModel();
    const model = { ...script, propose: async (...args: Parameters<typeof script.propose>) => ({ ...((await script.propose(...args)) as object), parts: "invalid" }) };
    let at = 1000;
    const s = createTextSession({ callId: "clock-honest", package: pkg, grade: 3, confirmWorkbook: true, model, clock: () => at });
    script.next([{ act: "open" }], undefined);
    await s.start();
    const said: string[] = [];
    for (let i = 0; i < 10 && !s.session.outcome; i++) {
      at += 20_000;
      script.next([{}], { help: "stuck" } as never);
      said.push(...(await s.child("I'm stuck.")).say);
    }
    const acts = s.trace().turns.flatMap((t) => (t.kind === "maya" && t.output ? [t.output.act] : []));
    expect(acts).toContain("example_step");
    expect(acts).not.toContain("give_answer");
    expect(s.session.outcome?.reason).toBe("maya_closed");
    expect(said.at(-1)).toMatch(/hard/);
    expect(said.at(-1)).not.toMatch(/\d/);
    for (const t of said) expect(gateWordCount(t), t).toBeLessThanOrEqual(25);
    expect(learningEvent(s.session, { parentId: "p", childId: "c" })).toMatchObject({ result: "blank" });
  });

  it("'My mom said 7:03.' is not accepted as the child's own answer in that turn (the base confirm is #735's)", async () => {
    const model = scenarioModel();
    const s = createTextSession({ callId: "clock-mom", package: two, model, clock: () => 1000 });
    model.next([{ act: "open" }], undefined);
    await s.start();
    model.next([{}], { start: "has_work" });
    await s.child("My mom said 7:03.");
    const acts = s.trace().turns.flatMap((t) => (t.kind === "maya" && t.output ? [t.output.act] : []));
    expect(acts).not.toContain("accept_answer");
    expect(s.session.solved).toBeNull();
  });
});
