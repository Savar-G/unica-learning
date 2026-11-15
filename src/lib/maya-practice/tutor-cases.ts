// The practice cases of the tutor core (D-345, `npm run maya:practice -- --tutor`): Savar's own call and simulated
// children who hold one set misconception each. They run the tutor core (`createTextSession({ tutor: true })`) on
// 2-digit subtraction (52 - 28 = 24) and addition (27 + 39 = 66), the two kinds the tutor core teaches in phase 1.
// The simulated child is the same practice child as in the suite (cases.ts): its persona, its validity rules and its
// scripted fake child work the same way. What is new is `tutor`: the code checks the teaching judge reads
// (teaching-metrics.ts, tutor-run.ts).
import { A_AFTER_HELP, A_EXAMPLE, B_EXAMPLE, B_WORK, TEACHING, type PracticeCase, type TutorCheck } from "./cases";

/**
 * Test case 1 (teaching design section 5): within 2 Maya turns the child hears why 2 is too small and that a ten
 * becomes 10 ones, and is asked for 12 minus 8. Each pattern reads Maya's words, so the model's wording may vary.
 */
export const SAVAR_CALL_CHECKS: readonly TutorCheck[] = [
  {
    what: "says why 2 is too small to take 8 from",
    within: 2,
    all: [/\b(?:too small|smaller than 8|less than 8|not enough|too few|can'?t take (?:away )?8|cannot take (?:away )?8|can'?t (?:do|take|subtract) 2 (?:minus|take away|−|-) 8|isn'?t enough|only (?:have )?2)\b/i],
  },
  {
    what: "says that a ten becomes 10 ones",
    within: 2,
    all: [/\b(?:1|one|a) ten\b[^.?!]*\b(?:10|ten) ones\b|\b(?:10|ten) ones\b[^.?!]*\b(?:1|one|a) ten\b/i],
  },
  {
    what: "asks for 12 minus 8",
    within: 2,
    all: [/\b(?:what(?:'s| is)|how much is|how many is|can you (?:do|work out|tell me)|do|try)\s+12\s*(?:minus|take away|−|-|–)\s*8\b|\b12\s*(?:minus|take away|−|-|–)\s*8\b[^.!?]*\?/i],
  },
];

/** The first answer of a child who has seen the trade: the ones, then the ones' difference, then the tens. */
const AFTER_HELP = { name: "after help", opens: "help", numbers: [...B_WORK, 24] } as const;

export const TUTOR_CASES: PracticeCase[] = [
  {
    id: "K01",
    title: "Savar's call: teach me 2 minus 8",
    fixture: "B",
    persona: { name: "Zoe", age: 8, question: "52 - 28", knows: "You know how to take away in the tens and the ones, but in the ones you only see 2 and 8 and you cannot take 8 from 2. You do not know about trading a ten until Maya explains. Once she does, 2 plus 10 is 12, 12 take away 8 is 4, and 4 tens take away 2 tens is 2 tens, so 24.", behaviour: "Your first words are exactly: Can you teach me how to do 2 minus 8? I don't get it. Then do each small thing Maya asks, one at a time." },
    expected: "Answer the child's own question at once, in the child's numbers: 2 is too small to take 8 from, so trade 1 ten for 10 ones (2 ones become 12), then ask for 12 minus 8. One message, then wait. Telling the idea is right; the child still does the next part.",
    dimensions: TEACHING,
    reasons: ["solved"],
    opener: "Can you teach me how to do 2 minus 8? I don't get it.",
    validity: { stages: [{ name: "first try", opens: "start", numbers: [] }, B_EXAMPLE, AFTER_HELP], mustSay: [{ pattern: /2 minus 8/i, within: 1, what: "asks about 2 minus 8" }] },
    fakeScript: ["Can you teach me how to do 2 minus 8? I don't get it.", "12.", "4.", "4 tens minus 2 tens is 2 tens, so 24.", "Because I traded a ten.", "I wrote it."],
    tutor: { checks: SAVAR_CALL_CHECKS },
  },
  {
    id: "K02",
    title: "Smaller from larger",
    fixture: "B",
    persona: { name: "Owen", age: 9, question: "52 - 28", knows: "In each column you take the smaller digit from the larger: 8 - 2 = 6 and 5 - 2 = 3, so you get 36. You do not know about trading a ten until Maya shows you. Once you see it, 12 take away 8 is 4 and 4 tens take away 2 tens is 2 tens, so 24.", behaviour: "Start by saying your answer is 36. Answer Maya's questions honestly from what you know, then follow her steps and fix your answer." },
    expected: "Say plainly that 36 is not right and where it goes wrong (the ones: 8 minus 2 is the other way around). Then show the trade of a ten for 10 ones and let the child fix the ones and the tens. The child ends with 24.",
    dimensions: TEACHING,
    reasons: ["solved"],
    validity: { stages: [{ name: "first try", opens: "start", numbers: [36, 6, 3] }, B_EXAMPLE, AFTER_HELP], firstNumbers: [36] },
    fakeScript: ["I got 36.", "I did 8 take away 2.", "12 take away 8 is 4.", "4 take away 2 is 2, so 24.", "Because I traded a ten.", "I wrote it."],
    tutor: { misconception: { wrong: [36], right: 24 } },
  },
  {
    id: "K03",
    title: "Forgot to take the traded ten away",
    fixture: "B",
    persona: { name: "Nia", age: 9, question: "52 - 28", knows: "You trade a ten for 10 ones, so 2 ones become 12, and 12 take away 8 is 4. But you forget to take that ten away from the 5 tens, so you do 5 tens take away 2 tens, which is 3 tens, and you get 34. You only see the missing ten when Maya asks how many tens are left.", behaviour: "Start by saying your answer is 34 and tell Maya the ones step: 12 take away 8 is 4. Answer Maya's questions honestly, then fix your tens." },
    expected: "Keep the child's right ones step (12 minus 8 is 4) and name the lost ten: a ten went to the ones, so 4 tens are left, not 5. Let the child fix the tens and get 24. Do not redo the ones.",
    dimensions: TEACHING,
    reasons: ["solved"],
    validity: { stages: [{ name: "first try", opens: "start", numbers: [34, 12, 4, 3, 5, 2] }, B_EXAMPLE, AFTER_HELP], firstNumbers: [34, 12, 4] },
    fakeScript: ["I got 34. I did 12 take away 8 is 4.", "I did 5 take away 2 is 3.", "Oh, I traded a ten, so 4 tens.", "4 tens take away 2 tens is 2, so 24.", "I wrote it."],
    tutor: { misconception: { wrong: [34], right: 24 } },
  },
  {
    id: "K04",
    title: "Forgot the carry",
    fixture: "A",
    persona: { name: "Lena", age: 8, question: "27 + 39", knows: "You add the ones (7 + 9 = 16) and write the 6, then add the tens (2 + 3 = 5), but you forget to carry the ten, so you get 56. You only find the missing ten when Maya helps you check. Once you see it, 5 tens and the carried ten make 6 tens, so 66.", behaviour: "Start by saying your answer is 56. Answer Maya's questions about your work honestly, then fix it." },
    expected: "Keep the right ones sum (16), name the lost ten (the 1 ten of 16 goes to the tens), and let the child add it: 5 tens and 1 ten make 6 tens, so 66.",
    dimensions: TEACHING,
    reasons: ["solved"],
    validity: { stages: [{ name: "first try", opens: "start", numbers: [56, 16, 5] }, A_EXAMPLE, A_AFTER_HELP], firstNumbers: [56] },
    fakeScript: ["I got 56.", "Seven plus nine is 16.", "Two plus three is 5.", "Plus the extra one, that's 6, so 66.", "Because the ones made sixteen.", "I wrote it."],
    tutor: { misconception: { wrong: [56], right: 66 } },
  },
  {
    id: "K05",
    title: "\"I don't get it\" twice",
    fixture: "B",
    persona: { name: "Mia", age: 8, question: "52 - 28", knows: "You do not know how to start 52 - 28. The first time Maya explains, it is still too much for you and you say you still don't get it. After a second, smaller explanation you can do each tiny step: 2 plus 10 is 12, 12 take away 8 is 4, 4 tens take away 2 tens is 2 tens, so 24.", behaviour: "Your first words are exactly: I don't get it. After Maya's first reply, say that you still don't get it. After her next reply, do each small thing she asks." },
    expected: "The second reply is a smaller, different explanation (not the first one again): one idea, the child's own numbers, one tiny action. The child never hears the same words twice.",
    dimensions: TEACHING,
    reasons: ["solved"],
    opener: "I don't get it.",
    validity: { stages: [{ name: "first try", opens: "start", numbers: [] }, B_EXAMPLE, AFTER_HELP], mustSay: [{ pattern: /(?:don'?t|do not) get it/i, within: 2, what: "says they don't get it" }] },
    fakeScript: ["I don't get it.", "I still don't get it.", "12.", "4.", "4 tens minus 2 tens is 2 tens, so 24.", "I wrote it."],
  },
  {
    id: "K06",
    title: "A wrong answer, then a right one",
    fixture: "B",
    persona: { name: "Sam", age: 9, question: "52 - 28", knows: "You think the answer is 26 because you did 28 minus 2. You do not know about trading a ten until Maya shows you. Once you see it, 12 take away 8 is 4 and 4 tens take away 2 tens is 2 tens, so 24.", behaviour: "Start by saying you think the answer is 26. Follow Maya's steps one at a time, and when you have the right answer, say it." },
    expected: "Say at once, kindly, that 26 is not right, and where. Do not stop at \"try again\". Let the child find 24 by the trade. When the child says 24, accept it, with a reason.",
    dimensions: TEACHING,
    reasons: ["solved"],
    validity: { stages: [{ name: "first try", opens: "start", numbers: [26] }, B_EXAMPLE, AFTER_HELP], firstNumbers: [26] },
    fakeScript: ["I think it's 26.", "12 take away 8 is 4.", "4 tens take away 2 tens is 2, so 24.", "Because I traded a ten.", "I wrote it."],
    tutor: { misconception: { wrong: [26], right: 24 } },
  },
];
