import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateSnapshot, type SnapshotSheet } from "../bank/snapshot";
import { answerLine } from "../contract";
import { canonicalJson, seedFrom } from "../hash";
import rawSnapshot from "../fixtures/snapshot.json";
import { SHAPES, type Shape } from "../shapes";
import { stackOf } from "../testing/sample";
import { itemSeed, repeatNotices, sheetItems } from "./items";

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

  it("that share a side do not repeat each other when the front used all that they have", () => {
    const front = { id: "front", items: 18, limits: facts("mixed", [7, 8], [1, 9]) };
    const sheet = sheetOf([front], [{ id: "seven", items: 9, limits: facts("mixed", [7], [1, 9]) }, { id: "both", items: 9, limits: facts("mixed", [7, 8], [1, 9]) }]);
    children((child) => {
      expect(new Set(questions(sheet, child, "back").map((q) => q.split(" ")[1])).size).toBe(18);
    });
  });

  it("of a shape with a list take what is left from the list, also when each seed gives one question", () => {
    const mul = SHAPES.get("fact.mul");
    if (!mul) throw new Error("no shape");
    const sheet = sheetOf([{ id: "row", items: 9, limits: facts("mixed", [7], [1, 9]) }]);
    const stuck = { ...mul, generate: (limits: unknown) => mul.generate(limits, "one seed") };
    const one: SnapshotSheet = { ...sheet, front: { ...sheet.front, rows: sheet.front.rows.map((row) => ({ ...row, shape: stuck })) } };
    expect(new Set(questions(one, "child")).size).toBe(9);
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
    const short: SnapshotSheet = { ...sheet, front: { ...sheet.front, rows: sheet.front.rows.map((row) => ({ ...row, shape: { ...mul, orderedRuns: (limits: unknown, items: number) => mul.orderedRuns?.(limits, items)?.map((run) => run.slice(1)) ?? null } })) } };
    expect(() => sheetItems(short, "child", 1)).toThrow('the row "row" in order has 8 questions and must have 9');
  });
});

