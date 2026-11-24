import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ContentsTopic, Example, Expr, PageRecord } from "@/lib/reference-record";
import type { buildEvidence } from "./evidence";
import { add, evidenceFor, KEY, makeContents, makeExample, makeItem, makePage, okEvidence } from "./test-records";

const NO_CARRY = "arith add 2x1 horizontal";
const CARRY = "arith add 2x1 horizontal carries=ones_to_tens";

function problemsOf(built: ReturnType<typeof buildEvidence>): string {
  return built.ok ? "" : built.problems.join("\n");
}

describe("which pages belong to a topic (M1)", () => {
  it("takes the topic, its range and its pages with their status, and lists the pages with no photo", () => {
    const e = okEvidence([makePage("11a"), makePage("12b"), makePage("13a", { title: "Joining Pebbles 2" })], {
      statuses: { "demo:Z:12b": "human_checked" },
    });
    expect(e.topic).toEqual({ title: "Joining Pebbles 1", sheet_range: [11, 12], std_time_min: [2, 4] });
    expect(e.pages.map((p) => [p.ref, p.status, p.facts])).toEqual([
      ["demo:Z:11a", "double_read", "used"],
      ["demo:Z:12b", "human_checked", "used"],
    ]);
    expect(e.pages_without_photo).toEqual({ pages: ["demo:Z:11b", "demo:Z:12a"] });
  });

  it("says not_stated for what the chart does not state, and then takes pages by title and number", () => {
    const contents = makeContents([
      { n: 1, title: "Joining Pebbles 1", sheets: null, std_time_min: null },
      { n: 2, title: "Joining Pebbles 2", sheets: null, std_time_min: "unclear" },
    ]);
    const older = makePage("15a");
    older.topic = { title: "Joining Pebbles", number: 1 };
    const e = okEvidence([makePage("11a"), older, makePage("13a", { title: "Joining Pebbles 2" }), makePage("14a", { title: null })], {
      contents,
    });
    expect(e.topic).toEqual({ title: "Joining Pebbles 1", sheet_range: "not_stated", std_time_min: "not_stated" });
    expect(e.pages.map((p) => p.ref)).toEqual(["demo:Z:11a", "demo:Z:15a"]);
    expect(e.pages_without_photo.pages).toBe("not_stated");
    expect(e.unplaced_pages).toEqual({ pages: ["demo:Z:14a"] });
  });

  it.each([
    ["Joining Pebbles No.1", true], ["Joining Pebbles #1", true], ["Joining Pebbles (1)", true], ["JOINING  Pebbles No. 1", true], ["Joining Pebbles 1.", true],
    ["Joining Pebbles 2", false], ["Joining Pebbles", false], ["Joining Pebbles 11", false], ["Joining Pebbles -1", false], ["Joining Pebbles 1.1", false],
  ])("compares the title %j with the topic titles: in the topic %j", (title, inTopic) => {
    for (const [onPage, inChart] of [[title, "Joining Pebbles 1"], ["Joining Pebbles 1", title]]) {
      const e = okEvidence([makePage("11a", { title: onPage })], {
        contents: makeContents([{ n: 1, title: inChart, sheets: null, std_time_min: null }]),
      });
      expect([e.pages.length, e.unplaced_pages.pages.length], onPage).toEqual(inTopic ? [1, 0] : [0, 1]);
    }
  });

  it("does not place a page by the title of a machine_read page, unless the caller asks", () => {
    const contents = makeContents([{ n: 1, title: "Joining Pebbles 1", sheets: null, std_time_min: null }]);
    const statuses = { "demo:Z:11a": "machine_read" as const };
    const off = okEvidence([makePage("11a")], { contents, statuses });
    expect([off.pages, off.unplaced_pages]).toEqual([[], { pages: ["demo:Z:11a"] }]);
    const on = okEvidence([makePage("11a"), makePage("12a", { title: "Other" })], {
      contents, statuses: { ...statuses, "demo:Z:12a": "machine_read" }, includeMachineRead: true,
    });
    expect(on.pages).toMatchObject([{ ref: "demo:Z:11a", machine_read: ["demo:Z:11a"] }]);
    expect(on.unplaced_pages).toEqual({ pages: ["demo:Z:12a"], machine_read: ["demo:Z:12a"] });
  });

  it("does not stop on the title of a machine_read page in the printed range", () => {
    const pages = [makePage("11a", { title: "Joining Pebbles 2" })];
    expect(okEvidence(pages, { statuses: { "demo:Z:11a": "machine_read" } }).pages).toMatchObject([{ facts: "withheld" }]);
  });

  it("leaves a page in no range to another topic of the same title that has no range", () => {
    const contents = makeContents([
      { n: 1, title: "Same", sheets: [11, 12], std_time_min: null },
      { n: 2, title: "Same", sheets: null, std_time_min: null },
    ]);
    expect(okEvidence([makePage("20a", { title: "Same" })], { contents }).pages).toEqual([]);
  });

  it("uses no field of the chart that only one reader read", () => {
    const e = okEvidence([makePage("11a")], {
      contents: makeContents(undefined, { single_read: ["topics[0].sheets", "topics[0].std_time_min"] }),
      statuses: { "demo:Z:contents": "agreement_accepted" },
    });
    expect(e.topic).toEqual({ title: "Joining Pebbles 1", sheet_range: "not_stated", std_time_min: "not_stated" });
  });

  it.each<[string, string, Parameters<typeof evidenceFor>]>([
    ["no contents record", "no contents record", [[], { contents: { ...makeContents(), source_ref: "demo:Y:contents" } }]],
    ["a topic that the chart does not list", "topic 9 is not in", [[], { key: { ...KEY, topic: 9 } }]],
    ["a topic list that one reader read", "one reader", [[], { contents: makeContents(undefined, { single_read: ["topics"] }) }]],
    ["a topic number that one reader read", "one reader", [[], { contents: makeContents(undefined, { single_read: ["topics[0].n"] }) }]],
    ["a chart with the status machine_read", "machine_read", [[], { statuses: { "demo:Z:contents": "machine_read" } }]],
    ["a level in another letter case", "another spelling", [[makePage("11a", { level: "z" })]]],
    ["a sheet number with a leading zero", "another spelling", [[makePage("011a")]]],
    ["a page id that one reader read", "page id was read by one reader", [[makePage("11a", { single_read: ["source_ref"] })]]],
    ["a page whose title is another topic's", "prints the title of topic 2", [[makePage("11a", { title: "Joining Pebbles 2" })]]],
    ["a page of this title in another topic's range", "in the sheet range of topic 2", [[makePage("13a")]]],
    ["a page of this title in no topic's range", "is in no sheet range", [[makePage("20a")]]],
    [
      "ranges that overlap",
      "overlap",
      [[], { contents: makeContents([
        { n: 1, title: "A", sheets: [11, 12], std_time_min: null },
        { n: 2, title: "B", sheets: [12, 13], std_time_min: null },
      ]) }],
    ],
    [
      "two topics with one title and no ranges",
      "same title",
      [[makePage("11a", { title: "Same" })], { contents: makeContents([
        { n: 1, title: "Same", sheets: null, std_time_min: null },
        { n: 2, title: "Same", sheets: null, std_time_min: null },
      ]) }],
    ],
    ["a range too long to be one topic", "too long", [[], { contents: makeContents([{ n: 1, title: "A", sheets: [1, 100_000_000], std_time_min: null }]) }]],
    ["a sheet number over the bound", "over 2147483647", [[makePage("2147483648a")]]],
    ...([
      { n: 1, title: "A", sheets: [2 ** 53, 2 ** 53], std_time_min: null },
      { n: 1, title: "A", sheets: [1, 2_147_483_648], std_time_min: null },
      { n: 1, title: "A", sheets: null, std_time_min: [1, 2_147_483_648] },
      { n: 2_147_483_648, title: "A", sheets: null, std_time_min: null },
    ] as ContentsTopic[]).map((topic): [string, string, Parameters<typeof evidenceFor>] => [
      `the chart line ${JSON.stringify(topic)}`, "over 2147483647", [[], { contents: makeContents([topic]), key: { ...KEY, topic: topic.n } }],
    ]),
  ])("stops on %s", (_name, text, args) => {
    expect(problemsOf(evidenceFor(...args))).toContain(text);
  });

  it("uses a page in the range whose title is in no topic, and marks it", () => {
    const e = okEvidence([makePage("11a", { title: "Pebbles" })]);
    expect(e.pages[0]).toMatchObject({ ref: "demo:Z:11a", printed_title_differs: true });
  });
});

