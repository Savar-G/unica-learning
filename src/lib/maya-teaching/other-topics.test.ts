// The "other-topic" derivers (Maya coverage, Wave C): die counts, lines of symmetry and the perimeter of a rectangle,
// each made from a printed package only when the printed text, the template and the answer key agree.
import { describe, expect, it } from "vitest";
import { createSession, heldReason } from "@/lib/maya/session";
import { packageLines, workbookOpening } from "@/lib/maya/lines";
import { speechWords } from "@/lib/maya/speech";
import { topicFrame } from "@/lib/maya/topic-frame";
import { checkQuestionPackage, operationProblem, type OperationPackage, type QuestionPackage } from "@/lib/question-package";
import { withWorkbookMayaOperation } from "@/lib/workbook-maya-operation";
import { countKind, deriveDieCount, dieOperation, exampleDie } from "./die-count";
import { derivePerimeter } from "./perimeter";
import { deriveSymmetry, SYMMETRY_LINES } from "./symmetry";
import { diePrinted, perimeterPrinted, symmetryPrinted } from "./topic-samples";

type Source = { answer: string; check: string | null; slots: { name: string; value: { int: string } }[]; derived: [string, string][] };
const sourceOf = (p: QuestionPackage) => (p.item!.checks[0] as { source: Source }).source;
const withText = (p: QuestionPackage, text: string): QuestionPackage => ({ ...p, text });
const withSlot = (p: QuestionPackage, name: string, value: number): QuestionPackage => {
  const q = structuredClone(p);
  sourceOf(q).slots.find((s) => s.name === name)!.value = { int: String(value) };
  return q;
};
const withKey = (p: QuestionPackage, value: number): QuestionPackage => {
  const q = structuredClone(p);
  (q.item!.regions[0] as { answer: unknown }).answer = { type: "number", value };
  return q;
};
const teachable = (p: QuestionPackage | null) => p !== null && createSession({ callId: "t", package: p }).package !== null;

describe("die counts", () => {
  it("teaches 'how many are odd' as a division by 2, with a smaller die as the easier example", () => {
    for (const [last, kind] of [[6, "odd"], [8, "even"], [10, "even"], [12, "odd"]] as const) {
      const made = deriveDieCount(diePrinted(last, kind));
      expect(made, `${last} ${kind}`).not.toBeNull();
      expect(made!.operation).toEqual(dieOperation(last));
      expect(made!.answer!.value).toEqual({ type: "number", value: countKind(last, kind) });
      const example = exampleDie(last)!;
      expect(example).toBeLessThan(last);
      expect([example, 2, example / 2]).not.toContain(last / 2);
      expect(made!.easierExample!.text).toBe(`Roll a die numbered 1 to ${example}. How many of the numbers are ${kind}?`);
      expect(checkQuestionPackage(made).ok).toBe(true);
      expect(teachable(made)).toBe(true);
    }
  });

  it("counts by code one number at a time", () => {
    expect([countKind(6, "odd"), countKind(6, "even"), countKind(12, "odd"), countKind(7, "odd")]).toEqual([3, 3, 6, 4]);
  });

  it("changes only the teaching fields of the printed package", () => {
    const printed = diePrinted(8, "odd");
    const made = deriveDieCount(printed)!;
    for (const key of Object.keys(printed) as (keyof QuestionPackage)[]) {
      if (!["operation", "answer", "steps", "wrongAnswers", "easierExample"].includes(key)) expect(made[key], key).toEqual(printed[key]);
    }
  });

  it("stays held when the text, the template or the key disagree", () => {
    const p = diePrinted(8, "odd");
    expect(deriveDieCount(withText(p, "Roll a die numbered 1 to 8. How many numbers are odd?"))).toBeNull();
    expect(deriveDieCount(withText(p, "Roll a die numbered 1 to 10. How many of the numbers are odd?"))).toBeNull();
    expect(deriveDieCount(withText(p, "Roll a die numbered 1 to 8. How many of the numbers are even?"))).toBeNull();
    expect(deriveDieCount(withSlot(p, "s", 10))).toBeNull();
    expect(deriveDieCount(withSlot(p, "flip", 0))).toBeNull();
    expect(deriveDieCount(withKey(p, 5))).toBeNull();
    expect(deriveDieCount({ ...p, templateId: "4.17-predict-outcome#3.3:true-false" })).toBeNull();
    const other = structuredClone(p);
    sourceOf(other).answer = "s // 2 + 0";
    expect(deriveDieCount(other)).toBeNull();
  });
});

