import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Example, PageRecord, PageSection } from "@/lib/reference-record";
import { pairRemainingExamples, pairSections, sectionPathIn } from "./compare-align";

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

describe("sectionPathIn", () => {
  it("gives the path of a section in the other reading", () => {
    const page = (...names: string[]): PageRecord => ({
      kind: "page",
      source_ref: "sample:M:3a",
      topic: { title: "Practice" },
      sections: sections(...names),
      examples: [],
      score_bands: "unclear",
    });
    const a = page("Add.", "Subtract.");
    const b = page("Subtract.");
    expect(sectionPathIn("sections[1].items[n=1].responses[0]", a, b)).toBe("sections[0].items[n=1].responses[0]");
    expect(sectionPathIn("sections[0].items[n=1].responses[0]", a, b)).toBeNull();
    expect(sectionPathIn("topic.title", a, b)).toBe("topic.title");
  });
});
