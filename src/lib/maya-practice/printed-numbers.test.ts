import { describe, expect, it } from "vitest";
import { valuesIn } from "@/lib/maya";
import { PRACTICE_CASES } from "./cases";
import { practicePackage } from "./packages";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { fakeJudge, fakeValidityJudge, judgeRun, memoryPracticeStore, runPractice, scriptedSimulator, traceFile } from ".";

// The validity check always allows a question's operands. When the operands are expressions (an evaluate package:
// patterns, scales), it does not allow the numbers printed in the question. The child sees them on the page, so such
// a case allows them from the start, never the answer.
const exprCases = PRACTICE_CASES.filter((c) => {
  const ops = practicePackage(c).operation?.operands ?? [];
  return ops.length > 0 && !ops.every((o) => typeof o === "number" || typeof o === "object");
});

it("the repeated-addition persona can say the intermediate 8 plus 8 is 16 after help", async () => {
  const c = PRACTICE_CASES.find(c => c.id === "PTP2")!, store = memoryPracticeStore();
  await runPractice(c, 1, 1, { maya: ruleMayaModel(), simulator: scriptedSimulator([
    "I got 52.", "Why do I use three steps?", "8 plus 8 is 16.", "3 times 8 is 24.", "20 plus 24 is 44.", "Okay.", "I wrote it.",
  ]), validity: fakeValidityJudge(), judge: fakeJudge(), store, freeTalk: false });
  const trace = JSON.parse(store.load(traceFile("PTP2-r1"))!);
  expect(trace.turns).toContainEqual(expect.objectContaining({ kind: "child", text: "8 plus 8 is 16." }));
  expect(judgeRun(c, "PTP2-r1", store, { stage: "code" }).invalid).not.toContainEqual(expect.objectContaining({ code: "number_not_allowed" }));
});

describe("cases with expression operands allow the numbers printed on the page", () => {
  it("covers the pattern and scale cases", () => {
    expect(exprCases.map((c) => c.id)).toEqual(expect.arrayContaining(["PTP1", "PTP2", "PTP3", "PTP4", "OTC1"]));
  });
  for (const c of exprCases) {
    it(`${c.id} allows every printed number of its question at the start, and not the answer`, () => {
      const pkg = practicePackage(c);
      const answer = pkg.answer?.value.type === "number" ? pkg.answer.value.value : null;
      const printed = valuesIn(pkg.text).flatMap((v) => (v.type === "number" ? [v.value] : []));
      const start = c.validity.stages.filter((s) => s.opens === "start").flatMap((s) => s.numbers);
      // 0 to 9 are always allowed.
      for (const n of printed.filter((n) => n !== answer && n > 9)) expect(start).toContain(n);
      if (answer !== null) expect(start).not.toContain(answer);
    });
  }
});
