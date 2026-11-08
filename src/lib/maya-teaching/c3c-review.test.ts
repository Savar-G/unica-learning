// The review of #742 (C3c): the area claim's other product in scope (P1-c), clock and compare examples that give
// nothing away (P2-a, P2-b), what a clock count credits (P2-c, P3-b), the clocks that stay held (P2-d, P3-a), and a
// topic claim's own work beside its word after A4's ownWork (fe7a5ff8).
import { describe, expect, it, vi } from "vitest";
import { claimView, readClaimWord, sessionClaim } from "@/lib/maya/claim";
import { clockAnswers } from "@/lib/maya/clock-lines";
import { scopeReason } from "@/lib/maya/scope";
import { operationResult, workedSteps, type Operation, type OperationPackage, type QuestionPackage } from "@/lib/question-package";
import { deriveClockTime, deriveTopicClaim } from "./topic-derivers";
import { areaClaimPrinted, clockPrinted, marblesPrinted, minutePrinted, scalePrinted } from "./topic-samples";

vi.mock("server-only", () => ({}));

const view = (p: QuestionPackage | null) => claimView(p as OperationPackage);
const numbersOf = (text: string) => (text.match(/\d+/g) ?? []).map(Number);
const countMinutes = (op: Operation) => workedSteps(op).flatMap((st) => (st.kind === "count-on" ? [st.minutes] : []));

describe("an area claim's other area is on the question (P1-c)", () => {
  it("'4 times 4 is 16.' on 6 by 3 against 4 by 4 is in scope; another product is not", () => {
    const pkg = view(deriveTopicClaim(areaClaimPrinted(6, 3, 4, 4)));
    expect(scopeReason(pkg, "4 times 4 is 16.", false)).toBeNull();
    expect(scopeReason(pkg, "6 times 3 is 18.", false)).toBeNull();
    expect(scopeReason(pkg, "4 times 5 is 20.", false)).not.toBeNull();
  });
});

describe("clock examples give nothing away (P2-a, lessons 11 and 12)", () => {
  it.each([[6, 13, 50], [9, 0, 40], [7, 0, 45]] as const)("%s:%s + %s: the example uses none of the question's numbers, counts or answer", (h, m, d) => {
    const made = deriveClockTime(clockPrinted(h, m, d))!;
    expect(made).not.toBeNull();
    const q = made.operation!;
    const answer = operationResult(q);
    const ex = made.easierExample!.operation;
    const got = operationResult(ex);
    if (answer.type !== "time" || got.type !== "time" || ex.kind !== "time-add") throw new Error("not a clock");
    const own = new Set([h, m, d, answer.hours, answer.minutes, ...countMinutes(q)]);
    expect(got.minutes).not.toBe(answer.minutes);
    expect(got.hours).not.toBe(answer.hours);
    for (const n of countMinutes(ex)) expect(own.has(n), `${n}`).toBe(false);
  });

  it("6:13 + 50 (7:03, with 3 minutes left) no longer takes 2:55 + 8 (3:03, also 3 minutes left)", () => {
    const ex = deriveClockTime(clockPrinted(6, 13, 50))!.easierExample!;
    expect(ex.text).not.toBe("What time is 8 minutes after 2:55?");
  });
});

describe("compare examples use no printed number (P2-b, lesson 11)", () => {
  it.each([[1, 5, 5], [2, 6, 4], [1, 3, 5]] as const)("marbles %s red, %s blue, %s green", (a, b, c) => {
    const printed = marblesPrinted(a, b, c);
    const pkg = view(deriveTopicClaim(printed));
    const own = new Set([...numbersOf(printed.text), b + c]);
    const compare = pkg.easierExample.steps.find((st) => st.kind === "claim-compare")!;
    if (compare.kind !== "claim-compare") throw new Error("no compare");
    for (const n of [...(pkg.easierExample.operation.operands as number[]), compare.value, compare.shown]) expect(own.has(n), `${n} in ${pkg.easierExample.text}`).toBe(false);
  });

  it("teaches 5 by 3 against 4 by 2 with a fresh example", () => {
    const printed = areaClaimPrinted(5, 3, 4, 2);
    const derived = deriveTopicClaim(printed);
    expect(derived).not.toBeNull();
    const area = view(derived);
    expect(sessionClaim(area)).not.toBeNull();
    expect(scopeReason(area, "4 times 2 is 8.", false)).toBeNull();
    const own = new Set([2, 3, 4, 5, 8, 15]);
    const compare = area.easierExample.steps.find((st) => st.kind === "claim-compare")!;
    if (compare.kind !== "claim-compare") throw new Error("no compare");
    for (const n of [...(area.easierExample.operation.operands as number[]), compare.value, compare.shown]) expect(own.has(n)).toBe(false);
    const pkg = view(deriveTopicClaim(areaClaimPrinted(6, 3, 4, 4)));
    expect(pkg.easierExample.text).not.toMatch(/\b[3468]\b|16|18/);
  });
});

