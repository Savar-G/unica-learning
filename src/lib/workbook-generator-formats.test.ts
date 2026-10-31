import { describe, expect, it } from "vitest";
import type { AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";
import type { Grade } from "@/lib/assessment";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { generateWorkbook, type GeneratedQuestion, type GeneratedWorkbook } from "@/lib/workbook-generator";
import { planLevel, planWorkbook, type WorkbookPlan } from "@/lib/workbook-plan";

// The generator's formats with no operation and its pictures (#377), through generateWorkbook with the fake AI client:
// places, order, compare, sequence, count, pattern, number-line and draw, and pictures beside stories. The AI gives
// numbers and a picture kind; code computes every answer and every picture's numbers, and the checker runs.

const BC = curriculumFor("bc")!;
const WORKBOOK = "00000000-0000-4000-8000-0000000000a1";
const CHILD = "00000000-0000-4000-8000-0000000000c1";
const PARENT = "00000000-0000-4000-8000-0000000000f1";

function plan(level: string, grade: Grade): WorkbookPlan {
  const result = planWorkbook({
    profile: { standards: [] }, grade, level: planLevel(BC, level)!, passed: {}, workbook: { number: 1, inLevel: 0 },
    reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [],
  });
  if (!result.ok) throw new Error(result.reason);
  return result.plan;
}
const U10 = plan("U10", 3);

const num = (value: number) => ({
  type: "number", value, numerator: null, denominator: null, whole: null, unit: null, hours: null, minutes: null, period: null, parts: [], text: null,
});
const op = (kind: string, a: number, b: number) => ({ kind, operands: [num(a), num(b)], expression: null, unit: null, denominator: null, values: [] });

interface SlotAsked { slot: string; skills: string[] }
const read = (r: AiJsonRequest) => JSON.parse((r.content[0] as { text: string }).text) as { slots: SlotAsked[] };

/** An AI item with every field at its empty value: a format with no operation fills only its own fields. */
function item(s: SlotAsked, format: string, over: Record<string, unknown> = {}) {
  return {
    slot: s.slot, skill: s.skills[0], difficulty: 1, text: "Look at the picture.", format, operation: null, wrongAnswers: [], easier: null,
    shownWrong: null, figure: null, numbers: [], places: null, direction: null, sequence: null, pattern: null, ...over,
  };
}

/** An item with an operation, one wrong answer and an easier example. */
function withOp(s: SlotAsked, format: string, operation: unknown, wrong: number, easier: unknown, over: Record<string, unknown> = {}) {
  return item(s, format, {
    operation, wrongAnswers: [{ value: num(wrong), cause: "count", description: "Counts one too many.", step: null }],
    easier: { text: "Try this first.", operation: easier }, ...over,
  });
}

/** A sound item for any slot: a carry addition. */
const plain = (s: SlotAsked) => withOp(s, "write-number", op("add", 268, 157), 315, op("add", 48, 37));

function deps(answer: (s: SlotAsked, r: AiJsonRequest) => unknown) {
  let n = 0;
  return {
    ai: fakeAiClient({ answer: (r) => ({ items: read(r).slots.map((s) => answer(s, r)) }) }),
    fit: { fits: async () => ({ ok: true as const }) },
    store: memoryDraftStore({ [CHILD]: PARENT }),
    qrToken: () => `token-${String(++n).padStart(12, "0")}`,
  };
}

async function draft(p: WorkbookPlan, answer: (s: SlotAsked, r: AiJsonRequest) => unknown): Promise<GeneratedWorkbook> {
  const result = await generateWorkbook({ workbookId: WORKBOOK, childId: CHILD, number: 1, profileBuild: null, plan: p, curriculum: BC }, deps(answer));
  if (result.status !== "stored") throw new Error(result.reason);
  return result.draft;
}

/** Question 1 of the first day page of a U10 draft, from this AI item; every other slot gets a sound item. */
async function first(make: (s: SlotAsked) => unknown, p = U10): Promise<GeneratedQuestion> {
  const d = await draft(p, (s) => (s.slot === "1.1" ? make(s) : plain(s)));
  return d.pages.find((x) => x.questions.length > 0)!.questions[0];
}

const regions = (q: GeneratedQuestion) => q.package!.item!.regions;
const box = (id: string, value: number, label: string | null = null) => ({ id, kind: "box", label, answer: { type: "number", value } });

describe("places", () => {
  it("splits a number into every place: 347 is 3 hundreds, 4 tens and 7 ones", async () => {
    const q = await first((s) => item(s, "places", { text: "How many hundreds, tens and ones?", numbers: [num(347)] }));
    expect(q.check).toEqual({ status: "checked" });
    expect(q.package!.item!.format).toBe("boxes");
    expect(regions(q)).toEqual([box("hundreds", 3, "hundreds"), box("tens", 4, "tens"), box("ones", 7, "ones")]);
    expect(q.package!.answer).toBeNull();
    expect(q.package!.operation).toBeNull();
  });

  it("gives the largest place asked every unit above it: 347 is 34 tens and 7 ones", async () => {
    const q = await first((s) => item(s, "places", { numbers: [num(347)], places: ["ones", "tens"] }));
    expect(q.check).toEqual({ status: "checked" });
    expect(regions(q)).toEqual([box("tens", 34, "tens"), box("ones", 7, "ones")]);
  });

  it("splits a decimal: 0.85 is 0 ones, 8 tenths and 5 hundredths", async () => {
    const q = await first((s) => item(s, "places", { numbers: [num(0.85)] }));
    expect(q.check).toEqual({ status: "checked" });
    expect(regions(q)).toEqual([box("ones", 0, "ones"), box("tenths", 8, "tenths"), box("hundredths", 5, "hundredths")]);
  });

  it("draws base-ten blocks or a ten-frame of the number", async () => {
    const blocks = await first((s) => item(s, "places", { numbers: [num(47)], figure: "base-ten" }));
    expect(blocks.check).toEqual({ status: "checked" });
    expect(blocks.package!.item!.figure).toEqual({ kind: "base-ten", hundreds: 0, tens: 4, ones: 7 });
    const frame = await first((s) => item(s, "places", { numbers: [num(14)], figure: "ten-frame" }));
    expect(frame.package!.item!.figure).toEqual({ kind: "ten-frame", counters: [10, 4] });
    expect(regions(frame)).toEqual([box("tens", 1, "tens"), box("ones", 4, "ones")]);
  });
});

describe("order", () => {
  it("puts the numbers in order, least to greatest or greatest to least", async () => {
    const up = await first((s) => item(s, "order", { text: "Put 12, 5 and 9 in order from least to greatest.", numbers: [num(12), num(5), num(9)], direction: "up" }));
    expect(up.check).toEqual({ status: "checked" });
    expect(regions(up)).toEqual([box("place-1", 5), box("place-2", 9), box("place-3", 12)]);
    const down = await first((s) => item(s, "order", { numbers: [num(12), num(5), num(9)], direction: "down", figure: "number-line" }));
    expect(regions(down)).toEqual([box("place-1", 12), box("place-2", 9), box("place-3", 5)]);
    expect(down.package!.item!.figure).toEqual({ kind: "number-line", from: 0, to: 20, step: 1 });
  });

  it("fails with no direction", async () => {
    const q = await first((s) => item(s, "order", { numbers: [num(12), num(5)] }));
    expect(q.check).toEqual({ status: "failed", reason: "an order item goes up or down" });
  });
});

describe("compare", () => {
  it("ticks <, > or = at U4 and up, with dots of the two numbers", async () => {
    const q = await first((s) => item(s, "compare", { text: "Which has more? Tick <, > or =.", numbers: [num(3), num(8)], figure: "dots" }));
    expect(q.check).toEqual({ status: "checked" });
    expect(q.package!.item).toMatchObject({
      format: "tick-one",
      regions: [{ id: "sign", kind: "choice", mark: "tick", choices: ["<", ">", "="], answer: "<" }],
      figure: { kind: "dots", groups: [3, 8], takenAway: 0 },
    });
    const equal = await first((s) => item(s, "compare", { numbers: [num(0.5), { ...num(0), type: "fraction", value: null, numerator: 2, denominator: 4 }] }));
    expect(equal.check).toEqual({ status: "checked" });
    expect(regions(equal)[0]).toMatchObject({ answer: "=" });
  });

  it("fails a picture a compare item cannot draw", async () => {
    const q = await first((s) => item(s, "compare", { numbers: [num(3), num(8)], figure: "array" }));
    expect(q.check).toEqual({ status: "failed", reason: "a compare item draws dots or a number line" });
  });
});

describe("sequence", () => {
  it("fills the missing numbers: 23, 25, _, 29, _ are 27 and 31", async () => {
    const q = await first((s) => item(s, "sequence", { text: "Count by 2s. Fill in the missing numbers.", sequence: { start: num(23), step: num(2), terms: 5, blanks: [4, 2] } }));
    expect(q.check).toEqual({ status: "checked" });
    expect(regions(q)).toEqual([box("blank-1", 27), box("blank-2", 31)]);
    expect(q.package!.item!.checks).toEqual([{
      kind: "sequence", step: { type: "number", value: 2 },
      terms: [{ type: "number", value: 23 }, { type: "number", value: 25 }, { region: "blank-1" }, { type: "number", value: 29 }, { region: "blank-2" }],
    }]);
  });

  it("counts back by decimals exactly: _, 1, 0.5, 0 starts at 1.5", async () => {
    const q = await first((s) => item(s, "sequence", { sequence: { start: num(1.5), step: num(-0.5), terms: 4, blanks: [0] } }));
    expect(q.check).toEqual({ status: "checked" });
    expect(q.package!.item!.format).toBe("write-number");
    expect(regions(q)).toEqual([box("blank-1", 1.5)]);
  });

  it("fails a sequence with no printed number", async () => {
    const q = await first((s) => item(s, "sequence", { sequence: { start: num(1), step: num(1), terms: 3, blanks: [0, 1, 2] } }));
    expect(q.check).toEqual({ status: "failed", reason: "a sequence item needs at least one blank and one printed number, each blank a different place in it" });
  });
});

describe("count", () => {
  it.each([
    ["dots 3 and 4", "dots", [3, 4], { kind: "dots", groups: [3, 4], takenAway: 0 }, 7],
    ["a ten-frame of 10 and 3", "ten-frame", [10, 3], { kind: "ten-frame", counters: [10, 3] }, 13],
    ["1 hundred, 2 tens and 3 ones", "base-ten", [1, 2, 3], { kind: "base-ten", hundreds: 1, tens: 2, ones: 3 }, 123],
    ["3 rows of 4", "array", [3, 4], { kind: "array", rows: 3, columns: 4 }, 12],
  ])("counts %s", async (_name, figure, counts, drawn, answer) => {
    const q = await first((s) => item(s, "count", { text: "How many?", figure, numbers: (counts as number[]).map(num) }));
    expect(q.check).toEqual({ status: "checked" });
    expect(q.package!.item).toMatchObject({ format: "write-number", regions: [box("answer", answer as number)], checks: [{ kind: "count", region: "answer" }], figure: drawn });
  });

  it("fails a count item with no picture, then takes the redo", async () => {
    let calls = 0;
    const d = await draft(U10, (s) => {
      if (s.slot !== "1.1") return plain(s);
      calls++;
      return calls === 1 ? item(s, "count", { numbers: [num(3)] }) : item(s, "count", { figure: "dots", numbers: [num(3)] });
    });
    const q = d.pages.find((x) => x.questions.length > 0)!.questions[0];
    expect(q).toMatchObject({ attempts: 2, check: { status: "checked" } });
    expect(regions(q)).toEqual([box("answer", 3)]);
  });
});

describe("pattern", () => {
  it("names the shape in the blank: circle, square, triangle, circle, square, _ is a triangle", async () => {
    const q = await first((s) => item(s, "pattern", { text: "What comes next? Tick it.", pattern: { core: ["circle", "square", "triangle"], shapes: 6, blank: 5 } }));
    expect(q.check).toEqual({ status: "checked" });
    expect(q.package!.item).toMatchObject({
      format: "tick-one",
      regions: [{ id: "shape", kind: "choice", mark: "tick", choices: ["circle", "square", "triangle"], answer: "triangle" }],
      checks: [{ kind: "pattern", region: "shape" }],
      figure: { kind: "pattern", core: ["circle", "square", "triangle"], length: 6, blank: 5 },
    });
  });

  it("fails a core of one shape", async () => {
    const q = await first((s) => item(s, "pattern", { pattern: { core: ["star", "star"], shapes: 6, blank: 5 } }));
    expect(q.check.status).toBe("failed");
  });
});

describe("number line and pictures beside an operation", () => {
  it("draws the line through the start and the landing: 8 + 5 on 0 to 20, 38 + 5 on 30 to 50", async () => {
    const small = await first((s) => withOp(s, "number-line", op("add", 8, 5), 12, op("add", 3, 4), { text: "Start at 8. Hop on 5." }));
    expect(small.check).toEqual({ status: "checked" });
    expect(small.package!.item).toMatchObject({
      format: "number-line",
      regions: [{ id: "line", kind: "picture", label: null }, box("answer", 13)],
      figure: { kind: "number-line", from: 0, to: 20, step: 1 },
    });
    const big = await first((s) => withOp(s, "number-line", op("add", 38, 5), 42, op("add", 3, 4)));
    expect(big.check).toEqual({ status: "checked" });
    expect(big.package!.item!.figure).toEqual({ kind: "number-line", from: 30, to: 50, step: 1 });
  });

  it("draws a picture story's dots from the operation, never from the AI", async () => {
    const add = await first((s) => withOp(s, "write-number", op("add", 3, 4), 8, op("add", 2, 1), { figure: "dots", groups: [9, 9], counters: [1] }));
    expect(add.check).toEqual({ status: "checked" });
    expect(add.package!.item!.figure).toEqual({ kind: "dots", groups: [3, 4], takenAway: 0 });
    const takeAway = await first((s) => withOp(s, "show-work", op("subtract", 7, 2), 6, op("subtract", 3, 1), { figure: "dots" }));
    expect(takeAway.check).toEqual({ status: "checked" });
    expect(takeAway.package!.item!.figure).toEqual({ kind: "dots", groups: [7], takenAway: 2 });
    const frame = await first((s) => withOp(s, "write-number", op("add", 7, 5), 11, op("add", 3, 4), { figure: "ten-frame" }));
    expect(frame.package!.item!.figure).toEqual({ kind: "ten-frame", counters: [7, 5] });
    const rows = await first((s) => withOp(s, "write-number", op("multiply", 3, 4), 7, op("multiply", 2, 3), { figure: "array" }));
    expect(rows.check).toEqual({ status: "checked" });
    expect(rows.package!.item!.figure).toEqual({ kind: "array", rows: 3, columns: 4 });
  });

  it("fails a picture code cannot draw for the operation", async () => {
    const q = await first((s) => withOp(s, "write-number", op("add", 23, 45), 69, op("add", 2, 4), { figure: "dots" }));
    expect(q.check).toEqual({ status: "failed", reason: "a dots figure needs 1 to 3 groups of 0 to 20 dots, 1 to 30 in all" });
    const divide = await first((s) => withOp(s, "write-number", op("divide", 12, 3), 5, op("divide", 6, 3), { figure: "dots" }));
    expect(divide.check).toEqual({ status: "failed", reason: "code draws a picture only for +, − and × of whole numbers, not divide" });
  });
});

describe("draw", () => {
  it("is kept, marked not checked by code: a parent checks it", async () => {
    const q = await first((s) => item(s, "draw", { text: "Draw 6 dots." }));
    expect(q.check).toEqual({ status: "not-checked", reason: "a parent checks the item" });
    expect(q.package!.item).toEqual({ format: "draw", scorable: false, parentChecked: true, regions: [{ id: "drawing", kind: "picture", label: null }], checks: [], error: null });
  });
});

describe("a full draft for the early levels", () => {
  /** A teacher's pick for each skill of the U1, U4 and U7 plans; a slot's skills take turns by the item's number. */
  function teacher(slot: SlotAsked) {
    const skill = slot.skills[(Number(slot.slot.split(".")[1]) - 1) % slot.skills.length];
    const s = { ...slot, skills: [skill] };
    const is = (re: RegExp) => re.test(skill);
    if (is(/create-pattern|represent-pattern|count-out|sort-one|likelihood|which-more-likely|graph|pictograph/)) return item(s, "draw", { text: "Draw it." });
    if (is(/(^K4-|^1\.4-)/)) return item(s, "pattern", { pattern: { core: ["circle", "square"], shapes: 6, blank: 5 } });
    if (is(/ten-frame/)) return item(s, "count", { figure: "ten-frame", numbers: [num(7)] });
    if (is(/decompose|make-10|part-part-whole/)) return withOp(s, "write-number", op("add", 7, 3), 11, op("add", 2, 1), { figure: "ten-frame" });
    if (is(/two-more-less|number-line/)) return withOp(s, "number-line", op("add", 9, 5), 15, op("add", 3, 4));
    if (is(/ten-and-ones/)) return item(s, "places", { numbers: [num(14)], figure: "ten-frame" });
    if (is(/order-numerals/)) return item(s, "order", { numbers: [num(7), num(2), num(9)], direction: "up" });
    if (is(/compare|benchmarks/)) return item(s, "compare", { numbers: [num(3), num(8)], figure: "dots" });
    if (is(/rote-count|number-sequence|count-to-20|skip-count|count-by-ones|count-on-back/)) {
      return item(s, "sequence", { sequence: { start: num(5), step: num(is(/skip/) ? 2 : 1), terms: 5, blanks: [3] } });
    }
    if (is(/count|how-many|conservation|numerals|match-set|subitize|read-write/)) return item(s, "count", { figure: "dots", numbers: [num(3), num(4)] });
    throw new Error(`the test has no item for ${skill}`);
  }

  /** What a draft holds: its check kinds, item formats and picture kinds, and every not-checked reason. */
  function holds(d: GeneratedWorkbook) {
    const qs = d.pages.flatMap((p) => p.questions);
    const items = qs.map((q) => q.package!.item!);
    return {
      failed: qs.filter((q) => q.check.status === "failed").map((q) => q.check),
      notChecked: [...new Set(qs.flatMap((q) => (q.check.status === "not-checked" ? [q.check.reason] : [])))],
      checks: [...new Set(items.flatMap((i) => i.checks.map((c) => c.kind)))].sort(),
      formats: [...new Set(items.map((i) => i.format))].sort(),
      figures: [...new Set(items.flatMap((i) => (i.figure ? [i.figure.kind] : [])))].sort(),
    };
  }

  it("U1 (parent-led): counts, sequences, order, circled patterns and drawings, with no failure", async () => {
    const d = await draft(plan("U1", 0), teacher);
    expect(holds(d)).toEqual({
      failed: [],
      notChecked: ["a parent checks the item"],
      checks: ["count", "order", "pattern", "sequence"],
      formats: ["boxes", "circle", "draw", "write-number"],
      figures: ["dots", "pattern"],
    });
  });

  it("U4: ten-frames, compare, number lines and picture stories, with no failure", async () => {
    const d = await draft(plan("U4", 1), teacher);
    expect(holds(d)).toEqual({
      failed: [],
      notChecked: ["a parent checks the item"],
      checks: ["compare", "count", "operation", "sequence"],
      formats: ["draw", "number-line", "tick-one", "write-number"],
      figures: ["dots", "number-line", "ten-frame"],
    });
  });

  it("U7: places with a ten-frame, number lines, skip-counting, compare and patterns, with no failure", async () => {
    const d = await draft(plan("U7", 2), teacher);
    expect(holds(d)).toEqual({
      failed: [],
      notChecked: ["a parent checks the item"],
      checks: ["compare", "count", "operation", "pattern", "places", "sequence"],
      formats: ["boxes", "draw", "number-line", "tick-one", "write-number"],
      figures: ["dots", "number-line", "pattern", "ten-frame"],
    });
  });
});
