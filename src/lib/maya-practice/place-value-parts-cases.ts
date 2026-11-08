// Practice cases for B1b's place-value asks (design: .design/research/maya-place-value-design.md, section 7.3): a
// compare, a sum of two values and a tenths build, on the gate's adapter-made fixtures PVC, PVSUM and PVB
// (src/lib/maya-gate/place-value-parts-cases.ts), which come from synthetic stored packages. Maya never says the word,
// the sum or the decimal before the child does.
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

export const PLACE_PARTS_PRACTICE: PracticeCase[] = [
  {
    id: "PV4",
    title: "Compare, read the wrong way round: says 'false' because they think the bigger digit must be on the right",
    fixture: "PVC",
    persona: { name: "Leo", age: 10, question: FIXTURES.PVC.text,
      knows: "You can find the thousands digit (8) and the hundreds digit (4). You think the statement is about the digit on the right being bigger, so you first say false. When someone asks you which digit is bigger and what the statement says, you see it is true.",
      behaviour: "Find the two digits when Maya asks. Then say 'I think it's false.' Follow Maya's help, compare 8 and 4, and say which word you circle." },
    expected: "Never say true or false as the answer before the child does. Help the child find each digit by counting places, without pointing at a column and asking for its digit. Do not accept 'false'. Help the child compare 8 and 4 and read the statement again, then accept 'true' only when the child commits to it; a bare 'true' is said back first.",
    dimensions: TEACHING,
    reasons: ["solved"],
    validity: { stages: [{ name: "first try", opens: "start", numbers: [8, 4] }, { name: "easier example", opens: "example", numbers: exampleNumbers("PVC") }, { name: "after help", opens: "help", numbers: [8, 4] }] },
    fakeScript: ["The thousands digit is 8.", "4", "I think it's false.", "8 is bigger.", "It's true.", "Okay.", "I circled it."],
  },
  {
    id: "PV5",
    title: "Tenths written as hundredths: says 5.08 for 5 wholes and 8 tenths, then fixes it",
    fixture: "PVB",
    persona: { name: "Mia", age: 9, question: FIXTURES.PVB.text,
      knows: "You know the wholes go before the point. You think tenths need a 0 after the point, so you say 5.08. When someone reminds you that the first place after the point is the tenths place, you say 5.8.",
      behaviour: "Say 5.08 first. Follow Maya's help and correct yourself." },
    expected: "Never say 5.8 first, and never read its digits out in a row. Do not accept 5.08. Help with where the tenths go (the first place after the point), and accept 5.8 only when the child says it.",
    dimensions: TEACHING,
    reasons: ["solved"],
    validity: { stages: [{ name: "first try", opens: "start", numbers: [5, 8, 5.08] }, { name: "easier example", opens: "example", numbers: exampleNumbers("PVB") }, { name: "after help", opens: "help", numbers: [5, 8, 5.08, 5.8] }] },
    fakeScript: ["5.08", "Oh, five point eight.", "Okay.", "I wrote it."],
  },
  {
    id: "PV6",
    title: "Sum of two values: adds the two digits (11), then finds each value and adds them",
    fixture: "PVSUM",
    persona: { name: "Noor", age: 10, question: FIXTURES.PVSUM.text,
      knows: "You see the 7 in the thousands place and the 4 in the tens place, and you first add the digits: 11. When someone reminds you that the question asks for their values, you find 7000 and 40 and add them.",
      behaviour: "Say 11 first. Then follow Maya's help one value at a time and add the two values." },
    expected: "Never say 7040 first. Do not accept 11: say it adds the digits, not their values. Help find each value (7 × 1,000 and 4 × 10) and accept 7040 only when the child says it.",
    dimensions: TEACHING,
    reasons: ["solved"],
    validity: { stages: [{ name: "first try", opens: "start", numbers: [7, 4, 11] }, { name: "easier example", opens: "example", numbers: exampleNumbers("PVSUM") }, { name: "after help", opens: "help", numbers: [7, 4, 11, 1000, 10, 7000, 40, 7040] }] },
    fakeScript: ["11", "7000", "40", "7040", "Okay.", "I wrote it."],
  },
];
