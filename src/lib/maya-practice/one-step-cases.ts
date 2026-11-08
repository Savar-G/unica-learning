// Practice cases for one-step workbook questions Maya teaches through her session adapter (Wave A): a 5-digit
// subtraction story and a 3-digit × 1-digit "Each … has" story, on the gate's adapter-made fixtures W5 and W3
// (src/lib/maya-gate/one-step-cases.ts), which come from synthetic stored packages.
import { valuesIn } from "@/lib/maya";
import { FIXTURES, type FixtureId } from "@/lib/maya-gate/fixtures";
import type { Dimension, PracticeCase } from "./cases";

const TEACHING: Dimension[] = ["J01", "J02", "J03", "J04", "J05", "J06"];

/** The numbers of a fixture's easier example: its text, steps and answer. */
function exampleNumbers(id: FixtureId): number[] {
  const ex = FIXTURES[id].easierExample;
  if (!ex) return [];
  const values = [...valuesIn(ex.text), ...valuesIn(JSON.stringify(ex.steps)), ex.answer];
  return [...new Set(values.flatMap((v) => (v.type === "number" ? [v.value] : [])))];
}

/** 10000 − 3615 by columns: each regrouped zero (10, 9, 90, 99, 999, 1000, 100), each column's difference, and 6385. */
const W5_WORK = [10, 9, 90, 99, 999, 1000, 100, 5, 8, 3, 6, 6385] as const;
/** 284 × 7 by columns: each product, each carry and each total (28, 56, 58, 14, 19), the parts 280, 1400, 2000, and 1988. */
const W3_WORK = [28, 56, 58, 14, 19, 280, 1400, 2000, 4, 8, 2, 1988] as const;

export const ONE_STEP_PRACTICE: PracticeCase[] = [
  {
    id: "W5",
    title: "Stuck on the zeros of a 5-digit subtraction story",
    fixture: "W5",
    persona: { name: "Leo", age: 10, question: FIXTURES.W5.text,
      knows: "You know this is a take-away: 10000 take away 3615. You can regroup from the next column, but you do not know what to do when the next column is 0 too. Once someone shows you how to regroup across the zeros, you can subtract column by column.",
      behaviour: "Start by saying it is a take-away but you get stuck because of all the zeros. Follow Maya's help one column at a time, starting with the ones." },
    expected: "Do not give the answer. Help the child regroup across the zeros of 10000 column by column (ones, tens, hundreds, thousands), say each place by its name, check each column, and accept 6385 only when the child says it. The place names go up to the ten thousands.",
    dimensions: TEACHING,
    reasons: ["solved"],
    validity: { stages: [{ name: "first try", opens: "start", numbers: [] }, { name: "easier example", opens: "example", numbers: exampleNumbers("W5") }, { name: "after help", opens: "help", numbers: [...W5_WORK] }],
      mustSay: [{ pattern: /zero|0s\b/i, within: 2, what: "says the zeros are the problem" }] },
    fakeScript: ["It's a take-away, but I get stuck on all the zeros.", "10 take away 5 is 5.", "9 take away 1 is 8.", "9 take away 6 is 3.", "9 take away 3 is 6, so 6385.", "Okay.", "I wrote it."],
  },
  {
    id: "W3",
    title: "Drops the carries in a 3-digit × 1-digit 'Each … has' story",
    fixture: "W3",
    persona: { name: "Nora", age: 10, question: FIXTURES.W3.text,
      knows: "You know this is 284 times 7. You multiply each digit by 7 but you forget to add the carries: 4 × 7 = 28, you write 8; 8 × 7 = 56, you write 6; 2 × 7 = 14, so you get 1468. You only add the carries when Maya helps you check.",
      behaviour: "Start by saying your answer is 1468. Answer Maya's questions about your work honestly from what you know, then follow her steps." },
    expected: "Do not accept 1468. Check the child's work digit by digit, find the carries that were dropped (the 2 tens from 28 and the 5 hundreds from 56), and accept 1988 only when the child says it.",
    dimensions: TEACHING,
    reasons: ["solved"],
    validity: { stages: [{ name: "first try", opens: "start", numbers: [1468, 28, 56, 14, 6] }, { name: "easier example", opens: "example", numbers: exampleNumbers("W3") }, { name: "after help", opens: "help", numbers: [...W3_WORK] }], firstNumbers: [1468] },
    fakeScript: ["I got 1468.", "4 times 7 is 28.", "8 times 7 plus 2 is 58.", "2 times 7 plus 5 is 19, so 1988.", "Okay.", "I wrote it."],
  },
];
