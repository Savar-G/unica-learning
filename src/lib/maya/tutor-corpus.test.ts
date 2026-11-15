import { describe, expect, it } from "vitest";
import corpus from "./__fixtures__/tutor-corpus-20261114.json";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import type { OperationPackage } from "@/lib/question-package";
import { checkTutorSay, tutorKind, tutorReadFacts } from "./tutor";

// Every sentence the real model (Sonnet 5.5) wrote and code accepted in the tutor runs of 2026-11-14 (52 − 28 and
// 27 + 39). The math checks must keep passing them: a false refusal costs the child a repair.

describe("the accepted real sentences of 2026-11-14 still pass the math checks", () => {
  const rows = corpus as { question: string; sentence: string }[];
  it("has the corpus", () => expect(rows.length).toBeGreaterThan(300));
  it("refuses none of them", () => {
    const refused = rows.filter(({ question, sentence }) => !checkTutorSay(sentence, { stance: "none", op: question.includes("+") ? "add" : "subtract" }).ok);
    expect(refused).toEqual([]);
  });
});

// Two-layer true math, coverage round of 2026-11-15: a sentence code reads whole needs no math-truth review, so the
// child hears it at once. Base 5d9ad5448: 104 of 515 (20.2%); this round: 365 (70.9%). The floor keeps the speed.
describe("most of the accepted real sentences pass on code alone", () => {
  const rows = corpus as { question: string; sentence: string }[];
  const contextOf = (pkg: OperationPackage) => {
    const kind = tutorKind(pkg);
    const op = kind.op?.(pkg);
    return { stance: "none" as const, claims: (x: string) => kind.claimProblems(pkg, x), facts: tutorReadFacts(pkg), trades: kind.workValues(pkg), ...(op ? { op } : {}), ...(pkg.answer.value.type === "number" ? { answer: pkg.answer.value.value } : {}) };
  };
  it("passes at least 70% with no review, and refuses none", () => {
    const verdicts = rows.map(({ question, sentence }) => checkTutorSay(sentence, contextOf(SAMPLE_PACKAGES[question.includes("+") ? "add-27-39" : "subtract-52-28"] as OperationPackage)));
    expect(verdicts.filter((v) => !v.ok)).toEqual([]);
    const code = verdicts.filter((v) => v.ok && v.math.length === 0).length;
    expect(code / rows.length).toBeGreaterThanOrEqual(0.7);
  });
});
