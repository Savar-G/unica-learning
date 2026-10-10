// PROTOTYPE ONLY (branch site/report-prototype, round r12). SAMPLE DATA: every child, score, count, n and percentile
// in this file is made up for the prototype. The two FSA figures come from the spec (#54) and must be checked
// against the BC open dataset before launch. Nothing here is measured.

export type Status = "secure" | "developing" | "attention";
export type Verdict = "behind" | "on" | "ahead";
export type Stage = 1 | 2 | 3;
export type ChildKey = Verdict;

export const STATUS_LABEL: Record<Status, string> = {
  secure: "Secure",
  developing: "Developing",
  attention: "Needs attention",
};

export interface Strand {
  name: string;
  status: Status;
  correct: number;
  total: number;
  /** One plain sentence about what the questions in this strand showed. */
  note: string;
}

export interface Work {
  strand: string;
  question: string;
  /** Lines the child wrote on the whiteboard, drawn in a handwriting font. */
  lines: string[];
  answer: string;
  correct: boolean;
  /** Shown only when the review is high confidence; null means the image stands alone. */
  comment: string | null;
}

export interface Child {
  key: ChildKey;
  name: string;
  /** He / she / they, used in "how we help" sentences. Sample children only. */
  they: string;
  their: string;
  grade: number;
  level: number;
  verdict: Verdict;
  date: string;
  minutes: number;
  questions: number;
  strands: Strand[];
  facts: { correct: number; tried: number; seconds: number; perMinute: number; fluent: boolean };
  work: Work[];
  /** Stage 2: 0 = lower quarter, 1 = middle half, 2 = upper quarter. */
  band: 0 | 1 | 2;
  /** Stage 3: share of same-grade takers this child scored higher than. */
  percentile: number;
  focus: string[];
}

