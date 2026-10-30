import { describe, expect, it } from "vitest";
import {
  checkQuestionPackage,
  packageItem,
  QUESTION_PACKAGE_VERSION,
  operationResult,
  workedSteps,
  type Item,
  type ItemFormat,
  type Operation,
  type QuestionPackage,
} from "@/lib/question-package";

// Workbook item formats (#362): one numbered item on a page, its answer regions (each one box the renderer measures)
// and how code checks each scored region. A package is checked only when every scored region is what code computes;
// unscorable and parent-checked items are "not checked by code", never a guess.

const add = (a: number, b: number): Operation => ({ kind: "add", operands: [a, b] });

/** A package of `operation` at page 4, question 9, with an easier example and a wrong answer at the given step. */
function withOperation(text: string, operation: Operation, easier: Operation, wrong: { value: number; step: string | null }, item?: Item): QuestionPackage {
  return {
    id: "wbq-0409",
    ref: { source: "workbook", workbookId: "wb-1", page: 4, question: 9 },
    templateId: null,
    text,
    answer: { value: operationResult(operation), accepted: [], unit: null },
    operation,
    steps: workedSteps(operation),
    skill: { standard: "2.4", skills: ["2.4-add-within-100"] },
    level: 10,
    difficulty: 2,
    wrongAnswers: [{ value: { type: "number", value: wrong.value }, cause: "O3", description: "Forgets to carry when adding", step: wrong.step }],
    easierExample: { text: "?", operation: easier, answer: operationResult(easier), steps: workedSteps(easier) },
    ...(item ? { item } : {}),
  };
}

/** A package with no operation: the item's checks hold every answer. */
function withoutOperation(text: string, item: Item): QuestionPackage {
  return {
    id: "wbq-0409",
    ref: { source: "workbook", workbookId: "wb-1", page: 4, question: 9 },
    templateId: null,
    text,
    answer: null,
    operation: null,
    steps: [],
    skill: { standard: "2.4", skills: ["2.4-add-within-100"] },
    level: 10,
    difficulty: 2,
    wrongAnswers: [],
    easierExample: null,
    item,
  };
}

/** A copy with one change. */
const changed = <T,>(p: T, change: (p: T) => void): T => {
  const copy = structuredClone(p);
  change(copy);
  return copy;
};

/** The same data as jsonb gives it back: through JSON, with every object's keys in another order. */
const roundTrip = (v: unknown): unknown => {
  const reorder = (x: unknown): unknown => Array.isArray(x) ? x.map(reorder)
    : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).reverse().map(([k, y]) => [k, reorder(y)])) : x;
  return reorder(JSON.parse(JSON.stringify(v)));
};

const failed = (reason: string) => ({ ok: false, status: "failed", reason });

/** Mateo's Mixed set item 12: "A shop sold 126 books on Monday and 158 books on Tuesday. How many books is that in all?" */
const MIXED_SET = withOperation(
  "A shop sold 26 books on Monday and 58 books on Tuesday. How many books is that in all?",
  add(26, 58), add(14, 7), { value: 74, step: "tens" },
  {
    format: "tick-and-number",
    scorable: true,
    parentChecked: false,
    regions: [
      { id: "operation", kind: "choice", mark: "tick", label: "Tick the operation:", choices: ["+", "−", "×", "÷"], answer: "+" },
      { id: "answer", kind: "box", label: "Write the answer:", answer: { type: "number", value: 84 } },
      { id: "work", kind: "work", label: "SHOW YOUR WORK" },
    ],
    checks: [
      { kind: "operation-sign", region: "operation" },
      { kind: "operation", region: "answer" },
    ],
    error: null,
  },
);

describe("a Mixed set item: tick the operation, then write the answer", () => {
  it("is checked, and stays checked through jsonb", () => {
    expect(checkQuestionPackage(MIXED_SET)).toEqual({ ok: true, status: "checked", package: MIXED_SET });
    const stored = roundTrip(MIXED_SET);
    expect(checkQuestionPackage(stored)).toEqual({ ok: true, status: "checked", package: stored });
  });

  it.each([
    ["the wrong operation ticked", 'the region "operation" holds ×, but the operation\'s sign is +', (p: QuestionPackage) => {
      const r = p.item!.regions[0];
      if (r.kind === "choice") r.answer = "×";
    }],
    ["a wrong answer in the box", 'the region "answer" holds 74, but the question\'s answer is 84', (p: QuestionPackage) => {
      const r = p.item!.regions[1];
      if (r.kind === "box") r.answer = { type: "number", value: 74 };
    }],
    ["no + among the choices", 'the region "operation" has no choice for the operation\'s sign, +', (p: QuestionPackage) => {
      const r = p.item!.regions[0];
      if (r.kind === "choice") { r.choices = ["−", "×", "÷"]; r.answer = "−"; }
    }],
  ])("fails with %s", (_name, reason, change) => {
    expect(checkQuestionPackage(changed(MIXED_SET, change))).toEqual(failed(reason));
  });
});

