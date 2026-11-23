import { describe, expect, it } from "vitest";
import type { ContentsRecord, PageRecord } from "./types";
import { validateReferenceRecord } from "./validate";

function makeValidPage(): PageRecord {
  return {
    kind: "page",
    source_ref: "demo:Z:12a",
    topic: { title: "Multiplying small numbers", number: "not_stated" },
    sections: [
      {
        instruction: "Find each product.",
        scaffolds: [
          {
            kind: "answer_boxes",
            applies_to: [1],
            box_count: 2,
            places: ["tens", "ones"],
          },
        ],
        items: [
          {
            n: 1,
            printed: "14 x 2",
            form: "vertical",
            expr: { kind: "arith", op: "mul", operands: [14, 2] },
            responses: [
              {
                position: "box",
                place: "tens",
                cue: "unclear",
                answer: "2",
                answer_source: "computed",
              },
              {
                position: "box",
                place: "ones",
                cue: "not_stated",
                answer: "8",
                answer_source: "computed",
              },
            ],
          },
          {
            n: 2,
            printed: "11 + 11 + 11 =",
            form: "horizontal",
            expr: { kind: "arith", op: "add", operands: [11, 11, 11] },
            responses: [
              {
                position: "after_equals",
                cue: null,
                answer: "33",
                answer_source: "computed",
              },
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
            expr: { kind: "arith", op: "add", operands: [14, 14] },
            shown_answer: "28",
          },
          {
            caption: "(Multiply)",
            form: "vertical",
            expr: { kind: "arith", op: "mul", operands: [14, 2] },
            shown_answer: "28",
          },
        ],
        text: "Both give the same total.",
        cross_ref: "Z14(1)",
      },
    ],
    score_bands: [[0, 0], [1, 1], [2, 3], [4, 5], [6, "open"]],
  };
}

function makeValidContents(): ContentsRecord {
  return {
    kind: "contents",
    source_ref: "demo:Z:contents",
    topics: [
      {
        n: 1,
        title: "Adding small numbers",
        sheets: [1, 10],
        std_time_min: [2, 3],
      },
      {
        n: 2,
        title: "Equal groups",
        sheets: [11, 20],
        std_time_min: [3, 5],
      },
    ],
  };
}

describe("validateReferenceRecord", () => {
  it("accepts a valid page record with all expression kinds and null action item", () => {
    const page = makeValidPage();
    page.sections.push({
      instruction: "Complete each part.",
      scaffolds: [
        { kind: "number_strip", applies_to: [1], values: [5, 10, 15, 20], highlighted: [15] },
        { kind: "table_read_aloud", applies_to: "all", has_checkbox: true },
        { kind: "equation_frame", applies_to: [4], template: "12 x 3 = [ ]" },
        { kind: "arrow", applies_to: [3], from: "left", to: "right" },
        { kind: "caption", applies_to: [3], text: "read left to right" },
      ],
      items: [
        {
          n: 1,
          printed: "15 - 20 - 25 - [ ] - [ ]",
          form: "horizontal",
          expr: { kind: "chain", terms: [15, 20, 25, null, null] },
          responses: [
            { position: "box", cue: null, answer: "30", answer_source: "computed" },
            { position: "box", cue: null, answer: "35", answer_source: "computed" },
          ],
        },
        {
          n: 2,
          printed: "4 x [ ] = 28",
          form: "horizontal",
          expr: { kind: "missing", op: "mul", operands: [4, null], result: 28 },
          responses: [{ position: "box", cue: null, answer: "7", answer_source: "computed" }],
        },
        {
          n: 3,
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
            { position: "box", cue: null, answer: "7", answer_source: "computed" },
            { position: "box", cue: null, answer: "7", answer_source: "computed" },
          ],
        },
        {
          n: 4,
          printed: "Each tray holds 12 pears. How many pears on 3 trays?",
          form: "horizontal",
          expr: {
            kind: "word",
            text: "Each tray holds 12 pears. How many pears on 3 trays?",
            expr: { kind: "arith", op: "mul", operands: [12, 3] },
            unit: "pears",
          },
          responses: [
            { position: "work_area", cue: "Show steps", answer: null, answer_source: "unchecked" },
            {
              position: "line_with_unit",
              cue: null,
              unit: "pears",
              answer: "36",
              answer_source: "computed",
            },
          ],
        },
        {
          n: 5,
          printed: "\\frac{3}{4} + \\frac{1}{4}",
          form: "horizontal",
          expr: { kind: "notation", latex: "\\frac{3}{4} + \\frac{1}{4}", figure: "Shaded bar" },
          responses: [{ position: "after_equals", cue: null, answer: "1", answer_source: "reader" }],
        },
        {
          n: 6,
          printed: "Tick when done",
          form: null,
          expr: null,
          responses: [{ position: "checkbox", cue: null, answer: null, answer_source: "unchecked" }],
        },
      ],
    });

    const result = validateReferenceRecord(page);
    expect(result.ok).toBe(true);
  });

  it("accepts a valid contents record", () => {
    const result = validateReferenceRecord(makeValidContents());
    expect(result.ok).toBe(true);
  });

  it("accepts null score bands and not_stated/unclear where allowed", () => {
    const page = makeValidPage();
    page.score_bands = [[0, 0], null, [1, 1], [2, 2], [3, "open"]];
    page.examples = "not_stated";
    page.sections[0].scaffolds = "not_stated";
    page.sections[0].instruction = "unclear";
    const result = validateReferenceRecord(page);
    expect(result.ok).toBe(true);
  });

  it("refuses unknown keys including layout, free-text type, child name, date, time and handwriting", () => {
    const page = {
      ...makeValidPage(),
      layout: "2 columns x 4 rows",
      student_name: "placeholder-student",
      date: "2026-01-01",
      student_time: "10 min",
      handwriting: "neat",
    };
    const res = validateReferenceRecord(page);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const paths = res.errors.map((e) => e.path);
      expect(paths).toContain("layout");
      expect(paths).toContain("student_name");
      expect(paths).toContain("date");
      expect(paths).toContain("student_time");
      expect(paths).toContain("handwriting");
    }

    const withTypeLabel = makeValidPage();
    (withTypeLabel.sections[0].items[0] as unknown as Record<string, unknown>).type =
      "multiply 2-digit";
    const res2 = validateReferenceRecord(withTypeLabel);
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.errors.some((e) => e.path === "sections[0].items[0].type")).toBe(true);
    }
  });

  it("refuses sentinels in structural fields (kind, source_ref, n, expr.kind, answer_source)", () => {
    const page = makeValidPage();
    page.source_ref = "not_stated";
    (page.sections[0].items[0] as unknown as Record<string, unknown>).n = "unclear";
    (page.sections[0].items[0].responses[0] as unknown as Record<string, unknown>).answer_source =
      "not_stated";
    const res = validateReferenceRecord(page);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const paths = res.errors.map((e) => e.path);
      expect(paths).toContain("source_ref");
      expect(paths).toContain("sections[0].items[0].n");
      expect(paths).toContain("sections[0].items[0].responses[0].answer_source");
    }
  });

  it("reports exact field paths for invalid position, score_bands, form, and scaffold kind", () => {
    const page = makeValidPage();
    (page.sections[0].items[0].responses[0] as unknown as Record<string, unknown>).position =
      "margin";
    (page as unknown as Record<string, unknown>).score_bands = [[0, 0], [1, 2]];
    page.sections[0].items[1].form = null; // invalid because expr is not null
    (page.sections[0].scaffolds as unknown[]) = [{ kind: "custom_hint", applies_to: [1] }];

    const res = validateReferenceRecord(page);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const paths = res.errors.map((e) => e.path);
      expect(paths).toContain("sections[0].items[0].responses[0].position");
      expect(paths).toContain("score_bands");
      expect(paths).toContain("sections[0].items[1].form");
      expect(paths).toContain("sections[0].scaffolds[0].kind");
    }
  });

  it("requires unit on line_with_unit and non-null answer on computed source", () => {
    const page = makeValidPage();
    page.sections[0].items[0].responses = [
      { position: "line_with_unit", cue: null, answer: null, answer_source: "computed" },
    ];
    const res = validateReferenceRecord(page);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const paths = res.errors.map((e) => e.path);
      expect(paths).toContain("sections[0].items[0].responses[0].unit");
      expect(paths).toContain("sections[0].items[0].responses[0].answer");
    }
  });

  it("refuses invalid contents record fields with exact paths", () => {
    const contents = makeValidContents();
    contents.source_ref = "demo:Z:1a";
    contents.topics[0].sheets = [10, 5];
    contents.topics[1].n = 1; // not strictly ascending
    const res = validateReferenceRecord(contents);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const paths = res.errors.map((e) => e.path);
      expect(paths).toContain("source_ref");
      expect(paths).toContain("topics[0].sheets");
      expect(paths).toContain("topics[1].n");
    }
  });

  it("accepts an action item with expr: null and empty responses, but refuses empty responses when expr is non-null", () => {
    const page = makeValidPage();
    page.sections[0].items.push({
      n: 3,
      printed: "Read the rule aloud.",
      form: null,
      expr: null,
      responses: [],
    });
    expect(validateReferenceRecord(page).ok).toBe(true);

    const bad = makeValidPage();
    bad.sections[0].items[0].responses = [];
    const res = validateReferenceRecord(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.path === "sections[0].items[0].responses")).toBe(true);
    }
  });

  it("refuses a scaffold whose applies_to references item numbers absent from its section", () => {
    const page = makeValidPage();
    page.sections[0].scaffolds = [
      { kind: "answer_boxes", applies_to: [1, 9], box_count: 2 },
    ];
    const res = validateReferenceRecord(page);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.path === "sections[0].scaffolds[0].applies_to[1]")).toBe(
        true,
      );
    }
  });

  it("accepts score bands with unclear or not_stated endpoints and refuses invalid ones", () => {
    const page = makeValidPage();
    page.score_bands = [
      [0, 0],
      [1, "unclear"],
      ["unclear", 4],
      ["not_stated", "open"],
      ["unclear", "unclear"],
    ];
    expect(validateReferenceRecord(page).ok).toBe(true);

    const bad = makeValidPage();
    (bad.score_bands as unknown[]) = [[0, 0], [3, 2], [4, 5], [6, 7], [8, "open"]];
    const res = validateReferenceRecord(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.path === "score_bands[1][1]")).toBe(true);
    }
  });

  it("validates example steps and marks including contiguous n, shows_other rules, mark.step references, and optionality on older records", () => {
    const valid = makeValidPage();
    if (Array.isArray(valid.examples)) {
      valid.examples[0].steps = [
        { n: 1, shows: "setup", printed: "24 x 3" },
        { n: 2, shows: "carry", printed: "1", note: "Carry 1 to the tens place." },
        { n: 3, shows: "other", shows_other: "split into tens and ones", printed: "20 x 3 + 4 x 3" },
        { n: 4, shows: "not_stated", printed: "72" },
        { n: 5, shows: "unclear", printed: null, note: "unclear" },
      ];
      valid.examples[0].marks = [
        { kind: "arrow", step: 2, description: "Points from 12 to carried 1" },
        { kind: "helper_digit", step: 2 },
        { kind: "other", step: 3, description: "Dotted line separating tens and ones" },
        { kind: "unclear" },
      ];
    }
    expect(validateReferenceRecord(valid)).toEqual({ ok: true, record: valid });

    // Whole steps list may be unclear or empty
    const unclearSteps = makeValidPage();
    if (Array.isArray(unclearSteps.examples)) {
      unclearSteps.examples[0].steps = "unclear";
      unclearSteps.examples[0].marks = [];
    }
    expect(validateReferenceRecord(unclearSteps).ok).toBe(true);

    // Invalid step numbering, missing shows_other on other, forbidden shows_other on non-other, bad mark.step, missing mark.description on other
    const bad = makeValidPage();
    if (Array.isArray(bad.examples)) {
      (bad.examples[0] as unknown as Record<string, unknown>).steps = [
        { n: 2, shows: "other", printed: "10" }, // n must start at 1, missing shows_other
        { n: 3, shows: "carry", shows_other: "extra", printed: "1" }, // shows_other not allowed unless other
      ];
      (bad.examples[0] as unknown as Record<string, unknown>).marks = [
        { kind: "arrow", step: 99 }, // step 99 does not exist
        { kind: "other", step: 2 }, // missing description
      ];
    }
    const badRes = validateReferenceRecord(bad);
    expect(badRes.ok).toBe(false);
    if (!badRes.ok) {
      const paths = badRes.errors.map((e) => e.path);
      expect(paths).toContain("examples[0].steps[0].n");
      expect(paths).toContain("examples[0].steps[0].shows_other");
      expect(paths).toContain("examples[0].steps[1].shows_other");
      expect(paths).toContain("examples[0].marks[0].step");
      expect(paths).toContain("examples[0].marks[1].description");
    }
  });

  it("validates new practice hint scaffold kinds (helper_digit, partial_working, worked_item, other)", () => {
    const valid = makeValidPage();
    valid.sections[0].scaffolds = [
      { kind: "helper_digit", applies_to: [1], description: "Small carry box above tens" },
      { kind: "partial_working", applies_to: [1, 2], description: "First partial product printed" },
      { kind: "worked_item", applies_to: [2] },
      { kind: "other", applies_to: "all", description: "Shaded place-value column guide" },
    ];
    expect(validateReferenceRecord(valid).ok).toBe(true);

    const bad = makeValidPage();
    (bad.sections[0].scaffolds as unknown[]) = [
      { kind: "other", applies_to: [1] },
      { kind: "other", applies_to: [1], description: "   " },
      { kind: "helper_digit", applies_to: [1], description: "" },
    ];
    const res = validateReferenceRecord(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const paths = res.errors.map((e) => e.path);
      expect(paths).toContain("sections[0].scaffolds[0].description");
      expect(paths).toContain("sections[0].scaffolds[1].description");
      expect(paths).toContain("sections[0].scaffolds[2].description");
    }
  });
});
