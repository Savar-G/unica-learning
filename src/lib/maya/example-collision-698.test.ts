import { expect, it } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { fakeMayaModel } from "@/lib/maya-model-fake";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { checkQuestionPackage, workedSteps } from "@/lib/question-package";

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
