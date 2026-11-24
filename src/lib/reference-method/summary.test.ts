import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import type { Expr, PageItem, PageRecord } from "@/lib/reference-record";
import { checkSummary, type SummaryContext } from "./summary";
import { plainSentence } from "./sentence-text";
import { add, evidenceFor, KEY, makeExample, makeItem, makePage } from "./test-records";

const NO_CARRY = "arith add 2x1 horizontal";
const CARRY = "arith add 2x1 horizontal carries=ones_to_tens";

function contextOf(...args: Parameters<typeof evidenceFor>): SummaryContext {
  const built = evidenceFor(...args);
  if (!built.ok) throw new Error(built.problems.join("\n"));
  return { key: KEY, evidence: built.evidence, views: built.views };
}

let ctx: SummaryContext;
beforeEach(() => {
  // 11a: an example with no carry, questions with and without a carry. 11b: a carry only, no method.
  // 12a: machine_read, so withheld. 12b: no photo.
  ctx = contextOf(
    [
      makePage("11a", { examples: [makeExample(add(45, 3))], items: [makeItem(1, add(23, 4)), makeItem(2, add(28, 4))] }),
      makePage("11b", { items: [makeItem(1, add(68, 7))] }),
      makePage("12a"),
    ],
    { statuses: { "demo:Z:12a": "machine_read" } },
  );
});

function errorsOf(sentence: unknown): string {
  const result = checkSummary([sentence], ctx);
  return result.ok ? "" : result.errors.map((e) => `${e.path}: ${e.message}`).join("\n");
}

function say(text: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { kind: "introduces", text, cites: ["demo:Z:11a"], ...extra };
}

describe("a sentence and its citations (M4)", () => {
  it("accepts a cited sentence, a guess, and a sentence about the contents chart", () => {
    expect(errorsOf(say("[11a] adds a small number."))).toBe("");
    expect(errorsOf({ kind: "introduces", text: "Perhaps [12b] adds too.", cites: ["demo:Z:12b"], guess: true })).toBe("");
    expect(errorsOf({ kind: "progression", text: "The chart gives a short time.", cites: ["demo:Z:contents"] })).toBe("");
  });

  it.each<[string, unknown, string]>([
    ["not an object", "text", "must be a sentence object"],
    ["an unknown field", say("[11a] adds.", { note: "x" }), "unknown field"],
    ["an unknown kind", say("[11a] adds.", { kind: "method" }), "must be one of introduces, procedure, progression"],
    ["no text", say("  "), "must be a non-empty text"],
    ["a line break in the text", say("[11a] adds.\nMore."), "one line"],
    ["a line separator in the text", say("[11a] adds.\u2028More."), "one line"],
    ["an invisible character", say("[11a] adds `23\u034F + 4`."), "one line"],
    ["a very long text", say(`[11a] ${"a".repeat(600)}`), "600 characters"],
    ["cites that are not a list", say("[11a] adds.", { cites: "demo:Z:11a" }), "must be a list"],
    ["a cite twice", say("[11a] adds.", { cites: ["demo:Z:11a", "demo:Z:11a"] }), "cited twice"],
    ["guess: false", say("[11a] adds.", { guess: false }), "must be true"],
    ["no citation and no guess", say("It adds.", { cites: [] }), "needs a citation"],
    ["a page of another topic", say("[13a] adds.", { cites: ["demo:Z:13a"] }), '"demo:Z:13a" is not a page of this topic'],
    ["a page of another topic in a guess", say("[13a] adds.", { cites: ["demo:Z:13a"], guess: true }), "is not a page of this topic"],
    ["a page of another level", say("[11a] adds.", { cites: ["demo:Y:11a"] }), "is not a page of this topic"],
    ["a page with no photo", say("[12b] adds.", { cites: ["demo:Z:12b"] }), "has no photo"],
    ["a page that gives no facts", say("[12a] adds.", { cites: ["demo:Z:12a"] }), "gives no facts"],
    ["damaged text", say("[11a] adds \uFFFD."), "damaged text"],
    ["half a character", say("[11a] adds \uD800."), "damaged text"],
    ["a null character", say("[11a] adds \u0000."), "damaged text"],
  ])("refuses %s", (_name, sentence, text) => {
    expect(errorsOf(sentence)).toContain(text);
  });

  it("refuses an empty summary only when there are pages with facts", () => {
    expect(checkSummary([], ctx).ok).toBe(false);
    expect(checkSummary([], contextOf([])).ok).toBe(true);
    expect(checkSummary("no", ctx).ok).toBe(false);
  });
});

