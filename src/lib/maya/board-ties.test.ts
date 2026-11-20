import { describe, expect, it } from "vitest";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { workedSteps, type Operation, type OperationPackage } from "@/lib/question-package";
import { deriveDrawings, legacyDraw, sentenceCueWord } from "./board-ties";
import { sentencesOf } from "./say-check";
import { agreementClause } from "./tutor";

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
    // A judgment opener counts only when the say check validated it (the session passes agreementClause then).
    expect(deriveDrawings(SUB, sentencesOf("You're right, we can't take 8 from 2 ones, so we borrow: we trade 1 ten for 10 ones."), [], [], [], id, agreementClause).drawings).toHaveLength(1);
    expect(deriveDrawings(SUB, sentencesOf("Yes, let's show it: we trade 1 ten for 10 ones."), [], [], [], id, agreementClause).drawings).toHaveLength(1);
    expect(derive(SUB, "You're right, we can't take 8 from 2 ones, so we borrow: we trade 1 ten for 10 ones.").drawings).toEqual([]);
    expect(derive(SUB, "Yes, let's show it: we trade 1 ten for 10 ones.").drawings).toEqual([]);
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

describe("preview of 0e6cfeed0: the tens digit of 52 − 28 in Maya's own phrasing", () => {
  const SAID = "Yes, 4 tens minus 2 tens is 2 tens, so write 2 in the tens.";
  const shown = ["trade:ones", "digit:ones"];
  it("draws the tens digit when the say check validated the \"Yes\" (code found the child right)", () => {
    const r = deriveDrawings(SUB, sentencesOf(SAID), shown, [], [], id, agreementClause);
    expect(r.drawings.map((d) => d.commands)).toMatchObject([[{ op: "put", value: "2", target: { column: "tens" } }]]);
  });
  it("an unvalidated \"Yes\" still draws nothing", () => {
    expect(derive(SUB, SAID, shown).drawings).toEqual([]);
    expect(reasons(derive(SUB, SAID, shown))).toEqual(["unread_sentence"]);
  });
  it("a place lead-in and a step equation with places keep the sentence read; a false one does not", () => {
    expect(derive(SUB, "Now the tens: write 2 in the tens.", shown).drawings).toHaveLength(1);
    expect(derive(SUB, "Start with the ones: we trade 1 ten for 10 ones.").drawings).toHaveLength(1);
    expect(derive(SUB, "4 tens minus 2 tens is 2 tens, so write 2 in the tens.", shown).drawings).toHaveLength(1);
    expect(derive(SUB, "4 tens minus 2 tens is 3 tens, so write 2 in the tens.", shown).drawings).toEqual([]);
    expect(derive(SUB, "5 tens minus 2 tens is 3 tens, so write 2 in the tens.", shown).drawings).toEqual([]);
  });
});

describe("review of #1094 (f4c382735): every clause binds to the action's step", () => {
  const shown = ["trade:ones", "digit:ones"];
  it("a place lead-in about another step draws nothing", () => {
    const r = derive(SUB, "Now the tens: write 4 in the ones.", ["trade:ones"]);
    expect(r.drawings).toEqual([]);
    expect(reasons(r)).toEqual(["other_step"]);
    // The same lead-in with its own step draws.
    expect(derive(SUB, "Now the ones: write 4 in the ones.", ["trade:ones"]).drawings).toHaveLength(1);
  });
  it("a step equation with places binds to the step of its place, not to its numbers alone", () => {
    expect(derive(SUB, "4 ones minus 2 ones is 2 ones, so write 2 in the tens.", shown).drawings).toEqual([]);
    expect(derive(SUB, "4 tens minus 2 tens is 2 tens, so write 2 in the tens.", shown).drawings).toHaveLength(1);
  });
  it("a reason may be about an earlier step; an action about another step may not", () => {
    // The borrow (ones step) is a reason for the tens digit: it came first.
    expect(derive(SUB, "52 is 4 tens and 12 ones, so write 2 in the tens.", shown).drawings).toHaveLength(1);
    // Two actions about two steps in one sentence: neither draws.
    expect(derive(SUB, "Write 4 in the ones, then write 2 in the tens.", ["trade:ones"]).drawings).toEqual([]);
    // A reason about a later step does not stand before an earlier action.
    expect(derive(SUB, "4 tens minus 2 tens is 2 tens, so write 4 in the ones.", ["trade:ones"]).drawings).toEqual([]);
  });
  it("numbers of the easier example bind to no step of the question", () => {
    expect(derive(SUB, "You can't take 9 from 3, so we trade 1 ten for 10 ones.").drawings).toEqual([]);
    expect(derive(SUB, "You can't take 8 from 2, so we trade 1 ten for 10 ones.").drawings).toHaveLength(1);
  });
});

