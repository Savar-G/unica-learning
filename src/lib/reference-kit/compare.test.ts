import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { NOT_STATED, UNCLEAR, type PageRecord } from "@/lib/reference-record";
import {
  compareRecords,
  decideStatus,
  needsPersonRead,
  normalizeNotationText,
  normalizeProseText,
} from "./compare";

function makePage(overrides?: Partial<PageRecord>): PageRecord {
  return {
    kind: "page",
    source_ref: "sample:M:3a",
    topic: { title: "Adding Numbers", number: 1 },
    sections: [
      {
        instruction: "Add the numbers.",
        scaffolds: [],
        items: [
          {
            n: 1,
            printed: "12 + 5 =",
            form: "horizontal",
            expr: { kind: "arith", op: "add", operands: [12, 5] },
            responses: [
              { position: "after_equals", cue: null, answer: "17", answer_source: "computed" },
            ],
          },
          {
            n: 2,
            printed: "20 + 6 =",
            form: "horizontal",
            expr: { kind: "arith", op: "add", operands: [20, 6] },
            responses: [
              { position: "after_equals", cue: null, answer: "26", answer_source: "computed" },
            ],
          },
          {
            n: 3,
            printed: "31 + 4 =",
            form: "horizontal",
            expr: { kind: "arith", op: "add", operands: [31, 4] },
            responses: [
              { position: "after_equals", cue: null, answer: "35", answer_source: "computed" },
            ],
          },
        ],
      },
    ],
    examples: [],
    score_bands: [
      [100, 100],
      [90, 99],
      [80, 89],
      [70, 79],
      [0, 69],
    ],
    readers: ["claude:test"],
    ...overrides,
  };
}

