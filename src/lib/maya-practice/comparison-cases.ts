import { FIXTURES, type FixtureId } from "../maya-gate/fixtures";
import type { PracticeCase } from "./cases";

const cards = [
  { fixture: "COMPARE_FRACTIONS", id: "CMP1", name: "Iris", work: "5 is greater than 3. The fractions have the same denominator, so the statement is true.",
    script: ["5 is greater than 3.", "The answer is true.", "I wrote it."] },
  { fixture: "COMPARE_AREAS", id: "CMP2", name: "Keira", work: "The first area is 7 times 6, or 42 squares. The second is 5 times 6, or 30 squares. 42 is greater than 30. Write 7 by 6.",
    script: ["7 times 6 is 42.", "5 times 6 is 30.", "42 is greater than 30.", "The answer is 7 by 6.", "I wrote it."] },
  { fixture: "COMPARE_DIE", id: "CMP3", name: "Rowan", work: "A fair die has numbers 1 to 6. The even outcomes are 2, 4 and 6, so there are 3. Only 1 is less than 2. 3 is greater than 1, so even is more likely.",
    script: ["2, 4, 6, so 3 outcomes.", "1.", "3 is greater than 1.", "The answer is even.", "I wrote it."] },
] as const;

export const COMPARISON_PRACTICE: PracticeCase[] = cards.map(card => {
  const p = FIXTURES[card.fixture as FixtureId];
  return {
    id: card.id, fixture: card.fixture, title: "Compare both checked amounts before the written answer",
    persona: { name: card.name, age: 10, question: p.text, knows: card.work,
      behaviour: "Work one step at a time. State the current side or relation when asked. After the comparison, say the written answer in a full sentence. Confirm you wrote it when asked." },
    expected: "Check each real side in order, then the child's numerical relation, then the final word. Do not supply the relation or winning word. A correct product cannot replace the other side's work.",
    dimensions: ["J01", "J02", "J03", "J04", "J05", "J06"], reasons: ["solved"],
    validity: { stages: [{ name: "known comparison method", opens: "start", numbers: [1, 2, 3, 4, 5, 6, 7, 30, 42] }] },
    fakeScript: [...card.script],
  };
});
