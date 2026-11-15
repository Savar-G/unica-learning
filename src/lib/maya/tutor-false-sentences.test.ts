import { describe, expect, it } from "vitest";
import falseSet from "./__fixtures__/tutor-false-20261115.json";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { teachingPackage } from "@/lib/maya-teaching";
import { storedPlaceValue } from "@/lib/maya-teaching/place-value-samples";
import { operationResult, workedSteps, type Operation, type OperationPackage } from "@/lib/question-package";
import { createSession } from "./session";
import { checkTutorSay, tutorKind, tutorReadFacts } from "./tutor";

// Every false sentence of the Sol rounds of #1044 (pre-launch review B and the final checks, 116 distinct; collected on
// 2026-11-15 from the survey, the matrix and the confirmed cases). Code refuses it or sends it to the math-truth review:
// none may pass on code alone, however much more math code reads (two-layer true math, coverage round of 2026-11-15).

const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const ADD = SAMPLE_PACKAGES["add-27-39"] as OperationPackage;
function make(text: string, operation: Operation): OperationPackage {
  const easy: Operation = { kind: "divide", operands: [8, 2] };
  return { ...SUB, id: `probe-${text}`, text, operation, answer: { value: operationResult(operation), accepted: [], unit: null }, steps: workedSteps(operation), wrongAnswers: [{ value: { type: "number", value: 999 }, cause: "careless", description: "A made-up error.", step: null }], easierExample: { text: "8 ÷ 2 = ?", operation: easy, answer: operationResult(easy), steps: workedSteps(easy) } } as OperationPackage;
}
const asTutor = (p: unknown) => createSession({ callId: "false-set", package: p, conversational: true, tutor: true }).package as OperationPackage;
const PACKAGES = {
  sub: SUB,
  add: ADD,
  div: make("1340 ÷ 2 = ?", { kind: "divide", operands: [1340, 2] }),
  frac: asTutor(FIXTURES.COMPARE_FRACTIONS),
  claim: asTutor(FIXTURES.CLAIM_GT),
  pv: teachingPackage(storedPlaceValue({ variant: "1.2", n0: 48942, place: "ten thousands" })) as OperationPackage,
};
/** The question each sentence was found on (the kind it names, and the fraction words of the fraction claims). */
const packageOf = (kind: string, line: string): OperationPackage =>
  kind === "add" ? PACKAGES.add
  : kind === "multiply" ? PACKAGES.div
  : kind === "place-value" ? PACKAGES.pv
  : kind === "fraction" || (kind === "claim" && /sixth|third|half|halves|eleventh|fifth/i.test(line)) ? PACKAGES.frac
  : kind === "claim" ? PACKAGES.claim
  : PACKAGES.sub;

const contextOf = (pkg: OperationPackage) => {
  const kind = tutorKind(pkg);
  const op = kind.op?.(pkg);
  return { stance: "none" as const, claims: (x: string) => kind.claimProblems(pkg, x), facts: tutorReadFacts(pkg), trades: kind.workValues(pkg), ...(op ? { op } : {}), ...(pkg.answer.value.type === "number" ? { answer: pkg.answer.value.value } : {}) };
};

describe("the false sentences of the Sol rounds never pass on code alone", () => {
  const rows = falseSet as { src: string; kind: string; line: string }[];
  it("has all 116", () => expect(rows.length).toBe(116));
  it("each is refused or goes to the math-truth review", () => {
    const passed = rows.filter(({ kind, line }) => {
      const v = checkTutorSay(line, contextOf(packageOf(kind, line)));
      return v.ok && v.math.length === 0;
    });
    expect(passed.map((r) => r.line)).toEqual([]);
  });
});
