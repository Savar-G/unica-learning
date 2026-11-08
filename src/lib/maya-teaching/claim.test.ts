import { describe, expect, it } from "vitest";
import { claimExample, claimTeaching, exampleGivesAway, readClaim, type Claim } from "@/lib/maya-teaching/claim";
import * as CLAIMS from "@/lib/maya-gate/claim-fixtures";
import { CLAIM_DECIMAL, CLAIM_DIVIDE, CLAIM_GREATER, CLAIM_RIGHT, CLAIM_TRUE_FALSE } from "@/lib/maya-gate/claim-fixtures";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { checkQuestionPackage, operationProblem, workedSteps, type Operation, type OperationPackage, type QuestionPackage } from "@/lib/question-package";
import { withWorkbookMayaOperation } from "@/lib/workbook-maya-operation";

const ALL = { CLAIM_TRUE_FALSE, CLAIM_GREATER, CLAIM_DECIMAL, CLAIM_DIVIDE, CLAIM_RIGHT };
/** A copy with other printed words or numbers; the item, the key and the template source stay as stored. */
const withText = (pkg: QuestionPackage, text: string): QuestionPackage => ({ ...structuredClone(pkg), text });
const source = (pkg: QuestionPackage) => {
  const check = pkg.item!.checks[0];
  if (check.kind !== "template-choice") throw new Error("not a template-choice item");
  return check.source;
};

describe("claim questions: the derived teaching package (A4)", () => {
  it.each([
    ["CLAIM_TRUE_FALSE", { kind: "multiply", operands: [6, 8] }, 48, 48, "true"],
    ["CLAIM_GREATER", { kind: "multiply", operands: [360, 4] }, 1440, 1436, "yes"],
    ["CLAIM_DECIMAL", { kind: "decimal-add", operands: [3.45, 2.38] }, 5.83, 5.93, "false"],
    ["CLAIM_DIVIDE", { kind: "divide", operands: [56, 8] }, 7, 6, "no"],
    ["CLAIM_RIGHT", { kind: "multiply", operands: [7, 4] }, 28, 32, "no"],
  ] as const)("%s: the computed side, its result, the printed number and the word", (id, operation, value, shown, word) => {
    const raw = ALL[id];
    const claim = readClaim(raw);
    expect(claim).toMatchObject({ operation, value, shown, word });
    const pkg = claimTeaching(raw)!;
    expect(checkQuestionPackage(pkg).status).toBe("checked");
    expect(pkg).toMatchObject({ operationSource: "maya", operation, answer: { value: { type: "number", value } }, steps: workedSteps(pkg.operation!) });
    // The printed book and the item stay as stored.
    expect({ text: pkg.text, item: pkg.item, templateId: pkg.templateId, ref: pkg.ref, skill: pkg.skill }).toEqual({ text: raw.text, item: raw.item, templateId: raw.templateId, ref: raw.ref, skill: raw.skill });
  });

  it("never changes the stored package", () => {
    for (const raw of Object.values(ALL)) {
      const before = structuredClone(raw);
      claimTeaching(raw);
      expect(raw).toEqual(before);
    }
  });

  it("holds a question when the printed claim does not agree with the key (agreement 2)", () => {
    // 6 × 8 = 49 is false, but the stored key says true.
    expect(readClaim(withText(CLAIM_TRUE_FALSE, "True or false: 6 × 8 = 49."))).toBeNull();
    expect(claimTeaching(withText(CLAIM_TRUE_FALSE, "True or false: 6 × 8 = 49."))).toBeNull();
    // 4 × 360 is not greater than 1450, but the stored key says yes.
    expect(readClaim(withText(CLAIM_GREATER, "Is 4 × 360 greater than 1450? Circle yes or no."))).toBeNull();
  });

  it("holds a question when the template's values are not the printed numbers (agreement 3)", () => {
    // 7 × 7 = 49 is true, and the key says true, but the template's numbers are 6, 8 and 48.
    expect(readClaim(withText(CLAIM_TRUE_FALSE, "True or false: 7 × 7 = 49."))).toBeNull();
    // A template whose evaluator gives another result than code's operation: its numbers are not the printed ones.
    const other = structuredClone(CLAIM_DECIMAL);
    source(other).derived[0] = ["sa", "str(A // 100) + '.' + str(A % 100 + 1)"];
    expect(readClaim(other)).toBeNull();
  });

  it("holds a question whose words are not one of the closed forms (agreement 1)", () => {
    for (const text of [
      "True or false: 6 × 8 = 48 apples.", "6 × 8 = 48. True or false?", "True or false: 6 * 8 = 48.",
      "Is 4 × 360 more than 1436? Circle yes or no.", "Is 4 × 360 greater than 1436?", "True or false: 3 $20 bills and 3 quarters is $61.25.",
      "Mia says 6 × 8 = 56. Check with 56 ÷ 6. Is Mia right? Circle yes or no.",
    ]) expect(readClaim(withText(CLAIM_TRUE_FALSE, text)), text).toBeNull();
  });

  it("holds a question whose words are not the printed choices, or whose item is not one circled word", () => {
    const words = structuredClone(CLAIM_GREATER);
    const region = words.item!.regions[0];
    if (region.kind === "choice") region.choices = ["no", "yes"];
    expect(readClaim(words)).toBeNull();
    expect(readClaim({ ...structuredClone(CLAIM_GREATER), item: { ...CLAIM_GREATER.item!, format: "tick-one" } })).toBeNull();
  });

  it("derives nothing for a package that already has an operation, or for the research fixtures", () => {
    expect(claimTeaching(claimTeaching(CLAIM_TRUE_FALSE)!)).toBeNull();
    for (const pkg of Object.values(FIXTURES)) expect(claimTeaching(pkg)).toBeNull();
  });

  it("uses only today's limits of the operation kinds", () => {
    // The generator's default limits are unchanged: a sum past 9999 is still refused (wave brief, hard rule 4), and a claim
    // whose computed side is past them stays held.
    expect(operationProblem({ kind: "add", operands: [10000, 2000] })).not.toBeNull();
    const big = structuredClone(CLAIM_TRUE_FALSE);
    big.text = "True or false: 10000 + 2000 = 12000.";
    expect(readClaim(big)).toBeNull();
  });
});

