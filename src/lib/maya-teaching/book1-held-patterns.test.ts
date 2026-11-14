import { describe, expect, it } from "vitest";
import { createSession, heldReason } from "@/lib/maya";
import { exampleGivesAway, patternOf } from "@/lib/maya/pattern";
import { printedWorkbookQuestion } from "@/lib/workbook-maya-operation";
import type { OperationPackage, QuestionPackage } from "@/lib/question-package";
import { teachingPackage } from ".";
import { printedPattern } from "./pattern-fixtures";
import { asSpot } from "./spot-error-samples";
import { createTextSession } from "@/lib/maya-text";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("the remaining Book 1 pattern forms", () => {
  it.each([[23, 3], [33, 2], [26, 3]])("teaches start %i, increment %i using a checked missing-rule example", (start, increment) => {
    const printed = printedPattern("missing3", start, increment);
    const before = structuredClone(printed);
    const pkg = teachingPackage(printed) as OperationPackage;
    expect(heldReason(pkg)).toBeNull();
    expect(createSession({ callId: "missing-rule", package: pkg }).package).not.toBeNull();
    expect(pkg.answer.value).toEqual({ type: "number", value: increment });
    const question = patternOf(pkg)!, example = patternOf(pkg.easierExample)!;
    expect(example.form).toBe("missing9");
    expect(exampleGivesAway(question, example)).toBe(false);
    expect(printedWorkbookQuestion(pkg)).toEqual(printed);
    expect(printed).toEqual(before);
  });

  it("teaches the plant story beneath the exact two-region spot item", () => {
    const printed = asSpot(printedPattern("plant3", 45, 5), 6);
    const before = structuredClone(printed);
    const pkg = teachingPackage(printed) as OperationPackage;
    expect(heldReason(pkg)).toBeNull();
    const session = createSession({ callId: "plant-spot", package: pkg });
    expect(session.package).not.toBeNull();
    expect(pkg.answer.value).toEqual({ type: "number", value: 60 });
    expect(pkg.item?.regions).toEqual(printed.item?.regions);
    expect(printedWorkbookQuestion(pkg)).toEqual(printed);
    expect(printed).toEqual(before);
    for (const change of [
      (p: QuestionPackage) => { const right = p.item!.regions[0]; if (right.kind === "choice") right.answer = "Yes"; },
      (p: QuestionPackage) => { const fix = p.item!.regions[1]; if (fix.kind === "box") fix.answer = { type: "number", value: 61 }; },
      (p: QuestionPackage) => { p.item!.checks.reverse(); },
    ]) {
      const forged = structuredClone(printed); change(forged);
      expect((teachingPackage(forged) as QuestionPackage).operation).toBeNull();
    }
  });

  it("offers subtraction help when the step count equals the hidden answer", async () => {
    const pkg = teachingPackage(printedPattern("missing3", 33, 2));
    const text = createTextSession({ callId: "two-help", package: pkg, clock: () => 1000,
      model: { id: "offline", promptVersion: "offline", propose: async () => { throw new Error("offline"); } } });
    await text.start();
    const outputs: string[] = [];
    for (let i = 0; i < 12 && !text.ended; i++) outputs.push(...(await text.child("I'm stuck.")).say);
    expect(outputs.some(s => /37\s*[−-]\s*33/.test(s)), outputs.join("\n")).toBe(true);
    expect(text.session.outcome?.reason).toBe("maya_closed");
    expect(text.session.assistance).not.toContain("answer_given");
  });

  it("credits the plant's own final addition before its spot verdict", async () => {
    const pkg = teachingPackage(asSpot(printedPattern("plant3", 45, 5), 6));
    const text = createTextSession({ callId: "plant-final", package: pkg, clock: () => 1000,
      model: { id: "offline", promptVersion: "offline", output: 3, propose: async () => { throw new Error("offline"); } } });
    await text.start(); await text.child("3 times 5 is 15.");
    expect(text.session.done).toContain("e1");
    await text.child("45 plus 15 is 60."); expect(text.session.done).toContain("claim");
    await text.child("The answer is no."); expect(text.session.solved).toBe("child");
  });
});