describe("the format and its regions", () => {
  const item = (change: (i: Item) => void) => changed(MIXED_SET, (p) => change(p.item!));

  it.each([
    ["an unknown format", "the item's format is not one code knows", (i: Item) => { (i as { format: string }).format = "crossword"; }],
    ["a Mixed set with no tick", "a tick-and-number item needs 1 tick choice, not 0", (i: Item) => {
      i.regions.splice(0, 1);
      i.checks.splice(0, 1);
    }],
    ["a Mixed set with two answer boxes", "a tick-and-number item needs 1 box, not 2", (i: Item) => {
      i.regions.push({ id: "answer-2", kind: "box", label: null, answer: { type: "number", value: 84 } });
    }],
    ["a Mixed set whose choice is circled", "a tick-and-number item needs 1 tick choice, not 0", (i: Item) => {
      const r = i.regions[0];
      if (r.kind === "choice") r.mark = "circle";
    }],
    ["a Mixed set with a picture", "a tick-and-number item has no picture", (i: Item) => {
      i.regions.push({ id: "dots", kind: "picture", label: null });
    }],
    ["a scored box with no answer", "the region \"answer\" is scored, so it needs an answer", (i: Item) => {
      const r = i.regions[1];
      if (r.kind === "box") r.answer = null;
    }],
    ["a parent-checked item that is scorable", "a scorable item is not checked by a parent", (i: Item) => { i.parentChecked = true; }],
    ["a region id used twice", "a region id is used twice", (i: Item) => { i.regions[2].id = "answer"; }],
    ["a check of a region that is not there", "the operation check names a region the item does not have, \"total\"", (i: Item) => {
      i.checks[1] = { kind: "operation", region: "total" };
    }],
    ["a check of the wrong kind of region", "the operation check needs a box region, not \"operation\"", (i: Item) => {
      i.checks = [{ kind: "operation", region: "operation" }];
    }],
    ["one region in two checks", "the region \"answer\" is in two checks", (i: Item) => { i.checks.push({ kind: "operation", region: "answer" }); }],
    ["a choice answer that is not a choice", "the region \"operation\"'s answer is not one of its choices", (i: Item) => {
      const r = i.regions[0];
      if (r.kind === "choice") r.answer = "plus";
    }],
    ["the same choice twice", "the region \"operation\" names a choice twice", (i: Item) => {
      const r = i.regions[0];
      if (r.kind === "choice") r.choices = ["+", "+", "×"];
    }],
    ["a work box with no label", "the region \"work\" needs a label of up to 80 characters", (i: Item) => {
      (i.regions[2] as { label: string }).label = " ";
    }],
  ])("fails with %s", (_name, reason, change) => {
    expect(checkQuestionPackage(item(change))).toEqual(failed(reason));
  });

  it.each(["draw", "hands-on", "colour-or-shade", "match", "written-reason"] as const)("never lets a %s item be scorable", (format) => {
    const p = withoutOperation("Draw it.", {
      format, scorable: true, parentChecked: false,
      regions: format === "written-reason" ? [{ id: "reason", kind: "lines", label: "How do you know?" }]
        : format === "hands-on" ? [] : [{ id: "picture", kind: "picture", label: null }],
      checks: [], error: null,
    });
    expect(checkQuestionPackage(p)).toEqual(failed(`a ${format} item is never scorable`));
  });
});

describe("items code does not mark: not checked by code, never a guess", () => {
  const notChecked = (p: QuestionPackage, reason: string) => ({ ok: false, status: "not-checked", reason, package: p });

  it("says so for a drawing item", () => {
    const p = withoutOperation("Draw 3 groups of 4 dots.", {
      format: "draw", scorable: false, parentChecked: false,
      regions: [{ id: "drawing", kind: "picture", label: null }], checks: [], error: null,
    });
    expect(checkQuestionPackage(p)).toEqual(notChecked(p, "the item is not scored"));
    const stored = roundTrip(p);
    expect(checkQuestionPackage(stored)).toEqual(notChecked(stored as QuestionPackage, "the item is not scored"));
  });

  it("says so for a written reason", () => {
    const p = withoutOperation("Is 18 even? How do you know?", {
      format: "written-reason", scorable: false, parentChecked: false,
      regions: [{ id: "reason", kind: "lines", label: "How do you know?" }], checks: [], error: null,
    });
    expect(checkQuestionPackage(p)).toEqual(notChecked(p, "the item is not scored"));
  });

  /** "Share 12 counters into 3 equal groups. How many in each group?", with the parent's answer key checked by code. */
  const HANDS_ON = withOperation("Share 12 counters into 3 equal groups. How many in each group?",
    { kind: "divide", operands: [12, 3] }, { kind: "divide", operands: [6, 3] }, { value: 9, step: null }, {
      format: "hands-on", scorable: false, parentChecked: true,
      regions: [{ id: "each", kind: "box", label: "in each group", answer: { type: "number", value: 4 } }],
      checks: [{ kind: "operation", region: "each" }], error: null,
    });

  it("says so for a parent-checked hands-on item, after code checks the parent's answer key", () => {
    expect(checkQuestionPackage(HANDS_ON)).toEqual(notChecked(HANDS_ON, "a parent checks the item"));
    const wrongKey = changed(HANDS_ON, (p) => {
      const r = p.item!.regions[0];
      if (r.kind === "box") r.answer = { type: "number", value: 3 };
    });
    expect(checkQuestionPackage(wrongKey)).toEqual(failed('the region "each" holds 3, but the question\'s answer is 4'));
  });

  it("is never ok, so a product does not mark from it", () => {
    expect(checkQuestionPackage(HANDS_ON).ok).toBe(false);
  });
});

