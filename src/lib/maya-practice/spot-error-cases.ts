// Practice cases for spot-the-error questions (C2, design: .design/research/maya-spot-error-design.md): a multiply with a
// dropped zero, a missing number, and a place value, on the gate's adapter-made fixtures SPOT_MUL, SPOT_MISS and SPOT_PVV
// (src/lib/maya-gate/spot-error-cases.ts), which come from synthetic stored packages. The page prints the question and an
// answer given; the child ticks "Is it right?" (yes or no) and writes the fix. Maya never says the fix or the word to tick
// before the child does.
import { valuesIn } from "@/lib/maya";
import { FIXTURES, type FixtureId } from "@/lib/maya-gate/fixtures";
import { spotView } from "@/lib/maya/spot-error";
import type { OperationPackage } from "@/lib/question-package";
import type { Dimension, PracticeCase } from "./cases";

const TEACHING: Dimension[] = ["J01", "J02", "J03", "J04", "J05", "J06"];

/** The numbers of a fixture's easier example as the session teaches it: its text, steps (with the answer given) and answer. */
function exampleNumbers(id: FixtureId): number[] {
  const ex = spotView(FIXTURES[id] as OperationPackage).easierExample;
  const values = [...valuesIn(ex.text), ...valuesIn(JSON.stringify(ex.steps)), ex.answer];
  return [...new Set(values.flatMap((v) => (v.type === "number" ? [v.value] : [])))];
}

export const SPOT_PRACTICE: PracticeCase[] = [
  {
    id: "SE1",
    title: "Spot the error, multiply: thinks the answer given (one zero too few) is right, then works it and fixes it",
    fixture: "SPOT_MUL",
    persona: { name: "Theo", age: 10, question: `${FIXTURES.SPOT_MUL.text} Answer given: 448. Is it right? Fix it.`,
      knows: "You can multiply a number by one digit one place at a time when someone helps you: 7 times 40 is 280, 7 times 600 is 4200, and 280 plus 4200 is 4480. At first you only see 7 times 64 is 448 and think the answer given is right.",
      behaviour: "Start by saying the answer given is right. Follow Maya's help one step at a time. When you have the product, say whether the answer given is right and what it should be." },
    expected: "Do not accept 'right'. Work 7 × 640 with the child one step at a time, never saying 4480 first. When the child says 4480, acknowledge it once and go on to the check, without asking for the product again. Accept 'no' only once the child says it, then ask the child to tick no and write 4480 in the Fix it box. Never tick for the child or give the fix.",
    dimensions: TEACHING,
    reasons: ["solved"],
    validity: { stages: [{ name: "first try", opens: "start", numbers: [448, 7, 64] }, { name: "easier example", opens: "example", numbers: exampleNumbers("SPOT_MUL") }, { name: "after help", opens: "help", numbers: [448, 7, 0, 40, 28, 280, 600, 42, 4200, 4480, 640] }] },
    fakeScript: ["It's right.", "7 times 0 is 0.", "7 times 40 is 280.", "7 times 600 is 4200.", "280 plus 4200 is 4480.", "It's wrong, it should be 4480.", "Okay.", "I wrote it."],
  },
  {
    id: "SE2",
    title: "Spot the error, missing number: asks why to divide, then finds it and fixes the answer given",
    fixture: "SPOT_MISS",
    persona: { name: "Lena", age: 9, question: `${FIXTURES.SPOT_MISS.text} Answer given: 17. Is it right? Fix it.`,
      knows: "You know that 4 times something is 680, but you do not see how to find it. You can divide one digit at a time when someone helps: 6 divided by 4 is 1 with 2 left, 28 divided by 4 is 7, and 0 divided by 4 is 0, so 170.",
      behaviour: "Start by asking why you should divide. Follow Maya's help one step at a time. When you have the missing number, compare it with 17 and say whether the answer given is right." },
    expected: "Answer the child's question about why to divide with a short reason, then help divide 680 by 4 one step at a time, never saying 170 first. Acknowledge each step the child gives once, without repeating it as new. Accept 'no' only once the child says it, then ask the child to tick no and write 170 in the Fix it box. Never tick for the child or give the fix.",
    dimensions: TEACHING,
    reasons: ["solved"],
    validity: { stages: [{ name: "first try", opens: "start", numbers: [4, 680, 17] }, { name: "easier example", opens: "example", numbers: exampleNumbers("SPOT_MISS") }, { name: "after help", opens: "help", numbers: [6, 1, 2, 28, 7, 0, 170, 17, 680, 4] }] },
    fakeScript: ["Why do I divide?", "6 divided by 4 is 1, with 2 left.", "28 divided by 4 is 7.", "0 divided by 4 is 0.", "It's 170, so the answer given is wrong.", "Okay.", "I wrote it."],
  },
  {
    id: "SE3",
    title: "Spot the error, value of a digit: says the digit early, takes the answer given as right, then corrects it",
    fixture: "SPOT_PVV",
    persona: { name: "Omar", age: 10, question: `${FIXTURES.SPOT_PVV.text} Answer given: 4000. Is it right? Fix it.`,
      knows: "You can find the ten thousands digit of 46213: it is 4. You think its value is 4000, so the answer given looks right. When someone reminds you what one ten thousand is worth, you see the value is 40000.",
      behaviour: "Start by saying the digit is 4, before Maya asks. Then say the answer given is right. Follow her help and correct yourself." },
    expected: "Acknowledge the early digit 4 once and go on, without asking for the digit again. Do not accept 'right'. Help with what one ten thousand is worth or with 4 × 10,000, never saying 40,000 first. Accept 'no' only once the child says it with the value 40000, then ask the child to tick no and write 40000 in the Fix it box.",
    dimensions: TEACHING,
    reasons: ["solved"],
    validity: { stages: [{ name: "first try", opens: "start", numbers: [4, 4000] }, { name: "easier example", opens: "example", numbers: exampleNumbers("SPOT_PVV") }, { name: "after help", opens: "help", numbers: [4, 4000, 10000, 40000] }], firstNumbers: [4] },
    fakeScript: ["The digit is 4.", "So 4000 is right.", "Oh, it should be 40000.", "It's wrong.", "Yes.", "Okay.", "I wrote it."],
  },
];