describe("normalisers", () => {
  it("normalises prose text for case, spacing, quotes, dashes, and final punctuation while preserving numbers and decimals", () => {
    expect(normalizeProseText("Add  the numbers.")).toBe(normalizeProseText("add the numbers"));
    expect(normalizeProseText('\u201cFind\u201d the sum \u2013 fast.')).toBe(
      normalizeProseText('"find" the sum - fast'),
    );
    expect(normalizeProseText("  Write 'yes'  ")).toBe(normalizeProseText("write 'yes'"));
    expect(normalizeProseText("Draw a box!")).toBe(normalizeProseText("Draw a box."));
    expect(normalizeProseText("Draw a box?")).toBe(normalizeProseText("Draw a box"));
    expect(normalizeProseText("Measure 3.5 cm.")).not.toBe(normalizeProseText("Measure 35 cm."));
    expect(normalizeProseText("3.5")).not.toBe(normalizeProseText("35"));
  });

  it("normalises notation text across operator signs, spaces, superscripts, and fraction grouping including nested fractions", () => {
    expect(normalizeNotationText("2 \\times 3 = 6")).toBe(normalizeNotationText("2×3=6"));
    expect(normalizeNotationText("2 \\cdot 3")).toBe(normalizeNotationText("2 * 3"));
    expect(normalizeNotationText("12 \\div 3")).toBe(normalizeNotationText("12 ÷ 3"));
    expect(normalizeNotationText("12 ÷ 3")).toBe(normalizeNotationText("12 / 3"));
    expect(normalizeNotationText("5 − 2")).toBe(normalizeNotationText("5 - 2"));
    expect(normalizeNotationText("\\frac{1}{2} + 1⁄4")).toBe("((1)/(2))+1/4");
    expect(normalizeNotationText("\\frac{1+2}{3}")).not.toBe(normalizeNotationText("1+2/3"));
    expect(normalizeNotationText("\\frac{1+2}{3}")).toBe(normalizeNotationText("((1+2)/(3))"));
    expect(normalizeNotationText("\\frac{\\frac{1}{2}}{3}")).not.toBe(
      normalizeNotationText("\\frac{1}{\\frac{2}{3}}"),
    );
    expect(normalizeNotationText("\\frac{\\frac{1+2}{3}}{4+5}")).not.toBe(
      normalizeNotationText("1+2/3/4+5"),
    );
  });

  it("keeps distinct mathematics unequal including superscripts, mixed numbers, and fraction grouping", () => {
    expect(normalizeNotationText("2\u00B2")).not.toBe(normalizeNotationText("22"));
    expect(normalizeNotationText("2\u00B2")).toBe(normalizeNotationText("2^2"));
    expect(normalizeNotationText("\\frac{1}{2}x")).not.toBe(
      normalizeNotationText("\\frac{1}{2x}"),
    );
    expect(normalizeNotationText("\\frac{1}{2}x")).toBe("((1)/(2))x");
    expect(normalizeNotationText("\\frac{1}{2x}")).toBe("((1)/(2x))");
    expect(normalizeNotationText("(x)")).not.toBe(normalizeNotationText("x"));

    // Mixed numbers must stay distinct from whole-number fractions, while operator spaces collapse.
    expect(normalizeNotationText("2 1/2")).toBe("2 1/2");
    expect(normalizeNotationText("2  1/2")).toBe("2 1/2");
    expect(normalizeNotationText("2 1/2")).not.toBe(normalizeNotationText("21/2"));
    expect(normalizeNotationText("1 2/5")).toBe("1 2/5");
    expect(normalizeNotationText("1 2/5")).not.toBe(normalizeNotationText("12/5"));
    expect(normalizeNotationText("24 + 5")).toBe("24+5");
  });

  it("satisfies the fast-check invariant that equal normalized notation preserves spaces separating letters or digits", () => {
    const alphabet = [
      ..."0123456789",
      ..."abcxyzXYZ",
      "+",
      "-",
      "*",
      "/",
      "=",
      "^",
      "(",
      ")",
      "{",
      "}",
      "\u00D7",
      "\u00B7",
      "\u2217",
      "\u00F7",
      "\u2044",
      "\u2215",
      "\u2212",
      "\u2013",
      "\u2070",
      "\u00B9",
      "\u00B2",
      "\u00B3",
      "\u2074",
      "\u2075",
      "\u2076",
      "\u2077",
      "\u2078",
      "\u2079",
      " ",
      "\t",
    ];
    const supMap: Record<string, string> = {
      "\u2070": "^0",
      "\u00B9": "^1",
      "\u00B2": "^2",
      "\u00B3": "^3",
      "\u2074": "^4",
      "\u2075": "^5",
      "\u2076": "^6",
      "\u2077": "^7",
      "\u2078": "^8",
      "\u2079": "^9",
    };
    const stripAndMap = (s: string): string =>
      s
        .replace(/[\u00D7\u00B7\u2217]/g, "*")
        .replace(/[\u00F7\u2044\u2215]/g, "/")
        .replace(/[\u2010-\u2015\u2212]/g, "-")
        .replace(/[\u2070\u00B9\u00B2\u00B3\u2074-\u2079]/g, (ch) => supMap[ch] ?? ch)
        .replace(/(?<=[\p{L}\p{N}])\s+(?=[\p{L}\p{N}])/gu, " ")
        .replace(/(?<![\p{L}\p{N}])\s+|\s+(?![\p{L}\p{N}])/gu, "");

    const arbStr = fc.string({ unit: fc.constantFrom(...alphabet), maxLength: 6 });
    const compactAlphabet = [..."012x+*/-^(){} ", "\u00B2", "\u00B3", "\u00D7", "\u00F7", "\u2212"];
    const arbCompact = fc.string({ unit: fc.constantFrom(...compactAlphabet), maxLength: 5 });
    fc.assert(
      fc.property(arbStr, arbStr, (a, b) => {
        if (normalizeNotationText(a) === normalizeNotationText(b)) {
          expect(stripAndMap(a)).toBe(stripAndMap(b));
        }
      }),
      { numRuns: 500 },
    );
    fc.assert(
      fc.property(arbCompact, arbCompact, (a, b) => {
        if (normalizeNotationText(a) === normalizeNotationText(b)) {
          expect(stripAndMap(a)).toBe(stripAndMap(b));
        }
      }),
      { numRuns: 1000 },
    );
    // Inserting whitespace between two letters or digits must never compare equal to no whitespace.
    const arbAlnum = fc.constantFrom(..."0123456789abcxyzXYZ");
    const arbSpaces = fc.string({ unit: fc.constantFrom(" ", "\t"), minLength: 1, maxLength: 3 });
    fc.assert(
      fc.property(arbAlnum, arbSpaces, arbAlnum, (left, ws, right) => {
        expect(normalizeNotationText(`${left}${ws}${right}`)).toBe(`${left} ${right}`);
        expect(normalizeNotationText(`${left}${ws}${right}`)).not.toBe(
          normalizeNotationText(`${left}${right}`),
        );
      }),
      { numRuns: 300 },
    );
  });
});

