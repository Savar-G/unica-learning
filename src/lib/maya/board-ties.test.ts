import { describe, expect, it } from "vitest";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import type { OperationPackage } from "@/lib/question-package";
import { drawingMatches, sentenceCueWord, tieDrawings, tiesSentences } from "./board-ties";
import { sentencesOf } from "./say-check";

// B2 ("draw while speaking"), the pure part: each drawing is tied to one sentence, at most one per sentence, built in the
// order of the sentences, and kept only when it matches its sentence. The words are never touched here.

const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const TEXT = "You can't take 8 from 2, so we trade 1 ten for 10 ones. 12 minus 8 is 4. What is 4 tens minus 2 tens?";
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

describe("drawingMatches: the drawing shows what its sentence says", () => {
  const put = (column: string, value: string) => [{ op: "put", target: { objectId: "question", part: "cell", rowId: "answer", column }, value }];
  const borrow = [{ op: "regroup", id: "t", objectId: "question", rowId: "top", kind: "borrow", from: "tens", to: "ones" }];
  it("a digit: the sentence says the digit, with no other place", () => {
    expect(drawingMatches("12 minus 8 is 4.", "digit", put("ones", "4"))).toBe(true);
    expect(drawingMatches("Write 4 in the ones.", "digit", put("ones", "4"))).toBe(true);
    // The same number, another place: "4 tens" is not the ones digit.
    expect(drawingMatches("We have 4 tens left.", "digit", put("ones", "4"))).toBe(false);
    expect(drawingMatches("We borrow 1 ten from the 5 tens.", "digit", put("ones", "4"))).toBe(false);
  });
  it("a trade: the sentence names its places or says the trade", () => {
    expect(drawingMatches("52 is 4 tens and 12 ones.", "trade", borrow)).toBe(true);
    expect(drawingMatches("So we borrow.", "trade", borrow)).toBe(true);
    expect(drawingMatches("12 minus 8 is 4.", "trade", borrow)).toBe(false);
    expect(drawingMatches("Look at the hundreds.", "trade", borrow)).toBe(false);
  });
  it("a note: the sentence says every number of its equation", () => {
    const note = [{ op: "write", id: "n", text: "12 − 8 = 4", place: { below: "question" } }];
    expect(drawingMatches("12 minus 8 is 4.", "note", note)).toBe(true);
    expect(drawingMatches("Twelve minus eight is four.", "note", note)).toBe(true);
    expect(drawingMatches("What is 12 minus 8?", "note", note)).toBe(false);
  });
  it("a chart, a highlight and a division layout", () => {
    const chart = [{ op: "place_chart", id: "question", number: "45672", place: { region: "main" } }];
    expect(drawingMatches("Let's put 45,672 in a chart.", "chart", chart)).toBe(true);
    expect(drawingMatches("Look at the ten thousands.", "chart", chart)).toBe(true);
    expect(drawingMatches("Let's look.", "chart", chart)).toBe(false);
    const band = [{ op: "mark", id: "b", target: { objectId: "question", part: "piece", piece: "band-ten_thousands" }, style: "highlight" }];
    expect(drawingMatches("The 4 is in the ten thousands place.", "band", band)).toBe(true);
    expect(drawingMatches("The 5 is in the thousands place.", "band", band)).toBe(false);
    const division = [{ op: "division", id: "d", dividend: "84", divisor: "4", place: { region: "main" } }];
    expect(drawingMatches("Let's share 84 into 4 groups.", "division", division)).toBe(true);
    expect(drawingMatches("Let's start.", "division", division)).toBe(false);
  });
});

describe("sentenceCueWord", () => {
  it("is the last word of the sentence, counted over the whole message", () => {
    expect(sentenceCueWord(TEXT, 0)).toBe(14);
    expect(sentenceCueWord(TEXT, 1)).toBe(19);
    expect(sentenceCueWord(TEXT, 2)).toBe(26);
    expect(sentenceCueWord(TEXT, 9)).toBe(26);
  });
});
