import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertTemplateInput, INPUT_LIMITS } from "./limits";
import { compileExpression, evaluateExpression, FractionValue } from "./expression";
import { parseStepProgressions, stepFieldProblems } from "./step-source";
import { prepareTemplate, seededRandom } from "./template";
import type { StepTemplate } from "./types";
const source = parseStepProgressions(JSON.parse(readFileSync("data/curriculum/step-progressions-k9.json", "utf8")));
const simple: StepTemplate = { format: "bare", difficulty: "easy", text: "ok", slots: {}, answer: "1" };
describe("input and value admission caps", () => {
  it("checks both import and production preparation before compiling excess input", () => {
    const invalid = [
      { ...simple, answer: "x".repeat(501) },
      { ...simple, derived: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`a${i}`, "1"])) },
      { ...simple, slots: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`a${i}`, "count"])) },
      { ...simple, text: "x".repeat(1025) },
    ];
    for (const template of invalid) {
      expect(() => parseStepProgressions({ ...source, steps: [{ ...source.steps[0], templates: [template] }] })).toThrow(/limit/);
      expect(() => prepareTemplate(source.steps[0], template, source.contexts)).toThrow(/limit/);
    }
  });
  it("accepts exactly 4 KB and rejects the next byte before parsing", () => {
    const t = { ...simple, text: "", derived: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`a${i}`, `'${"x".repeat(100)}'`])) };
    t.text = "x".repeat(INPUT_LIMITS.templateBytes - Buffer.byteLength(JSON.stringify(t)));
    expect(Buffer.byteLength(JSON.stringify(t))).toBe(4096);
    expect(() => assertTemplateInput(t)).not.toThrow();
    expect(() => assertTemplateInput({ ...t, text: t.text + "x" })).toThrow(/total byte limit/);
  });
  it("enforces token and nesting limits through both import checks and fill admission", () => {
    for (const answer of ["[" + Array(130).fill("1").join(",") + "]", "(".repeat(33) + "1" + ")".repeat(33)]) {
      const t = { ...simple, answer };
      expect(stepFieldProblems({ ...source.steps[0], templates: [t] }, source.contexts).join("\n")).toMatch(/limit/);
      expect(() => prepareTemplate(source.steps[0], t, source.contexts)).toThrow(/limit/);
    }
    expect(() => compileExpression(`'${"x".repeat(498)}'`)).not.toThrow();
    expect(() => compileExpression(`'${"x".repeat(499)}'`)).toThrow(/character limit/);
  });
  it("caps inputs, products, powers and raw Fraction components before normalization", () => {
    expect(evaluateExpression("2 ** 255")).toBe(BigInt(1) << BigInt(255));
    expect(evaluateExpression("isqrt(2 ** 254) == 2 ** 127")).toBe(true);
    for (const expression of ["2 ** 256", "(2 ** 200) * (2 ** 200)", "Fraction(2 ** 200, 3) * Fraction(2 ** 200, 5)"]) expect(() => evaluateExpression(expression)).toThrow(/256-bit/);
    const giant = BigInt(1) << BigInt(300);
    expect(() => new FractionValue(giant, giant)).toThrow(/256-bit/);
    expect(() => evaluateExpression("x", { x: giant })).toThrow(/256-bit/);
    expect(() => evaluateExpression("x", { x: 2 ** 256 })).toThrow(/256-bit/);
    expect(evaluateExpression("len(x)", { x: "x".repeat(1024) })).toBe(BigInt(1024));
    expect(() => evaluateExpression("x", { x: "x".repeat(1025) })).toThrow(/string/);
    expect(evaluateExpression("len(x)", { x: Array(256).fill(BigInt(1)) })).toBe(BigInt(256));
    expect(() => evaluateExpression("x", { x: Array(257).fill(BigInt(1)) })).toThrow(/Collection/);
  });
  it("requires named domains in production and keeps the admitted snapshot immutable", () => {
    expect(() => prepareTemplate(source.steps[0], { ...simple, slots: { a: { min: 1, max: 2 } } }, source.contexts)).toThrow(/must name/);
    const template = { ...simple }, prepared = prepareTemplate(source.steps[0], template, source.contexts);
    template.text = "x".repeat(10000); template.answer = "10 ** 10 ** 10";
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(prepared.fill(seededRandom(1))).toMatchObject({ text: "ok", answer: "1" });
  });
  it("reproduces the measured real-input maxima used to select the caps", () => {
    const expected = JSON.parse(readFileSync("data/curriculum/template-limits-profile.json", "utf8"));
    const p = { templates: 0, expressions: 0, compiledExpressions: 0, rejectedExpressions: 0, maxExpressionCharacters: 0, maxExpressionTokens: 0, maxExpressionDepth: 0, maxDerivedEntries: 0, maxSlotEntries: 0, maxTemplateBytes: 0, maxTextCharacters: 0, maxDomainList: 0, maxDomainMagnitude: 0 };
    for (const step of source.steps) {
      for (const domain of Object.values(step.numbers ?? {})) {
        const r = domain as { min: number; max: number; values?: number[] }, list = Array.isArray(domain) ? domain : r.values ?? [];
        p.maxDomainList = Math.max(p.maxDomainList, list.length);
        for (const v of [...list, ...(Array.isArray(domain) ? [] : [r.min, r.max])]) if (typeof v === "number") p.maxDomainMagnitude = Math.max(p.maxDomainMagnitude, Math.abs(v));
      }
      p.maxDomainList = Math.max(p.maxDomainList, step.values?.length ?? 0);
      for (const t of step.templates ?? []) {
        p.templates++; p.maxTemplateBytes = Math.max(p.maxTemplateBytes, Buffer.byteLength(JSON.stringify(t))); p.maxDerivedEntries = Math.max(p.maxDerivedEntries, Object.keys(t.derived ?? {}).length); p.maxSlotEntries = Math.max(p.maxSlotEntries, Object.keys(t.slots).length); p.maxTextCharacters = Math.max(p.maxTextCharacters, t.text.length);
        for (const e of [t.answer, ...(t.check ? [t.check] : []), ...Object.values(t.derived ?? {})]) {
          p.expressions++; p.maxExpressionCharacters = Math.max(p.maxExpressionCharacters, e.length);
          try { const profile = compileExpression(e).inputProfile; p.compiledExpressions++; p.maxExpressionTokens = Math.max(p.maxExpressionTokens, profile.tokens); p.maxExpressionDepth = Math.max(p.maxExpressionDepth, profile.depth); } catch { p.rejectedExpressions++; }
        }
      }
    }
    expect(p).toEqual(expected);
  });
});
