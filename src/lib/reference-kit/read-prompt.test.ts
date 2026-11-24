import { describe, expect, it } from "vitest";
import {
  ANSWER_SOURCES,
  ARITH_OPS,
  EXAMPLE_MARK_KINDS,
  EXAMPLE_POSITIONS,
  EXAMPLE_RELATIONS,
  EXAMPLE_STEP_KINDS,
  EXPR_KINDS,
  ITEM_FORMS,
  NOT_STATED,
  RESPONSE_POSITIONS,
  SCAFFOLD_KINDS,
  UNCLEAR,
  validateReferenceRecord,
} from "@/lib/reference-record";
import { applyComputedAnswers, findEmptyAnswers } from "./answers";
import { REFERENCE_READ_PROMPT } from "./read-prompt";

function extractJsonBlocksFromPrompt(prompt: string): unknown[] {
  const objects: unknown[] = [];
  let i = 0;
  while (i < prompt.length) {
    const start = prompt.indexOf("{", i);
    if (start === -1) break;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let j = start; j < prompt.length; j += 1) {
      const ch = prompt[j];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end !== -1) {
      const slice = prompt.slice(start, end + 1);
      try {
        const parsed = JSON.parse(slice) as unknown;
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          objects.push(parsed);
        }
      } catch {
        // non-JSON illustrative brace block
      }
      i = end + 1;
    } else {
      i = start + 1;
    }
  }
  return objects;
}

function toRecordWithSourceRef(raw: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...raw };
  const level = copy.level;
  const sheet = copy.sheet;
  delete copy.level;
  delete copy.sheet;
  return {
    ...copy,
    source_ref: `sample:${String(level)}:${String(sheet)}`,
    readers: ["claude:test"],
  };
}

