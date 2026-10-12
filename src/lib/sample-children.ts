// Two invented Grade 3 children for the home page "Personalization" section and the public /sample-report page.
// Every page question comes from the real question bank (src/lib/assessment): fillTemplate with a fixed seed, so the
// numbers, words and answers are the bank's own. The pictures (arrays, groups) are drawn from the filled values.
// The sample report runs a scripted child through the real session and report model, so every number on it is computed.
import {
  bankFor,
  createFacts,
  createSession,
  fillTemplate,
  finish,
  nextQuestion,
  reportModel,
  submitAnswer,
  submitFact,
  type Question,
} from "@/lib/assessment";
import type { ReportView } from "@/lib/report-view";

export type SampleChildId = "a" | "b";

export interface SampleChild {
  id: SampleChildId;
  name: string;
  /** The three lines a parent reads: assessment result, learning style, what the next book contains. */
  result: string;
  style: string;
  book: string;
  /** One short tag for compact layouts. */
  tag: string;
}

export const SAMPLE_GRADE = 3;

export const SAMPLE_CHILDREN: Record<SampleChildId, SampleChild> = {
  a: {
    id: "a",
    name: "Leah",
    result: "Struggles with carrying and borrowing, so addition and subtraction are hard for her.",
    style: "Learns best through stories.",
    book: "6 pages on regrouping, taught with story problems, at a slower pace.",
    tag: "More practice",
  },
  b: {
    id: "b",
    name: "Kai",
    result: "Has mastered addition and subtraction, and is ready to get ahead of Grade 3 with multiplication and division.",
    style: "Learns best visually, from pictures and diagrams.",
    book: "Moves on to multiplication early, with pictures and arrays.",
    tag: "New challenges",
  },
};


/** A question on a sample page: the bank's own prompt and answer, plus what to draw beside it. */
export interface PageItem {
  templateId: string;
  level: number;
  prompt: string;
  answer: string;
  values: Record<string, number>;
  /** A picture drawn from the values: an array (rows x each) or equal groups. */
  picture?: { kind: "array"; rows: number; each: number } | { kind: "groups"; groups: number; each: number };
  /** Column work for a worked example: the two numbers, the operation and the carried digit. */
  worked?: { a: number; b: number; op: "+"; carry: number; answer: number };
}

const fill = (templateId: string, seed: number): Question => {
  const t = bankFor(SAMPLE_GRADE).find((x) => x.id === templateId);
  if (!t) throw new Error(`No template ${templateId} in the grade ${SAMPLE_GRADE} bank`);
  return fillTemplate(t, seed);
};

const item = (q: Question, extra: Partial<PageItem> = {}): PageItem => ({
  templateId: q.templateId,
  level: q.level,
  prompt: q.prompt,
  answer: q.answer,
  values: q.values,
  ...extra,
});

/** Leah's next book, page 1 of 6: one worked story problem, then three to try, each with room to regroup. */
export function leahPage(): PageItem[] {
  const ex = fill("2-story-add-2-digit", 1);
  const { a, b } = ex.values;
  return [
    item(ex, { worked: { a, b, op: "+", carry: Math.floor(((a % 10) + (b % 10)) / 10), answer: a + b } }),
    item(fill("2-story-add-2-digit", 4)),
    item(fill("2-story-subtract-2-digit", 4)),
    item(fill("g35-3-story-add", 4)),
  ];
}

/** Kai's next book, page 1: multiplication with arrays and groups, then one grade 4 question. */
export function kaiPage(): PageItem[] {
  const arr = fill("g35-3-array", 1);
  const grp = fill("3-equal-groups", 5);
  const big = fill("g35-4-story-multiply", 4);
  return [
    item(arr, { picture: { kind: "array", rows: arr.values.rows, each: arr.values.each } }),
    item(grp, { picture: { kind: "groups", groups: grp.values.groups, each: grp.values.each } }),
    item(big, { picture: { kind: "array", rows: big.values.b, each: big.values.a } }),
  ];
}

/** The misconceptions that mean "regrouping": dropped carries and the smaller-from-larger slip. */
const REGROUPING = new Set(["O1", "O2", "O3", "regroup-forget"]);
const isRegrouping = (q: Question) =>
  q.wrong.some((w) => REGROUPING.has(w.misconception)) || (q.strand === "O" && /[+−]|in all|left/.test(q.prompt));

/**
 * Leah's sample report: a Grade 3 BC child working at a Grade 2 level. She misses every regrouping question and most Grade 3 questions.
 * Computed by the real session, the facts section and the report model; nothing on it is typed in by hand.
 */
export function sampleReportView(): ReportView {
  const profile = { grade: SAMPLE_GRADE, province: "BC" } as const;
  let session = createSession(profile, 7);
  let count = 0;
  let ms = 0;
  for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
    // Behind by one grade: right below Grade 3 except regrouping; at Grade 3 only every third non-regrouping question.
    const right = !isRegrouping(q) && (q.level < SAMPLE_GRADE || (q.level === SAMPLE_GRADE && count % 3 === 0));
    const timeMs = 45_000 + (count % 5) * 9_000;
    session = submitAnswer(session, { questionId: q.id, response: right ? q.answer : "0", timeMs });
    count++;
    ms += timeMs;
  }
  // Quick facts: 24 facts in 60 seconds, two of them wrong.
  let facts = createFacts(profile, 7);
  for (let i = 0; i < 24; i++) {
    const f = facts.facts[i];
    facts = submitFact(facts, { factId: f.id, response: i % 11 === 5 ? String(f.answer + 1) : String(f.answer), atMs: (i + 1) * 2_400 });
  }
  const placement = finish(session, facts, "no");
  return {
    id: "sample",
    childName: SAMPLE_CHILDREN.a.name,
    province: "BC",
    completedAt: "2026-10-05T23:30:00Z",
    questions: count,
    minutes: Math.round(ms / 60_000),
    model: reportModel(placement, { completedTestsInGrade: 0, workReviews: [] }),
  };
}
