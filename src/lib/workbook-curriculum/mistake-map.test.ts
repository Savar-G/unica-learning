import { describe, expect, it } from "vitest";
import { MISCONCEPTIONS } from "@/lib/assessment/misconceptions";
import { SAM_MISTAKES, samWork, type SamMistake } from "@/lib/workbook-book";
import { samMistakeFor } from "@/lib/workbook-mistake-map";
import type { Operation } from "@/lib/question-package";

const mappings: { id: keyof typeof MISCONCEPTIONS; mistake: SamMistake; operation: Operation; wrong: number }[] = [
  { id: "O3", mistake: "forgot-carry", operation: { kind: "add", operands: [268, 157] }, wrong: 315 },
  { id: "carry-dropped", mistake: "forgot-carry", operation: { kind: "add", operands: [268, 157] }, wrong: 315 },
  { id: "O1", mistake: "smaller-from-larger", operation: { kind: "subtract", operands: [52, 18] }, wrong: 46 },
  { id: "O2", mistake: "smaller-from-larger", operation: { kind: "subtract", operands: [302, 18] }, wrong: 316 },
  { id: "smaller-from-larger", mistake: "smaller-from-larger", operation: { kind: "subtract", operands: [52, 18] }, wrong: 46 },
  { id: "regroup-forget", mistake: "regroup-not-taken", operation: { kind: "subtract", operands: [52, 18] }, wrong: 44 },
  { id: "count-start", mistake: "wrong-start", operation: { kind: "add", operands: [8, 3] }, wrong: 10 },
  { id: "operation", mistake: "wrong-operation", operation: { kind: "add", operands: [8, 3] }, wrong: 5 },
  { id: "operation-swap", mistake: "wrong-operation", operation: { kind: "subtract", operands: [8, 3] }, wrong: 11 },
  { id: "digit-reversal", mistake: "swapped-digits", operation: { kind: "add", operands: [18, 5] }, wrong: 32 },
  { id: "difference-as-sum", mistake: "wrong-operation", operation: { kind: "subtract", operands: [43, 17] }, wrong: 60 },
  { id: "fee-sign", mistake: "wrong-operation", operation: { kind: "subtract", operands: [640, 185] }, wrong: 825 },
];

describe("closed misconception to Sam mapping", () => {
  it.each(mappings)("demonstrates $id as $mistake with fresh numbers", ({ id, mistake, operation, wrong }) => {
    expect(Object.hasOwn(MISCONCEPTIONS, id)).toBe(true);
    expect(SAM_MISTAKES).toContain(mistake);
    expect(samMistakeFor(id, operation)).toBe(mistake);
    expect(samWork(operation, { type: "number", value: wrong }, samMistakeFor(id, operation))).toMatchObject({ mistake, answer: wrong });
  });

  it("has exactly the tested entries and no guessed match for any other known id", () => {
    const mapped = Object.keys(MISCONCEPTIONS).filter(id => samMistakeFor(id, mappings.find(m => m.id === id)?.operation) !== null);
    expect(mapped.sort()).toEqual(mappings.map(m => m.id).sort());
    expect(mapped).toHaveLength(12);
    for (const id of Object.keys(MISCONCEPTIONS)) {
      if (!mappings.some(m => m.id === id)) expect(samMistakeFor(id), id).toBeNull();
    }
  });

  it.each(["", "unknown", "forgot-carry", "regroup-not-taken", "counted-one-extra", "O3-extra", "o3", " O3", "constructor", "toString", "__proto__"])("returns no mapping for %j", id => {
    expect(samMistakeFor(id)).toBeNull();
  });

  it("requires the planned sum to allow the mapped mistake", () => {
    expect(samWork({ kind: "add", operands: [12, 3] }, { type: "number", value: 15 }, samMistakeFor("O3"))).toBeNull();
    expect(samWork({ kind: "multiply", operands: [268, 3] }, { type: "number", value: 604 }, samMistakeFor("carry-dropped"))).toBeNull();
  });

  it.each(["difference-as-sum", "fee-sign"])("requires the exact subtraction form for %s", id => {
    expect(samMistakeFor(id)).toBeNull();
    for (const operation of [
      { kind: "add", operands: [43, 17] }, { kind: "multiply", operands: [43, 17] },
      { kind: "subtract", operands: [17, 43] }, { kind: "subtract", operands: [43, 0] },
      { kind: "subtract", operands: [43.5, 17] }, { kind: "subtract", operands: [-43, 17] },
      { kind: "subtract", operands: [Infinity, 17] }, { kind: "subtract", operands: [NaN, 17] },
      { kind: "subtract", operands: [Number.MAX_SAFE_INTEGER, 1] },
    ] as Operation[]) expect(samMistakeFor(id, operation)).toBeNull();
    expect(samMistakeFor(id, { kind: "subtract", operands: [43, 17] })).toBe("wrong-operation");
  });
});