describe("versions", () => {
  const V1 = withOperation("26 + 58 = ?", add(26, 58), add(14, 7), { value: 74, step: "tens" });

  it("reads a version 1 package as one answer box that holds the operation's answer", () => {
    expect(checkQuestionPackage(V1, 1)).toEqual({ ok: true, status: "checked", package: V1 });
    expect(packageItem(V1)).toEqual({
      format: "write-number", scorable: true, parentChecked: false,
      regions: [{ id: "answer", kind: "box", label: null, answer: { type: "number", value: 84 } }],
      checks: [{ kind: "operation", region: "answer" }], error: null,
    });
    expect(packageItem(MIXED_SET)).toBe(MIXED_SET.item);
  });

  it("fails a version 1 package with an item, and does not read a version it does not know", () => {
    expect(checkQuestionPackage(MIXED_SET, 1)).toEqual(failed("a version 1 package has no item"));
    expect(checkQuestionPackage(V1, QUESTION_PACKAGE_VERSION + 1)).toEqual({
      ok: false, status: "unsupported", reason: `code cannot read question packages of version ${QUESTION_PACKAGE_VERSION + 1}`,
    });
    expect(QUESTION_PACKAGE_VERSION).toBe(2);
  });

  it("fails a package with neither an operation nor an item", () => {
    expect(checkQuestionPackage(changed(V1, (p) => { p.operation = null; }))).toMatchObject({ ok: false, status: "failed" });
  });
});

/** Ava's item 3: "Solve 7 + 5 two ways. Use a picture, a number line or numbers." */
const TWO_WAYS = withOperation("Solve 7 + 5 two ways. Use a picture, a number line or numbers.", add(7, 5), add(3, 4), { value: 11, step: "ones" }, {
  format: "two-ways", scorable: true, parentChecked: false,
  regions: [
    { id: "method-1", kind: "work", label: "METHOD 1" },
    { id: "method-2", kind: "work", label: "METHOD 2" },
    { id: "answer", kind: "box", label: "Answer", answer: { type: "number", value: 12 } },
  ],
  checks: [{ kind: "operation", region: "answer" }],
  error: null,
});

describe("Solve it two ways: Method 1, Method 2, then the answer", () => {
  it("checks only the answer", () => {
    expect(checkQuestionPackage(TWO_WAYS)).toEqual({ ok: true, status: "checked", package: TWO_WAYS });
  });

  it("fails with one method, or a wrong answer", () => {
    expect(checkQuestionPackage(changed(TWO_WAYS, (p) => { p.item!.regions.splice(1, 1); }))).toEqual(failed("a two-ways item needs 2 work boxes, not 1"));
    expect(checkQuestionPackage(changed(TWO_WAYS, (p) => {
      const r = p.item!.regions[2];
      if (r.kind === "box") r.answer = { type: "number", value: 11 };
    }))).toEqual(failed('the region "answer" holds 11, but the question\'s answer is 12'));
  });
});

/** Ava's Spot the error: "Mia says 9 + 4 = 12. Is it right? Tick yes or no. Write the right answer: 9 + 4 = [ ]" */
const SPOT_THE_ERROR = withOperation("Mia says 9 + 4 = 12.", add(9, 4), add(3, 4), { value: 12, step: "ones" }, {
  format: "spot-the-error", scorable: true, parentChecked: false,
  regions: [
    { id: "right", kind: "choice", mark: "tick", label: "Is it right? Tick yes or no.", choices: ["yes", "no"], answer: "no" },
    { id: "fix", kind: "box", label: "Write the right answer: 9 + 4 =", answer: { type: "number", value: 13 } },
    { id: "why", kind: "lines", label: "What did Mia do wrong?" },
  ],
  checks: [
    { kind: "yes-no", statement: { kind: "shown-answer" }, region: "right", yes: "yes", no: "no" },
    { kind: "operation", region: "fix" },
  ],
  error: { answer: { type: "number", value: 12 }, step: "ones" },
});

