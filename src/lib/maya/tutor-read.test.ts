import { describe, expect, it } from "vitest";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { teachingPackage } from "@/lib/maya-teaching";
import { storedPlaceValue } from "@/lib/maya-teaching/place-value-samples";
import type { OperationPackage } from "@/lib/question-package";
import { checkTutorSay, tutorKind, tutorReadFacts } from "./tutor";

// More true math read by code alone (two-layer true math, coverage round of 2026-11-15): for each new shape, true
// sentences now pass with no math-truth review, and their false neighbours (a wrong number, place or carry, a modifier
// word) are refused or still go to the review. The true sentences are from the real corpus of 2026-11-14.

const P = {
  sub: SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage,
  add: SAMPLE_PACKAGES["add-27-39"] as OperationPackage,
  pv: teachingPackage(storedPlaceValue({ variant: "1.2", n0: 48942, place: "ten thousands" })) as OperationPackage,
};
type Q = keyof typeof P;
const contextOf = (pkg: OperationPackage) => {
  const kind = tutorKind(pkg);
  const op = kind.op?.(pkg);
  return { stance: "none" as const, claims: (x: string) => kind.claimProblems(pkg, x), facts: tutorReadFacts(pkg), trades: kind.workValues(pkg), ...(op ? { op } : {}), ...(pkg.answer.value.type === "number" ? { answer: pkg.answer.value.value } : {}) };
};
const layer = (q: Q, line: string) => {
  const v = checkTutorSay(line, contextOf(P[q]));
  return !v.ok ? "refused" : v.math.length ? "review" : "code";
};