describe("lines of symmetry", () => {
  it("teaches the sum of two shapes' lines of symmetry from code's table as an addition", () => {
    const made = deriveSymmetry(symmetryPrinted(4, 2));
    expect(made?.operation).toEqual({ kind: "add", operands: [6, 1] });
    expect(made?.answer?.value).toEqual({ type: "number", value: 7 });
    expect(teachable(made)).toBe(true);
    const easy = made!.easierExample!;
    expect(easy.operation.kind).toBe("add");
    expect((easy.answer as { value: number }).value).toBeLessThan(7);
  });

  it("makes a teachable package for every pair of shapes with an easier pair", () => {
    let made = 0;
    for (let i = 0; i < SYMMETRY_LINES.length; i++) for (let j = 0; j < SYMMETRY_LINES.length; j++) {
      if (i === j) continue;
      const pkg = deriveSymmetry(symmetryPrinted(i, j));
      if (pkg) { made++; expect(teachable(pkg), `${i} ${j}`).toBe(true); }
    }
    expect(made).toBeGreaterThan(20);
  });

  it("stays held when the text, the slots or the key disagree", () => {
    const p = symmetryPrinted(0, 3);
    expect(deriveSymmetry(p)).not.toBeNull();
    expect(deriveSymmetry(withText(p, "How many lines of symmetry do a square and a circle have in all?"))).toBeNull();
    expect(deriveSymmetry(withText(p, "How many lines of symmetry do a scalene triangle and a square have in all?"))).toBeNull();
    expect(deriveSymmetry(withSlot(p, "j", 2))).toBeNull();
    expect(deriveSymmetry(withKey(p, 5))).toBeNull();
    const table = structuredClone(p);
    sourceOf(table).derived[0][1] = "[4, 2, 1, 1, 6, 5]";
    expect(deriveSymmetry(table)).toBeNull();
  });
});

describe("perimeter", () => {
  it("makes 2 × (length + width), held until Maya teaches evaluate steps", () => {
    const made = derivePerimeter(perimeterPrinted(84, 37));
    expect(made?.operation).toEqual({ kind: "evaluate", operands: ["2 × (84 + 37)"] });
    expect(made?.answer?.value).toEqual({ type: "number", value: 242 });
    expect(checkQuestionPackage(made).ok).toBe(true);
    expect(heldReason(made)).toMatch(/operate step of evaluate/);
  });

  it("stays held when the text, the slots or the key disagree", () => {
    const p = perimeterPrinted(84, 37, "cm");
    expect(derivePerimeter(p)).not.toBeNull();
    expect(derivePerimeter(withText(p, p.text.replace("in cm?", "in m?")))).toBeNull();
    expect(derivePerimeter(withSlot(p, "w", 38))).toBeNull();
    expect(derivePerimeter(withKey(p, 243))).toBeNull();
  });
});

describe("the topic sentence", () => {
  const die = deriveDieCount(diePrinted(10, "odd")) as OperationPackage;
  const shapes = deriveSymmetry(symmetryPrinted(4, 2)) as OperationPackage;

  it("says why the question is its operation, from code", () => {
    expect(topicFrame(die.text, die.operation)).toBe("From 1 to 10, odd and even numbers take turns. So half of them are odd.");
    expect(topicFrame(shapes.text, shapes.operation)).toBe("A regular hexagon has 6 lines of symmetry. An isosceles triangle has 1.");
    expect(topicFrame(die.text, { kind: "divide", operands: [10, 5] })).toBeNull();
    expect(topicFrame("27 + 39 = ?", { kind: "add", operands: [27, 39] })).toBeNull();
  });

  it("comes before the operation in the question line, the example intro and the fixed workbook opening", () => {
    const l = packageLines(die);
    const problem = l.question().find((o) => o.line === "question.problem")!;
    expect(problem.key).toBe("question.framed");
    for (const t of problem.texts) expect(t.startsWith("From 1 to 10, odd and even numbers take turns.") && t.endsWith("10 ÷ 2.")).toBe(true);
    const intro = l.exampleIntro()[0];
    expect(intro.key).toBe("example.framed");
    for (const t of intro.texts) expect(t).toContain("From 1 to 4, odd and even numbers take turns. So half of them are odd.");
    expect(exampleDie(10)).toBe(4);
    expect(workbookOpening(die)).toMatch(/: 10 ÷ 2\. From 1 to 10, odd and even numbers take turns\. So half of them are odd\.$/);
  });

  it("fits a grade 4 turn", () => {
    for (const pkg of [die, shapes]) {
      const l = packageLines(pkg);
      for (const t of [...l.question()[0].texts, ...l.exampleIntro()[0].texts]) expect(speechWords(t), t).toBeLessThanOrEqual(45);
    }
  });

  it("leaves every other question's lines as they were", () => {
    const plain = { ...die, text: "10 ÷ 2 = ?" };
    expect(packageLines(plain).question()[0].key).toBe("question.problem");
    expect(packageLines(plain).exampleIntro()[0].key).toBe("example.intro");
  });
});

describe("the generator is unchanged", () => {
  it("attaches no operation to these templates and keeps its default limits", () => {
    for (const p of [diePrinted(8, "odd"), symmetryPrinted(0, 3), perimeterPrinted(245, 126)]) expect(withWorkbookMayaOperation(p)).toBe(p);
    expect(operationProblem({ kind: "add", operands: [10000, 2000] })).not.toBeNull();
  });
});
