import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ItemResponse, PageItem, PageRecord } from "@/lib/reference-record";
import { applyComputedAnswers, decimalPlacePower, findEmptyAnswers } from "./answers";

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

  it("knows the decimal place names in the forms that readers write", () => {
    expect(["ones", "One", "ones place", "units"].map(decimalPlacePower)).toEqual([0, 0, 0, 0]);
    expect(["tens", "tens digit", "hundreds", "thousands"].map(decimalPlacePower)).toEqual([1, 1, 2, 3]);
    expect(["ten thousands", "ten_thousands", "Ten-Thousands"].map(decimalPlacePower)).toEqual([4, 4, 4]);
    expect(["quotient", "second factor", "fourth", null, undefined].map(decimalPlacePower)).toEqual([
      null, null, null, null, null,
    ]);
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
});
