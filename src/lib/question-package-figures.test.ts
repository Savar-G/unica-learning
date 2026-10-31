import { describe, expect, it } from "vitest";
import {
  checkQuestionPackage,
  operationResult,
  workedSteps,
  type Figure,
  type Item,
  type Operation,
  type QuestionPackage,
} from "@/lib/question-package";

// Pictures on workbook items (#377): a figure the child reads (dots, a ten-frame, a number line, base-ten blocks, an
// array or a pattern), drawn by code from its numbers. The checker checks its shape, the count and pattern checks read
// it, and any other figure must agree with the question: what code cannot match is "not checked by code".

const n = (value: number) => ({ type: "number" as const, value });
const box = (id: string, value: number) => ({ id, kind: "box" as const, label: null, answer: n(value) });
const failed = (reason: string) => ({ ok: false, status: "failed", reason });
const unsupported = (reason: string) => ({ ok: false, status: "unsupported", reason });

function withoutOperation(text: string, item: Item): QuestionPackage {
  return {
    id: "wbq-0301", ref: { source: "workbook", workbookId: "wb-1", page: 3, question: 1 }, templateId: null, text,
    answer: null, operation: null, steps: [], skill: { standard: "K1", skills: ["K1-count-objects"] }, level: 1, difficulty: 1,
    wrongAnswers: [], easierExample: null, item,
  };
}

function withOperation(text: string, operation: Operation, easier: Operation, item: Item): QuestionPackage {
  return {
    id: "wbq-0302", ref: { source: "workbook", workbookId: "wb-1", page: 3, question: 2 }, templateId: null, text,
    answer: { value: operationResult(operation), accepted: [], unit: null }, operation, steps: workedSteps(operation),
    skill: { standard: "K3", skills: ["K3-part-part-whole"] }, level: 4, difficulty: 1,
    wrongAnswers: [{ value: n(0), cause: "operation", description: "Writes 0.", step: null }],
    easierExample: { text: "?", operation: easier, answer: operationResult(easier), steps: workedSteps(easier) }, item,
  };
}

/** "How many dots?" with this figure, the box holding `key`. */
const count = (figure: Figure, key: number) => withoutOperation("How many dots?", {
  format: "write-number", scorable: true, parentChecked: false, regions: [box("answer", key)], checks: [{ kind: "count", region: "answer" }], error: null, figure,
});

