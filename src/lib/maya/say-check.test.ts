import { describe, expect, it } from "vitest";
import {
  checkSay, checkSentence, equationHolds, equationKeysOf, equationsOf, fractionValue, numberValue, sayNumbers, sentencesOf, valuesOf,
  type SayRules,
} from "./say-check";

const keys = (text: string) => sayNumbers(text).map((t) => t.key);

/** 52 - 28 on the ones, nothing credited yet: the question's numbers, the child's 6 and the regroup facts. */
const rules = (over: Partial<SayRules> = {}): SayRules => ({
  allowed: [...valuesOf("52 - 28 5 2 2 8 50 20"), numberValue(6), numberValue(12)],
  shown: valuesOf("2 is less than 8. So regroup 1 ten as 10 ones. What is 12 - 8?"),
  shownEquations: [],
  forbidden: [numberValue(4), numberValue(2)].filter((v) => v.key !== "2"),
  answer: [numberValue(24)],
  wrong: [numberValue(6)],
  wordLimit: 30,
  ...over,
});

describe("sayNumbers", () => {
  it("reads digits, words, fractions, decimals and times", () => {
    expect(keys("52 minus 28")).toEqual(["52", "28"]);
    expect(keys("twenty four and seven")).toEqual(["24", "7"]);
    expect(keys("one hundred and five")).toEqual(["105"]);
    expect(keys("3/4 and three quarters and a half")).toEqual(["3/4", "3/4", "1/2"]);
    expect(keys("It is 2.5 at 3:45.")).toEqual(["2.5", "3:45"]);
    expect(keys("1,234 apples")).toEqual(["1234"]);
  });
  it("leaves counting words out: this one, a ten, one ten, ten ones, 10 ones, 1 ten", () => {
    expect(keys("This one is hard. Take a ten. One ten is ten ones.")).toEqual([]);
    expect(keys("Trade 1 ten for 10 ones.")).toEqual([]);
    expect(keys("Now we have ten.")).toEqual(["10"]);
  });
  it("compares values exactly", () => {
    expect(fractionValue(6, 8).q).toEqual([3, 4]);
    expect(numberValue(2.5).q).toEqual([5, 2]);
  });
});

describe("equations", () => {
  it("reads equations in several forms and checks their truth", () => {
    const [a] = equationsOf("2 minus 8 isn't 6.");
    expect(a.negated).toBe(true);
    expect(equationHolds(a)).toBe(false);
    const [b] = equationsOf("6 is 8 minus 2.");
    expect(b.negated).toBe(false);
    expect(equationHolds(b)).toBe(true);
    const [c] = equationsOf("So 12 − 8 = 4.");
    expect(equationHolds(c)).toBe(true);
    const [d] = equationsOf("Seven plus nine is fifteen.");
    expect(equationHolds(d)).toBe(false);
    expect(equationsOf("What is 12 minus 8?")).toEqual([]);
    expect(equationsOf("We take 8 away from 12.")).toEqual([]);
    expect(equationKeysOf("7 + 9 = 16. Then 1 + 2 + 3 = 6.")).toEqual(["7 9|+|16", "1 2 3|++|6"]);
  });
});

describe("sentences", () => {
  it("splits at sentence ends, never inside a decimal or a time", () => {
    expect(sentencesOf("Is it 2.5? Yes. At 3:45 we stop!")).toEqual(["Is it 2.5?", "Yes.", "At 3:45 we stop!"]);
  });
});

