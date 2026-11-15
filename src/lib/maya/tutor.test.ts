import { describe, expect, it } from "vitest";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import type { OperationPackage } from "@/lib/question-package";
import { checkTutorSay, plainTeaching, childFacts, isTutorQuestion, numberMeaning, stepFacts, tutorDrawings, tutorFallbackText } from "./tutor";

// The tutor core's pure parts (D-345): which questions it teaches, the facts in its brief, the whole-message check,
// code's honest line and the board drawings.

const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const ADD = SAMPLE_PACKAGES["add-27-39"] as OperationPackage;

describe("isTutorQuestion", () => {
  it("teaches 2-digit addition and subtraction", () => {
    expect(isTutorQuestion(SUB)).toBe(true);
    expect(isTutorQuestion(ADD)).toBe(true);
  });
  it("leaves every other question to the controller", () => {
    expect(isTutorQuestion(null)).toBe(false);
    const big = Object.values(SAMPLE_PACKAGES).find((p) => {
      const op = (p as OperationPackage).operation;
      return (op.kind === "add" || op.kind === "subtract") && (op.operands as number[]).some((n) => n > 99);
    }) as OperationPackage | undefined;
    if (big) expect(isTutorQuestion(big)).toBe(false);
    const other = Object.values(SAMPLE_PACKAGES).find((p) => !["add", "subtract"].includes((p as OperationPackage).operation.kind)) as OperationPackage | undefined;
    if (other) expect(isTutorQuestion(other)).toBe(false);
  });
});

describe("the brief's facts", () => {
  it("gives each step of 52 - 28 with the trade and its reason", () => {
    const [ones, tens] = stepFacts(SUB);
    expect(ones).toMatchObject({ id: "ones", result: 4 });
    expect(ones.work).toContain("2 ones is too small to take 8: trade 1 ten for 10 ones, so 2 ones become 12");
    expect(ones.work).toContain("12 − 8 = 4");
    expect(tens.work).toContain("5 tens are now 4");
    expect(tens.work).toContain("4 − 2 = 2");
  });
  it("names what each number the child says means, with the likely mistake", () => {
    expect(numberMeaning(SUB, 24)).toBe("the right answer to the whole question");
    expect(numberMeaning(SUB, 12)).toContain("the ones after the trade");
    expect(numberMeaning(SUB, 6)).toContain("the small digit taken from the big one in the ones (8 − 2)");
    expect(numberMeaning(SUB, 36)).toContain("smaller digit taken from the bigger one in each column");
    expect(numberMeaning(SUB, 34)).toContain("did not take the ten away from the tens");
    expect(numberMeaning(SUB, 52)).toBe("a number of the question");
    expect(numberMeaning(SUB, 77)).toBe("not a value of this question");
    expect(numberMeaning(ADD, 56)).toContain("forgot the carried 1");
  });
  it("judges the child's equations", () => {
    expect(childFacts(SUB, "Is 2 minus 8, 6?").join(" ")).toContain("The child said 6:");
    expect(childFacts(SUB, "12 minus 8 is 5")).toContain("The child said 12 − 8 = 5: that is false.");
    expect(childFacts(SUB, "12 minus 8 is 4")).toContain("The child said 12 − 8 = 4: that is true.");
  });
});

