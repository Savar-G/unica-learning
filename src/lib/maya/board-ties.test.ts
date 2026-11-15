import { describe, expect, it } from "vitest";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import type { OperationPackage } from "@/lib/question-package";
import { drawingMatches, sentenceCueWord, tieDrawings, tiesSentences } from "./board-ties";
import { sentencesOf } from "./say-check";

// B2 ("draw while speaking"), the pure part: each drawing is tied to one sentence, at most one per sentence, built in the
// order of the sentences, and kept only when it matches its sentence. The words are never touched here.

const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const TEXT = "You can't take 8 from 2, so we trade 1 ten for 10 ones. 12 minus 8 is 4, so write 4 in the ones. What is 4 tens minus 2 tens?";
const S = sentencesOf(TEXT);
const id = (k: number, i: number) => `n-${k}-${i}`;
const ops = (cs: readonly Record<string, unknown>[]) => cs.map((c) => c.op);

describe("tieDrawings", () => {
  it("ties each drawing to the sentence it names and builds them in sentence order", () => {
    // The model lists the digit first; the board still gets the trade first (its sentence comes first).
    const { drawings, drops } = tieDrawings(SUB, [{ offer: "digit", place: "ones", sentence: 2 }, { offer: "trade", place: "", sentence: 1 }], S, [], id);
    expect(drops).toEqual([]);
    expect(drawings.map((d) => [d.sentence, d.offer])).toEqual([[0, "trade"], [1, "digit"]]);
    expect(ops(drawings[0].commands)).toEqual(["regroup"]);
    // The digit is built on the trade before it: no second trade in its batch.
    expect(drawings[1].commands).toEqual([{ op: "put", target: { objectId: "question", part: "cell", rowId: "answer", column: "ones" }, value: "4" }]);
    expect(drawings.flatMap((d) => d.keys)).toEqual(["trade:ones", "digit:ones"]);
  });

  it("draws at most one drawing per sentence: the first request for a sentence stands", () => {
    const { drawings, drops } = tieDrawings(SUB, [{ offer: "trade", place: "", sentence: 1 }, { offer: "note", place: "12 - 8 = 4", sentence: 1 }], S, [], id);
    expect(drawings.map((d) => d.offer)).toEqual(["trade"]);
    expect(drops).toEqual([{ offer: "note", sentence: 0, reason: "same_sentence" }]);
  });

  it("drops a drawing that does not match its sentence, and keeps the others", () => {
    // The ones digit (4) on the trade sentence, which says 8, 2, 1 and 10: a mismatch.
    const { drawings, drops } = tieDrawings(SUB, [{ offer: "digit", place: "ones", sentence: 1 }, { offer: "note", place: "12 - 8 = 4", sentence: 2 }], S, [], id);
    expect(drops).toEqual([{ offer: "digit", sentence: 0, reason: "mismatch" }]);
    expect(drawings.map((d) => [d.sentence, d.offer])).toEqual([[1, "note"]]);
  });

  it("drops a request with no valid sentence, and one with nothing new to draw", () => {
    const { drawings, drops } = tieDrawings(SUB, [{ offer: "trade", place: "", sentence: 0 }, { offer: "trade", place: "", sentence: 9 }, { offer: "trade", place: "", sentence: 1.5 }, { offer: "trade", place: "", sentence: 1 }], S, ["trade:ones"], id);
    expect(drawings).toEqual([]);
    expect(drops).toEqual([
      { offer: "trade", sentence: null, reason: "no_sentence" },
      { offer: "trade", sentence: null, reason: "no_sentence" },
      { offer: "trade", sentence: null, reason: "no_sentence" },
      { offer: "trade", sentence: 0, reason: "nothing_new" },
    ]);
  });

  it("gives each drawing's notes their own ids", () => {
    const text = "12 minus 8 is 4. 4 minus 2 is 2.";
    const { drawings } = tieDrawings(SUB, [{ offer: "note", place: "12 - 8 = 4", sentence: 1 }, { offer: "note", place: "4 - 2 = 2", sentence: 2 }], sentencesOf(text), [], id);
    expect(drawings.map((d) => d.commands[0].id)).toEqual(["n-0-0", "n-1-0"]);
  });

  it("uses the ties only when a request names a sentence", () => {
    expect(tiesSentences([{ offer: "trade" }])).toBe(false);
    expect(tiesSentences([{ offer: "trade", sentence: 1 }])).toBe(true);
  });
});