const SHAPES: { shape: string; yes: [Q, string][]; no: [Q, string][] }[] = [
  {
    shape: "an instruction with a number, checked against the step texts",
    yes: [["sub", "I'll write 4 in the ones place."], ["sub", "So we write 2 in the tens place."], ["add", "We write 6 in the ones and carry the 1 ten."], ["add", "You carried the ten."], ["sub", "And the 4 is already in the ones place."], ["sub", "We wrote 2 in the tens and 4 in the ones."]],
    no: [["sub", "Write 5 in the ones."], ["sub", "Write 4 in the tens."], ["add", "Carry the 2."], ["add", "Carry 1 to the hundreds."], ["add", "We write 6 in the ones and carry the 2 tens."], ["sub", "4 is already in the tens place."], ["add", "Write 6 above the tens."], ["sub", "In the tens, write 4."], ["sub", "In the ones, write 2."], ["sub", "Don't write 4 in the ones."], ["sub", "Write about 4 in the ones."]],
  },
  {
    shape: "you can't take a bigger number from a smaller one",
    yes: [["sub", "You can't take 8 from 2 ones."], ["sub", "Good question: in the ones, 2 is too small to take 8 from."], ["sub", "We can't do 2 minus 8, so we use the 12 ones from the trade."]],
    no: [["sub", "You can't take 2 from 8."], ["sub", "8 is too small to take 2."], ["sub", "We can't do 8 minus 2."], ["sub", "You can't take 8 from 2, I think."]],
  },
  {
    shape: "N is right, and not N",
    yes: [["add", "Yes, 66 is right!"], ["add", "Yes, 16 is right for 7 + 9!"], ["add", "Not 56, {name}."], ["sub", "36 isn't right, {name}."], ["sub", "Yes, 4 is right: 12 minus 8 is 4."], ["sub", "Careful, {name}: 12 minus 8 is 4, not 5."]],
    no: [["add", "60 is right."], ["add", "Yes, 6 is right!"], ["add", "16 is right for 7 + 8."], ["add", "Not 66."], ["add", "Not 6."], ["sub", "24 isn't right."], ["sub", "Yes, 5 is right: 13 minus 8 is 5."], ["sub", "Careful: 12 minus 8 is 4, not 4."], ["sub", "12 minus 8 is 4, not 5 percent."], ["add", "66 is right, more or less."]],
  },
  {
    shape: "a counting list after a counting instruction",
    yes: [["add", "Start at 9 and count up 7 more: 10, 11, 12, 13, 14, 15, 16."], ["sub", "Count up from 8 to 12 to check: 9, 10, 11, 12."]],
    no: [["add", "Start at 9 and count up 7 more: 10, 11, 13."], ["add", "Count up 8 from 7: 8, 9, 10."], ["add", "Start at 9 and count up 7 more: 10, 11, 12, 13, 14, 15, 16, 17."], ["sub", "Count back 8 from 12: 13, 14."]],
  },
  {
    shape: "the question's own operations, named or asked",
    yes: [["sub", "Back to 52 minus 28: what is 12 minus 8?"], ["add", "In 27 + 39, 7 + 9 = 16 is 1 ten and 6 ones."], ["sub", "How much is 4 tens minus 2 tens?"], ["sub", "What is the whole answer to 52 − 28?"], ["add", "How did you get 66?"], ["sub", "How many tens are left now?"], ["add", "Want to try a twin question: 38 + 27?"]],
    no: [["sub", "In 52 − 29, 12 minus 8 is 4."], ["sub", "Now try 12 − 9."], ["add", "Now add the ones: 1 + 2 + 3."], ["sub", "In the tens, 2 minus 8."], ["add", "Want to try a twin question: 38 + 27, which is 64?"], ["sub", "Good question: in 52 − 29, the ones are 2 and 8."]],
  },
  {
    shape: "the column's work, read by the column kind",
    yes: [["sub", "We have 4 tens and take away 2 tens."], ["sub", "Now take 8 from those 12 ones: what is 12 − 8?"], ["sub", "You can't take 8 from 2, so we use the 12 ones we got from borrowing."], ["sub", "We traded 1 ten away, so 5 tens became 4 tens."], ["sub", "Good question: in 52 − 28, the ones are 2 minus 8, and 2 ones is too small to take 8."], ["sub", "Now the ones are 12."], ["sub", "The number 52 stays the same."], ["sub", "We can't take 8 from 2 ones, which is why we traded."], ["sub", "Now the tens: 4 tens minus 2 tens."], ["sub", "Put the 2 tens next to the 4 ones."]],
    no: [["sub", "We have 5 tens and take away 2 tens."], ["sub", "We have 4 tens and take away 8 tens."], ["sub", "We use the 14 ones from the trade."], ["sub", "We traded 1 hundred away."], ["sub", "The ones are 8 minus 2."], ["sub", "Now the ones are 14."], ["sub", "The tens are now 5."], ["sub", "The number is still 28."], ["sub", "Take away the 2 tens from 52."], ["sub", "We have 3 tens left after the trade."], ["sub", "The ones are 4 and the tens are 3."], ["sub", "Put the 4 tens next to the 2 ones."], ["sub", "4 tens minus 8 tens."], ["sub", "We traded 1 ten away to get 13 ones."], ["add", "Which is why we traded."], ["sub", "We have 4 tens left after the trade, maybe."], ["sub", "The number is still 52 percent."]],
  },
  {
    shape: "a model of the question's own subtraction, and a digit of a number",
    yes: [["sub", "Picture 4 blocks and take 2 away."], ["sub", "Hold up 4 fingers and put 2 down: how many are left?"], ["sub", "The 5 is the tens digit of 52."]],
    no: [["sub", "Picture 4 blocks and take 3 away."], ["sub", "Hold up 5 fingers and put 2 down."], ["sub", "5 is the tens digit of 25."], ["sub", "2 is the tens digit of 52."]],
  },
  {
    shape: "a place claim the place-value kind reads whole",
    yes: [["pv", "The digit in the ten thousands place is 4."], ["pv", "So the 4 is worth 40,000."]],
    no: [["pv", "The digit in the thousands place is 9."], ["pv", "The digit in the thousands place is 8 percent."], ["pv", "The digit in the thousands place is 8, roughly."], ["pv", "In 5226, the digit in the thousands place is 8."], ["pv", "The 4 is worth 400."]],
  },
  {
    shape: "modifier words next to a read claim",
    yes: [["sub", "Yes, we write 4 in the ones."], ["sub", "After the trade, 5 tens became 4 tens."]],
    no: [["sub", "We write 4 in the ones, roughly."], ["sub", "We write 4 in the ones, or so."], ["sub", "Maybe, we write 4 in the ones."], ["sub", "No, 12 minus 8 is 4 percent."], ["sub", "After the trade, 12 minus 8 is 4 squared."], ["sub", "It is false that we write 4 in the ones."], ["sub", "We never write 4 in the ones."], ["sub", "You said 12 minus 8 is 4 percent."]],
  },
];

describe("more true math read by code alone", () => {
  for (const { shape, yes, no } of SHAPES) {
    describe(shape, () => {
      it("passes each true sentence on code alone", () => {
        expect(yes.filter(([q, line]) => layer(q, line) !== "code").map(([, line]) => line)).toEqual([]);
      });
      it("never passes a false neighbour on code alone", () => {
        expect(no.filter(([q, line]) => layer(q, line) === "code").map(([, line]) => line)).toEqual([]);
      });
    });
  }
  it("reads nothing more with no facts (the claim reader alone)", () => {
    const v = checkTutorSay("I'll write 4 in the ones place.", { stance: "none", op: "subtract", answer: 24 });
    expect(v).toMatchObject({ ok: true });
    expect(v.ok && v.math.length).toBe(1);
  });
});