describe("checkSay", () => {
  it("passes Savar's turn: names the mistake and guides the regroup", () => {
    const v = checkSay("Not quite: 2 minus 8 isn't 6. 6 is 8 minus 2. 2 is smaller than 8, so take a ten: what is 12 minus 8?", rules());
    expect(v).toEqual({ ok: true, sentences: expect.any(Array) });
  });
  it("refuses a false equation, and a true one called false", () => {
    expect(checkSay("Yes, 2 minus 8 is 6.", rules({ wrong: [] }))).toMatchObject({ ok: false, reason: "false_equation" });
    expect(checkSay("8 minus 2 isn't 6.", rules())).toMatchObject({ ok: false, reason: "false_equation" });
  });
  it("refuses the final answer and an uncredited step value", () => {
    expect(checkSay("The answer is 24.", rules())).toMatchObject({ ok: false, reason: "reveals_answer" });
    expect(checkSay("12 minus 8 is 4.", rules())).toMatchObject({ ok: false, reason: "reveals_step" });
    expect(checkSay("You get 4 in the ones.", rules())).toMatchObject({ ok: false, reason: "reveals_step" });
  });
  it("lets a value code's own plan shows be said, but not as a result unless the plan has that equation", () => {
    const shows = rules({ shown: valuesOf("Now there are 4 tens and 12 ones."), forbidden: [numberValue(4)] });
    expect(checkSay("Now the tens have 4 left.", shows).ok).toBe(true);
    expect(checkSay("12 minus 8 is 4.", shows)).toMatchObject({ ok: false, reason: "reveals_step" });
    const show = rules({ shown: valuesOf("12 − 8 = 4."), shownEquations: equationKeysOf("12 − 8 = 4."), forbidden: [numberValue(4)] });
    expect(checkSay("Here is how: 12 minus 8 is 4.", show).ok).toBe(true);
  });
  it("refuses a number from outside the question", () => {
    expect(checkSay("Think of 37 apples.", rules())).toMatchObject({ ok: false, reason: "number_not_allowed" });
  });
  it("refuses a yes to a wrong answer", () => {
    expect(checkSay("Yes! Now the tens.", rules())).toMatchObject({ ok: false, reason: "affirms_wrong" });
    expect(checkSay("6 is right.", rules())).toMatchObject({ ok: false, reason: "affirms_wrong" });
    expect(checkSay("Yes, that's it.", rules({ wrong: [], accepting: true })).ok).toBe(true);
  });
  it("limits sentences, words and sentence length", () => {
    expect(checkSay("One. Two. Three. Four.", rules())).toMatchObject({ ok: false, reason: "too_many_sentences" });
    expect(checkSay(Array.from({ length: 31 }, () => "word").join(" ") + ".", rules({ wordLimit: 30 }))).toMatchObject({ ok: false, reason: "too_long" });
    expect(checkSentence(Array.from({ length: 21 }, () => "word").join(" ") + ".", rules({ wordLimit: 99 }))).toMatchObject({ ok: false, reason: "long_sentence" });
  });
  it("refuses never-say patterns, hype and hard words", () => {
    expect(checkSay("I can see your paper.", rules())).toMatchObject({ ok: false, reason: "never_say" });
    expect(checkSay("I promise we'll get it.", rules())).toMatchObject({ ok: false, reason: "never_say" });
    expect(checkSay("Where do you live?", rules())).toMatchObject({ ok: false, reason: "never_say" });
    expect(checkSay("I'm so happy you're here.", rules())).toMatchObject({ ok: false, reason: "never_say" });
    expect(checkSay("Awesome work!", rules())).toMatchObject({ ok: false, reason: "hype" });
    expect(checkSay("How many in all?", rules())).toMatchObject({ ok: false, reason: "hard_words" });
    expect(checkSay("That's an extraordinarily good try.", rules())).toMatchObject({ ok: false, reason: "hard_words" });
    expect(checkSay("I'm not a real person. I'm an AI helper.", rules()).ok).toBe(true);
    expect(checkSay("I can't keep secrets.", rules()).ok).toBe(true);
  });
  it("needs the asked number in a confirmation", () => {
    expect(checkSay("Did you say 6?", rules({ mustAsk: numberValue(6), wrong: [] })).ok).toBe(true);
    expect(checkSay("Can you say it again?", rules({ mustAsk: numberValue(6) }))).toMatchObject({ ok: false, reason: "missing_number" });
  });
  it("keeps spoken help off the board when the child cannot see it", () => {
    expect(checkSay("Look at the board.", rules({ noBoard: true }))).toMatchObject({ ok: false, reason: "board_words" });
  });
  it("passes a greeting with the question", () => {
    expect(checkSay("Hi there! Let's work on 52 minus 28 together. What do you see in the ones?", rules({ wrong: [] })).ok).toBe(true);
  });
});