describe("compareRecords", () => {
  it("returns no differences for equal records even with different reader tags", () => {
    const a = makePage({ readers: ["claude:a"] });
    const b = makePage({ readers: ["codex:b"] });
    expect(compareRecords(a, b)).toEqual([]);
  });

  it("reports one changed operand", () => {
    const a = makePage();
    const b = makePage();
    b.sections[0].items[0].expr = { kind: "arith", op: "add", operands: [12, 8] };
    b.sections[0].items[0].responses[0].answer = "20";

    const diffs = compareRecords(a, b);
    expect(diffs.some((d) => d.kind === "value" && d.path.includes("operands[1]"))).toBe(true);
  });

  it("treats instruction and caption text differing only in case, spacing, and punctuation as equal", () => {
    const a = makePage();
    const b = makePage();
    a.sections[0].instruction = "Add  the numbers.";
    b.sections[0].instruction = "add the numbers";
    a.sections[0].scaffolds = [{ kind: "caption", applies_to: "all", text: '\u201cCheck\u201d your work.' }];
    b.sections[0].scaffolds = [{ kind: "caption", applies_to: "all", text: '"check"  your work' }];
    expect(compareRecords(a, b)).toEqual([]);
  });

  it("treats notation variants as equal", () => {
    const a = makePage();
    const b = makePage();
    a.sections[0].items = [
      {
        n: 1,
        printed: "1/2 × 3",
        form: "horizontal",
        expr: { kind: "notation", latex: "\\frac{1}{2} \\times 3" },
        responses: [{ position: "after_equals", cue: null, answer: "3/2", answer_source: "reader" }],
      },
    ];
    b.sections[0].items = [
      {
        n: 1,
        printed: "1/2 * 3",
        form: "horizontal",
        expr: { kind: "notation", latex: "((1)/(2)) * 3" },
        responses: [{ position: "after_equals", cue: null, answer: "3/2", answer_source: "reader" }],
      },
    ];
    expect(compareRecords(a, b)).toEqual([]);
  });

  it("matches items by item number so one missing item gives one difference without shifting later items", () => {
    const a = makePage();
    const b = makePage();
    b.sections[0].items = [b.sections[0].items[0], b.sections[0].items[2]];

    const diffs = compareRecords(a, b);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].kind).toBe("value");
    expect(diffs[0].path).toBe("sections[0].items[n=2]");
  });

  it("classifies a once-read example as once_read", () => {
    const a = makePage({
      examples: [
        {
          position: "top",
          relation: "compare",
          parts: [
            {
              form: "horizontal",
              expr: { kind: "arith", op: "add", operands: [2, 3] },
              shown_answer: "5",
            },
          ],
        },
      ],
    });
    const b = makePage({ examples: [] });

    const diffs = compareRecords(a, b);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].kind).toBe("once_read");
  });

  it("classifies both_unclear and one_unclear fields distinctly", () => {
    const a = makePage();
    const b = makePage();
    a.topic.title = UNCLEAR;
    b.topic.title = UNCLEAR;
    a.sections[0].items[0].form = UNCLEAR;
    b.sections[0].items[0].form = "horizontal";

    const diffs = compareRecords(a, b);
    expect(diffs).toContainEqual({
      path: "topic.title",
      a: UNCLEAR,
      b: UNCLEAR,
      kind: "both_unclear",
    });
    expect(diffs).toContainEqual({
      path: "sections[0].items[n=1].form",
      a: UNCLEAR,
      b: "horizontal",
      kind: "one_unclear",
    });
  });

  it("reports different sheet ids", () => {
    const a = makePage({ source_ref: "sample:M:3a" });
    const b = makePage({ source_ref: "sample:M:3b" });
    const diffs = compareRecords(a, b);
    expect(diffs).toContainEqual({
      path: "source_ref",
      a: "sample:M:3a",
      b: "sample:M:3b",
      kind: "value",
    });
  });

  it("detects needs_person_read for example, word problem, scaffold caption, or figure", () => {
    expect(needsPersonRead(makePage())).toBe(false);
    expect(
      needsPersonRead(
        makePage({
          examples: [
            {
              position: "top",
              relation: "sequence",
              parts: [{ form: "horizontal", expr: null }],
            },
          ],
        }),
      ),
    ).toBe(true);

    const wordPage = makePage();
    wordPage.sections[0].items[0].expr = {
      kind: "word",
      text: "Sam has 3 apples and gets 2 more.",
      expr: { kind: "arith", op: "add", operands: [3, 2] },
    };
    expect(needsPersonRead(wordPage)).toBe(true);

    const captionPage = makePage();
    captionPage.sections[0].scaffolds = [
      { kind: "caption", applies_to: "all", text: "Carry 1" },
    ];
    expect(needsPersonRead(captionPage)).toBe(true);

    const figurePage = makePage();
    figurePage.sections[0].items[0].expr = {
      kind: "notation",
      latex: "A = 3 \\times 4",
      figure: "Rectangle with sides 3 and 4",
    };
    expect(needsPersonRead(figurePage)).toBe(true);
  });

  it("compares item printed text after notation normalising even when expr is present", () => {
    const a = makePage();
    const b = makePage();
    a.sections[0].items[0].printed = "12 + 5 =";
    b.sections[0].items[0].printed = "12 + 6 =";
    const diffs = compareRecords(a, b);
    expect(diffs).toContainEqual({
      path: "sections[0].items[n=1].printed",
      a: "12 + 5 =",
      b: "12 + 6 =",
      kind: "value",
    });

    // Equivalent notation in printed compares equal
    const c = makePage();
    const d = makePage();
    c.sections[0].items[0].printed = "12 + 5 =";
    d.sections[0].items[0].printed = "12+5=";
    expect(compareRecords(c, d)).toEqual([]);
  });

  it("reports mixed numbers versus joined fractions as value differences in both item printed and example step printed", () => {
    for (const [mixed, joined] of [
      ["2 1/2", "21/2"],
      ["1 2/5", "12/5"],
    ] as const) {
      const itemA = makePage();
      const itemB = makePage();
      itemA.sections[0].items[0].printed = mixed;
      itemB.sections[0].items[0].printed = joined;
      const itemDiffs = compareRecords(itemA, itemB);
      expect(itemDiffs).toContainEqual({
        path: "sections[0].items[n=1].printed",
        a: mixed,
        b: joined,
        kind: "value",
      });
      expect(
        decideStatus({
          hasA: true,
          hasB: true,
          familyA: "claude",
          familyB: "codex",
          diffs: itemDiffs,
        }),
      ).toBe("machine_read");

      const stepA = makePage({
        examples: [
          {
            position: "top",
            relation: "sequence",
            label: "Example 1",
            parts: [{ form: "horizontal", expr: null }],
            steps: [{ n: 1, shows: "setup", printed: mixed }],
            marks: [],
          },
        ],
      });
      const stepB = makePage({
        examples: [
          {
            position: "top",
            relation: "sequence",
            label: "Example 1",
            parts: [{ form: "horizontal", expr: null }],
            steps: [{ n: 1, shows: "setup", printed: joined }],
            marks: [],
          },
        ],
      });
      const stepDiffs = compareRecords(stepA, stepB);
      expect(stepDiffs).toContainEqual({
        path: "examples[0].steps[n=1].printed",
        a: mixed,
        b: joined,
        kind: "value",
      });
      expect(
        decideStatus({
          hasA: true,
          hasB: true,
          familyA: "claude",
          familyB: "codex",
          diffs: stepDiffs,
        }),
      ).toBe("machine_read");
    }
  });

  it("detects both_unclear and one_unclear inside nested lists such as number_strip values", () => {
    const a = makePage();
    const b = makePage();
    a.sections[0].scaffolds = [
      { kind: "number_strip", applies_to: "all", values: [1, UNCLEAR, 3, UNCLEAR] },
    ];
    b.sections[0].scaffolds = [
      { kind: "number_strip", applies_to: "all", values: [1, UNCLEAR, 3, 4] },
    ];

    const diffs = compareRecords(a, b);
    expect(diffs).toContainEqual({
      path: "sections[0].scaffolds[0].values[1]",
      a: UNCLEAR,
      b: UNCLEAR,
      kind: "both_unclear",
    });
    expect(diffs).toContainEqual({
      path: "sections[0].scaffolds[0].values[3]",
      a: UNCLEAR,
      b: 4,
      kind: "one_unclear",
    });
  });

  it("classifies nested teaching fields present for one reader only as once_read", () => {
    const a = makePage({
      examples: [
        {
          position: "top",
          relation: "compare",
          label: "Example 1",
          text: "Add the ones first.",
          parts: [
            {
              caption: "Ones column",
              form: "horizontal",
              expr: { kind: "arith", op: "add", operands: [2, 3] },
              shown_answer: "5",
            },
          ],
        },
      ],
    });
    const b = makePage({
      examples: [
        {
          position: "top",
          relation: "compare",
          label: "Example 1",
          parts: [
            {
              form: "horizontal",
              expr: { kind: "arith", op: "add", operands: [2, 3] },
              shown_answer: "5",
            },
          ],
        },
      ],
    });
    a.sections[0].scaffolds = [{ kind: "answer_boxes", applies_to: "all", box_count: 2 }];
    b.sections[0].scaffolds = [{ kind: "answer_boxes", applies_to: "all" }];

    const diffs = compareRecords(a, b);
    expect(diffs.find((d) => d.path === "examples[0].text")?.kind).toBe("once_read");
    expect(diffs.find((d) => d.path === "examples[0].parts[0].caption")?.kind).toBe("once_read");
    expect(diffs.find((d) => d.path === "sections[0].scaffolds[0].box_count")?.kind).toBe(
      "once_read",
    );
  });

  it("matches examples by label and scaffolds by kind-and-target before position so removing one of three gives one missing entry", () => {
    const ex1 = {
      position: "top" as const,
      relation: "compare" as const,
      label: "Example A",
      parts: [{ form: "horizontal" as const, expr: { kind: "arith" as const, op: "add" as const, operands: [1, 1] }, shown_answer: "2" }],
    };
    const ex2 = {
      position: "top" as const,
      relation: "compare" as const,
      label: "Example B",
      parts: [{ form: "horizontal" as const, expr: { kind: "arith" as const, op: "add" as const, operands: [2, 2] }, shown_answer: "4" }],
    };
    const ex3 = {
      position: "top" as const,
      relation: "compare" as const,
      label: "Example C",
      parts: [{ form: "horizontal" as const, expr: { kind: "arith" as const, op: "add" as const, operands: [3, 3] }, shown_answer: "6" }],
    };

    const a = makePage({ examples: [ex1, ex2, ex3] });
    const b = makePage({ examples: [ex2, ex3] });
    const exDiffs = compareRecords(a, b);
    expect(exDiffs).toHaveLength(1);
    expect(exDiffs[0].kind).toBe("once_read");

    const sc1 = { kind: "caption" as const, applies_to: [1], text: "First hint" };
    const sc2 = { kind: "caption" as const, applies_to: [2], text: "Second hint" };
    const sc3 = { kind: "caption" as const, applies_to: [3], text: "Third hint" };
    const sa = makePage();
    const sb = makePage();
    sa.sections[0].scaffolds = [sc1, sc2, sc3];
    sb.sections[0].scaffolds = [sc2, sc3];
    const scDiffs = compareRecords(sa, sb);
    expect(scDiffs).toHaveLength(1);
    expect(scDiffs[0].kind).toBe("once_read");
  });

  it("reports one order difference per section when item numbers are in a different printed order and keeps status machine_read", () => {
    const a = makePage();
    const b = makePage();
    b.sections[0].items = [
      b.sections[0].items[0],
      b.sections[0].items[2],
      b.sections[0].items[1],
    ];

    const diffs = compareRecords(a, b);
    expect(diffs).toEqual([
      {
        path: "sections[0].items",
        a: [1, 2, 3],
        b: [1, 3, 2],
        kind: "order",
      },
    ]);
    expect(
      decideStatus({
        hasA: true,
        hasB: true,
        familyA: "claude",
        familyB: "codex",
        diffs,
      }),
    ).toBe("machine_read");
  });

  it("reports sentinel versus empty or absent on scaffolds, examples, topic.number, and response unit", () => {
    // 1. scaffolds: not_stated vs [], unclear vs []
    const sa1 = makePage();
    const sb1 = makePage();
    sa1.sections[0].scaffolds = NOT_STATED;
    sb1.sections[0].scaffolds = [];
    expect(compareRecords(sa1, sb1)).toContainEqual({
      path: "sections[0].scaffolds",
      a: NOT_STATED,
      b: [],
      kind: "value",
    });

    const sa2 = makePage();
    const sb2 = makePage();
    sa2.sections[0].scaffolds = UNCLEAR;
    sb2.sections[0].scaffolds = [];
    expect(compareRecords(sa2, sb2)).toContainEqual({
      path: "sections[0].scaffolds",
      a: UNCLEAR,
      b: [],
      kind: "one_unclear",
    });

    // 2. examples: not_stated vs [], unclear vs []
    const ea1 = makePage({ examples: NOT_STATED });
    const eb1 = makePage({ examples: [] });
    expect(compareRecords(ea1, eb1)).toContainEqual({
      path: "examples",
      a: NOT_STATED,
      b: [],
      kind: "value",
    });

    const ea2 = makePage({ examples: UNCLEAR });
    const eb2 = makePage({ examples: [] });
    expect(compareRecords(ea2, eb2)).toContainEqual({
      path: "examples",
      a: UNCLEAR,
      b: [],
      kind: "one_unclear",
    });

    // 3. topic.number: absent vs not_stated, absent vs unclear
    const ta1 = makePage({ topic: { title: "Adding Numbers" } });
    const tb1 = makePage({ topic: { title: "Adding Numbers", number: NOT_STATED } });
    expect(compareRecords(ta1, tb1)).toContainEqual({
      path: "topic.number",
      a: null,
      b: NOT_STATED,
      kind: "value",
    });

    const ta2 = makePage({ topic: { title: "Adding Numbers" } });
    const tb2 = makePage({ topic: { title: "Adding Numbers", number: UNCLEAR } });
    expect(compareRecords(ta2, tb2)).toContainEqual({
      path: "topic.number",
      a: null,
      b: UNCLEAR,
      kind: "one_unclear",
    });

    // 4. response unit: absent vs not_stated, absent vs unclear, concrete vs not_stated
    const ua1 = makePage();
    const ub1 = makePage();
    ub1.sections[0].items[0].responses[0].unit = NOT_STATED;
    expect(compareRecords(ua1, ub1)).toContainEqual({
      path: "sections[0].items[n=1].responses[0].unit",
      a: null,
      b: NOT_STATED,
      kind: "value",
    });

    const ua2 = makePage();
    const ub2 = makePage();
    ub2.sections[0].items[0].responses[0].unit = UNCLEAR;
    expect(compareRecords(ua2, ub2)).toContainEqual({
      path: "sections[0].items[n=1].responses[0].unit",
      a: null,
      b: UNCLEAR,
      kind: "one_unclear",
    });

    const ua3 = makePage();
    const ub3 = makePage();
    ua3.sections[0].items[0].responses[0].unit = "cm";
    ub3.sections[0].items[0].responses[0].unit = NOT_STATED;
    expect(compareRecords(ua3, ub3)).toContainEqual({
      path: "sections[0].items[n=1].responses[0].unit",
      a: "cm",
      b: NOT_STATED,
      kind: "value",
    });
  });

  it("compares example steps by n (printed with notation norm, note with prose norm), marks by kind+step first, and new scaffold kinds", () => {
    const a = makePage({
      examples: [
        {
          position: "top",
          relation: "sequence",
          label: "Example 1",
          parts: [{ form: "vertical", expr: { kind: "arith", op: "mul", operands: [24, 3] }, shown_answer: "72" }],
          steps: [
            { n: 1, shows: "carry", printed: "4 × 3 = 12", note: "Write 2, carry 1." },
            { n: 2, shows: "answer", printed: "72" },
          ],
          marks: [
            { kind: "arrow", step: 1, description: "Points to carry" },
            { kind: "helper_digit", step: 1, description: "Small 1 above tens" },
          ],
        },
      ],
    });
    const b = makePage({
      examples: [
        {
          position: "top",
          relation: "sequence",
          label: "Example 1",
          parts: [{ form: "vertical", expr: { kind: "arith", op: "mul", operands: [24, 3] }, shown_answer: "72" }],
          steps: [
            { n: 1, shows: "carry", printed: "4 * 3 = 12", note: "write 2, carry 1" },
            { n: 2, shows: "answer", printed: "72" },
          ],
          marks: [
            { kind: "helper_digit", step: 1, description: "small 1 above tens." },
            { kind: "arrow", step: 1, description: "points to carry." },
          ],
        },
      ],
    });
    a.sections[0].scaffolds = [
      { kind: "helper_digit", applies_to: [1], description: "Small carry slot." },
      { kind: "other", applies_to: "all", description: "Dotted guide" },
    ];
    b.sections[0].scaffolds = [
      { kind: "helper_digit", applies_to: [1], description: "small carry slot" },
      { kind: "other", applies_to: "all", description: "dotted guide." },
    ];
    expect(compareRecords(a, b)).toEqual([]);
    expect(needsPersonRead(a)).toBe(true);

    // Step or mark present for only one reader is once_read
    const c = makePage({
      examples: [
        {
          position: "top",
          relation: "sequence",
          label: "Example 1",
          parts: [{ form: "vertical", expr: { kind: "arith", op: "mul", operands: [24, 3] }, shown_answer: "72" }],
          steps: [
            { n: 1, shows: "carry", printed: "4 x 3 = 12" },
            { n: 2, shows: "answer", printed: "72" },
          ],
          marks: [
            { kind: "arrow", step: 1, description: "Points to carry" },
            { kind: "box", step: 2, description: "Box around 72" },
          ],
        },
      ],
    });
    const d = makePage({
      examples: [
        {
          position: "top",
          relation: "sequence",
          label: "Example 1",
          parts: [{ form: "vertical", expr: { kind: "arith", op: "mul", operands: [24, 3] }, shown_answer: "72" }],
          steps: [{ n: 1, shows: "carry", printed: "4 x 3 = 12" }],
          marks: [{ kind: "box", step: 2, description: "Box around 72" }],
        },
      ],
    });
    const oneSided = compareRecords(c, d);
    expect(oneSided).toHaveLength(2);
    expect(oneSided.every((diff) => diff.kind === "once_read")).toBe(true);
    expect(oneSided.some((diff) => diff.path === "examples[0].steps[n=2]")).toBe(true);
    expect(oneSided.some((diff) => diff.path.startsWith("examples[0].marks"))).toBe(true);
  });
});

