import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import fc from "fast-check";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  CHECK_PROBLEM_REASONS,
  EXPR_KINDS,
  NOT_STATED,
  recordPathResolves,
  UNCLEAR,
  type ContentsRecord,
  type ExampleMark,
  type ExampleStep,
  type Expr,
  type ExprKind,
  type PageRecord,
  type ReferenceRecord,
  type Scaffold,
} from "@/lib/reference-record";
import { applyComputedAnswers } from "./answers";
import {
  agreementPercentage,
  ANSWER_DISAGREEMENT_REASON,
  classifyComparison,
  compareRecords,
  compareRecordsWithCounts,
  decidePageOutcome,
  decideStatus,
  emptyAnswerDiffs,
  EXPRESSION_DISAGREEMENT_REASON,
  findAnswerDisagreements,
  findExpressionDisagreements,
  meetsAgreementThreshold,
  needsPersonRead,
  normalizeNotationText,
  normalizeProseText,
  PAGE_IDENTITY_DISAGREEMENT_REASON,
  PAGE_STOP_REASONS,
  PRINTED_EXPRESSION_REASON,
  READER_ANSWER_CONFLICT_REASON,
  resolveSingleReadPaths,
  UNPROVED_ANSWERS_REASON,
  type DecideStatusInput,
  type PageStopReason,
} from "./compare";
import { resolveDiffPath } from "./compare-locate";
import { collectExampleAnswerConflicts, findExampleAnswerConflicts } from "./example-answers";
import { findPrintedConflicts } from "./printed-line";
import { findUnprovedAnswers } from "./unproved-answers";

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

