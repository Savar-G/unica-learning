import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { NOT_STATED, UNCLEAR, type ContentsRecord, type PageRecord } from "@/lib/reference-record";
import {
  classifyComparison,
  compareRecords,
  locateOnceReadInKeptRecord,
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
    // A raised digit is not a plain digit: "2 cubed" must not read as "23".
    expect(normalizeProseText("Evaluate 2\u00B3.")).not.toBe(normalizeProseText("Evaluate 23."));
    expect(normalizeProseText("Evaluate 2\u00B3.")).toBe(normalizeProseText("evaluate 2^3"));
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

describe("answer sources, scaffold lists, once-read places, empty answers, and unprinted sheet ranges", () => {
  it("reports printed against not printed as a difference, but not reader against unchecked or computed", () => {
    const withSource = (source: "printed" | "reader" | "unchecked" | "computed") => {
      const page = makePage();
      page.sections[0].items[0].responses[0].answer_source = source;
      return page;
    };
    expect(compareRecords(withSource("reader"), withSource("unchecked"))).toEqual([]);
    expect(compareRecords(withSource("reader"), withSource("computed"))).toEqual([]);
    expect(compareRecords(withSource("printed"), withSource("computed"))).toEqual([
      {
        path: "sections[0].items[n=1].responses[0].answer_source",
        a: "printed",
        b: "computed",
        kind: "value",
      },
    ]);
  });

  it("treats a scaffold list that names every item of its section as \"all\"", () => {
    const strip = (appliesTo: number[] | "all") => ({
      kind: "number_strip" as const,
      applies_to: appliesTo,
      values: [1, 2, 3],
    });
    const a = makePage();
    const b = makePage();
    a.sections[0].scaffolds = [strip([3, 1, 2])];
    b.sections[0].scaffolds = [strip("all")];
    expect(compareRecords(a, b)).toEqual([]);

    a.sections[0].scaffolds = [strip([1, 2])];
    expect(compareRecords(a, b).map((d) => d.path)).toEqual(["sections[0].scaffolds[0].applies_to"]);
  });

  it("pairs scaffolds with equal content first, so two readers that list them in opposite order agree", () => {
    const onlyOneItem = (scaffolds: PageRecord["sections"][0]["scaffolds"]) => {
      const page = makePage();
      page.sections[0].items = [page.sections[0].items[0]];
      page.sections[0].scaffolds = scaffolds;
      return page;
    };
    const first = { kind: "arrow" as const, from: "tens", to: "ones", label: "carry" };
    const second = { kind: "arrow" as const, from: "ones", to: "answer", label: "write" };
    const a = onlyOneItem([{ ...first, applies_to: [1] }, { ...second, applies_to: "all" }]);
    const b = onlyOneItem([{ ...second, applies_to: "all" }, { ...first, applies_to: [1] }]);
    expect(compareRecords(a, b)).toEqual([]);

    // Prose fields compare with the prose normalisation, also when the scaffolds are paired.
    const helpA = onlyOneItem([
      { kind: "helper_digit", applies_to: "all", description: "Carry the ones." },
      { kind: "helper_digit", applies_to: "all", description: "Carry the tens." },
    ]);
    const helpB = onlyOneItem([
      { kind: "helper_digit", applies_to: "all", description: "carry the tens" },
      { kind: "helper_digit", applies_to: "all", description: "carry the ones" },
    ]);
    expect(compareRecords(helpA, helpB)).toEqual([]);
  });

  it("keeps a once-read final_path for an edited or checked record only when the entry is there with equal content", () => {
    const arrow = { kind: "arrow" as const, applies_to: [2], label: "carry" };
    const onceRead = [
      { path: "sections[0].scaffolds[b:0]", a: null, b: arrow, kind: "once_read" as const, reader: "b" as const, final_path: "sections[0].scaffolds[]" },
      { path: "sections[0].items[n=3].responses[0].cue", a: null, b: "Sample cue", kind: "once_read" as const, reader: "b" as const, final_path: "sections[0].items[2].responses[0].cue" },
    ];
    // The person copied the arrow in as the second scaffold and removed item 1.
    const kept = makePage();
    kept.sections[0].scaffolds = [{ kind: "arrow", applies_to: [1], label: "other" }, arrow];
    kept.sections[0].items = kept.sections[0].items.slice(1);
    expect(locateOnceReadInKeptRecord(onceRead, kept)).toEqual([
      { ...onceRead[0], final_path: "sections[0].scaffolds[1]" },
      { path: onceRead[1].path, a: null, b: "Sample cue", kind: "once_read", reader: "b" },
    ]);
    // A kept record that cannot be read: no path.
    expect(locateOnceReadInKeptRecord(onceRead, null).every((d) => d.final_path === undefined)).toBe(true);

    // Reader a has the arrow in two sections; the kept record has it only in the second section.
    // The entry of the first section is not pointed at the second section.
    const twoSections = makePage();
    twoSections.sections = [
      { ...twoSections.sections[0], scaffolds: [{ kind: "caption", applies_to: "all", text: "Sample caption" }] },
      { ...twoSections.sections[0], scaffolds: [arrow] },
    ];
    const fromA = [
      { path: "sections[0].scaffolds[1]", a: arrow, b: null, kind: "once_read" as const, reader: "a" as const },
      { path: "sections[1].scaffolds[b:0]", a: null, b: arrow, kind: "once_read" as const, reader: "b" as const },
      { path: "topic.title", a: "Sample", b: null, kind: "once_read" as const, reader: "a" as const },
    ];
    expect(locateOnceReadInKeptRecord(fromA, twoSections).map((d) => d.final_path)).toEqual([
      undefined,
      "sections[1].scaffolds[0]",
      undefined,
    ]);
  });

  it("gives each once-read entry its reader and its JSON path in the final record", () => {
    const a = makePage();
    const b = makePage();
    const arrow = { kind: "arrow" as const, applies_to: [2], label: "carry" };
    b.sections[0].scaffolds = [arrow];
    b.sections[0].items[2].responses[0].cue = "Sample cue";
    a.examples = [
      {
        position: "top",
        relation: "compare",
        parts: [{ form: "horizontal", expr: null }],
        steps: [{ n: 1, shows: "setup", printed: "1 + 1" }],
      },
    ];
    b.examples = [
      {
        position: "top",
        relation: "compare",
        parts: [{ form: "horizontal", expr: null }],
        steps: [
          { n: 1, shows: "setup", printed: "1 + 1" },
          { n: 2, shows: "answer", printed: "2" },
        ],
      },
    ];
    const once = classifyComparison(a, b).once_read;
    expect(once).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "sections[0].scaffolds[b:0]", reader: "b", final_path: "sections[0].scaffolds[]", b: arrow }),
        expect.objectContaining({ path: "sections[0].items[n=3].responses[0].cue", reader: "b", final_path: "sections[0].items[2].responses[0].cue", b: "Sample cue" }),
        expect.objectContaining({ path: "examples[0].steps[b:1]", reader: "b", final_path: "examples[0].steps[]" }),
      ]),
    );
    expect(once).toHaveLength(3);
  });

  it("lists empty answer places of the final record with both readers' answers", () => {
    const a = makePage();
    const b = makePage();
    // Code cannot compute a notation item, so its empty answer place stays empty.
    for (const page of [a, b]) {
      page.sections[0].items[1].expr = { kind: "notation", latex: "x + 6 = 26" };
    }
    a.sections[0].items[1].responses[0] = { position: "after_equals", cue: null, answer: null, answer_source: "unchecked" };
    const summary = classifyComparison(a, b);
    expect(summary.empty_answer).toEqual([
      { path: "sections[0].items[n=2].responses[0]", a: null, b: "26", kind: "empty_answer" },
    ]);
    expect(classifyComparison(b, a).empty_answer).toEqual([]);

    // A computable item: code writes the answer, as reference:check does, so it is not empty.
    const c = makePage();
    c.sections[0].items[0].responses[0] = { position: "after_equals", cue: null, answer: null, answer_source: "unchecked" };
    expect(classifyComparison(c, b).empty_answer).toEqual([]);
  });

  it("compares unprinted sheet ranges (null) of a contents chart", () => {
    const contents = (sheets: [number, number] | null): ContentsRecord => ({
      kind: "contents",
      source_ref: "sample:M:contents",
      topics: [{ n: 1, title: "Sample Topic", sheets, std_time_min: [2, 3] }],
    });
    expect(compareRecords(contents(null), contents(null))).toEqual([]);
    expect(compareRecords(contents(null), contents([1, 10]))).toEqual([
      { path: "topics[n=1].sheets", a: null, b: [1, 10], kind: "value" },
    ]);
  });
});