describe("decideStatus", () => {
  it("returns double_read only for two different families with no open diffs or once_read", () => {
    expect(
      decideStatus({ hasA: true, hasB: true, familyA: "claude", familyB: "codex", diffs: [] }),
    ).toBe("double_read");

    // both_unclear still allows double_read
    expect(
      decideStatus({
        hasA: true,
        hasB: true,
        familyA: "claude",
        familyB: "codex",
        diffs: [{ path: "topic.title", a: UNCLEAR, b: UNCLEAR, kind: "both_unclear" }],
      }),
    ).toBe("double_read");

    // same family -> machine_read
    expect(
      decideStatus({ hasA: true, hasB: true, familyA: "claude", familyB: "claude", diffs: [] }),
    ).toBe("machine_read");

    // single reader -> machine_read
    expect(
      decideStatus({ hasA: true, hasB: false, familyA: "claude", familyB: null, diffs: [] }),
    ).toBe("machine_read");

    // one_unclear or once_read -> machine_read
    expect(
      decideStatus({
        hasA: true,
        hasB: true,
        familyA: "claude",
        familyB: "codex",
        diffs: [{ path: "examples", a: [], b: [{}], kind: "once_read" }],
      }),
    ).toBe("machine_read");
    expect(
      decideStatus({
        hasA: true,
        hasB: true,
        familyA: "claude",
        familyB: "codex",
        diffs: [{ path: "topic.title", a: UNCLEAR, b: "Add", kind: "one_unclear" }],
      }),
    ).toBe("machine_read");
  });
});