describe("sections that have another number in each reading", () => {
  it("looks up items and answers in the paired section of reader B", () => {
    const a = makePage();
    const b = makePage();
    const [box, tick] = [
      { position: "box" as const, cue: null, answer: "17", answer_source: "reader" as const },
      { position: "checkbox" as const, cue: null, answer: null, answer_source: "unchecked" as const },
    ];
    const item = (responses: PageRecord["sections"][0]["items"][0]["responses"]) => ({
      ...makePage().sections[0].items[0],
      responses,
    });
    const section = (instruction: string, responses: Parameters<typeof item>[0]) => ({
      instruction,
      scaffolds: [],
      items: [item(responses)],
    });
    a.sections = [section("Read.", [tick]), section("Add.", [{ ...box, answer: null, place: "answer" }, tick])];
    b.sections = [section("Add.", [box, { ...tick, answer: "done" }]), section("Extra.", [{ ...box, answer: "99" }, box])];
    const diffs = compareRecords(a, b);
    expect(diffs.filter((d) => d.kind === "once_read").map((d) => d.path)).toEqual(
      expect.arrayContaining(["sections[0]", "sections[b:1]"]),
    );
    // The tick box of the paired section is no answer, although reader B's section 1 has a box there.
    expect(diffs.map((d) => d.path)).toContain("sections[1].items[n=1].responses[1].answer");
    expect(findAnswerDisagreements(diffs, { a, b })).not.toContain("sections[1].items[n=1].responses[1].answer");

    const open = { ...makePage(), sections: structuredClone(a.sections) };
    open.sections[1].items[0].expr = { kind: "notation", latex: "x + 1" };
    expect(emptyAnswerDiffs(open, open, b)).toEqual([
      expect.objectContaining({ path: "sections[1].items[n=1].responses[0]", a: null, b: "17" }),
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

    // unknown family -> machine_read with clear reason
    for (const [familyA, familyB] of [
      ["codex", "invented-reader"],
      ["invented-reader", "claude"],
      ["invented-a", "invented-b"],
      ["", "codex"],
    ] as const) {
      expect(
        decidePageOutcome({ hasA: true, hasB: true, familyA, familyB, diffs: [] }),
      ).toEqual({ status: "machine_read", stopReasons: ["same or unknown model family"] });
    }

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
        missing_step: true,
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
      if (Array.isArray(blockB.examples[0].steps)) {
        blockB.examples[0].steps[0].note = "Different note";
      }
      if (Array.isArray(blockB.examples[0].marks)) {
        blockB.examples[0].marks[1].description = "GCF";
      }
    }
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
      "examples[0].steps[n=1].note",
      "examples[0].text",
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
      ["Point at (-2, 3)", "Point at (2, -3)"],
      ["Number line from -4 to 6", "Number line from 4 to -6"],
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
      ["Point at (-2, 3)", "Dot placed at (\u22122, 3)"],
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
      // (The place of the answer differs too; see "never pairs two entries" in compare-batch.test.ts.)
      const scaffoldDiffs = compareRecords(placeA, placeB).filter((d) => d.path.includes("scaffolds"));
      expect(scaffoldDiffs, `${placesA[0]} vs ${placesB[0]}`).toEqual([
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
        missing_step: true,
      },
    ]);

    // B-only mark on a shifted step carries reader A's mapped step number in the reported entry
    const shiftedA = pageWithExample(
      [
        { n: 1, shows: "other", shows_other: "Given line", printed: "2x + 1 = 7" },
        { n: 2, shows: "setup", printed: "2x = 6" },
        { n: 3, shows: "answer", printed: "x = 3" },
      ],
      [],
    );
    const shiftedB = pageWithExample(
      [
        { n: 1, shows: "setup", printed: "2x = 6" },
        { n: 2, shows: "answer", printed: "x = 3" },
      ],
      [{ kind: "box", step: 2, description: "Box around x = 3" }],
    );
    const shiftedSummary = classifyComparison(shiftedA, shiftedB);
    expect(shiftedSummary.differences).toEqual([]);
    expect(shiftedSummary.once_read).toEqual([
      {
        path: "examples[0].steps[n=1]",
        a: { n: 1, shows: "other", shows_other: "Given line", printed: "2x + 1 = 7" },
        b: null,
        kind: "once_read",
        reader: "a",
        final_path: "examples[0].steps[0]",
      },
      {
        path: "examples[0].marks[b:0]",
        a: null,
        b: { kind: "box", step: 3, description: "Box around x = 3" },
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

describe("90% reader agreement rule", () => {
  // Builds a clean page with `itemCount` simple arithmetic items and no examples/prose flags.
  // Each item has 8 non-empty compared leaf fields (printed, form, op, 2 operands, position, answer, answer_source).
  // Page header has 14 compared leaf fields (source_ref, topic.title, topic.number, 5x2 score_bands, section.instruction).
  function makeGridPage(itemCount: number): PageRecord {
    const items = Array.from({ length: itemCount }, (_, idx) => {
      const n = idx + 1;
      return {
        n,
        printed: `${n} + 1 =`,
        form: "horizontal" as const,
        expr: { kind: "arith" as const, op: "add" as const, operands: [n, 1] },
        responses: [
          {
            position: "after_equals" as const,
            cue: null,
            answer: String(n + 1),
            answer_source: "computed" as const,
          },
        ],
      };
    });
    return makePage({
      sections: [{ instruction: "Add.", scaffolds: [], items }],
    });
  }

  it("distinguishes 89% (machine_read), exactly 90% (agreement_accepted), and 100% (double_read)", () => {
    // 14 header fields + 1 order check + 10 items * 8 fields = 95 compared fields.
    const base = makeGridPage(10);
    // Add 5 more leaf fields via a 4-value number_strip scaffold: applies_to (1) + 4 values (4) = 5 -> total 100.
    base.sections[0].scaffolds = [
      { kind: "number_strip", applies_to: "all", values: [1, 2, 3, 4] },
    ];
    const identical = compareRecordsWithCounts(base, structuredClone(base));
    expect(identical.counts).toEqual({ compared: 100, agreed: 100 });
    expect(agreementPercentage(100, 100)).toBe(100);
    expect(
      decideStatus({
        hasA: true,
        hasB: true,
        familyA: "claude",
        familyB: "codex",
        diffs: identical.diffs,
        counts: identical.counts,
      }),
    ).toBe("double_read");

    // Mutate exactly 10 fields -> 90/100 = 90% -> agreement_accepted
    const at90 = structuredClone(base);
    for (let i = 0; i < 10; i += 1) {
      at90.sections[0].items[i].printed = `${i + 1} + 2 =`;
    }
    const cmp90 = compareRecordsWithCounts(base, at90);
    expect(cmp90.counts).toEqual({ compared: 100, agreed: 90 });
    expect(agreementPercentage(cmp90.counts.agreed, cmp90.counts.compared)).toBe(90);
    expect(
      decideStatus({
        hasA: true,
        hasB: true,
        familyA: "claude",
        familyB: "codex",
        diffs: cmp90.diffs,
        counts: cmp90.counts,
      }),
    ).toBe("agreement_accepted");

    // Mutate 11 fields -> 89/100 = 89% -> machine_read (sent to a person)
    const at89 = structuredClone(at90);
    at89.topic.title = "Different Title";
    const cmp89 = compareRecordsWithCounts(base, at89);
    expect(cmp89.counts).toEqual({ compared: 100, agreed: 89 });
    expect(agreementPercentage(cmp89.counts.agreed, cmp89.counts.compared)).toBe(89);
    const decision89 = decidePageOutcome({
      hasA: true,
      hasB: true,
      familyA: "claude",
      familyB: "codex",
      diffs: cmp89.diffs,
      counts: cmp89.counts,
    });
    expect(decision89.status).toBe("machine_read");
    expect(decision89.stopReasons).toEqual([]);
  });

  it("counts both_unclear and once_read as disagreements and wording as agreement", () => {
    const a = makeGridPage(2); // 14 header + 1 order + 16 item fields = 31 compared fields
    const b = structuredClone(a);

    // 1. both_unclear counts as 1 disagreement
    a.topic.title = UNCLEAR;
    b.topic.title = UNCLEAR;
    const unclearCmp = compareRecordsWithCounts(a, b);
    expect(unclearCmp.diffs).toEqual([{ path: "topic.title", a: UNCLEAR, b: UNCLEAR, kind: "both_unclear" }]);
    expect(unclearCmp.counts).toEqual({ compared: 31, agreed: 30 });

    // 2. once_read counts as 1 disagreeing compared field
    const aOnce = makeGridPage(2);
    const bOnce = structuredClone(aOnce);
    bOnce.sections[0].scaffolds = [{ kind: "arrow", applies_to: [1], label: "next" }];
    const onceCmp = compareRecordsWithCounts(aOnce, bOnce);
    expect(onceCmp.diffs).toHaveLength(1);
    expect(onceCmp.diffs[0].kind).toBe("once_read");
    expect(onceCmp.counts).toEqual({ compared: 32, agreed: 31 });

    // 3. wording counts as agreement (100% -> double_read)
    const aWord = makeGridPage(2);
    const bWord = structuredClone(aWord);
    aWord.sections[0].scaffolds = [{ kind: "helper_digit", applies_to: [1], description: "Small 1 above tens" }];
    bWord.sections[0].scaffolds = [{ kind: "helper_digit", applies_to: [1], description: "Tiny 1 printed above tens" }];
    const wordCmp = compareRecordsWithCounts(aWord, bWord);
    expect(wordCmp.diffs).toHaveLength(1);
    expect(wordCmp.diffs[0].kind).toBe("wording");
    expect(wordCmp.counts.agreed).toBe(wordCmp.counts.compared);
    expect(
      decideStatus({
        hasA: true,
        hasB: true,
        familyA: "claude",
        familyB: "codex",
        diffs: wordCmp.diffs,
        counts: wordCmp.counts,
      }),
    ).toBe("double_read");
  });

  it("stops a page at 95% and (where reachable) 100% for every stop reason in PAGE_STOP_REASONS, while prose is advisory", () => {
    const oneNonStopDiff = [{ path: "topic.title", a: "Sums", b: "Totals", kind: "value" as const }];
    const base95: DecideStatusInput = {
      hasA: true,
      hasB: true,
      familyA: "codex",
      familyB: "claude",
      sameDigest: true,
      diffs: oneNonStopDiff,
      counts: { agreed: 19, compared: 20 },
    };
    const base100: DecideStatusInput = {
      hasA: true,
      hasB: true,
      familyA: "codex",
      familyB: "claude",
      sameDigest: true,
      diffs: [],
      counts: { agreed: 20, compared: 20 },
    };

    // Control pages without any stop trigger pass as agreement_accepted (95%) and double_read (100%).
    expect(decidePageOutcome(base95)).toEqual({ status: "agreement_accepted", stopReasons: [] });
    expect(decidePageOutcome(base100)).toEqual({ status: "double_read", stopReasons: [] });
    // needs_person_read is advisory and does not stop acceptance at >= 90%.
    expect(decidePageOutcome({ ...base95, needsPersonRead: true })).toEqual({
      status: "agreement_accepted",
      stopReasons: [],
    });
    expect(meetsAgreementThreshold(0, 0)).toBe(false);

    // Worked-example shown_answer conflict helper feeds the real answer conflict flags.
    const makeExConflictPage = (shownA: string, shownB: string) => {
      const a = makeGridPage(3);
      a.examples = [
        {
          position: "top",
          relation: "compare",
          parts: [{ form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: shownA }],
        },
      ];
      const b = structuredClone(a);
      if (Array.isArray(b.examples)) {
        b.examples[0].parts[0].shown_answer = shownB;
      }
      return { a, b, exConflicts: collectExampleAnswerConflicts(a, a, b, { finalIsFreshA: true }) };
    };
    const exFinalConflict = makeExConflictPage("6", "6");
    expect(exFinalConflict.exConflicts.finalMessages).toHaveLength(1);
    const exReaderConflict = makeExConflictPage("5", "6");
    expect(exReaderConflict.exConflicts.readerMessages).toEqual([
      'reader b: examples[0].parts[0].shown_answer: shown "6", computed "5"',
    ]);

    const chainAndStepPage = makeGridPage(3);
    chainAndStepPage.examples = [
      {
        position: "top",
        relation: "sequence",
        parts: [{ form: "horizontal", expr: { kind: "chain", terms: [2, null, 6], step: 2 }, shown_answer: "99" }],
        steps: [{ n: 1, shows: "answer", printed: "98" }],
      },
    ];
    const twoPlacesPage = makeGridPage(3);
    twoPlacesPage.sections[0].items[0].responses = ["2", "3"].map((answer) => ({
      position: "box",
      cue: null,
      answer,
      answer_source: "reader",
    }));
    const printedPage = makeGridPage(3);
    printedPage.sections[0].items[0].printed = "1 - 1 =";

    type StopScenario =
      | { at95: Partial<DecideStatusInput>; at100?: Partial<DecideStatusInput>; custom?: never }
      | { at95?: Partial<DecideStatusInput>; at100: Partial<DecideStatusInput>; custom?: never }
      | { at95?: never; at100?: never; custom: DecideStatusInput };

    const stopTable: Array<{ reason: PageStopReason; label: string } & StopScenario> = [
      {
        reason: "edited by a person (not checked yet)",
        label: "editedByPerson",
        at95: { editedByPerson: true },
        at100: { editedByPerson: true },
      },
      ...CHECK_PROBLEM_REASONS.map((reason) => ({
        reason,
        label: reason,
        at95: { checkProblems: [reason] },
        at100: { checkProblems: [reason] },
      })),
      {
        reason: "missing reader",
        label: "missing reader B",
        at95: { hasB: false },
        at100: { hasB: false },
      },
      {
        reason: "different photo digest",
        label: "sameDigest false",
        at95: { sameDigest: false },
        at100: { sameDigest: false },
      },
      {
        reason: "same or unknown model family",
        label: "same model family",
        at95: { familyA: "codex", familyB: "codex" },
        at100: { familyA: "codex", familyB: "codex" },
      },
      {
        reason: "same or unknown model family",
        label: "unknown model family",
        at95: { familyA: "codex", familyB: "invented-family" },
        at100: { familyA: "codex", familyB: "invented-family" },
      },
      {
        reason: PAGE_IDENTITY_DISAGREEMENT_REASON,
        label: "source_ref mismatch",
        at95: {
          diffs: [{ path: "source_ref", a: "sample:M:7a", b: "sample:M:7b", kind: "value" }],
        },
      },
      {
        reason: PAGE_IDENTITY_DISAGREEMENT_REASON,
        label: "kind mismatch",
        at95: {
          diffs: [{ path: "kind", a: "page", b: "contents", kind: "value" }],
        },
      },
      {
        reason: "stored answer conflicts with computed answer",
        label: "item answer conflict",
        at95: { hasAnswerConflict: true },
        at100: { hasAnswerConflict: true },
      },
      {
        reason: "stored answer conflicts with computed answer",
        label: "worked-example shown_answer conflict",
        at95: { hasAnswerConflict: exFinalConflict.exConflicts.finalMessages.length > 0 },
        at100: { hasAnswerConflict: exFinalConflict.exConflicts.finalMessages.length > 0 },
      },
      {
        reason: READER_ANSWER_CONFLICT_REASON,
        label: "reader item answer conflict",
        at95: { hasReaderAnswerConflict: true },
        at100: { hasReaderAnswerConflict: true },
      },
      {
        reason: READER_ANSWER_CONFLICT_REASON,
        label: "reader-only worked-example shown_answer conflict",
        at95: { hasReaderAnswerConflict: exReaderConflict.exConflicts.readerMessages.length > 0 },
        at100: { hasReaderAnswerConflict: exReaderConflict.exConflicts.readerMessages.length > 0 },
      },
      {
        reason: "stored answer conflicts with computed answer",
        label: "worked-example chain and answer step conflict",
        at95: { hasAnswerConflict: findExampleAnswerConflicts(chainAndStepPage).length === 2 },
        at100: { hasAnswerConflict: findExampleAnswerConflicts(chainAndStepPage).length === 2 },
      },
      {
        reason: UNPROVED_ANSWERS_REASON,
        label: "stored answers that code cannot place",
        at95: { hasUnprovedAnswers: findUnprovedAnswers(twoPlacesPage).length > 0 },
        at100: { hasUnprovedAnswers: findUnprovedAnswers(twoPlacesPage).length > 0 },
      },
      {
        reason: PRINTED_EXPRESSION_REASON,
        label: "printed line of an item",
        at95: { hasPrintedConflict: findPrintedConflicts(printedPage).length > 0 },
        at100: { hasPrintedConflict: findPrintedConflicts(printedPage).length > 0 },
      },
      {
        reason: "empty answer place",
        label: "empty_answer diff",
        at95: {
          diffs: [
            ...oneNonStopDiff,
            { path: "sections[0].items[n=1].responses[0]", a: null, b: null, kind: "empty_answer" },
          ],
        },
        at100: {
          diffs: [
            { path: "sections[0].items[n=1].responses[0]", a: null, b: null, kind: "empty_answer" },
          ],
        },
      },
      {
        reason: ANSWER_DISAGREEMENT_REASON,
        label: "item answer disagreement at 95% and read-time unclear_filled at 100%",
        at95: {
          diffs: [
            { path: "sections[0].items[n=1].responses[0].answer", a: "4", b: "5", kind: "value" },
          ],
        },
        at100: {
          answerDisagreements: ["sections[0].items[n=1].responses[0].answer"],
        },
      },
      {
        reason: EXPRESSION_DISAGREEMENT_REASON,
        label: "item expression disagreement",
        at95: {
          diffs: [
            { path: "sections[0].items[n=1].expr.operands[0]", a: 2, b: 1, kind: "value" },
          ],
        },
      },
      {
        reason: "no compared fields",
        label: "zero compared fields",
        custom: { ...base100, counts: { agreed: 0, compared: 0 } },
      },
    ];

    // Guard: every stop reason in PAGE_STOP_REASONS must have at least one case in the table.
    const coveredReasons = new Set<PageStopReason>(stopTable.map((row) => row.reason));
    expect([...coveredReasons].sort()).toEqual([...PAGE_STOP_REASONS].sort());

    for (const row of stopTable) {
      let ran = 0;
      if (row.at95) {
        ran += 1;
        const res = decidePageOutcome({ ...base95, ...row.at95 });
        expect(res.status, `${row.label} @ 95%`).toBe("machine_read");
        expect(res.stopReasons, `${row.label} @ 95%`).toContain(row.reason);
      }
      if (row.at100) {
        ran += 1;
        const res = decidePageOutcome({ ...base100, ...row.at100 });
        expect(res.status, `${row.label} @ 100%`).toBe("machine_read");
        expect(res.stopReasons, `${row.label} @ 100%`).toContain(row.reason);
      }
      if (row.custom) {
        ran += 1;
        const res = decidePageOutcome(row.custom);
        expect(res.status, row.label).toBe("machine_read");
        expect(res.stopReasons, row.label).toContain(row.reason);
      }
      expect(ran, `${row.label} must exercise at least one scenario`).toBeGreaterThan(0);
    }
  });

  it("resolves single_read paths into reader A's record and excludes wording diffs", () => {
    const a = makeGridPage(2);
    const b = structuredClone(a);
    b.topic.title = "Other Title";
    b.sections[0].items[1].printed = "2 + 9 =";
    a.sections[0].scaffolds = [{ kind: "helper_digit", applies_to: [1], description: "Small 1 above tens" }];
    b.sections[0].scaffolds = [{ kind: "helper_digit", applies_to: [1], description: "Tiny 1 printed above tens" }];

    const cmp = compareRecordsWithCounts(a, b);
    expect(resolveSingleReadPaths(a, cmp.diffs)).toEqual([
      "topic.title",
      "sections[0].items[1].printed",
    ]);
  });

  it("maps entries absent from reader A to the existing containing list or object in single_read for both page and contents records", () => {
    // Page: reader A omitted item 1 and a scaffold, and omitted optional topic.number and response unit.
    const pageA = makeGridPage(3);
    pageA.topic = { title: "Adding Numbers" };
    pageA.sections[0].items = pageA.sections[0].items.slice(1); // items [2, 3]
    const pageB = makeGridPage(3);
    pageB.topic = { title: "Adding Numbers", number: 2 };
    pageB.sections[0].scaffolds = [{ kind: "arrow", applies_to: "all", from: "left", to: "right" }];
    pageB.sections[0].items[1].responses[0].unit = "cm"; // on item n=2

    const pageCmp = compareRecordsWithCounts(pageA, pageB);
    const pagePaths = resolveSingleReadPaths(pageA, pageCmp.diffs);
    expect(pagePaths).toEqual([
      "topic",
      "sections[0].scaffolds",
      "sections[0].items[0].responses[0]",
      "sections[0].items",
    ]);
    for (const p of pagePaths) expect(recordPathResolves(pageA, p)).toBe(true);

    // Page: when item 2 IS in reader A and omitted by reader B, single_read resolves to exact item 2 (index 0).
    const aHasExtra = makeGridPage(3);
    aHasExtra.sections[0].items = aHasExtra.sections[0].items.slice(1); // items [2, 3]
    const bMissing2 = makeGridPage(3);
    bMissing2.sections[0].items = [bMissing2.sections[0].items[2]]; // items [3]
    const extraCmp = compareRecordsWithCounts(aHasExtra, bMissing2);
    const extraPaths = resolveSingleReadPaths(aHasExtra, extraCmp.diffs);
    expect(extraPaths).toEqual(["sections[0].items[0]"]);
    for (const p of extraPaths) expect(recordPathResolves(aHasExtra, p)).toBe(true);

    // Contents: reader A omitted topic 1 -> single_read marks "topics", never "topics[0]" (which is topic 2).
    const contentsA: ContentsRecord = {
      kind: "contents",
      source_ref: "sample:M:contents",
      topics: [2, 3, 4].map((n) => ({ n, title: `Topic ${n}`, sheets: [n, n], std_time_min: [1, 2] })),
    };
    const contentsB: ContentsRecord = {
      kind: "contents",
      source_ref: "sample:M:contents",
      topics: [1, 2, 3, 4].map((n) => ({ n, title: `Topic ${n}`, sheets: [n, n], std_time_min: [1, 2] })),
    };
    const contentsCmp = compareRecordsWithCounts(contentsA, contentsB);
    const contentsPaths = resolveSingleReadPaths(contentsA, contentsCmp.diffs);
    expect(contentsPaths).toEqual(["topics"]);
    for (const p of contentsPaths) expect(recordPathResolves(contentsA, p)).toBe(true);

    // Contents: when topic 2 IS in reader A and omitted by reader B, single_read resolves to "topics[0]".
    const contentsBMissing2: ContentsRecord = {
      kind: "contents",
      source_ref: "sample:M:contents",
      topics: [3, 4].map((n) => ({ n, title: `Topic ${n}`, sheets: [n, n], std_time_min: [1, 2] })),
    };
    const contentsExtraCmp = compareRecordsWithCounts(contentsA, contentsBMissing2);
    const contentsExtraPaths = resolveSingleReadPaths(contentsA, contentsExtraCmp.diffs);
    expect(contentsExtraPaths).toEqual(["topics[0]"]);
    for (const p of contentsExtraPaths) expect(recordPathResolves(contentsA, p)).toBe(true);
  });

  it("counts the item order check only when both readers share at least two items, in both matching and reversed order", () => {
    const makeItemsFromNs = (ns: number[]): PageRecord => {
      const page = makePage({
        topic: { title: "Addition practice" },
        sections: [
          {
            instruction: "Add.",
            scaffolds: [],
            items: ns.map((n) => ({
              n,
              printed: `${n} + 1 =`,
              form: "horizontal" as const,
              expr: { kind: "arith" as const, op: "add" as const, operands: [n, 1] },
              responses: [
                {
                  position: "after_equals" as const,
                  cue: null,
                  answer: String(n + 1),
                  answer_source: "computed" as const,
                },
              ],
            })),
          },
        ],
      });
      return page;
    };

    // 1 source_ref + 1 topic.title + 10 score_bands + 1 instruction = 13 header fields.
    // Each shared item contributes 8 compared fields; each unshared item contributes 1 diff.
    const orderCases: Array<{
      label: string;
      aNs: number[];
      bNs: number[];
      expectedOrderCounted: boolean;
      expectedOrderDiff: boolean;
      expectedCompared: number;
      expectedAgreed: number;
    }> = [
      {
        label: "0 shared (both empty)",
        aNs: [],
        bNs: [],
        expectedOrderCounted: false,
        expectedOrderDiff: false,
        expectedCompared: 13,
        expectedAgreed: 13,
      },
      {
        label: "0 shared (disjoint 1 vs 1)",
        aNs: [1],
        bNs: [2],
        expectedOrderCounted: false,
        expectedOrderDiff: false,
        expectedCompared: 15,
        expectedAgreed: 13,
      },
      {
        label: "0 shared (disjoint 2 vs 2)",
        aNs: [1, 2],
        bNs: [3, 4],
        expectedOrderCounted: false,
        expectedOrderDiff: false,
        expectedCompared: 17,
        expectedAgreed: 13,
      },
      {
        label: "1 shared (single item each)",
        aNs: [1],
        bNs: [1],
        expectedOrderCounted: false,
        expectedOrderDiff: false,
        expectedCompared: 21,
        expectedAgreed: 21,
      },
      {
        label: "1 shared with extra unshared items",
        aNs: [1, 2],
        bNs: [3, 1],
        expectedOrderCounted: false,
        expectedOrderDiff: false,
        expectedCompared: 23,
        expectedAgreed: 21,
      },
      {
        label: "2 shared in matching order",
        aNs: [1, 2],
        bNs: [1, 2],
        expectedOrderCounted: true,
        expectedOrderDiff: false,
        expectedCompared: 30,
        expectedAgreed: 30,
      },
      {
        label: "2 shared in differing order",
        aNs: [1, 2],
        bNs: [2, 1],
        expectedOrderCounted: true,
        expectedOrderDiff: true,
        expectedCompared: 30,
        expectedAgreed: 29,
      },
      {
        label: "2 shared in matching order with unshared items",
        aNs: [1, 9, 2],
        bNs: [8, 1, 2],
        expectedOrderCounted: true,
        expectedOrderDiff: false,
        expectedCompared: 32,
        expectedAgreed: 30,
      },
      {
        label: "2 shared in differing order with unshared items",
        aNs: [1, 9, 2],
        bNs: [2, 8, 1],
        expectedOrderCounted: true,
        expectedOrderDiff: true,
        expectedCompared: 32,
        expectedAgreed: 29,
      },
    ];

    for (const c of orderCases) {
      const cmp = compareRecordsWithCounts(makeItemsFromNs(c.aNs), makeItemsFromNs(c.bNs));
      expect(cmp.counts, c.label).toEqual({
        compared: c.expectedCompared,
        agreed: c.expectedAgreed,
      });
      const orderDiffs = cmp.diffs.filter((d) => d.kind === "order");
      expect(orderDiffs.length === 1, c.label).toBe(c.expectedOrderDiff);
      // Confirm expectedOrderCounted matches compared minus header/shared/unshared field counts.
      const shared = c.aNs.filter((n) => c.bNs.includes(n)).length;
      const unshared = c.aNs.length + c.bNs.length - 2 * shared;
      expect(cmp.counts.compared - (13 + shared * 8 + unshared), c.label).toBe(
        c.expectedOrderCounted ? 1 : 0,
      );
    }

    // Same denominator at the 90% boundary: matching order passes (27/30), reversed fails (26/30).
    const aOrder = makeItemsFromNs([1, 2]);
    const bSameOrder = structuredClone(aOrder);
    bSameOrder.topic.title = "Alternate title";
    for (const item of bSameOrder.sections[0].items) item.printed += " \u25A1";

    const sameCmp = compareRecordsWithCounts(aOrder, bSameOrder);
    expect(sameCmp.counts).toEqual({ compared: 30, agreed: 27 });
    expect(agreementPercentage(sameCmp.counts.agreed, sameCmp.counts.compared)).toBe(90);
    expect(
      decideStatus({
        hasA: true,
        hasB: true,
        familyA: "codex",
        familyB: "claude",
        diffs: sameCmp.diffs,
        counts: sameCmp.counts,
      }),
    ).toBe("agreement_accepted");

    const bReversed = structuredClone(bSameOrder);
    bReversed.sections[0].items.reverse();
    const reversedCmp = compareRecordsWithCounts(aOrder, bReversed);
    expect(reversedCmp.counts).toEqual({ compared: 30, agreed: 26 });
    expect(reversedCmp.diffs.some((d) => d.kind === "order")).toBe(true);
    expect(
      decideStatus({
        hasA: true,
        hasB: true,
        familyA: "codex",
        familyB: "claude",
        diffs: reversedCmp.diffs,
        counts: reversedCmp.counts,
      }),
    ).toBe("machine_read");
  });

  it("sends a page to a person at any agreement percentage when readers disagree on an item answer, unclear answer, or one-sided item with an answer", () => {
    const base = makeGridPage(10);
    base.sections[0].scaffolds = [
      { kind: "number_strip", applies_to: "all", values: [1, 2, 3, 4] },
    ];
    // 100% matching page stays double_read.
    const sameCmp = compareRecordsWithCounts(base, structuredClone(base));
    expect(
      decidePageOutcome({
        hasA: true,
        hasB: true,
        familyA: "codex",
        familyB: "claude",
        diffs: sameCmp.diffs,
        counts: sameCmp.counts,
        recordA: base,
        recordB: base,
      }),
    ).toEqual({ status: "double_read", stopReasons: [] });

    // 95% page with only non-answer diffs (5 printed diffs out of 100) stays agreement_accepted.
    const nonAnswer95 = structuredClone(base);
    for (let i = 0; i < 5; i += 1) {
      nonAnswer95.sections[0].items[i].printed = `${i + 1} + 2 =`;
    }
    const nonAnswerCmp = compareRecordsWithCounts(base, nonAnswer95);
    expect(nonAnswerCmp.counts).toEqual({ compared: 100, agreed: 95 });
    expect(agreementPercentage(nonAnswerCmp.counts.agreed, nonAnswerCmp.counts.compared)).toBe(95);
    expect(findAnswerDisagreements(nonAnswerCmp.diffs, { a: base, b: nonAnswer95 })).toEqual([]);
    expect(
      decidePageOutcome({
        hasA: true,
        hasB: true,
        familyA: "codex",
        familyB: "claude",
        diffs: nonAnswerCmp.diffs,
        counts: nonAnswerCmp.counts,
        recordA: base,
        recordB: nonAnswer95,
      }),
    ).toEqual({ status: "agreement_accepted", stopReasons: [] });

    // Same 95% page with one item answer difference (42 vs 43) -> machine_read with reason, counts unchanged.
    const ansBase = structuredClone(base);
    ansBase.sections[0].items[0].responses[0] = {
      position: "after_equals",
      cue: null,
      answer: "42",
      answer_source: "reader",
    };
    const ansDiff = structuredClone(ansBase);
    for (let i = 1; i <= 4; i += 1) {
      ansDiff.sections[0].items[i].printed = `${i + 1} + 2 =`;
    }
    ansDiff.sections[0].items[0].responses[0].answer = "43";
    const ansCmp = compareRecordsWithCounts(ansBase, ansDiff);
    expect(ansCmp.counts).toEqual({ compared: 100, agreed: 95 });
    expect(findAnswerDisagreements(ansCmp.diffs, { a: ansBase, b: ansDiff })).toEqual([
      "sections[0].items[n=1].responses[0].answer",
    ]);
    expect(
      decidePageOutcome({
        hasA: true,
        hasB: true,
        familyA: "codex",
        familyB: "claude",
        diffs: ansCmp.diffs,
        counts: ansCmp.counts,
        recordA: ansBase,
        recordB: ansDiff,
      }),
    ).toEqual({ status: "machine_read", stopReasons: [ANSWER_DISAGREEMENT_REASON] });

    // one_unclear on an answer
    const oneUnclearB = structuredClone(ansBase);
    oneUnclearB.sections[0].items[0].responses[0].answer = UNCLEAR;
    const oneUnclearCmp = compareRecordsWithCounts(ansBase, oneUnclearB);
    expect(oneUnclearCmp.diffs).toEqual([
      {
        path: "sections[0].items[n=1].responses[0].answer",
        a: "42",
        b: UNCLEAR,
        kind: "one_unclear",
      },
    ]);
    expect(
      decidePageOutcome({
        hasA: true,
        hasB: true,
        familyA: "codex",
        familyB: "claude",
        diffs: oneUnclearCmp.diffs,
        counts: oneUnclearCmp.counts,
        recordA: ansBase,
        recordB: oneUnclearB,
      }),
    ).toEqual({ status: "machine_read", stopReasons: [ANSWER_DISAGREEMENT_REASON] });

    // both_unclear on an answer
    const bothA = structuredClone(ansBase);
    const bothB = structuredClone(ansBase);
    bothA.sections[0].items[0].responses[0].answer = UNCLEAR;
    bothB.sections[0].items[0].responses[0].answer = UNCLEAR;
    const bothCmp = compareRecordsWithCounts(bothA, bothB);
    expect(bothCmp.diffs).toEqual([
      {
        path: "sections[0].items[n=1].responses[0].answer",
        a: UNCLEAR,
        b: UNCLEAR,
        kind: "both_unclear",
      },
    ]);
    expect(
      decidePageOutcome({
        hasA: true,
        hasB: true,
        familyA: "codex",
        familyB: "claude",
        diffs: bothCmp.diffs,
        counts: bothCmp.counts,
        recordA: bothA,
        recordB: bothB,
      }),
    ).toEqual({ status: "machine_read", stopReasons: [ANSWER_DISAGREEMENT_REASON] });

    // One-sided item that has an answer (both real compare diff and once_read diff) stops the page.
    const missingItemA = structuredClone(base);
    missingItemA.sections[0].items = missingItemA.sections[0].items.slice(1);
    const missingItemCmp = compareRecordsWithCounts(missingItemA, base);
    expect(agreementPercentage(missingItemCmp.counts.agreed, missingItemCmp.counts.compared)).toBeGreaterThanOrEqual(90);
    expect(findAnswerDisagreements(missingItemCmp.diffs, { a: missingItemA, b: base })).toEqual([
      "sections[0].items[n=1]",
    ]);
    expect(
      decidePageOutcome({
        hasA: true,
        hasB: true,
        familyA: "codex",
        familyB: "claude",
        diffs: missingItemCmp.diffs,
        counts: missingItemCmp.counts,
        recordA: missingItemA,
        recordB: base,
      }),
    ).toEqual({
      status: "machine_read",
      stopReasons: [ANSWER_DISAGREEMENT_REASON, EXPRESSION_DISAGREEMENT_REASON],
    });

    const onceReadItemOutcome = decidePageOutcome({
      hasA: true,
      hasB: true,
      familyA: "codex",
      familyB: "claude",
      diffs: [
        {
          path: "sections[0].items[n=11]",
          a: null,
          b: base.sections[0].items[0],
          kind: "once_read",
        },
      ],
      counts: { agreed: 19, compared: 20 },
    });
    expect(onceReadItemOutcome).toEqual({
      status: "machine_read",
      stopReasons: [ANSWER_DISAGREEMENT_REASON, EXPRESSION_DISAGREEMENT_REASON],
    });

    // One-sided action item with no answer (checkbox, answer: null) does NOT trigger the answer stop rule.
    const actionB = structuredClone(base);
    actionB.sections[0].items.push({
      n: 11,
      printed: "Read aloud",
      form: null,
      expr: null,
      responses: [{ position: "checkbox", cue: null, answer: null, answer_source: "unchecked" }],
    });
    const actionCmp = compareRecordsWithCounts(base, actionB);
    expect(findAnswerDisagreements(actionCmp.diffs, { a: base, b: actionB })).toEqual([]);
    expect(
      decidePageOutcome({
        hasA: true,
        hasB: true,
        familyA: "codex",
        familyB: "claude",
        diffs: actionCmp.diffs,
        counts: actionCmp.counts,
        recordA: base,
        recordB: actionB,
      }),
    ).toEqual({ status: "agreement_accepted", stopReasons: [] });
  });

  it("catches worked-example step answers, shown_answer, parts inside an answer (digit boxes, remainders, sub-paths), wording on an answer, and printed answers on worked_item scaffolds", () => {
    // 1. Worked-example step answer (shows: "answer" and shows: "remainder"): value, one_unclear, both_unclear, once_read, and shows mismatch.
    const exBase = makeGridPage(10);
    exBase.examples = [
      {
        position: "top",
        relation: "sequence",
        parts: [
          {
            form: "horizontal",
            expr: { kind: "arith", op: "div", operands: [9, 2] },
            shown_answer: "4 R1",
          },
        ],
        steps: [
          { n: 1, shows: "setup", printed: "9 / 2" },
          { n: 2, shows: "answer", printed: "4" },
          { n: 3, shows: "remainder", printed: "R1" },
        ],
        marks: [],
      },
    ];

    // Non-answer step (shows: "setup") differing printed does NOT trigger answer rule.
    const setupDiff = structuredClone(exBase);
    if (Array.isArray(setupDiff.examples) && Array.isArray(setupDiff.examples[0].steps)) {
      setupDiff.examples[0].steps[0].printed = "10 / 2";
    }
    const setupCmp = compareRecordsWithCounts(exBase, setupDiff);
    expect(setupCmp.diffs).toHaveLength(1);
    expect(findAnswerDisagreements(setupCmp.diffs, { a: exBase, b: setupDiff })).toEqual([]);
    expect(
      decidePageOutcome({
        hasA: true,
        hasB: true,
        familyA: "codex",
        familyB: "claude",
        diffs: setupCmp.diffs,
        counts: setupCmp.counts,
        recordA: exBase,
        recordB: setupDiff,
      }).status,
    ).toBe("agreement_accepted");

    // Step with shows: "answer" differing printed (value, one_unclear, both_unclear) and shows mismatch -> machine_read
    const stepAnsDiff = structuredClone(exBase);
    if (Array.isArray(stepAnsDiff.examples) && Array.isArray(stepAnsDiff.examples[0].steps)) {
      stepAnsDiff.examples[0].steps[1].printed = "5";
    }
    const stepAnsCmp = compareRecordsWithCounts(exBase, stepAnsDiff);
    expect(findAnswerDisagreements(stepAnsCmp.diffs, { a: exBase, b: stepAnsDiff })).toEqual([
      "examples[0].steps[n=2].printed",
    ]);
    expect(
      decidePageOutcome({
        hasA: true,
        hasB: true,
        familyA: "codex",
        familyB: "claude",
        diffs: stepAnsCmp.diffs,
        counts: stepAnsCmp.counts,
        recordA: exBase,
        recordB: stepAnsDiff,
      }),
    ).toEqual({ status: "machine_read", stopReasons: [ANSWER_DISAGREEMENT_REASON] });

    const stepShowsDiff = structuredClone(exBase);
    if (Array.isArray(stepShowsDiff.examples) && Array.isArray(stepShowsDiff.examples[0].steps)) {
      stepShowsDiff.examples[0].steps[1].shows = "partial_sum";
    }
    const stepShowsCmp = compareRecordsWithCounts(exBase, stepShowsDiff);
    expect(findAnswerDisagreements(stepShowsCmp.diffs, { a: exBase, b: stepShowsDiff })).toEqual([
      "examples[0].steps[n=2].shows",
    ]);

    const stepUnclearA = structuredClone(exBase);
    const stepUnclearB = structuredClone(exBase);
    if (
      Array.isArray(stepUnclearA.examples) &&
      Array.isArray(stepUnclearA.examples[0].steps) &&
      Array.isArray(stepUnclearB.examples) &&
      Array.isArray(stepUnclearB.examples[0].steps)
    ) {
      stepUnclearB.examples[0].steps[1].printed = UNCLEAR;
      expect(
        findAnswerDisagreements(compareRecordsWithCounts(stepUnclearA, stepUnclearB).diffs, {
          a: stepUnclearA,
          b: stepUnclearB,
        }),
      ).toEqual(["examples[0].steps[n=2].printed"]);
      stepUnclearA.examples[0].steps[1].printed = UNCLEAR;
      expect(
        findAnswerDisagreements(compareRecordsWithCounts(stepUnclearA, stepUnclearB).diffs, {
          a: stepUnclearA,
          b: stepUnclearB,
        }),
      ).toEqual(["examples[0].steps[n=2].printed"]);
    }

    // Whole once_read Example containing an answer stops the page; one with no answer does not.
    const noExPage = makeGridPage(10);
    const exWithAnsCmp = compareRecordsWithCounts(noExPage, exBase);
    expect(findAnswerDisagreements(exWithAnsCmp.diffs, { a: noExPage, b: exBase })).toEqual([
      "examples[b:0]",
    ]);
    const exNoAns = makeGridPage(10);
    exNoAns.examples = [
      {
        position: "top",
        relation: "compare",
        parts: [{ form: "horizontal", expr: { kind: "arith", op: "add", operands: [1, 2] } }],
        steps: [{ n: 1, shows: "setup", printed: "1 + 2" }],
        marks: [],
      },
    ];
    const exNoAnsCmp = compareRecordsWithCounts(noExPage, exNoAns);
    expect(findAnswerDisagreements(exNoAnsCmp.diffs, { a: noExPage, b: exNoAns })).toEqual([]);

    // One-sided section with an answer item, one-sided example part with shown_answer, and one_unclear steps list containing an answer step
    const extraSecB = structuredClone(exBase);
    extraSecB.sections.push({
      instruction: "Extra.",
      scaffolds: [],
      items: [
        {
          n: 1,
          printed: "1 + 1 =",
          form: "horizontal",
          expr: { kind: "arith", op: "add", operands: [1, 1] },
          responses: [{ position: "after_equals", cue: null, answer: "2", answer_source: "computed" }],
        },
      ],
    });
    expect(
      findAnswerDisagreements(compareRecordsWithCounts(exBase, extraSecB).diffs, {
        a: exBase,
        b: extraSecB,
      }),
    ).toEqual(["sections[b:1]"]);

    const extraPartB = structuredClone(exBase);
    if (Array.isArray(extraPartB.examples)) {
      extraPartB.examples[0].parts.push({
        form: "horizontal",
        expr: { kind: "arith", op: "add", operands: [2, 2] },
        shown_answer: "4",
      });
    }
    expect(
      findAnswerDisagreements(compareRecordsWithCounts(exBase, extraPartB).diffs, {
        a: exBase,
        b: extraPartB,
      }),
    ).toEqual(["examples[0].parts[b:1]"]);

    const unclearStepsB = structuredClone(exBase);
    if (Array.isArray(unclearStepsB.examples)) {
      unclearStepsB.examples[0].steps = UNCLEAR;
    }
    expect(
      findAnswerDisagreements(compareRecordsWithCounts(exBase, unclearStepsB).diffs, {
        a: exBase,
        b: unclearStepsB,
      }),
    ).toEqual(["examples[0].steps"]);

    // Step with shows: "remainder" differing printed -> machine_read
    const stepRemDiff = structuredClone(exBase);
    if (Array.isArray(stepRemDiff.examples) && Array.isArray(stepRemDiff.examples[0].steps)) {
      stepRemDiff.examples[0].steps[2].printed = "R2";
    }
    const stepRemCmp = compareRecordsWithCounts(exBase, stepRemDiff);
    expect(findAnswerDisagreements(stepRemCmp.diffs, { a: exBase, b: stepRemDiff })).toEqual([
      "examples[0].steps[n=3].printed",
    ]);

    // once_read worked-example step that has shows: "answer" -> machine_read
    const missingAnsStep = structuredClone(exBase);
    if (Array.isArray(missingAnsStep.examples) && Array.isArray(missingAnsStep.examples[0].steps)) {
      missingAnsStep.examples[0].steps = [missingAnsStep.examples[0].steps[0]];
    }
    const onceStepCmp = compareRecordsWithCounts(exBase, missingAnsStep);
    expect(findAnswerDisagreements(onceStepCmp.diffs, { a: exBase, b: missingAnsStep })).toEqual([
      "examples[0].steps[n=2]",
      "examples[0].steps[n=3]",
    ]);

    // ExamplePart.shown_answer differing value and once_read -> machine_read
    const shownDiff = structuredClone(exBase);
    if (Array.isArray(shownDiff.examples)) {
      shownDiff.examples[0].parts[0].shown_answer = "4 R2";
    }
    const shownCmp = compareRecordsWithCounts(exBase, shownDiff);
    expect(findAnswerDisagreements(shownCmp.diffs, { a: exBase, b: shownDiff })).toEqual([
      "examples[0].parts[0].shown_answer",
    ]);
    const shownOnce = structuredClone(exBase);
    if (Array.isArray(shownOnce.examples)) {
      delete shownOnce.examples[0].parts[0].shown_answer;
    }
    const shownOnceCmp = compareRecordsWithCounts(exBase, shownOnce);
    expect(shownOnceCmp.diffs[0]?.kind).toBe("once_read");
    expect(findAnswerDisagreements(shownOnceCmp.diffs, { a: exBase, b: shownOnce })).toEqual([
      "examples[0].parts[0].shown_answer",
    ]);

    // 2. Parts inside an answer value: digit boxes, separate remainder box, and nested path under .answer.
    const boxA = makeGridPage(10);
    boxA.sections[0].scaffolds = [
      { kind: "answer_boxes", applies_to: [1], box_count: 2, places: ["tens", "ones"] },
    ];
    boxA.sections[0].items[0] = {
      n: 1,
      printed: "20 + 22 = □□",
      form: "horizontal",
      expr: { kind: "arith", op: "add", operands: [20, 22] },
      responses: [
        { position: "box", cue: null, answer: "4", answer_source: "reader", place: "tens" },
        { position: "box", cue: null, answer: "2", answer_source: "reader", place: "ones" },
      ],
    };
    const boxB = structuredClone(boxA);
    boxB.sections[0].items[0].responses[1].answer = "3";
    const boxCmp = compareRecordsWithCounts(boxA, boxB);
    expect(findAnswerDisagreements(boxCmp.diffs, { a: boxA, b: boxB })).toEqual([
      "sections[0].items[n=1].responses[1].answer",
    ]);

    // Missing second digit box (whole response containing an answer)
    const oneBoxB = structuredClone(boxA);
    oneBoxB.sections[0].items[0].responses = [oneBoxB.sections[0].items[0].responses[0]];
    const oneBoxCmp = compareRecordsWithCounts(boxA, oneBoxB);
    expect(findAnswerDisagreements(oneBoxCmp.diffs, { a: boxA, b: oneBoxB })).toEqual([
      "sections[0].items[n=1].responses[1]",
    ]);

    // Remainder inside an answer value ("4 R1" vs "4 R2") and separate remainder response box
    const remA = makeGridPage(10);
    remA.sections[0].items[0] = {
      n: 1,
      printed: "9 / 2 =",
      form: "horizontal",
      expr: { kind: "arith", op: "div", operands: [9, 2] },
      responses: [
        { position: "after_equals", cue: null, answer: "4 R1", answer_source: "reader" },
      ],
    };
    const remB = structuredClone(remA);
    remB.sections[0].items[0].responses[0].answer = "4 R2";
    const remCmp = compareRecordsWithCounts(remA, remB);
    expect(findAnswerDisagreements(remCmp.diffs, { a: remA, b: remB })).toEqual([
      "sections[0].items[n=1].responses[0].answer",
    ]);

    const splitRemA = makeGridPage(10);
    splitRemA.sections[0].items[0] = {
      n: 1,
      printed: "9 / 2 = □ R □",
      form: "horizontal",
      expr: { kind: "arith", op: "div", operands: [9, 2] },
      responses: [
        { position: "box", cue: null, answer: "4", answer_source: "reader" },
        { position: "box", cue: "R", answer: "1", answer_source: "reader" },
      ],
    };
    const splitRemB = structuredClone(splitRemA);
    splitRemB.sections[0].items[0].responses[1].answer = "2";
    const splitRemCmp = compareRecordsWithCounts(splitRemA, splitRemB);
    expect(findAnswerDisagreements(splitRemCmp.diffs, { a: splitRemA, b: splitRemB })).toEqual([
      "sections[0].items[n=1].responses[1].answer",
    ]);

    // Nested sub-path inside an answer value (e.g. remainder part) and wording diff on an answer field
    expect(
      findAnswerDisagreements([
        { path: "sections[0].items[n=1].responses[0].answer.remainder", a: "1", b: "2", kind: "value" },
        { path: "sections[0].items[n=1].responses[0].answer[1]", a: "2", b: "3", kind: "value" },
        { path: "sections[0].items[n=2].responses[0].answer", a: "four", b: "4", kind: "wording" },
        { path: "sections[0].scaffolds[0].description", a: "Hint A", b: "Hint B", kind: "wording" },
        { path: "sections[0].items[n=3].responses[0]", a: null, b: null, kind: "empty_answer" },
      ]),
    ).toEqual([
      "sections[0].items[n=1].responses[0].answer.remainder",
      "sections[0].items[n=1].responses[0].answer[1]",
      "sections[0].items[n=2].responses[0].answer",
    ]);

    // 3. Scaffolds: non-answer scaffold diffs do not trigger, while printed answer on a worked_item does.
    const workedA = makeGridPage(10);
    workedA.sections[0].scaffolds = [
      { kind: "worked_item", applies_to: [1], description: "Item 1 printed solved" },
    ];
    workedA.sections[0].items[0].responses[0] = {
      position: "after_equals",
      cue: null,
      answer: "17",
      answer_source: "printed",
    };
    const workedDescB = structuredClone(workedA);
    workedDescB.sections[0].scaffolds = [
      { kind: "worked_item", applies_to: [1], description: "Item 2 printed solved" },
    ];
    const workedDescCmp = compareRecordsWithCounts(workedA, workedDescB);
    expect(findAnswerDisagreements(workedDescCmp.diffs, { a: workedA, b: workedDescB })).toEqual([]);
    const workedAnsB = structuredClone(workedA);
    workedAnsB.sections[0].items[0].responses[0].answer = "18";
    const workedAnsCmp = compareRecordsWithCounts(workedA, workedAnsB);
    expect(findAnswerDisagreements(workedAnsCmp.diffs, { a: workedA, b: workedAnsB })).toEqual([
      "sections[0].items[n=1].responses[0].answer",
    ]);

    // 4. Non-answer slots (checkbox, secondary work_area) do not trigger the answer stop;
    // a sole work_area on a question item still triggers it.
    const makeThreeItemPage = (): PageRecord =>
      makePage({
        sections: [
          {
            instruction: "Solve.",
            scaffolds: [],
            items: [1, 2, 3].map((n) => ({
              n,
              printed: `${n} + 1 =`,
              form: "horizontal" as const,
              expr:
                n === 1
                  ? ({ kind: "notation" as const, latex: "6^{2}+6" })
                  : ({ kind: "arith" as const, op: "add" as const, operands: [n, 1] }),
              responses: [
                {
                  position: "after_equals" as const,
                  cue: null,
                  answer: n === 1 ? "42" : String(n + 1),
                  answer_source: n === 1 ? ("reader" as const) : ("computed" as const),
                },
              ],
            })),
          },
        ],
      });

    for (const nonAnswerPos of ["checkbox", "work_area"] as const) {
      const a = makeThreeItemPage();
      a.sections[0].items[0].responses.push({
        position: nonAnswerPos,
        cue: null,
        answer: null,
        answer_source: "unchecked",
      });
      const b = structuredClone(a);
      b.sections[0].items[0].responses[1].answer = UNCLEAR;
      const cmp = compareRecordsWithCounts(a, b);
      expect(agreementPercentage(cmp.counts.agreed, cmp.counts.compared)).toBeGreaterThanOrEqual(97);
      expect(findAnswerDisagreements(cmp.diffs, { a, b })).toEqual([]);
      expect(
        decidePageOutcome({
          hasA: true,
          hasB: true,
          familyA: "codex",
          familyB: "claude",
          diffs: cmp.diffs,
          counts: cmp.counts,
          recordA: a,
          recordB: b,
        }),
      ).toEqual({ status: "agreement_accepted", stopReasons: [] });

      // One-sided extra non-answer response (even with unclear) also does not stop.
      const oneSidedA = makeThreeItemPage();
      const oneSidedCmp = compareRecordsWithCounts(oneSidedA, b);
      expect(findAnswerDisagreements(oneSidedCmp.diffs, { a: oneSidedA, b })).toEqual([]);
    }

    // Sole work_area on a question item IS answer-bearing and stops at >= 97%.
    const soleWorkA = makeThreeItemPage();
    soleWorkA.sections[0].items[0].responses = [
      { position: "work_area", cue: null, answer: "42", answer_source: "reader" },
    ];
    const soleWorkB = structuredClone(soleWorkA);
    soleWorkB.sections[0].items[0].responses[0].answer = "43";
    const soleWorkCmp = compareRecordsWithCounts(soleWorkA, soleWorkB);
    expect(agreementPercentage(soleWorkCmp.counts.agreed, soleWorkCmp.counts.compared)).toBeGreaterThanOrEqual(97);
    expect(findAnswerDisagreements(soleWorkCmp.diffs, { a: soleWorkA, b: soleWorkB })).toEqual([
      "sections[0].items[n=1].responses[0].answer",
    ]);
    expect(
      decidePageOutcome({
        hasA: true,
        hasB: true,
        familyA: "codex",
        familyB: "claude",
        diffs: soleWorkCmp.diffs,
        counts: soleWorkCmp.counts,
        recordA: soleWorkA,
        recordB: soleWorkB,
      }),
    ).toEqual({ status: "machine_read", stopReasons: [ANSWER_DISAGREEMENT_REASON] });
  });

  it("stops a page at any agreement percentage when readers disagree on any part of an expression across every Expr kind, place, and difference kind", () => {
    const makePlacePages = (
      place: "item" | "example_part",
      exprA: Expr | null,
      exprB: Expr | null,
    ): { a: PageRecord; b: PageRecord; prefix: string } => {
      const a = makeGridPage(12);
      if (place === "item") {
        a.sections[0].items[0] = {
          n: 1,
          printed: "2 + 3 =",
          form: "horizontal",
          expr: exprA,
          responses: [{ position: "after_equals", cue: null, answer: "5", answer_source: "reader" }],
        };
        const b = structuredClone(a);
        b.sections[0].items[0].expr = exprB;
        return { a, b, prefix: "sections[0].items[n=1].expr" };
      }
      a.examples = [
        {
          position: "top",
          relation: "compare",
          parts: [{ form: "horizontal", expr: exprA, shown_answer: "5" }],
        },
      ];
      const b = structuredClone(a);
      if (Array.isArray(b.examples)) {
        b.examples[0].parts[0].expr = exprB;
      }
      return { a, b, prefix: "examples[0].parts[0].expr" };
    };

    const decide = (a: PageRecord, b: PageRecord) => {
      const cmp = compareRecordsWithCounts(a, b);
      const outcome = decidePageOutcome({
        hasA: true,
        hasB: true,
        familyA: "codex",
        familyB: "claude",
        sameDigest: true,
        diffs: cmp.diffs,
        counts: cmp.counts,
        recordA: a,
        recordB: b,
      });
      return { cmp, outcome };
    };

    // Real bug reproduction: printed "2 + 3 =", reader A stores 1 x 5, reader B stores 2 + 3, both answers are 5 (>= 90% agreement).
    const repro = makePlacePages(
      "item",
      { kind: "arith", op: "mul", operands: [1, 5] },
      { kind: "arith", op: "add", operands: [2, 3] },
    );
    const reproRes = decide(repro.a, repro.b);
    expect(agreementPercentage(reproRes.cmp.counts.agreed, reproRes.cmp.counts.compared)).toBeGreaterThanOrEqual(90);
    expect(reproRes.cmp.counts.compared - reproRes.cmp.counts.agreed).toBe(3);
    expect(findExpressionDisagreements(reproRes.cmp.diffs)).toEqual([
      "sections[0].items[n=1].expr.op",
      "sections[0].items[n=1].expr.operands[0]",
      "sections[0].items[n=1].expr.operands[1]",
    ]);
    expect(reproRes.outcome).toEqual({
      status: "machine_read",
      stopReasons: [EXPRESSION_DISAGREEMENT_REASON],
    });

    // Both answer and expression disagreement on the same page shows both reasons (E3).
    const bothA = structuredClone(repro.a);
    const bothB = structuredClone(repro.b);
    bothB.sections[0].items[0].responses[0].answer = "6";
    const bothRes = decide(bothA, bothB);
    expect(bothRes.outcome.status).toBe("machine_read");
    expect(bothRes.outcome.stopReasons).toEqual([
      ANSWER_DISAGREEMENT_REASON,
      EXPRESSION_DISAGREEMENT_REASON,
    ]);

    // Table over every Expr kind in EXPR_KINDS x both places x every reachable difference kind.
    const exprCases: Array<{
      exprKind: ExprKind;
      label: string;
      a: Expr;
      b: Expr;
      expectedKind: "value" | "one_unclear" | "both_unclear" | "once_read";
      expectedSuffix: string;
    }> = [
      // arith
      {
        exprKind: "arith",
        label: "arith op value",
        a: { kind: "arith", op: "add", operands: [2, 3] },
        b: { kind: "arith", op: "mul", operands: [2, 3] },
        expectedKind: "value",
        expectedSuffix: ".op",
      },
      {
        exprKind: "arith",
        label: "arith operand value",
        a: { kind: "arith", op: "add", operands: [2, 3] },
        b: { kind: "arith", op: "add", operands: [2, 4] },
        expectedKind: "value",
        expectedSuffix: ".operands[1]",
      },
      {
        exprKind: "arith",
        label: "arith operand one_unclear",
        a: { kind: "arith", op: "add", operands: [2, 3] },
        b: { kind: "arith", op: "add", operands: [2, UNCLEAR] },
        expectedKind: "one_unclear",
        expectedSuffix: ".operands[1]",
      },
      {
        exprKind: "arith",
        label: "arith op both_unclear",
        a: { kind: "arith", op: UNCLEAR, operands: [2, 3] },
        b: { kind: "arith", op: UNCLEAR, operands: [2, 3] },
        expectedKind: "both_unclear",
        expectedSuffix: ".op",
      },
      // chain
      {
        exprKind: "chain",
        label: "chain term value",
        a: { kind: "chain", terms: [2, 4, null], step: 2 },
        b: { kind: "chain", terms: [2, 6, null], step: 2 },
        expectedKind: "value",
        expectedSuffix: ".terms[1]",
      },
      {
        exprKind: "chain",
        label: "chain step value",
        a: { kind: "chain", terms: [2, 4, null], step: 2 },
        b: { kind: "chain", terms: [2, 4, null], step: 3 },
        expectedKind: "value",
        expectedSuffix: ".step",
      },
      {
        exprKind: "chain",
        label: "chain term one_unclear",
        a: { kind: "chain", terms: [2, 4, null], step: 2 },
        b: { kind: "chain", terms: [2, UNCLEAR, null], step: 2 },
        expectedKind: "one_unclear",
        expectedSuffix: ".terms[1]",
      },
      {
        exprKind: "chain",
        label: "chain step both_unclear",
        a: { kind: "chain", terms: [2, 4, null], step: UNCLEAR },
        b: { kind: "chain", terms: [2, 4, null], step: UNCLEAR },
        expectedKind: "both_unclear",
        expectedSuffix: ".step",
      },
      // missing
      {
        exprKind: "missing",
        label: "missing result value",
        a: { kind: "missing", op: "add", operands: [3, null], result: 8 },
        b: { kind: "missing", op: "add", operands: [3, null], result: 9 },
        expectedKind: "value",
        expectedSuffix: ".result",
      },
      {
        exprKind: "missing",
        label: "missing operand one_unclear",
        a: { kind: "missing", op: "add", operands: [3, null], result: 8 },
        b: { kind: "missing", op: "add", operands: [UNCLEAR, null], result: 8 },
        expectedKind: "one_unclear",
        expectedSuffix: ".operands[0]",
      },
      {
        exprKind: "missing",
        label: "missing result both_unclear",
        a: { kind: "missing", op: "add", operands: [3, null], result: UNCLEAR },
        b: { kind: "missing", op: "add", operands: [3, null], result: UNCLEAR },
        expectedKind: "both_unclear",
        expectedSuffix: ".result",
      },
      // linked
      {
        exprKind: "linked",
        label: "linked pair[0] value",
        a: {
          kind: "linked",
          pair: [
            { kind: "arith", op: "add", operands: [2, 3] },
            { kind: "arith", op: "sub", operands: [5, 3] },
          ],
          connector: "then",
        },
        b: {
          kind: "linked",
          pair: [
            { kind: "arith", op: "add", operands: [2, 4] },
            { kind: "arith", op: "sub", operands: [5, 3] },
          ],
          connector: "then",
        },
        expectedKind: "value",
        expectedSuffix: ".pair[0].operands[1]",
      },
      {
        exprKind: "linked",
        label: "linked pair[1] one_unclear",
        a: {
          kind: "linked",
          pair: [
            { kind: "arith", op: "add", operands: [2, 3] },
            { kind: "arith", op: "sub", operands: [5, 3] },
          ],
          connector: "then",
        },
        b: {
          kind: "linked",
          pair: [
            { kind: "arith", op: "add", operands: [2, 3] },
            { kind: "arith", op: UNCLEAR, operands: [5, 3] },
          ],
          connector: "then",
        },
        expectedKind: "one_unclear",
        expectedSuffix: ".pair[1].op",
      },
      {
        exprKind: "linked",
        label: "linked pair[0] both_unclear",
        a: {
          kind: "linked",
          pair: [
            { kind: "arith", op: UNCLEAR, operands: [2, 3] },
            { kind: "arith", op: "sub", operands: [5, 3] },
          ],
        },
        b: {
          kind: "linked",
          pair: [
            { kind: "arith", op: UNCLEAR, operands: [2, 3] },
            { kind: "arith", op: "sub", operands: [5, 3] },
          ],
        },
        expectedKind: "both_unclear",
        expectedSuffix: ".pair[0].op",
      },
      {
        exprKind: "linked",
        label: "linked connector once_read",
        a: {
          kind: "linked",
          pair: [
            { kind: "arith", op: "add", operands: [2, 3] },
            { kind: "arith", op: "sub", operands: [5, 3] },
          ],
          connector: "and",
        },
        b: {
          kind: "linked",
          pair: [
            { kind: "arith", op: "add", operands: [2, 3] },
            { kind: "arith", op: "sub", operands: [5, 3] },
          ],
        },
        expectedKind: "once_read",
        expectedSuffix: ".connector",
      },
      {
        exprKind: "linked",
        label: "linked nested notation figure with different numbers",
        a: {
          kind: "linked",
          pair: [
            { kind: "notation", latex: "x + 1", figure: "Bar with 3 boxes" },
            { kind: "arith", op: "add", operands: [1, 2] },
          ],
        },
        b: {
          kind: "linked",
          pair: [
            { kind: "notation", latex: "x + 1", figure: "Bar with 4 boxes" },
            { kind: "arith", op: "add", operands: [1, 2] },
          ],
        },
        expectedKind: "value",
        expectedSuffix: ".pair[0].figure",
      },
      // word
      {
        exprKind: "word",
        label: "word text value",
        a: { kind: "word", text: "Add two apples", expr: { kind: "arith", op: "add", operands: [2, 3] }, unit: "apples" },
        b: { kind: "word", text: "Add two pears", expr: { kind: "arith", op: "add", operands: [2, 3] }, unit: "apples" },
        expectedKind: "value",
        expectedSuffix: ".text",
      },
      {
        exprKind: "word",
        label: "word nested expr value",
        a: { kind: "word", text: "Find the total", expr: { kind: "arith", op: "add", operands: [2, 3] } },
        b: { kind: "word", text: "Find the total", expr: { kind: "arith", op: "add", operands: [2, 4] } },
        expectedKind: "value",
        expectedSuffix: ".expr.operands[1]",
      },
      {
        exprKind: "word",
        label: "word expr one_unclear",
        a: { kind: "word", text: "Find the total", expr: { kind: "arith", op: "add", operands: [2, 3] } },
        b: { kind: "word", text: "Find the total", expr: UNCLEAR },
        expectedKind: "one_unclear",
        expectedSuffix: ".expr",
      },
      {
        exprKind: "word",
        label: "word expr both_unclear",
        a: { kind: "word", text: "Find the total", expr: UNCLEAR },
        b: { kind: "word", text: "Find the total", expr: UNCLEAR },
        expectedKind: "both_unclear",
        expectedSuffix: ".expr",
      },
      {
        exprKind: "word",
        label: "word unit once_read",
        a: { kind: "word", text: "Find the total", expr: null, unit: "cm" },
        b: { kind: "word", text: "Find the total", expr: null },
        expectedKind: "once_read",
        expectedSuffix: ".unit",
      },
      {
        exprKind: "word",
        label: "word nested notation figure with different numbers",
        a: { kind: "word", text: "Find x", expr: { kind: "notation", latex: "x + 1", figure: "Circle with 2 halves" } },
        b: { kind: "word", text: "Find x", expr: { kind: "notation", latex: "x + 1", figure: "Circle with 3 halves" } },
        expectedKind: "value",
        expectedSuffix: ".expr.figure",
      },
      // notation
      {
        exprKind: "notation",
        label: "notation latex value",
        a: { kind: "notation", latex: "\\frac{1}{2} + \\frac{1}{4}" },
        b: { kind: "notation", latex: "\\frac{1}{2} + \\frac{1}{3}" },
        expectedKind: "value",
        expectedSuffix: ".latex",
      },
      {
        exprKind: "notation",
        label: "notation latex one_unclear",
        a: { kind: "notation", latex: "x + 1" },
        b: { kind: "notation", latex: UNCLEAR },
        expectedKind: "one_unclear",
        expectedSuffix: ".latex",
      },
      {
        exprKind: "notation",
        label: "notation latex both_unclear",
        a: { kind: "notation", latex: UNCLEAR },
        b: { kind: "notation", latex: UNCLEAR },
        expectedKind: "both_unclear",
        expectedSuffix: ".latex",
      },
      {
        exprKind: "notation",
        label: "notation figure once_read",
        a: { kind: "notation", latex: "x + 1", figure: "Number line" },
        b: { kind: "notation", latex: "x + 1" },
        expectedKind: "once_read",
        expectedSuffix: ".figure",
      },
      {
        exprKind: "notation",
        label: "notation figure with different numbers",
        a: { kind: "notation", latex: "x + 1", figure: "Bar with 4 squares" },
        b: { kind: "notation", latex: "x + 1", figure: "Bar with 5 squares" },
        expectedKind: "value",
        expectedSuffix: ".figure",
      },
    ];

    // Guard: every ExprKind in types.ts is covered in the table.
    expect([...new Set(exprCases.map((c) => c.exprKind))].sort()).toEqual([...EXPR_KINDS].sort());

    for (const place of ["item", "example_part"] as const) {
      for (const c of exprCases) {
        const { a, b, prefix } = makePlacePages(place, c.a, c.b);
        const { cmp, outcome } = decide(a, b);
        const tag = `${place}:${c.label}`;
        expect(cmp.diffs, tag).toHaveLength(1);
        expect(cmp.diffs[0]?.kind, tag).toBe(c.expectedKind);
        expect(cmp.diffs[0]?.path, tag).toBe(`${prefix}${c.expectedSuffix}`);
        // One expression difference counts 1 disagreement; the stop rule never changes the counts.
        expect(cmp.counts.compared - cmp.counts.agreed, tag).toBe(1);
        expect(agreementPercentage(cmp.counts.agreed, cmp.counts.compared), tag).toBeGreaterThanOrEqual(95);
        expect(findExpressionDisagreements(cmp.diffs), tag).toEqual([`${prefix}${c.expectedSuffix}`]);
        expect(outcome, tag).toEqual({
          status: "machine_read",
          stopReasons: [EXPRESSION_DISAGREEMENT_REASON],
        });
      }

      // Kind mismatch and null vs Expr in both places
      const kindPair = makePlacePages(
        place,
        { kind: "arith", op: "add", operands: [2, 3] },
        { kind: "missing", op: "add", operands: [2, null], result: 5 },
      );
      const kindRes = decide(kindPair.a, kindPair.b);
      expect(findExpressionDisagreements(kindRes.cmp.diffs), `${place}:kind`).toEqual([`${kindPair.prefix}.kind`]);
      expect(kindRes.outcome, `${place}:kind`).toEqual({
        status: "machine_read",
        stopReasons: [EXPRESSION_DISAGREEMENT_REASON],
      });

      const nullPair = makePlacePages(place, { kind: "arith", op: "add", operands: [2, 3] }, null);
      const nullRes = decide(nullPair.a, nullPair.b);
      expect(findExpressionDisagreements(nullRes.cmp.diffs), `${place}:null`).toEqual([nullPair.prefix]);
      expect(nullRes.outcome, `${place}:null`).toEqual({
        status: "machine_read",
        stopReasons: [EXPRESSION_DISAGREEMENT_REASON],
      });

      // Direct order difference on an expression path also stops (E1).
      const orderPath = `${kindPair.prefix}.operands`;
      expect(
        findExpressionDisagreements([{ path: orderPath, a: [2, 3], b: [3, 2], kind: "order" }]),
        `${place}:order`,
      ).toEqual([orderPath]);
      expect(
        decidePageOutcome({
          hasA: true,
          hasB: true,
          familyA: "codex",
          familyB: "claude",
          sameDigest: true,
          diffs: [{ path: orderPath, a: [2, 3], b: [3, 2], kind: "order" }],
          counts: { agreed: 19, compared: 20 },
        }),
        `${place}:order`,
      ).toEqual({ status: "machine_read", stopReasons: [EXPRESSION_DISAGREEMENT_REASON] });
    }

    // Must-pass controls: equal expressions after compare's normalisations stay double_read.
    const normCases: Array<{ label: string; a: Expr; b: Expr }> = [
      {
        label: "notation latex spacing and operator normalisation",
        a: { kind: "notation", latex: "2 × 3" },
        b: { kind: "notation", latex: "2  \\times  3" },
      },
      {
        label: "notation figure prose normalisation",
        a: { kind: "notation", latex: "x = 1", figure: "Shaded bar." },
        b: { kind: "notation", latex: "x = 1", figure: "shaded   bar" },
      },
      {
        label: "word text and unit prose normalisation",
        a: { kind: "word", text: "Find the total.", expr: { kind: "arith", op: "add", operands: [2, 3] }, unit: "Apples." },
        b: { kind: "word", text: "find  the total", expr: { kind: "arith", op: "add", operands: [2, 3] }, unit: "apples" },
      },
      {
        label: "linked connector prose normalisation",
        a: {
          kind: "linked",
          pair: [
            { kind: "arith", op: "add", operands: [2, 3] },
            { kind: "arith", op: "sub", operands: [5, 3] },
          ],
          connector: "Then.",
        },
        b: {
          kind: "linked",
          pair: [
            { kind: "arith", op: "add", operands: [2, 3] },
            { kind: "arith", op: "sub", operands: [5, 3] },
          ],
          connector: "then",
        },
      },
    ];
    for (const nc of normCases) {
      for (const place of ["item", "example_part"] as const) {
        const { a, b } = makePlacePages(place, nc.a, nc.b);
        const res = decide(a, b);
        expect(res.cmp.diffs, `${place}:${nc.label}`).toEqual([]);
        expect(findExpressionDisagreements(res.cmp.diffs), `${place}:${nc.label}`).toEqual([]);
        expect(res.outcome, `${place}:${nc.label}`).toEqual({ status: "double_read", stopReasons: [] });
      }
    }

    // Must-pass controls: wording on expr.figure (same figure, same numbers and math symbols) never stops a page.
    const wordingCases: Array<{ label: string; a: Expr; b: Expr; suffix: string }> = [
      {
        label: "notation figure wording",
        a: { kind: "notation", latex: "x + 1", figure: "Bar with 4 squares" },
        b: { kind: "notation", latex: "x + 1", figure: "Strip of 4 boxes" },
        suffix: ".figure",
      },
      {
        label: "word nested notation figure wording",
        a: { kind: "word", text: "Find x", expr: { kind: "notation", latex: "x + 1", figure: "Circle with 2 halves" } },
        b: { kind: "word", text: "Find x", expr: { kind: "notation", latex: "x + 1", figure: "Round shape in 2 parts" } },
        suffix: ".expr.figure",
      },
      {
        label: "linked nested notation figure wording",
        a: {
          kind: "linked",
          pair: [
            { kind: "notation", latex: "x + 1", figure: "Bar with 3 boxes" },
            { kind: "arith", op: "add", operands: [1, 2] },
          ],
        },
        b: {
          kind: "linked",
          pair: [
            { kind: "notation", latex: "x + 1", figure: "Strip showing 3 boxes" },
            { kind: "arith", op: "add", operands: [1, 2] },
          ],
        },
        suffix: ".pair[0].figure",
      },
    ];
    for (const wc of wordingCases) {
      for (const place of ["item", "example_part"] as const) {
        const tag = `${place}:${wc.label}`;
        const { a, b, prefix } = makePlacePages(place, wc.a, wc.b);
        const only = decide(a, b);
        expect(only.cmp.diffs.map((d) => [d.path, d.kind]), tag).toEqual([[`${prefix}${wc.suffix}`, "wording"]]);
        expect(only.cmp.counts.agreed, tag).toBe(only.cmp.counts.compared);
        expect(findExpressionDisagreements(only.cmp.diffs), tag).toEqual([]);
        expect(only.outcome, tag).toEqual({ status: "double_read", stopReasons: [] });

        // At 99% (one more difference, outside expr) the page stays agreement_accepted.
        b.topic.title = "Other title";
        const at99 = decide(a, b);
        expect(at99.cmp.diffs.map((d) => d.kind).sort(), tag).toEqual(["value", "wording"]);
        expect(agreementPercentage(at99.cmp.counts.agreed, at99.cmp.counts.compared), tag).toBeGreaterThanOrEqual(99);
        expect(findExpressionDisagreements(at99.cmp.diffs), tag).toEqual([]);
        expect(at99.outcome, tag).toEqual({ status: "agreement_accepted", stopReasons: [] });
      }
    }

    // Must-pass controls: differences and wording outside expr, plus paths containing "expr" elsewhere.
    const outsideBase = makeGridPage(12);
    outsideBase.examples = [
      {
        position: "top",
        relation: "compare",
        parts: [{ form: "horizontal", caption: "Part A", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: "5" }],
        steps: [{ n: 1, shows: "setup", printed: "2 + 3" }],
        marks: [{ kind: "box", step: 1, description: "Box around 2" }],
      },
    ];
    const outsideDiff = structuredClone(outsideBase);
    outsideDiff.topic.title = "expr heading";
    outsideDiff.sections[0].items[0].printed = "2 + 3 = ?";
    if (Array.isArray(outsideDiff.examples)) {
      outsideDiff.examples[0].parts[0].caption = null;
      if (Array.isArray(outsideDiff.examples[0].marks)) {
        outsideDiff.examples[0].marks[0].description = "Frame around 2";
      }
    }
    const outsideRes = decide(outsideBase, outsideDiff);
    expect(findExpressionDisagreements(outsideRes.cmp.diffs)).toEqual([]);
    expect(outsideRes.outcome).toEqual({ status: "agreement_accepted", stopReasons: [] });

    // Wording outside expr only -> double_read.
    const nonExprWordingB = structuredClone(outsideBase);
    if (Array.isArray(nonExprWordingB.examples) && Array.isArray(nonExprWordingB.examples[0].marks)) {
      nonExprWordingB.examples[0].marks[0].description = "Frame around 2";
    }
    const nonExprWordingRes = decide(outsideBase, nonExprWordingB);
    expect(findExpressionDisagreements(nonExprWordingRes.cmp.diffs)).toEqual([]);
    expect(nonExprWordingRes.outcome).toEqual({ status: "double_read", stopReasons: [] });

    // Paths that merely contain the substring "expr" elsewhere never match.
    const decoyPaths = [
      "expr",
      "topic.expr",
      "sections[0].items[n=1].expr_note",
      "sections[0].scaffolds[0].expr",
      "examples[0].expr",
      "examples[0].parts[0].expression",
      "examples[0].steps[n=1].expr",
      "topics[n=1].expr",
    ];
    expect(
      findExpressionDisagreements(
        decoyPaths.map((path) => ({ path, a: "expr A", b: "expr B", kind: "value" as const })),
      ),
    ).toEqual([]);
  });

  it("stops on any one-reader-only or unmatched container holding an expression (even with no answer) and passes entries with no expression", () => {
    const exprItemNoAns = {
      n: 99,
      printed: "2 + 3",
      form: "horizontal" as const,
      expr: { kind: "arith" as const, op: "add" as const, operands: [2, 3] },
      responses: [{ position: "work_area" as const, cue: null, answer: null, answer_source: "unchecked" as const }],
    };
    const nullExprItem = {
      n: 99,
      printed: "Read aloud",
      form: null,
      expr: null,
      responses: [{ position: "checkbox" as const, cue: null, answer: null, answer_source: "unchecked" as const }],
    };
    const exprPartNoAns = {
      form: "horizontal" as const,
      expr: { kind: "arith" as const, op: "add" as const, operands: [1, 2] },
    };
    const nullExprPart = {
      form: "horizontal" as const,
      expr: null,
    };
    const exprExampleNoAns = {
      position: "top" as const,
      relation: "compare" as const,
      parts: [exprPartNoAns],
      steps: [{ n: 1, shows: "setup" as const, printed: "1 + 2" }],
      marks: [],
    };
    const nullExprExample = {
      position: "top" as const,
      relation: "compare" as const,
      parts: [nullExprPart],
      steps: [{ n: 1, shows: "setup" as const, printed: "Read" }],
      marks: [],
    };
    const exprSection = { instruction: "Extra.", scaffolds: [], items: [exprItemNoAns] };
    const nullExprSection = { instruction: "Extra.", scaffolds: [], items: [nullExprItem] };

    // Real compareRecordsWithCounts cases at >= 90% agreement (and with NO answer in the one-sided entry)
    const realContainerCases: Array<{
      label: string;
      mutateB: (b: PageRecord) => void;
      expectedExprPaths: string[];
      expectedStatus: "machine_read" | "agreement_accepted";
    }> = [
      {
        label: "one-sided section with expr (no answer)",
        mutateB: (b) => {
          b.sections.push(exprSection);
        },
        expectedExprPaths: ["sections[b:1]"],
        expectedStatus: "machine_read",
      },
      {
        label: "one-sided section with only expr: null",
        mutateB: (b) => {
          b.sections.push(nullExprSection);
        },
        expectedExprPaths: [],
        expectedStatus: "agreement_accepted",
      },
      {
        label: "one-sided item with expr (no answer)",
        mutateB: (b) => {
          b.sections[0].items.push(exprItemNoAns);
        },
        expectedExprPaths: ["sections[0].items[n=99]"],
        expectedStatus: "machine_read",
      },
      {
        label: "one-sided item with expr: null",
        mutateB: (b) => {
          b.sections[0].items.push(nullExprItem);
        },
        expectedExprPaths: [],
        expectedStatus: "agreement_accepted",
      },
      {
        label: "one-sided example with expr (no answer)",
        mutateB: (b) => {
          b.examples = [exprExampleNoAns];
        },
        expectedExprPaths: ["examples[b:0]"],
        expectedStatus: "machine_read",
      },
      {
        label: "one-sided example with expr: null",
        mutateB: (b) => {
          b.examples = [nullExprExample];
        },
        expectedExprPaths: [],
        expectedStatus: "agreement_accepted",
      },
      {
        label: "one-sided example part with expr (no answer)",
        mutateB: (b) => {
          if (Array.isArray(b.examples)) {
            b.examples[0].parts.push(exprPartNoAns);
          }
        },
        expectedExprPaths: ["examples[0].parts[b:1]"],
        expectedStatus: "machine_read",
      },
      {
        label: "one-sided example part with expr: null",
        mutateB: (b) => {
          if (Array.isArray(b.examples)) {
            b.examples[0].parts.push(nullExprPart);
          }
        },
        expectedExprPaths: [],
        expectedStatus: "agreement_accepted",
      },
      {
        label: "examples list with expr vs unclear sentinel",
        mutateB: (b) => {
          b.examples = UNCLEAR;
        },
        expectedExprPaths: ["examples"],
        expectedStatus: "machine_read",
      },
      {
        label: "item order diff on sections[0].items is not an expression disagreement",
        mutateB: (b) => {
          const [first, second, ...rest] = b.sections[0].items;
          b.sections[0].items = [second, first, ...rest];
        },
        expectedExprPaths: [],
        expectedStatus: "agreement_accepted",
      },
    ];

    for (const c of realContainerCases) {
      const a = makeGridPage(12);
      if (c.label.includes("example part") || c.label.includes("examples list")) {
        a.examples = [structuredClone(exprExampleNoAns)];
      }
      const b = structuredClone(a);
      c.mutateB(b);
      const cmp = compareRecordsWithCounts(a, b);
      expect(agreementPercentage(cmp.counts.agreed, cmp.counts.compared), c.label).toBeGreaterThanOrEqual(90);
      expect(findAnswerDisagreements(cmp.diffs, { a, b }), `${c.label}: no answer diff`).toEqual([]);
      expect(findExpressionDisagreements(cmp.diffs), c.label).toEqual(c.expectedExprPaths);
      const outcome = decidePageOutcome({
        hasA: true,
        hasB: true,
        familyA: "codex",
        familyB: "claude",
        sameDigest: true,
        diffs: cmp.diffs,
        counts: cmp.counts,
        recordA: a,
        recordB: b,
      });
      expect(outcome.status, c.label).toBe(c.expectedStatus);
      if (c.expectedStatus === "machine_read") {
        expect(outcome.stopReasons, c.label).toEqual([EXPRESSION_DISAGREEMENT_REASON]);
      } else {
        expect(outcome.stopReasons, c.label).toEqual([]);
      }
    }

    // Containing lists (sections, sections[i].items, examples, examples[i].parts) with and without expr.
    const listContainerCases: Array<{
      label: string;
      path: string;
      withExpr: unknown;
      withoutExpr: unknown;
    }> = [
      { label: "sections list", path: "sections", withExpr: [exprSection], withoutExpr: [nullExprSection] },
      { label: "items list", path: "sections[0].items", withExpr: [exprItemNoAns], withoutExpr: [nullExprItem] },
      { label: "examples list", path: "examples", withExpr: [exprExampleNoAns], withoutExpr: [nullExprExample] },
      { label: "example parts list", path: "examples[0].parts", withExpr: [exprPartNoAns], withoutExpr: [nullExprPart] },
    ];
    for (const lc of listContainerCases) {
      expect(
        findExpressionDisagreements([{ path: lc.path, a: lc.withExpr, b: null, kind: "value" }]),
        `${lc.label}: with expr`,
      ).toEqual([lc.path]);
      expect(
        findExpressionDisagreements([{ path: lc.path, a: null, b: lc.withExpr, kind: "once_read" }]),
        `${lc.label}: b-only with expr`,
      ).toEqual([lc.path]);
      expect(
        findExpressionDisagreements([{ path: lc.path, a: lc.withoutExpr, b: null, kind: "value" }]),
        `${lc.label}: without expr`,
      ).toEqual([]);
    }
  });

  it("gives missing items and contents topics their insertion location in the final record", () => {
    const makeItemsPage = (ns: number[]): PageRecord =>
      makePage({
        sections: [
          {
            instruction: "Add.",
            scaffolds: [],
            items: ns.map((n) => ({
              n,
              printed: `${n} + 1 =`,
              form: "horizontal" as const,
              expr: { kind: "arith" as const, op: "add" as const, operands: [n, 1] },
              responses: [
                { position: "after_equals" as const, cue: null, answer: String(n + 1), answer_source: "computed" as const },
              ],
            })),
          },
        ],
      });

    // Reader-B-only numbered items: no final_path, no insert_before; exact neighbours in reader B's list.
    const itemStart = classifyComparison(makeItemsPage([2, 3]), makeItemsPage([1, 2, 3]));
    expect(itemStart.differences).toHaveLength(1);
    expect(itemStart.differences[0]).toMatchObject({
      path: "sections[0].items[n=1]",
      reader: "b",
      reader_b_after: null,
      reader_b_before: 2,
    });
    expect(itemStart.differences[0].final_path).toBeUndefined();
    expect(itemStart.differences[0].insert_before).toBeUndefined();

    const itemMid = classifyComparison(makeItemsPage([1, 3]), makeItemsPage([1, 2, 3]));
    expect(itemMid.differences[0]).toMatchObject({
      path: "sections[0].items[n=2]",
      reader: "b",
      reader_b_after: 1,
      reader_b_before: 3,
    });
    expect(itemMid.differences[0].final_path).toBeUndefined();
    expect(itemMid.differences[0].insert_before).toBeUndefined();

    const itemEnd = classifyComparison(makeItemsPage([1, 2]), makeItemsPage([1, 2, 3]));
    expect(itemEnd.differences[0]).toMatchObject({
      path: "sections[0].items[n=3]",
      reader: "b",
      reader_b_after: 2,
      reader_b_before: null,
    });
    expect(itemEnd.differences[0].final_path).toBeUndefined();
    expect(itemEnd.differences[0].insert_before).toBeUndefined();

    // Only item in reader B's list
    const itemOnly = classifyComparison(makeItemsPage([2, 3]), makeItemsPage([1]));
    const onlyDiff = itemOnly.differences.find((d) => d.path === "sections[0].items[n=1]");
    expect(onlyDiff).toMatchObject({
      path: "sections[0].items[n=1]",
      reader: "b",
      reader_b_after: null,
      reader_b_before: null,
    });
    expect(onlyDiff?.final_path).toBeUndefined();
    expect(onlyDiff?.insert_before).toBeUndefined();

    // Present only in reader A: keeps exact final_path resolving to reader A's entry
    const aOnlyPage = makeItemsPage([1, 2, 3]);
    const itemAOnly = classifyComparison(aOnlyPage, makeItemsPage([2, 3]));
    expect(itemAOnly.differences[0]).toMatchObject({
      path: "sections[0].items[n=1]",
      reader: "a",
      final_path: "sections[0].items[0]",
    });
    expect(resolveDiffPath(aOnlyPage, itemAOnly.differences[0].final_path!).value).toEqual(
      itemAOnly.differences[0].a,
    );

    const makeContents = (ns: number[]): ContentsRecord => ({
      kind: "contents",
      source_ref: "sample:M:contents",
      topics: ns.map((n) => ({ n, title: `Topic ${n}`, sheets: [n, n], std_time_min: [1, 2] })),
    });

    const topicStart = classifyComparison(makeContents([2, 3, 4]), makeContents([1, 2, 3, 4]));
    expect(topicStart.differences[0]).toMatchObject({
      path: "topics[n=1]",
      reader: "b",
      reader_b_after: null,
      reader_b_before: 2,
    });
    expect(topicStart.differences[0].final_path).toBeUndefined();
    expect(topicStart.differences[0].insert_before).toBeUndefined();

    const topicMid = classifyComparison(makeContents([1, 2, 4]), makeContents([1, 2, 3, 4]));
    expect(topicMid.differences[0]).toMatchObject({
      path: "topics[n=3]",
      reader: "b",
      reader_b_after: 2,
      reader_b_before: 4,
    });
    expect(topicMid.differences[0].final_path).toBeUndefined();

    const topicEnd = classifyComparison(makeContents([1, 2, 3]), makeContents([1, 2, 3, 4]));
    expect(topicEnd.differences[0]).toMatchObject({
      path: "topics[n=4]",
      reader: "b",
      reader_b_after: 3,
      reader_b_before: null,
    });
    expect(topicEnd.differences[0].final_path).toBeUndefined();

    const contentsAOnly = makeContents([1, 2, 3]);
    const topicAOnly = classifyComparison(contentsAOnly, makeContents([2, 3]));
    expect(topicAOnly.differences[0]).toMatchObject({
      path: "topics[n=1]",
      reader: "a",
      final_path: "topics[0]",
    });
    expect(resolveDiffPath(contentsAOnly, topicAOnly.differences[0].final_path!).value).toEqual(
      topicAOnly.differences[0].a,
    );

    // Non-ascending reader B list and item numbers above 16 report reader B's actual printed neighbours
    const descendingItems = classifyComparison(makeItemsPage([3, 1]), makeItemsPage([3, 2, 1]));
    const descDiff = descendingItems.differences.find((d) => d.path === "sections[0].items[n=2]");
    expect(descDiff).toMatchObject({
      path: "sections[0].items[n=2]",
      reader: "b",
      reader_b_after: 3,
      reader_b_before: 1,
    });
    expect(descDiff?.final_path).toBeUndefined();
    expect(descDiff?.insert_before).toBeUndefined();

    const highItems = classifyComparison(makeItemsPage([15, 22]), makeItemsPage([15, 19, 22, 30]));
    expect(highItems.differences.find((d) => d.path === "sections[0].items[n=19]")).toMatchObject({
      reader: "b",
      reader_b_after: 15,
      reader_b_before: 22,
    });
    expect(highItems.differences.find((d) => d.path === "sections[0].items[n=30]")).toMatchObject({
      reader: "b",
      reader_b_after: 22,
      reader_b_before: null,
    });

    // Independent parent-object existence check for "[]" append paths (not using the kit's resolver).
    // The list property itself may be absent (the person creates it), but its parent object must exist.
    const parentObjectExistsForAppend = (record: unknown, appendPath: string): boolean => {
      if (!appendPath.endsWith("[]")) return false;
      const listPath = appendPath.slice(0, -2);
      const tokenRe = /([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]/g;
      const tokens: Array<{ kind: "prop"; name: string } | { kind: "index"; idx: number }> = [];
      let matchedLen = 0;
      for (const m of listPath.matchAll(tokenRe)) {
        matchedLen += m[0].length + (m[1] !== undefined && tokens.length > 0 ? 1 : 0);
        if (m[1] !== undefined) tokens.push({ kind: "prop", name: m[1] });
        else if (m[2] !== undefined) tokens.push({ kind: "index", idx: Number(m[2]) });
      }
      if (matchedLen !== listPath.length || tokens.length === 0) return false;
      const last = tokens[tokens.length - 1];
      if (last.kind !== "prop") return false;
      let node: unknown = record;
      for (let i = 0; i < tokens.length - 1; i += 1) {
        const tok = tokens[i];
        if (tok.kind === "prop") {
          if (typeof node !== "object" || node === null || Array.isArray(node)) return false;
          if (!Object.hasOwn(node, tok.name)) return false;
          node = (node as Record<string, unknown>)[tok.name];
        } else {
          if (!Array.isArray(node) || tok.idx < 0 || tok.idx >= node.length) return false;
          node = node[tok.idx];
        }
      }
      if (typeof node !== "object" || node === null || Array.isArray(node)) return false;
      const listVal = (node as Record<string, unknown>)[last.name];
      return listVal === undefined || Array.isArray(listVal);
    };

    // Absent optional lists (steps/marks omitted on reader A's example): parent object examples[0] exists.
    const absentListA = makeItemsPage([1]);
    absentListA.examples = [{ position: "top", relation: "sequence", parts: [{ form: "horizontal", expr: null }] }];
    const absentListB = makeItemsPage([1]);
    absentListB.examples = [
      {
        position: "top",
        relation: "sequence",
        parts: [{ form: "horizontal", expr: null }],
        steps: [{ n: 1, shows: "answer", printed: "5" }],
        marks: [{ kind: "box", step: 1, description: "Box" }],
      },
    ];
    const absentSummary = classifyComparison(absentListA, absentListB);
    expect(absentSummary.once_read.map((d) => d.final_path)).toEqual([
      "examples[0].steps[]",
      "examples[0].marks[]",
    ]);
    for (const d of absentSummary.once_read) {
      expect(parentObjectExistsForAppend(absentListA, d.final_path!)).toBe(true);
    }

    // Property over random items (including numbers above 16), once-read scaffolds, steps, and marks:
    // - reader-B-only numbered items give exact neighbours and no final_path or insert_before;
    // - step alignment insertion positions and scaffold/mark append paths match independent
    //   expectations computed directly from the generated lists (not from the kit's resolver);
    // - every "[]" path has an existing parent object in recA; every non-"[]" final_path resolves.
    const scaffoldPool: Scaffold[] = [
      { kind: "caption", applies_to: "all", text: "Hint A" },
      { kind: "arrow", applies_to: [1], from: "left", to: "right", label: "next" },
      { kind: "helper_digit", applies_to: [2], description: "Small 1 above tens" },
      { kind: "partial_working", applies_to: "all", description: "First step shown" },
    ];
    const stepPool: Array<{ shows: ExampleStep["shows"]; printed: string }> = [
      { shows: "setup", printed: "2 + 3" },
      { shows: "partial_sum", printed: "2 + 2 + 1" },
      { shows: "carry", printed: "10" },
      { shows: "answer", printed: "5" },
      { shows: "check", printed: "5 - 3 = 2" },
    ];
    const markKindArb = fc.constantFrom<ExampleMark["kind"]>("box", "circle", "underline", "bracket");

    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 60 }), { minLength: 1, maxLength: 10 }),
        fc.uniqueArray(fc.integer({ min: 1, max: 60 }), { minLength: 1, maxLength: 10 }),
        fc.subarray([0, 1, 2, 3]),
        fc.subarray([0, 1, 2, 3]),
        fc.subarray([0, 1, 2, 3, 4], { minLength: 1 }),
        fc.subarray([0, 1, 2, 3, 4], { minLength: 1 }),
        fc.array(fc.record({ kind: markKindArb, stepSlot: fc.integer({ min: 0, max: 4 }) }), { maxLength: 3 }),
        fc.array(fc.record({ kind: markKindArb, stepSlot: fc.integer({ min: 0, max: 4 }) }), { maxLength: 3 }),
        (aNs, bNs, aScIdx, bScIdx, aStepIdx, bStepIdx, aRawMarks, bRawMarks) => {
          const buildSteps = (idxs: number[]): ExampleStep[] =>
            idxs.map((poolIdx, pos) => ({ n: pos + 1, ...stepPool[poolIdx] }));
          const buildMarks = (
            raw: Array<{ kind: ExampleMark["kind"]; stepSlot: number }>,
            stepCount: number,
          ): ExampleMark[] =>
            raw.map((m, idx) => ({
              kind: m.kind,
              step: (m.stepSlot % stepCount) + 1,
              description: `Mark ${idx + 1}`,
            }));
          const aSteps = buildSteps(aStepIdx);
          const bSteps = buildSteps(bStepIdx);
          const recA = makeItemsPage(aNs);
          const recB = makeItemsPage(bNs);
          recA.sections[0].scaffolds = aScIdx.map((i) => structuredClone(scaffoldPool[i]));
          recB.sections[0].scaffolds = bScIdx.map((i) => structuredClone(scaffoldPool[i]));
          recA.examples = [
            {
              position: "top",
              relation: "sequence",
              parts: [{ form: "horizontal", expr: null }],
              steps: aSteps,
              marks: buildMarks(aRawMarks, aSteps.length),
            },
          ];
          recB.examples = [
            {
              position: "top",
              relation: "sequence",
              parts: [{ form: "horizontal", expr: null }],
              steps: bSteps,
              marks: buildMarks(bRawMarks, bSteps.length),
            },
          ];
          const summary = classifyComparison(recA, recB);
          const aSet = new Set(aNs);
          const bIndexByN = new Map(bNs.map((n, idx) => [n, idx]));
          for (const d of summary.differences) {
            const m = /^sections\[0\]\.items\[n=(\d+)\]$/.exec(d.path);
            if (!m) continue;
            const n = Number(m[1]);
            if (!aSet.has(n)) {
              const idx = bIndexByN.get(n)!;
              expect(d.reader).toBe("b");
              expect(d.final_path).toBeUndefined();
              expect(d.insert_before).toBeUndefined();
              expect(d.reader_b_after).toBe(idx > 0 ? bNs[idx - 1] : null);
              expect(d.reader_b_before).toBe(idx + 1 < bNs.length ? bNs[idx + 1] : null);
            } else {
              expect(d.reader).toBe("a");
              expect(d.final_path).toBeDefined();
              expect(d.insert_before).toBeUndefined();
              expect(resolveDiffPath(recA, d.final_path!).value).toEqual(d.a);
            }
          }

          // Independent expected step insertion positions from the strictly ascending unique pool indices:
          // anchors are the exact set intersection in order; gaps pair positionally; extra B steps
          // insert before the next anchor in A, or append with "[]" after the last anchor.
          const anchors: Array<[number, number]> = [];
          for (let ai = 0; ai < aStepIdx.length; ai += 1) {
            const bi = bStepIdx.indexOf(aStepIdx[ai]);
            if (bi !== -1) anchors.push([ai, bi]);
          }
          const expectedBOnlySteps = new Map<
            number,
            { insert_before: number | undefined; final_path: string }
          >();
          let prevA = 0;
          let prevB = 0;
          for (const [nextA, nextB] of [...anchors, [aStepIdx.length, bStepIdx.length] as [number, number]]) {
            const paired = Math.min(nextA - prevA, nextB - prevB);
            for (let k = paired; k < nextB - prevB; k += 1) {
              const bIdx = prevB + k;
              const beforeA = nextA < aStepIdx.length ? nextA : undefined;
              expectedBOnlySteps.set(bIdx, {
                insert_before: beforeA,
                final_path:
                  beforeA !== undefined ? `examples[0].steps[${beforeA}]` : "examples[0].steps[]",
              });
            }
            prevA = nextA + 1;
            prevB = nextB + 1;
          }
          const actualBOnlySteps = summary.once_read.filter((d) =>
            /^examples\[0\]\.steps\[b:\d+\]$/.test(d.path),
          );
          expect(actualBOnlySteps).toHaveLength(expectedBOnlySteps.size);
          for (const d of actualBOnlySteps) {
            const bIdx = Number(/^examples\[0\]\.steps\[b:(\d+)\]$/.exec(d.path)![1]);
            const exp = expectedBOnlySteps.get(bIdx);
            expect(exp).toBeDefined();
            expect(d.reader).toBe("b");
            expect(d.insert_before).toBe(exp!.insert_before);
            expect(d.final_path).toBe(exp!.final_path);
          }

          // Independent expected scaffold appends: each scaffold in scaffoldPool has a unique kind,
          // so B-only scaffolds are exactly those whose pool index is absent from aScIdx.
          const aScSet = new Set(aScIdx);
          const expectedBOnlyScaffolds = bScIdx
            .map((poolIdx, bIdx) => (aScSet.has(poolIdx) ? null : bIdx))
            .filter((bIdx): bIdx is number => bIdx !== null);
          const actualBOnlyScaffolds = summary.once_read.filter((d) =>
            /^sections\[0\]\.scaffolds\[b:\d+\]$/.test(d.path),
          );
          expect(actualBOnlyScaffolds.map((d) => d.path)).toEqual(
            expectedBOnlyScaffolds.map((bIdx) => `sections[0].scaffolds[b:${bIdx}]`),
          );
          for (const d of actualBOnlyScaffolds) {
            expect(d.reader).toBe("b");
            expect(d.insert_before).toBeUndefined();
            expect(d.final_path).toBe("sections[0].scaffolds[]");
          }

          const allLists = [
            ...summary.differences,
            ...summary.once_read,
            ...summary.wording,
            ...summary.both_unclear,
            ...summary.one_unclear,
            ...summary.empty_answer,
          ];
          for (const d of allLists) {
            if (d.final_path === undefined) continue;
            if (d.insert_before !== undefined) {
              expect(recordPathResolves(recA, d.final_path)).toBe(true);
              expect(d.final_path.endsWith(`[${d.insert_before}]`)).toBe(true);
            } else if (d.final_path.endsWith("[]")) {
              expect(parentObjectExistsForAppend(recA, d.final_path), d.final_path).toBe(true);
            } else {
              expect(recordPathResolves(recA, d.final_path)).toBe(true);
              if (d.reader === "a") {
                expect(resolveDiffPath(recA, d.final_path).value).toEqual(d.a);
              }
            }
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it("stops a page at any agreement percentage when readers disagree on page identity (source_ref or kind)", () => {
    const makeSizedPage = (sourceRef: string, itemCount: number): PageRecord =>
      makePage({
        source_ref: sourceRef,
        sections: [
          {
            instruction: "Add.",
            scaffolds: [],
            items: Array.from({ length: itemCount }, (_, i) => ({
              n: i + 1,
              printed: `${i + 1} + 1 =`,
              form: "horizontal" as const,
              expr: { kind: "arith" as const, op: "add" as const, operands: [i + 1, 1] },
              responses: [
                { position: "after_equals" as const, cue: null, answer: String(i + 2), answer_source: "computed" as const },
              ],
            })),
          },
        ],
      });

    const decide = (a: ReferenceRecord, b: ReferenceRecord) => {
      const cmp = compareRecordsWithCounts(a, b);
      const outcome = decidePageOutcome({
        hasA: true,
        hasB: true,
        familyA: "codex",
        familyB: "claude",
        diffs: cmp.diffs,
        counts: cmp.counts,
        sameDigest: true,
        recordA: a,
        recordB: b,
      });
      return { cmp, outcome };
    };

    // Equal ids with a non-identity diff at >= 90% passes
    const sameA = makeSizedPage("sample:M:7a", 3);
    const sameB = makeSizedPage("sample:M:7a", 3);
    sameB.topic.title = "Different heading";
    const sameRes = decide(sameA, sameB);
    expect(agreementPercentage(sameRes.cmp.counts.agreed, sameRes.cmp.counts.compared)).toBeGreaterThanOrEqual(95);
    expect(sameRes.outcome).toEqual({ status: "agreement_accepted", stopReasons: [] });

    // Nested `.kind` diff (not top-level page kind) does not trigger page identity stop
    const nestedA = makeSizedPage("sample:M:7a", 3);
    const nestedB = makeSizedPage("sample:M:7a", 3);
    nestedA.sections[0].scaffolds = [{ kind: "arrow", applies_to: "all", from: "top", to: "bottom" }];
    nestedB.sections[0].scaffolds = [{ kind: "caption", applies_to: "all", text: "Hint" }];
    const nestedRes = decide(nestedA, nestedB);
    expect(nestedRes.outcome.stopReasons).not.toContain("readers disagree on the page");

    // Table of page identity differences: side (95% and 99%), level, sheet, source, kind
    const identityCases: Array<{
      label: string;
      a: ReferenceRecord;
      b: ReferenceRecord;
      minPct?: number;
    }> = [
      {
        label: "7a vs 7b at >= 95%",
        a: makeSizedPage("sample:M:7a", 3),
        b: makeSizedPage("sample:M:7b", 3),
        minPct: 95,
      },
      {
        label: "7a vs 7b at >= 99%",
        a: makeSizedPage("sample:M:7a", 15),
        b: makeSizedPage("sample:M:7b", 15),
        minPct: 99,
      },
      {
        label: "different level",
        a: makeSizedPage("sample:M:7a", 5),
        b: makeSizedPage("sample:N:7a", 5),
        minPct: 95,
      },
      {
        label: "different sheet",
        a: makeSizedPage("sample:M:7a", 5),
        b: makeSizedPage("sample:M:8a", 5),
        minPct: 95,
      },
      {
        label: "different source",
        a: makeSizedPage("sample:M:7a", 5),
        b: makeSizedPage("other:M:7a", 5),
        minPct: 95,
      },
      {
        label: "different kind (page vs contents)",
        a: makeSizedPage("sample:M:7a", 5),
        b: {
          kind: "contents",
          source_ref: "sample:M:contents",
          topics: [{ n: 1, title: "Topic 1", sheets: [1, 10], std_time_min: [1, 2] }],
        },
      },
    ];

    for (const c of identityCases) {
      const { cmp, outcome } = decide(c.a, c.b);
      if (c.minPct !== undefined) {
        expect(agreementPercentage(cmp.counts.agreed, cmp.counts.compared), c.label).toBeGreaterThanOrEqual(
          c.minPct,
        );
        // source_ref counts as exactly one disagreement in the agreement count
        expect(cmp.counts.compared - cmp.counts.agreed, c.label).toBe(1);
      }
      expect(outcome.status, c.label).toBe("machine_read");
      expect(outcome.stopReasons, c.label).toContain("readers disagree on the page");
    }

    // Different kind with artificially matching source_ref still stops
    const kindOnly = decidePageOutcome({
      hasA: true,
      hasB: true,
      familyA: "codex",
      familyB: "claude",
      diffs: [{ path: "kind", a: "page", b: "contents", kind: "value" }],
      counts: { agreed: 99, compared: 100 },
      sameDigest: true,
    });
    expect(kindOnly).toEqual({ status: "machine_read", stopReasons: ["readers disagree on the page"] });

    // Property: any two distinct valid source_refs stop at any item count
    fc.assert(
      fc.property(
        fc.constantFrom("sample", "demo"),
        fc.constantFrom("A", "B", "M"),
        fc.integer({ min: 1, max: 50 }),
        fc.constantFrom("a", "b"),
        fc.constantFrom("sample", "demo"),
        fc.constantFrom("A", "B", "M"),
        fc.integer({ min: 1, max: 50 }),
        fc.constantFrom("a", "b"),
        (s1, l1, sh1, side1, s2, l2, sh2, side2) => {
          const ref1 = `${s1}:${l1}:${sh1}${side1}`;
          const ref2 = `${s2}:${l2}:${sh2}${side2}`;
          const { outcome } = decide(makeSizedPage(ref1, 4), makeSizedPage(ref2, 4));
          if (ref1 === ref2) {
            expect(outcome.status).toBe("double_read");
            expect(outcome.stopReasons).toEqual([]);
          } else {
            expect(outcome.status).toBe("machine_read");
            expect(outcome.stopReasons).toContain("readers disagree on the page");
          }
        },
      ),
    );
  });

  it("covers every place storing expr with an answer and every page-identity field with a stop, and guards types.ts against new uncovered expr+answer types", () => {
    const evaluatePair = (a: ReferenceRecord, b: ReferenceRecord) => {
      const cmp = compareRecordsWithCounts(a, b);
      const computedA = applyComputedAnswers(a);
      const computedB = applyComputedAnswers(b);
      const exConflicts = collectExampleAnswerConflicts(computedA.record, a, b, {
        finalIsFreshA: true,
      });
      const finalAnswerConflict =
        computedA.details.some((d) => d.kind === "answer_differs") ||
        exConflicts.finalMessages.length > 0;
      const readerAnswerConflict =
        computedB.details.some((d) => d.kind === "answer_differs") ||
        exConflicts.readerMessages.length > 0;
      return decidePageOutcome({
        hasA: true,
        hasB: true,
        familyA: "codex",
        familyB: "claude",
        sameDigest: true,
        diffs: cmp.diffs,
        counts: cmp.counts,
        hasAnswerConflict: finalAnswerConflict,
        hasReaderAnswerConflict: readerAnswerConflict,
        recordA: a,
        recordB: b,
      });
    };

    const pageWithWrongItemAnswer = (wrongA: boolean, wrongB: boolean) => {
      const a = makeGridPage(5);
      const b = makeGridPage(5);
      if (wrongA) {
        a.sections[0].items[0].responses[0] = {
          position: "after_equals",
          cue: null,
          answer: "99",
          answer_source: "reader",
        };
      }
      if (wrongB) {
        b.sections[0].items[0].responses[0] = {
          position: "after_equals",
          cue: null,
          answer: "99",
          answer_source: "reader",
        };
      }
      return { a, b };
    };

    const pageWithWrongExampleAnswer = (wrongA: boolean, wrongB: boolean) => {
      const makeRec = (shown: string): PageRecord => ({
        ...makeGridPage(5),
        examples: [
          {
            position: "top",
            relation: "compare",
            parts: [
              {
                form: "horizontal",
                expr: { kind: "arith", op: "add", operands: [2, 3] },
                shown_answer: shown,
              },
            ],
          },
        ],
      });
      return { a: makeRec(wrongA ? "6" : "5"), b: makeRec(wrongB ? "6" : "5") };
    };

    const guardedPlaces: Array<{
      label: string;
      pair: { a: ReferenceRecord; b: ReferenceRecord };
      expectedReason: PageStopReason;
    }> = [
      {
        label: "item response answer wrong on both readers (100%)",
        pair: pageWithWrongItemAnswer(true, true),
        expectedReason: "stored answer conflicts with computed answer",
      },
      {
        label: "item response answer wrong on reader B only (>= 95%)",
        pair: pageWithWrongItemAnswer(false, true),
        expectedReason: READER_ANSWER_CONFLICT_REASON,
      },
      {
        label: "worked-example shown_answer wrong on both readers (100%)",
        pair: pageWithWrongExampleAnswer(true, true),
        expectedReason: "stored answer conflicts with computed answer",
      },
      {
        label: "worked-example shown_answer wrong on reader B only (>= 95%)",
        pair: pageWithWrongExampleAnswer(false, true),
        expectedReason: READER_ANSWER_CONFLICT_REASON,
      },
      {
        label: "source_ref mismatch (>= 95%)",
        pair: {
          a: makePage({ source_ref: "sample:M:7a", sections: makeGridPage(5).sections }),
          b: makePage({ source_ref: "sample:M:7b", sections: makeGridPage(5).sections }),
        },
        expectedReason: PAGE_IDENTITY_DISAGREEMENT_REASON,
      },
      {
        label: "kind mismatch (page vs contents)",
        pair: {
          a: makeGridPage(5),
          b: {
            kind: "contents",
            source_ref: "sample:M:3a",
            topics: [{ n: 1, title: "Topic 1", sheets: [1, 10], std_time_min: [1, 2] }],
          },
        },
        expectedReason: PAGE_IDENTITY_DISAGREEMENT_REASON,
      },
    ];

    for (const row of guardedPlaces) {
      const outcome = evaluatePair(row.pair.a, row.pair.b);
      expect(outcome.status, row.label).toBe("machine_read");
      expect(outcome.stopReasons, row.label).toContain(row.expectedReason);
    }

    // Schema-drift guard: parse src/lib/reference-record/types.ts with the TypeScript parser and
    // verify every interface/type holding both an expr and an answer (directly or via a referenced
    // member type) is in the covered set. Adding a new expr+answer type without wiring a stop fails.
    // Note: intersection types (e.g. `A & B`) are out of scope for this AST guard.
    const typesPath = resolve(process.cwd(), "src/lib/reference-record/types.ts");
    const sourceFile = ts.createSourceFile(
      typesPath,
      readFileSync(typesPath, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );

    interface FieldInfo {
      name: string;
      referencedTypes: Set<string>;
    }
    const collectTypeRefs = (node: ts.TypeNode | undefined, out: Set<string>): void => {
      if (!node) return;
      if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
        out.add(node.typeName.text);
      }
      ts.forEachChild(node, (child) => {
        if (ts.isTypeNode(child)) collectTypeRefs(child, out);
      });
    };
    const readMembers = (members: ts.NodeArray<ts.TypeElement>): FieldInfo[] => {
      const fields: FieldInfo[] = [];
      for (const m of members) {
        if (!ts.isPropertySignature(m) || !m.name) continue;
        const name = ts.isIdentifier(m.name)
          ? m.name.text
          : ts.isStringLiteral(m.name)
            ? m.name.text
            : "";
        if (!name) continue;
        const referencedTypes = new Set<string>();
        collectTypeRefs(m.type, referencedTypes);
        fields.push({ name, referencedTypes });
      }
      return fields;
    };

    const objectTypes = new Map<string, FieldInfo[]>();
    const unionMembers = new Map<string, string[]>();
    for (const stmt of sourceFile.statements) {
      if (ts.isInterfaceDeclaration(stmt)) {
        objectTypes.set(stmt.name.text, readMembers(stmt.members));
      } else if (ts.isTypeAliasDeclaration(stmt)) {
        if (ts.isTypeLiteralNode(stmt.type)) {
          objectTypes.set(stmt.name.text, readMembers(stmt.type.members));
        } else if (ts.isUnionTypeNode(stmt.type)) {
          const names: string[] = [];
          for (const member of stmt.type.types) {
            if (ts.isTypeReferenceNode(member) && ts.isIdentifier(member.typeName)) {
              names.push(member.typeName.text);
            }
          }
          if (names.length > 0) unionMembers.set(stmt.name.text, names);
        }
      }
    }

    const EXPR_TYPE_NAMES = new Set(["Expr", "SimpleExpr", "ArithExpr", "ChainExpr", "MissingExpr", "WordExpr", "NotationExpr", "LinkedExpr"]);
    const isAnswerField = (name: string): boolean => /answer/i.test(name) && name !== "answer_source";
    const hasDirectExpr = (fields: FieldInfo[]): boolean =>
      fields.some((f) => f.name === "expr" || [...f.referencedTypes].some((t) => EXPR_TYPE_NAMES.has(t)));
    const hasDirectAnswer = (fields: FieldInfo[]): boolean =>
      fields.some((f) => isAnswerField(f.name));
    const hasAnswerWithinOneHop = (fields: FieldInfo[]): boolean =>
      hasDirectAnswer(fields) ||
      fields.some((f) =>
        [...f.referencedTypes].some((refName) => {
          const target = objectTypes.get(refName);
          return target !== undefined && hasDirectAnswer(target);
        }),
      );

    const typesWithExprAndAnswer: string[] = [];
    const typesWithDirectExpr: string[] = [];
    for (const [typeName, fields] of objectTypes) {
      if (hasDirectExpr(fields)) {
        typesWithDirectExpr.push(typeName);
        if (hasAnswerWithinOneHop(fields)) {
          typesWithExprAndAnswer.push(typeName);
        }
      }
    }
    expect(typesWithExprAndAnswer.sort()).toEqual(["ExamplePart", "PageItem"]);
    // Guard against any new type in types.ts holding an Expr without updating findExpressionDisagreements.
    expect(typesWithDirectExpr.sort()).toEqual(["ExamplePart", "LinkedExpr", "PageItem", "WordExpr"]);

    // Also classify every top-level key of PageRecord and ContentsRecord from types.ts AST.
    // Any new key added to either interface without an explicit classification fails here.
    type TopLevelFieldClass =
      | { kind: "identity" }
      | { kind: "compared" }
      | { kind: "not_compared"; reason: string };

    const TOP_LEVEL_FIELD_CLASSES: Record<string, Record<string, TopLevelFieldClass>> = {
      PageRecord: {
        kind: { kind: "identity" },
        source_ref: { kind: "identity" },
        topic: { kind: "compared" },
        sections: { kind: "compared" },
        examples: { kind: "compared" },
        score_bands: { kind: "compared" },
        readers: {
          kind: "not_compared",
          reason: "reader provenance list; differs by reader slot and is merged onto the final record",
        },
        single_read: {
          kind: "not_compared",
          reason: "output-only metadata attached after comparison on agreement_accepted pages",
        },
      },
      ContentsRecord: {
        kind: { kind: "identity" },
        source_ref: { kind: "identity" },
        topics: { kind: "compared" },
        readers: {
          kind: "not_compared",
          reason: "reader provenance list; differs by reader slot and is merged onto the final record",
        },
        single_read: {
          kind: "not_compared",
          reason: "output-only metadata attached after comparison on agreement_accepted pages",
        },
      },
    };

    const recordVariants = unionMembers.get("ReferenceRecord") ?? [];
    expect(recordVariants.sort()).toEqual(["ContentsRecord", "PageRecord"]);
    for (const variant of recordVariants) {
      const classes = TOP_LEVEL_FIELD_CLASSES[variant];
      expect(classes, variant).toBeDefined();
      const fields = objectTypes.get(variant) ?? [];
      const actualKeys = fields.map((f) => f.name).sort();
      expect(actualKeys, `${variant} top-level keys must all be classified`).toEqual(
        Object.keys(classes).sort(),
      );
      const identityKeys: string[] = [];
      for (const [key, cls] of Object.entries(classes)) {
        if (cls.kind === "identity") identityKeys.push(key);
        if (cls.kind === "not_compared") {
          expect(cls.reason.trim().length, `${variant}.${key} needs a reason`).toBeGreaterThan(0);
        }
      }
      expect(identityKeys.sort(), `${variant} identity keys`).toEqual(["kind", "source_ref"]);
    }
  });

  it("satisfies threshold and ratio invariants across arbitrary counts", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        (aRaw, bRaw) => {
          const compared = Math.max(aRaw, bRaw);
          const agreed = Math.min(aRaw, bRaw);
          const ratio = compared === 0 ? 0 : agreed / compared;
          expect(ratio).toBeGreaterThanOrEqual(0);
          expect(ratio).toBeLessThanOrEqual(1);
          const accepted = meetsAgreementThreshold(agreed, compared);
          expect(accepted).toBe(compared > 0 && agreed * 10 >= compared * 9);
          const pct = agreementPercentage(agreed, compared);
          if (compared === 0) {
            expect(pct).toBeNull();
          } else {
            expect(pct).not.toBeNull();
            expect((pct as number) >= 90).toBe(accepted);
            expect((pct as number) === 100).toBe(agreed === compared);
          }
        },
      ),
    );
  });

  it("finds and locates an expression difference on the largest item number that a record can hold", () => {
    const n = Number.MAX_SAFE_INTEGER;
    const makePage = (operands: number[]): PageRecord => ({
      kind: "page",
      source_ref: "sample:M:3a",
      topic: { title: "Adding" },
      sections: [
        {
          instruction: "Add.",
          scaffolds: [],
          items: [
            {
              n,
              printed: "2 + 3 =",
              form: "horizontal",
              expr: { kind: "arith", op: "add", operands },
              responses: [{ position: "after_equals", cue: null, answer: "5", answer_source: "reader" }],
            },
          ],
        },
      ],
      examples: [],
      score_bands: [null, null, null, null, null],
    });
    const a = makePage([1, 4]);
    const diffs = compareRecords(a, makePage([2, 3]));
    expect(findExpressionDisagreements(diffs)).toEqual([
      `sections[0].items[n=${n}].expr.operands[0]`,
      `sections[0].items[n=${n}].expr.operands[1]`,
    ]);
    expect(resolveSingleReadPaths(a, diffs)).toEqual([
      "sections[0].items[0].expr.operands[0]",
      "sections[0].items[0].expr.operands[1]",
    ]);
  });
});