describe("decideStatus", () => {
  it("returns double_read only for two different families with no open diffs or once_read", () => {
    expect(
      decideStatus({ hasA: true, hasB: true, familyA: "claude", familyB: "codex", diffs: [] }),
    ).toBe("double_read");

    // A value that both readers mark unclear, or an empty answer place, is not a double read
    for (const kind of ["both_unclear", "empty_answer"] as const) {
      expect(
        decideStatus({
          hasA: true,
          hasB: true,
          familyA: "claude",
          familyB: "codex",
          diffs: [{ path: "topic.title", a: UNCLEAR, b: UNCLEAR, kind }],
        }),
      ).toBe("machine_read");
    }

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

    // wording differences do not block double_read
    expect(
      decideStatus({
        hasA: true,
        hasB: true,
        familyA: "claude",
        familyB: "codex",
        diffs: [
          { path: "examples[0].marks[0].description", a: "Arrow to 3", b: "Points at 3", kind: "wording" },
          { path: "sections[0].items[n=1].expr.figure", a: "Grid with 4 squares", b: "Four-square grid", kind: "wording" },
        ],
      }),
    ).toBe("double_read");
  });
});

describe("worked-example step alignment and wording differences", () => {
  function pageWithExample(
    steps: NonNullable<PageRecord["examples"] extends infer E ? (E extends Array<infer X> ? X : never) : never>["steps"],
    marks?: NonNullable<PageRecord["examples"] extends infer E ? (E extends Array<infer X> ? X : never) : never>["marks"],
  ): PageRecord {
    return makePage({
      examples: [
        {
          position: "top",
          relation: "sequence",
          label: "Example 1",
          parts: [{ form: "horizontal", expr: { kind: "notation", latex: "\\frac{1}{2} + \\frac{1}{3}" }, shown_answer: "5/6" }],
          steps,
          marks: marks ?? [],
        },
      ],
    });
  }

  it("aligns worked-example steps by normalized printed text across equal lists, middle merge, extra start, extra end, marks, and fully different lists", () => {
    // 1. Equal lists (under notation normalization) -> zero diffs
    const eqA = pageWithExample([
      { n: 1, shows: "setup", printed: "\\frac{1}{2} + \\frac{1}{3}" },
      { n: 2, shows: "answer", printed: "\\frac{5}{6}" },
    ]);
    const eqB = pageWithExample([
      { n: 1, shows: "setup", printed: "((1)/(2)) + ((1)/(3))" },
      { n: 2, shows: "answer", printed: "((5)/(6))" },
    ]);
    expect(compareRecords(eqA, eqB)).toEqual([]);

    // 2. One merged step in the middle: later steps pair with zero diffs and marks follow shifted steps
    const mergeA = pageWithExample(
      [
        { n: 1, shows: "setup", printed: "1/2 + 1/3" },
        { n: 2, shows: "regroup", printed: "= 3/6 + 2/6" },
        { n: 3, shows: "partial_sum", printed: "= (3 + 2)/6" },
        { n: 4, shows: "answer", printed: "= 5/6" },
      ],
      [
        { kind: "circle", step: 1, description: "Circle the denominators" },
        { kind: "underline", step: 4, description: "Underline the final fraction" },
      ],
    );
    const mergeB = pageWithExample(
      [
        { n: 1, shows: "setup", printed: "1/2 + 1/3" },
        { n: 2, shows: "regroup", printed: "= 3/6 + 2/6 = (3 + 2)/6" },
        { n: 3, shows: "answer", printed: "= 5/6" },
      ],
      [
        { kind: "circle", step: 1, description: "Circle the denominators" },
        { kind: "underline", step: 3, description: "Underline the final fraction" },
      ],
    );
    const mergeDiffs = compareRecords(mergeA, mergeB);
    expect(mergeDiffs).toEqual([
      {
        path: "examples[0].steps[n=2].printed",
        a: "= 3/6 + 2/6",
        b: "= 3/6 + 2/6 = (3 + 2)/6",
        kind: "value",
      },
      {
        path: "examples[0].steps[n=3]",
        a: { n: 3, shows: "partial_sum", printed: "= (3 + 2)/6" },
        b: null,
        kind: "once_read",
      },
    ]);

    // 3. Extra step at the start (reader B has an extra step 1; reader B's steps 2 and 3 align with A's 1 and 2)
    const startA = pageWithExample(
      [
        { n: 1, shows: "subtract", printed: "2x = 6" },
        { n: 2, shows: "answer", printed: "x = 3" },
      ],
      [{ kind: "underline", step: 2, description: "Underline x = 3" }],
    );
    const startB = pageWithExample(
      [
        { n: 1, shows: "setup", printed: "2x + 1 = 7" },
        { n: 2, shows: "subtract", printed: "2x = 6" },
        { n: 3, shows: "answer", printed: "x = 3" },
      ],
      [{ kind: "underline", step: 3, description: "Underline x = 3" }],
    );
    const startSummary = classifyComparison(startA, startB);
    expect(startSummary.differences).toEqual([]);
    expect(startSummary.wording).toEqual([]);
    expect(startSummary.once_read).toEqual([
      {
        path: "examples[0].steps[b:0]",
        a: null,
        b: { n: 1, shows: "setup", printed: "2x + 1 = 7" },
        kind: "once_read",
        reader: "b",
        insert_before: 0,
        final_path: "examples[0].steps[0]",
      },
    ]);

    // Extra step at the start on reader A
    const startRev = classifyComparison(startB, startA);
    expect(startRev.differences).toEqual([]);
    expect(startRev.once_read).toEqual([
      {
        path: "examples[0].steps[n=1]",
        a: { n: 1, shows: "setup", printed: "2x + 1 = 7" },
        b: null,
        kind: "once_read",
        reader: "a",
        final_path: "examples[0].steps[0]",
      },
    ]);

    // 4. Extra step at the end (reader B has an extra step 2, plus a mark on that unpaired step)
    const endA = pageWithExample([{ n: 1, shows: "setup", printed: "2x = 6" }], []);
    const endB = pageWithExample(
      [
        { n: 1, shows: "setup", printed: "2x = 6" },
        { n: 2, shows: "answer", printed: "x = 3" },
      ],
      [{ kind: "box", step: 2, description: "Box around x = 3" }],
    );
    const endSummary = classifyComparison(endA, endB);
    expect(endSummary.differences).toEqual([]);
    expect(endSummary.once_read).toEqual([
      {
        path: "examples[0].steps[b:1]",
        a: null,
        b: { n: 2, shows: "answer", printed: "x = 3" },
        kind: "once_read",
        reader: "b",
        final_path: "examples[0].steps[]",
      },
      {
        path: "examples[0].marks[b:0]",
        a: null,
        b: { kind: "box", step: 2, description: "Box around x = 3" },
        kind: "once_read",
        reader: "b",
        final_path: "examples[0].marks[]",
      },
    ]);

    // 5. Fully different step lists pair in order up to the shorter side and report extras as once_read
    const diffA = pageWithExample([
      { n: 1, shows: "setup", printed: "3x = 9" },
      { n: 2, shows: "answer", printed: "x = 3" },
    ]);
    const diffB = pageWithExample([
      { n: 1, shows: "setup", printed: "4y = 8" },
      { n: 2, shows: "answer", printed: "y = 2" },
      { n: 3, shows: "check", printed: "4(2) = 8" },
    ]);
    const fullDiffs = compareRecords(diffA, diffB);
    expect(fullDiffs).toEqual([
      { path: "examples[0].steps[n=1].printed", a: "3x = 9", b: "4y = 8", kind: "value" },
      { path: "examples[0].steps[n=2].printed", a: "x = 3", b: "y = 2", kind: "value" },
      {
        path: "examples[0].steps[b:2]",
        a: null,
        b: { n: 3, shows: "check", printed: "4(2) = 8" },
        kind: "once_read",
      },
    ]);
  });

  it("classifies reader-chosen wording fields as wording and keeps printed-text fields, one-sided fields, and unclear blocking", () => {
    const a = makePage({
      examples: [
        {
          position: "top",
          relation: "sequence",
          label: "Ex.",
          text: "Solve the equation.",
          cross_ref: "See 1a",
          parts: [{ caption: "First part", form: "horizontal", expr: null }],
          steps: [{ n: 1, shows: "other", shows_other: "Rewrite with common denominator", printed: "2/4 + 1/4", note: "Match bottoms" }],
          marks: [
            { kind: "circle", step: 1, description: "Circle around 2 and 4" },
            { kind: "label", step: 1, description: "LCD" },
          ],
        },
      ],
    });
    const b = makePage({
      examples: [
        {
          position: "top",
          relation: "sequence",
          label: "Ex.",
          text: "Solve the equation.",
          cross_ref: "See 1a",
          parts: [{ caption: "First part", form: "horizontal", expr: null }],
          steps: [{ n: 1, shows: "other", shows_other: "Convert fractions to fourths", printed: "2/4 + 1/4", note: "Match bottoms" }],
          marks: [
            { kind: "circle", step: 1, description: "Ring enclosing 2 and 4" },
            { kind: "label", step: 1, description: "LCD" },
          ],
        },
      ],
    });
    a.sections[0].items[0] = {
      n: 1,
      printed: "1/2 + 1/4 =",
      form: "horizontal",
      expr: { kind: "notation", latex: "\\frac{1}{2} + \\frac{1}{4}", figure: "Shaded circle showing halves" },
      responses: [{ position: "after_equals", cue: "Ans.", answer: "3/4", answer_source: "reader" }],
    };
    b.sections[0].items[0] = {
      n: 1,
      printed: "1/2 + 1/4 =",
      form: "horizontal",
      expr: { kind: "notation", latex: "\\frac{1}{2} + \\frac{1}{4}", figure: "Circle divided into two equal parts" },
      responses: [{ position: "after_equals", cue: "Ans.", answer: "3/4", answer_source: "reader" }],
    };
    a.sections[0].scaffolds = [
      { kind: "helper_digit", applies_to: [1], description: "Small 1 carry digit above tens" },
      { kind: "partial_working", applies_to: [1], description: "First step prefilled" },
      { kind: "worked_item", applies_to: [2], description: "Item 2 completed as a model" },
      { kind: "other", applies_to: [3], description: "Dotted guide line" },
      { kind: "arrow", applies_to: [1], from: "top fraction", to: "bottom box", label: "x2" },
      { kind: "caption", applies_to: [1], text: "Reduce", target: "next to answer" },
      { kind: "table_read_aloud", applies_to: "all", has_checkbox: true, caption_style: "bold header row" },
      { kind: "answer_boxes", applies_to: [1], places: ["numerator", "denominator"] },
    ];
    b.sections[0].scaffolds = [
      { kind: "helper_digit", applies_to: [1], description: "Tiny 1 printed above tens column" },
      { kind: "partial_working", applies_to: [1], description: "Opening line printed in grey" },
      { kind: "worked_item", applies_to: [2], description: "Solved example in item 2" },
      { kind: "other", applies_to: [3], description: "Dashed horizontal rule" },
      { kind: "arrow", applies_to: [1], from: "top fraction", to: "bottom box", label: "x2" },
      { kind: "caption", applies_to: [1], text: "Reduce", target: "beside the result" },
      { kind: "table_read_aloud", applies_to: "all", has_checkbox: true, caption_style: "shaded top strip" },
      { kind: "answer_boxes", applies_to: [1], places: ["top box", "bottom box"] },
    ];

    const summary = classifyComparison(a, b);
    expect(summary.differences).toEqual([]);
    expect(summary.once_read).toEqual([]);
    expect(summary.both_unclear).toEqual([]);
    expect(summary.wording.map((d) => d.path).sort()).toEqual([
      "examples[0].marks[0].description",
      "examples[0].steps[n=1].shows_other",
      "sections[0].items[n=1].expr.figure",
      "sections[0].scaffolds[0].description",
      "sections[0].scaffolds[1].description",
      "sections[0].scaffolds[2].description",
      "sections[0].scaffolds[3].description",
      "sections[0].scaffolds[5].target",
      "sections[0].scaffolds[6].caption_style",
      "sections[0].scaffolds[7].places[0]",
      "sections[0].scaffolds[7].places[1]",
    ]);
    expect(
      decideStatus({
        hasA: true,
        hasB: true,
        familyA: "claude",
        familyB: "codex",
        diffs: compareRecords(a, b),
      }),
    ).toBe("double_read");

    // Printed-text fields and known decimal places stay blocking ("value")
    const blockA = structuredClone(a);
    const blockB = structuredClone(b);
    if (Array.isArray(blockB.examples)) {
      blockB.examples[0].text = "Find x.";
      blockB.examples[0].cross_ref = "See 2a";
      blockB.examples[0].parts[0].caption = "Other part";
      if (Array.isArray(blockB.examples[0].steps)) {
        blockB.examples[0].steps[0].note = "Different note";
      }
      if (Array.isArray(blockB.examples[0].marks)) {
        blockB.examples[0].marks[1].description = "GCF";
      }
    }
    blockB.sections[0].instruction = "Subtract the numbers.";
    blockB.sections[0].items[0].printed = "1/2 + 1/5 =";
    blockB.sections[0].items[0].responses[0].cue = "x =";
    if (Array.isArray(blockA.sections[0].scaffolds) && Array.isArray(blockB.sections[0].scaffolds)) {
      blockA.sections[0].scaffolds.push({ kind: "equation_frame", applies_to: [1], template: "□ + □ = □" });
      blockB.sections[0].scaffolds.push({ kind: "equation_frame", applies_to: [1], template: "□ - □ = □" });
      blockA.sections[0].scaffolds[7] = { kind: "answer_boxes", applies_to: [1], places: ["tens", "ones"] };
      blockB.sections[0].scaffolds[7] = { kind: "answer_boxes", applies_to: [1], places: ["tens", "first box"] };
      blockB.sections[0].scaffolds[4] = { kind: "arrow", applies_to: [1], from: "top fraction", to: "bottom box", label: "x3" };
      blockB.sections[0].scaffolds[5] = { kind: "caption", applies_to: [1], text: "Simplify", target: "beside the result" };
    }
    const blockingDiffs = classifyComparison(blockA, blockB).differences;
    expect(blockingDiffs.map((d) => d.path).sort()).toEqual([
      "examples[0].cross_ref",
      "examples[0].marks[1].description",
      "examples[0].parts[0].caption",
      "examples[0].steps[n=1].note",
      "examples[0].text",
      "sections[0].instruction",
      "sections[0].items[n=1].printed",
      "sections[0].items[n=1].responses[0].cue",
      "sections[0].scaffolds[4].label",
      "sections[0].scaffolds[5].text",
      "sections[0].scaffolds[7].places[1]",
      "sections[0].scaffolds[8].template",
    ]);

    // One-sided wording field stays once_read; wording vs unclear stays one_unclear
    const edgeA = makePage();
    const edgeB = makePage();
    edgeA.sections[0].items[0].expr = { kind: "notation", latex: "x = 2", figure: "Number line" };
    edgeB.sections[0].items[0].expr = { kind: "notation", latex: "x = 2" };
    edgeA.sections[0].scaffolds = [{ kind: "helper_digit", applies_to: [1], description: "Small 1" }];
    edgeB.sections[0].scaffolds = [{ kind: "helper_digit", applies_to: [1], description: UNCLEAR }];
    const edgeDiffs = compareRecords(edgeA, edgeB);
    expect(edgeDiffs).toEqual([
      { path: "sections[0].scaffolds[0].description", a: "Small 1", b: UNCLEAR, kind: "one_unclear" },
      { path: "sections[0].items[n=1].expr.figure", a: "Number line", b: null, kind: "once_read" },
    ]);
  });

  it("pairs multiple marks on the same kind+step and multiple scaffolds on the same kind+applies_to in order with only wording diffs", () => {
    const a = makePage({
      examples: [
        {
          position: "top",
          relation: "sequence",
          label: "Ex.",
          parts: [{ form: "horizontal", expr: null }],
          steps: [{ n: 1, shows: "setup", printed: "2 + 3 = 5" }],
          marks: [
            { kind: "circle", step: 1, description: "First circle on 2" },
            { kind: "circle", step: 1, description: "Second circle on 3" },
          ],
        },
      ],
    });
    const b = makePage({
      examples: [
        {
          position: "top",
          relation: "sequence",
          label: "Ex.",
          parts: [{ form: "horizontal", expr: null }],
          steps: [{ n: 1, shows: "setup", printed: "2 + 3 = 5" }],
          marks: [
            { kind: "circle", step: 1, description: "Ring enclosing 2" },
            { kind: "circle", step: 1, description: "Ring enclosing 3" },
          ],
        },
      ],
    });
    a.sections[0].scaffolds = [
      { kind: "helper_digit", applies_to: [1], description: "Carry slot in tens" },
      { kind: "helper_digit", applies_to: [1], description: "Carry slot in hundreds" },
      { kind: "caption", applies_to: "all", text: "Check", target: "top right" },
      { kind: "caption", applies_to: "all", text: "Reduce", target: "bottom left" },
    ];
    b.sections[0].scaffolds = [
      { kind: "helper_digit", applies_to: [1], description: "Small tens carry" },
      { kind: "helper_digit", applies_to: [1], description: "Small hundreds carry" },
      { kind: "caption", applies_to: "all", text: "Reduce", target: "lower left" },
      { kind: "caption", applies_to: "all", text: "Check", target: "upper right" },
    ];

    const summary = classifyComparison(a, b);
    expect(summary.differences).toEqual([]);
    expect(summary.once_read).toEqual([]);
    expect(summary.wording).toHaveLength(6);
    expect(summary.wording.map((d) => [d.path, d.a, d.b])).toEqual([
      ["examples[0].marks[0].description", "First circle on 2", "Ring enclosing 2"],
      ["examples[0].marks[1].description", "Second circle on 3", "Ring enclosing 3"],
      ["sections[0].scaffolds[0].description", "Carry slot in tens", "Small tens carry"],
      ["sections[0].scaffolds[1].description", "Carry slot in hundreds", "Small hundreds carry"],
      ["sections[0].scaffolds[2].target", "top right", "upper right"],
      ["sections[0].scaffolds[3].target", "bottom left", "lower left"],
    ]);
  });

  it("blocks wording when numbers or math symbols differ, on arrow direction fields, or when fractional place names appear", () => {
    const statusOf = (a: PageRecord, b: PageRecord) =>
      decideStatus({
        hasA: true,
        hasB: true,
        familyA: "claude",
        familyB: "codex",
        diffs: [...compareRecords(a, b), ...classifyComparison(a, b).empty_answer],
      });

    // Probe 1a: different numbers in wording fields are blocking value diffs
    const numA = makePage();
    const numB = makePage();
    numA.sections[0].scaffolds = [{ kind: "helper_digit", applies_to: [1], description: "Small 1 above the tens digit" }];
    numB.sections[0].scaffolds = [{ kind: "helper_digit", applies_to: [1], description: "Small 7 above the tens digit" }];
    expect(compareRecords(numA, numB)).toEqual([
      {
        path: "sections[0].scaffolds[0].description",
        a: "Small 1 above the tens digit",
        b: "Small 7 above the tens digit",
        kind: "value",
      },
    ]);
    expect(statusOf(numA, numB)).toBe("machine_read");

    // Decimals and reordered numbers in wording fields are also blocking
    const decA = makePage();
    const decB = makePage();
    decA.sections[0].items[0].expr = { kind: "notation", latex: "x = 1", figure: "Bar of length 1.5 and 2" };
    decB.sections[0].items[0].expr = { kind: "notation", latex: "x = 1", figure: "Bar of length 2 and 1.5" };
    expect(compareRecords(decA, decB)).toEqual([
      {
        path: "sections[0].items[n=1].expr.figure",
        a: "Bar of length 1.5 and 2",
        b: "Bar of length 2 and 1.5",
        kind: "value",
      },
    ]);

    // Probe 1b: different math symbols in a wording field block double_read
    const opA = makePage();
    const opB = makePage();
    opA.sections[0].scaffolds = [{ kind: "partial_working", applies_to: [1], description: "The first line shows 2 + 3" }];
    opB.sections[0].scaffolds = [{ kind: "partial_working", applies_to: [1], description: "The first line shows 2 \u00D7 3" }];
    expect(compareRecords(opA, opB)).toEqual([
      {
        path: "sections[0].scaffolds[0].description",
        a: "The first line shows 2 + 3",
        b: "The first line shows 2 \u00D7 3",
        kind: "value",
      },
    ]);
    expect(statusOf(opA, opB)).toBe("machine_read");

    // Symbol mismatches across the full symbol set and symbol order are blocking; equivalent forms stay wording
    const blockSymbolPairs: Array<[string, string]> = [
      ["Line shows 6 \u00F7 2", "Line shows 6 / 2"],
      ["Shows a < b", "Shows a \u2264 b"],
      ["Shows a > b", "Shows a \u2265 b"],
      ["Shows a = b", "Shows a \u2260 b"],
      ["Shows 25% shaded", "Shows 25 shaded"],
      ["Shows 2^3", "Shows 2 + 3"],
      ["Shows \u221A9", "Shows 9"],
      ["Shows 2 + 3 - 1", "Shows 2 - 3 + 1"],
    ];
    for (const [descA, descB] of blockSymbolPairs) {
      const sa = makePage();
      const sb = makePage();
      sa.sections[0].scaffolds = [{ kind: "partial_working", applies_to: [1], description: descA }];
      sb.sections[0].scaffolds = [{ kind: "partial_working", applies_to: [1], description: descB }];
      expect(compareRecords(sa, sb), `${descA} vs ${descB}`).toEqual([
        { path: "sections[0].scaffolds[0].description", a: descA, b: descB, kind: "value" },
      ]);
      expect(statusOf(sa, sb), `${descA} vs ${descB}`).toBe("machine_read");
    }

    const wordingSymbolPairs: Array<[string, string]> = [
      ["First line shows x - 1", "Top line prints x \u2212 1"],
      ["Box checks a <= b", "Frame tests a \u2264 b"],
      ["Box checks a >= b", "Frame tests a \u2265 b"],
      ["Letter x beside 2 + 3", "Variable x next to 2 + 3"],
    ];
    for (const [descA, descB] of wordingSymbolPairs) {
      const sa = makePage();
      const sb = makePage();
      sa.sections[0].scaffolds = [{ kind: "partial_working", applies_to: [1], description: descA }];
      sb.sections[0].scaffolds = [{ kind: "partial_working", applies_to: [1], description: descB }];
      expect(compareRecords(sa, sb), `${descA} vs ${descB}`).toEqual([
        { path: "sections[0].scaffolds[0].description", a: descA, b: descB, kind: "wording" },
      ]);
      expect(statusOf(sa, sb), `${descA} vs ${descB}`).toBe("double_read");
    }

    // Probe 1c: arrow scaffold from/to are blocking prose (even when reworded in opposite direction)
    const arrowA = makePage();
    const arrowB = makePage();
    arrowA.sections[0].scaffolds = [{ kind: "arrow", applies_to: [1], from: "left box", to: "right box" }];
    arrowB.sections[0].scaffolds = [{ kind: "arrow", applies_to: [1], from: "box on the right", to: "box on the left" }];
    expect(compareRecords(arrowA, arrowB)).toEqual([
      { path: "sections[0].scaffolds[0].from", a: "left box", b: "box on the right", kind: "value" },
      { path: "sections[0].scaffolds[0].to", a: "right box", b: "box on the left", kind: "value" },
    ]);
    expect(statusOf(arrowA, arrowB)).toBe("machine_read");

    // Equal from and to on both readers agree
    const sameEndA = makePage();
    const sameEndB = makePage();
    sameEndA.sections[0].scaffolds = [{ kind: "arrow", applies_to: [1], from: "tens", to: "tens" }];
    sameEndB.sections[0].scaffolds = [{ kind: "arrow", applies_to: [1], from: "tens", to: "tens" }];
    expect(compareRecords(sameEndA, sameEndB)).toEqual([]);

    // Probe 1d: worked-example mark of kind arrow blocks on differing description (even with no numbers)
    const arrowMarkA = pageWithExample(
      [{ n: 1, shows: "setup", printed: "2 + 3 = 5" }],
      [{ kind: "arrow", step: 1, description: "Points from left box to right box" }],
    );
    const arrowMarkB = pageWithExample(
      [{ n: 1, shows: "setup", printed: "2 + 3 = 5" }],
      [{ kind: "arrow", step: 1, description: "Points from right box to left box" }],
    );
    expect(compareRecords(arrowMarkA, arrowMarkB)).toEqual([
      {
        path: "examples[0].marks[0].description",
        a: "Points from left box to right box",
        b: "Points from right box to left box",
        kind: "value",
      },
    ]);
    expect(statusOf(arrowMarkA, arrowMarkB)).toBe("machine_read");

    // Probe 1e: fractional place names in answer_boxes.places are blocking value diffs
    for (const [placesA, placesB] of [
      [["tenths"], ["hundredths"]],
      [["tenth place"], ["thousandths digit"]],
      [["tenths"], ["first box"]],
    ] as const) {
      const placeA = makePage();
      const placeB = makePage();
      placeA.sections[0].scaffolds = [{ kind: "answer_boxes", applies_to: [1], places: [...placesA] }];
      placeB.sections[0].scaffolds = [{ kind: "answer_boxes", applies_to: [1], places: [...placesB] }];
      expect(compareRecords(placeA, placeB), `${placesA[0]} vs ${placesB[0]}`).toEqual([
        {
          path: "sections[0].scaffolds[0].places[0]",
          a: placesA[0],
          b: placesB[0],
          kind: "value",
        },
      ]);
      expect(statusOf(placeA, placeB)).toBe("machine_read");
    }
  });

  it("carries the insertion index on once-read B steps, keeps marks on unmatched B steps unmatched, and prefers matching shows on repeated printed text", () => {
    // Middle B step insertion index + mark on unmatched B step must not match A's mark on the same step number
    const midA = pageWithExample(
      [
        { n: 1, shows: "setup", printed: "2 + 3" },
        { n: 2, shows: "answer", printed: "5" },
      ],
      [{ kind: "circle", step: 2, description: "Circle the result" }],
    );
    const midB = pageWithExample(
      [
        { n: 1, shows: "setup", printed: "2 + 3" },
        { n: 2, shows: "partial_sum", printed: "2 + 3 = 5" },
        { n: 3, shows: "answer", printed: "5" },
      ],
      [{ kind: "circle", step: 2, description: "Circle the result" }],
    );
    const midSummary = classifyComparison(midA, midB);
    expect(midSummary.differences).toEqual([]);
    expect(midSummary.once_read).toEqual([
      {
        path: "examples[0].steps[b:1]",
        a: null,
        b: { n: 2, shows: "partial_sum", printed: "2 + 3 = 5" },
        kind: "once_read",
        reader: "b",
        insert_before: 1,
        final_path: "examples[0].steps[1]",
      },
      {
        path: "examples[0].marks[0]",
        a: { kind: "circle", step: 2, description: "Circle the result" },
        b: null,
        kind: "once_read",
        reader: "a",
        final_path: "examples[0].marks[0]",
      },
      {
        path: "examples[0].marks[b:0]",
        a: null,
        b: { kind: "circle", step: 2, description: "Circle the result" },
        kind: "once_read",
        reader: "b",
        final_path: "examples[0].marks[]",
      },
    ]);

    // Anchors with repeated printed text prefer the pairing where `shows` agrees too
    const repA = pageWithExample([
      { n: 1, shows: "setup", printed: "2 + 3" },
      { n: 2, shows: "answer", printed: "5" },
    ]);
    const repB = pageWithExample([
      { n: 1, shows: "partial_sum", printed: "5" },
      { n: 2, shows: "answer", printed: "5" },
    ]);
    const repSummary = classifyComparison(repA, repB);
    expect(repSummary.once_read).toEqual([]);
    expect(repSummary.differences).toEqual([
      { path: "examples[0].steps[n=1].shows", a: "setup", b: "partial_sum", kind: "value" },
      { path: "examples[0].steps[n=1].printed", a: "2 + 3", b: "5", kind: "value" },
    ]);

    // Repeated printed text with an inserted partial_sum before the answer
    const repInsB = pageWithExample([
      { n: 1, shows: "setup", printed: "2 + 3" },
      { n: 2, shows: "partial_sum", printed: "5" },
      { n: 3, shows: "answer", printed: "5" },
    ]);
    const repInsSummary = classifyComparison(repA, repInsB);
    expect(repInsSummary.differences).toEqual([]);
    expect(repInsSummary.once_read).toEqual([
      {
        path: "examples[0].steps[b:1]",
        a: null,
        b: { n: 2, shows: "partial_sum", printed: "5" },
        kind: "once_read",
        reader: "b",
        insert_before: 1,
        final_path: "examples[0].steps[1]",
      },
    ]);
  });

  it("reports a sole work_area left null by both readers as an empty answer and keeps status machine_read", () => {
    const a = makePage();
    const b = makePage();
    for (const page of [a, b]) {
      page.sections[0].items = [
        {
          n: 1,
          printed: "Simplify 4/6",
          form: "horizontal",
          expr: { kind: "notation", latex: "\\frac{4}{6}" },
          responses: [{ position: "work_area", cue: null, answer: null, answer_source: "unchecked" }],
        },
      ];
    }
    const summary = classifyComparison(a, b);
    expect(summary.differences).toEqual([]);
    expect(summary.empty_answer).toEqual([
      { path: "sections[0].items[n=1].responses[0]", a: null, b: null, kind: "empty_answer" },
    ]);
    expect(
      decideStatus({
        hasA: true,
        hasB: true,
        familyA: "claude",
        familyB: "codex",
        diffs: [...compareRecords(a, b), ...summary.empty_answer],
      }),
    ).toBe("machine_read");
  });
});
