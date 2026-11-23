import { describe, expect, it } from "vitest";
import type { PageRecord } from "@/lib/reference-record";
import { applyComputedAnswers } from "./answers";

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
});