describe("page tokens (Y1)", () => {
  it.each<[string, string[]]>([
    ["[11a] adds.", ["demo:Z:11a"]],
    ["On page [11a] (and [11b]), it adds.", ["demo:Z:11a", "demo:Z:11b"]],
    ["\"[11a]\", [11b]: it adds. Then [11a] repeats.", ["demo:Z:11b", "demo:Z:11a"]],
    ["[11a] follows the chart.", ["demo:Z:11a", "demo:Z:contents"]],
  ])("accepts %j", (text, cites) => {
    expect(errorsOf(say(text, { cites }))).toBe("");
  });

  it.each<[string, string[], string]>([
    ["a page that it names and does not cite", ["[11a] and [11b] add.", "demo:Z:11a"], '[11b] is not in "cites"'],
    ["a page that it cites and does not name", ["[11a] adds.", "demo:Z:11a", "demo:Z:11b"], 'has no token [11b]'],
    ["no token at all", ["It adds.", "demo:Z:11a"], "has no token [11a]"],
    ["a range in a token", ["[11a-11b] add.", "demo:Z:11a", "demo:Z:11b"], "is not a page token"],
    ["two pages in a token", ["[11a, 11b] add.", "demo:Z:11a", "demo:Z:11b"], "is not a page token"],
    ["a dash between two tokens", ["[11a] - [11b] add.", "demo:Z:11a", "demo:Z:11b"], "never a range"],
    ["the word to between two tokens", ["[11a] to [11b] add.", "demo:Z:11a", "demo:Z:11b"], "never a range"],
    ["the word through between two tokens", ["[11a] through [11b] add.", "demo:Z:11a", "demo:Z:11b"], "never a range"],
    ["a full ref in a token", ["[demo:Z:11a] adds.", "demo:Z:11a"], "is not a page token"],
    ["a level in a token", ["[Z11a] adds.", "demo:Z:11a"], "is not a page token"],
    ["a sheet with no side", ["[11] adds.", "demo:Z:11a"], "is not a page token"],
    ["a leading zero", ["[011a] adds.", "demo:Z:11a"], "is not a page token"],
    ["a space in a token", ["[11 a] adds.", "demo:Z:11a"], "is not a page token"],
    ["a side in upper case", ["[11A] adds.", "demo:Z:11a"], "is not a page token"],
    ["another level before the token", ["demo:Y:[11a] adds.", "demo:Z:11a"], "a space around"],
    ["letters after the token", ["[11a]s add.", "demo:Z:11a"], "a space around"],
    ["an open bracket", ["[11a] adds [", "demo:Z:11a"], "bracket or backtick"],
    ["an open backtick", ["[11a] adds `4", "demo:Z:11a"], "bracket or backtick"],
    ["an empty token", ["[] [11a] adds.", "demo:Z:11a"], "is not a page token"],
  ])(
    "refuses %s, also in a guess",
    (_name, [text, ...cites], error) => {
      expect(errorsOf(say(text, { cites }))).toContain(error);
      expect(errorsOf(say(text, { cites, guess: true }))).toContain(error);
    },
  );
});

describe("text outside the tokens (Y1)", () => {
  it.each([
    "[11a] has 2 questions.", "[11a] adds \uFF12.", "[11a] shows \u00BD.", "[11a] shows x\u00B2.", "[11a] shows \u0663.",
    "[11a] is step \u2167.", "C11a adds.", "Page 11a adds.", "Sheets 11 to 12 add.", "11a\u201312a add.", "See demo:Z:11a.",
    "Question 9 of [11a] adds.", "The 9th question of [11a] adds.", "[11a] takes 2:00.", "[11a] starts with .4.",
  ])("refuses a digit: %j", (text) => {
    expect(errorsOf(say(text))).toContain("no digits outside");
    expect(errorsOf(say(text, { guess: true }))).toContain("no digits outside");
  });

  it.each([
    "two", "nine", "ten", "Twelve", "nineteen", "twenty", "ninety-nine", "forty two", "hundred", "thousand", "two-digit",
  ])("refuses the number word %j", (word) => {
    expect(errorsOf(say(`[11a] has ${word} parts.`))).toContain("number word");
  });

  it.each(["page one", "Sheet one", "question zero", "question number one", "pages no. one", "question `23 + 4`", "page number `23 + 4`"])(
    "refuses %j",
    (words) => {
      expect(errorsOf(say(`[11a] repeats ${words}.`))).toContain("followed by a number");
    },
  );

  it.each(["\u00D7", "=", "+", "%", "\u2212", "\u2014", "\u0430", "\uFF41", "<", "\u00E9"])("refuses the character %j", (sign) => {
    expect(errorsOf(say(`[11a] uses ${sign} here.`))).toContain("plain English");
  });

  it.each([
    "[11a] puts the ones under the ones, the tens under the tens.",
    "[11a] has tens, hundreds and thousands places; the child's first step is \u201Cthe ones\u201D.",
    "On [11a], one step adds the ones / tens (no carry): why? Look!",
    "[11a] often weighs the content.",
  ])("accepts %j", (text) => {
    expect(errorsOf(say(text))).toBe("");
  });

  it("refuses every digit of every script, wherever it stands", () => {
    const digits = Array.from({ length: 0x11_0000 }, (_, c) => c)
      .filter((c) => (c < 0xd800 || c > 0xdfff) && /\p{N}/u.test(String.fromCodePoint(c)))
      .map((c) => String.fromCodePoint(c));
    expect(digits.length).toBeGreaterThan(1_000);
    const word = fc.stringMatching(/^[a-z]{1,5}$/);
    fc.assert(
      fc.property(fc.constantFrom(...digits), word, word, (d, before, after) => {
        expect(errorsOf(say(`[11a] ${before}${d}${after}.`))).toContain("no digits outside");
      }),
    );
  });
});

