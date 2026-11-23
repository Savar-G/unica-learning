import { describe, expect, it } from "vitest";
import { renderRecordToMarkdown } from "./render-markdown";
import type { ContentsRecord, PageRecord } from "./types";

describe("renderRecordToMarkdown", () => {
  it("renders a page record with items, responses, scaffolds, examples, computed features and ordering pattern", () => {
    const page: PageRecord = {
      kind: "page",
      source_ref: "demo:Z:12a",
      topic: { title: "Multiplying small numbers", number: "not_stated" },
      sections: [
        {
          instruction: "Find each product.",
          scaffolds: [
            { kind: "answer_boxes", applies_to: [1], box_count: 2, places: ["tens", "ones"] },
          ],
          items: [
            {
              n: 1,
              printed: "27 x 2",
              form: "vertical",
              expr: { kind: "arith", op: "mul", operands: [27, 2] },
              responses: [
                { position: "box", place: "tens", cue: "not_stated", answer: "5", answer_source: "computed" },
                { position: "box", place: "ones", cue: "not_stated", answer: "4", answer_source: "computed" },
              ],
            },
            {
              n: 2,
              printed: "27 x 3",
              form: "vertical",
              expr: { kind: "arith", op: "mul", operands: [27, 3] },
              responses: [
                { position: "under_line", cue: "not_stated", answer: "81", answer_source: "computed" },
              ],
            },
          ],
        },
      ],
      examples: [
        {
          position: "foot",
          relation: "compare",
          label: "Tip",
          parts: [
            {
              caption: "(Add)",
              form: "vertical",
              expr: { kind: "arith", op: "add", operands: [27, 27] },
              shown_answer: "54",
            },
            {
              caption: "(Multiply)",
              form: "vertical",
              expr: { kind: "arith", op: "mul", operands: [27, 2] },
              shown_answer: "54",
            },
          ],
          text: "Both give the same total.",
        },
      ],
      score_bands: [[0, 0], [1, 1], [2, 3], [4, 5], [6, "open"]],
    };

    const md = renderRecordToMarkdown(page);
    expect(md).toContain("# demo:Z:12a");
    expect(md).toContain("Multiplying small numbers");
    expect(md).toContain("first operand fixed (27), second steps by 1");
    expect(md).toContain("27 x 2");
    expect(md).toContain("ones_to_tens");
    expect(md).toContain("answer_boxes");
    expect(md).toContain("Both give the same total.");
    expect(md).toContain("6~");
  });

  it("renders a contents record as a readable table", () => {
    const contents: ContentsRecord = {
      kind: "contents",
      source_ref: "demo:Z:contents",
      topics: [
        { n: 1, title: "Warmup sums", sheets: [1, 10], std_time_min: [2, 3] },
        { n: 2, title: "Equal groups", sheets: [11, 20], std_time_min: [3, 5] },
      ],
    };

    const md = renderRecordToMarkdown(contents);
    expect(md).toContain("# demo:Z:contents");
    expect(md).toContain("Warmup sums");
    expect(md).toContain("1–10");
    expect(md).toContain("3–5 min");
  });

  it("escapes pipes and newlines in every table cell and renders notation latex and figure", () => {
    const page: PageRecord = {
      kind: "page",
      source_ref: "demo:G:1a",
      topic: { title: "Absolute value graphs" },
      sections: [
        {
          instruction: "Inspect each item.",
          scaffolds: [],
          items: [
            {
              n: 1,
              printed: "4 x [ ] = 28 -> 28 / 4 = [ ]",
              form: "horizontal",
              expr: {
                kind: "linked",
                pair: [
                  { kind: "missing", op: "mul", operands: [4, null], result: 28 },
                  { kind: "arith", op: "div", operands: [28, 4] },
                ],
                connector: "arrow",
              },
              responses: [
                { position: "box", cue: "line1\nline2", answer: "7", answer_source: "computed" },
                { position: "box", cue: null, answer: "7", answer_source: "computed" },
              ],
            },
            {
              n: 2,
              printed: "Graph f(x) = |x - 2|",
              form: "not_stated",
              expr: {
                kind: "notation",
                latex: "f(x) = |x - 2|",
                figure: "Coordinate grid with V-shaped curve meeting the x-axis at (2, 0)",
              },
              responses: [
                { position: "work_area", cue: null, answer: "vertex | (2, 0)", answer_source: "reader" },
              ],
            },
          ],
        },
      ],
      examples: [],
      score_bands: [[0, 0], [1, "unclear"], [2, 2], [3, 3], [4, "open"]],
    };

    const md = renderRecordToMarkdown(page);
    expect(md).toContain("f(x) = \\|x - 2\\|");
    expect(md).toContain("Coordinate grid with V-shaped curve meeting the x-axis at (2, 0)");
    expect(md).toContain("line1<br>line2");
    expect(md).toContain("1–unclear");

    // Every item table row must have exactly 6 unescaped '|' delimiters (5 columns)
    const tableRows = md
      .split("\n")
      .filter((line) => line.startsWith("| ") && !line.startsWith("| # |"));
    expect(tableRows).toHaveLength(2);
    for (const row of tableRows) {
      const unescapedPipes = row.match(/(?<!\\)\|/g) ?? [];
      expect(unescapedPipes).toHaveLength(6);
    }
  });

  it("renders example steps, example marks, and the new practice scaffold kinds", () => {
    const page: PageRecord = {
      kind: "page",
      source_ref: "demo:Z:15a",
      topic: { title: "Carrying in vertical multiplication", number: 2 },
      sections: [
        {
          instruction: "Multiply.",
          scaffolds: [
            { kind: "helper_digit", applies_to: [1], description: "Carry slot above tens" },
            { kind: "partial_working", applies_to: [1], description: "Ones row pre-filled" },
            { kind: "worked_item", applies_to: [1] },
            { kind: "other", applies_to: "all", description: "Dotted guide line" },
          ],
          items: [
            {
              n: 1,
              printed: "26 x 3",
              form: "vertical",
              expr: { kind: "arith", op: "mul", operands: [26, 3] },
              responses: [
                { position: "under_line", cue: null, answer: "78", answer_source: "computed" },
              ],
            },
          ],
        },
      ],
      examples: [
        {
          position: "top",
          relation: "sequence",
          label: "Example",
          parts: [
            {
              form: "vertical",
              expr: { kind: "arith", op: "mul", operands: [24, 3] },
              shown_answer: "72",
            },
          ],
          steps: [
            { n: 1, shows: "carry", printed: "4 x 3 = 12, carry 1", note: "Write 2, carry 1." },
            { n: 2, shows: "other", shows_other: "combine tens", printed: "2 x 3 + 1 = 7" },
          ],
          marks: [
            { kind: "arrow", step: 1, description: "Points from 12 to carry digit 1" },
            { kind: "helper_digit", step: 1 },
          ],
        },
      ],
      score_bands: [[0, 0], [1, 1], [2, 2], [3, 3], [4, "open"]],
    };

    const md = renderRecordToMarkdown(page);
    expect(md).toContain("`helper_digit` (items [1]): Carry slot above tens");
    expect(md).toContain("`partial_working` (items [1]): Ones row pre-filled");
    expect(md).toContain("`worked_item` (items [1])");
    expect(md).toContain("`other` (items all): Dotted guide line");
    expect(md).toContain("1. [carry] `4 x 3 = 12, carry 1` (note: Write 2, carry 1.)");
    expect(md).toContain("2. [other (combine tens)] `2 x 3 + 1 = 7`");
    expect(md).toContain("`arrow` (step 1): Points from 12 to carry digit 1");
    expect(md).toContain("`helper_digit` (step 1)");
  });
});
