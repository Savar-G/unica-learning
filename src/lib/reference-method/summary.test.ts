import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import type { Expr } from "@/lib/reference-record";
import { numbersIn, readPageMentions } from "./numbers";
import { checkSummary, type SummaryContext } from "./summary";
import { add, evidenceFor, makeContents, makeExample, makeItem, makePage } from "./test-records";

const NO_CARRY = "arith add 2x1 horizontal";
const CARRY = "arith add 2x1 horizontal carries=ones_to_tens";

function contextOf(...args: Parameters<typeof evidenceFor>): SummaryContext {
  const built = evidenceFor(...args);
  if (!built.ok) throw new Error(built.problems.join("\n"));
  return { topic: 1, evidence: built.evidence, views: built.views };
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
  it("accepts a cited sentence and a guess", () => {
    expect(errorsOf(say("The page adds a small number."))).toBe("");
    expect(errorsOf({ kind: "procedure", text: "Perhaps add the ones first on sheet 12.", cites: [], guess: true })).toBe("");
    expect(errorsOf({ kind: "progression", text: "The topic has a time of 2 to 4 minutes.", cites: ["demo:Z:contents"] })).toBe("");
  });

  it.each<[string, unknown, string]>([
    ["not an object", "text", "must be a sentence object"],
    ["an unknown field", say("Adds.", { note: "x" }), "unknown field"],
    ["an unknown kind", say("Adds.", { kind: "method" }), "must be one of introduces, procedure, progression"],
    ["no text", say("  "), "must be a non-empty text"],
    ["a line break in the text", say("Adds.\nMore."), "one line"],
    ["a line separator in the text", say("Adds.\u2028More."), "one line"],
    ["an invisible character that hides a page name", say("Sheet\u200B12 adds."), "one line"],
    ["a very long text", say("a".repeat(601)), "600 characters"],
    ["cites that are not a list", say("Adds.", { cites: "demo:Z:11a" }), "must be a list"],
    ["a cite twice", say("Adds.", { cites: ["demo:Z:11a", "demo:Z:11a"] }), "cited twice"],
    ["guess: false", say("Adds.", { guess: false }), "must be true"],
    ["no citation and no guess", say("Adds.", { cites: [] }), "needs a citation"],
    ["a page of another topic", say("Adds.", { cites: ["demo:Z:13a"] }), '"demo:Z:13a" is not a page of this topic'],
    ["a page of another topic in a guess", say("Adds.", { cites: ["demo:Z:13a"], guess: true }), "is not a page of this topic"],
    ["a page of another level", say("Adds.", { cites: ["demo:Y:11a"] }), "is not a page of this topic"],
    ["a page with no photo", say("Adds.", { cites: ["demo:Z:12b"] }), "has no photo"],
    ["a page that gives no facts", say("Adds.", { cites: ["demo:Z:12a"] }), "gives no facts"],
    ["damaged text", say("Adds \uFFFD."), "damaged text"],
    ["half a character", say("Adds \uD800."), "damaged text"],
    ["a null character", say("Adds \u0000."), "damaged text"],
  ])("refuses %s", (_name, sentence, text) => {
    expect(errorsOf(sentence)).toContain(text);
  });

  it("refuses an empty summary only when there are pages with facts", () => {
    expect(checkSummary([], ctx).ok).toBe(false);
    expect(checkSummary([], contextOf([])).ok).toBe(true);
    expect(checkSummary("no", ctx).ok).toBe(false);
  });

  it.each([
    ["Sheet 12 adds.", "sheet 12"],
    ["Sheet twelve adds.", "sheet 12"],
    ["See page 12b.", "page 12b"],
    ["On 12b the child adds.", "page 12b"],
    ["See sheet 11, side b.", "page 11b"],
    ["See sheet 11 (b).", "page 11b"],
    ["Sheets 11 to 12 add.", "sheet 12"],
    ["Sheets 11-12 add.", "sheet 12"],
    ["Sheets 11 and 12 add.", "sheet 12"],
    ["Between sheets 10 and 12 it adds.", "sheet 12"],
    ["From sheet 10 to sheet 12 it adds.", "sheet 12"],
    ["Pages 11a through 12a add.", "page 12a"],
    ["See demo:Z:12b.", "page 12b"],
    ["See worksheet no. 12.", "sheet 12"],
    ["See p. 12.", "sheet 12"],
    ["See sheet #12.", "sheet 12"],
    ["Sheet 11b adds.", "page 11b"],
    ["Sheet 99 adds.", "sheet 99"],
  ])("refuses %j, which names a sheet that it does not cite, and takes it as a guess", (text, name) => {
    expect(errorsOf(say(text))).toContain(`names ${name}`);
    expect(errorsOf(say(text, { guess: true }))).toBe("");
  });

  it.each(["Sheet 11 adds.", "Sheet 11a adds.", "The front, 11a, adds.", "Page 11a (sheet 11) adds."])(
    "accepts %j, which cites the sheet that it names",
    (text) => {
      expect(errorsOf(say(text))).toBe("");
    },
  );

  it.each([
    ["The child adds 5 small numbers.", "5"],
    ["The child adds five numbers.", "5"],
    ["There are 1,000 dots.", "1000"],
    ["The sum is 2.5 dots.", "2.5"],
    ["There are twenty-five dots.", "25"],
    ["It ends with 234.", "234"],
  ])("refuses a number that no cited record or fact holds: %j", (text, n) => {
    expect(errorsOf(say(text))).toContain(`the number ${n} is in none of the cited records or facts`);
    expect(errorsOf(say(text, { guess: true }))).toBe("");
  });

  it.each([
    "It starts with 23 + 4 and has 2 questions.",
    "The first number has two digits.",
    "It shows 45 + 3.0 as 045 + 3.",
  ])("accepts numbers of the cited record and its facts: %j", (text) => {
    expect(errorsOf(say(text))).toBe("");
  });

  it("takes a number only from the pages that the sentence cites", () => {
    expect(errorsOf(say("It adds 68 and 7."))).toContain("number 68");
    expect(errorsOf(say("It adds 68 and 7.", { cites: ["demo:Z:11b"] }))).toBe("");
    expect(errorsOf(say("It takes 2 minutes.", { cites: ["demo:Z:contents"] }))).toBe("");
    expect(errorsOf(say("It has 13 parts.", { cites: ["demo:Z:contents"] }))).toContain("number 13");
  });

  it("does not take a number from a field that one reader read, or from a question number", () => {
    ctx = contextOf([
      makePage("11a", { items: [makeItem(7, add(23, 4))], single_read: ["sections[0].instruction"] }),
    ]);
    const page = makePage("11a", { items: [makeItem(7, add(23, 4))], single_read: ["sections[0].instruction"] });
    page.sections[0].instruction = "Find 88 totals.";
    ctx = contextOf([page]);
    expect(errorsOf(say("Find 88 totals."))).toContain("number 88");
    expect(errorsOf(say("Question 7 is first."))).toContain("number 7");
    delete page.single_read;
    ctx = contextOf([page]);
    expect(errorsOf(say("Find 88 totals."))).toBe("");
  });

  it("refuses a digit that is not 0 to 9", () => {
    for (const text of ["It adds \uFF12\uFF13.", "It shows \u00BD.", "It shows 3\u00B2.", "It shows \u0663."]) {
      expect(errorsOf(say(text)), text).toContain("0 to 9");
    }
  });

  it("does not take an algebra term of the cited page for a page", () => {
    const term: Expr = { kind: "notation", latex: "2a + 3" };
    ctx = contextOf([makePage("11a", { items: [makeItem(1, term)] })]);
    expect(errorsOf(say("It works on 2a."))).toBe("");
    expect(errorsOf(say("It works on 5a."))).toContain("names page 5a");
    // A page of the topic stays a page, also when the cited page prints its name.
    ctx = contextOf([makePage("11a", { items: [makeItem(1, { kind: "notation", latex: "12b + 3" })] })]);
    expect(errorsOf(say("It works on 12b."))).toContain("names page 12b");
  });
});

