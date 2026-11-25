import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  validateReferenceRecord,
  type ArithOp,
  type Expr,
  type ItemResponse,
  type PageItem,
  type PageRecord,
  type PageSection,
  type SimpleExpr,
} from "@/lib/reference-record";
import { applyComputedAnswers } from "./answers";
import { findExampleAnswerConflicts } from "./example-answers";
import { findPrintedConflicts } from "./printed-line";
import { findUnprovedAnswers } from "./unproved-answers";

const add = (...operands: number[]): SimpleExpr => ({ kind: "arith", op: "add", operands });
const div = (a: number, b: number): SimpleExpr => ({ kind: "arith", op: "div", operands: [a, b] });
const chain = (...terms: Array<number | null>): SimpleExpr => ({ kind: "chain", terms });
const notation: SimpleExpr = { kind: "notation", latex: "x + 1" };
const box = (answer: string | null, more: Partial<ItemResponse> = {}): ItemResponse => ({
  position: "box",
  cue: null,
  answer,
  answer_source: answer === null ? "unchecked" : "reader",
  ...more,
});
const named = (place: string, answer: string | null): ItemResponse => box(answer, { place });
const work = (answer: string | null, more: Partial<ItemResponse> = {}) => box(answer, { position: "work_area", ...more });
const tick = (answer: string | null = null) => box(answer, { position: "checkbox" });

function pageOf(items: PageItem[], scaffolds: PageSection["scaffolds"] = [], examples: PageRecord["examples"] = []): PageRecord {
  return {
    kind: "page",
    source_ref: "sample:M:3a",
    topic: { title: "Practice" },
    sections: [{ instruction: "Solve.", scaffolds, items }],
    examples,
    score_bands: "unclear",
  };
}

function listed(expr: Expr | null, responses: ItemResponse[], scaffolds: PageSection["scaffolds"] = []): string[] {
  const item: PageItem = { n: 1, printed: "Work it out.", form: "horizontal", expr, responses };
  const { record } = applyComputedAnswers(pageOf([item], scaffolds));
  return findUnprovedAnswers(record).map((note) => note.message);
}

const boxes = (box_count: number): PageSection["scaffolds"] => [{ kind: "answer_boxes", applies_to: "all", box_count }];

