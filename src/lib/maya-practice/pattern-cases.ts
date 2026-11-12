import { PATTERN_FIXTURES } from "@/lib/maya-gate/pattern-cases";
import { valuesIn } from "@/lib/maya";
import type { PracticeCase } from "./cases";

const fixtures = ["PT_LONG", "PT_TERM", "PT_PAIR", "PT_STORY"] as const;
const cards = [
  { id: "PTP1", fixture: "PT_LONG" as const, knows: "You can subtract 115 minus 35 to get 80. You do not yet know to share this increase across eight equal steps.",
    behaviour: "Start with: 115 minus 35 is 80. Then ask why you divide by eight. After help, divide 80 by 8 to get 10.",
    expected: "Acknowledge the correct increase at once. Explain that the ninth term is eight equal steps after the first. Do not ask for the subtraction again. Let the child find 10.",
    fakeScript: ["115 minus 35 is 80.", "Why do I divide by eight?", "80 divided by 8 is 10.", "Okay.", "I wrote it."] },
  { id: "PTP2", fixture: "PT_TERM" as const, knows: "You can add eight repeatedly from 20. You mistakenly count four additions for the fourth term, and think the answer is 52.",
    behaviour: "Start with your answer 52. Ask why only three steps are needed. After help, find three times eight is 24 and add it to 20 to get 44.",
    expected: "Keep full-sentence forward additions in scope. Explain that the start is already the first term. Do not accept 52. Count three steps, then add the start. Accept 44 only from the child.",
    fakeScript: ["I got 52.", "Why do I use three steps?", "3 times 8 is 24.", "20 plus 24 is 44.", "Okay.", "I wrote it."] },
  { id: "PTP3", fixture: "PT_PAIR" as const, knows: "You can multiply and add but do not know how many steps the eighth and second terms take.",
    behaviour: "Start with: I'm stuck. Follow a smaller example. Then find seven times nine is 63, add 34 to get 97, find 34 plus 9 is 43, and add 97 plus 43 to get 140.",
    expected: "Use a same-shape easier pattern first. Find the eighth and second terms separately before adding them. Keep the child active and do not give 140.",
    fakeScript: ["I'm stuck.", "Okay.", "Okay.", "Okay.", "Okay.", "7 times 9 is 63.", "34 plus 63 is 97.", "34 plus 9 is 43.", "97 plus 43 is 140.", "Okay.", "I wrote it."] },
  { id: "PTP4", fixture: "PT_STORY" as const, knows: "You know that eight days means eight additions after the 32 beads already there. You can work out eight times nine is 72.",
    behaviour: "Start with: 8 times 9 is 72. Then add 32 to get 104. Explain that the 32 beads were there before the first day.",
    expected: "Acknowledge the early product and ask only for the remaining addition. Count from the initial amount before day one. Accept 104 from the child.",
    fakeScript: ["8 times 9 is 72.", "32 plus 72 is 104.", "Okay.", "I wrote it."] },
];

export const PATTERN_PRACTICE: PracticeCase[] = cards.map((card, i) => {
  const p = PATTERN_FIXTURES[fixtures[i]];
  const numbers = [...new Set(valuesIn(JSON.stringify([p.steps, p.easierExample])).flatMap(v => v.type === "number" ? [v.value] : []))];
  return { id: card.id, title: card.expected, fixture: card.fixture,
    persona: { name: "Leo", age: i === 2 ? 8 : 10, question: p.text, knows: card.knows, behaviour: card.behaviour },
    expected: card.expected, dimensions: ["J01", "J02", "J03", "J04", "J05", "J06"], reasons: ["solved"],
    validity: { stages: [{ name: "known work", opens: "start", numbers: i === 1 ? [52] : i === 0 ? [80] : i === 3 ? [72] : [] },
      { name: "after help", opens: "help", numbers }], mustSay: [{ pattern: i === 2 ? /stuck/i : /\d/, within: 1, what: "gives the required first turn" }] },
    fakeScript: card.fakeScript };
});