describe("the opening and spoken signs", () => {
  it("refuses a self-introduction after the opening, unless allowed", () => {
    expect(checkSay("Hi! I'm Maya, your helper.", rules({ wrong: [], noIntro: true }))).toMatchObject({ ok: false, reason: "reintroduces" });
    expect(checkSay("We're doing 52 minus 28 today.", rules({ wrong: [], noIntro: true }))).toMatchObject({ ok: false, reason: "reintroduces" });
    expect(checkSay("I'm an AI helper, not a person.", rules({ wrong: [], noIntro: false })).ok).toBe(true);
    // Saying what Maya is to answer the child ("I'm an AI, so I have no pet") is no new introduction.
    expect(checkSay("I'm an AI, so I have no pet.", rules({ wrong: [], noIntro: true })).ok).toBe(true);
  });
  it("reads written signs and spoken signs the same way", () => {
    for (const text of ["12 − 8 = 4.", "12 minus 8 equals 4.", "12 - 8 is 4."]) expect(equationHolds(equationsOf(text)[0])).toBe(true);
    for (const text of ["3 × 4 = 12.", "3 times 4 equals 12.", "12 ÷ 3 = 4.", "12 divided by 3 is 4."]) expect(equationHolds(equationsOf(text)[0])).toBe(true);
    expect(equationHolds(equationsOf("3 times 4 equals 13.")[0])).toBe(false);
  });
  it("refuses an equation of a step the child has not done, even when its result is a printed number", () => {
    const r = rules({ wrong: [], hidden: ["4 2|-|2"], forbidden: [], allowed: [...valuesOf("52 - 28 4 2")] });
    expect(checkSay("Then 4 minus 2 is 2.", r)).toMatchObject({ ok: false, reason: "reveals_step" });
    expect(checkSay("Then 4 minus 2 is 2.", { ...r, shownEquations: ["4 2|-|2"] }).ok).toBe(true);
  });
});

describe("the close", () => {
  it("refuses a question in a reply that ends the call", () => {
    expect(checkSay("Thanks, Ava. Which part was the trickiest?", rules({ wrong: [], closing: true }))).toMatchObject({ ok: false, reason: "close_asks" });
    expect(checkSay("Thanks for your work, Ava. Bye for now.", rules({ wrong: [], closing: true })).ok).toBe(true);
  });
  it("lists the sentences when there are too many", () => {
    const v = checkSay("One. Two. Three. Four?", rules());
    expect(v.ok === false && v.detail).toContain("(4) Four?");
  });
});

describe("trimSay", () => {
  it("keeps the leading sentences that fit, and the closing question in place of a middle one", async () => {
    const { trimSay } = await import("./say-check");
    expect(trimSay("One. Two. Three. Four?", 30)).toBe("One. Four?");
    expect(trimSay("One two three four five. Six seven eight nine ten. What now?", 11)).toBe("One two three four five. What now?");
    expect(trimSay("Short one. Short two.", 30)).toBe("Short one. Short two.");
  });
});

describe("round 3: a reply answers and asks", () => {
  it("refuses praise alone on a math turn", () => {
    expect(checkSay("You worked through that step on your own, Mia.", rules({ wrong: [], needsSubstance: true }))).toMatchObject({ ok: false, reason: "empty_reply" });
    expect(checkSay("Are you saying 4 for the ones?", rules({ wrong: [], needsSubstance: true, forbidden: [], allowed: [...valuesOf("4 52 28")] })).ok).toBe(true);
  });
  it("knows a named ask from a bare one", async () => {
    const { endsWithAsk } = await import("./say-check");
    expect(endsWithAsk("Hi Mia! What can you do there?")).toBe(false);
    expect(endsWithAsk("Let's look at the ones. What can you do there?")).toBe(true);
    expect(endsWithAsk("So we take a ten.")).toBe(false);
    expect(endsWithAsk("Now try the tens.")).toBe(true);
  });
});
