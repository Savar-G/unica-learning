// Practice cases for missing numbers (Wave A, A3): a missing factor by division after dropping a zero, a 3-digit
// missing factor by trying numbers, and a missing number taken away. Personas and validity as in cases.ts.
import { valuesIn } from "@/lib/maya";
import { FIXTURES, type FixtureId } from "@/lib/maya-gate/fixtures";
import type { Dimension, PracticeCase, Stage } from "./cases";

const TEACHING: Dimension[] = ["J01", "J02", "J03", "J04", "J05", "J06"];

/** The numbers of a fixture's easier example: its text, steps and answer. */
function exampleNumbers(id: FixtureId): number[] {
  const ex = FIXTURES[id].easierExample;
  if (!ex) return [];
  const values = [...valuesIn(ex.text), ...valuesIn(JSON.stringify(ex.steps)), ex.answer];
  return [...new Set(values.flatMap((v) => (v.type === "number" ? [v.value] : [])))];
}

const example = (id: FixtureId): Stage => ({ name: "easier example", opens: "example", numbers: exampleNumbers(id) });

export const MISSING_NUMBER_CASES: PracticeCase[] = [
  {
    id: "MN1",
    title: "Cannot find a missing factor",
    fixture: "M_DIVIDE",
    persona: { name: "Maddie", age: 10, question: "30 × ? = 1620", knows: "You know your times tables and how to divide a number by one digit. You do not know how to find a missing number in a multiplication until someone shows you.", behaviour: "Start by saying you don't know how to find the missing number. Follow Maya's help one step at a time. After you have seen an example, try your own question." },
    expected: "Frame the missing factor as a division (1620 ÷ 30), take a zero off both numbers (162 ÷ 3), and let the child divide. Show the easier example first. Do not reveal 54 before the child says it.",
    dimensions: TEACHING,
    reasons: ["solved"],
    validity: {
      stages: [{ name: "first try", opens: "start", numbers: [] }, example("M_DIVIDE"), { name: "after help", opens: "help", numbers: [1620, 30, 162, 16, 15, 12, 54] }],
      mustSay: [{ pattern: /(don'?t|do not) know|not sure|can'?t/i, within: 2, what: "says they cannot find it" }],
    },
    fakeScript: ["I don't know how to find the missing number.", "okay", "I got 54.", "Because 3 times 54 is 162.", "I wrote it."],
  },
  {
    id: "MN2",
    title: "Tries 7 for a 3-digit missing factor",
    fixture: "M_TRY",
    persona: { name: "Theo", age: 10, question: "236 × ? = 1416", knows: "You can multiply a 3-digit number by one digit. You think the missing number is 7. You do not know it is 6 until you check your tries.", behaviour: "Start by saying you think it is 7. When Maya tells you how your try compares, try another number and say what you get." },
    expected: "Do not use long division by 236. Multiply out each try with code's numbers (236 × 7 = 1652 is too big), let the child try again, and accept 6. Offer rounding to estimate when the child is stuck.",
    dimensions: TEACHING,
    reasons: ["solved"],
    validity: {
      stages: [{ name: "first try", opens: "start", numbers: [7, 1652] }, example("M_TRY"), { name: "after help", opens: "help", numbers: [1180, 200, 6] }],
      firstNumbers: [7],
    },
    fakeScript: ["I think it's 7.", "5.", "6.", "Because 236 times 6 is 1416.", "I wrote it."],
  },
  {
    id: "MN3",
    title: "Adds for a missing number taken away",
    fixture: "M_SUBTRACT",
    persona: { name: "Ivy", age: 10, question: "9000 − ? = 3000", knows: "You think you add the two numbers: 9000 + 3000 = 12000. You know how to subtract thousands once you see that you need to.", behaviour: "Start by saying your answer is 12000. Answer Maya's questions honestly, then follow her steps." },
    expected: "Do not accept 12000. Frame the missing number as 9000 − 3000 and let the child subtract. Accept 6000.",
    dimensions: TEACHING,
    reasons: ["solved"],
    validity: {
      stages: [{ name: "first try", opens: "start", numbers: [12000] }, example("M_SUBTRACT"), { name: "after help", opens: "help", numbers: [6000] }],
      firstNumbers: [12000],
    },
    fakeScript: ["I got 12000.", "I added them.", "I got 6000.", "Because 6000 and 3000 make 9000.", "I wrote it."],
  },
];
