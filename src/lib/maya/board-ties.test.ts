import { describe, expect, it } from "vitest";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { workedSteps, type Operation, type OperationPackage } from "@/lib/question-package";
import { deriveDrawings, legacyDraw, sentenceCueWord } from "./board-ties";
import { sentencesOf } from "./say-check";

// B2, "derive the drawing from the sentence": code reads each accepted sentence and draws what it says in full, with
// the question's own computed values, only what is new, and only on earlier work the child's screen showed (or that an
// earlier batch of the same message draws). Pure: the session tests are in src/lib/maya-board-speak.test.ts.

const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const ADD = SAMPLE_PACKAGES["add-27-39"] as OperationPackage;
const id = (k: number, i: number) => `n-${k}-${i}`;
const derive = (pkg: OperationPackage, text: string, drawn: string[] = [], sent: string[] = [], noDraw: number[] | "all" = []) => deriveDrawings(pkg, sentencesOf(text), drawn, sent, noDraw, id);
const ops = (cs: readonly Record<string, unknown>[]) => cs.map((c) => c.op);
const reasons = (r: ReturnType<typeof derive>) => r.reads.filter((x) => !x.drew).map((x) => x.reason);

describe("default on: 52 − 28 draws the trade and each digit as Maya says them", () => {
  it("one batch per sentence that draws, in sentence order, each digit after the trade it builds on", () => {
    const r = derive(SUB, "We trade 1 ten for 10 ones. Write 4 in the ones. 4 minus 2 is 2, so write 2 in the tens. What is the answer?");
    expect(r.drawings.map((d) => [d.sentence, ops(d.commands)])).toEqual([[0, ["regroup"]], [1, ["put"]], [2, ["write", "put"]]]);
    expect(r.drawings[1].commands[0]).toMatchObject({ value: "4", target: { column: "ones" } });
    expect(r.drawings[2].commands).toMatchObject([{ text: "4 − 2 = 2" }, { value: "2", target: { column: "tens" } }]);
    // Each digit builds on the work before it in this same message (the trade, then the ones digit): it names those batches.
    expect(r.drawings.map((d) => d.after)).toEqual([[], [0], [0, 1]]);
    expect(r.reads.every((x) => x.drew)).toBe(true);
  });
  it("a plain lead-in and a true state fact keep the sentence read", () => {
    expect(derive(SUB, "Let's show it: we trade 1 ten for 10 ones, so 2 ones become 12 ones.").drawings).toHaveLength(1);
    expect(derive(SUB, "Watch, we trade 1 ten for 10 ones.").drawings).toHaveLength(1);
  });
  it("plain words the samples used keep the sentence read (closed forms, no number, place or negation)", () => {
    expect(derive(SUB, "You're right, we can't take 8 from 2 ones, so we borrow: we trade 1 ten for 10 ones.").drawings).toHaveLength(1);
    expect(derive(SUB, "Yes, let's show it: we trade 1 ten for 10 ones.").drawings).toHaveLength(1);
    expect(derive(SUB, "We trade 1 ten for 10 ones, so the ones are now 12.").drawings).toHaveLength(1);
    // Not a value a trade of this question gives: the sentence is unread.
    expect(derive(SUB, "We trade 1 ten for 10 ones, so the ones are now 13.").drawings).toEqual([]);
    expect(derive(SUB, "We will trade, so we trade 1 ten for 10 ones.").drawings).toEqual([]);
    expect(derive(SUB, "We can't take 8 ones from 2 tens, so we trade 1 ten for 10 ones.").drawings).toEqual([]);
  });
  it("a sentence with several drawable clauses draws each, in clause order", () => {
    const r = derive(SUB, "We trade 1 ten for 10 ones, so write 4 in the ones.");
    expect(r.drawings.map((d) => ops(d.commands))).toEqual([["regroup", "put"]]);
  });
});