describe("math between backticks (Y1)", () => {
  function pageWith(items: PageItem[], extra: Partial<PageRecord> = {}): PageRecord {
    return { ...makePage("11a", { items, examples: [makeExample(add(45, 3), "horizontal", { steps: [{ n: 1, shows: "answer", printed: "48" }] })] }), ...extra };
  }
  const printed = (n: number, text: string, expr: Expr = add(23, 4)): PageItem => ({ ...makeItem(n, expr), printed: text });

  beforeEach(() => {
    ctx = contextOf([
      pageWith([
        printed(1, "43 \u00D7 2 = 86", { kind: "arith", op: "mul", operands: [43, 2] }),
        printed(2, "7 \u00F7 3 = 2 R1", { kind: "arith", op: "div", operands: [7, 3] }),
        printed(3, "3/4"),
        printed(4, "\u221212 + 5", add(-12, 5)),
        printed(5, "unclear", { kind: "missing", op: "add", operands: [null, 3], result: 27 }),
        printed(6, "x", { kind: "notation", latex: "\\frac{1}{2}" }),
        printed(7, "1 1/2 + 0.4"),
      ]),
      makePage("11b", { items: [printed(1, "68 + 7")] }),
    ]);
  });

  it.each([
    "43 \u00D7 2", "43\u00D72", "86", "43 \u00D7 2 = 86", "2 R1", "7 \u00F7 3", "3/4", "-12 + 5", "\u221212 + 5", "_ + 3 = 27", "27",
    "\\frac{1}{2}", "1 1/2 + 0.4", "45 + 3", "48",
  ])("accepts %j, which the page prints", (math) => {
    expect(errorsOf(say(`[11a] shows \`${math}\`.`))).toBe("");
  });

  it.each([
    "43 + 2", "2 \u00D7 43", "43 \u00F7 2", "43", "2", "3", "4/3", "4", "2 R4", "2", "R1", "7 R1", "12 + 5", "12", "5", "1/2", "1 1/2", "0.4", ".4",
    "43 \u00D7 2 = 87", "3 \u00D7 2", "6", "86 = 43 \u00D7 2", "24 + 3", "24", "68 + 7", "43 \u00D7", "", " ", "=", "page 4",
  ])("refuses %j, also when its digits are on the page", (math) => {
    expect(errorsOf(say(`[11a] shows \`${math}\`.`))).toMatch(/no cited page prints|bracket or backtick/);
  });

  it.each(["-`86`", "- `86`", "`86`/`27`", "`86` / `27`", "`86``27`", "`86`s", "R`86`", ".`86`", "`2 R1`4"])(
    "refuses %j, which changes the value around the fragment",
    (text) => {
      expect(errorsOf(say(`[11a] shows ${text}.`))).not.toBe("");
    },
  );

  it("takes math only from the pages that the sentence cites", () => {
    expect(errorsOf(say("[11b] adds `43 \u00D7 2`.", { cites: ["demo:Z:11b"] }))).toContain("no cited page prints");
    expect(errorsOf(say("[11b] adds `68 + 7`.", { cites: ["demo:Z:11b"] }))).toBe("");
    expect(errorsOf(say("[11a] and [11b] show `68 + 7`.", { cites: ["demo:Z:11a", "demo:Z:11b"] }))).toBe("");
    expect(errorsOf({ kind: "introduces", text: "The chart shows `11`.", cites: ["demo:Z:contents"] })).toContain("no cited page prints");
  });

  it("takes no evidence from what is not printed: computed answers, question numbers, titles, notes, once-read fields", () => {
    const item = { ...printed(88, "23 + 4"), responses: [{ position: "box" as const, cue: null, answer: "77", answer_source: "computed" as const }] };
    const page = pageWith([item], { topic: { title: "Pebbles 99" }, single_read: ["sections[0].instruction"] });
    page.sections[0].instruction = "66";
    ctx = contextOf([page]);
    for (const math of ["77", "88", "Pebbles 99", "99", "66"]) {
      expect(errorsOf(say(`[11a] shows \`${math}\`.`)), math).toContain("no cited page prints");
    }
    item.responses[0] = { ...item.responses[0], answer_source: "printed" as never };
    delete page.single_read;
    ctx = contextOf([page]);
    for (const math of ["77", "66"]) expect(errorsOf(say(`[11a] shows \`${math}\`.`)), math).toBe("");
  });

  it("does not compare the math of a guess with the pages, and still keeps its syntax", () => {
    expect(errorsOf(say("Perhaps `5 + 5` comes first.", { cites: [], guess: true }))).toBe("");
    expect(errorsOf(say("Perhaps 5 + 5 comes first.", { cites: [], guess: true }))).toContain("no digits outside");
  });

  it("accepts a whole printed expression and refuses each other order of it", () => {
    const n = fc.integer({ min: 10, max: 99 });
    fc.assert(
      fc.property(n, n, (a, b) => {
        fc.pre(a !== b);
        ctx = contextOf([pageWith([printed(1, `${a} - ${b} =`, { kind: "arith", op: "sub", operands: [a, b] })], { examples: [] })]);
        expect(errorsOf(say(`[11a] shows \`${a} \u2212 ${b}\`.`))).toBe("");
        for (const math of [`${b} - ${a}`, `${a} + ${b}`, `${a}`, `${b}`, `-${b}`, `${a} - ${Math.floor(b / 10)}`]) {
          expect(errorsOf(say(`[11a] shows \`${math}\`.`)), math).toContain("no cited page prints");
        }
      }),
      { numRuns: 30 },
    );
  });
});