describe("a count item: the box holds what the picture shows", () => {
  it.each<[string, Figure, number]>([
    ["dots 3 and 4", { kind: "dots", groups: [3, 4], takenAway: 0 }, 7],
    ["7 dots with 2 crossed out", { kind: "dots", groups: [7], takenAway: 2 }, 5],
    ["a ten-frame of 10 and 3", { kind: "ten-frame", counters: [10, 3] }, 13],
    ["1 hundred, 2 tens and 3 ones", { kind: "base-ten", hundreds: 1, tens: 2, ones: 3 }, 123],
    ["3 rows of 4", { kind: "array", rows: 3, columns: 4 }, 12],
  ])("checks %s", (_name, figure, key) => {
    expect(checkQuestionPackage(count(figure, key))).toMatchObject({ ok: true, status: "checked" });
  });

  it.each<[string, Figure]>([
    ["no dots", { kind: "dots", groups: [0], takenAway: 0 }],
    ["an empty ten-frame", { kind: "ten-frame", counters: [0] }],
    ["no base-ten blocks", { kind: "base-ten", hundreds: 0, tens: 0, ones: 0 }],
    ["3 dots, all crossed out", { kind: "dots", groups: [3], takenAway: 3 }],
  ])("checks a count of 0: %s", (_name, figure) => {
    expect(checkQuestionPackage(count(figure, 0))).toMatchObject({ ok: true, status: "checked" });
  });

  it("fails a box that does not hold the count", () => {
    expect(checkQuestionPackage(count({ kind: "dots", groups: [3, 4], takenAway: 0 }, 8))).toEqual(failed('the region "answer" holds 8, but the picture shows 7'));
  });

  it("fails a count check with no picture to count", () => {
    const p = count({ kind: "dots", groups: [3], takenAway: 0 }, 3);
    delete p.item!.figure;
    expect(checkQuestionPackage(p)).toEqual(failed("a count check needs a figure of dots, a ten-frame, base-ten blocks or an array"));
    expect(checkQuestionPackage(count({ kind: "number-line", from: 0, to: 10, step: 1 }, 3)))
      .toEqual(failed("a count check needs a figure of dots, a ten-frame, base-ten blocks or an array"));
  });

  it.each<[string, Figure, string]>([
    ["four groups", { kind: "dots", groups: [1, 1, 1, 1], takenAway: 0 }, "a dots figure needs 1 to 3 groups of 0 to 20 dots, 0 to 30 in all"],
    ["31 dots", { kind: "dots", groups: [20, 11], takenAway: 0 }, "a dots figure needs 1 to 3 groups of 0 to 20 dots, 0 to 30 in all"],
    ["an array of no rows", { kind: "array", rows: 0, columns: 3 }, "an array needs 1 to 10 rows and columns"],
    ["more crossed out than there are", { kind: "dots", groups: [3], takenAway: 4 }, "a dots figure crosses out 0 to all of its dots"],
    ["21 counters on two ten-frames", { kind: "ten-frame", counters: [11, 10] }, "a ten-frame figure needs 1 or 2 parts of counters, 0 to 20 in all"],
    ["an array of 11 rows", { kind: "array", rows: 11, columns: 2 }, "an array needs 1 to 10 rows and columns"],
    ["a number line of 30 steps", { kind: "number-line", from: 0, to: 30, step: 1 }, "a number line needs 1 to 20 equal steps from its start to its end"],
    ["an unknown kind", { kind: "clock" } as unknown as Figure, "the figure has an unknown kind"],
  ])("fails a figure with %s", (_name, figure, reason) => {
    expect(checkQuestionPackage(count(figure, 1))).toEqual(failed(reason));
  });
});

describe("a pattern item: the choice is the shape in the blank", () => {
  /** circle, square, triangle, circle, square, [ ]: what comes next? */
  const pattern = (answer: string, blank = 5) => withoutOperation("What comes next? Circle it.", {
    format: "circle", scorable: true, parentChecked: false,
    regions: [{ id: "shape", kind: "choice", mark: "circle", label: null, choices: ["circle", "square", "triangle"], answer }],
    checks: [{ kind: "pattern", region: "shape" }], error: null,
    figure: { kind: "pattern", core: ["circle", "square", "triangle"], length: 6, blank },
  });

  it("checks the shape that comes next, and a missing shape inside the row", () => {
    expect(checkQuestionPackage(pattern("triangle"))).toMatchObject({ ok: true, status: "checked" });
    expect(checkQuestionPackage(pattern("square", 4))).toMatchObject({ ok: true, status: "checked" });
  });

  it("fails another shape", () => {
    expect(checkQuestionPackage(pattern("circle"))).toEqual(failed('the region "shape" holds circle, but the shape in the blank is triangle'));
  });

  it.each<[string, Partial<Extract<Figure, { kind: "pattern" }>>, string]>([
    ["one shape only", { core: ["circle", "circle"] }, "a pattern's core needs two different shapes"],
    ["a shape code does not draw", { core: ["circle", "moon" as "star"] }, "a pattern needs a core of 2 to 4 known shapes"],
    ["the core shown once", { length: 4 }, "a pattern shows its core at least twice, and at most 12 shapes"],
    ["a blank past the end", { blank: 6 }, "a pattern's blank is not one of its shapes"],
  ])("fails a pattern with %s", (_name, change, reason) => {
    const p = pattern("triangle");
    Object.assign(p.item!.figure!, change);
    expect(checkQuestionPackage(p)).toEqual(failed(reason));
  });
});