describe("no question repeats on a side while there are enough different ones", () => {
  /** A row of 0 + b, so that a question is one number. */
  interface Small { items: number; min: number; max: number; order: "mixed" | "up" | "down" }
  const add = SHAPES.get("fact.add");
  if (!add) throw new Error("no shape");
  const rowsOf = (side: string, rows: readonly Small[]) => rows.map(({ items, min, max, order }, i) => ({ id: `${side}-${i}`, shape: add, items, limits: { tables: [0], second: { min, max }, result: { min: 0, max: 20 }, order } }));
  const sheetOf = (front: readonly Small[], back: readonly Small[] = []): SnapshotSheet => ({ ...SHEET, front: { ...SHEET.front, rows: rowsOf("front", front) }, back: { ...SHEET.back, rows: rowsOf("back", back) } });
  const valuesOf = (sheet: SnapshotSheet, child: string): Map<string, number[]> => {
    const found = new Map<string, number[]>();
    for (const item of sheetItems(sheet, child, 1)) found.set(item.rowId, [...(found.get(item.rowId) ?? []), (item.question as { b: number }).b]);
    return found;
  };
  const sideOf = (values: Map<string, number[]>, side: string) => [...values].filter(([id]) => id.startsWith(side)).flatMap(([, all]) => all);
  const isDifferent = (values: readonly number[]) => new Set(values).size === values.length;
  const row = (items: number, min: number, max: number, order: Small["order"] = "mixed"): Small => ({ items, min, max, order });
  const children = Array.from({ length: 60 }, (_, i) => `child-${i}`);

  it.each<[string, Small[]]>([
    ["two mixed rows that need each other's numbers", [row(2, 0, 2), row(2, 1, 3)]],
    ["a row in order and a mixed row", [row(3, 0, 3, "up"), row(1, 2, 3)]],
    ["two rows in order", [row(2, 0, 3, "up"), row(2, 0, 3, "down")]],
    ["three mixed rows in a chain", [row(2, 0, 2), row(2, 1, 3), row(2, 3, 5)]],
    ["a row in order between two mixed rows that fill both ends", [row(2, 0, 4), row(2, 0, 6, "up"), row(3, 2, 6)]],
    ["seven rows in order that fill 20 numbers without a gap", [...Array.from({ length: 6 }, () => row(3, 0, 19, "up")), row(2, 0, 19, "down")]],
  ])("%s", (_name, rows) => {
    const sheet = sheetOf(rows);
    const started = performance.now();
    for (const child of children) expect(isDifferent(sideOf(valuesOf(sheet, child), "front"))).toBe(true);
    expect(performance.now() - started).toBeLessThan(6000);
  });

  it.each<[string, Small[], Small[]]>([
    ["rows in order", [row(3, 0, 5, "up")], [row(3, 0, 5, "up")]],
    ["rows in order that go down", [row(3, 0, 5, "down")], [row(3, 0, 5, "down")]],
    ["mixed rows", [row(3, 0, 5)], [row(3, 0, 3)]],
    ["a mixed row and a row in order", [row(4, 0, 6)], [row(3, 0, 6, "up")]],
  ])("and none is on both sides of a sheet: %s", (_name, front, back) => {
    for (const child of children) expect(isDifferent([...valuesOf(sheetOf(front, back), child).values()].flat())).toBe(true);
  });

  it("the back uses as few of the questions of the front as it can, when it must use some", () => {
    const starts = new Set<number>();
    for (const child of children) {
      const values = valuesOf(sheetOf([row(4, 0, 5)], [row(4, 0, 5)]), child);
      const front = sideOf(values, "front");
      expect(sideOf(values, "back").filter((b) => front.includes(b))).toHaveLength(2);
      expect(isDifferent(sideOf(values, "back"))).toBe(true);
      const ordered = valuesOf(sheetOf([row(4, 0, 5, "up")], [row(4, 0, 5, "up")]), child);
      const [first, second] = [sideOf(ordered, "front"), sideOf(ordered, "back")];
      const fewest = Math.min(...[0, 1, 2].map((start) => [0, 1, 2, 3].filter((i) => first.includes(start + i)).length));
      expect(second.filter((b) => first.includes(b))).toHaveLength(fewest);
      starts.add(first[0]);
    }
    expect([...starts].sort()).toEqual([0, 1, 2]);
  });

  it("rows in order stay apart when they can, also on a side that must repeat a question", () => {
    for (const child of children) {
      const values = valuesOf(sheetOf([row(2, 0, 1, "up"), row(2, 0, 3, "up"), row(3, 0, 2)]), child);
      expect([values.get("front-0"), values.get("front-1")]).toEqual([[0, 1], [2, 3]]);
    }
  });

  // Brute force: every run of a row in order and every set of a mixed row, one row after the other.
  const choicesOf = ({ items, min, max, order }: Small): number[][] => {
    const all = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    if (order !== "mixed") return all.slice(0, all.length - items + 1).map((_, start) => all.slice(start, start + items));
    const sets = (from: number, left: number): number[][] => (left === 0 ? [[]] : all.slice(from).flatMap((n, i) => sets(from + i + 1, left - 1).map((rest) => [n, ...rest])));
    return sets(0, items);
  };
  const canDiffer = (rows: readonly Small[], used: readonly number[] = []): boolean => rows.length === 0 || choicesOf(rows[0]).some((choice) => choice.every((n) => !used.includes(n)) && canDiffer(rows.slice(1), [...used, ...choice]));
  const small = fc.tuple(fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 4 }), fc.integer({ min: 1, max: 3 }), fc.constantFrom("mixed" as const, "mixed" as const, "up" as const, "down" as const))
    .map(([x, y, items, order]): Small => row(Math.min(items, Math.abs(x - y) + 2), Math.min(x, y), Math.max(x, y) + 1, order));

  it("a repeat is only there when no choice of the rows is without one, and then the build names the row", () => {
    fc.assert(fc.property(fc.array(small, { minLength: 1, maxLength: 3 }), fc.array(small, { minLength: 1, maxLength: 2 }), fc.nat(30), (front, back, child) => {
      const sheet = sheetOf(front, back);
      const items = sheetItems(sheet, `child-${child}`, 1);
      const values = valuesOf(sheet, `child-${child}`);
      for (const [side, rows] of [["front", front], ["back", back]] as const) {
        rows.forEach(({ items: count, min, max, order }, i) => {
          const own = values.get(`${side}-${i}`) ?? [];
          expect([own.length, isDifferent(own), own.every((n) => n >= min && n <= max)]).toEqual([count, true, true]);
          if (order !== "mixed") own.slice(1).forEach((n, j) => expect(n - own[j]).toBe(order === "up" ? 1 : -1));
        });
        const repeats = !isDifferent(sideOf(values, side));
        expect(repeats).toBe(!canDiffer(rows));
        expect(repeatNotices(sheet, items).some((notice) => notice.includes(`${side} side, row "${side}-`) && notice.includes("on this side"))).toBe(repeats);
      }
      const both = sideOf(values, "front").some((n) => sideOf(values, "back").includes(n));
      if (canDiffer([...front, ...back])) expect(isDifferent([...values.values()].flat())).toBe(true);
      expect(repeatNotices(sheet, items).some((notice) => notice.includes("on the front side"))).toBe(both);
      expect(sheetItems(sheet, `child-${child}`, 1)).toEqual(items);
    }), { numRuns: 300, seed: 238 });
  });

  it("names each row with a repeat, and how many, and says nothing of a sheet with none", () => {
    const sheet = sheetOf([row(3, 0, 2), row(2, 1, 2)], [row(3, 0, 2, "up")]);
    expect(repeatNotices(sheet, sheetItems(sheet, "child", 1))).toEqual([
      'Sheet "column-multiplication-1", front side, row "front-1": 2 questions are on this side more than once.',
      'Sheet "column-multiplication-1", back side, row "back-0": 3 questions are on the front side too.',
    ]);
    const items = sheetItems(SHEET, "child", 1);
    expect(repeatNotices(SHEET, items)).toEqual([]);
    const [first, second] = items;
    expect(second.rowId).toBe(first.rowId);
    expect(repeatNotices(SHEET, items.with(1, { ...second, question: first.question }))).toEqual([`Sheet "column-multiplication-1", front side, row "${first.rowId}": 1 question is on this side more than once.`]);
  });

  it("the first question of a row is the one that its seed gives, when nothing is in its way", () => {
    for (const child of children) {
      const [first] = sheetItems(sheetOf([row(1, 0, 19)]), child, 1);
      expect(first.question).toEqual(add.generate(rowsOf("front", [row(1, 0, 19)])[0].limits, itemSeed(seedFrom(child, SHEET.id, 1), "front", "front-0", 0, 0)).question);
    }
  });
});