describe("checkTutorSay: the whole-message check", () => {
  const none = { stance: "none" as const };
  it("passes Savar's target explanation, with the trade and the borrow word", () => {
    const v = checkTutorSay("Good question. You're right that 2 is too small to take 8 away. So we borrow: trade 1 ten from the 5 tens for 10 ones. Now how many ones do you have, 2 plus 10?", none);
    expect(v.ok).toBe(true);
  });
  it("lets Maya tell a step and the answer when the math is true (the answer rule is lifted)", () => {
    expect(checkTutorSay("12 minus 8 is 4, and 4 tens minus 2 tens is 2 tens. So 52 minus 28 is 24. How did we get the 4 tens?", none)).toMatchObject({ ok: true });
  });
  it("refuses a false equation, a true one called false, and a false place-value claim", () => {
    expect(checkTutorSay("12 minus 8 is 5. Try the tens.", none)).toMatchObject({ ok: false, reason: "false_equation" });
    expect(checkTutorSay("12 minus 8 isn't 4.", none)).toMatchObject({ ok: false, reason: "false_equation" });
    expect(checkTutorSay("52 is 4 tens and 2 ones.", none)).toMatchObject({ ok: false, reason: "false_equation" });
    expect(checkTutorSay("52 is 4 tens and 12 ones. Same number, new name.", none)).toMatchObject({ ok: true });
    expect(checkTutorSay("So 2 ones become 12 ones.", none)).toMatchObject({ ok: true });
    expect(checkTutorSay("So 2 ones become 11 ones.", none)).toMatchObject({ ok: false, reason: "false_equation" });
    expect(checkTutorSay("The 5 tens become 4 tens.", none)).toMatchObject({ ok: true });
    // Real run, 2026-11-14: a true regroup said with "is now" was refused before.
    expect(checkTutorSay("So we borrow: we trade 1 ten for 10 ones, and 52 is now 4 tens and 12 ones.", none)).toMatchObject({ ok: true });
    expect(checkTutorSay("52 is now 4 tens and 2 ones.", none)).toMatchObject({ ok: false, reason: "false_equation" });
    expect(checkTutorSay("The 5 tens are now 4 tens.", none)).toMatchObject({ ok: true });
    expect(checkTutorSay("The 2 ones are now 12 ones.", none)).toMatchObject({ ok: true });
    expect(checkTutorSay("The 2 ones are now 13 ones.", none)).toMatchObject({ ok: false, reason: "false_equation" });
  });
  it("has one hard ceiling and never trims", () => {
    const long = Array.from({ length: 61 }, () => "ones").join(" ") + ".";
    expect(checkTutorSay(long, none)).toMatchObject({ ok: false, reason: "too_long" });
    expect(checkTutorSay("", none)).toMatchObject({ ok: false, reason: "empty" });
  });
  it("refuses never-say patterns", () => {
    expect(checkTutorSay("I can see your paper. What is 12 minus 8?", none)).toMatchObject({ ok: false, reason: "never_say" });
    expect(checkTutorSay("This is our secret. What is 12 minus 8?", none)).toMatchObject({ ok: false, reason: "never_say" });
  });
  it("never says yes to a wrong answer, or not quite to a right one", () => {
    expect(checkTutorSay("Yes! Now the tens.", { stance: "wrong" })).toMatchObject({ ok: false, reason: "affirms_wrong" });
    expect(checkTutorSay("Not quite. Check the ones.", { stance: "right" })).toMatchObject({ ok: false, reason: "wrong_stance" });
    expect(checkTutorSay("Not quite. 6 is 8 minus 2, the other way around. Where could we get more ones?", { stance: "wrong" })).toMatchObject({ ok: true });
  });
  it("sends a plain math message without the talk review, and any other words to it", () => {
    expect(checkTutorSay("What is 12 minus 8?", none)).toEqual({ ok: true, needsReview: false, review: [] });
    // Sixth check of #1006: a lead-in that can answer the child ("Good question", "Yes") is reviewed.
    expect(checkTutorSay("Good question. What is 12 minus 8?", none)).toEqual({ ok: true, needsReview: true, review: ["Good question."] });
    expect(checkTutorSay("You did well. What is 12 minus 8?", none)).toEqual({ ok: true, needsReview: true, review: ["You did well."] });
    expect(checkTutorSay("I'm an AI, so I don't have a dog. What is 12 minus 8?", none)).toMatchObject({ review: [] });
    expect(checkTutorSay("Dogs are fun. What is 12 minus 8?", none)).toMatchObject({ review: ["Dogs are fun."] });
    expect(checkTutorSay("I'm an AI, so I don't have a dog. What is 12 minus 8?", none)).toMatchObject({ review: [] });
    for (const x of ["I'm an AI, so I don't have a favorite animal.", "I'm an AI, so I don't have a favorite secret friend at home.", "I'm an AI, so I don't have a favorite sex toy."]) {
      expect(checkTutorSay(`${x} What is 12 minus 8?`, none)).toMatchObject({ review: [x] });
    }
  });
});

describe("code's honest line", () => {
  it("asks the next open step's own question, and passes the check", () => {
    const text = tutorFallbackText(SUB, [], false);
    expect(text).toBe("Let me say that another way. What do you get for 12 minus 8?");
    expect(checkTutorSay(text, { stance: "none" }).ok).toBe(true);
    expect(tutorFallbackText(SUB, ["ones"], false)).toBe("Let me say that another way. What do you get for 4 minus 2?");
    expect(tutorFallbackText(SUB, ["ones", "tens"], false)).toBe("Let me say that another way. So what is 52 minus 28?");
    expect(tutorFallbackText(SUB, [], true)).toBe("Let me say that another way. How did you get your answer?");
  });
});

describe("tutorDrawings", () => {
  const id = (i: number) => `note-${i}`;
  it("draws the trade as a borrow on the question, once", () => {
    const first = tutorDrawings(SUB, [{ offer: "trade", place: "" }], [], id);
    expect(first.commands).toEqual([{ op: "regroup", id: "tutor-trade-ones", objectId: "question", rowId: "top", kind: "borrow", from: "tens", to: "ones" }]);
    expect(tutorDrawings(SUB, [{ offer: "trade", place: "" }], first.keys, id).commands).toEqual([]);
  });
  it("writes an answer digit after the trade it needs", () => {
    const d = tutorDrawings(SUB, [{ offer: "digit", place: "ones" }], [], id);
    expect(d.commands.map((c) => c.op)).toEqual(["regroup", "put"]);
    expect(d.commands[1]).toMatchObject({ value: "4" });
  });
  it("writes only a true equation as a note", () => {
    expect(tutorDrawings(SUB, [{ offer: "note", place: "12 − 8 = 4" }], [], id).commands).toEqual([{ op: "write", id: "note-0", text: "12 − 8 = 4", place: { below: "question" } }]);
    expect(tutorDrawings(SUB, [{ offer: "note", place: "12 − 8 = 5" }], [], id).commands).toEqual([]);
  });
  it("carries in an addition after its ones digit", () => {
    const d = tutorDrawings(ADD, [{ offer: "trade", place: "" }], [], id);
    expect(d.commands.map((c) => c.op)).toEqual(["put", "regroup"]);
    expect(d.commands[1]).toMatchObject({ kind: "carry", rowId: "answer", from: "ones", to: "tens" });
  });
});

