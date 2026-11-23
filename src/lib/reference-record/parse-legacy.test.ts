import { describe, expect, it } from "vitest";
import { formatConversionReport, parseLegacyMarkdown } from "./parse-legacy";
import { parseLayoutInfo, parseQuestionCell } from "./parse-legacy-helpers";
import { buildPairedSectionItems } from "./parse-legacy-items";
import { renderRecordToMarkdown } from "./render-markdown";
import { NOT_STATED } from "./types";
import { validateReferenceRecord } from "./validate";

describe("parseLegacyMarkdown", () => {
  it("parses a contents chart and a valid page record", () => {
    const md = `# Workshop Level M reference

## Topic overview
| Topic | Sheets | Std time (min) |
|---|---|---|
| 1. Stamp counting | M1–M12 | 2-5 |
| 2. Jar packing | M13–M24 | 4-7 |

#### M3a \u2014 Stamp counting (SCAN_101)
- Instruction: Work out each sum.
- Layout: 3 horizontal sums, answer after =
- Mistake bands: 100% (0) | ~90% (1~2) | ~80% (3) | ~70% (4) | 69%~ (5~)
- Student time: 9:10 to 9:14 (4 min)

| # | Question | Answer | Type |
|---|---|---|---|
| 1 | 14 + 23 = | 37 | sum |
| 2 | 28 + 15 = | 43 | sum |
| 3 | 31 + 19 = | 50 | sum |
`;

    const parsed = parseLegacyMarkdown(md);
    expect(parsed.contents).not.toBeNull();
    expect(validateReferenceRecord(parsed.contents).ok).toBe(true);
    expect(parsed.contents?.source_ref).toBe("workshop:M:contents");
    expect(parsed.contents?.topics).toEqual([
      { n: 1, title: "Stamp counting", sheets: [1, 12], std_time_min: [2, 5] },
      { n: 2, title: "Jar packing", sheets: [13, 24], std_time_min: [4, 7] },
    ]);

    expect(parsed.pages).toHaveLength(1);
    expect(validateReferenceRecord(parsed.pages[0].record)).toEqual({
      ok: true,
      record: parsed.pages[0].record,
    });
    expect(parsed.pages[0].record.source_ref).toBe("workshop:M:3a");
    expect(parsed.pages[0].answerDiffs).toHaveLength(0);
  });

  it("treats a bare count with a form word as a section-wide form rather than a single-item reference", () => {
    const md = `# Workshop Level M reference

#### M4a \u2014 Stamp counting (SCAN_102)
- Instruction: Find every sum.
- Layout: 4 horizontal sums
- Mistake bands: 100% (0) | ~90% (1~2) | ~80% (3) | ~70% (4) | 69%~ (5~)

| # | Question | Answer | Type |
|---|---|---|---|
| 1 | 11 + 6 = | 17 | sum |
| 2 | 12 + 7 = | 19 | sum |
| 3 | 13 + 8 = | 21 | sum |
| 4 | 14 + 9 = | 23 | sum |
`;

    const parsed = parseLegacyMarkdown(md);
    const items = parsed.pages[0].record.sections[0].items;
    expect(items.map((it) => it.form)).toEqual([
      "horizontal",
      "horizontal",
      "horizontal",
      "horizontal",
    ]);
    expect(items.every((it) => it.responses[0].position === "not_stated")).toBe(true);
  });

  it("applies per-item form and position qualifiers only to the rows they name", () => {
    const scopedPosMd = `# Workshop Level M reference

#### M5a \u2014 Stamp counting (SCAN_103)
- Instruction: Solve each exercise.
- Layout: Answer after = for rows 1 and 2
- Mistake bands: 100% (0) | ~90% (1~2) | ~80% (3) | ~70% (4) | 69%~ (5~)

| # | Question | Answer | Type |
|---|---|---|---|
| 1 | 21 + 14 = | 35 | sum |
| 2 | 32 + 17 = | 49 | sum |
| 3 | 43 + 18 = | 61 | sum |
`;

    const scopedParsed = parseLegacyMarkdown(scopedPosMd);
    const scopedItems = scopedParsed.pages[0].record.sections[0].items;
    expect(scopedItems.map((it) => it.form)).toEqual(["horizontal", "horizontal", "not_stated"]);
    expect(scopedItems.map((it) => it.responses[0].position)).toEqual([
      "after_equals",
      "after_equals",
      "not_stated",
    ]);

    const partialFormMd = `# Workshop Level M reference

#### M6a \u2014 Stamp counting (SCAN_104)
- Instruction: Subtract each pair.
- Layout: Questions 1-2 vertical, item 4 horizontal
- Mistake bands: 100% (mistakes) 0 | ~90% 1 | ~80% 2~3 | ~70% 4 | 69%~ 5~

| # | Question | Answer | Type |
|---|---|---|---|
| 1 | 41 - 16 = | 25 | diff |
| 2 | 52 - 19 = | 33 | diff |
| 3 | 63 - 24 = | 39 | diff |
| 4 | 74 - 28 = | 46 | diff |
| 5 | 85 - 37 = | 49 | deliberate wrong answer |
`;

    const partialParsed = parseLegacyMarkdown(partialFormMd);
    const partialPage = partialParsed.pages[0];
    expect(partialPage.record.sections[0].items.map((it) => it.form)).toEqual([
      "vertical",
      "vertical",
      "not_stated",
      "horizontal",
      "not_stated",
    ]);
    expect(
      partialPage.record.sections[0].items.every((it) => it.responses[0].position === "not_stated"),
    ).toBe(true);
    expect(partialPage.answerDiffs).toHaveLength(1);
    expect(partialPage.answerDiffs[0]).toMatchObject({
      itemRef: "1.5",
      fileAnswer: "49",
      computedAnswer: "48",
    });
  });

  it("keeps form and position not_stated when the layout note is silent", () => {
    const md = `# Workshop Level M reference

#### M7a \u2014 Stamp counting (SCAN_105)
- Instruction: Complete every row.
- Layout: Wide margins, two panels
- Mistake bands: 100% (0) | ~90% (1~2) | ~80% (3) | ~70% (4) | 69%~ (5~)

| # | Question | Answer | Type |
|---|---|---|---|
| 1 | 24 x 3 (vertical) | 72 | stacked |
| 2 | 8) 67 | 8 R3 | division |
`;

    const parsed = parseLegacyMarkdown(md);
    const items = parsed.pages[0].record.sections[0].items;
    expect(items.map((it) => it.form)).toEqual(["not_stated", "not_stated"]);
    expect(items.map((it) => it.responses[0].position)).toEqual(["not_stated", "not_stated"]);
  });

  it("links block-paired rows only when both expressions compute to the same value", () => {
    const teachingPairMd = `# Workshop Level M reference

#### M11a \u2014 Grouping jars (SCAN_106)
- Instruction: Fill every box.
- Layout: Each block has two prompts, answer in a box after =
- Mistake bands: 100% (0) | ~90% (1~2) | ~80% (3) | ~70% (4) | 69%~ (5~)
- Hints: Two number-strip rows above questions 1-2 and above questions 3-4 with numbers 6, 12, 18, 24, 30; box 18 is bold in strip one, box 24 is bold in strip two.

| # | Question | Answer | Type |
|---|---|---|---|
| 1 | 6 + 6 + 6 = [ ] | 18 | repeated sum |
| 2 | 6 x 3 = [ ] | 18 | product |
| 3 | 6 + 6 + 6 + 6 = [ ] | 24 | repeated sum |
| 4 | 6 x 4 = [ ] | 24 | product |
`;

    const teachingParsed = parseLegacyMarkdown(teachingPairMd);
    const m11 = teachingParsed.pages[0].record;
    expect(validateReferenceRecord(m11).ok).toBe(true);
    expect(m11.sections[0].items).toHaveLength(2);
    expect(m11.sections[0].items[0]).toMatchObject({
      n: 1,
      form: "horizontal",
      expr: {
        kind: "linked",
        pair: [
          { kind: "arith", op: "add", operands: [6, 6, 6] },
          { kind: "arith", op: "mul", operands: [6, 3] },
        ],
        connector: "not_stated",
      },
    });
    expect(m11.sections[0].items[0].printed).not.toMatch(/→|->/);
    expect(m11.sections[0].items[0].responses.map((r) => [r.position, r.answer])).toEqual([
      ["box", "18"],
      ["box", "18"],
    ]);
    expect(m11.sections[0].scaffolds).toEqual([
      {
        kind: "number_strip",
        applies_to: [1],
        values: [6, 12, 18, 24, 30],
        highlighted: [18],
      },
      {
        kind: "number_strip",
        applies_to: [2],
        values: [6, 12, 18, 24, 30],
        highlighted: [24],
      },
    ]);

    const unrelatedBlockMd = `# Workshop Level M reference

#### M12a \u2014 Grouping jars (SCAN_107)
- Instruction: Find each value.
- Layout: Each block holds two unrelated questions, horizontal, answer after =
- Mistake bands: 100% (0) | ~90% (1~2) | ~80% (3) | ~70% (4) | 69%~ (5~)

| # | Question | Answer | Type |
|---|---|---|---|
| 1 | 12 + 5 = | 17 | sum |
| 2 | 14 + 9 = | 23 | sum |
| 3 | 31 - 8 = | 23 | diff |
| 4 | 45 - 12 = | 33 | diff |
`;

    const unrelatedParsed = parseLegacyMarkdown(unrelatedBlockMd);
    const m12Items = unrelatedParsed.pages[0].record.sections[0].items;
    expect(m12Items).toHaveLength(4);
    expect(m12Items.every((it) => it.expr?.kind === "arith")).toBe(true);

    const separateSectionsMd = `# Workshop Level M reference

#### M13a \u2014 Grouping jars (SCAN_108)
- Instruction: 1. Combine equal amounts. / 2. Multiply.
- Layout: Section 1: 2 horizontal sums. Section 2: 2 items, answer after =
- Mistake bands: 100% (0) | ~90% (1~2) | ~80% (3) | ~70% (4) | 69%~ (5~)

| # | Question | Answer | Type |
|---|---|---|---|
| 1.1 | 12 + 12 = | 24 | sum |
| 1.2 | 12 + 12 + 12 = | 36 | sum |
| 2.1 | 12 × 2 = | 24 | fact |
| 2.2 | 12 × 3 = | 36 | fact |
`;

    const separateParsed = parseLegacyMarkdown(separateSectionsMd);
    const m13 = separateParsed.pages[0].record;
    expect(m13.sections).toHaveLength(2);
    expect(m13.sections[0].items.every((it) => it.expr?.kind === "arith")).toBe(true);
    expect(m13.sections[0].items[1].expr).toEqual({
      kind: "arith",
      op: "add",
      operands: [12, 12, 12],
    });
    expect(m13.sections[1].items.every((it) => it.form === "horizontal")).toBe(true);
    expect(m13.sections[1].items.every((it) => it.responses[0].position === "after_equals")).toBe(
      true,
    );
  });

  it("keeps the printed arrow only where the arrow connector is confirmed and uses a neutral separator otherwise", () => {
    const md = `# Workshop Level M reference

#### M18a \u2014 Fact families (SCAN_109)
- Instruction: Write the missing values.
- Layout: Two rows of paired equations, answers in a box
- Mistake bands: 100% (0) | ~90% (1~2) | ~80% (3) | ~70% (4) | 69%~ (5~)
- Hints: Arrow from left equation to right equation in row 1; Caption below 31 - 14: 'thirty-one minus fourteen'

| # | Question | Answer | Type |
|---|---|---|---|
| 1 | 14 + □ = 31 → 31 - 14 = □ | 17 ; 17 | pair |
| 2 | 18 + □ = 42 → 42 - 18 = □ | 24 ; 24 | pair |
`;

    const parsed = parseLegacyMarkdown(md);
    const record = parsed.pages[0].record;
    expect(validateReferenceRecord(record).ok).toBe(true);
    const [item1, item2] = record.sections[0].items;

    expect(item1.expr).toMatchObject({ kind: "linked", connector: "arrow" });
    expect(item1.printed).toBe("14 + □ = 31 → 31 - 14 = □");
    expect(item2.expr).toMatchObject({ kind: "linked", connector: "not_stated" });
    expect(item2.printed).toBe("18 + □ = 42 / 42 - 18 = □");
    expect(item2.printed).not.toMatch(/→|->/);
    expect(item1.responses.map((r) => r.answer)).toEqual(["17", "17"]);
    expect(record.sections[0].scaffolds).toEqual([
      { kind: "arrow", applies_to: [1], from: "left_equation", to: "right_equation" },
      { kind: "caption", applies_to: [1], text: "thirty-one minus fourteen", target: "31 - 14" },
    ]);

    const viewMd = renderRecordToMarkdown(record);
    const itemRows = viewMd
      .split("\n")
      .filter((line) => line.startsWith("| 1 |") || line.startsWith("| 2 |"));
    expect(itemRows).toHaveLength(2);
    const printedCol1 = itemRows[0].split("|")[2].trim();
    const printedCol2 = itemRows[1].split("|")[2].trim();
    expect(printedCol1).toContain("→");
    expect(printedCol2).toBe("18 + □ = 42 / 42 - 18 = □");
    expect(printedCol2).not.toMatch(/→|->/);
  });

  it("parses a read-aloud table section and worked example without inventing part forms", () => {
    const md = `# Workshop Level M reference

#### M14a \u2014 Chart warmup (SCAN_110)
- Instruction: 1. Read the chart aloud. / 2. Complete the drills.
- Layout: Section 1: framed times table. Section 2: 2 prompts, answer after =
- Mistake bands: 100% (0) | ~90% (1~2) | ~80% (3) | ~70% (4) | 69%~ (5~)
- Worked example: {"position": "top", "problem": "11 times chart", "steps_shown": ["Row one: 11 x 1 = 11", "Row two: 11 x 2 = 22"]}
- Hints: Tick box in margin

| # | Question | Answer | Type |
|---|---|---|---|
| 1 | 11 x 1 = | 11 | fact |
| 2 | 11 x 2 = | 22 | fact |
`;

    const parsed = parseLegacyMarkdown(md);
    const record = parsed.pages[0].record;
    expect(validateReferenceRecord(record).ok).toBe(true);
    expect(record.sections).toHaveLength(2);
    expect(record.sections[0].items[0].expr).toBeNull();
    expect(record.sections[0].items[0].responses[0].position).toBe("checkbox");
    expect(Array.isArray(record.examples)).toBe(true);
    if (Array.isArray(record.examples)) {
      expect(record.examples[0].relation).toBe("table");
      expect(record.examples[0].parts.map((part) => part.form)).toEqual([
        "not_stated",
        "not_stated",
      ]);
    }
  });

  it("parses skip-pattern chains, place-value answer boxes, and a bottom note example", () => {
    const md = `# Workshop Level M reference

#### M21a \u2014 Skip patterns (SCAN_111)
- Instruction: 1. Fill the missing terms. / 2. Find each product.
- Layout: Section 1: 2 rows of linked boxes. Section 2: vertical products, answer under the line; answers for (1) use two boxes (tens, ones)
- Mistake bands: 100% (0) | ~90% (1~2) | ~80% (3) | ~70% (4) | 69%~ (5~)
- Hints: Note box at bottom: (Left) 24 + 16 = 40 and (Right) 40 - 16 = 24, then text: Check one with the other. Reference: *: M22(1)

| # | Question | Answer | Type |
|---|---|---|---|
| 1.1 | 15 - 20 - 25 - [ ] - [ ] | 30, 35 | pattern |
| 1.2 | 25 - 30 - 35 - [ ] - [ ] | 40, 45 | pattern |
| 1.3 | 3 - 8 - 14 - [ ] - [ ] | 21, 29 | pattern |
| 2.1 | 14 x 2 | 28 | stacked |
| 2.2 | 16 x 2 | 32 | stacked |
`;

    const parsed = parseLegacyMarkdown(md);
    const record = parsed.pages[0].record;
    expect(validateReferenceRecord(record).ok).toBe(true);
    expect(record.sections[0].items[0].expr?.kind).toBe("chain");
    expect(record.sections[0].items[0].responses.map((r) => r.answer)).toEqual(["30", "35"]);
    // A chain with no fixed step is not computed, and it keeps one response for each blank.
    expect(
      record.sections[0].items[2].responses.map((r) => [r.answer, r.answer_source]),
    ).toEqual([
      ["21", "unchecked"],
      ["29", "unchecked"],
    ]);
    expect(record.sections[1].items[0].responses.map((r) => [r.place, r.answer])).toEqual([
      ["tens", "2"],
      ["ones", "8"],
    ]);
    expect(Array.isArray(record.examples)).toBe(true);
    if (Array.isArray(record.examples)) {
      expect(record.examples[0].position).toBe("foot");
      expect(record.examples[0].parts[0].form).toBe("not_stated");
    }
  });

  it("parses word problems with equation frames, work areas, units, and empty score bands", () => {
    const md = `# Workshop Level M reference

#### M25a \u2014 Story exercises (SCAN_112)
- Instruction: Solve each story.
- Layout: Two word problems with a work area and an answer line with a unit
- Mistake bands: 100% (mistakes) 0 | ~90% \u2014 | ~80% 1~2 | ~70% 3 | 69%~ 4~

| # | Question | Answer | Type |
|---|---|---|---|
| 1 | A drawer has 15 blue stamps and 24 red stamps. How many stamps are in the drawer? (Show your work.) 15 + 24 = [ ] (Ans.) ____ stamps | 39 stamps | story |
| 2 | A tall jar holds 48 glass beads and 19 are poured out. How many beads remain? (Show your work.) (Ans.) ____ beads | 29 beads | story |
`;

    const parsed = parseLegacyMarkdown(md);
    const record = parsed.pages[0].record;
    expect(validateReferenceRecord(record).ok).toBe(true);
    expect(record.score_bands).toEqual([[0, 0], null, [1, 2], [3, 3], [4, "open"]]);
    expect(record.sections[0].items.map((it) => it.form)).toEqual(["not_stated", "not_stated"]);
    expect(record.sections[0].items[0].responses[0].position).toBe("box");
    expect(record.sections[0].items[0].responses[1]).toMatchObject({
      position: "line_with_unit",
      unit: "stamps",
      answer: "39",
      answer_source: "computed",
    });
    expect(record.sections[0].items[1].responses[1]).toMatchObject({
      position: "line_with_unit",
      unit: "beads",
      answer: "29",
      answer_source: "unchecked",
    });
  });

  it("parses long-division brackets and remainder answers", () => {
    const md = `# Workshop Level M reference

#### M28a \u2014 Sharing equally (SCAN_113)
- Instruction: Divide with remainders.
- Layout: Division brackets on every row; answers above the bracket
- Mistake bands: 100% (0) | ~90% (1~2) | ~80% (3) | ~70% (4) | 69%~ (5~)

| # | Question | Answer | Type |
|---|---|---|---|
| 1 | 9) 76 | 8 R4 | bracket |
| 2 | 8) 64 | 8 | bracket |
`;

    const parsed = parseLegacyMarkdown(md);
    const record = parsed.pages[0].record;
    expect(validateReferenceRecord(record).ok).toBe(true);
    expect(record.sections[0].items[0]).toMatchObject({
      form: "bracket",
      expr: { kind: "arith", op: "div", operands: [76, 9] },
    });
    expect(record.sections[0].items[0].responses[0]).toMatchObject({
      position: "above_bracket",
      answer: "8 R4",
      answer_source: "computed",
    });
  });

  it("reports answer differences and keeps separate response slots on a partly computable linked pair", () => {
    // Direct block-pair test: first expression computes to 19 (file says 55); second is an uncomputable 2-blank chain
    const answerDiffs: Array<{
      sourceRef: string;
      itemRef: string;
      printed: string;
      fileAnswer: string;
      computedAnswer: string;
    }> = [];
    const built = buildPairedSectionItems(
      [
        {
          row: { sectionIndex: 0, n: 1, rawId: "1", question: "11 + 8 =", answer: "55" },
          parsed: parseQuestionCell("11 + 8 ="),
        },
        {
          row: {
            sectionIndex: 0,
            n: 2,
            rawId: "2",
            question: "2 - 5 - 11 - [ ] - [ ]",
            answer: "19, 28",
          },
          parsed: parseQuestionCell("2 - 5 - 11 - [ ] - [ ]"),
        },
      ],
      {
        sourceRef: "workshop:M:31a",
        sectionIndex: 0,
        layoutInfo: parseLayoutInfo("Each block has two prompts, answer in a box"),
        parsedScaffolds: NOT_STATED,
        extraScaffolds: [],
        answerDiffs,
      },
    );

    expect(answerDiffs).toHaveLength(1);
    expect(answerDiffs[0]).toMatchObject({
      fileAnswer: "55",
      computedAnswer: "19",
    });
    expect(built.items).toHaveLength(1);
    expect(built.items[0].responses.map((r) => [r.answer, r.answer_source])).toEqual([
      ["19", "computed"],
      ["19", "unchecked"],
      ["28", "unchecked"],
    ]);

    // Single-row linked pair through parseLegacyMarkdown
    const rowLinkedMd = `# Workshop Level M reference

#### M32a \u2014 Mixed pair (SCAN_114)
- Instruction: Complete each pair.
- Layout: Answers in a box
- Mistake bands: 100% (0) | ~90% (1~2) | ~80% (3) | ~70% (4) | 69%~ (5~)

| # | Question | Answer | Type |
|---|---|---|---|
| 1 | 11 + 8 = → 2 - 5 - 11 - [ ] - [ ] | 55 ; 19, 28 | mixed pair |
`;
    const parsed = parseLegacyMarkdown(rowLinkedMd);
    expect(parsed.pages[0].answerDiffs).toHaveLength(1);
    expect(parsed.pages[0].answerDiffs[0]).toMatchObject({
      fileAnswer: "55",
      computedAnswer: "19",
    });
    expect(
      parsed.pages[0].record.sections[0].items[0].responses.map((r) => [r.answer, r.answer_source]),
    ).toEqual([
      ["19", "computed"],
      ["19", "unchecked"],
      ["28", "unchecked"],
    ]);
  });

  it("rejects unrelated level-4 headings, duplicate page references, and empty inputs", () => {
    expect(() => parseLegacyMarkdown("#### Index heading\n\nSome notes.\n")).toThrow(
      /Index heading/,
    );
    expect(() =>
      parseLegacyMarkdown("#### M2a - (SCAN_200)\n- Instruction: Find each total.\n"),
    ).toThrow(/Invalid page header/);

    const duplicateMd = `# Workshop Level M reference

#### M1a \u2014 Stamp counting (SCAN_1)
- Instruction: Find each total.
- Layout: horizontal, answer after =
- Mistake bands: 100% (0) | ~90% (1~2) | ~80% (3) | ~70% (4) | 69%~ (5~)

| # | Question | Answer | Type |
|---|---|---|---|
| 1 | 12 + 13 = | 25 | sum |

#### M1a \u2014 Stamp counting (SCAN_2)
- Instruction: Find each total.
- Layout: horizontal, answer after =
- Mistake bands: 100% (0) | ~90% (1~2) | ~80% (3) | ~70% (4) | 69%~ (5~)

| # | Question | Answer | Type |
|---|---|---|---|
| 1 | 14 + 15 = | 29 | sum |
`;
    expect(() => parseLegacyMarkdown(duplicateMd)).toThrow(/duplicate page reference/i);
    expect(() => parseLegacyMarkdown("# Empty document\n\nNothing here.\n")).toThrow(
      /no page entries/i,
    );
  });

  it("formats a conversion report listing not_stated fields, answer differences, and counts", () => {
    const md = `# Workshop Level M reference

#### M9a \u2014 Stamp counting (SCAN_115)
- Instruction: Find each sum.
- Mistake bands: 100% (0) | ~90% (1~2) | ~80% (3) | ~70% (4) | 69%~ (5~)

| # | Question | Answer | Type |
|---|---|---|---|
| 1 | 19 + 14 = | 34 | wrong answer |
`;

    const parsed = parseLegacyMarkdown(md);
    const report = formatConversionReport(parsed);
    expect(report).toContain("workshop:M:9a");
    expect(report).toContain("not_stated");
    expect(report).toContain("34");
    expect(report).toContain("33");
  });
});