export const CHILDREN: Record<ChildKey, Child> = {
  behind: {
    key: "behind",
    name: "Maya",
    they: "she",
    their: "her",
    grade: 4,
    level: 3,
    verdict: "behind",
    date: "October 10, 2026",
    minutes: 34,
    questions: 36,
    strands: [
      { name: "Number and operations", status: "developing", correct: 6, total: 10, note: "Adds and subtracts to 100. Carrying in bigger numbers is not steady yet." },
      { name: "Fractions and decimals", status: "attention", correct: 3, total: 8, note: "Names halves and quarters. Comparing fractions with different bottoms is new." },
      { name: "Patterns and algebra", status: "secure", correct: 7, total: 8, note: "Finds and extends number patterns with ease." },
      { name: "Shapes, measurement and data", status: "developing", correct: 6, total: 10, note: "Reads bar graphs well. Area and perimeter get mixed up." },
    ],
    facts: { correct: 14, tried: 16, seconds: 90, perMinute: 9, fluent: false },
    work: [
      { strand: "Number and operations", question: "47 + 38 = ?", lines: ["  47", "+ 38", "----", " 715"], answer: "715", correct: false, comment: "Added each column but did not carry the 1. This looks like a gap in regrouping, not a slip." },
      { strand: "Fractions and decimals", question: "Which is bigger: 1/3 or 1/5?", lines: ["1/3   1/5", "5 > 3", "so 1/5"], answer: "1/5", correct: false, comment: "Thought a bigger bottom number makes a bigger fraction. This is common at this stage." },
      { strand: "Shapes, measurement and data", question: "A garden is 6 m by 4 m. What is its area?", lines: ["6 + 4 + 6 + 4", "= 20"], answer: "20", correct: false, comment: null },
    ],
    band: 0,
    percentile: 22,
    focus: ["carrying in addition", "comparing fractions", "area and perimeter"],
  },
  on: {
    key: "on",
    name: "Leo",
    they: "he",
    their: "his",
    grade: 4,
    level: 4,
    verdict: "on",
    date: "October 10, 2026",
    minutes: 31,
    questions: 36,
    strands: [
      { name: "Number and operations", status: "secure", correct: 9, total: 10, note: "Multi-digit adding and subtracting are steady." },
      { name: "Fractions and decimals", status: "developing", correct: 6, total: 8, note: "Fractions are strong. Adding decimals with different places is not steady yet." },
      { name: "Patterns and algebra", status: "secure", correct: 7, total: 8, note: "Solves for a missing number in an equation." },
      { name: "Shapes, measurement and data", status: "secure", correct: 8, total: 10, note: "Area, perimeter and graphs are all in place." },
    ],
    facts: { correct: 22, tried: 23, seconds: 90, perMinute: 15, fluent: true },
    work: [
      { strand: "Fractions and decimals", question: "What is 3/4 of 12?", lines: ["12 ÷ 4 = 3", "3 × 3 = 9"], answer: "9", correct: true, comment: "Split 12 into 4 equal groups, then took 3 of them. A clear method." },
      { strand: "Fractions and decimals", question: "2.5 + 1.75 = ?", lines: ["  2.5", "+ 1.75", "------", "  1.80"], answer: "1.80", correct: false, comment: "Lined the digits up on the right, not on the decimal point." },
      { strand: "Patterns and algebra", question: "3, 7, 11, __ . What comes next?", lines: ["+4 +4", "15"], answer: "15", correct: true, comment: null },
    ],
    band: 1,
    percentile: 58,
    focus: ["adding decimals"],
  },
  ahead: {
    key: "ahead",
    name: "Noor",
    they: "she",
    their: "her",
    grade: 3,
    level: 5,
    verdict: "ahead",
    date: "October 10, 2026",
    minutes: 33,
    questions: 36,
    strands: [
      { name: "Number and operations", status: "secure", correct: 10, total: 10, note: "Grade 5 multiplication and division are in place." },
      { name: "Fractions and decimals", status: "secure", correct: 7, total: 8, note: "Adds fractions with different bottoms." },
      { name: "Patterns and algebra", status: "secure", correct: 8, total: 8, note: "Writes a rule for a pattern." },
      { name: "Shapes, measurement and data", status: "secure", correct: 9, total: 10, note: "Area, volume and line graphs are all in place." },
    ],
    facts: { correct: 28, tried: 28, seconds: 90, perMinute: 19, fluent: true },
    work: [
      { strand: "Number and operations", question: "304 − 168 = ?", lines: ["  2 9 1", "  3 0 4", "- 1 6 8", "-------", "  1 3 6"], answer: "136", correct: true, comment: "Regrouped across the zero correctly. This is grade 4-5 work." },
      { strand: "Fractions and decimals", question: "2/3 + 1/6 = ?", lines: ["2/3 = 4/6", "4/6 + 1/6 = 5/6"], answer: "5/6", correct: true, comment: "Found a common bottom number before adding." },
      { strand: "Shapes, measurement and data", question: "A box is 3 cm by 4 cm by 2 cm. What is its volume?", lines: ["3 × 4 = 12", "12 × 2 = 24"], answer: "24", correct: true, comment: null },
    ],
    band: 2,
    percentile: 94,
    focus: [],
  },
};

/** Sample count of completed tests per grade at each comparison stage (spec: <100, 100-399, 400+). */
export const TAKERS: Record<Stage, number> = { 1: 63, 2: 214, 3: 512 };

export const STAGE_LABEL: Record<Stage, string> = {
  1: "Scale + FSA",
  2: "Bands",
  3: "Percentile",
};

export const BANDS = ["Lower quarter", "Middle half", "Upper quarter"] as const;

// From the spec (#54): 2025/26 BC FSA numeracy, On Track plus Extending, among students with a result. Check before launch.
export const FSA: Record<number, number> = { 4: 66.5, 7: 59.2 };
export const FSA_SOURCE = "BC Ministry of Education, Foundation Skills Assessment 2025/26, numeracy";

export function gradeName(n: number) {
  return n === 0 ? "kindergarten" : `grade ${n}`;
}

export function levelSentence(c: Child) {
  return `${c.name} is working at a ${gradeName(c.level)} level.`;
}

export function verdictSentence(c: Child) {
  const gap = Math.abs(c.level - c.grade);
  const grades = gap === 1 ? "one grade" : `${gap} grades`;
  if (c.verdict === "behind") return `That is ${grades} below ${c.their} school grade (${gradeName(c.grade)}).`;
  if (c.verdict === "ahead") return `That is ${grades} above ${c.their} school grade (${gradeName(c.grade)}).`;
  return `That matches ${c.their} school grade.`;
}

export const VERDICT_SHORT: Record<Verdict, string> = { behind: "Below grade", on: "On grade", ahead: "Above grade" };

export function pct(correct: number, total: number) {
  return Math.round((correct / Math.max(total, 1)) * 100);
}
