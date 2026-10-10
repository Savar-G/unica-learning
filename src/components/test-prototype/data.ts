// PROTOTYPE ONLY (branch site/assessment-test-prototype, ticket #60). Fake grade 3 test: 36 questions
// from 8 templates, the halfway break after 18, then a 60-second facts section. No server, no scoring.

export type Pic = "square" | "rect" | "tri" | "pent" | "half" | "third" | "quarter" | "twothirds";
export type Choice = { id: string; label: string; pic?: Pic };
export type Question = {
  id: number;
  strand: string;
  text: string;
  /** What "read it to me" says; numbers written so the voice reads them well. */
  speak: string;
  kind: "choice" | "number";
  choices?: Choice[];
  answer: string;
  board: "required" | "optional";
  prefix?: string;
  suffix?: string;
};
export type Fact = { a: number; b: number; op: "+" | "-"; answer: number };

export const CHILD = { name: "Maya", grade: 3 };
export const TOTAL = 36;
export const BREAK_AFTER = 18; // break and facts come after question 18
export const FACT_SECONDS = 60;
const REQUIRED = new Set([3, 8, 13, 16, 22, 28, 33]); // 7 whiteboard-required questions for grades 3-5

const STRAND = { num: "Number and operations", frac: "Fractions and decimals", pat: "Patterns and algebra", shape: "Shapes, measurement and data" };

type Make = (n: number) => Omit<Question, "id" | "board">;

const choiceTemplates: Make[] = [
  (n) => {
    const base = 300 + ((n * 137) % 600);
    const right = base + 100;
    return {
      strand: STRAND.num, kind: "choice", text: `Which number is 100 more than ${base}?`, speak: `Which number is one hundred more than ${base}?`,
      choices: [String(base + 10), String(right), String(base + 1000), String(base + 101)].map((label, i) => ({ id: "abcd"[i], label })),
      answer: "b",
    };
  },
  (n) => {
    const step = [2, 3, 4, 5][n % 4];
    const seq = [1, 2, 3, 4, 5].map((k) => k * step);
    return {
      strand: STRAND.pat, kind: "choice", text: `What number is missing? ${seq[0]}, ${seq[1]}, ${seq[2]}, __, ${seq[4]}`,
      speak: `What number is missing? ${seq[0]}, ${seq[1]}, ${seq[2]}, blank, ${seq[4]}.`,
      choices: [seq[3] - 1, seq[3], seq[3] + step, seq[3] + 2].map((v, i) => ({ id: "abcd"[i], label: String(v) })),
      answer: "b",
    };
  },
  () => ({
    strand: STRAND.shape, kind: "choice", text: "Which shape has 4 sides that are all the same length?", speak: "Which shape has four sides that are all the same length?",
    choices: [
      { id: "a", label: "Rectangle", pic: "rect" },
      { id: "b", label: "Triangle", pic: "tri" },
      { id: "c", label: "Square", pic: "square" },
      { id: "d", label: "Pentagon", pic: "pent" },
    ],
    answer: "c",
  }),
  () => ({
    strand: STRAND.frac, kind: "choice", text: "Which picture shows one half shaded?", speak: "Which picture shows one half shaded?",
    choices: [
      { id: "a", label: "1 of 3", pic: "third" },
      { id: "b", label: "1 of 2", pic: "half" },
      { id: "c", label: "1 of 4", pic: "quarter" },
      { id: "d", label: "2 of 3", pic: "twothirds" },
    ],
    answer: "b",
  }),
];

const numberTemplates: Make[] = [
  (n) => {
    const a = 26 + ((n * 7) % 40), b = 17 + ((n * 11) % 30);
    return { strand: STRAND.num, kind: "number", text: `${a} + ${b} =`, speak: `What is ${a} plus ${b}?`, answer: String(a + b) };
  },
  (n) => {
    const g = 3 + (n % 4), each = 2 + (n % 3);
    return { strand: STRAND.num, kind: "number", text: `There are ${g} bags with ${each} apples in each bag. How many apples are there?`, speak: `There are ${g} bags with ${each} apples in each bag. How many apples are there?`, answer: String(g * each), suffix: "apples" };
  },
];

const workTemplates: Make[] = [
  (n) => {
    const have = 52 + (n % 5) * 3, give = 18 + (n % 4);
    return {
      strand: STRAND.num, kind: "number",
      text: `Sam has ${have} stickers. He gives ${give} to his sister. How many stickers does Sam have now?`,
      speak: `Sam has ${have} stickers. He gives ${give} to his sister. How many stickers does Sam have now? Show how you got your answer.`,
      answer: String(have - give), suffix: "stickers",
    };
  },
  (n) => {
    const cost = 35 + (n % 3) * 5;
    return {
      strand: STRAND.num, kind: "number",
      text: `A pencil costs ${cost}¢. How much do 2 pencils cost?`,
      speak: `A pencil costs ${cost} cents. How much do two pencils cost? Show how you got your answer.`,
      answer: String(cost * 2), suffix: "¢",
    };
  },
];

export function buildTest(): Question[] {
  const out: Question[] = [];
  let c = 0, k = 0, w = 0;
  for (let i = 0; i < TOTAL; i++) {
    let q: Omit<Question, "id" | "board">;
    if (REQUIRED.has(i)) q = workTemplates[w % workTemplates.length](w++);
    else if (i % 3 === 1) q = numberTemplates[k % numberTemplates.length](k++);
    else q = choiceTemplates[c % choiceTemplates.length](c++);
    out.push({ ...q, id: i, board: REQUIRED.has(i) ? "required" : "optional" });
  }
  return out;
}

// Grade 3 facts: BC expects addition and subtraction facts to 20 here, not multiplication yet.
export function buildFacts(): Fact[] {
  const out: Fact[] = [];
  for (let i = 0; i < 60; i++) {
    const a = 3 + ((i * 7) % 9), b = 2 + ((i * 5) % 8);
    out.push(i % 3 === 2 ? { a: a + b, b, op: "-", answer: a } : { a, b, op: "+", answer: a + b });
  }
  return out;
}