describe("what never draws", () => {
  it("a negated, conditional, questioned or deferred clause", () => {
    for (const text of ["Do not trade yet.", "If you are stuck, we trade 1 ten for 10 ones.", "Should we trade 1 ten for 10 ones?", "We trade 1 ten for 10 ones, but not yet.", "Do not do this: we trade 1 ten for 10 ones."]) {
      expect(derive(SUB, text).drawings, text).toEqual([]);
    }
    expect(reasons(derive(SUB, "If you are stuck, we trade 1 ten for 10 ones."))).toEqual(["unread_sentence"]);
  });
  it("values that differ from code's computed values", () => {
    expect(reasons(derive(SUB, "We trade 2 tens for 20 ones."))).toEqual(["differs"]);
    expect(reasons(derive(SUB, "Write 5 in the ones.", ["trade:ones"]))).toEqual(["differs"]);
    // A true equation that is not one of the question's own steps (a reversed subtraction, a twin) draws no note.
    expect(reasons(derive(SUB, "8 minus 2 is 6."))).toEqual(["not_a_step"]);
    expect(reasons(derive(SUB, "4 plus 8 is 12."))).toEqual(["not_a_step"]);
    // A false state fact leaves the sentence unread.
    expect(derive(SUB, "We trade 1 ten for 10 ones, so 2 ones become 13 ones.").drawings).toEqual([]);
  });
  it("earlier work the sentence does not say and the child's screen has not shown", () => {
    expect(reasons(derive(SUB, "Write 4 in the ones."))).toEqual(["needs_earlier"]);
    // Sent with no word yet from the screen: not shown, so it does not count (review of #1094, round 5).
    expect(reasons(derive(SUB, "Write 4 in the ones.", ["trade:ones"], ["trade:ones"]))).toEqual(["needs_earlier"]);
    // Shown: the digit draws, alone, with no hidden trade.
    const shown = derive(SUB, "Write 4 in the ones.", ["trade:ones"]);
    expect(shown.drawings.map((d) => [ops(d.commands), d.after])).toEqual([[["put"], []]]);
  });
  it("repeats: what the board already shows or was sent, and a note said twice", () => {
    expect(reasons(derive(SUB, "We trade 1 ten for 10 ones.", ["trade:ones"]))).toEqual(["repeat"]);
    expect(reasons(derive(SUB, "We trade 1 ten for 10 ones.", ["trade:ones"], ["trade:ones"]))).toEqual(["repeat"]);
    const twice = derive(SUB, "12 minus 8 is 4. 12 minus 8 is 4.");
    expect(twice.drawings).toHaveLength(1);
    expect(reasons(twice)).toEqual(["repeat"]);
    expect(reasons(derive(SUB, "12 minus 8 is 4.", ["note:12 − 8 = 4"]))).toEqual(["repeat"]);
  });
  it("a sentence the model marked no draw", () => {
    expect(derive(SUB, "We trade 1 ten for 10 ones.", [], [], [1]).drawings).toEqual([]);
    expect(reasons(derive(SUB, "We trade 1 ten for 10 ones.", [], [], "all"))).toEqual(["no_draw"]);
  });
});

describe("other kinds", () => {
  it("27 + 39: the ones digit and its carry, said in order", () => {
    expect(derive(ADD, "Write 6 in the ones, then we trade 10 ones for 1 ten.").drawings.map((d) => ops(d.commands))).toEqual([["put", "regroup"]]);
    // The kind writes the carry with the digit: a sentence that says only the digit draws nothing.
    expect(reasons(derive(ADD, "Write 6 in the ones."))).toEqual(["differs"]);
  });
  it("34 × 12: each row, then the digit", () => {
    const op: Operation = { kind: "multiply", operands: [34, 12] };
    const pkg = { ...SUB, id: "multiply-34-12", text: "34 × 12 = ?", operation: op, steps: workedSteps(op), answer: { value: { type: "number", value: 408 }, accepted: [], unit: null } } as OperationPackage;
    expect(reasons(derive(pkg, "Write 8 in the ones."))).toEqual(["needs_earlier"]);
    const r = derive(pkg, "Write 68. Write 340. Write 8 in the ones.");
    expect(r.drawings.map((d) => d.commands.map((c) => c.value))).toEqual([["68"], ["340"], ["8"]]);
    expect(r.drawings[2].after).toEqual([0, 1]);
  });
  it("a proposal from before B2 keeps its own draw list", () => {
    expect(legacyDraw([{ offer: "trade" }])).toBe(true);
    expect(legacyDraw([{ offer: "trade", sentence: 1 }])).toBe(false);
    expect(legacyDraw([])).toBe(false);
  });
});

describe("sentenceCueWord", () => {
  const TEXT = "You can't take 8 from 2, so we trade 1 ten for 10 ones. Write 4 in the ones. What is 4 tens minus 2 tens?";
  it("is the last word of the sentence, counted over the whole message", () => {
    expect(sentenceCueWord(TEXT, 0)).toBe(14);
    expect(sentenceCueWord(TEXT, 1)).toBe(19);
    expect(sentenceCueWord(TEXT, 2)).toBe(26);
    expect(sentenceCueWord(TEXT, 9)).toBe(26);
  });
});