describe("a picture beside a question agrees with it", () => {
  const add = (a: number, b: number): Operation => ({ kind: "add", operands: [a, b] });
    /** The same kind of operation with 1 and 1: smaller than every story here. */
  const easier = (op: Operation) => ({ ...op, operands: [op.kind === "subtract" ? 2 : 1, 1] }) as Operation;
  const story = (op: Operation, figure: Figure) => withOperation("Mia has some red beads and some blue beads. How many beads?", op, easier(op), {
    format: "write-number", scorable: true, parentChecked: false,
    regions: [box("answer", (operationResult(op) as { value: number }).value)], checks: [{ kind: "operation", region: "answer" }], error: null, figure,
  });

  it("checks dots, a ten-frame, an array and a number line that show the operation", () => {
    expect(checkQuestionPackage(story(add(3, 4), { kind: "dots", groups: [3, 4], takenAway: 0 }))).toMatchObject({ status: "checked" });
    expect(checkQuestionPackage(story({ kind: "subtract", operands: [7, 2] }, { kind: "dots", groups: [7], takenAway: 2 }))).toMatchObject({ status: "checked" });
    expect(checkQuestionPackage(story(add(7, 5), { kind: "ten-frame", counters: [7, 5] }))).toMatchObject({ status: "checked" });
    expect(checkQuestionPackage(story({ kind: "multiply", operands: [3, 4] }, { kind: "array", rows: 3, columns: 4 }))).toMatchObject({ status: "checked" });
    expect(checkQuestionPackage(story(add(38, 5), { kind: "number-line", from: 30, to: 50, step: 1 }))).toMatchObject({ status: "checked" });
  });

  it("fails a picture of other numbers", () => {
    expect(checkQuestionPackage(story(add(3, 4), { kind: "dots", groups: [3, 5], takenAway: 0 }))).toEqual(failed("the picture shows dots 3 and 5, not 3 + 4"));
    expect(checkQuestionPackage(story(add(38, 5), { kind: "number-line", from: 0, to: 20, step: 1 }))).toEqual(failed("the picture shows a number line from 0 to 20, not 38 + 5"));
    expect(checkQuestionPackage(story(add(3, 4), { kind: "array", rows: 3, columns: 4 }))).toEqual(failed("the picture shows 3 rows of 4, not 3 + 4"));
  });

  it("is not checked by code when code cannot tell what the picture shows", () => {
    const divide: Operation = { kind: "divide", operands: [12, 3] };
    const p = withOperation("12 ÷ 3 = ?", divide, { kind: "divide", operands: [6, 3] }, {
      format: "write-number", scorable: true, parentChecked: false, regions: [box("answer", 4)], checks: [{ kind: "operation", region: "answer" }], error: null,
      figure: { kind: "dots", groups: [4, 4, 4], takenAway: 0 },
    });
    expect(checkQuestionPackage(p)).toEqual(unsupported("code cannot tell whether dots 4 and 4 and 4 shows the question"));
  });

  it("checks base-ten blocks of a places number, and dots of two compared numbers", () => {
    const places = withoutOperation("How many tens and ones?", {
      format: "boxes", scorable: true, parentChecked: false, regions: [box("tens", 4), box("ones", 7)],
      checks: [{ kind: "places", number: 47, parts: [{ region: "tens", place: "tens" }, { region: "ones", place: "ones" }] }], error: null,
      figure: { kind: "base-ten", hundreds: 0, tens: 4, ones: 7 },
    });
    expect(checkQuestionPackage(places)).toMatchObject({ status: "checked" });
    places.item!.figure = { kind: "base-ten", hundreds: 0, tens: 7, ones: 4 };
    expect(checkQuestionPackage(places)).toEqual(failed("the picture shows 0 hundreds, 7 tens and 4 ones, not 47"));

    const compare = (groups: number[]) => withoutOperation("Which has more? Tick <, > or =.", {
      format: "tick-one", scorable: true, parentChecked: false,
      regions: [{ id: "sign", kind: "choice", mark: "tick", label: null, choices: ["<", ">", "="], answer: "<" }],
      checks: [{ kind: "compare", left: n(3), right: n(8), region: "sign" }], error: null, figure: { kind: "dots", groups, takenAway: 0 },
    });
    expect(checkQuestionPackage(compare([3, 8]))).toMatchObject({ status: "checked" });
    expect(checkQuestionPackage(compare([8, 3]))).toEqual(failed("the picture shows dots 8 and 3, not 3 and 8"));
  });

  it("fails a pattern figure with no pattern check", () => {
    const p = withoutOperation("Draw what comes next.", {
      format: "draw", scorable: false, parentChecked: true, regions: [{ id: "drawing", kind: "picture", label: null }], checks: [], error: null,
      figure: { kind: "pattern", core: ["circle", "star"], length: 4, blank: 3 },
    });
    expect(checkQuestionPackage(p)).toEqual(failed("a pattern figure needs a pattern check"));
  });

  it("checks an item with a null figure as one with none", () => {
    const p = story(add(3, 4), { kind: "dots", groups: [3, 4], takenAway: 0 });
    expect(checkQuestionPackage({ ...p, item: { ...p.item!, figure: null } })).toMatchObject({ status: "checked" });
  });
});