describe("a procedure (M5)", () => {
  const how = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    kind: "procedure",
    text: "Add the ones first.",
    cites: ["demo:Z:11a"],
    ...extra,
  });

  it("refuses a procedure for a step that the pages show no method for, unless it is a guess", () => {
    expect(errorsOf(how({ cites: ["demo:Z:11b"] }))).toContain(`no cited page shows a method for the step "${CARRY}"`);
    expect(errorsOf(how({ cites: ["demo:Z:11b"], guess: true }))).toBe("");
  });

  it("asks which step a procedure is about when the cited pages hold a step with no method", () => {
    expect(errorsOf(how())).toContain(`no cited page shows a method for the step "${CARRY}"`);
    expect(errorsOf(how({ steps: [NO_CARRY] }))).toBe("");
    expect(errorsOf(how({ steps: [CARRY] }))).toContain("no cited page shows a method");
    expect(errorsOf(how({ steps: [NO_CARRY, CARRY] }))).toContain("no cited page shows a method");
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["a step that the topic does not have", { steps: ["arith add 9x9 vertical"] }, "is not a step of this topic"],
    ["an empty list of steps", { steps: [] }, "must be a non-empty list"],
    ["steps on another kind of sentence", { kind: "introduces", steps: [NO_CARRY] }, "only a procedure"],
    ["a procedure that cites no page", { cites: ["demo:Z:contents"] }, "must cite a page with a step"],
    ["a shown step whose page is not cited", { cites: ["demo:Z:11b"], steps: [NO_CARRY] }, "no cited page shows a method"],
  ])("refuses %s", (_name, extra, text) => {
    expect(errorsOf(how(extra))).toContain(text);
  });

  it("refuses a procedure for a step that code cannot tell and no page shows", () => {
    ctx = contextOf([makePage("11a", { items: [makeItem(1, { kind: "notation", latex: "x" })] })]);
    expect(errorsOf(how())).toContain('no cited page shows a method for the step "page demo:Z:11a"');
  });
});

