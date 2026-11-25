import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Example, PageRecord, PageSection } from "@/lib/reference-record";
import { classifyComparison } from "./compare";
import { pairedItem, pairRemainingExamples, pairSections } from "./compare-align";

const section = (instruction: PageSection["instruction"]): PageSection => ({ instruction, scaffolds: [], items: [] });
const sections = (...names: Array<string | null>): PageSection[] => names.map(section);
const example = (label: string | null, position: Example["position"], text?: string): Example => ({
  position,
  relation: "compare",
  label,
  parts: [],
  ...(text ? { text } : {}),
});

describe("pairSections", () => {
  it("pairs sections by name, then in order, and never two with different names", () => {
    const rows: Array<[string, Array<string | null>, Array<string | null>, Array<[number, number]>]> = [
      ["no names", [null, null, null], [null, null], [[0, 0], [1, 1]]],
      ["same names", ["Add.", "Subtract."], ["add", "SUBTRACT"], [[0, 0], [1, 1]]],
      ["repeated name", ["Add.", "Add."], ["Add."], [[0, 0]]],
      ["first one missing", ["Add.", "Subtract."], ["Subtract."], [[1, 0]]],
      ["different names", ["Add."], ["Subtract."], []],
      ["a name of signs only", ["."], ["Subtract."], []],
      ["one reader gives no name", ["Add."], [null], [[0, 0]]],
      ["unclear name", ["Add."], ["unclear"], [[0, 0]]],
      ["spaces at a sign", ["Draw y = - 3x"], ["Draw y = −3x."], [[0, 0]]],
      ["different numbers", ["Add 2 1/2."], ["Add 21/2."], []],
      ["opposite order", ["Add.", "Subtract."], ["Subtract.", "Add."], [[1, 0]]],
      ["a name between two without", [null, "Add.", null], ["Add.", null], [[1, 0], [2, 1]]],
    ];
    for (const [label, a, b, pairs] of rows) expect(pairSections(sections(...a), sections(...b)), label).toEqual(pairs);
  });

  it("property: equal lists pair one to one, pairs never cross, and different names never pair", () => {
    const names = fc.array(fc.constantFrom("Add.", "Subtract.", "Multiply.", null), { maxLength: 6 });
    fc.assert(
      fc.property(names, names, (a, b) => {
        expect(pairSections(sections(...a), sections(...a))).toEqual(a.map((_, i) => [i, i]));
        const pairs = pairSections(sections(...a), sections(...b));
        for (const [k, [i, j]] of pairs.entries()) {
          expect(a[i] === null || b[j] === null || a[i] === b[j]).toBe(true);
          if (k > 0) expect(i > pairs[k - 1][0] && j > pairs[k - 1][1]).toBe(true);
        }
      }),
    );
  });
});

describe("pairRemainingExamples", () => {
  it("never pairs different labels or places, except the same example called inline and top or foot", () => {
    const sameText = (x: Example, y: Example): boolean => x.text === y.text;
    const pairs = (a: Example[], b: Example[]) => pairRemainingExamples(a, b, sameText);
    expect(pairs([example("Ex. 1", "top")], [example("Ex. 2", "top")])).toEqual([]);
    expect(pairs([example(null, "top")], [example(null, "foot")])).toEqual([]);
    expect(pairs([example(null, "top", "A")], [example(null, "inline", "B")])).toEqual([]);
    expect(pairs([example(null, "top", "A")], [example(null, "inline", "A")])).toEqual([[0, 0]]);
    expect(pairs([example(null, "foot", "A")], [example("Note", "inline", "A")])).toEqual([[0, 0]]);
    expect(pairs([example("Ex. 1", "top")], [example(null, "top")])).toEqual([[0, 0]]);
    expect(pairs([example(null, "unclear")], [example(null, "foot")])).toEqual([[0, 0]]);
    expect(pairs([example(null, "top"), example(null, "foot")], [example(null, "foot")])).toEqual([[1, 0]]);
  });
});

