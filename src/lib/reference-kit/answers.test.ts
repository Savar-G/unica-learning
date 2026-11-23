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
        { position: "line_with_unit", cue: "Ans.", answer: "25", answer_source: "reader", unit: "cards" },
        { position: "work_area", cue: null, answer: null, answer_source: "unchecked" },
      ],
    });
    const { record, notes, details } = applyComputedAnswers(page);
    if (record.kind !== "page") throw new Error("page expected");
    const responses = record.sections[0].items[0].responses;
    expect(responses.map((r) => [r.answer, r.answer_source])).toEqual([
      ["24", "computed"],
      ["24", "computed"],
      [null, "unchecked"],
    ]);
    expect(details.map((d) => d.kind)).toEqual(["answer_differs"]);
    expect(notes[0]).toContain('reader gave "25", computed "24"');
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
