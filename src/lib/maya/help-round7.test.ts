import { expect, it } from "vitest";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { fakeMayaModel } from "@/lib/maya-model-fake";
import { createTextSession } from "@/lib/maya-text";
import { workedSteps } from "@/lib/question-package";

const forms = ["help", "help me", "I need help", "can you help", "can you help me", "could you help", "could you help me", "will you help", "will you help me", "please help", "please help me", "help please", "help me please", "I'm stuck", "I am stuck", "show me", "I don't know how", "I don't get it", "um okay please can you help me?"];
const operation = { kind: "add" as const, operands: [3, 0] as [number, number] };
const easier = { kind: "add" as const, operands: [0, 0] as [number, number] };
const small = { ...FIXTURES.A, text: "3 + 0", operation, steps: workedSteps(operation),
  answer: { value: { type: "number" as const, value: 3 }, accepted: [], unit: null },
  wrongAnswers: [{ value: { type: "number" as const, value: 4 }, cause: "O3", description: "Wrong sum", step: null }],
  easierExample: { text: "0 + 0", operation: easier, answer: { type: "number" as const, value: 0 }, steps: workedSteps(easier) } };

it.each(forms.flatMap((form) => [[form, small], [form, FIXTURES.A]] as const))("advances for %s on %s with the model down", async (form, pkg) => {
  let at = 1000;
  const session = createTextSession({ callId: "round7-help", package: pkg, confirmWorkbook: true, grade: 2, clock: () => at,
    model: fakeMayaModel({ answer: () => { throw new Error("offline"); } }) });
  let output = await session.start();
  for (let i = 0; i < 12 && !output.ended; i++) { at += 4000; output = await session.child(form); }
  expect(session.session.ladder.hint > 0 || session.session.exampleShown > 0 || !!output.ended).toBe(true);
});