const page = (secs: PageSection[], examples: Example[] = []): PageRecord => ({
  kind: "page",
  source_ref: "sample:M:3a",
  topic: { title: "Practice" },
  sections: secs,
  examples,
  score_bands: "unclear",
});

describe("pairedItem", () => {
  const withItems = (instruction: string, ...ns: number[]): PageSection => ({
    ...section(instruction),
    items: ns.map((n) => ({ n, printed: `${instruction} ${n}`, form: null, expr: null, responses: [] })),
  });
  it("finds an item in the paired section, or by a number that is unique in both pages", () => {
    const a = page([withItems("Add.", 1, 2), withItems("Subtract.", 1, 3)]);
    const b = page([withItems("Subtract.", 1, 3), withItems("Draw.", 2)]);
    expect(pairedItem(a, b, 1, 1)?.printed).toBe("Subtract. 1");
    expect(pairedItem(a, b, 0, 2)?.printed).toBe("Draw. 2");
    expect(pairedItem(a, b, 0, 1)).toBeUndefined();
    expect(pairedItem(b, a, 1, 2)?.printed).toBe("Add. 2");
    expect(pairedItem(a, b, 1, 9)).toBeUndefined();
  });
});

describe("the place of an entry that only reader B has", () => {
  // Entry x of the list, with or without its own name.
  const exprOf = (x: number) => ({ kind: "arith" as const, op: "add" as const, operands: [x, 1] });
  const nameOf = (x: number, names: string): string | null =>
    names === "own" ? `Name ${"abcdefgh"[x]}` : names === "same" ? "Name" : null;
  const build = (kind: string, list: number[], names: string): PageRecord => {
    const part = (x: number, caption: string | null) => ({ form: "horizontal" as const, caption, expr: exprOf(x) });
    if (kind === "examples") {
      return page(sections("Add."), list.map((x) => ({ ...example(nameOf(x, names), "top"), parts: [part(x, null)] })));
    }
    if (kind === "parts") {
      return page(sections("Add."), [{ ...example(null, "top"), parts: list.map((x) => part(x, nameOf(x, names))) }]);
    }
    return page(
      list.map((x) => ({
        ...section(nameOf(x, names)),
        items: [{ n: 1, printed: `${x} + 1 =`, form: "horizontal" as const, expr: exprOf(x), responses: [] }],
      })),
    );
  };

  it("property: a place that is given is always right, after random omissions and swaps", () => {
    const subset = fc.subarray([0, 1, 2, 3, 4, 5], { minLength: 1 });
    fc.assert(
      fc.property(
        fc.constantFrom("examples", "parts", "sections"),
        fc.constantFrom("own", "same", "none"),
        subset,
        subset,
        fc.option(fc.nat({ max: 4 })),
        (kind, names, listA, drawnB, swapAt) => {
          const listB = [...drawnB];
          if (swapAt !== null && swapAt + 1 < listB.length) listB.splice(swapAt, 2, listB[swapAt + 1], listB[swapAt]);
          const { once_read } = classifyComparison(build(kind, listA, names), build(kind, listB, names));
          for (const d of once_read) {
            const index = /\[(b:)?(\d+)\]$/.exec(d.path);
            if (!index || !d.path.includes(kind)) continue;
            const at = Number(index[2]);
            if (index[1] === undefined) {
              // Reader A's record is the final record: the entry stands where reader A has it.
              expect(d.final_path?.endsWith(`[${at}]`)).toBe(true);
            } else if (d.final_path !== undefined) {
              expect(d.final_path.endsWith("[]")).toBe(true);
              expect(listB.slice(0, at)).toEqual(listA);
              expect(listA).not.toContain(listB[at]);
            } else {
              expect([d.reader_b_after, d.reader_b_before]).toEqual([at > 0 ? at : null, at + 1 < listB.length ? at + 2 : null]);
            }
            expect(d.insert_before).toBeUndefined();
          }
        },
      ),
      { numRuns: 2000 },
    );
    const last = classifyComparison(build("sections", [0, 1], "own"), build("sections", [0, 1, 2], "own")).once_read;
    expect(last.map((d) => d.final_path)).toEqual(["sections[]"]);
  });
});