describe("Spot the error: a wrong worked solution, its wrong step, and the fix", () => {
  it("is checked: the shown answer is a wrong answer at its step, it is not right, and the fix is the answer", () => {
    expect(checkQuestionPackage(SPOT_THE_ERROR)).toEqual({ ok: true, status: "checked", package: SPOT_THE_ERROR });
    expect(checkQuestionPackage(roundTrip(SPOT_THE_ERROR))).toMatchObject({ ok: true, status: "checked" });
  });

  it.each([
    ["a shown answer that is not an expected wrong answer", "the shown answer 11 is not one of the question's wrong answers", (p: QuestionPackage) => {
      p.item!.error = { answer: { type: "number", value: 11 }, step: "ones" };
    }],
    ["a shown answer that is right", "the shown answer 13 is not one of the question's wrong answers", (p: QuestionPackage) => {
      p.item!.error = { answer: { type: "number", value: 13 }, step: "ones" };
    }],
    ["the mistake at another step", "the shown answer 12 has its mistake at the step ones, not the step tens", (p: QuestionPackage) => {
      p.item!.error = { answer: { type: "number", value: 12 }, step: "tens" };
    }],
    ["no shown error", "a spot-the-error item with an operation needs its shown error", (p: QuestionPackage) => { p.item!.error = null; }],
    ["\"yes, it is right\"", 'the region "right" holds yes, but the answer is no', (p: QuestionPackage) => {
      const r = p.item!.regions[0];
      if (r.kind === "choice") r.answer = "yes";
    }],
    ["yes and no that are not the region's choices", 'the yes-no check\'s yes and no are not the two choices of the region "right"', (p: QuestionPackage) => {
      const c = p.item!.checks[0];
      if (c.kind === "yes-no") c.yes = "true";
    }],
    ["a wrong fix", 'the region "fix" holds 12, but the question\'s answer is 13', (p: QuestionPackage) => {
      const r = p.item!.regions[1];
      if (r.kind === "box") r.answer = { type: "number", value: 12 };
    }],
  ])("fails with %s", (_name, reason, change) => {
    expect(checkQuestionPackage(changed(SPOT_THE_ERROR, change))).toEqual(failed(reason));
  });

  it("fails a shown error on an item of another format, and a shown-answer statement with no shown error", () => {
    expect(checkQuestionPackage(changed(TWO_WAYS, (p) => { p.item!.error = { answer: { type: "number", value: 11 }, step: "ones" }; })))
      .toEqual(failed("only a spot-the-error item shows a wrong solution"));
    const tick = withOperation("Is 9 + 4 = 13 right?", add(9, 4), add(3, 4), { value: 12, step: "ones" }, {
      format: "tick-one", scorable: true, parentChecked: false,
      regions: [{ id: "right", kind: "choice", mark: "tick", label: null, choices: ["yes", "no"], answer: "no" }],
      checks: [{ kind: "yes-no", statement: { kind: "shown-answer" }, region: "right", yes: "yes", no: "no" }],
      error: null,
    });
    expect(checkQuestionPackage(tick)).toEqual(failed("a shown-answer statement needs the item's shown wrong solution"));
  });

  it("is unsupported when the fix is beyond code: Mateo's \"the number that is not a factor of 20\"", () => {
    const p = withoutOperation("Sam's work. Factors of 20: 1, 2, 4, 5, 10, 15, 20", {
      format: "spot-the-error", scorable: true, parentChecked: false,
      regions: [
        { id: "fix", kind: "box", label: "The number that is not a factor of 20 is", answer: { type: "number", value: 15 } },
        { id: "why", kind: "lines", label: "How do you know? Write it here." },
      ],
      checks: [],
      error: null,
    });
    expect(checkQuestionPackage(p)).toEqual({ ok: false, status: "unsupported", reason: 'code cannot check the region "fix"' });
  });
});

const n = (value: number) => ({ type: "number" as const, value });
const box = (id: string, value: number | null, label: string | null = null) => ({ id, kind: "box" as const, label, answer: value === null ? null : n(value) });
/** A scorable item of several boxes, with no operation. */
const boxes = (regions: Item["regions"], checks: Item["checks"], format: Item["format"] = "boxes") =>
  withoutOperation("Fill in the boxes.", { format, scorable: true, parentChecked: false, regions, checks, error: null });
/** The item with its box `id` holding `value`. */
const holding = (p: QuestionPackage, id: string, value: number) => changed(p, (q) => {
  const r = q.item!.regions.find((x) => x.id === id);
  if (r?.kind === "box") r.answer = n(value);
});
const checked = (p: unknown) => ({ ok: true, status: "checked", package: p });

describe("tens and ones: each box holds the digit of its place", () => {
  /** "47 = [ ] tens [ ] ones" */
  const TENS_AND_ONES = boxes([box("tens", 4, "tens"), box("ones", 7, "ones")],
    [{ kind: "places", number: 47, parts: [{ region: "tens", place: "tens" }, { region: "ones", place: "ones" }] }]);
  /** Mateo's "0.846 = [ ] tenths + [ ] hundredths + [ ] thousandths" */
  const DECIMAL = boxes([box("a", 8), box("b", 4), box("c", 6)],
    [{ kind: "places", number: 0.846, parts: [{ region: "a", place: "tenths" }, { region: "b", place: "hundredths" }, { region: "c", place: "thousandths" }] }]);

  it("checks the digits", () => {
    expect(checkQuestionPackage(TENS_AND_ONES)).toEqual(checked(TENS_AND_ONES));
    expect(checkQuestionPackage(DECIMAL)).toEqual(checked(DECIMAL));
    expect(checkQuestionPackage(roundTrip(DECIMAL))).toMatchObject({ status: "checked" });
  });

  it("gives the largest place the whole number above it: 347 is 34 tens and 7 ones", () => {
    const p = changed(TENS_AND_ONES, (q) => {
      const c = q.item!.checks[0];
      if (c.kind === "places") c.number = 347;
    });
    expect(checkQuestionPackage(holding(p, "tens", 34))).toMatchObject({ status: "checked" });
    expect(checkQuestionPackage(holding(p, "tens", 4))).toEqual(failed('the region "tens" holds 4, but 347 has 34 tens'));
  });

  it("fails swapped digits, and boxes that cannot show the number", () => {
    expect(checkQuestionPackage(holding(holding(TENS_AND_ONES, "tens", 7), "ones", 4))).toEqual(failed('the region "tens" holds 7, but 47 has 4 tens'));
    const noTens = boxes([box("h", 5), box("o", 7)], [{ kind: "places", number: 517, parts: [{ region: "h", place: "hundreds" }, { region: "o", place: "ones" }] }]);
    expect(checkQuestionPackage(noTens)).toEqual(failed("517 has 1 tens, but the item has no box for the tens"));
    const noTensNeeded = boxes([box("h", 5), box("o", 7)], [{ kind: "places", number: 507, parts: [{ region: "h", place: "hundreds" }, { region: "o", place: "ones" }] }]);
    expect(checkQuestionPackage(noTensNeeded)).toMatchObject({ status: "checked" });
  });
});