describe("falseClaims: real sentences of 2026-11-14", () => {
  const none = { stance: "none" as const };
  it.each([
    "Count up from 8 to 12: 9, 10, 11, 12 is 4 steps, and you said 4 a minute ago.",
    "8 and 4 more make 12.",
    "6 is 8 minus 2, the other way around.",
    "4 tens minus 2 tens is 2 tens.",
    "This one is tricky, but 12 minus 8 is 4.",
    "One ten is ten ones.",
    "2 minus 8 isn't 6.",
    "12 minus 8 is 4 so we write 4.",
    "The 1 is the ten we carried, so that is 6 tens.",
    "Your tens step was right: 1 + 2 + 3 = 6 tens, which is 60.",
    "12 minus the 8 is 4.",
    "The 2 ones are now 12 ones.",
  ])("passes the true sentence %s", (x) => expect(checkTutorSay(x, none)).toMatchObject({ ok: true }));
  it.each(["12 is 4.", "12 − 8 = 4 apples = 5.", "1 ten is 100 ones.", "12 minus 8 is 5 so we write 5.", "4 is 4 tens.", "1 + 2 + 3 = 7 tens.", "The 1 is 10.", "5 tens are now 6 tens."])("refuses %s", (x) => expect(checkTutorSay(x, none)).toMatchObject({ ok: false }));
});

describe("falseClaims: trades and quantities, both directions (third check of #1002)", () => {
  const sub = { stance: "none" as const, op: "subtract" as const };
  const add = { stance: "none" as const, op: "add" as const };
  it.each([
    ["So we borrow: we trade 1 ten for 10 ones, and 52 becomes 4 tens and 12 ones.", sub],
    ["2 ones become 12.", sub], ["The 2 becomes 12.", sub], ["The 5 becomes 4.", sub], ["5 tens become 4 tens.", sub],
    ["52 is 5 tens 2 ones.", sub], ["Twelve minus eight is four.", sub], ["12 ones take away 8 ones is 4 ones.", sub],
    ["We carry one ten, so one ten is now two tens.", add], ["The 16 ones are now 6 ones and 1 ten.", add],
    ["In 27 + 39, 7 + 9 = 16 is 1 ten and 6 ones.", add], ["12 is 4 bigger than 8.", sub],
  ])("passes %s", (x, ctx) => expect(checkTutorSay(x, ctx)).toMatchObject({ ok: true }));
  it.each([
    ["52 becomes 4 tens and 2 ones.", sub], ["2 ones become 13.", sub], ["5 tens become 6 tens.", sub], ["The 2 becomes 13.", sub],
    ["12 ones take away 8 ones is 5 ones.", sub], ["52 is 5 tens 3 ones.", sub], ["Twelve minus eight is five.", sub],
    ["4 is 4 tens left.", sub], ["5 tens are now 6 tens left.", sub], ["52 is the 4 tens and 2 ones.", sub], ["4 tens is the 5 tens.", sub],
    ["One ten is now three tens.", add],
  ])("refuses %s", (x, ctx) => expect(checkTutorSay(x, ctx)).toMatchObject({ ok: false }));
});

describe("plainTeaching (re-check of #1006)", () => {
  it.each(["12 minus 8 is 4.", "Now the tens: what is 4 minus 2?", "So, 12 minus 8 is 4.", "{name}, what is 12 minus 8?", "I'm an AI helper."])("sends %s with no review", (x) => expect(plainTeaching(x)).toBe(true));
  // Sixth check of #1006: words that agree with or deny what the child said are reviewed, and so is an approved sentence
  // whose meaning depends on the child's turn.
  it.each(["Yes.", "No.", "Yes, 12 minus 8 is 4.", "Not quite: 6 is 8 minus 2, the other way around.", "No, 6 is not right.", "Okay.", "Right.", "That sounds fun.", "That sounds nice.", "Thanks for telling me.", "{name}."])("reviews %s", (x) => expect(plainTeaching(x)).toBe(false));
  // The closed forms of the fourth check of #1006: a teaching sentence in other words is reviewed (in parallel).
  it.each(["Sure, {name}.", "Good question: in the ones, 2 ones is too small to take 8 away."])("reviews %s", (x) => expect(plainTeaching(x)).toBe(false));
  it.each(["No good at math, {name}, not even 2 plus 2.", "Not good at this at all, not even 2 plus 2.", "We are not good at math, not even 2 plus 2.", "You are no good at math, not even 2 plus 2.", "2 is too hard for you.", "Sure, you can't do this.", "That's a fun question.", "I'm proud of you."])("reviews %s", (x) => expect(plainTeaching(x)).toBe(false));
});
