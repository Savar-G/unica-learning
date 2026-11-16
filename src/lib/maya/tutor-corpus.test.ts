import { describe, expect, it } from "vitest";
import corpus from "./__fixtures__/tutor-corpus-20261114.json";
import { checkTutorSay } from "./tutor";

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
