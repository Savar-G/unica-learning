import { describe, expect, it } from "vitest";
import { checkQuestionPackage, operationProblem, QUESTION_PACKAGE_VERSION, type QuestionPackage } from "@/lib/question-package";
import { storedContent } from "@/lib/workbook-content";
import { placeValueTeachingPackage } from "./place-value";
import { MAYA_TEACHING_LIMITS } from "./limits";
import { attachWorkbookMayaOperations, withWorkbookMayaOperation } from "@/lib/workbook-maya-operation";
import { ITEMS_SCHEMA } from "@/lib/workbook-generator-items";
import type { GeneratedWorkbook } from "@/lib/workbook-generator";
import { storedPlaceValue } from "./place-value-samples";

// B1a must not change the generator. The place-value operation kind is made only by Maya's session adapter: the
// generator never offers it to the AI, the default limits stay, and the #525 teaching data the generator attaches to a
// stored place-value question stays exactly as before (none). The snapshot of this file was written on the base commit
// (6de7e777), before this change.

const FIXED: QuestionPackage[] = [
  storedPlaceValue({ variant: "1.1", n0: 53172, place: "thousands" }),
  storedPlaceValue({ variant: "1.2", n0: 61847, place: "ten thousands" }),
  storedPlaceValue({ variant: "1.3", n0: 61847, place: "hundreds", name: "Mo", sign: "the bus stop" }),
  storedPlaceValue({ variant: "2.1", n0: 785243, place: "hundred thousands" }),
  storedPlaceValue({ variant: "2.2", n0: 785243, place: "ten thousands" }),
  storedPlaceValue({ variant: "2.3", n0: 914362, place: "thousands" }),
  storedPlaceValue({ variant: "3.1", n0: 467891, place: "thousands" }),
  storedPlaceValue({ variant: "3.2", n0: 402561, place: "ten thousands", form: "short" }),
  storedPlaceValue({ variant: "3.3", n0: 523416, place: "tens" }),
];

describe("the generator is unchanged by the place-value kind", () => {
  it("still refuses 10000 + 2000 by default", () => {
    expect(operationProblem({ kind: "add", operands: [10000, 2000] })).toBe("code checks additions only of whole numbers up to 9999");
  });

  it("never offers place value to the AI", () => {
    const kinds = JSON.stringify(ITEMS_SCHEMA).match(/"enum":\["add"[^\]]*\]/)?.[0] ?? "";
    expect(kinds).toContain('"evaluate"');
    expect(kinds).not.toContain("place-value");
  });

  it("attaches the same teaching data to stored place-value questions as before: none", () => {
    const out = FIXED.map((p) => {
      expect(checkQuestionPackage(p).status, p.text).toBe("checked");
      const made = withWorkbookMayaOperation(p);
      return { text: p.text, same: made === p, operation: made.operation, answer: made.answer, source: made.operationSource ?? null };
    });
    expect(out).toMatchSnapshot();
  });

  it("finalizes a draft the same way as before", () => {
    const draft = { pages: [{ number: 1, questions: FIXED.map((p, i) => ({ number: i + 1, package: p })) }] } as unknown as GeneratedWorkbook;
    const attached = attachWorkbookMayaOperations(draft);
    expect(attached.pages[0].questions.map((q) => q.package)).toMatchSnapshot();
  });

  it("keeps the place-value kind out of every default check: only Maya's explicit limits know it (review of #738)", () => {
    const made = placeValueTeachingPackage(FIXED[4]);
    if (!("package" in made)) throw new Error(made.held);
    const p = made.package;
    // The default package check gives "beyond code", as on the base commit.
    expect(checkQuestionPackage(p)).toMatchObject({ ok: false, status: "unsupported", reason: "code cannot check the operation place-value" });
    expect(checkQuestionPackage(p, undefined, MAYA_TEACHING_LIMITS).status).toBe("checked");
    // A stored copy would be "content unavailable", never taught or marked from.
    const at = { source: "workbook" as const, workbookId: p.ref.source === "workbook" ? p.ref.workbookId : "", page: 4, question: 1 };
    const stored = storedContent({ number: 1, box: { x: 0, y: 0, w: 1, h: 1 } as never, schemaVersion: QUESTION_PACKAGE_VERSION, package: p }, at);
    expect(stored.status).toBe("unavailable");
    // The operation check refuses the kind by default, and checks it only with Maya's limits.
    expect(operationProblem(p.operation)).toBe("code cannot check the operation place-value");
    expect(operationProblem(p.operation, MAYA_TEACHING_LIMITS)).toBeNull();
    expect(operationProblem({ kind: "place-value", operands: [53172], ask: "digit", place: "thousands" }, { wholeResult: 999_999 })).toBe("code cannot check the operation place-value");
  });
});