describe("ordering: the boxes hold the numbers in order", () => {
  /** "Put 0.5, 0.45 and 0.405 in order from least to greatest." */
  const ORDER = boxes([box("first", 0.405), box("second", 0.45), box("third", 0.5)],
    [{ kind: "order", numbers: [n(0.5), n(0.45), n(0.405)], direction: "up", regions: ["first", "second", "third"] }]);

  it("checks the order, exactly, and takes the same number in another form", () => {
    expect(checkQuestionPackage(ORDER)).toEqual(checked(ORDER));
    const half = changed(ORDER, (p) => {
      const r = p.item!.regions[2];
      if (r.kind === "box") r.answer = { type: "fraction", numerator: 1, denominator: 2 };
    });
    expect(checkQuestionPackage(half)).toMatchObject({ status: "checked" });
  });

  it("fails a wrong order, and checks greatest to least", () => {
    expect(checkQuestionPackage(holding(holding(ORDER, "first", 0.45), "second", 0.405)))
      .toEqual(failed('the region "first" holds 0.45, but from least to greatest number 1 is 0.405'));
    const down = changed(ORDER, (p) => {
      const c = p.item!.checks[0];
      if (c.kind === "order") c.direction = "down";
    });
    expect(checkQuestionPackage(down)).toEqual(failed('the region "first" holds 0.405, but from greatest to least number 1 is 0.5'));
    expect(checkQuestionPackage(holding(holding(down, "first", 0.5), "third", 0.405))).toMatchObject({ status: "checked" });
  });
});

describe("missing numbers in equations", () => {
  /** Mateo's "8: 6 × [ ] = 54" and "9: [ ] × 7 = 56", and Ava's "8 + [ ] = 10, 10 + [ ] = [ ]" (8 + 6). */
  const MISSING = boxes([box("a", 9), box("b", 8), box("c", 2), box("d", 4), box("e", 14)], [{
    kind: "equations", different: false, equations: [
      { left: n(6), op: "×", right: { region: "a" }, result: n(54) },
      { left: { region: "b" }, op: "×", right: n(7), result: n(56) },
      { left: n(8), op: "+", right: { region: "c" }, result: n(10) },
      { left: n(10), op: "+", right: { region: "d" }, result: { region: "e" } },
    ],
  }]);

  it("checks each equation as filled in", () => {
    expect(checkQuestionPackage(MISSING)).toEqual(checked(MISSING));
    expect(checkQuestionPackage(holding(MISSING, "a", 8))).toEqual(failed("the boxes make 6 × 8 = 54, which is not true"));
  });

  it("fails a division by 0, and a box that holds no number", () => {
    const zero = boxes([box("a", 0)], [{ kind: "equations", different: false, equations: [{ left: n(5), op: "÷", right: { region: "a" }, result: n(0) }] }], "write-number");
    expect(checkQuestionPackage(zero)).toEqual(failed("5 ÷ 0 = 0 divides by 0"));
    const words = changed(MISSING, (p) => {
      const r = p.item!.regions[0];
      if (r.kind === "box") r.answer = { type: "text", value: "nine" };
    });
    expect(checkQuestionPackage(words)).toEqual(failed('the region "a" holds nine, not a number'));
  });
});

describe("two ways to make 12: more than one right answer set", () => {
  /** "Show two ways to make 12: [ ] + [ ] = 12, [ ] + [ ] = 12" */
  const make12 = (a: number, b: number, c: number, d: number) => boxes([box("a", a), box("b", b), box("c", c), box("d", d)], [{
    kind: "equations", different: true, equations: [
      { left: { region: "a" }, op: "+", right: { region: "b" }, result: n(12) },
      { left: { region: "c" }, op: "+", right: { region: "d" }, result: n(12) },
    ],
  }]);

  it("takes every right answer set", () => {
    const sets: number[][] = [];
    for (let a = 0; a <= 12; a++) for (let c = 0; c <= 12; c++) if (a !== c) sets.push([a, 12 - a, c, 12 - c]);
    expect(sets).toHaveLength(156);
    for (const [a, b, c, d] of sets) expect(checkQuestionPackage(make12(a, b, c, d)).status, `${a} + ${b}, ${c} + ${d}`).toBe("checked");
    expect(checkQuestionPackage(make12(5, 7, 7, 5)).status).toBe("checked");
    expect(checkQuestionPackage(make12(5.5, 6.5, 3, 9)).status).toBe("checked");
  });

  it("fails a sum that is not 12, and the same way twice", () => {
    expect(checkQuestionPackage(make12(5, 6, 3, 9))).toEqual(failed("the boxes make 5 + 6 = 12, which is not true"));
    expect(checkQuestionPackage(make12(5, 7, 5, 7))).toEqual(failed("two equations are 5 + 7 = 12: the ways must differ"));
  });

  /** Mateo's Try this first: "[ ] × [ ] = 12", three rectangles. */
  it("checks factor pairs the same way", () => {
    const pairs = (values: number[]) => boxes(values.map((v, i) => box(`f${i}`, v)), [{
      kind: "equations", different: true,
      equations: [0, 1, 2].map((k) => ({ left: { region: `f${2 * k}` }, op: "×" as const, right: { region: `f${2 * k + 1}` }, result: n(12) })),
    }]);
    expect(checkQuestionPackage(pairs([1, 12, 2, 6, 3, 4])).status).toBe("checked");
    expect(checkQuestionPackage(pairs([12, 1, 6, 2, 4, 3])).status).toBe("checked");
    expect(checkQuestionPackage(pairs([1, 12, 2, 6, 3, 5]))).toEqual(failed("the boxes make 3 × 5 = 12, which is not true"));
  });
});

