import { describe, expect, it } from "vitest";
import { NEEDS_A_LOOK, plainProblem, plainReason } from "@/lib/workbook-reason";

describe("plainReason", () => {
  it.each([
    ['it works the same sum as question 23 on this page ("? = 1 + 3")', "Same sum as question 23"],
    ['it is the same as question 4 on this page ("2 + 2 = ?")', "Same as question 4"],
    ["its text is the same as question 5's on this page (\"Add 2 and 3.\"): word it another way", "Same words as question 5"],
    ['it differs from question 2 on this page ("4 + 3 = ?") only by one number: ask another kind of question', "Only one number different from question 2"],
    ['it asks the same kind of question as question 7 on this page ("Sam has 3 cats.") with other numbers or names: ask another kind of question', "Same kind of question as question 7"],
    ['it repeats a question already asked on page 12 ("3 + 4 = ?"): write a different question', "Repeats a question from page 12"],
    ["the book already asks this kind of question 4 times (pages 2, 5, 9): ask another kind of question", "Same kind of question too often in the book"],
    ['the solve check read the printed question another way: box answer: a reader of the printed text answers "5", the key says "4". Write the text so it asks exactly what the answer key answers, with every number it needs', "Checking AI got a different answer"],
    ["the solve check could not confirm the answer key: the solve check was late. Write the text so it asks exactly what the answer key answers", "Checking AI couldn't check it"],
    ["the question gives its own answer (7) in its text: ask for it instead", "Gives away its answer"],
    ["adding or taking away 0 gives back a number the question already says: ask for a number the child works out", "Adds or takes away 0"],
    ["the AI gave no answer: time is up", "The AI wrote nothing usable"],
    ["the AI wrote nothing for this question (its answer held no items)", "The AI wrote nothing usable"],
    ["it used its AI attempts in an earlier try that stopped before its page was stored", "Ran out of tries"],
    ["the number 120 is too big for this question: its numbers are at most 100", "A number is too big for this level"],
    ["this question uses no fractions: they start at U8", "Uses math from a later level"],
    ['"seven" is a number in words: write every number in digits', "A number is written in words"],
    ["the easier example has the question's answer", "Easier example has the same answer"],
    ["the easier example is not smaller than the question", "Easier example isn't easier"],
    ["the question has no easier example", "Easier example doesn't work"],
    ["the text names 4 and 9, but the operation works 4 + 5: name every number", "Words don't match the math"],
    ["the question asks yes or no, but its answer is the operation's number: ask for a number (How far is 8 from 10?), or use draw", "Answer doesn't match"],
    ["the wrong answer 9 is a right answer", "Answer doesn't match"],
    ["the text counts from 2 to 10, but the sequence goes from 2 to 8: make them the same", "Words don't match the number pattern"],
    ["day 1 page 2 (practice): question 3 in the card slot runs 14 px past the bottom of the content area", "Doesn't fit on the page"],
    ["day 1 page 2 (practice): question 3's answer box covers its own text", "Answer box covers the words"],
  ])("%s", (reason, plain) => {
    expect(plainReason(reason)).toBe(plain);
  });

  it("shows a plain fallback, never the raw text, for a reason it does not know", () => {
    expect(plainReason("the operation: a ten-frame shows + or −, not ×")).toBe(NEEDS_A_LOOK);
    expect(plainReason("something new the generator says one day")).toBe("Needs a look");
  });
});

describe("plainProblem", () => {
  it("names the failed question once, before a reason that names another question", () => {
    expect(plainProblem({ question: 3, reason: 'question 3 failed: it works the same sum as question 23 on this page ("? = 1 + 3")' }))
      .toBe("Question 3: Same sum as question 23");
  });

  it("does not repeat the question when the plain line names it", () => {
    expect(plainProblem({ question: 2, reason: "fit check: day 1 page 2 (practice): question 2's answer box covers its own text" }))
      .toBe("Question 2: Answer box covers the words");
    expect(plainProblem({ question: 23, reason: 'question 4 failed: it works the same sum as question 23 on this page ("x")' }))
      .toBe("Same sum as question 23");
  });

  it("maps a fit check problem with no question", () => {
    expect(plainProblem({ question: null, reason: "fit check: day 3 page 1 (unit-a): the card slot holds 9 items; it takes at most 8" }))
      .toBe("Too many questions in one part");
  });

  it("keeps a render problem's own words", () => {
    expect(plainProblem({ question: null, reason: "the QR code is not printed" })).toBe("the QR code is not printed");
  });

  it("gives an unknown failed reason the plain fallback", () => {
    expect(plainProblem({ question: 5, reason: "question 5 failed: a pattern item needs a core" })).toBe("Question 5: Needs a look");
  });
});