describe("the facts (M2)", () => {
  it("lists the step, the questions and the operation of each sheet side", () => {
    const e = okEvidence([
      makePage("11a", { items: [makeItem(1, add(23, 4)), makeItem(2, add(28, 4)), makeItem(3, add(31, 5)), makeItem(4, null)] }),
    ]);
    expect(e.sheets).toEqual([
      { page: "demo:Z:11a", questions: 3, steps: [{ id: NO_CARRY, questions: 2 }, { id: CARRY, questions: 1 }] },
    ]);
    expect(e.steps.map((s) => s.features)).toEqual([
      { expr_kind: "arith", form: "horizontal", operation: "add", operand_digits: [2, 1], carries: [] },
      { expr_kind: "arith", form: "horizontal", operation: "add", operand_digits: [2, 1], carries: ["ones_to_tens"] },
    ]);
  });

  it.each<[string, Expr, "horizontal" | "vertical" | "bracket", string]>([
    ["subtract with a borrow", { kind: "arith", op: "sub", operands: [32, 7] }, "vertical", "arith sub 2x1 vertical borrows=tens_to_ones"],
    ["divide with a remainder", { kind: "arith", op: "div", operands: [17, 5] }, "bracket", "arith div 2x1 bracket remainder=yes"],
    ["divide with no remainder", { kind: "arith", op: "div", operands: [15, 5] }, "bracket", "arith div 2x1 bracket remainder=no"],
    ["a missing second number", { kind: "missing", op: "add", operands: [23, null], result: 27 }, "horizontal", "missing add 2x_=2 horizontal"],
    ["a missing first number", { kind: "missing", op: "add", operands: [null, 3], result: 27 }, "horizontal", "missing add _x1=2 horizontal"],
    ["a missing first number with a short result", { kind: "missing", op: "add", operands: [null, 3], result: 7 }, "horizontal", "missing add _x1=1 horizontal"],
    ["a missing result", { kind: "missing", op: "add", operands: [23, 4], result: null }, "horizontal", "missing add 2x1=_ horizontal"],
    ["a missing number with a carry", { kind: "missing", op: "add", operands: [null, 8], result: 31 }, "horizontal", "missing add _x1=2 horizontal carries=ones_to_tens"],
    ["a chain", { kind: "chain", terms: [5, null, 15] }, "horizontal", "chain step 5 horizontal"],
    ["a word problem", { kind: "word", text: "story", expr: add(23, 4) }, "horizontal", "word add 2x1 horizontal"],
    ["a linked pair", { kind: "linked", pair: [add(23, 4), add(4, 23)] }, "horizontal", "linked horizontal [arith add 2x1 horizontal | arith add 1x2 horizontal]"],
  ])("names the step of %s", (_name, expr, form, id) => {
    expect(okEvidence([makePage("11a", { items: [makeItem(1, expr, form)] })]).steps.map((s) => s.id)).toEqual([id]);
  });

  it.each<[string, Expr, string]>([
    ["notation", { kind: "notation", latex: "x+1" }, "not_stated"],
    ["a decimal", add(0.5, 0.7), "add"],
    ["a negative number", add(-3, 5), "add"],
    ["a difference under zero", { kind: "arith", op: "sub", operands: [3, 9] }, "sub"],
    ["a division by zero", { kind: "arith", op: "div", operands: [3, 0] }, "div"],
    ["a product too large to be exact", { kind: "arith", op: "mul", operands: [9_007_199_254_740_991, 9_007_199_254_740_991, 9] }, "mul"],
    ["an unclear number", { kind: "arith", op: "add", operands: ["unclear", 4] }, "add"],
    ["an unclear operation", { kind: "arith", op: "unclear", operands: [23, 4] }, "not_stated"],
    ["a missing number with a decimal", { kind: "missing", op: "mul", operands: [null, 4], result: 0.8 }, "mul"],
    ["a word problem with no expression", { kind: "word", text: "story", expr: null }, "not_stated"],
    ["a word problem with a decimal", { kind: "word", text: "story", expr: add(0.5, 1) }, "add"],
    ["a chain of decimals that is a whole number apart", { kind: "chain", terms: [0.5, null, 2.5] }, "not_stated"],
    ["a chain of whole numbers that is not a whole number apart", { kind: "chain", terms: [1, null, 2] }, "not_stated"],
    ["a chain that goes under zero", { kind: "chain", terms: [1, null, -1] }, "not_stated"],
    ["a chain with no known step", { kind: "chain", terms: [5, null] }, "not_stated"],
    ["a chain whose step is unclear", { kind: "chain", terms: [5, null, 15], step: "unclear" }, "not_stated"],
    ["half a linked pair", { kind: "linked", pair: [add(1, 2), { kind: "notation", latex: "x" }] }, "not_stated"],
  ])("does not guess the step of %s, and keeps what it knows", (_name, expr, operation) => {
    const e = okEvidence([makePage("11a", { items: [makeItem(1, expr, "vertical")] })]);
    expect(e.steps).toEqual([
      {
        id: "page demo:Z:11a", features: "not_stated", pages: ["demo:Z:11a"], methods: [],
        partly_known: [{ expr_kind: expr.kind, operation, form: "vertical" }],
      },
    ]);
    expect(e.sheets[0].questions).toBe(1);
  });

  it("says where each example is and what it shows, in kinds only", () => {
    const example = makeExample(add(23, 4), "vertical", {
      label: "Ex.",
      text: "secret words",
      steps: [{ n: 1, shows: "carry", printed: "secret words" }, { n: 2, shows: "unclear", printed: null }],
    });
    const e = okEvidence([makePage("11a", { examples: [example] })]);
    expect(e.examples).toEqual([
      {
        page: "demo:Z:11a",
        position: "top",
        relation: "sequence",
        forms: ["vertical"],
        expr_kinds: ["arith"],
        steps_shown: ["carry", "not_stated"],
        marks: ["arrow"],
      },
    ]);
    expect(JSON.stringify(e)).not.toContain("secret");
  });

  it("gives the last page of each scaffold and the later pages that code does not know", () => {
    const boxes = [{ kind: "answer_boxes" as const, applies_to: "all" as const }];
    const strip = [{ kind: "number_strip" as const, applies_to: "all" as const, values: [1, 2] }];
    const e = okEvidence([
      makePage("11a", { scaffolds: [...boxes, ...strip] }),
      makePage("11b", { scaffolds: boxes }),
      makePage("12a", { scaffolds: "unclear" }),
    ]);
    expect(e.scaffolds).toEqual([
      { kind: "answer_boxes", pages: ["demo:Z:11a", "demo:Z:11b"], last_page: "demo:Z:11b", not_known_after: ["demo:Z:12a", "demo:Z:12b"] },
      { kind: "number_strip", pages: ["demo:Z:11a"], last_page: "demo:Z:11a", not_known_after: ["demo:Z:12a", "demo:Z:12b"] },
    ]);
  });

  it("gives each change of the question format and the unknown pages between", () => {
    const vertical = [makeItem(1, add(23, 4), "vertical")];
    const e = okEvidence([
      makePage("11a"),
      makePage("11b", { items: [makeItem(1, add(23, 4), "vertical")], single_read: ["sections[0].items[0].form"] }),
      makePage("12b", { items: vertical }),
    ]);
    expect(e.format_changes).toEqual([
      {
        from: "demo:Z:11a",
        to: "demo:Z:12b",
        before: ["arith horizontal"],
        after: ["arith vertical"],
        not_known_between: ["demo:Z:11b", "demo:Z:12a"],
      },
    ]);
  });

  it("compares the order of the formats on a page, not only the set", () => {
    const form = (...forms: Array<"horizontal" | "vertical">) => forms.map((f, i) => makeItem(i + 1, add(23, 4), f));
    const e = okEvidence([
      makePage("11a", { items: form("horizontal", "horizontal", "vertical") }),
      makePage("11b", { items: form("horizontal", "vertical", "vertical") }),
      makePage("12a", { items: form("vertical", "horizontal") }),
    ]);
    expect(e.format_changes.map((c) => [c.from, c.to, c.before, c.after])).toEqual([
      ["demo:Z:11b", "demo:Z:12a", ["arith horizontal", "arith vertical"], ["arith vertical", "arith horizontal"]],
    ]);
  });

  it("works with zero pages and with one page", () => {
    const none = okEvidence([]);
    expect([none.pages, none.sheets, none.steps, none.gaps]).toEqual([[], [], [], []]);
    expect(none.pages_without_photo.pages).toEqual(["demo:Z:11a", "demo:Z:11b", "demo:Z:12a", "demo:Z:12b"]);
    expect(okEvidence([makePage("12a")]).sheets).toHaveLength(1);
  });

  it("gives the same facts for every order of the records and leaves the records unchanged", () => {
    const exprArb = fc.oneof(
      fc.tuple(fc.nat(99), fc.nat(99)).map(([a, b]) => add(a, b)),
      fc.tuple(fc.nat(99), fc.integer({ min: 1, max: 9 })).map(([a, b]): Expr => ({ kind: "arith", op: "div", operands: [a, b] })),
      fc.constant<Expr>({ kind: "notation", latex: "x" }),
    );
    const pageArb = fc.record({
      items: fc.array(fc.tuple(exprArb, fc.constantFrom("horizontal" as const, "vertical" as const)), { maxLength: 4 }),
      example: fc.option(exprArb),
      strip: fc.boolean(),
    });
    const sheets = ["2a", "2b", "10a", "10b", "11a"];
    fc.assert(
      fc.property(fc.array(pageArb, { maxLength: 5 }), fc.infiniteStream(fc.nat()), (specs, keys) => {
        const pages = specs.map((s, i) =>
          makePage(sheets[i], {
            items: s.items.map(([expr, form], n) => makeItem(n + 1, expr, form)),
            examples: s.example ? [makeExample(s.example)] : [],
            scaffolds: s.strip ? [{ kind: "number_strip", applies_to: "all", values: [1, 2] }] : [],
          }),
        );
        const contents = makeContents([{ n: 1, title: "Joining Pebbles 1", sheets: [2, 11], std_time_min: null }]);
        const before = JSON.stringify(pages);
        const shuffled = pages
          .map((page) => ({ page, at: keys.next().value as number }))
          .sort((a, b) => a.at - b.at)
          .map(({ page }) => page);
        const e = okEvidence(pages, { contents });
        expect(okEvidence(shuffled, { contents })).toEqual(e);
        expect(e.pages.map((p) => p.ref)).toEqual(pages.map((p) => p.source_ref));
        expect(JSON.stringify(pages)).toBe(before);
      }),
    );
  });
});