describe("missing numbers in a sequence", () => {
  /** "Fill in the missing numbers: 23, 25, [ ], 29, [ ]" */
  const SEQUENCE = boxes([box("x", 27), box("y", 31)],
    [{ kind: "sequence", step: n(2), terms: [n(23), n(25), { region: "x" }, n(29), { region: "y" }] }]);

  it("checks each box against the step", () => {
    expect(checkQuestionPackage(SEQUENCE)).toEqual(checked(SEQUENCE));
    expect(checkQuestionPackage(holding(SEQUENCE, "y", 30))).toEqual(failed('the region "y" holds 30, but the sequence has 31 there'));
  });

  it("counts back and in decimals, from a box first", () => {
    const back = boxes([box("x", 1.5), box("y", 0.5)], [{ kind: "sequence", step: n(-0.5), terms: [{ region: "x" }, n(1), { region: "y" }, n(0)] }]);
    expect(checkQuestionPackage(back)).toEqual(checked(back));
    expect(checkQuestionPackage(holding(back, "x", 2))).toEqual(failed('the region "x" holds 2, but the sequence has 1.5 there'));
  });

  it("fails printed numbers that do not follow the step", () => {
    const off = changed(SEQUENCE, (p) => {
      const c = p.item!.checks[0];
      if (c.kind === "sequence") c.terms[3] = n(30);
    });
    expect(checkQuestionPackage(off)).toEqual(failed("the sequence's printed numbers do not change by 2 each time"));
  });
});

describe("tick one, or circle one, of named choices", () => {
  const choice = (choices: string[], answer: string | null, mark: "tick" | "circle" = "tick") =>
    ({ id: "pick", kind: "choice" as const, mark, label: null, choices, answer });
  const tickOne = (c: ReturnType<typeof choice>, check: Item["checks"][number] | null, format: Item["format"] = "tick-one") =>
    withoutOperation("Tick one.", { format, scorable: true, parentChecked: false, regions: [c], checks: check ? [check] : [], error: null });

  it("checks a comparison: tick <, > or =", () => {
    const compare = (answer: string) => tickOne(choice(["<", ">", "="], answer),
      { kind: "compare", region: "pick", left: { type: "fraction", numerator: 3, denominator: 4 }, right: { type: "fraction", numerator: 2, denominator: 3 } });
    expect(checkQuestionPackage(compare(">"))).toMatchObject({ status: "checked" });
    expect(checkQuestionPackage(compare("<"))).toEqual(failed('the region "pick" holds <, but the sign between 3/4 and 2/3 is >'));
    const equal = tickOne(choice(["<", ">", "="], "="), { kind: "compare", region: "pick", left: n(0.5), right: { type: "fraction", numerator: 2, denominator: 4 } });
    expect(checkQuestionPackage(equal)).toMatchObject({ status: "checked" });
  });

  it("checks Mateo's \"Is 6 a factor of 42? Tick yes or no.\"", () => {
    const factor = (of: number, answer: string) => tickOne(choice(["yes", "no"], answer),
      { kind: "yes-no", region: "pick", yes: "yes", no: "no", statement: { kind: "factor", factor: 6, of } });
    expect(checkQuestionPackage(factor(42, "yes"))).toMatchObject({ status: "checked" });
    expect(checkQuestionPackage(factor(32, "no"))).toMatchObject({ status: "checked" });
    expect(checkQuestionPackage(factor(32, "yes"))).toEqual(failed('the region "pick" holds yes, but the answer is no'));
  });

  it("checks a printed equation: \"Is 0.3 + 0.4 = 0.7 true? Tick true or false.\"", () => {
    const statement = (result: number, answer: string) => tickOne(choice(["true", "false"], answer), {
      kind: "yes-no", region: "pick", yes: "true", no: "false",
      statement: { kind: "equation", equation: { left: n(0.3), op: "+", right: n(0.4), result: n(result) } },
    });
    expect(checkQuestionPackage(statement(0.7, "true"))).toMatchObject({ status: "checked" });
    expect(checkQuestionPackage(statement(0.7, "false"))).toEqual(failed('the region "pick" holds false, but the answer is true'));
    expect(checkQuestionPackage(statement(0.8, "false"))).toMatchObject({ status: "checked" });
  });

  it("checks a circled choice the same way", () => {
    const circle = tickOne(choice(["<", ">", "="], "<", "circle"), { kind: "compare", region: "pick", left: n(47), right: n(63) }, "circle");
    expect(checkQuestionPackage(circle)).toMatchObject({ status: "checked" });
  });

  it("is unsupported when code has no rule for the choice: \"Tick prime, composite or neither.\"", () => {
    const prime = tickOne(choice(["prime", "composite", "neither"], "prime"), null);
    expect(checkQuestionPackage(prime)).toEqual({ ok: false, status: "unsupported", reason: 'code cannot check the region "pick"' });
  });

  it("is unsupported when the operation has no one sign to tick", () => {
    const convert: Operation = { kind: "convert", operands: [{ type: "quantity", value: 2.5, unit: "km" }], unit: "m" };
    const easier: Operation = { kind: "convert", operands: [{ type: "quantity", value: 2, unit: "km" }], unit: "m" };
    const p = withOperation("A path is 2.5 km long. How many metres is that?", convert, easier, { value: 25, step: null }, {
      format: "tick-and-number", scorable: true, parentChecked: false,
      regions: [
        { id: "operation", kind: "choice", mark: "tick", label: null, choices: ["+", "−", "×", "÷"], answer: "×" },
        { id: "answer", kind: "box", label: null, answer: { type: "quantity", value: 2500, unit: "m" } },
      ],
      checks: [{ kind: "operation-sign", region: "operation" }, { kind: "operation", region: "answer" }],
      error: null,
    });
    p.answer = { value: { type: "quantity", value: 2500, unit: "m" }, accepted: [], unit: null };
    p.skill = { standard: "5.6", skills: [] };
    expect(checkQuestionPackage(p)).toEqual({ ok: false, status: "unsupported", reason: "code cannot name one sign for a convert question" });
  });
});

