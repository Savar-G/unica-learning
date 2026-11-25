// What the harness (testing/shape-harness.ts) does not say of the small shapes: which question a seed picks, and which part
// of a table a row in order takes.
import { describe, expect, it } from "vitest";
import { canonicalJson, pick, seedFrom } from "../hash";
import { SHAPE_REGISTRATIONS } from "../testing/shape-registrations";
import { isInside, type Limits, type Rows } from "../testing/shape-registration";
import { factAdd, factMul, factSub, type FactLimits } from "./facts";
import { SHAPES } from "./index";

const listed = SHAPE_REGISTRATIONS.filter((reg) => SHAPES.get(reg.id)?.list);
const cases = listed.flatMap((reg) => reg.cases.map((c) => [reg.id, c.name, c.limits] as const));

describe("the question of a seed", () => {
  it("is looked at in each small space", () => {
    expect(listed.map((reg) => reg.id)).toEqual(["fact.add", "fact.sub", "fact.mul", "add.repeated", "missing.factor", "missing.addend"]);
  });

  it.each(cases)("has an equal chance, because it is the one at the place that the seed picks: %s, %s", (id, _name, limits) => {
    const reg = SHAPE_REGISTRATIONS.find((r) => r.id === id);
    const shape = SHAPES.get(id);
    if (!reg || !shape?.list) throw new Error("no shape");
    const rowsInside = (reg.space as readonly Rows[]).filter((rows) => { const printed = reg.read(rows); return printed !== null && isInside(reg, printed, limits as Limits); });
    const all = shape.list(limits).map((question) => canonicalJson(question));
    expect(new Set(all)).toEqual(new Set(rowsInside.map((rows) => canonicalJson(shape.solveAgain(rows)?.question))));
    const seeds = Array.from({ length: 60 }, (_, i) => seedFrom("place", i));
    expect(seeds.map((seed) => canonicalJson(shape.generate(limits, seed).question))).toEqual(seeds.map((seed) => all[pick(seed, all.length)]));
  });
});

describe("a row in order", () => {
  const wide = (tables: number[], order: FactLimits["order"], max = 10): FactLimits => ({ tables, second: { min: 0, max }, result: { min: 0, max: 100 }, order });
  const texts = (limits: FactLimits, items: number) => (factMul.orderedRuns?.(limits, items) ?? []).map((run) => run.map(({ a, b }) => `${a}×${b}`));

  it("is a part of one table when a table is long enough, and each such part is there", () => {
    const rows = texts(wide([2, 5], "up"), 9);
    for (const row of rows) expect(new Set(row.map((t) => t.split("×")[0])).size).toBe(1);
    expect(rows.map(([first]) => first)).toEqual(["2×0", "2×1", "2×2", "5×0", "5×1", "5×2"]);
  });

  it("goes on with the next table when no table is long enough", () => {
    expect(texts(wide([2, 5], "up", 2), 6)).toEqual([["2×0", "2×1", "2×2", "5×0", "5×1", "5×2"]]);
    expect(texts(wide([2, 5], "down", 2), 6)).toEqual([["5×2", "5×1", "5×0", "2×2", "2×1", "2×0"]]);
  });

  it("is only for limits that ask for one", () => expect(factMul.orderedRuns?.(wide([2], "mixed"), 3)).toBeNull());
});

describe("the swapped form", () => {
  const limits: FactLimits = { tables: [5], second: { min: 1, max: 10 }, result: { min: 0, max: 100 }, order: "mixed" };
  it("turns the two numbers round, and says whether the row allows it", () => {
    expect(factMul.swapped?.({ a: 5, b: 7 }, limits)).toEqual({ question: { a: 7, b: 5 }, inLimits: false });
    expect(factMul.swapped?.({ a: 5, b: 7 }, { ...limits, tables: [5, 7] })).toEqual({ question: { a: 7, b: 5 }, inLimits: true });
    expect(factAdd.swapped?.({ a: 3, b: 5 }, { ...limits, tables: [3, 5] })).toEqual({ question: { a: 5, b: 3 }, inLimits: true });
  });
  it("is not there for two equal numbers, and not for subtraction", () => {
    expect([factMul.swapped?.({ a: 5, b: 5 }, limits), factAdd.swapped?.({ a: 5, b: 5 }, limits)]).toEqual([null, null]);
    expect(factSub.swapped).toBeUndefined();
  });
});