describe("REFERENCE_READ_PROMPT", () => {
  it("mentions every enum value and sentinel from reference-record types", () => {
    const allValues = [
      ...ITEM_FORMS,
      ...ARITH_OPS,
      ...EXPR_KINDS,
      ...RESPONSE_POSITIONS,
      ...ANSWER_SOURCES,
      ...SCAFFOLD_KINDS,
      ...EXAMPLE_POSITIONS,
      ...EXAMPLE_RELATIONS,
      ...EXAMPLE_STEP_KINDS,
      ...EXAMPLE_MARK_KINDS,
      UNCLEAR,
      NOT_STATED,
    ];
    for (const val of allValues) {
      expect(REFERENCE_READ_PROMPT).toContain(val);
    }
  });

  it("includes a complete invented page record example and contents record example that both pass validateReferenceRecord", () => {
    const jsonBlocks = extractJsonBlocksFromPrompt(REFERENCE_READ_PROMPT) as Array<
      Record<string, unknown>
    >;
    const pageExample = jsonBlocks.find((obj) => obj.kind === "page");
    const contentsExample = jsonBlocks.find((obj) => obj.kind === "contents");

    expect(pageExample).toBeDefined();
    expect(contentsExample).toBeDefined();

    const pageCheck = validateReferenceRecord(toRecordWithSourceRef(pageExample!));
    expect(pageCheck).toEqual({ ok: true, record: expect.objectContaining({ kind: "page" }) });

    const contentsCheck = validateReferenceRecord(toRecordWithSourceRef(contentsExample!));
    expect(contentsCheck).toEqual({
      ok: true,
      record: expect.objectContaining({ kind: "contents" }),
    });
  });

  it("documents SimpleExpr and strict validator constraints", () => {
    expect(REFERENCE_READ_PROMPT).toContain("SimpleExpr");
    expect(REFERENCE_READ_PROMPT).toMatch(/lowercase/i);
    expect(REFERENCE_READ_PROMPT).toMatch(/never write "computed"/i);
  });

  it("explains mistake-count score bands, forbids not_stated for readers, and documents non-empty example labels and numeric contents bounds", () => {
    expect(REFERENCE_READ_PROMPT).toMatch(/mistake counts/i);
    expect(REFERENCE_READ_PROMPT).toContain("[[0,0],[1,1],[2,2],[3,3],[4,\"open\"]]");
    expect(REFERENCE_READ_PROMPT).toMatch(/never writes? [`"]?not_stated[`"]?/i);
    expect(REFERENCE_READ_PROMPT).toMatch(/label.*non-empty/i);
    expect(REFERENCE_READ_PROMPT).toMatch(/contents.*range bound.*number|no sentinel inside/i);

    const jsonBlocks = extractJsonBlocksFromPrompt(REFERENCE_READ_PROMPT) as Array<
      Record<string, unknown>
    >;
    const pageExample = jsonBlocks.find((obj) => obj.kind === "page");
    expect(pageExample?.score_bands).toEqual([[0, 0], [1, 1], [2, 2], [3, 3], [4, "open"]]);
    const examples = pageExample?.examples as Array<Record<string, unknown>>;
    expect(Array.isArray(examples[0]?.steps)).toBe(true);
    expect(Array.isArray(examples[0]?.marks)).toBe(true);
  });

  it("includes the What teaches section, instructs always writing steps and marks, and forbids unclear on other descriptions and shows_other", () => {
    expect(REFERENCE_READ_PROMPT).toContain("What teaches");
    expect(REFERENCE_READ_PROMPT).toMatch(/always.*steps.*marks|steps.*marks.*every example/i);
    expect(REFERENCE_READ_PROMPT).toMatch(/shows_other.*never.*"unclear"|never.*"unclear".*shows_other/i);
    expect(REFERENCE_READ_PROMPT).toMatch(/other.*scaffold.*never.*"unclear"|other.*mark.*never.*"unclear"|real descriptive text/i);
  });

  it("states the title, printed answer, pencil, divider, and unprinted sheet range rules", () => {
    expect(REFERENCE_READ_PROMPT).toMatch(/full printed title, exactly as printed, with any number at its end/);
    expect(REFERENCE_READ_PROMPT).toMatch(/never write `topic\.number`/i);
    expect(REFERENCE_READ_PROMPT).toMatch(/work out the correct answer yourself .* answer_source "reader"/);
    expect(REFERENCE_READ_PROMPT).toMatch(/pencil or pen writing in an answer place .* NEVER copied/i);
    expect(REFERENCE_READ_PROMPT).toMatch(/answer_source "printed" only when the publisher printed the answer/);
    expect(REFERENCE_READ_PROMPT).toMatch(/divider or border lines .* not record them as example marks or scaffolds/i);
    expect(REFERENCE_READ_PROMPT).toMatch(/null when the chart does not print a sheet range/);
    expect(REFERENCE_READ_PROMPT).toMatch(/each response of a digit box MUST carry `place`/);
    // The example follows the digit box rule: item 1 has tens and ones boxes, one digit each.
    const examplePage = (extractJsonBlocksFromPrompt(REFERENCE_READ_PROMPT) as Array<Record<string, unknown>>).find(
      (obj) => obj.kind === "page",
    ) as { sections: Array<{ items: Array<{ responses: Array<Record<string, unknown>> }> }> };
    expect(examplePage.sections[0].items[0].responses).toEqual([
      { position: "box", cue: null, answer: "1", answer_source: "reader", place: "tens" },
      { position: "box", cue: null, answer: "7", answer_source: "reader", place: "ones" },
    ]);
    // Every answer of the example is what code computes, so the example gives no answer notes.
    const checked = validateReferenceRecord(toRecordWithSourceRef(examplePage as unknown as Record<string, unknown>));
    if (!checked.ok) throw new Error("the example page must validate");
    expect(applyComputedAnswers(checked.record).details).toEqual([]);

    const jsonBlocks = extractJsonBlocksFromPrompt(REFERENCE_READ_PROMPT) as Array<
      Record<string, unknown>
    >;
    const pageExample = jsonBlocks.find((obj) => obj.kind === "page");
    expect(pageExample?.topic).not.toHaveProperty("number");
    const contentsExample = jsonBlocks.find((obj) => obj.kind === "contents");
    const topics = contentsExample?.topics as Array<Record<string, unknown>>;
    expect(topics.some((t) => t.sheets === null)).toBe(true);
  });

  it("pins round-2 reader conventions and makes the example page agree with all of them", () => {
    expect(REFERENCE_READ_PROMPT).toMatch(/Never record the decoration of an example box.*border, tab, shadow, or background shading/i);
    expect(REFERENCE_READ_PROMPT).toMatch(/`example\.label` only, never in a mark/);
    expect(REFERENCE_READ_PROMPT).toMatch(/one step for each printed line of the working/i);
    expect(REFERENCE_READ_PROMPT).toMatch(/`item\.printed` .* "\u25A1" .* "___"/);
    expect(REFERENCE_READ_PROMPT).toMatch(/`expr\.latex` holds only the expression or equation to work on, with no "=" at its end/);
    expect(REFERENCE_READ_PROMPT).toMatch(/`item\.form` for a notation item: write "horizontal" .*fractions included/i);
    expect(REFERENCE_READ_PROMPT).toMatch(/Do not write "unclear" because the item is notation/);
    expect(REFERENCE_READ_PROMPT).toMatch(/system of equations as ONE item.*\\begin\{cases\}/);
    expect(REFERENCE_READ_PROMPT).toMatch(/Use `linked` only for two separate questions/);
    expect(REFERENCE_READ_PROMPT).toMatch(/When the question ends with an "=" followed by open space.*position "after_equals"/);
    expect(REFERENCE_READ_PROMPT).toMatch(/When no answer place is printed and the question does not end with "=".*position "work_area"/);
    expect(REFERENCE_READ_PROMPT).toMatch(/Solve 2x \+ 1 = 5/);
    expect(REFERENCE_READ_PROMPT).toMatch(/when no answer place is printed and the question does not end with "="/);
    expect(REFERENCE_READ_PROMPT).not.toMatch(/when no "=" and no other answer place/);
    expect(REFERENCE_READ_PROMPT).toMatch(/"work_area" response with answer null and answer_source "unchecked"/);
    expect(REFERENCE_READ_PROMPT).toMatch(/When you cannot work the answer out.*write the answer as "unclear"/);
    expect(REFERENCE_READ_PROMPT).toMatch(/`cue` is words or an expression printed directly before the answer place/);
    expect(REFERENCE_READ_PROMPT).toMatch(/A lone operator or sign such as "=" or "\+" is never a cue: write null/);
    expect(REFERENCE_READ_PROMPT).toMatch(/read the large printed sheet id twice/i);

    const examplePage = (extractJsonBlocksFromPrompt(REFERENCE_READ_PROMPT) as Array<Record<string, unknown>>).find(
      (obj) => obj.kind === "page",
    ) as {
      sections: Array<{
        items: Array<{
          n: number;
          printed: string;
          form: string;
          expr: { kind: string; latex?: string };
          responses: Array<Record<string, unknown>>;
        }>;
      }>;
      examples: Array<{ label?: string; marks?: Array<{ kind: string }> }>;
    };
    expect(examplePage.sections[0].items[0].printed).toBe("12 + 5 = \u25A1\u25A1");
    const afterEqualsItem = examplePage.sections[0].items[2];
    expect(afterEqualsItem).toEqual({
      n: 3,
      printed: "1/2 + 1/4 =",
      form: "horizontal",
      expr: { kind: "notation", latex: "\\frac{1}{2} + \\frac{1}{4}" },
      responses: [{ position: "after_equals", cue: null, answer: "3/4", answer_source: "reader" }],
    });
    expect(afterEqualsItem.expr.latex?.endsWith("=")).toBe(false);
    const workAreaItem = examplePage.sections[0].items[3];
    expect(workAreaItem).toEqual({
      n: 4,
      printed: "Simplify 4/6",
      form: "horizontal",
      expr: { kind: "notation", latex: "\\frac{4}{6}" },
      responses: [{ position: "work_area", cue: null, answer: "2/3", answer_source: "reader" }],
    });
    expect(examplePage.examples[0].label).toBe("Example");
    expect(examplePage.examples[0].marks?.some((m) => m.kind === "box" || m.kind === "shading")).toBe(false);

    const checked = validateReferenceRecord(toRecordWithSourceRef(examplePage as unknown as Record<string, unknown>));
    if (!checked.ok) throw new Error("the example page must validate");
    expect(findEmptyAnswers(checked.record)).toEqual([]);
  });
});

