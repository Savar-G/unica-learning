// Practice cases for place-value questions (B1a, design: .design/research/maya-place-value-design.md, section 7.3): a
// "which digit" ask and a "value of the digit" ask, on the gate's adapter-made fixtures PVD and PVV
// (src/lib/maya-gate/place-value-cases.ts), which come from synthetic stored packages. Maya never says the answer or its
// digit before the child does.
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

export const PLACE_VALUE_PRACTICE: PracticeCase[] = [
  {
    id: "PV1",
    title: "Hesitant on a 'which digit' question: counts the places aloud and finds the thousands digit",
    fixture: "PVD",
    persona: { name: "Ava", age: 10, question: FIXTURES.PVD.text,
      knows: "You know the ones place is on the right, but you mix up which place is the thousands. You first think it is the 5 at the front. When someone helps you count the places from the right (ones, tens, hundreds, thousands), you find the 3.",
      behaviour: "Start by saying you are not sure which place is the thousands. Then guess 5. Follow Maya's help, count the places out loud, and say the digit you find." },
    expected: "Never say the thousands digit (3) before the child does, in words or on the board. Help the child count the places from the right, answer their question about which place is the thousands, check the guess 5 without saying the answer, and accept 3 only when the child says it.",
    dimensions: TEACHING,
    reasons: ["solved"],
    validity: { stages: [{ name: "first try", opens: "start", numbers: [5] }, { name: "easier example", opens: "example", numbers: exampleNumbers("PVD") }, { name: "after help", opens: "help", numbers: [5, 3] }] },
    fakeScript: ["I'm not sure which one is the thousands place.", "Is it 5?", "Ones, tens, hundreds, thousands. It's 3.", "Okay.", "I wrote it."],
  },
  {
    id: "PV2",
    title: "One zero too few on a 'value of the digit' question: says 8000 for the ten thousands digit",
    fixture: "PVV",
    persona: { name: "Kai", age: 10, question: FIXTURES.PVV.text,
      knows: "You can find the ten thousands digit: it is 8. You think its value is 8000, because you put one zero too few. When someone reminds you what one ten thousand is worth, you see it is 80000.",
      behaviour: "Start by saying the digit is 8, before Maya asks. When she asks for the value, say 8000. Follow her help and correct yourself." },
    expected: "Acknowledge the early digit 8 once and go on to the value, without asking for the digit again. Do not accept 8000. Help with what each ten thousand is worth or with 8 × 10,000, never saying 80,000 first, and accept 80000 only when the child says it.",
    dimensions: TEACHING,
    reasons: ["solved"],
    validity: { stages: [{ name: "first try", opens: "start", numbers: [8, 8000] }, { name: "easier example", opens: "example", numbers: exampleNumbers("PVV") }, { name: "after help", opens: "help", numbers: [8, 8000, 10000, 80000] }], firstNumbers: [8] },
    fakeScript: ["The digit is 8.", "8000.", "Oh, 80000.", "Okay.", "I wrote it."],
  },
];
