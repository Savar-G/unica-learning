import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateSnapshot, type SnapshotSheet } from "../bank/snapshot";
import rawSnapshot from "../fixtures/snapshot.json";
import { SHAPES, shapeLibrary, type Shape } from "../shapes";
import { sheetItems } from "./items";

const MUL = SHAPES.get("mul.column");
if (!MUL) throw new Error("no shape");
function sheetWith(shape: Shape = MUL!): SnapshotSheet {
  const result = validateSnapshot(structuredClone(rawSnapshot), shapeLibrary([shape]));
  if (!result.ok) throw new Error(result.problems.join("\n"));
  const sheet = result.snapshot.sheets.get("column-multiplication-1");
  if (!sheet) throw new Error("no sheet");
  return sheet;
}
const SHEET = sheetWith();
const printed = (child: string, attempt: number, sheet = SHEET) =>
  sheetItems(sheet, child, attempt).items.map((i) => `${i.face.top} ${i.face.sign} ${i.face.bottom}`);

describe("the seed decides the numbers", () => {
  it("the same child, sheet and attempt always get the same questions", () => {
    expect(printed("child-a", 1)).toEqual(printed("child-a", 1));
  });

  it.each<[string, string[]]>([
    ["another child", printed("child-b", 1)],
    ["another attempt", printed("child-a", 2)],
    ["another sheet", printed("child-a", 1, { ...SHEET, id: "other-sheet" })],
  ])("%s gets other questions", (_name, other) => {
    expect(other).not.toEqual(printed("child-a", 1));
    expect(other).toHaveLength(16);
  });

  it("parts of a seed do not run together", () => {
    expect(printed("child-1", 1, { ...SHEET, id: "x" })).not.toEqual(printed("child-", 1, { ...SHEET, id: "1x" }));
    expect(printed("child-1", 1)).not.toEqual(printed("child-", 11));
  });

  it("1,000 seeds give different sheets, each inside the limits, in order, with no question twice", () => {
    const seen = new Set<string>();
    fc.assert(fc.property(fc.uuid(), fc.integer({ min: 1, max: 9 }), (child, attempt) => {
      const { items, problems } = sheetItems(SHEET, child, attempt);
      expect(problems).toEqual([]);
      const key = items.map((i) => `${i.face.top}x${i.face.bottom}`);
      expect(new Set(key).size).toBe(16);
      seen.add(key.join());
      for (const side of ["front", "back"] as const) {
        const onSide = items.filter((i) => i.side === side);
        expect(onSide.map((i) => i.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        onSide.forEach((item, i) => {
          if (i > 0) expect(item.difficulty).toBeGreaterThanOrEqual(onSide[i - 1].difficulty);
          const [top, bottom, value] = [Number(item.face.top), Number(item.face.bottom), Number(item.answer.value)];
          const carries = (top % 10) * bottom >= 10;
          if (item.rowId === "no-carry") expect([top >= 11 && top <= 43, bottom >= 2 && bottom <= 4, carries, value <= 99]).toEqual([true, true, false, true]);
          if (item.rowId === "one-carry") expect([top >= 12 && top <= 49, bottom >= 2 && bottom <= 4, carries, value <= 99]).toEqual([true, true, true, true]);
          if (item.rowId === "past-one-hundred") expect([top >= 21 && top <= 98, bottom >= 3, value >= 100]).toEqual([true, true, true]);
        });
      }
    }), { numRuns: 1000 });
    expect(seen.size).toBeGreaterThanOrEqual(995);
  });

  it("uses a question twice only when the row has no other left", () => {
    const one = SHEET.front.rows[0];
    const two = { ...one, items: 2, limits: { a: { min: 11, max: 11 }, b: { min: 2, max: 3 }, carries: { min: 0, max: 0 }, product: { min: 10, max: 99 }, zeroInTens: "never" } };
    const sheet = { ...SHEET, front: { ...SHEET.front, rows: [{ ...two, id: "first" }, { ...two, id: "second" }] }, back: SHEET.back };
    const items = sheetItems(sheet, "child-a", 1).items.filter((i) => i.side === "front");
    expect(items.filter((i) => i.rowId === "first").map((i) => i.answer.value).sort()).toEqual(["22", "33"]);
    expect(items).toHaveLength(4);
  });
});

describe("every answer is computed twice", () => {
  it.each<[string, Partial<Shape>]>([
    ["a wrong first computation", { generate: (l, s) => { const item = MUL.generate(l, s); return { ...item, answer: { kind: "whole-number", value: String(Number(item.answer.value) + 1) } }; } }],
    ["a wrong second computation", { solveAgain: () => ({ kind: "whole-number", value: "0" }) }],
    ["worked steps that end in another number", { steps: () => ["3 × 4 = 12", "12"] }],
    ["another kind of answer", { answerKind: "whole-number", solveAgain: (q) => ({ ...MUL.solveAgain(q), kind: "fraction" as "whole-number" }) }],
  ])("%s is a problem that names the place", (_name, fault) => {
    const { problems } = sheetItems(sheetWith({ ...MUL, ...fault }), "child-a", 1);
    expect(problems).toHaveLength(16);
    expect(problems[0]).toMatch(/^Sheet "column-multiplication-1", front side, question 1 \(\d\d × \d\): the answer is "\d+" by one computation and "\d+" by (another|the worked steps)\./);
  });
});