describe("every format", () => {
  const unscored = (format: ItemFormat, regions: Item["regions"], parentChecked = false) =>
    withoutOperation("Do it.", { format, scorable: false, parentChecked, regions, checks: [], error: null });
  const picture = { id: "picture", kind: "picture" as const, label: null };

  /** One item of each format, as a workbook page prints it, and what the checker says. */
  const EXAMPLES: Record<ItemFormat, { p: QuestionPackage; status: string }> = {
    "write-number": { p: withOperation("26 + 58 = ?", add(26, 58), add(14, 7), { value: 74, step: "tens" }), status: "checked" },
    "write-words": {
      p: withoutOperation("Write 47 in words.", {
        format: "write-words", scorable: true, parentChecked: false,
        regions: [{ id: "words", kind: "box", label: null, answer: { type: "text", value: "forty-seven" } }], checks: [], error: null,
      }),
      status: "unsupported",
    },
    boxes: { p: boxes([box("tens", 4), box("ones", 7)], [{ kind: "places", number: 47, parts: [{ region: "tens", place: "tens" }, { region: "ones", place: "ones" }] }]), status: "checked" },
    "fill-table": {
      // In: 2, 4, 5. Out: in × 3.
      p: boxes([box("out-2", 6), box("out-4", 12), box("out-5", 15)], [{
        kind: "equations", different: false,
        equations: [2, 4, 5].map((k) => ({ left: n(k), op: "×" as const, right: n(3), result: { region: `out-${k}` } })),
      }], "fill-table"),
      status: "checked",
    },
    "tick-one": { p: SPOT_THE_ERROR_TICK(), status: "checked" },
    circle: {
      p: withoutOperation("Circle the bigger number: 47 or 63?", {
        format: "circle", scorable: true, parentChecked: false,
        regions: [{ id: "pick", kind: "choice", mark: "circle", label: null, choices: ["<", ">", "="], answer: "<" }],
        checks: [{ kind: "compare", region: "pick", left: n(47), right: n(63) }], error: null,
      }),
      status: "checked",
    },
    "tick-and-number": { p: MIXED_SET, status: "checked" },
    "two-ways": { p: TWO_WAYS, status: "checked" },
    "spot-the-error": { p: SPOT_THE_ERROR, status: "checked" },
    "show-work": {
      p: withOperation("Mateo has 24 square tiles. He makes a rectangle with 4 rows. How many tiles are in each row?",
        { kind: "divide", operands: [24, 4] }, { kind: "divide", operands: [8, 4] }, { value: 20, step: null }, {
          format: "show-work", scorable: true, parentChecked: false,
          regions: [{ id: "work", kind: "work", label: "SHOW YOUR WORK" }, box("answer", 6, "ANSWER")],
          checks: [{ kind: "operation", region: "answer" }], error: null,
        }),
      status: "checked",
    },
    "written-reason": { p: unscored("written-reason", [{ id: "reason", kind: "lines", label: "How do you know?" }]), status: "not-checked" },
    "number-line": {
      p: withOperation("Start at 8. Hop on 5. Where do you land?", add(8, 5), add(3, 4), { value: 12, step: "ones" }, {
        format: "number-line", scorable: true, parentChecked: false,
        regions: [picture, box("answer", 13)], checks: [{ kind: "operation", region: "answer" }], error: null,
      }),
      status: "checked",
    },
    "colour-or-shade": { p: unscored("colour-or-shade", [picture]), status: "not-checked" },
    match: { p: unscored("match", [picture], true), status: "not-checked" },
    draw: { p: unscored("draw", [picture]), status: "not-checked" },
    "hands-on": { p: unscored("hands-on", [], true), status: "not-checked" },
  };

  it.each(Object.entries(EXAMPLES))("round-trips a %s item through jsonb with the same check", (_format, { p, status }) => {
    const before = checkQuestionPackage(p);
    expect(before.status, before.ok ? "" : before.reason).toBe(status);
    const stored = roundTrip(p);
    expect(stored).toEqual(p);
    const after = checkQuestionPackage(stored);
    expect(after).toEqual(before.ok || before.status === "not-checked" ? { ...before, package: stored } : before);
  });
});