describe("drawingMatches: the drawing's action equals the action of one clause", () => {
  const put = (column: string, value: string) => [{ op: "put", target: { objectId: "question", part: "cell", rowId: "answer", column }, value }];
  const borrow = [{ op: "regroup", id: "t", objectId: "question", rowId: "top", kind: "borrow", from: "tens", to: "ones" }];
  const carry = [{ op: "put", target: { objectId: "question", part: "cell", rowId: "answer", column: "ones" }, value: "4" }, { op: "regroup", id: "c", objectId: "question", rowId: "answer", kind: "carry", from: "ones", to: "tens" }];
  const note = (text: string) => [{ op: "write", id: "n", text, place: { below: "question" } }];
  it("a digit: write that value in that place", () => {
    expect(drawingMatches("Write 4 in the ones.", "digit", put("ones", "4"))).toBe(true);
    expect(drawingMatches("4 goes in the ones place.", "digit", put("ones", "4"))).toBe(true);
    expect(drawingMatches("The ones digit is 4.", "digit", put("ones", "4"))).toBe(true);
    expect(drawingMatches("12 minus 8 is 4, so write 4 in the ones.", "digit", put("ones", "4"))).toBe(true);
    // Another kind of action, another value, another place, or a value with no place: no match.
    expect(drawingMatches("12 minus 8 is 4.", "digit", put("ones", "4"))).toBe(false);
    expect(drawingMatches("Write 5 in the ones.", "digit", put("ones", "4"))).toBe(false);
    expect(drawingMatches("Write 4 in the tens.", "digit", put("ones", "4"))).toBe(false);
    expect(drawingMatches("Write 4.", "digit", put("ones", "4"))).toBe(false);
  });
  it("no field is taken from another clause (review of #1094, round 2)", () => {
    expect(drawingMatches("Write 4 in the tens, so write 5 in the ones.", "digit", put("ones", "4"))).toBe(false);
    expect(drawingMatches("Write 5 in the tens, then write 4 in the ones.", "digit", put("ones", "4"))).toBe(true);
  });
  it("a trade: both quantities and both places", () => {
    expect(drawingMatches("We trade 1 ten for 10 ones.", "trade", borrow)).toBe(true);
    expect(drawingMatches("We trade one ten for ten ones.", "trade", borrow)).toBe(true);
    expect(drawingMatches("We trade 2 tens for 20 ones.", "trade", borrow)).toBe(false);
    expect(drawingMatches("We trade 1 ten for 12 ones.", "trade", borrow)).toBe(false);
    expect(drawingMatches("We trade 1 hundred for 10 tens.", "trade", borrow)).toBe(false);
    expect(drawingMatches("52 is 4 tens and 12 ones.", "trade", borrow)).toBe(false);
    expect(drawingMatches("So we borrow.", "trade", borrow)).toBe(false);
    // A carry gives 10 ones for 1 ten.
    expect(drawingMatches("We trade 10 ones for 1 ten.", "trade", carry)).toBe(true);
    expect(drawingMatches("We trade 1 ten for 10 ones.", "trade", carry)).toBe(false);
  });
  it("a note: the same operation, with the same operands in the same roles", () => {
    expect(drawingMatches("12 minus 8 is 4.", "note", note("12 − 8 = 4"))).toBe(true);
    expect(drawingMatches("Twelve minus eight is four.", "note", note("12 − 8 = 4"))).toBe(true);
    expect(drawingMatches("8 plus 4 is 12.", "note", note("12 − 8 = 4"))).toBe(false);
    expect(drawingMatches("12 minus 4 is 8.", "note", note("12 − 8 = 4"))).toBe(false);
    expect(drawingMatches("What is 12 minus 8?", "note", note("12 − 8 = 4"))).toBe(false);
    expect(drawingMatches("6 times 870 is 5220.", "note", note("6 × 870 = 5220"))).toBe(true);
  });
  it("a chart, a highlight and a division layout", () => {
    const chart = [{ op: "place_chart", id: "question", number: "45672", place: { region: "main" } }];
    expect(drawingMatches("Let's put 45,672 in a place value chart.", "chart", chart)).toBe(true);
    expect(drawingMatches("Let's put 45,000 in a chart.", "chart", chart)).toBe(false);
    expect(drawingMatches("Look at the ten thousands.", "chart", chart)).toBe(false);
    const band = [{ op: "mark", id: "b", target: { objectId: "question", part: "piece", piece: "band-ten_thousands" }, style: "highlight" }];
    expect(drawingMatches("Look at the ten thousands place.", "band", band)).toBe(true);
    expect(drawingMatches("Look at the thousands.", "band", band)).toBe(false);
    const division = [{ op: "division", id: "d", dividend: "84", divisor: "4", place: { region: "main" } }];
    expect(drawingMatches("Let's share 84 into 4 groups.", "division", division)).toBe(true);
    expect(drawingMatches("Let's share 84 into 2 groups.", "division", division)).toBe(false);
  });
  it("a drawing code cannot read as one action ties to nothing", () => {
    const chain = [...borrow, { op: "regroup", id: "u", objectId: "question", rowId: "top", kind: "borrow", from: "hundreds", to: "tens" }];
    expect(drawingMatches("We trade 1 ten for 10 ones.", "trade", chain)).toBe(false);
    expect(drawingMatches("Write 4 in the ones.", "step", put("ones", "4"))).toBe(false);
  });
});

