import { describe, expect, it } from "vitest";
import { valuesIn } from "@/lib/maya";
import { PRACTICE_CASES } from "./cases";
import { practicePackage } from "./packages";

// The validity check always allows a question's operands. When the operands are expressions (an evaluate package:
// patterns, scales), it does not allow the numbers printed in the question. The child sees them on the page, so such
// a case allows them from the start, never the answer.
const exprCases = PRACTICE_CASES.filter((c) => {
  const ops = practicePackage(c).operation?.operands ?? [];
  return ops.length > 0 && !ops.every((o) => typeof o === "number" || typeof o === "object");
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