/** Ava's spot-the-error tick on its own: "Mia says 9 + 4 = 12. Is it right? Tick yes or no." as a printed equation. */
function SPOT_THE_ERROR_TICK(): QuestionPackage {
  return withoutOperation("Mia says 9 + 4 = 12. Is it right? Tick yes or no.", {
    format: "tick-one", scorable: true, parentChecked: false,
    regions: [{ id: "right", kind: "choice", mark: "tick", label: null, choices: ["yes", "no"], answer: "no" }],
    checks: [{ kind: "yes-no", region: "right", yes: "yes", no: "no", statement: { kind: "equation", equation: { left: n(9), op: "+", right: n(4), result: n(12) } } }],
    error: null,
  });
}

describe("a package with no operation", () => {
  const DRAW = withoutOperation("Draw 3 groups of 4 dots.", {
    format: "draw", scorable: false, parentChecked: false, regions: [{ id: "drawing", kind: "picture", label: null }], checks: [], error: null,
  });

  it.each([
    ["an answer", (p: QuestionPackage) => { p.answer = { value: n(12), accepted: [], unit: null }; }, "a package with no operation has no answer and no easier example: its item holds the answers"],
    ["worked steps", (p: QuestionPackage) => { p.steps = workedSteps(add(3, 4)); }, "a package with no operation has no worked steps and no wrong answers"],
    ["a wrong answer", (p: QuestionPackage) => { p.wrongAnswers = [{ value: n(7), cause: "O1", description: "x", step: null }]; }, "a package with no operation has no worked steps and no wrong answers"],
    ["a level beyond U30", (p: QuestionPackage) => { p.level = 31; }, "the level is not U1 to U30"],
    ["an operation check", (p: QuestionPackage) => {
      p.item = { format: "write-number", scorable: true, parentChecked: false, regions: [box("answer", 12)], checks: [{ kind: "operation", region: "answer" }], error: null };
    }, "an operation check needs the package's operation"],
  ])("fails with %s", (_name, change, reason) => {
    expect(checkQuestionPackage(changed(DRAW, change))).toEqual(failed(reason));
  });

  it("is unsupported when a box holds an answer type code does not know", () => {
    const p = withoutOperation("?", {
      format: "write-number", scorable: true, parentChecked: false,
      regions: [{ id: "answer", kind: "box", label: null, answer: { type: "percent", value: 50 } as never }], checks: [], error: null,
    });
    expect(checkQuestionPackage(p)).toEqual({ ok: false, status: "unsupported", reason: "code cannot check answers of type percent" });
  });
});

describe("junk", () => {
  const JUNK: unknown[] = [null, undefined, 0, -1, 1.5, "", "x", [], {}, [null], { type: "number" }, { region: 3 }, Number.NaN, true];
  const PACKAGES = [MIXED_SET, TWO_WAYS, SPOT_THE_ERROR, SPOT_THE_ERROR_TICK()];

  /** Every path to a field of an item, down to the leaves. */
  function paths(v: unknown, at: (string | number)[] = []): (string | number)[][] {
    if (v === null || typeof v !== "object") return [at];
    const keys: (string | number)[] = Array.isArray(v) ? v.map((_, i) => i) : Object.keys(v);
    return [at, ...keys.flatMap((k) => paths((v as Record<string | number, unknown>)[k], [...at, k]))];
  }

  it("fails or says unsupported, and never throws, with junk in any field of an item", () => {
    for (const p of PACKAGES) {
      for (const path of paths(p.item)) {
        for (const junk of JUNK) {
          const q = structuredClone(p) as unknown as Record<string, unknown>;
          if (path.length === 0) q.item = junk;
          else {
            let at = q.item as Record<string | number, unknown>;
            for (const k of path.slice(0, -1)) at = at[k] as Record<string | number, unknown>;
            at[path[path.length - 1]] = junk;
          }
          const label = `${path.join(".")} = ${String(junk)}`;
          expect(() => checkQuestionPackage(q), label).not.toThrow();
          expect(["failed", "unsupported", "checked"], label).toContain(checkQuestionPackage(q).status);
        }
      }
    }
  });
});

describe("an item with no word on its shown error", () => {
  it("fails, as every other missing field does", () => {
    const p = changed(MIXED_SET, (q) => { delete (q.item as Partial<Item>).error; });
    expect(checkQuestionPackage(p)).toEqual(failed("the item does not say whether it shows a wrong solution"));
  });
});