describe("the tries of a shape with no list", () => {
  type RowOf = { id: string; items: number; limits: unknown };
  const r = (min: number, max: number) => ({ min, max });
  /** A small space whose shape does not say its list, and the eight column additions that a review found slow. */
  const unlisted: Shape = { ...(SHAPES.get("fact.mul") as Shape), list: undefined, orderedRuns: undefined };
  const table = (low: number, high: number, tables = [7]) => ({ tables, second: r(low, high), result: r(0, 100), order: "mixed" });
  const EIGHT = table(1, 8);
  const row = (id: string, items: number, limits: unknown = EIGHT): RowOf => ({ id, items, limits });

  /** A sheet, and how many questions its build asks the shape for. */
  function watched(front: RowOf[], back: RowOf[], shape = unlisted) {
    let asked = 0;
    const counting: Shape = { ...shape, generate: (limits, seed) => { asked++; return shape.generate(limits, seed); } };
    const rows = (all: RowOf[]) => all.map((one) => ({ ...one, shape: counting }));
    const sheet: SnapshotSheet = { ...SHEET, front: { ...SHEET.front, rows: rows(front) }, back: { ...SHEET.back, rows: rows(back) } };
    return { sheet, askedFor: (child: string) => { asked = 0; sheetItems(sheet, child, 1); return asked; } };
  }
  /** Each question by asking 500 times, always: the first of those that the fewest of the sheet, the side and the row have. */
  function byAllTries(sheet: SnapshotSheet, child: string): string[] {
    const seed = seedFrom(child, sheet.id, 1);
    const onSheet = new Set<string>();
    return (["front", "back"] as const).flatMap((side) => {
      const onSide = new Set<string>();
      return sheet[side].rows.flatMap((one) => {
        const inRow = new Set<string>();
        return Array.from({ length: one.items }, (_, place) => {
          const tries = Array.from({ length: 500 }, (_unused, i) => canonicalJson(one.shape.generate(one.limits, itemSeed(seed, side, one.id, place, i)).question));
          const uses = tries.map((key) => [onSheet, onSide, inRow].filter((on) => on.has(key)).length);
          const key = tries[uses.indexOf(Math.min(...uses))];
          for (const on of [onSheet, onSide, inRow]) on.add(key);
          return `${side} ${one.id} ${key}`;
        });
      });
    });
  }
  const said = (sheet: SnapshotSheet, child: string) => sheetItems(sheet, child, 1).map((i) => `${i.side} ${i.rowId} ${canonicalJson(i.question)}`).sort();

  it.each<[string, RowOf[], RowOf[], number]>([
    ["both sides ask for all eight questions", [row("f", 8)], [row("b", 8)], 120],
    ["a side asks two times for all eight", [row("f", 8), row("g", 8)], [row("b", 8)], 260],
    ["a side has some questions left", [row("f", 5)], [row("b", 5)], 60],
    ["the back may ask for two more", [row("f", 8)], [row("b", 8, table(1, 10))], 260],
    ["a row of the back asks for a part of the front", [row("f", 8)], [row("b", 3, table(6, 8))], 90],
    ["a row of one question on both sides", [row("f", 1, table(3, 3))], [row("b", 1, table(3, 3))], 2],
    ["rows have some questions of each other", [row("f", 4), row("g", 4, table(4, 10))], [row("b", 4, table(4, 10)), row("c", 4)], 260],
    ["rows say the same questions in other ways", [row("f", 8)], [row("b", 8, { ...EIGHT, result: r(7, 56) })], 120],
    ["there are many questions", [row("f", 8, table(1, 10, [3, 4, 6, 7, 8, 9]))], [row("b", 8, table(1, 10, [3, 4, 6, 7, 8, 9]))], 40],
  ])("end when no question of the row is less used, and give the question of all 500 tries: %s", (_name, front, back, most) => {
    const { sheet, askedFor } = watched(front, back);
    for (const child of ["child-a", "child-b"]) {
      expect(said(sheet, child)).toEqual(byAllTries(sheet, child).sort());
      expect(askedFor(child)).toBeLessThanOrEqual(most);
    }
  });

  it("are few for the eight column additions that both sides ask for, and the repeats are named as before", () => {
    const any = "allowed";
    const limits = {
      aDigits: r(4, 4), bDigits: r(4, 4), a: r(4131, 4138), b: r(1968, 1968), sum: r(2, 19_998), carries: r(0, 3), carryIntoTens: r(0, 1), carryIntoHundreds: r(0, 1), carryIntoThousands: r(0, 1), carryChain: any,
      aZeroInOnes: any, aZeroInTens: any, aZeroInHundreds: any, bZeroInOnes: any, bZeroInTens: any, bZeroInHundreds: any, zeroInSum: any,
    };
    const { sheet, askedFor } = watched([row("f", 8, limits)], [row("b", 8, limits)], SHAPES.get("add.column"));
    expect(askedFor("child")).toBeLessThanOrEqual(120);
    expect(repeatNotices(sheet, sheetItems(sheet, "child", 1))).toEqual([`Sheet "${sheet.id}", back side, row "b": 8 questions are on the front side too.`]);
  });

  it("go on to the last one for a shape that counts more questions than it gives", () => {
    const { sheet, askedFor } = watched([row("f", 2)], [], { ...unlisted, count: () => 2, generate: (limits) => unlisted.generate(limits, "one") });
    expect(askedFor("child")).toBe(501);
    expect(said(sheet, "child")).toEqual(byAllTries(sheet, "child").sort());
  });
});
