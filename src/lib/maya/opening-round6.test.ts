import { expect, it } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { fakeMayaModel } from "@/lib/maya-model-fake";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { checkQuestionPackage, workedSteps } from "@/lib/question-package";

it.each([[2, 1, 1, 1], [12, 11, 1, 1], [3, 2, 6, 2]])("opens workbook %i and %i on page %i question %i", async (a, b, page, question) => {
  const multiply = page === 6;
  const operation = { kind: multiply ? "multiply" as const : "subtract" as const, operands: [a, b] as [number, number] };
  const value = multiply ? a * b : a - b;
  const easier = { kind: operation.kind, operands: (multiply ? [2, 2] : [1, 1]) as [number, number] };
  const base = multiply ? FIXTURES.C : FIXTURES.B;
  const pkg = { ...base, ref: { source: "workbook" as const, workbookId: "book", page, question }, operation, text: `${a} ${multiply ? "×" : "−"} ${b}`, steps: workedSteps(operation), answer: { value: { type: "number" as const, value }, accepted: [], unit: null }, easierExample: { text: "example", operation: easier, answer: { type: "number" as const, value: multiply ? 4 : 0 }, steps: workedSteps(easier) }, wrongAnswers: [{ value: { type: "number" as const, value: value + 100 }, cause: "O3", description: "Wrong answer", step: null }] };
  expect(checkQuestionPackage(pkg), JSON.stringify(checkQuestionPackage(pkg))).toMatchObject({ ok: true });
  for (const fallback of [false, true]) {
    const model = fakeMayaModel({ answer: () => { if (fallback) throw new Error("offline"); return { version: 2, act: "open", parts: [{ line: "open.hello" }, { line: "question.problem" }] }; } });
    const session = createTextSession({ callId: "opening", package: pkg, confirmWorkbook: true, model, grade: 3, clock: () => 1000 });
    const output = await session.start();
    const turn = session.trace().turns.find((item) => item.kind === "maya");
    expect(turn?.kind === "maya" && turn.attempts.at(-1)?.source).toBe(fallback ? "fallback" : "model");
    expect(output.ended).toBeNull();
    expect(output.say.join(" ")).toContain(`page ${page}, number ${question}`);
  }
});
