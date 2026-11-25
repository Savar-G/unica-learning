import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateReferenceRecord, type ExamplePart, type ItemResponse, type PageItem, type PageRecord } from "@/lib/reference-record";
import {
  applyComputedAnswers,
  collectReadTimeAnswerConflicts,
  collectReadTimeUnclearAnswers,
  decimalPlacePower,
  findEmptyAnswers,
  isKnownPlaceName,
} from "./answers";
import { collectExampleAnswerConflicts, findExampleAnswerConflicts } from "./example-answers";

function makePageWithItem(item: PageRecord["sections"][0]["items"][0]): PageRecord {
  return {
    kind: "page",
    source_ref: "sample:M:3a",
    topic: { title: "Division Practice", number: 1 },
    sections: [
      {
        instruction: "Solve each problem.",
        scaffolds: [],
        items: [item],
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
  };
}

describe("applyComputedAnswers", () => {
  it("never writes an answer into work_area or checkbox and keeps remainder as one string", () => {
    const page = makePageWithItem({
      n: 1,
      printed: "13 / 3 =",
      form: "horizontal",
      expr: { kind: "arith", op: "div", operands: [13, 3] },
      responses: [
        { position: "after_equals", cue: null, answer: "4 R1", answer_source: "reader" },
        { position: "work_area", cue: null, answer: null, answer_source: "unchecked" },
        { position: "checkbox", cue: "checked", answer: null, answer_source: "unchecked" },
      ],
    });

    const { record, notes } = applyComputedAnswers(page);
    expect(record.kind).toBe("page");
    if (record.kind !== "page") return;
    const responses = record.sections[0].items[0].responses;
    expect(responses[0]).toEqual({
      position: "after_equals",
      cue: null,
      answer: "4 R1",
      answer_source: "computed",
    });
    expect(responses[1]).toEqual({
      position: "work_area",
      cue: null,
      answer: null,
      answer_source: "unchecked",
    });
    expect(responses[2]).toEqual({
      position: "checkbox",
      cue: "checked",
      answer: null,
      answer_source: "unchecked",
    });
    expect(notes).toEqual([]);
  });

  it("keeps reader answers and adds a note when a division has two answer-bearing responses", () => {
    const page = makePageWithItem({
      n: 2,
      printed: "13 / 3 =",
      form: "horizontal",
      expr: { kind: "arith", op: "div", operands: [13, 3] },
      responses: [
        { position: "box", cue: "Q", answer: "4", answer_source: "reader" },
        { position: "box", cue: "R", answer: "1", answer_source: "reader" },
      ],
    });

    const { record, notes } = applyComputedAnswers(page);
    if (record.kind !== "page") return;
    const responses = record.sections[0].items[0].responses;
    expect(responses[0].answer).toBe("4");
    expect(responses[0].answer_source).toBe("reader");
    expect(responses[1].answer).toBe("1");
    expect(responses[1].answer_source).toBe("reader");
    expect(notes.length).toBe(1);
    expect(notes[0]).toContain("4 R1");
  });

  it("fills multi-value answers only into answer-bearing responses while leaving work_area untouched", () => {
    const page = makePageWithItem({
      n: 3,
      printed: "2, _, 6, _",
      form: "horizontal",
      expr: { kind: "chain", terms: [2, null, 6, null], step: 2 },
      responses: [
        { position: "box", cue: null, answer: "4", answer_source: "reader" },
        { position: "work_area", cue: null, answer: null, answer_source: "unchecked" },
        { position: "box", cue: null, answer: "9", answer_source: "reader" },
      ],
    });

    const { record, notes } = applyComputedAnswers(page);
    if (record.kind !== "page") return;
    const responses = record.sections[0].items[0].responses;
    expect(responses[0].answer).toBe("4");
    expect(responses[0].answer_source).toBe("computed");
    expect(responses[1]).toEqual({
      position: "work_area",
      cue: null,
      answer: null,
      answer_source: "unchecked",
    });
    expect(responses[2].answer).toBe("8");
    expect(responses[2].answer_source).toBe("computed");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("9");
    expect(notes[0]).toContain("8");
  });

  it("writes one computed value into every answer place that has no place name (equation box and answer line)", () => {
    const page = makePageWithItem({
      n: 4,
      printed: "Sample word problem",
      form: "horizontal",
      expr: {
        kind: "word",
        text: "Sample word problem",
        expr: { kind: "arith", op: "mul", operands: [6, 4] },
        unit: "cards",
      },
      responses: [
        { position: "box", cue: null, answer: null, answer_source: "unchecked" },
        { position: "line_with_unit", cue: "Ans.", answer: "24", answer_source: "reader", unit: "cards" },
        { position: "work_area", cue: null, answer: null, answer_source: "unchecked" },
      ],
    });
    const { record, details } = applyComputedAnswers(page);
    if (record.kind !== "page") throw new Error("page expected");
    const responses = record.sections[0].items[0].responses;
    expect(responses.map((r) => [r.answer, r.answer_source])).toEqual([
      ["24", "computed"],
      ["24", "computed"],
      [null, "unchecked"],
    ]);
    expect(details).toEqual([]);

    // A stored answer that is not the value: the places may be digit boxes, so all answers stay.
    const differing = structuredClone(page);
    differing.sections[0].items[0].responses[1].answer = "25";
    const kept = applyComputedAnswers(differing);
    if (kept.record.kind !== "page") throw new Error("page expected");
    expect(kept.record.sections[0].items[0].responses).toEqual(differing.sections[0].items[0].responses);
    expect(kept.details.map((d) => d.kind)).toEqual(["places_do_not_fit"]);
  });

  it("digit boxes with no place: uses the places of an answer_boxes scaffold, or keeps the answers when a scaffold prints several boxes", () => {
    const digitBoxes = (answers: Array<string | null>): ItemResponse[] =>
      answers.map((answer) => ({
        position: "box",
        cue: null,
        answer,
        answer_source: answer === null ? "unchecked" : "reader",
      }));
    for (const appliesTo of [[1], "all"] as const) {
      const page = makePageWithItem({
        n: 1,
        printed: "12 + 3",
        form: "vertical",
        expr: { kind: "arith", op: "add", operands: [12, 3] },
        responses: digitBoxes(["1", "5"]),
      });
      page.sections[0].scaffolds = [
        { kind: "answer_boxes", applies_to: appliesTo === "all" ? "all" : [...appliesTo], places: ["tens", "ones"] },
      ];
      const { record, details } = applyComputedAnswers(page);
      if (record.kind !== "page") throw new Error("page expected");
      const out = record.sections[0].items[0].responses;
      expect(out.map((r) => [r.answer, r.answer_source]), String(appliesTo)).toEqual([
        ["1", "computed"],
        ["5", "computed"],
      ]);
      // The scaffold places are used, not written into the record.
      expect(out.every((r) => r.place === undefined)).toBe(true);
      expect(details).toEqual([]);
    }

    // Some boxes name their place: the scaffold fills the missing names when the present ones agree.
    const partlyNamed = (tensPlace: string) => {
      const page = makePageWithItem({
        n: 1,
        printed: "12 + 3",
        form: "vertical",
        expr: { kind: "arith", op: "add", operands: [12, 3] },
        responses: [
          { position: "box", cue: null, answer: "1", answer_source: "reader", place: tensPlace },
          { position: "box", cue: null, answer: "4", answer_source: "reader" },
        ],
      });
      page.sections[0].scaffolds = [{ kind: "answer_boxes", applies_to: [1], places: ["tens", "ones"] }];
      return page;
    };
    const agreed = applyComputedAnswers(partlyNamed("tens"));
    if (agreed.record.kind !== "page") throw new Error("page expected");
    expect(agreed.record.sections[0].items[0].responses.map((r) => [r.answer, r.answer_source, r.place])).toEqual([
      ["1", "computed", "tens"],
      ["5", "computed", undefined],
    ]);
    expect(agreed.notes).toEqual(['sections[0].items[n=1].responses[1]: reader gave "4", computed "5"']);
    const disagreeing = partlyNamed("ones");
    const keptAnswers = applyComputedAnswers(disagreeing);
    if (keptAnswers.record.kind !== "page") throw new Error("page expected");
    expect(keptAnswers.record.sections[0].items[0].responses).toEqual(disagreeing.sections[0].items[0].responses);
    expect(keptAnswers.details.map((d) => d.kind)).toEqual(["places_do_not_fit"]);

    const boxCountOnly = makePageWithItem({
      n: 1,
      printed: "12 + 3",
      form: "vertical",
      expr: { kind: "arith", op: "add", operands: [12, 3] },
      responses: digitBoxes([null, null]),
    });
    boxCountOnly.sections[0].scaffolds = [{ kind: "answer_boxes", applies_to: [1], box_count: 2 }];
    const kept = applyComputedAnswers(boxCountOnly);
    if (kept.record.kind !== "page") throw new Error("page expected");
    expect(kept.record.sections[0].items[0].responses).toEqual(boxCountOnly.sections[0].items[0].responses);
    expect(kept.details.map((d) => d.kind)).toEqual(["places_do_not_fit"]);
  });

  it("one box with a decimal place gets the digit of that place, and a leading 0 in an unreached place is correct", () => {
    const oneBox = (operands: number[], place: string, answer: string) =>
      makePageWithItem({
        n: 1,
        printed: "sample",
        form: "vertical",
        expr: { kind: "arith", op: "add", operands },
        responses: [{ position: "box", cue: null, answer, answer_source: "reader", place }],
      });
    for (const [operands, place, answer] of [[[10, 5], "ones", "5"], [[15, 30], "tens", "4"]] as const) {
      const { record, details } = applyComputedAnswers(oneBox([...operands], place, answer));
      if (record.kind !== "page") throw new Error("page expected");
      expect(record.sections[0].items[0].responses[0].answer).toBe(answer);
      expect(record.sections[0].items[0].responses[0].answer_source).toBe("computed");
      expect(details).toEqual([]);
    }

    const zero = makePageWithItem({
      n: 1,
      printed: "23 x 3",
      form: "vertical",
      expr: { kind: "arith", op: "mul", operands: [23, 3] },
      responses: [
        { position: "box", cue: null, answer: "0", answer_source: "printed", place: "hundreds" },
        { position: "box", cue: null, answer: "6", answer_source: "reader", place: "tens" },
        { position: "box", cue: null, answer: "9", answer_source: "reader", place: "ones" },
      ],
    });
    expect(applyComputedAnswers(zero).details).toEqual([]);
  });

  it("treats remainder answers written with or without spaces and in either case as equal", () => {
    for (const answer of ["4r1", "4 r 1", "4 R1", "4R1"]) {
      const page = makePageWithItem({
        n: 1,
        printed: "13 / 3",
        form: "horizontal",
        expr: { kind: "arith", op: "div", operands: [13, 3] },
        responses: [{ position: "after_equals", cue: null, answer, answer_source: "reader" }],
      });
      expect(applyComputedAnswers(page).details, answer).toEqual([]);
    }
  });

  it("treats a whole number with thousands separators as the same number", () => {
    const pageWith = (answer: string) =>
      makePageWithItem({
        n: 1,
        printed: "750 + 250",
        form: "horizontal",
        expr: { kind: "arith", op: "add", operands: [750, 250] },
        responses: [{ position: "after_equals", cue: null, answer, answer_source: "reader" }],
      });
    expect(applyComputedAnswers(pageWith("1,000")).details).toEqual([]);
    expect(applyComputedAnswers(pageWith("1,001")).details.map((d) => d.kind)).toEqual(["answer_differs"]);
  });

  it("never copies the quotient of an exact division into a second unnamed place (it can be a remainder place)", () => {
    const page = makePageWithItem({
      n: 1,
      printed: "40 / 4",
      form: "horizontal",
      expr: { kind: "arith", op: "div", operands: [40, 4] },
      responses: [
        { position: "after_equals", cue: null, answer: "10", answer_source: "reader" },
        { position: "after_equals", cue: "R", answer: null, answer_source: "unchecked" },
      ],
    });
    const { record, details } = applyComputedAnswers(page);
    expect(record).toEqual(page);
    expect(details.map((d) => d.kind)).toEqual(["places_do_not_fit"]);
    expect(findEmptyAnswers(record)).toEqual(["sections[0].items[n=1].responses[1]"]);
  });

  it("keeps the reader answer of a word problem with a division that is not exact", () => {
    const page = makePageWithItem({
      n: 1,
      printed: "Sample sharing problem",
      form: "horizontal",
      expr: { kind: "word", text: "Sample sharing problem", expr: { kind: "arith", op: "div", operands: [7, 2] } },
      responses: [{ position: "after_equals", cue: null, answer: "3.5", answer_source: "reader" }],
    });
    const { record, details } = applyComputedAnswers(page);
    expect(record).toEqual(page);
    expect(details).toEqual([]);
    expect(findEmptyAnswers(record)).toEqual([]);

    page.sections[0].items[0].responses[0] = { position: "after_equals", cue: null, answer: null, answer_source: "unchecked" };
    expect(applyComputedAnswers(page).details).toEqual([]);
    expect(findEmptyAnswers(page)).toEqual(["sections[0].items[n=1].responses[0]"]);
  });

  it("writes one digit into each named decimal place and notes a higher place that the value does not reach", () => {
    const page = makePageWithItem({
      n: 5,
      printed: "23 x 3",
      form: "vertical",
      expr: { kind: "arith", op: "mul", operands: [23, 3] },
      responses: [
        { position: "box", cue: null, answer: null, answer_source: "unchecked", place: "hundreds" },
        { position: "box", cue: null, answer: "6", answer_source: "reader", place: "Tens" },
        { position: "box", cue: null, answer: null, answer_source: "unchecked", place: "ones place" },
      ],
    });
    const { record, details } = applyComputedAnswers(page);
    if (record.kind !== "page") throw new Error("page expected");
    const responses = record.sections[0].items[0].responses;
    expect(responses[0]).toEqual(page.sections[0].items[0].responses[0]);
    expect(responses.slice(1).map((r) => [r.answer, r.answer_source])).toEqual([
      ["6", "computed"],
      ["9", "computed"],
    ]);
    expect(details).toEqual([
      expect.objectContaining({ kind: "place_not_reached", path: "sections[0].items[n=5].responses[0]" }),
    ]);
    // The unreached place may stay empty: it is not an empty answer.
    expect(findEmptyAnswers(record)).toEqual([]);
  });

  it("keeps reader answers when the answer places are ambiguous", () => {
    const box = (place?: string | null): ItemResponse => ({
      position: "box",
      cue: null,
      answer: "1",
      answer_source: "reader",
      ...(place === undefined ? {} : { place }),
    });
    const cases: Array<{ name: string; expr: PageItem["expr"]; responses: ItemResponse[] }> = [
      { name: "mixed place and no place", expr: { kind: "arith", op: "add", operands: [7, 5] }, responses: [box("tens"), box(null)] },
      { name: "unknown place name", expr: { kind: "arith", op: "add", operands: [7, 5] }, responses: [box("tens"), box("quotient")] },
      { name: "duplicate place", expr: { kind: "arith", op: "add", operands: [7, 5] }, responses: [box("ones"), box("ones")] },
      { name: "value longer than the places", expr: { kind: "arith", op: "mul", operands: [50, 3] }, responses: [box("tens"), box("ones")] },
      { name: "remainder in named places", expr: { kind: "arith", op: "div", operands: [13, 3] }, responses: [box("tens"), box("ones")] },
      { name: "remainder in unnamed places", expr: { kind: "arith", op: "div", operands: [13, 3] }, responses: [box(), box()] },
      { name: "negative value", expr: { kind: "arith", op: "sub", operands: [3, 15] }, responses: [box("tens"), box("ones")] },
    ];
    for (const c of cases) {
      const page = makePageWithItem({ n: 6, printed: "sample", form: "vertical", expr: c.expr, responses: c.responses });
      const { record, details } = applyComputedAnswers(page);
      if (record.kind !== "page") throw new Error("page expected");
      expect(record.sections[0].items[0].responses, c.name).toEqual(c.responses);
      expect(details.map((d) => d.kind), c.name).toEqual(["places_do_not_fit"]);
    }
  });

  it("knows the decimal place names in the forms that readers write, including fractional places for isKnownPlaceName only", () => {
    expect(["ones", "One", "ones place", "units"].map(decimalPlacePower)).toEqual([0, 0, 0, 0]);
    expect(["tens", "tens digit", "hundreds", "thousands"].map(decimalPlacePower)).toEqual([1, 1, 2, 3]);
    expect(["ten thousands", "ten_thousands", "Ten-Thousands"].map(decimalPlacePower)).toEqual([4, 4, 4]);
    expect(["quotient", "second factor", "fourth", "tenths", "hundredths", "thousandths", null, undefined].map(decimalPlacePower)).toEqual([
      null, null, null, null, null, null, null, null,
    ]);
    expect(
      [
        "ones",
        "tens digit",
        "ten thousands",
        "tenth",
        "tenths",
        "tenths place",
        "hundredth",
        "hundredths",
        "hundredths digit",
        "thousandth",
        "thousandths",
        "thousandths place",
        "ten-thousandths",
      ].every(isKnownPlaceName),
    ).toBe(true);
    expect(["numerator", "denominator", "top box", "quotient", null, undefined].some(isKnownPlaceName)).toBe(false);
  });

  it("property: digits written by place read back as the computed value, and unnamed places all get the value", () => {
    const placeNames = ["ones", "tens", "hundreds", "thousands", "ten thousands"];
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 99999 }),
        fc.integer({ min: 1, max: 99999 }),
        fc.integer({ min: 0, max: 4 }),
        (a, b, extra) => {
          const value = String(a + b);
          const placeCount = Math.min(5, value.length + extra);
          if (value.length > placeCount) return;
          // Highest place first, as printed.
          const responses: ItemResponse[] = placeNames
            .slice(0, placeCount)
            .reverse()
            .map((place) => ({ position: "box", cue: null, answer: null, answer_source: "unchecked", place }));
          const page = makePageWithItem({
            n: 1,
            printed: "sample",
            form: "vertical",
            expr: { kind: "arith", op: "add", operands: [a, b] },
            responses,
          });
          const { record, details } = applyComputedAnswers(page);
          if (record.kind !== "page") throw new Error("page expected");
          const out = record.sections[0].items[0].responses;
          const filled = out.filter((r) => r.answer_source === "computed");
          expect(filled.map((r) => r.answer).join("")).toBe(value);
          expect(filled.every((r) => /^\d$/.test(String(r.answer)))).toBe(true);
          expect(details.every((d) => d.kind === "place_not_reached")).toBe(true);
          expect(details).toHaveLength(placeCount - value.length);

          const unnamed = makePageWithItem({
            n: 1,
            printed: "sample",
            form: "horizontal",
            expr: { kind: "arith", op: "add", operands: [a, b] },
            responses: responses.map((r) => ({ ...r, place: null })),
          });
          const unnamedOut = applyComputedAnswers(unnamed).record;
          if (unnamedOut.kind !== "page") throw new Error("page expected");
          expect(unnamedOut.sections[0].items[0].responses.every((r) => r.answer === value)).toBe(true);
        },
      ),
    );
  });

  it("keeps a printed answer and its source, and notes a printed answer that differs from the computed value", () => {
    const page = makePageWithItem({
      n: 7,
      printed: "8 + 5",
      form: "vertical",
      expr: { kind: "arith", op: "add", operands: [8, 5] },
      responses: [
        { position: "box", cue: null, answer: "1", answer_source: "printed", place: "tens" },
        { position: "box", cue: null, answer: "4", answer_source: "printed", place: "ones" },
      ],
    });
    const { record, details } = applyComputedAnswers(page);
    if (record.kind !== "page") throw new Error("page expected");
    expect(record.sections[0].items[0].responses).toEqual(page.sections[0].items[0].responses);
    expect(details).toEqual([
      {
        kind: "answer_differs",
        path: "sections[0].items[n=7].responses[1]",
        message: 'sections[0].items[n=7].responses[1]: page prints "4", computed "3"',
      },
    ]);
  });

  it("finds answer places of question items that hold no answer and no unclear marker", () => {
    const page = makePageWithItem({
      n: 8,
      printed: "sample",
      form: "horizontal",
      expr: { kind: "notation", latex: "x + 2 = 5" },
      responses: [
        { position: "box", cue: null, answer: null, answer_source: "unchecked" },
        { position: "box", cue: null, answer: " ", answer_source: "reader" },
        { position: "box", cue: null, answer: "unclear", answer_source: "reader" },
        { position: "work_area", cue: null, answer: null, answer_source: "unchecked" },
        { position: "checkbox", cue: null, answer: null, answer_source: "unchecked" },
      ],
    });
    page.sections[0].items.push({
      n: 9,
      printed: "Read the table aloud.",
      form: null,
      expr: null,
      responses: [{ position: "box", cue: null, answer: null, answer_source: "unchecked" }],
    });
    expect(findEmptyAnswers(page)).toEqual([
      "sections[0].items[n=8].responses[0]",
      "sections[0].items[n=8].responses[1]",
    ]);
  });

  it("treats a sole work_area on a question item as answer-bearing while keeping a work_area beside another response non-answer-bearing", () => {
    const notationOpenSpace = makePageWithItem({
      n: 1,
      printed: "Simplify 4/6",
      form: "horizontal",
      expr: { kind: "notation", latex: "\\frac{4}{6}" },
      responses: [{ position: "work_area", cue: null, answer: "2/3", answer_source: "reader" }],
    });
    expect(validateReferenceRecord(notationOpenSpace).ok).toBe(true);
    const notationResult = applyComputedAnswers(notationOpenSpace);
    expect(notationResult.record).toEqual(notationOpenSpace);
    expect(notationResult.details).toEqual([]);
    expect(findEmptyAnswers(notationResult.record)).toEqual([]);

    // A sole work_area left null on a non-computable item is reported as an empty answer; "unclear" is not.
    const emptyWorkArea = makePageWithItem({
      n: 1,
      printed: "Simplify 4/6",
      form: "horizontal",
      expr: { kind: "notation", latex: "\\frac{4}{6}" },
      responses: [{ position: "work_area", cue: null, answer: null, answer_source: "unchecked" }],
    });
    expect(validateReferenceRecord(emptyWorkArea).ok).toBe(true);
    expect(findEmptyAnswers(emptyWorkArea)).toEqual(["sections[0].items[n=1].responses[0]"]);
    emptyWorkArea.sections[0].items[0].responses[0].answer = "unclear";
    expect(findEmptyAnswers(emptyWorkArea)).toEqual([]);

    // A sole work_area on a computable item receives the computed answer with no places_do_not_fit note.
    const arithOpenSpace = makePageWithItem({
      n: 2,
      printed: "12 + 5",
      form: "horizontal",
      expr: { kind: "arith", op: "add", operands: [12, 5] },
      responses: [{ position: "work_area", cue: null, answer: null, answer_source: "unchecked" }],
    });
    expect(validateReferenceRecord(arithOpenSpace).ok).toBe(true);
    const arithResult = applyComputedAnswers(arithOpenSpace);
    if (arithResult.record.kind !== "page") throw new Error("page expected");
    expect(arithResult.record.sections[0].items[0].responses).toEqual([
      { position: "work_area", cue: null, answer: "17", answer_source: "computed" },
    ]);
    expect(arithResult.details).toEqual([]);
    expect(validateReferenceRecord(arithResult.record).ok).toBe(true);
    expect(findEmptyAnswers(arithResult.record)).toEqual([]);

    // A work_area alongside another response stays non-answer-bearing.
    const placeAndWorkArea = makePageWithItem({
      n: 3,
      printed: "12 + 5 = ___",
      form: "horizontal",
      expr: { kind: "arith", op: "add", operands: [12, 5] },
      responses: [
        { position: "work_area", cue: null, answer: null, answer_source: "unchecked" },
        { position: "after_equals", cue: "Ans.", answer: "17", answer_source: "reader" },
      ],
    });
    expect(validateReferenceRecord(placeAndWorkArea).ok).toBe(true);
    const pairedResult = applyComputedAnswers(placeAndWorkArea);
    if (pairedResult.record.kind !== "page") throw new Error("page expected");
    expect(pairedResult.record.sections[0].items[0].responses).toEqual([
      { position: "work_area", cue: null, answer: null, answer_source: "unchecked" },
      { position: "after_equals", cue: "Ans.", answer: "17", answer_source: "computed" },
    ]);
    expect(pairedResult.details).toEqual([]);
    expect(findEmptyAnswers(pairedResult.record)).toEqual([]);
  });

  it("keeps the stored answer for a sole work_area on an inexact division while still computing exact results", () => {
    const decimalDiv = makePageWithItem({
      n: 1,
      printed: "7 / 2",
      form: "horizontal",
      expr: { kind: "arith", op: "div", operands: [7, 2] },
      responses: [{ position: "work_area", cue: null, answer: "3.5", answer_source: "reader" }],
    });
    const decimalOut = applyComputedAnswers(decimalDiv);
    expect(decimalOut.record).toEqual(decimalDiv);
    expect(decimalOut.details).toEqual([]);
    expect(findEmptyAnswers(decimalOut.record)).toEqual([]);

    // An empty sole work_area on an inexact division stays null and still counts as an empty answer.
    const emptyInexactDiv = makePageWithItem({
      n: 1,
      printed: "7 / 2",
      form: "horizontal",
      expr: { kind: "arith", op: "div", operands: [7, 2] },
      responses: [{ position: "work_area", cue: null, answer: null, answer_source: "unchecked" }],
    });
    const emptyOut = applyComputedAnswers(emptyInexactDiv);
    expect(emptyOut.record).toEqual(emptyInexactDiv);
    expect(emptyOut.details).toEqual([]);
    expect(findEmptyAnswers(emptyOut.record)).toEqual(["sections[0].items[n=1].responses[0]"]);

    // Exact division and exact addition in a sole work_area still compute and flag wrong stored answers.
    const exactDiv = makePageWithItem({
      n: 2,
      printed: "8 / 2",
      form: "horizontal",
      expr: { kind: "arith", op: "div", operands: [8, 2] },
      responses: [{ position: "work_area", cue: null, answer: null, answer_source: "unchecked" }],
    });
    const exactDivOut = applyComputedAnswers(exactDiv);
    if (exactDivOut.record.kind !== "page") throw new Error("page expected");
    expect(exactDivOut.record.sections[0].items[0].responses).toEqual([
      { position: "work_area", cue: null, answer: "4", answer_source: "computed" },
    ]);
    expect(exactDivOut.details).toEqual([]);

    const wrongSum = makePageWithItem({
      n: 3,
      printed: "2 + 3",
      form: "horizontal",
      expr: { kind: "arith", op: "add", operands: [2, 3] },
      responses: [{ position: "work_area", cue: null, answer: "6", answer_source: "reader" }],
    });
    const wrongSumOut = applyComputedAnswers(wrongSum);
    expect(wrongSumOut.details.map((d) => d.kind)).toEqual(["answer_differs"]);
  });

  it("extracts read-time answer_differs entries labelled by reader with values from structured details or legacy note text", () => {
    expect(
      collectReadTimeAnswerConflicts("a", [], [
        { kind: "places_do_not_fit", path: "sections[0].items[n=1]" },
        { kind: "place_not_reached", path: "sections[0].items[n=2].responses[0]" },
        { kind: "answer_differs", path: "sections[0].items[n=3].responses[0]" },
        { kind: "answer_differs", path: "sections[0].items[n=3].responses[0]" },
      ]),
    ).toEqual(["reader a: sections[0].items[n=3].responses[0]"]);

    expect(
      collectReadTimeAnswerConflicts(
        "b",
        ['sections[0].items[n=3].responses[0]: reader gave "7", computed "5"'],
        [{ kind: "answer_differs", path: "sections[0].items[n=3].responses[0]" }],
      ),
    ).toEqual(['reader b: sections[0].items[n=3].responses[0]: reader gave "7", computed "5"']);

    // When structured details are present and empty, legacy notes are not re-parsed.
    expect(
      collectReadTimeAnswerConflicts(
        "a",
        ['sections[0].items[n=1].responses[0]: reader gave "3", computed "2"'],
        [],
      ),
    ).toEqual([]);

    // Legacy fallback (details omitted) parses exact answers.ts answer_differs formats only.
    expect(
      collectReadTimeAnswerConflicts("b", [
        'sections[0].items[n=1].responses[0]: reader gave "3", computed "2"',
        'sections[0].items[n=2].responses[1]: page prints "9", computed "8"',
        'sections[0].items[n=3].responses[0]: record holds "7", computed "6"',
        'sections[0].items[n=4].responses[0]: place "hundreds" holds "1", but the computed value does not reach this place',
        'sections[0].items[n=5].responses[0]: the computed value does not reach place "hundreds"; kept as it is',
        'sections[0].items[n=6]: computed single answer "5" but it does not fit the 2 answer-bearing response(s); kept reader answers',
        "unrelated freeform text",
      ]),
    ).toEqual([
      'reader b: sections[0].items[n=1].responses[0]: reader gave "3", computed "2"',
      'reader b: sections[0].items[n=2].responses[1]: page prints "9", computed "8"',
      'reader b: sections[0].items[n=3].responses[0]: record holds "7", computed "6"',
      'reader b: sections[0].items[n=4].responses[0]: place "hundreds" holds "1", but the computed value does not reach this place',
    ]);
  });

  it("records unclear_filled when computation replaces an unclear answer, not when it fills an empty place", () => {
    const pageWith = (answer: string | null) =>
      makePageWithItem({
        n: 1,
        printed: "1 + 1 =",
        form: "horizontal",
        expr: { kind: "arith", op: "add", operands: [1, 1] },
        responses: [
          {
            position: "after_equals",
            cue: null,
            answer,
            answer_source: answer === null ? "unchecked" : "reader",
          },
        ],
      });

    const unclearOut = applyComputedAnswers(pageWith("unclear"));
    if (unclearOut.record.kind !== "page") throw new Error("page expected");
    expect(unclearOut.record.sections[0].items[0].responses[0]).toEqual({
      position: "after_equals",
      cue: null,
      answer: "2",
      answer_source: "computed",
    });
    expect(unclearOut.details).toEqual([
      {
        kind: "unclear_filled",
        path: "sections[0].items[n=1].responses[0]",
        message: 'sections[0].items[n=1].responses[0]: reader marked "unclear", computed "2"',
      },
    ]);

    for (const empty of [null, "", "   "]) {
      const emptyOut = applyComputedAnswers(pageWith(empty));
      if (emptyOut.record.kind !== "page") throw new Error("page expected");
      expect(emptyOut.record.sections[0].items[0].responses[0].answer).toBe("2");
      expect(emptyOut.details).toEqual([]);
    }

    expect(
      collectReadTimeUnclearAnswers("a", [
        { kind: "answer_differs", path: "sections[0].items[n=1].responses[0]" },
        { kind: "unclear_filled", path: "sections[0].items[n=2].responses[0]" },
        { kind: "unclear_filled", path: "sections[0].items[n=2].responses[0]" },
        { kind: "places_do_not_fit", path: "sections[0].items[n=3]" },
      ]),
    ).toEqual(["reader a: sections[0].items[n=2].responses[0].answer"]);

    expect(
      collectReadTimeUnclearAnswers("b", [
        { kind: "unclear_filled", path: "sections[0].items[n=2].responses[0]" },
      ]),
    ).toEqual(["reader b: sections[0].items[n=2].responses[0].answer"]);

    // Legacy runs without note_details have no text fallback for unclear_filled.
    expect(collectReadTimeUnclearAnswers("b", undefined)).toEqual([]);
  });

  it("checks worked-example part shown_answer against computable single-answer expr without mutating it", () => {
    const pageWithPart = (part: ExamplePart): PageRecord => ({
      ...makePageWithItem({
        n: 1,
        printed: "1 + 1 =",
        form: "horizontal",
        expr: { kind: "arith", op: "add", operands: [1, 1] },
        responses: [{ position: "after_equals", cue: null, answer: "2", answer_source: "computed" }],
      }),
      examples: [{ position: "top", relation: "compare", parts: [part] }],
    });

    const cases: Array<{ label: string; part: ExamplePart; expectConflict: boolean }> = [
      {
        label: "matching arith",
        part: { form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: "5" },
        expectConflict: false,
      },
      {
        label: "thousands separator equal",
        part: { form: "horizontal", expr: { kind: "arith", op: "add", operands: [500, 500] }, shown_answer: "1,000" },
        expectConflict: false,
      },
      {
        label: "remainder form 4r1 equal",
        part: { form: "horizontal", expr: { kind: "arith", op: "div", operands: [13, 3] }, shown_answer: "4r1" },
        expectConflict: false,
      },
      {
        label: "remainder form 4 r 1 equal",
        part: { form: "horizontal", expr: { kind: "arith", op: "div", operands: [13, 3] }, shown_answer: "4 r 1" },
        expectConflict: false,
      },
      {
        label: "missing expr matching",
        part: { form: "horizontal", expr: { kind: "missing", op: "add", operands: [3, null], result: 7 }, shown_answer: "4" },
        expectConflict: false,
      },
      {
        label: "notation expr skipped",
        part: { form: "horizontal", expr: { kind: "notation", latex: "x + 2 = 5" }, shown_answer: "99" },
        expectConflict: false,
      },
      {
        label: "null expr skipped",
        part: { form: "horizontal", expr: null, shown_answer: "5" },
        expectConflict: false,
      },
      {
        label: "shown_answer absent",
        part: { form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] } },
        expectConflict: false,
      },
      {
        label: "shown_answer null",
        part: { form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: null },
        expectConflict: false,
      },
      {
        label: "shown_answer blank",
        part: { form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: "   " },
        expectConflict: false,
      },
      {
        label: "shown_answer not_stated",
        part: { form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: "not_stated" },
        expectConflict: false,
      },
      {
        label: "shown_answer unclear",
        part: { form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: "unclear" },
        expectConflict: false,
      },
      {
        label: "conflicting linked pair",
        part: {
          form: "horizontal",
          expr: {
            kind: "linked",
            pair: [
              { kind: "arith", op: "add", operands: [1, 2] },
              { kind: "arith", op: "add", operands: [2, 3] },
            ],
          },
          shown_answer: "99",
        },
        expectConflict: true,
      },
      {
        label: "conflicting chain",
        part: {
          form: "horizontal",
          expr: { kind: "chain", terms: [2, 4, null, 8] },
          shown_answer: "99",
        },
        expectConflict: true,
      },
      {
        label: "word inexact division skipped",
        part: {
          form: "horizontal",
          expr: { kind: "word", text: "Share 7", expr: { kind: "arith", op: "div", operands: [7, 2] } },
          shown_answer: "3.5",
        },
        expectConflict: false,
      },
      {
        label: "conflicting arith",
        part: { form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: "6" },
        expectConflict: true,
      },
      {
        label: "conflicting remainder",
        part: { form: "horizontal", expr: { kind: "arith", op: "div", operands: [13, 3] }, shown_answer: "4 R2" },
        expectConflict: true,
      },
      {
        label: "conflicting missing expr",
        part: { form: "horizontal", expr: { kind: "missing", op: "add", operands: [3, null], result: 7 }, shown_answer: "5" },
        expectConflict: true,
      },
      {
        label: "conflicting word expr with exact inner arith",
        part: {
          form: "horizontal",
          expr: { kind: "word", text: "Sum 2 and 3", expr: { kind: "arith", op: "add", operands: [2, 3] } },
          shown_answer: "6",
        },
        expectConflict: true,
      },
    ];

    for (const c of cases) {
      const page = pageWithPart(c.part);
      const snapshot = structuredClone(page);
      const conflicts = findExampleAnswerConflicts(page);
      expect(page, c.label).toEqual(snapshot);
      if (c.expectConflict) {
        expect(conflicts, c.label).toHaveLength(1);
        expect(conflicts[0].kind, c.label).toBe("answer_differs");
        expect(conflicts[0].path, c.label).toBe("examples[0].parts[0].shown_answer");
      } else {
        expect(conflicts, c.label).toEqual([]);
      }
    }

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 1, max: 99 }),
        (x, y, delta) => {
          const sum = x + y;
          const formatted = sum.toLocaleString("en-US");
          const okPage = pageWithPart({
            form: "horizontal",
            expr: { kind: "arith", op: "add", operands: [x, y] },
            shown_answer: formatted,
          });
          expect(findExampleAnswerConflicts(okPage)).toEqual([]);

          const badPage = pageWithPart({
            form: "horizontal",
            expr: { kind: "arith", op: "add", operands: [x, y] },
            shown_answer: String(sum + delta),
          });
          expect(findExampleAnswerConflicts(badPage)).toHaveLength(1);
        },
      ),
    );
  });

  it("lists final record, reader b, and (only when final is not fresh reader A) reader a worked-example conflicts without computed-identity deduplication", () => {
    const makeExPage = (examples: PageRecord["examples"]): PageRecord => ({
      ...makePageWithItem({
        n: 1,
        printed: "1 + 1 =",
        form: "horizontal",
        expr: { kind: "arith", op: "add", operands: [1, 1] },
        responses: [{ position: "after_equals", cue: null, answer: "2", answer_source: "computed" }],
      }),
      examples,
    });
    const ex = (a: number, b: number, shown: string, label?: string) => ({
      position: "top" as const,
      relation: "compare" as const,
      ...(label ? { label } : {}),
      parts: [
        {
          form: "horizontal" as const,
          expr: { kind: "arith" as const, op: "add" as const, operands: [a, b] },
          shown_answer: shown,
        },
      ],
    });

    const cases: Array<{
      label: string;
      finalIsFreshA: boolean;
      finalRec: PageRecord | null;
      recA: PageRecord;
      recB: PageRecord;
      expectedFinal: string[];
      expectedReader: string[];
    }> = [
      {
        label: "A only (fresh final = A)",
        finalIsFreshA: true,
        finalRec: makeExPage([ex(2, 3, "6")]),
        recA: makeExPage([ex(2, 3, "6")]),
        recB: makeExPage([ex(2, 4, "6")]),
        expectedFinal: ['final record: examples[0].parts[0].shown_answer: shown "6", computed "5"'],
        expectedReader: [],
      },
      {
        label: "B only (fresh final = A)",
        finalIsFreshA: true,
        finalRec: makeExPage([ex(2, 4, "6")]),
        recA: makeExPage([ex(2, 4, "6")]),
        recB: makeExPage([ex(2, 3, "6")]),
        expectedFinal: [],
        expectedReader: ['reader b: examples[0].parts[0].shown_answer: shown "6", computed "5"'],
      },
      {
        label: "both the same (fresh final = A): final and reader b both listed",
        finalIsFreshA: true,
        finalRec: makeExPage([ex(2, 3, "6")]),
        recA: makeExPage([ex(2, 3, "6")]),
        recB: makeExPage([ex(2, 3, "6")]),
        expectedFinal: ['final record: examples[0].parts[0].shown_answer: shown "6", computed "5"'],
        expectedReader: ['reader b: examples[0].parts[0].shown_answer: shown "6", computed "5"'],
      },
      {
        label: "A Alpha first, B Beta first, same expr and same wrong answer at index 0: both listed",
        finalIsFreshA: true,
        finalRec: makeExPage([ex(2, 3, "6", "Alpha"), ex(2, 3, "5", "Beta")]),
        recA: makeExPage([ex(2, 3, "6", "Alpha"), ex(2, 3, "5", "Beta")]),
        recB: makeExPage([ex(2, 3, "6", "Beta"), ex(2, 3, "5", "Alpha")]),
        expectedFinal: ['final record: examples[0].parts[0].shown_answer: shown "6", computed "5"'],
        expectedReader: ['reader b: examples[0].parts[0].shown_answer: shown "6", computed "5"'],
      },
      {
        label: "A and B different at the same index (different values)",
        finalIsFreshA: true,
        finalRec: makeExPage([ex(2, 3, "6")]),
        recA: makeExPage([ex(2, 3, "6")]),
        recB: makeExPage([ex(4, 5, "10")]),
        expectedFinal: ['final record: examples[0].parts[0].shown_answer: shown "6", computed "5"'],
        expectedReader: ['reader b: examples[0].parts[0].shown_answer: shown "10", computed "9"'],
      },
      {
        label: "A and B different at the same index (different expr, same shown and computed)",
        finalIsFreshA: true,
        finalRec: makeExPage([ex(2, 3, "6")]),
        recA: makeExPage([ex(2, 3, "6")]),
        recB: makeExPage([ex(1, 4, "6")]),
        expectedFinal: ['final record: examples[0].parts[0].shown_answer: shown "6", computed "5"'],
        expectedReader: ['reader b: examples[0].parts[0].shown_answer: shown "6", computed "5"'],
      },
      {
        label: "reordered examples with unrelated conflicts at index 0",
        finalIsFreshA: true,
        finalRec: makeExPage([ex(2, 3, "6"), ex(4, 5, "9")]),
        recA: makeExPage([ex(2, 3, "6"), ex(4, 5, "9")]),
        recB: makeExPage([ex(4, 5, "10"), ex(2, 3, "5")]),
        expectedFinal: ['final record: examples[0].parts[0].shown_answer: shown "6", computed "5"'],
        expectedReader: ['reader b: examples[0].parts[0].shown_answer: shown "10", computed "9"'],
      },
      {
        label: "reordered examples with same conflict at different indices",
        finalIsFreshA: true,
        finalRec: makeExPage([ex(4, 5, "9"), ex(2, 3, "6")]),
        recA: makeExPage([ex(4, 5, "9"), ex(2, 3, "6")]),
        recB: makeExPage([ex(2, 3, "6"), ex(4, 5, "9")]),
        expectedFinal: ['final record: examples[1].parts[0].shown_answer: shown "6", computed "5"'],
        expectedReader: ['reader b: examples[0].parts[0].shown_answer: shown "6", computed "5"'],
      },
      {
        label: "person-edited record fixed A's conflict",
        finalIsFreshA: false,
        finalRec: makeExPage([ex(2, 3, "5")]),
        recA: makeExPage([ex(2, 3, "6")]),
        recB: makeExPage([ex(2, 3, "5")]),
        expectedFinal: [],
        expectedReader: ['reader a: examples[0].parts[0].shown_answer: shown "6", computed "5"'],
      },
      {
        label: "person-edited record has its own conflict at same index as A and B: lists final, a and b",
        finalIsFreshA: false,
        finalRec: makeExPage([ex(2, 3, "7")]),
        recA: makeExPage([ex(2, 3, "6")]),
        recB: makeExPage([ex(4, 5, "10")]),
        expectedFinal: ['final record: examples[0].parts[0].shown_answer: shown "7", computed "5"'],
        expectedReader: [
          'reader a: examples[0].parts[0].shown_answer: shown "6", computed "5"',
          'reader b: examples[0].parts[0].shown_answer: shown "10", computed "9"',
        ],
      },
    ];

    for (const c of cases) {
      const res = collectExampleAnswerConflicts(c.finalRec, c.recA, c.recB, {
        finalIsFreshA: c.finalIsFreshA,
      });
      expect(res.finalMessages, c.label).toEqual(c.expectedFinal);
      expect(res.readerMessages, c.label).toEqual(c.expectedReader);
    }
  });
});