describe("findUnprovedAnswers", () => {
  it("passes stored answers that the placing rules accept or that code proves place by place", () => {
    const passes: Array<[string, Expr, ItemResponse[], PageSection["scaffolds"]?]> = [
      ["one place", add(2, 3), [box("5")]],
      ["one digit place", add(5, 6), [named("ones", "1")]],
      ["digit places", add(5, 6), [named("tens", "1"), named("ones", "1")]],
      ["digit places by scaffold", add(5, 6), [box("1"), box("1")], [{ kind: "answer_boxes", applies_to: [1], places: ["tens", "ones"] }]],
      ["a higher place that is not reached", add(2, 3), [named("tens", "0"), named("ones", "5")]],
      ["the value in several places", add(2, 3), [box("5"), box("5")]],
      ["the value in several places, one empty", add(2, 3), [box("5"), box(null)]],
      ["the value in two places with one name", add(2, 3), [named("ones", "5"), named("ones", "5")]],
      ["the value and one digit", add(5, 6), [box("11"), named("tens", "1")]],
      ["quotient and remainder", div(17, 2), [box("8"), box("1")]],
      ["quotient and remainder 0", div(16, 2), [box("8"), box("0")]],
      ["one division answer", div(17, 2), [box("8r1")]],
      ["chain blanks", chain(2, 4, null, 8, null), [box("6"), box("10")]],
      ["linked pair", { kind: "linked", pair: [add(2, 3), div(9, 3)] }, [box("5"), box("3")]],
      ["working space beside an answer place", add(2, 3), [box("5"), work(null), tick()]],
      ["the answer again in the working space", div(17, 2), [box("8 R1"), work("8")]],
      ["words in the working space", add(2, 3), [box("5"), work("3 more than 2"), tick("done")]],
      ["printed working", add(2, 3), [box("5"), work("2", { answer_source: "printed" })]],
      ["sole working space", add(2, 3), [work("5")]],
    ];
    for (const [label, expr, responses, scaffolds] of passes) expect(listed(expr, responses, scaffolds), label).toEqual([]);
  });

  it("passes items that code cannot compute, whatever they store", () => {
    const passes: Array<[string, Expr | null, ItemResponse[]]> = [
      ["notation", notation, [box("5"), box("6")]],
      ["no expression", null, [tick(), work(null)]],
      ["a word problem with no expression", { kind: "word", text: "How many?", expr: null }, [box("5"), box("6")]],
      ["a word problem with a division that is not exact", { kind: "word", text: "Share 17.", expr: div(17, 2) }, [box("8"), box("9")]],
      ["an unclear operand", { kind: "arith", op: "add", operands: [2, "unclear"] }, [box("5"), box("6")]],
      ["decimal operands", add(0.5, 1.25), [box("1"), box("2")]],
      ["a chain with no step", chain(null, 5), [box("5"), box("6")]],
      ["a linked pair with one half in notation", { kind: "linked", pair: [add(2, 3), notation] }, [box("5"), box("x"), box("y")]],
      ["a division that is not exact in a sole working space", div(17, 2), [work("8.5")]],
    ];
    for (const [label, expr, responses] of passes) expect(listed(expr, responses), label).toEqual([]);
  });

  it("lists stored answers that code can compute and cannot prove, with both values", () => {
    const stops: Array<[string, Expr, ItemResponse[], string, PageSection["scaffolds"]?]> = [
      ["two places", add(2, 3), [box("5"), box("6")], 'answer places hold "5", "6", computed "5"'],
      ["two wrong places", add(2, 3), [box("6"), box("6")], 'hold "6", "6", computed "5"'],
      ["duplicate names", add(2, 3), [named("ones", "5"), named("ones", "6")], 'hold "5", "6"'],
      ["duplicate names that leave a digit out", add(5, 6), [named("ones", "1"), named("ones", "1")], 'hold "1", "1", computed "11"'],
      ["the whole value in a digit place", add(5, 6), [named("ones", "11"), named("ones", "11")], 'hold "11", "11"'],
      ["a wrong digit beside the value", add(5, 6), [box("11"), named("tens", "2")], 'hold "11", "2"'],
      ["no answer place", add(2, 3), [tick(), work(null)], 'no answer place for the computed answer "5"'],
      ["a tick box only", add(2, 3), [tick()], "no answer place"],
      ["no answer place and a wrong working space", add(2, 3), [tick(), work("6")], "no answer place"],
      ["several digit boxes with no names", add(2, 3), [box("5"), box("5")], 'hold "5", "5"', boxes(2)],
      ["two quotients", div(16, 2), [box("8"), box("8")], 'hold "8", "8", computed "8"'],
      ["a wrong remainder place", div(17, 2), [box("8"), box("2")], 'hold "8", "2", computed "8 R1"'],
      ["remainder first", div(17, 2), [box("1"), box("8")], 'hold "1", "8"'],
      ["an empty remainder place", div(17, 2), [box("8"), box(null)], 'hold "8", nothing'],
      ["too many chain places", chain(2, 4, null, 8), [box("6"), box("6")], 'hold "6", "6", computed "6"'],
      ["too few chain places", chain(2, 4, null, null), [box("6")], 'hold "6", computed "6", "8"'],
      ["too many linked places", { kind: "linked", pair: [add(2, 3), div(9, 3)] }, [box("5"), box("3"), box("3")], 'computed "5", "3"'],
      ["another number in the working space", add(2, 3), [box("5"), work("6")], '`responses'],
      ["another number in a tick box", chain(2, 4, null, 8), [box("6"), tick("7")], '`responses'],
    ];
    for (const [label, expr, responses, text, scaffolds] of stops) {
      const found = listed(expr, responses, scaffolds);
      expect(found, label).toHaveLength(1);
      if (text === "`responses") expect(found[0], label).toMatch(/^sections\[0\]\.items\[n=1\]\.responses\[1\]: holds "[67]", computed "[56]"$/);
      else expect(found[0], label).toContain(text);
    }
  });

  // One correct item in one of the forms in which a page can ask for its answer.
  interface Drawn {
    item: PageItem;
    scaffolds: PageSection["scaffolds"];
    shown: string;
  }
  const SIGNS: Record<ArithOp, string> = { add: "+", sub: "-", mul: "×", div: "÷" };
  const drawnItem: fc.Arbitrary<Drawn> = fc
    .record({
      op: fc.constantFrom<ArithOp>("add", "sub", "mul", "div"),
      a: fc.integer({ min: 0, max: 999 }),
      b: fc.integer({ min: 1, max: 99 }),
      form: fc.constantFrom("one", "named", "scaffold", "twice", "working", "sole", "parts"),
    })
    .map(({ op, a: first, b, form }) => {
      const a = op === "sub" ? first + b : first;
      const q = Math.floor(a / b);
      const r = a % b;
      const value = { add: String(a + b), sub: String(a - b), mul: String(a * b), div: r === 0 ? String(q) : `${q} R${r}` }[op];
      const digits = /^\d+$/.test(value) ? [...value] : null;
      const places = ["ones", "tens", "hundreds", "thousands", "ten thousands"].slice(0, digits?.length ?? 1).reverse();
      let responses = [box(value)];
      let scaffolds: PageSection["scaffolds"] = [];
      if (form === "named" && digits) responses = digits.map((d, i) => named(places[i], d));
      if (form === "scaffold" && digits && digits.length > 1) {
        responses = digits.map((d) => box(d));
        scaffolds = [{ kind: "answer_boxes", applies_to: [1], places }];
      }
      if (form === "twice" && op !== "div") responses = [box(value), box(value, { position: "line_with_unit", unit: "cm" })];
      if (form === "working") responses = [box(value), work(null)];
      if (form === "sole" && digits) responses = [work(value)];
      if (form === "parts" && op === "div") responses = [box(String(q)), box(String(r))];
      const printed = `${a} ${SIGNS[op]} ${b} =`;
      const expr: SimpleExpr = { kind: "arith", op, operands: [a, b] };
      return { item: { n: 1, printed, form: "horizontal", expr, responses }, scaffolds, shown: value };
    });
  const pageFrom = (drawn: Drawn): PageRecord =>
    pageOf([structuredClone(drawn.item)], drawn.scaffolds, [
      {
        position: "top",
        relation: "sequence",
        parts: [{ form: "horizontal", expr: structuredClone(drawn.item.expr), shown_answer: drawn.shown }],
        steps: [
          { n: 1, shows: "setup", printed: drawn.item.printed },
          { n: 2, shows: "answer", printed: drawn.shown },
        ],
        marks: [],
      },
    ]);
  const stopsOf = (page: PageRecord): string[] => {
    expect(validateReferenceRecord(page).ok).toBe(true);
    const { record, details } = applyComputedAnswers(page);
    return [
      ...details.filter((d) => d.kind === "answer_differs"),
      ...findUnprovedAnswers(record),
      ...findExampleAnswerConflicts(record),
      ...findPrintedConflicts(record),
    ].map((note) => note.message);
  };

  it("property: a correct page never stops, in every placing form", () => {
    fc.assert(
      fc.property(drawnItem, (drawn) => {
        expect(stopsOf(pageFrom(drawn))).toEqual([]);
      }),
      { numRuns: 500 },
    );
  });

  it("property: one changed answer, shown answer, step or printed operand always stops", () => {
    const bump = (text: string, delta: number): string => text.replace(/\d+/, (n) => String(Number(n) + delta));
    fc.assert(
      fc.property(drawnItem, fc.constantFrom("answer", "shown", "step", "printed"), fc.nat(), fc.integer({ min: 1, max: 8 }), (drawn, what, at, delta) => {
        const page = pageFrom(drawn);
        const item = page.sections[0].items[0];
        const example = Array.isArray(page.examples) ? page.examples[0] : null;
        const answered = item.responses.filter((resp) => resp.answer !== null);
        const resp = answered[at % answered.length];
        if (what === "answer") resp.answer = resp.place ? String((Number(resp.answer) + delta) % 10) : bump(String(resp.answer), delta);
        if (what === "shown" && example) example.parts[0].shown_answer = bump(drawn.shown, delta);
        if (what === "step" && Array.isArray(example?.steps)) example.steps[1].printed = bump(drawn.shown, delta);
        if (what === "printed") item.printed = bump(item.printed, delta);
        expect(stopsOf(page).length, `${what} ${JSON.stringify(item)}`).toBeGreaterThan(0);
      }),
      { numRuns: 500 },
    );
  });
});
