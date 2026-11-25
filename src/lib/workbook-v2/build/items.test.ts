import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateSnapshot, type SnapshotSheet } from "../bank/snapshot";
import rawSnapshot from "../fixtures/snapshot.json";
import { sheetItems } from "./items";

const result = validateSnapshot(structuredClone(rawSnapshot));
if (!result.ok) throw new Error(result.problems.join("\n"));
const found = result.snapshot.sheets.get("column-multiplication-1");
if (!found) throw new Error("no sheet");
const SHEET: SnapshotSheet = found;
const printed = (child: string, attempt: number, sheet = SHEET) =>
  sheetItems(sheet, child, attempt).map((i) => `${i.face.top} ${i.face.sign} ${i.face.bottom}`);

describe("the seed decides the numbers", () => {
  it("the same child, sheet and attempt always get the same questions", () => {
    expect(printed("child-a", 1)).toEqual(printed("child-a", 1));
  });

  it("records the shape version on every item", () => {
    const [row] = SHEET.front.rows;
    const bumped = (sheet: SnapshotSheet, version: number): SnapshotSheet => {
      const rows = (side: SnapshotSheet["front"]) => ({ ...side, rows: side.rows.map((r) => ({ ...r, shape: { ...r.shape, version } })) });
      return { ...sheet, front: rows(sheet.front), back: rows(sheet.back) };
    };
    expect(sheetItems(SHEET, "child-a", 1).every((i) => i.shapeVersion === row.shape.version)).toBe(true);
    expect(sheetItems(bumped(SHEET, 73), "child-a", 1).every((i) => i.shapeVersion === 73)).toBe(true);
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
      const items = sheetItems(SHEET, child, attempt);
      const key = items.map((i) => `${i.face.top}x${i.face.bottom}`);
      expect(new Set(key).size).toBe(16);
      seen.add(key.join());
      for (const side of ["front", "back"] as const) {
        const onSide = items.filter((i) => i.side === side);
        expect(onSide.map((i) => i.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        // One look at all the questions of a side, because a look at each takes longer than making them.
        const wrong = onSide.filter((item, i) => {
          const [top, bottom, value] = [Number(item.face.top), Number(item.face.bottom), Number(item.answer.value)];
          const carries = (top % 10) * bottom >= 10;
          const inside: Record<string, boolean> = {
            "no-carry": top >= 11 && top <= 43 && bottom >= 2 && bottom <= 4 && !carries && value <= 99,
            "one-carry": top >= 12 && top <= 49 && bottom >= 2 && bottom <= 4 && carries && value <= 99,
            "one-carry-larger": top >= 12 && top <= 49 && bottom >= 2 && bottom <= 8 && carries && value <= 99,
            "past-one-hundred": top >= 21 && top <= 98 && bottom >= 3 && value >= 100,
          };
          return !inside[item.rowId] || (i > 0 && item.difficulty < onSide[i - 1].difficulty);
        });
        expect(wrong).toEqual([]);
      }
    }), { numRuns: 1000 });
    expect(seen.size).toBeGreaterThanOrEqual(995);
  });

  it("uses a question twice only when the row has no other left", () => {
    const one = SHEET.front.rows[0];
    const two = { ...one, items: 2, limits: { ...(one.limits as object), a: { min: 11, max: 11 }, b: { min: 2, max: 3 } } };
    const sheet = { ...SHEET, front: { ...SHEET.front, rows: [{ ...two, id: "first" }, { ...two, id: "second" }] }, back: SHEET.back };
    const items = sheetItems(sheet, "child-a", 1).filter((i) => i.side === "front");
    expect(items.filter((i) => i.rowId === "first").map((i) => i.answer.value).sort()).toEqual(["22", "33"]);
    expect(items).toHaveLength(4);
  });
});

describe("the printed order of a side", () => {
  // With no carry and no product of 100, the multiplier alone decides the difficulty: 11 × 2 and 13 × 2 are equal.
  const limits = (a: [number, number], b: [number, number]) => ({ ...(SHEET.front.rows[0].limits as object), a: { min: a[0], max: a[1] }, b: { min: b[0], max: b[1] }, product: { min: 20, max: 99 } });
  const sheetOf = (rows: { id: string; items: number; limits: unknown }[]): SnapshotSheet =>
    ({ ...SHEET, front: { ...SHEET.front, rows: rows.map((row) => ({ ...row, shape: SHEET.front.rows[0].shape })) } });
  const order = (sheet: SnapshotSheet, child: string) => sheetItems(sheet, child, 1).filter((i) => i.side === "front").map((i) => `${i.rowId} ×${i.face.bottom}`);

  it("is easy to hard, so the questions of two rows may mix, and each item names its row", () => {
    const sheet = sheetOf([{ id: "first", items: 1, limits: limits([11, 13], [3, 3]) }, { id: "second", items: 1, limits: limits([11, 13], [2, 2]) }, { id: "third", items: 1, limits: limits([11, 13], [3, 3]) }]);
    expect(order(sheet, "child-a")).toEqual(["second ×2", "first ×3", "third ×3"]);
  });

  it("keeps the row order of the bank for equal difficulty, for every child", () => {
    const sheet = sheetOf(["z-row", "m-row", "a-row"].map((id) => ({ id, items: 2, limits: limits([11, 13], [2, 3]) })));
    fc.assert(fc.property(fc.uuid(), (child) => {
      const items = sheetItems(sheet, child, 1).filter((i) => i.side === "front");
      const place = (id: string) => ["z-row", "m-row", "a-row"].indexOf(id);
      items.slice(1).forEach((item, i) => {
        expect(item.difficulty).toBeGreaterThanOrEqual(items[i].difficulty);
        if (item.difficulty === items[i].difficulty) expect(place(item.rowId)).toBeGreaterThanOrEqual(place(items[i].rowId));
      });
      expect(items.map((i) => i.rowId).sort()).toEqual(["a-row", "a-row", "m-row", "m-row", "z-row", "z-row"]);
    }), { numRuns: 200 });
  });
});