describe("a procedure (M5, Y2)", () => {
  const how = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    kind: "procedure",
    text: "[11a] adds the ones first.",
    cites: ["demo:Z:11a"],
    steps: [NO_CARRY],
    ...extra,
  });
  const onB = { text: "[11b] adds the ones first.", cites: ["demo:Z:11b"] };

  it("accepts a procedure for a step with a worked example on a cited page", () => {
    expect(errorsOf(how())).toBe("");
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["no steps", { steps: undefined }, "must be a non-empty list"],
    ["no steps in a guess", { steps: undefined, guess: true }, "must be a non-empty list"],
    ["an empty list of steps", { steps: [] }, "must be a non-empty list"],
    ["a step twice", { steps: [NO_CARRY, NO_CARRY] }, "named twice"],
    ["a step that the topic does not have", { steps: ["arith add 9x9 vertical"] }, "is not a step of this topic"],
    ["a step that the topic does not have in a guess", { steps: ["arith add 9x9 vertical"], guess: true }, "is not a step of this topic"],
    ["a step with no method", { steps: [CARRY] }, `no cited page has a worked example of "${CARRY}"`],
    ["a step with no method beside one with a method", { steps: [NO_CARRY, CARRY] }, "no cited page has a worked example"],
    ["a step whose example is on another page", { ...onB, steps: [NO_CARRY] }, "no cited page has a worked example"],
    ["only the contents chart", { text: "Add the ones.", cites: ["demo:Z:contents"] }, "no cited page has a worked example"],
  ])("refuses %s", (_name, extra, text) => {
    const sentence = how(extra);
    if (sentence.steps === undefined) delete sentence.steps;
    expect(errorsOf(sentence)).toContain(text);
  });

  it("takes a guess for a step with no method", () => {
    expect(errorsOf(how({ ...onB, steps: [CARRY], guess: true }))).toBe("");
  });

  it("refuses steps on another kind of sentence", () => {
    expect(errorsOf(say("[11a] adds.", { steps: [NO_CARRY] }))).toContain("only a procedure");
  });

  it("refuses a procedure for a step that code cannot tell, whatever the page shows", () => {
    const notation: Expr = { kind: "notation", latex: "x" };
    ctx = contextOf([makePage("11a", { items: [makeItem(1, notation)], examples: [makeExample(notation)] })]);
    expect(errorsOf(how({ steps: ["page demo:Z:11a"] }))).toContain('no cited page has a worked example of "page demo:Z:11a"');
  });
});

describe("the plain text of a sentence", () => {
  it("names each page with its level and shows the math without its marks", () => {
    expect(plainSentence("On [11a] and [12b], `43 \u00D7 2` comes first.", KEY)).toBe("On Z:11a and Z:12b, 43 \u00D7 2 comes first.");
  });
});
