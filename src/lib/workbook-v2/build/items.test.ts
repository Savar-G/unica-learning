import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateSnapshot, type SnapshotSheet } from "../bank/snapshot";
import { answerLine } from "../contract";
import rawSnapshot from "../fixtures/snapshot.json";
import { SHAPES } from "../shapes";
import { stackOf } from "../testing/sample";
import { sheetItems } from "./items";

const result = validateSnapshot(structuredClone(rawSnapshot));
if (!result.ok) throw new Error(result.problems.join("\n"));
const found = result.snapshot.sheets.get("column-multiplication-1");
if (!found) throw new Error("no sheet");
const SHEET: SnapshotSheet = found;
const printed = (child: string, attempt: number, sheet = SHEET) =>
  sheetItems(sheet, child, attempt).map((i) => { const { top, sign, bottom } = stackOf(i); return `${top} ${sign} ${bottom}`; });

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
      const key = items.map((i) => `${stackOf(i).top}x${stackOf(i).bottom}`);
      expect(new Set(key).size).toBe(16);
      seen.add(key.join());
      for (const side of ["front", "back"] as const) {
        const onSide = items.filter((i) => i.side === side);
        expect(onSide.map((i) => i.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        // One look at all the questions of a side, because a look at each takes longer than making them.
        const wrong = onSide.filter((item, i) => {
          const [top, bottom, value] = [Number(stackOf(item).top), Number(stackOf(item).bottom), Number(answerLine(item.answer))];
          const carries = (top % 10) * bottom >= 10;
          const inside: Record<string, boolean> = {
            "no-carry": top >= 11 && top <= 43 && bottom >= 2 && bottom <= 4 && !carries && value <= 99,
            "one-carry": top >= 12 && top <= 49 && bottom >= 2 && bottom <= 4 && carries && value <= 99,
            "one-carry-larger": top >= 12 && top <= 49 && bottom >= 2 && bottom <= 8 && carries && value <= 99,
            "past-one-hundred": top >= 21 && top <= 98 && bottom >= 3 && value >= 100,
          };
          return !inside[item.rowId] || !Number.isFinite(item.difficulty) || (i > 0 && !(item.difficulty >= onSide[i - 1].difficulty));
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
    expect(items.filter((i) => i.rowId === "first").map((i) => answerLine(i.answer)).sort()).toEqual(["22", "33"]);
    expect(items).toHaveLength(4);
  });
});

describe("the printed order of a side", () => {
  // With no carry and no product of 100, the multiplier alone decides the difficulty: 11 × 2 and 13 × 2 are equal.
  const limits = (a: [number, number], b: [number, number]) => ({ ...(SHEET.front.rows[0].limits as object), a: { min: a[0], max: a[1] }, b: { min: b[0], max: b[1] }, product: { min: 20, max: 99 } });
  const sheetOf = (rows: { id: string; items: number; limits: unknown }[]): SnapshotSheet =>
    ({ ...SHEET, front: { ...SHEET.front, rows: rows.map((row) => ({ ...row, shape: SHEET.front.rows[0].shape })) } });
  const order = (sheet: SnapshotSheet, child: string) => sheetItems(sheet, child, 1).filter((i) => i.side === "front").map((i) => `${i.rowId} ×${stackOf(i).bottom}`);

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

describe("rows of facts", () => {
  const facts = (order: string, tables: number[], second: [number, number]) => ({ tables, second: { min: second[0], max: second[1] }, result: { min: 0, max: 100 }, order });
  type RowOf = { id: string; items: number; limits: unknown; shape?: string };
  const sheetOf = (front: RowOf[], back: RowOf[] = []): SnapshotSheet => {
    const rows = (all: RowOf[]) => all.map(({ shape = "fact.mul", ...row }) => ({ ...row, shape: SHAPES.get(shape) ?? SHEET.front.rows[0].shape }));
    return { ...SHEET, front: { ...SHEET.front, rows: rows(front) }, back: { ...SHEET.back, rows: rows(back) } };
  };
  const questions = (sheet: SnapshotSheet, child: string, side = "front") => sheetItems(sheet, child, 1).filter((i) => i.side === side).map((i) => { const { a, b } = i.question as { a: number; b: number }; return `${i.rowId} ${a}×${b}`; });
  const children = (check: (child: string) => void) => fc.assert(fc.property(fc.uuid(), check), { numRuns: 100 });

  it("in order print the table in its order, up or down, for every child", () => {
    const up = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((b) => `row 5×${b}`);
    children((child) => {
      expect(questions(sheetOf([{ id: "row", items: 9, limits: facts("up", [5], [1, 9]) }]), child)).toEqual(up);
      expect(questions(sheetOf([{ id: "row", items: 9, limits: facts("down", [5], [1, 9]) }]), child)).toEqual([...up].reverse());
    });
  });

  it("in order stay whole and in their place: the difficulty sorts the rows around them and mixes none into them", () => {
    const rows = [{ id: "first", items: 4, limits: facts("mixed", [2, 3], [2, 9]) }, { id: "table", items: 9, limits: facts("down", [4], [1, 9]) }, { id: "third", items: 3, limits: facts("mixed", [6, 7], [2, 9]) }, { id: "fourth", items: 3, limits: facts("mixed", [6, 7], [2, 9]) }];
    children((child) => {
      const items = sheetItems(sheetOf(rows), child, 1).filter((i) => i.side === "front");
      expect(items.slice(4, 13).map((i) => (i.question as { b: number }).b)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
      expect(items.map((i) => i.rowId).slice(0, 13)).toEqual([...Array<string>(4).fill("first"), ...Array<string>(9).fill("table")]);
      for (const run of [items.slice(0, 4), items.slice(13)]) run.slice(1).forEach((item, i) => expect(item.difficulty).toBeGreaterThanOrEqual(run[i].difficulty));
      expect(items).toHaveLength(19);
    });
  });

  it("never print a question twice on a side while the limits have another one, to the last question", () => {
    // 20 of 20 questions: the last place has one question left.
    const whole = sheetOf([{ id: "row", items: 20, limits: facts("mixed", [3, 4], [1, 10]) }]);
    // A row in order takes its nine, and the mixed rows before and after it have exactly the others.
    const around = sheetOf([{ id: "wide", items: 9, limits: facts("mixed", [5, 6], [1, 9]) }, { id: "table", items: 9, limits: facts("up", [5], [1, 9]) }]);
    // The narrow row below has nine questions, all of which the wide row above could take.
    const narrow = sheetOf([{ id: "wide", items: 9, limits: facts("mixed", [5, 6], [1, 9]) }, { id: "narrow", items: 9, limits: facts("mixed", [6], [1, 9]) }]);
    children((child) => {
      for (const [sheet, size] of [[whole, 20], [around, 18], [narrow, 18]] as const) expect(new Set(questions(sheet, child).map((q) => q.split(" ")[1])).size).toBe(size);
    });
  });

  it("on the back use what the front used only when nothing else is left, and then no question twice", () => {
    const table = { items: 9, limits: facts("mixed", [7], [1, 9]) };
    const both = sheetOf([{ id: "front", ...table }], [{ id: "back", ...table }]);
    const more = sheetOf([{ id: "front", ...table }], [{ id: "back", items: 9, limits: facts("mixed", [7, 8], [1, 9]) }]);
    children((child) => {
      expect(new Set(questions(both, child, "back")).size).toBe(9);
      expect(questions(more, child, "back").every((q) => q.startsWith("back 8×"))).toBe(true);
    });
  });

  it("of a shape with no list come back on a side only when the row has no other left", () => {
    const limits = { ...(SHEET.front.rows[0].limits as object), a: { min: 11, max: 12 }, b: { min: 2, max: 3 } };
    const four = { items: 4, limits, shape: "mul.column" };
    const sheet = sheetOf([{ id: "front", ...four }], [{ id: "back", ...four }]);
    for (const child of ["child-a", "child-b", "child-c"]) expect(new Set(questions(sheet, child, "back")).size).toBe(4);
  });

  it("that ask for more questions than the limits have do not pass the bank check", () => {
    const snapshot = { ...rawSnapshot, sheets: rawSnapshot.sheets.map((s) => ({ ...s, front: { ...s.front, template: "facts-2x10", rows: [{ id: "table", shape: "fact.mul", items: 11, limits: facts("up", [5], [0, 9]) }] } })) };
    expect(validateSnapshot(snapshot)).toEqual({ ok: false, problems: ['Sheet "column-multiplication-1", front side, row "table": the row asks for 11 different questions and its limits allow 10.'] });
  });

  it("in order that are not as long as the bank asks for stop the build", () => {
    const mul = SHAPES.get("fact.mul");
    if (!mul) throw new Error("no shape");
    const sheet = sheetOf([{ id: "row", items: 9, limits: facts("up", [5], [1, 9]) }]);
    const short: SnapshotSheet = { ...sheet, front: { ...sheet.front, rows: sheet.front.rows.map((row) => ({ ...row, shape: { ...mul, orderedRow: (...all) => mul.orderedRow?.(...all)?.slice(1) ?? null } })) } };
    expect(() => sheetItems(short, "child", 1)).toThrow('the row "row" in order has 8 questions and must have 9');
  });
});