describe("the easier example of a one-digit question (#377, review R378-1)", () => {
  type Kind = "add" | "subtract" | "multiply" | "divide";
  const sign: Record<Kind, string> = { add: "+", subtract: "−", multiply: "×", divide: "÷" };
  /** The question a op b, its answer box filled by code, with this easier example. */
  const question = (kind: Kind, [a, b]: [number, number], easier: [number, number]) => {
    const operation = { kind, operands: [a, b] } as Operation;
    const result = operationResult(operation) as { value: number };
    return withOperation(`${a} ${sign[kind]} ${b} = ?`, operation, { kind, operands: easier } as Operation, {
      format: "write-number", scorable: true, parentChecked: false, regions: [box("answer", result.value)], checks: [{ kind: "operation", region: "answer" }], error: null,
    });
  };
  const giveaway = failed("the easier example has the question's answer");

  it.each<[Kind, [number, number], [number, number], [number, number], [number, number], string]>([
    // kind, question, an example with its answer, a truly easier example, the question rearranged and why it fails
    ["add", [3, 4], [2, 5], [2, 1], [4, 3], "the easier example has the question's answer"],
    ["subtract", [8, 4], [7, 3], [3, 1], [4, 8], "the easier example: the subtraction goes below zero"],
    ["multiply", [3, 4], [2, 6], [2, 3], [4, 3], "the easier example has the question's answer"],
    // 4 ÷ 8 is 0 R 4, another answer, but its numbers are the question's: not smaller.
    ["divide", [8, 4], [4, 2], [2, 2], [4, 8], "the easier example is not smaller than the question"],
  ])("%s: rejects the same answer, the same question and the question rearranged; takes smaller numbers", (kind, q, same, easier, rearranged, why) => {
    expect(checkQuestionPackage(question(kind, q, same))).toEqual(giveaway);
    expect(checkQuestionPackage(question(kind, q, q))).toEqual(giveaway);
    expect(checkQuestionPackage(question(kind, q, rearranged))).toEqual(failed(why));
    expect(checkQuestionPackage(question(kind, q, easier))).toMatchObject({ ok: true, status: "checked" });
  });

  it("rejects an example with one larger number even with another answer", () => {
    expect(checkQuestionPackage(question("add", [3, 4], [1, 5]))).toEqual(failed("the easier example is not smaller than the question"));
  });
});
