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

  it("includes the What teaches section, removes mask rules, and instructs always writing steps and marks", () => {
    expect(REFERENCE_READ_PROMPT).toContain("What teaches");
    expect(REFERENCE_READ_PROMPT).not.toMatch(/masked/i);
    expect(REFERENCE_READ_PROMPT).not.toMatch(/black blocks/i);
    expect(REFERENCE_READ_PROMPT).toMatch(/always.*steps.*marks|steps.*marks.*every example/i);
  });
});