describe("first-person board writing reads as the same action", () => {
  it("\"I'll write\", \"I'll put\", \"I'll trade\" and \"Let's trade\" draw like the plain forms, under the same rules", () => {
    expect(derive(SUB, "I'll trade 1 ten for 10 ones.").drawings.map((d) => ops(d.commands))).toEqual([["regroup"]]);
    expect(derive(SUB, "Let's trade 1 ten for 10 ones.").drawings.map((d) => ops(d.commands))).toEqual([["regroup"]]);
    expect(derive(SUB, "I will trade 1 ten for 10 ones, so the ones are now 12.").drawings).toHaveLength(1);
    expect(derive(SUB, "I'll write 4 in the ones.", ["trade:ones"]).drawings.map((d) => d.commands)).toMatchObject([[{ op: "put", value: "4", target: { column: "ones" } }]]);
    expect(derive(SUB, "I'll put 4 in the ones.", ["trade:ones"]).drawings).toHaveLength(1);
    // The same rules: other values, earlier work missing, a false state, and "we will" (a later time) draw nothing.
    expect(derive(SUB, "I'll write 5 in the ones.", ["trade:ones"]).drawings).toEqual([]);
    expect(derive(SUB, "I'll write 4 in the ones.").drawings).toEqual([]);
    expect(derive(SUB, "I'll trade 1 ten for 10 ones, so the ones are now 2.").drawings).toEqual([]);
    expect(derive(SUB, "We will trade 1 ten for 10 ones.").drawings).toEqual([]);
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
    const twice = derive(SUB, "12 minus 8 is 4. 12 minus 8 is 4.", ["trade:ones"]);
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
    // The digit and its carry are separate actions: the digit alone draws; the carry alone waits for the digit.
    expect(derive(ADD, "Write 6 in the ones.").drawings.map((d) => ops(d.commands))).toEqual([["put"]]);
    expect(reasons(derive(ADD, "We trade 10 ones for 1 ten."))).toEqual(["needs_earlier"]);
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

describe("#1096: long-division steps draw from explicit clauses and dependencies", () => {
  const divPkg = (a: number, b: number): OperationPackage => {
    const op: Operation = { kind: "divide", operands: [a, b] };
    return {
      ...SUB,
      id: `divide-${a}-${b}`,
      text: `${a} ÷ ${b} = ?`,
      level: 12,
      skill: { standard: "4.8", skills: ["4.8-division-facts"] },
      operation: op,
      steps: workedSteps(op),
      answer: { value: { type: "number", value: a / b }, accepted: [], unit: null },
      wrongAnswers: [{ value: { type: "number", value: a / b + 1 }, cause: "careless", description: "One more.", step: null }],
      easierExample: { text: "8 ÷ 2 = ?", operation: { kind: "divide", operands: [8, 2] }, steps: workedSteps({ kind: "divide", operands: [8, 2] }), answer: { type: "number", value: 4 } },
    } as OperationPackage;
  };
  const D84 = divPkg(84, 4);
  const D96 = divPkg(96, 4);

  it("96 ÷ 4: draws layout, quotient, product, remainder, exchanged ones and next step with explicit after dependencies", () => {
    const r = derive(
      D96,
      "Share 96 into 4 groups. Write 2 above the tens, subtract 8, leaving 1 ten. Combine the 6 ones to make 16 ones. Write 4 above the ones, subtract 16, leaving 0 ones.",
    );
    expect(r.drawings.map((d) => [d.sentence, ops(d.commands), d.after])).toEqual([
      [0, ["division"], []],
      [1, ["put", "put", "put"], [0]],
      [2, ["put"], [1]],
      [3, ["put", "put", "put"], [2]],
    ]);
    expect(r.drawings[1].commands).toMatchObject([
      { op: "put", target: { rowId: "quotient", column: "tens" }, value: "2" },
      { op: "put", target: { rowId: "product1" }, value: "8" },
      { op: "put", target: { rowId: "difference1" }, value: "1" },
    ]);
    expect(r.drawings[2].commands).toMatchObject([
      { op: "put", target: { rowId: "bring2" }, value: "6" },
    ]);
    expect(r.drawings[3].commands).toMatchObject([
      { op: "put", target: { rowId: "quotient", column: "ones" }, value: "4" },
      { op: "put", target: { rowId: "product2" }, value: "16" },
      { op: "put", target: { rowId: "difference2" }, value: "0" },
    ]);
    expect(r.reads.every((x) => x.drew)).toBe(true);
  });

  it("84 ÷ 4: distinguishes duplicate values (4 ones vs product 4, and 0 tens left vs 0 ones left) in dependency order", () => {
    const r = derive(
      D84,
      "Share 84 into 4 groups. Write 2 above the tens, subtract 8, leaving 0 tens. Move to the 4 ones. Write 1 above the ones, subtract 4, leaving 0 ones.",
    );
    expect(r.drawings.map((d) => [d.sentence, d.commands.map((c) => [(c.target as { rowId?: string } | undefined)?.rowId ?? c.op, c.value ?? null]), d.after])).toEqual([
      [0, [["division", null]], []],
      [1, [["quotient", "2"], ["product1", "8"], ["difference1", "0"]], [0]],
      [2, [["bring2", "4"]], [1]],
      [3, [["quotient", "1"], ["product2", "4"], ["difference2", "0"]], [2]],
    ]);
  });

  it("refuses wrong values, skipped dependencies and unexplained bring-down instructions", () => {
    // Missing layout: quotient cannot draw.
    expect(reasons(derive(D96, "Write 2 above the tens."))).toEqual(["needs_earlier"]);
    // Skipped product/difference: combining ones cannot draw yet.
    expect(reasons(derive(D96, "Share 96 into 4 groups. Combine the 6 ones to make 16 ones."))).toEqual(["needs_earlier"]);
    // Wrong product stops the whole multi-clause sentence.
    expect(derive(D96, "Write 2 above the tens, subtract 7, leaving 1 ten.", ["division"]).drawings).toEqual([]);
    // Wrong combined quantity (15 instead of 16) refuses to draw.
    expect(derive(D96, "Combine the 6 ones to make 15 ones.", ["division", "div:quotient:1", "div:product:1", "div:diff:1"]).drawings).toEqual([]);
    // Unexplained bring-down draws nothing.
    expect(derive(D96, "Bring down 6.", ["division", "div:quotient:1", "div:product:1", "div:diff:1"]).drawings).toEqual([]);
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