describe("the generator's workbook teaching data is unchanged (A4)", () => {
  it("adds no operation to a claim question, and changes no research fixture", () => {
    for (const raw of Object.values(ALL)) expect(withWorkbookMayaOperation(raw)).toEqual(raw);
    for (const pkg of Object.values(FIXTURES).filter((p) => p.operation !== null && p.operationSource === undefined)) expect(withWorkbookMayaOperation(pkg)).toEqual(pkg);
  });
});

describe("the easier example never gives the answer away (lesson 11, #724's review)", () => {
  const mul = (a: number, b: number): Operation => ({ kind: "multiply", operands: [a, b] });

  it("knows a giveaway: the question's own number, the result times a power of 10, or the result's first digits", () => {
    expect(exampleGivesAway(mul(2, 3), mul(20, 3))).toBe(true); // 6 and 60, and the 3
    expect(exampleGivesAway(mul(2, 3), mul(600, 10))).toBe(true); // 6 and 6000
    expect(exampleGivesAway(mul(2, 3), mul(850, 8))).toBe(true); // 6800 begins with 6
    expect(exampleGivesAway(mul(8, 2), mul(850, 8))).toBe(true); // the question's own 8
    expect(exampleGivesAway(mul(2, 2), mul(850, 8))).toBe(false);
    expect(exampleGivesAway({ kind: "decimal-add", operands: [1.2, 1.3] }, { kind: "decimal-add", operands: [6.67, 2.55] })).toBe(false);
  });

  it("every claim's made example passes the check against its real question", () => {
    for (const raw of Object.values(CLAIMS)) {
      const pkg = claimTeaching(raw)!;
      expect(pkg, raw.id).not.toBeNull();
      expect(exampleGivesAway(pkg.easierExample!.operation, pkg.operation!), `${raw.id}: ${pkg.easierExample!.text}`).toBe(false);
    }
    // The round product: 2 × 3 = 6 would give 60 away, so the example is another fact.
    const round = claimTeaching(CLAIMS.CLAIM_ROUND)!;
    expect(round.easierExample!.operation).not.toEqual(mul(2, 3));
  });

  it("prints no number of the question's own steps in the example (lesson 12, #737 review): 8 is the tens of 40 × 2", () => {
    const pkg = { steps: workedSteps(mul(40, 2)), easierExample: { operation: mul(3, 3) } } as unknown as OperationPackage;
    const greater = { relation: "greater", choices: ["yes", "no"] } as unknown as Claim;
    expect(claimExample(greater, pkg)).toMatchObject({ value: 9, shown: 7, holds: true, word: "yes" });
    const equal = { relation: "equal", choices: ["true", "false"] } as unknown as Claim;
    const sum = { steps: workedSteps({ kind: "add", operands: [5, 5] }), easierExample: { operation: { kind: "add", operands: [4, 5] } } } as unknown as OperationPackage;
    // 10 is the sum's result and 1 its tens: the example prints 11.
    expect(claimExample(equal, sum)).toMatchObject({ value: 9, shown: 11, holds: false, word: "false" });
  });
});