describe("how numbers are read", () => {
  it("gives equal numbers one text, and different numbers two texts", () => {
    fc.assert(
      fc.property(fc.nat(9_999_999), fc.nat(9_999_999), (a, b) => {
        const grouped = a.toLocaleString("en-US");
        expect(numbersIn(`x ${a}, y`)).toEqual([String(a)]);
        expect(numbersIn(`x ${grouped}. y`)).toEqual([String(a)]);
        expect(numbersIn(`000${a}.500`)).toEqual([`${a}.5`]);
        expect(numbersIn(`${a} and ${b}`)).toEqual([String(a), String(b)]);
      }),
    );
  });

  it("reads each part of a list and each word for a number", () => {
    expect(numbersIn("12,13")).toEqual(["12", "13"]);
    expect(numbersIn("two, twelve, forty, forty-two and ninety nine")).toEqual(["2", "12", "40", "42", "99"]);
    expect(numbersIn("the one above, the ones, tens and zero")).toEqual([]);
  });

  it("separates the page mentions from the other numbers", () => {
    const read = readPageMentions("Sheets 11 to 13 have 4 sums", new Set(["a", "b"]));
    expect(read.mentions.map((m) => m.sheet)).toEqual([11, 12, 13]);
    expect(numbersIn(read.rest)).toEqual(["4"]);
  });

  it("stops at a very long range of sheets", () => {
    expect(readPageMentions("Sheets 1 to 99999999999", new Set()).mentions.length).toBeLessThan(1_000);
  });
});

it("keeps the topic title out of a page's numbers", () => {
  ctx = contextOf([makePage("11a", { title: "Joining Pebbles 1" })], {
    contents: makeContents([{ n: 1, title: "Joining Pebbles 1", sheets: [11, 11], std_time_min: null }]),
  });
  expect(errorsOf(say("It is topic 1.", { cites: ["demo:Z:contents"] }))).toBe("");
});