describe("drawingMatches fails closed: only a plain positive statement of the drawing (Sol review of #1094)", () => {
  const ones4 = [{ op: "put", target: { objectId: "question", part: "cell", rowId: "answer", column: "ones" }, value: "4" }];
  const borrow = [{ op: "regroup", id: "t", objectId: "question", rowId: "top", kind: "borrow", from: "tens", to: "ones" }];
  it("a sentence that negates or defers the action draws nothing", () => {
    expect(drawingMatches("Do not trade yet.", "trade", borrow)).toBe(false);
    expect(drawingMatches("Don't borrow from the tens.", "trade", borrow)).toBe(false);
    expect(drawingMatches("The tens digit stays 5 for now.", "trade", borrow)).toBe(false);
    expect(drawingMatches("We will trade 1 ten later.", "trade", borrow)).toBe(false);
    expect(drawingMatches("We trade 1 ten for 10 ones, but not yet.", "trade", borrow)).toBe(false);
    expect(drawingMatches("Do not write 4 in the ones yet.", "digit", ones4)).toBe(false);
    expect(drawingMatches("Never write 4 in the ones.", "digit", ones4)).toBe(false);
  });
  it("a question or a condition draws nothing", () => {
    expect(drawingMatches("Should we trade 1 ten for 10 ones?", "trade", borrow)).toBe(false);
    expect(drawingMatches("If you are stuck, we trade 1 ten for 10 ones.", "trade", borrow)).toBe(false);
    expect(drawingMatches("When you are ready, write 4 in the ones.", "digit", ones4)).toBe(false);
  });
  it("a reason before the statement is fine when it is not about the drawing", () => {
    expect(drawingMatches("You can't take 8 from 2, so we trade 1 ten for 10 ones.", "trade", borrow)).toBe(true);
    expect(drawingMatches("You can't take 8 from 2, so do not trade, we trade later.", "trade", borrow)).toBe(false);
    expect(drawingMatches("Now, write 4 in the ones.", "digit", ones4)).toBe(true);
  });
  it("a quote, an answer to a question, or a clause that takes it back draws nothing", () => {
    expect(drawingMatches("We trade 1 ten for 10 ones? No.", "trade", borrow)).toBe(false);
    expect(drawingMatches("We trade 1 ten for 10 ones, said nobody.", "trade", borrow)).toBe(false);
    expect(drawingMatches("\"We trade 1 ten for 10 ones,\" she said.", "trade", borrow)).toBe(false);
    expect(drawingMatches("Some kids write 4 in the ones, but that is wrong.", "digit", ones4)).toBe(false);
    expect(drawingMatches("If we write 4 in the ones, it's wrong.", "digit", ones4)).toBe(false);
    expect(drawingMatches("We should not trade, so we trade 1 ten for 10 ones.", "trade", borrow)).toBe(false);
  });
});

describe("sentenceCueWord", () => {
  it("is the last word of the sentence, counted over the whole message", () => {
    expect(sentenceCueWord(TEXT, 0)).toBe(14);
    expect(sentenceCueWord(TEXT, 1)).toBe(25);
    expect(sentenceCueWord(TEXT, 2)).toBe(32);
    expect(sentenceCueWord(TEXT, 9)).toBe(32);
  });
});