describe("what a clock count credits (P2-c, P3-b)", () => {
  it("the count to the next hour credits its minutes only, never the hour Maya says", () => {
    const steps = deriveClockTime(clockPrinted(6, 13, 50))!.steps;
    const toHour = steps.find((st) => st.id === "to-hour")!;
    expect(clockAnswers(toHour)).toEqual([{ type: "number", value: 47 }]);
    const last = steps.find((st) => st.id === "minutes")!;
    expect(clockAnswers(last)).toEqual([{ type: "time", hours: 7, minutes: 3, period: null }]);
  });

  it("a one count credits only the time it reaches, not the question's own minutes", () => {
    const steps = deriveClockTime(clockPrinted(9, 0, 40))!.steps;
    const count = steps.find((st) => st.kind === "count-on")!;
    expect(clockAnswers(count)).toEqual([{ type: "time", hours: 9, minutes: 40, period: null }]);
  });
});

describe("clocks that stay held (P2-d, P3-a)", () => {
  it("a time past 12:59 (12:40 + 30 is 13:10 on the package's clock) is held", () => {
    expect(deriveClockTime(clockPrinted(12, 40, 30))).toBeNull();
    expect(deriveClockTime(clockPrinted(12, 10, 30))).not.toBeNull();
  });

  it("a start whose minutes reach the hour exactly (6:10 + 50) is held", () => {
    expect(deriveClockTime(clockPrinted(6, 10, 50))).toBeNull();
    expect(deriveClockTime(clockPrinted(6, 13, 50))).not.toBeNull();
  });
});

describe("a topic claim's own work beside its word (A4's ownWork, fe7a5ff8)", () => {
  const word = (p: QuestionPackage | null, text: string) => {
    const pkg = view(p);
    const c = sessionClaim(pkg)!;
    return readClaimWord(text, c.choices, { value: c.value, shown: c.shown, operation: pkg.operation });
  };
  it("takes an evaluate's own part and pieces of own work joined by 'and'", () => {
    expect(word(deriveTopicClaim(scalePrinted(10, 60, 2, true)), "It's true, because 60 plus 20 is 80.")).toEqual({ word: "true", committed: true });
    expect(word(deriveTopicClaim(minutePrinted(3, 7, true)), "It's true, because 7 times 5 is 35 and 35 plus 3 is 38.")).toEqual({ word: "true", committed: true });
    expect(word(deriveTopicClaim(areaClaimPrinted(6, 3, 4, 4)), "It's true, because 6 times 3 is 18 and 18 is more than 16.")).toEqual({ word: "true", committed: true });
  });
  it("refuses another speaker, a copy, or a wrong part in any piece", () => {
    const scale = deriveTopicClaim(scalePrinted(10, 60, 2, true));
    expect(word(scale, "My mom said 60 plus 20 is 80, so it's true.")).toBeNull();
    expect(word(scale, "It's true, because I copied it and 60 plus 20 is 80.")).toBeNull();
    expect(word(scale, "It's true, because 60 plus 30 is 90.")).toBeNull();
    expect(word(deriveTopicClaim(areaClaimPrinted(6, 3, 4, 4)), "It's true, because 6 times 3 is 18 and my mom said so.")).toBeNull();
  });
});
