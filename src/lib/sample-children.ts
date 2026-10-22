// Two invented Grade 3 children for the home page "Personalized for your child" section (D-096) and the public /sample-report page.
// Every page question comes from the real question bank (src/lib/assessment): fillTemplate with a fixed seed, so the
// numbers, words and answers are the bank's own. The pictures (arrays, groups) are drawn from the filled values.
// The sample report runs a scripted child through the real session and report model, so every number on it is computed.
// #198: its strengths, struggles and likely causes come from the real learner profile of the same answers.
import {
  bankFor,
  checkProfileAi,
  createFacts,
  createSession,
  fillTemplate,
  finish,
  learnerProfile,
  lockStage1,
  nextQuestion,
  profileAiFacts,
  reportFindings,
  reportModel,
  submitAnswer,
  submitFact,
  type LearnerProfile,
  type ProfileAnswer,
  type Question,
} from "@/lib/assessment";
import type { ReportView } from "@/lib/report-view";

export type SampleChildId = "a" | "b";

export interface SampleChild {
  id: SampleChildId;
  name: string;
  /** The two lines a parent reads: assessment result and learning style. */
  result: string;
  style: string;
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
    tag: "More practice",
  },
  b: {
    id: "b",
    name: "Kai",
    result: "Has mastered addition and subtraction, and is ready to get ahead of Grade 3 with multiplication and division.",
    style: "Learns best visually, from pictures and diagrams.",
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
  /** The operation for the blank column work; without it the prompt's wording decides. */
  op?: "+" | "−";
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

/** Leah's next book, page 2: borrowing in stories. */
export function leahPage2(): PageItem[] {
  return [
    item(fill("2-story-subtract-2-digit", 2), { op: "−" }),
    item(fill("2-story-subtract-2-digit", 5), { op: "−" }),
    item(fill("2-story-subtract-2-digit", 6), { op: "−" }),
    item(fill("3-story-subtract", 2), { op: "−" }),
  ];
}

/** Leah's next book, page 3: adding three-digit numbers in stories. */
export function leahPage3(): PageItem[] {
  return [1, 3, 5, 6].map((seed) => item(fill("g35-3-story-add", seed), { op: "+" }));
}

/** Leah's next book, page 4: a mix, so she chooses whether to add or take away. */
export function leahPage4(): PageItem[] {
  return [
    item(fill("2-story-add-2-digit", 5), { op: "+" }),
    item(fill("2-story-subtract-2-digit", 1), { op: "−" }),
    item(fill("3-story-subtract", 3), { op: "−" }),
    item(fill("g35-3-story-add", 2), { op: "+" }),
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

/** Kai's next book, page 2: sharing and grouping, the start of division. */
export function kaiPage2(): PageItem[] {
  const share = fill("3-share-equally", 1);
  const groupsOf = fill("g35-3-groups-of", 6);
  const share2 = fill("3-share-equally", 6);
  return [
    item(share, { picture: { kind: "groups", groups: share.values.friends, each: share.values.each } }),
    item(groupsOf, { picture: { kind: "groups", groups: groupsOf.values.groups, each: groupsOf.values.size } }),
    item(share2, { picture: { kind: "groups", groups: share2.values.friends, each: share2.values.each } }),
  ];
}

/** Kai's next book, page 3: more arrays and equal groups. */
export function kaiPage3(): PageItem[] {
  const a1 = fill("g35-3-array", 5);
  const a2 = fill("g35-3-array", 3);
  const g = fill("3-equal-groups", 3);
  return [
    item(a1, { picture: { kind: "array", rows: a1.values.rows, each: a1.values.each } }),
    item(a2, { picture: { kind: "array", rows: a2.values.rows, each: a2.values.each } }),
    item(g, { picture: { kind: "groups", groups: g.values.groups, each: g.values.each } }),
  ];
}

/** Kai's next book, page 4: Grade 4 multiplication and sharing with bigger numbers. */
export function kaiPage4(): PageItem[] {
  const m1 = fill("g35-4-story-multiply", 1);
  const m2 = fill("g35-4-story-multiply", 6);
  return [
    item(m1, { picture: { kind: "array", rows: m1.values.b, each: m1.values.a } }),
    item(m2, { picture: { kind: "array", rows: m2.values.b, each: m2.values.a } }),
    item(fill("g35-4-share", 3)),
  ];
}

/** The misconceptions that mean "regrouping": dropped carries and the smaller-from-larger slip. */
const REGROUPING = new Set(["O1", "O2", "O3", "regroup-forget"]);
const isRegrouping = (q: Question) =>
  q.wrong.some((w) => REGROUPING.has(w.misconception)) || (q.strand === "O" && /[+−]|in all|left/.test(q.prompt));

/**
 * The sample's workbook plan (#198): the AI writes it for a real report (#197), and a sample has no AI call. Built by
 * code from the facts the AI would read, by the plan's rules: review a strength of the grade, practise the clear
 * struggles first, and stretch with the first standard the child is ready for. It passes the same checks as the AI's.
 */
function samplePlan(profile: LearnerProfile): LearnerProfile {
  const ready = profileAiFacts(profile).next_challenge_candidates.map((c) => c.code);
  const plan = {
    struggles: [],
    next_challenge: ready.slice(0, 1),
    workbook_plan: {
      review: { percent: 20, standards: profile.strengths.filter((s) => s.grade === profile.test.grade).slice(0, 2).map((s) => s.code) },
      practise: { percent: 60, standards: reportFindings(profile).struggles.slice(0, 2).map((s) => s.code) },
      stretch: { percent: 20, standards: ready.slice(0, 1) },
    },
  };
  const check = checkProfileAi(profile, plan, "sample");
  return check.ok ? { ...profile, ai: check.ai } : profile;
}

/**
 * Leah's sample report: a Grade 3 BC child working at a Grade 2 level. She misses every regrouping question and most Grade 3 questions.
 * Computed by the real session, the facts section, the report model and the learner profile; nothing on it is typed in
 * by hand. A wrong answer is the question's own coded wrong answer (a carrying or borrowing slip where there is one),
 * so the report can name the likely cause.
 */
export function sampleReportView(): ReportView {
  const profile = { grade: SAMPLE_GRADE, province: "BC" } as const;
  let session = createSession(profile, 7);
  let count = 0;
  let ms = 0;
  for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
    // Behind by one grade: right below Grade 3 except regrouping; at Grade 3 only every third non-regrouping question.
    const right = !isRegrouping(q) && (q.level < SAMPLE_GRADE || (q.level === SAMPLE_GRADE && count % 3 === 0));
    const wrong = q.wrong.find((w) => REGROUPING.has(w.misconception)) ?? q.wrong[0];
    const timeMs = 45_000 + (count % 5) * 9_000;
    session = submitAnswer(session, { questionId: q.id, response: right ? q.answer : (wrong?.value ?? "0"), timeMs });
    // #253: the child presses "Done checking" on the stage 1 grid at once.
    if (!session.route && session.answers.length === session.stage1.length) session = lockStage1(session);
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
  const questions = [...session.stage1, ...session.stage2[session.route!]];
  const answers = session.answers.map((a, i): ProfileAnswer => ({
    question: questions[i], response: a.response, correct: a.correct, misconception: a.misconception, timeMs: a.timeMs,
    work: { required: questions[i].showWork === true, drawing: false, typed: false }, readAloud: null, away: null,
  }));
  const learner = learnerProfile({ placement, answers, help: "no", learning: null });
  return {
    id: "sample",
    childName: SAMPLE_CHILDREN.a.name,
    province: "BC",
    completedAt: "2026-10-05T23:30:00Z",
    questions: count,
    minutes: Math.round(ms / 60_000),
    model: reportModel(placement, { completedTestsInGrade: 0, workReviews: [] }),
    findings: learner ? reportFindings(samplePlan(learner)) : null,
  };
}