describe("steps with no method (M5, Y2)", () => {
  const items = [makeItem(1, add(23, 4)), makeItem(2, add(28, 4))];
  const gapsOf = (page: PageRecord, statuses = {}): Array<[string, string[]]> =>
    okEvidence([page], { statuses }).gaps.map((g) => [g.step, g.hints.map((h) => `${h.at} ${h.kind}`)]);

  it("takes a worked example of the same known step for a method, and lists every other step as a gap", () => {
    const e = okEvidence([makePage("11a", { items, examples: [makeExample(add(45, 3))] }), makePage("12a", { items })]);
    expect(e.steps.find((s) => s.id === NO_CARRY)?.methods).toEqual([{ page: "demo:Z:11a", example: 0 }]);
    expect(e.gaps).toEqual([{ step: CARRY, kind: "no_method", pages: ["demo:Z:11a", "demo:Z:12a"], hints: [] }]);
  });

  it.each<[string, Partial<Example>, boolean]>([
    ["steps and one part", {}, true],
    ["two parts of one step", { parts: [{ form: "horizontal", expr: add(45, 3) }, { form: "horizontal", expr: add(32, 4) }] }, true],
    ["a shown answer and no steps", { steps: [], parts: [{ form: "horizontal", expr: add(45, 3), shown_answer: "48" }] }, true],
    ["no steps and no shown answer", { steps: [] }, false],
    ["setup steps only", { steps: [{ n: 1, shows: "setup", printed: "45" }, { n: 2, shows: "setup", printed: "+ 3" }] }, false],
    ["setup steps and a shown answer", { steps: [{ n: 1, shows: "setup", printed: "45" }], parts: [{ form: "horizontal", expr: add(45, 3), shown_answer: "48" }] }, true],
    ["setup steps and an answer step", { steps: [{ n: 1, shows: "setup", printed: "45" }, { n: 2, shows: "answer", printed: "48" }] }, true],
    ["steps left out and no shown answer", { steps: undefined }, false],
    ["no printed answer", { steps: [], parts: [{ form: "horizontal", expr: add(45, 3), shown_answer: null }] }, false],
    ["steps that can belong to another part", { parts: [{ form: "horizontal", expr: add(45, 3) }, { form: "vertical", expr: add(45, 3) }] }, false],
    ["steps that nobody could read", { steps: "unclear" }, false],
    ["a step that nobody could read", { steps: [{ n: 1, shows: "carry", printed: "unclear" }] }, false],
    ["a part beside it that nobody could read", { parts: [{ form: "horizontal", expr: add(45, 3) }, { form: "unclear", expr: add(45, 3) }] }, false],
    ["an answer that nobody could read", { parts: [{ form: "horizontal", expr: add(45, 3), shown_answer: "unclear" }] }, false],
  ])("decides whether an example with %s is a method", (_name, extra, isMethod) => {
    const e = okEvidence([makePage("11a", { items: [makeItem(1, add(23, 4))], examples: [makeExample(add(45, 3), "horizontal", extra)] })]);
    const step = e.steps.find((s) => s.id === NO_CARRY);
    expect(step?.methods.length).toBe(isMethod ? 1 : 0);
    const gap = e.gaps.find((g) => g.step === NO_CARRY);
    expect(gap?.hints.some((h) => h.kind === "example")).toBe(isMethod ? undefined : true);
  });

  it.each([
    "caption", "number_strip", "arrow", "equation_frame", "table_read_aloud", "helper_digit", "partial_working", "worked_item", "other",
  ] as const)("lists the scaffold %s as a hint and keeps the gap", (kind) => {
    const fields = { text: "Use a pencil.", values: [1, 2], template: "_ + _", description: "a drawing" };
    const scaffold = { kind, applies_to: "all", ...fields } as never;
    expect(gapsOf(makePage("11a", { items: [makeItem(1, add(28, 4))], scaffolds: [scaffold] }))).toEqual([
      [CARRY, [`sections[0].scaffolds[0] ${kind}`]],
    ]);
  });

  it("gives a hint only to the steps of the questions that it applies to, and an unknown one to every step", () => {
    const helper = (applies_to: number[] | "all" | "unclear") => ({ kind: "helper_digit" as const, applies_to });
    const at = "sections[0].scaffolds[0] helper_digit";
    expect(gapsOf(makePage("11a", { items, scaffolds: [helper([2])] }))).toEqual([[NO_CARRY, []], [CARRY, [at]]]);
    expect(gapsOf(makePage("11a", { items, scaffolds: [helper("unclear")] }))).toEqual([[NO_CARRY, [at]], [CARRY, [at]]]);
    expect(gapsOf(makePage("11a", { items, scaffolds: [{ kind: "answer_boxes", applies_to: "all" }] }))).toEqual([[NO_CARRY, []], [CARRY, []]]);
  });

  it.each<[string, Parameters<typeof makePage>[1], string]>([
    ["an example with no expression", { examples: [makeExample(null)] }, "examples[0] example"],
    ["an example that code cannot match", { examples: [makeExample({ kind: "notation", latex: "x" })] }, "examples[0] example"],
    ["an example with two parts that code cannot match", { examples: [makeExample(null, "horizontal", { parts: [{ form: "horizontal", expr: null }, { form: "vertical", expr: null }] })] }, "examples[0] example"],
    ["examples that are not known", { examples: "unclear" }, "examples example"],
    ["scaffolds that are not known", { scaffolds: "not_stated" }, "sections[0].scaffolds not_stated"],
    ["an example that one reader read", { examples: [makeExample(add(45, 3))], single_read: ["examples[0]"] }, "examples[0] example"],
    ["an example whose steps one reader read", { examples: [makeExample(add(45, 3))], single_read: ["examples[0].steps"] }, "examples[0] example"],
    ["an example whose answer place one reader read", { examples: [makeExample(add(45, 3))], single_read: ["examples[0].parts[0].form"] }, "examples[0] example"],
    ["a caption whose text one reader read", { scaffolds: [{ kind: "caption", text: "Count back.", applies_to: "all" }], single_read: ["sections[0].scaffolds[0].text"] }, "sections[0].scaffolds[0] caption"],
  ])("keeps the gap and gives a hint for %s", (_name, opts, hint) => {
    const status = opts?.single_read ? { "demo:Z:11a": "agreement_accepted" } : {};
    const gaps = gapsOf(makePage("11a", { items: [makeItem(1, add(23, 4))], ...opts }), status);
    expect(gaps.find(([step]) => step === NO_CARRY)?.[1]).toEqual([hint]);
  });

  it("gives no hint of an example that is clearly about another step", () => {
    expect(gapsOf(makePage("11a", { items, examples: [makeExample(add(45, 3), "horizontal", { steps: [] })] }))).toEqual([
      [NO_CARRY, ["examples[0] example"]],
      [CARRY, []],
    ]);
  });

  it("never closes a step that code cannot tell, and keeps it on its own page", () => {
    const notation = [makeItem(1, { kind: "notation", latex: "x+1" })];
    const e = okEvidence([
      makePage("11a", { items: notation, examples: [makeExample({ kind: "notation", latex: "x" })], scaffolds: [{ kind: "worked_item", applies_to: "all" }] }),
      makePage("11b", { items: notation }),
    ]);
    expect(e.gaps.map((g) => [g.step, g.kind, g.hints.map((h) => h.at)])).toEqual([
      ["page demo:Z:11a", "step_not_known", ["sections[0].scaffolds[0]", "examples[0]"]],
      ["page demo:Z:11b", "step_not_known", []],
    ]);
  });
});

