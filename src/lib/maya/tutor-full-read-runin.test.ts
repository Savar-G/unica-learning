import { describe, expect, it } from "vitest";
import { equationsOf } from "./say-check";
import { checkTutorSay } from "./tutor";
import { falseClaims, fullRead } from "./tutor-math";

// 2026-11-15 (fallback rate): code refused true teaching sentences of the real model as false_equation, because the claim
// reader and the equation reader judged a claim they had read only in part. Each such refusal now goes through the one
// full-read guard (fullRead): a claim read only in part is unread, so the sentence goes to the math review, never to a
// refusal. A claim read in full that is false is still refused.

const span = (text: string, claim: string) => {
  const at = text.indexOf(claim);
  return [at, at + claim.length] as const;
};
const ctx = { stance: "none" as const };

describe("the full-read guard: a word before the claim that makes its first number part of a larger quantity", () => {
  it.each([
    ["The tens of 34 is 3, so we write 3.", "34 is 3"],
    ["4 groups of 23 is 92.", "23 is 92"],
    ["We have 8 tens, and 1 more ten makes 9 tens.", "ten makes 9 tens"],
    ["and the carried ten makes 9 tens.", "ten makes 9 tens"],
    ["Then the ten is 10 ones.", "ten is 10 ones"],
    ["2 tens times 4 is 8 tens, and the carried 1 ten makes 9 tens.", "1 ten makes 9 tens"],
    ["2 × 4 is 8, and the carried 1 makes 9.", "1 makes 9"],
  ])("%s: not read in full", (text, claim) => {
    expect(fullRead(text, ...span(text, claim))).toBe(false);
  });

  it.each([
    ["12 minus 8 is 4.", "12 minus 8 is 4"],
    ["So 12 minus 8 is 4.", "12 minus 8 is 4"],
    ["Now ten ones make 1 ten.", "ten ones make 1 ten"],
    ["We trade, and 2 ones become 12 ones.", "2 ones become 12 ones"],
    ["The 34 is 3 tens and 4 ones.", "34 is 3 tens and 4 ones"],
    ["And 8 plus 4 makes 12.", "8 plus 4 makes 12"],
    // fullRead reads the span in full; readClaims then leaves a digit named with "the" unread (2026-11-15, voice fallbacks).
    ["The 1 is 10.", "1 is 10"],
  ])("%s: still read in full", (text, claim) => {
    expect(fullRead(text, ...span(text, claim))).toBe(true);
  });
});

describe("the claim reader refuses only a claim read in full", () => {
  it.each([
    // The real model, 34 × 12 (read as 34 = 3).
    "The tens of 34 is 3, so 3 tens times 2 is 6 tens, and we write 6 in the tens.",
    // The real model, 23 × 4 (read as 10 = 90).
    "We have 8 tens, and 1 more ten makes 9 tens, so what is 8 tens plus 1 ten?",
    "Let's draw it: I'm writing the 9 in the tens place, because 2 tens times 4 is 8 tens, and the carried ten makes 9 tens.",
    // After the first fix, the real model again (23 × 4, 34 × 12).
    "Look at the tens: 2 tens times 4 is 8 tens, and the carried 1 ten makes 9 tens.",
    "2 × 4 is 8, and the carried 1 makes 9.",
    // 52 − 28 (read as 4 = 24: "4 ones and 4 tens minus 2 tens" as one side).
    "You found 12 minus 8 is 4 ones and 4 tens minus 2 tens is 2 tens, so 24 is right.",
    // #1088: leading unary arithmetic operators leave the inner comparison unread for the math review.
    "Half of 1340 is 670.",
    "Double 670 is 1340.",
    "Triple 4 is 12.",
  ])("%s: no refusal, the math review reads it", (sentence) => {
    expect(falseClaims(sentence)).toEqual([]);
    const v = checkTutorSay(sentence, ctx);
    expect(v).toMatchObject({ ok: true });
    if (v.ok) expect(v.math).toContain(sentence);
  });

  it("a quantity joined by \"and\" alone is still read: 52 is 5 tens and 2 ones", () => {
    expect(checkTutorSay("52 is 5 tens and 2 ones.", ctx)).toMatchObject({ ok: true, math: [] });
    expect(checkTutorSay("52 is 4 tens and 2 ones.", ctx)).toMatchObject({ ok: false, reason: "false_equation" });
  });

  it("a false claim read in full is still refused", () => {
    expect(checkTutorSay("3 tens times 2 is 7 tens.", ctx)).toMatchObject({ ok: false, reason: "false_equation" });
    expect(checkTutorSay("12 minus 8 is 5.", ctx)).toMatchObject({ ok: false, reason: "false_equation" });
    // "2 × 4 = 8 tens" says 8 = 80, read in full: refused (the real model's message; its repair then said it truly).
    expect(checkTutorSay("I'll put it on the board: 2 × 4 = 8 tens.", ctx)).toMatchObject({ ok: false, reason: "false_equation" });
    // The same run-in words with a false claim after them are never passed by code: the math review reads them.
    const v = checkTutorSay("The tens of 34 is 4.", ctx);
    expect(v).toMatchObject({ ok: true });
    if (v.ok) expect(v.math).toEqual(["The tens of 34 is 4."]);
  });
});

describe("the equation reader refuses only an equation read in full", () => {
  const sentence = "So 34 times 12 is 34 times 2, plus 34 times 10.";
  it("an equation that runs on after its comma is unread with the guard", () => {
    expect(equationsOf(sentence, { whole: true })).toHaveLength(1);
    expect(equationsOf(sentence, { whole: true, guard: fullRead })).toEqual([]);
    const v = checkTutorSay(sentence, ctx);
    expect(v).toMatchObject({ ok: true });
    if (v.ok) expect(v.math).toEqual([sentence]);
  });

  it("an equation read in full is still judged with the guard", () => {
    expect(equationsOf("So 34 times 12 is 408.", { whole: true, guard: fullRead })).toHaveLength(1);
    expect(checkTutorSay("So 34 times 12 is 400.", ctx)).toMatchObject({ ok: false, reason: "false_equation" });
  });
});