describe("what may become a fact (M7)", () => {
  const single = (single_read: string[]): PageRecord =>
    makePage("11a", { items: [makeItem(1, add(23, 4))], examples: [makeExample(add(23, 4))], scaffolds: [{ kind: "number_strip", applies_to: "all", values: [1, 2] }], single_read });

  it.each<[string, (e: ReturnType<typeof okEvidence>) => unknown, unknown]>([
    ["sections", (e) => [e.sheets[0].questions, e.scaffolds], ["not_stated", []]],
    ["sections[0]", (e) => [e.sheets[0].questions, e.scaffolds], ["not_stated", []]],
    ["sections[0].items", (e) => [e.sheets[0].questions, e.steps.map((s) => s.features)], ["not_stated", ["not_stated", expect.any(Object)]]],
    ["sections[0].items[0]", (e) => e.sheets[0].questions, "not_stated"],
    ["sections[0].items[0].expr", (e) => e.sheets[0].questions, "not_stated"],
    ["sections[0].items[0].expr.operands[1]", (e) => e.sheets[0].steps, [{ id: "page demo:Z:11a", questions: 1 }]],
    ["sections[0].items[0].form", (e) => e.sheets[0].steps, [{ id: "page demo:Z:11a", questions: 1 }]],
    ["sections[0].scaffolds", (e) => e.scaffolds, []],
    ["sections[0].scaffolds[0].kind", (e) => e.scaffolds, []],
    ["sections[0].scaffolds[0].applies_to", (e) => e.scaffolds.length, 1],
    ["examples", (e) => [e.examples, e.examples_not_known], [[], ["demo:Z:11a"]]],
    ["examples[0]", (e) => [e.examples, e.examples_not_known], [[], ["demo:Z:11a"]]],
    ["examples[0].position", (e) => e.examples[0].position, "not_stated"],
    ["examples[0].steps", (e) => e.examples[0].steps_shown, "not_stated"],
    ["examples[0].steps[0].shows", (e) => e.examples[0].steps_shown, ["not_stated", "carry"]],
    ["examples[0].parts[0].expr", (e) => e.examples[0].expr_kinds, ["not_stated"]],
    ["topic.title", (e) => e.pages[0].printed_title_differs, undefined],
  ])("makes no fact of %s when one reader read it", (path, pick, expected) => {
    const e = okEvidence([single([path])], { statuses: { "demo:Z:11a": "agreement_accepted" } });
    expect(pick(e)).toEqual(expected);
  });

  it("does not place a page by a title that one reader read or that is unclear", () => {
    const topics: ContentsTopic[] = [{ n: 1, title: "Joining Pebbles 1", sheets: null, std_time_min: null }];
    const e = okEvidence([makePage("11a", { single_read: ["topic.title"] }), makePage("12a", { title: "unclear" })], {
      contents: makeContents(topics),
    });
    expect([e.pages, e.unplaced_pages.pages]).toEqual([[], ["demo:Z:11a", "demo:Z:12a"]]);
  });

  it("takes an unclear title for no title, in the chart and on a page", () => {
    const unclear = makeContents([{ n: 1, title: "unclear", sheets: [11, 12], std_time_min: null }]);
    expect(okEvidence([], { contents: unclear }).topic.title).toBe("not_stated");
    expect(okEvidence([makePage("11a", { title: "unclear" })]).pages[0].printed_title_differs).toBeUndefined();
  });

  it("takes no facts from a machine_read page, and lists the page", () => {
    const e = okEvidence([makePage("11a", { examples: [makeExample(add(23, 4))] }), makePage("11b")], {
      statuses: { "demo:Z:11a": "machine_read" },
    });
    expect(e.pages.map((p) => [p.ref, p.status, p.facts])).toEqual([
      ["demo:Z:11a", "machine_read", "withheld"],
      ["demo:Z:11b", "double_read", "used"],
    ]);
    expect([e.sheets.map((s) => s.page), e.examples, e.gaps.length]).toEqual([["demo:Z:11b"], [], 1]);
    expect(JSON.stringify(e)).not.toContain("machine_read\":[");
  });

  it("marks every fact that rests on a machine_read record when the caller asks for them", () => {
    const strip = [{ kind: "number_strip" as const, applies_to: "all" as const, values: [1, 2] }];
    const e = okEvidence(
      [
        makePage("11a", { scaffolds: strip, examples: [makeExample(add(23, 4))], items: [makeItem(1, add(23, 4)), makeItem(2, { kind: "notation", latex: "x" })] }),
        makePage("11b", { items: [makeItem(1, add(28, 4), "vertical")] }),
      ],
      { statuses: { "demo:Z:11a": "machine_read", "demo:Z:contents": "machine_read" }, includeMachineRead: true },
    );
    const chart = ["demo:Z:contents"];
    const mark = [...chart, "demo:Z:11a"];
    expect([e.topic, e.pages_without_photo, e.unplaced_pages].map((f) => f.machine_read)).toEqual([chart, chart, chart]);
    expect(e.pages.map((p) => p.machine_read)).toEqual([mark, chart]);
    expect(e.sheets.map((s) => s.machine_read)).toEqual([mark, chart]);
    expect(e.examples[0].machine_read).toEqual(mark);
    expect(e.scaffolds[0].machine_read).toEqual(mark);
    expect(e.format_changes[0].machine_read).toEqual(mark);
    expect(e.steps.map((s) => [s.id, s.machine_read])).toEqual([
      [NO_CARRY, mark],
      ["page demo:Z:11a", mark],
      ["arith add 2x1 vertical carries=ones_to_tens", chart],
    ]);
    expect(e.gaps.map((g) => [g.step, g.machine_read])).toEqual([
      ["page demo:Z:11a", mark],
      ["arith add 2x1 vertical carries=ones_to_tens", chart],
    ]);
  });

  it("changes the digest of a page when any field of its record changes, not when its keys move", () => {
    const page = makePage("11a");
    const moved = Object.fromEntries(Object.entries(page).reverse()) as unknown as PageRecord;
    const changed = { ...page, readers: ["one", "three"] };
    const digest = (p: PageRecord): string => okEvidence([p]).pages[0].sha256;
    expect(digest(page)).toMatch(/^[0-9a-f]{64}$/);
    expect(digest(moved)).toBe(digest(page));
    expect(digest(changed)).not.toBe(digest(page));
  });
});
