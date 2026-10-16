// The admin area (#77) in plain data: the list filters, the test's answers beside its questions, and the words for the
// flags. Pure: no network, database or clock, so the pages (src/app/(product)/admin) only fetch and show. Server and admin only:
// it handles correct answers, which a parent's browser must never get.
import {
  MISCONCEPTIONS,
  PAUSE_WINDOW,
  TOO_FAST_MS,
  helpLikely,
  type FactsTest,
  type Flag,
  type Grade,
  type HelpAnswer,
  type Level,
  type MisconceptionId,
  type Province,
  type Question,
  type StoredTest,
  type Strand,
} from "@/lib/assessment";
import { CURRICULA } from "@/lib/signup";
import type { AssessmentStatus } from "@/lib/test-api";

export const ADMIN_PATH = "/admin";
/** The tests list. /admin is the dashboard (D-099). */
export const ADMIN_TESTS_PATH = `${ADMIN_PATH}/tests`;
/** One test in the admin area. Savar's alert email for each finished test links here (#65). */
export const adminTestPath = (id: string) => `${ADMIN_PATH}/assessments/${id}`;
export const adminParentPath = (id: string) => `${ADMIN_PATH}/parents/${id}`;
/** The parent's report as the parent sees it, opened by an admin. */
export const adminReportPath = (id: string) => `${ADMIN_PATH}/reports/${id}`;
/** One logged email, as the parent got it (D-103). `id`: its id in the email list. */
export const adminEmailPath = (id: string, demo = false) => `${ADMIN_PATH}/emails/${encodeURIComponent(id)}${demo ? "?demo=1" : ""}`;

export const STATUSES: readonly AssessmentStatus[] = ["in_progress", "completed", "expired"];
export const STATUS_TEXT: Record<AssessmentStatus, string> = { in_progress: "In progress", completed: "Completed", expired: "Expired" };

/** A level K-8 in a table cell: "K" or the grade number. */
export const levelText = (level: number) => (level === 0 ? "K" : String(level));
export const GRADES: readonly Grade[] = [1, 2, 3, 4, 5, 6, 7];
export const PROVINCES = Object.keys(CURRICULA) as Province[];

/** The filters of the admin lists. Every one is optional; together they all apply. */
export interface AdminFilters {
  status: AssessmentStatus | null;
  grade: Grade | null;
  province: Province | null;
  /** Only tests where help is likely (helpLikely of the stored flags). */
  help: boolean;
  flagged: boolean;
  /** Only tests with at least one low-confidence AI review. */
  lowAi: boolean;
}

export const NO_FILTERS: AdminFilters = { status: null, grade: null, province: null, help: false, flagged: false, lowAi: false };

type Query = Record<string, string | string[] | undefined>;

/** One value from the list, or null: a typed URL can never put anything else in a query. */
function pick<T extends string | number>(raw: string | string[] | undefined, choices: readonly T[]): T | null {
  if (typeof raw !== "string") return null;
  return choices.find((c) => String(c) === raw) ?? null;
}

/** The filters in a page's query string (?status=completed&grade=3&province=BC&flag=help&ai=low). */
export function parseFilters(query: Query): AdminFilters {
  return {
    status: pick(query.status, STATUSES),
    grade: pick(query.grade, GRADES),
    province: pick(query.province, PROVINCES),
    help: query.flag === "help",
    flagged: query.flag === "any",
    lowAi: query.ai === "low",
  };
}

/** What a filter needs from one test. flags: the stored placement's flags; null while the test is not finished. */
export interface AdminTestRow {
  id: string;
  status: AssessmentStatus;
  grade: number;
  province: Province;
  flags: readonly Flag[] | null;
}

/** The tests every set filter keeps, in the same order. lowAi: the ids of tests with a low-confidence AI review. */
export function filterTests<T extends AdminTestRow>(tests: readonly T[], f: AdminFilters, lowAi: ReadonlySet<string>): T[] {
  return tests.filter((t) =>
    (!f.status || t.status === f.status)
    && (!f.grade || t.grade === f.grade)
    && (!f.province || t.province === f.province)
    && (!f.help || (t.flags !== null && helpLikely(t.flags)))
    && (!f.flagged || (t.flags !== null && t.flags.length > 0))
    && (!f.lowAi || lowAi.has(t.id)));
}

/** One stored answer (public.answers), as the admin reads it. */
export interface AnswerRecord {
  position: number;
  question_id: string;
  response: string;
  correct: boolean;
  misconception: string | null;
  time_ms: number;
  work_required: boolean;
  work_path: string | null;
  work_text: string | null;
}

/** One AI review of shown work (public.work_reviews, #68). score is numeric, so it can come back as a string. */
export interface ReviewRecord {
  question_id: string;
  error_type: string;
  kind: "slip" | "misunderstanding" | "none";
  comment: string;
  score: number | string;
  confidence: "high" | "low";
  model: string;
}

/** One answer beside its question, for the admin's answer table. */
export interface AnswerLine {
  /** 1-based, in test order. */
  number: number;
  questionId: string;
  /** Stage 1 (at the school grade) or stage 2 (after the route); null when the question is not in the stored test. */
  stage: 1 | 2 | null;
  prompt: string | null;
  level: Level | null;
  strand: Strand | null;
  rightAnswer: string | null;
  response: string;
  correct: boolean;
  /** "O1: Subtracts ...": the known mistake a coded wrong answer matches. */
  misconception: string | null;
  timeMs: number;
  /** Under TOO_FAST_MS: the help flags count these. */
  tooFast: boolean;
  work: { required: boolean; image: string | null; text: string | null };
  review: (Omit<ReviewRecord, "score"> & { score: number }) | null;
}

function misconceptionText(id: string | null): string | null {
  if (!id) return null;
  const known = MISCONCEPTIONS[id as MisconceptionId];
  return known ? `${id}: ${known.description}` : id;
}

/** The answers in test order, each with its question from the stored test and its AI review. */
export function answerLines(test: StoredTest, answers: readonly AnswerRecord[], reviews: readonly ReviewRecord[]): AnswerLine[] {
  const stage = new Map<string, { q: Question; stage: 1 | 2 }>();
  for (const q of test.stage1) stage.set(q.id, { q, stage: 1 });
  for (const q of [...test.stage2.up, ...test.stage2.stay, ...test.stage2.down]) stage.set(q.id, { q, stage: 2 });
  const reviewed = new Map(reviews.map((r) => [r.question_id, { ...r, score: Number(r.score) }]));
  return [...answers].sort((a, b) => a.position - b.position).map((a) => {
    const found = stage.get(a.question_id);
    return {
      number: a.position + 1,
      questionId: a.question_id,
      stage: found?.stage ?? null,
      prompt: found?.q.prompt ?? null,
      level: found?.q.level ?? null,
      strand: found?.q.strand ?? null,
      rightAnswer: found?.q.answer ?? null,
      response: a.response,
      correct: a.correct,
      misconception: misconceptionText(a.misconception),
      timeMs: a.time_ms,
      tooFast: a.time_ms < TOO_FAST_MS,
      work: { required: a.work_required, image: a.work_path, text: a.work_text },
      review: reviewed.get(a.question_id) ?? null,
    };
  });
}

/** One stored quick facts answer (public.fact_answers, #70). An empty response is a skip. */
export interface FactAnswerRecord {
  position: number;
  fact_id: string;
  response: string;
  correct: boolean;
  /** The server's time since the section started. */
  at_ms: number;
}

export interface FactLine {
  number: number;
  fact: string;
  rightAnswer: string | null;
  response: string;
  skipped: boolean;
  correct: boolean;
  atMs: number;
  /** Time since the answer before (or since the start, for the first). */
  tookMs: number;
}

/** The quick facts answers in order, each with its fact and the time it took. */
export function factLines(test: FactsTest, answers: readonly FactAnswerRecord[]): FactLine[] {
  const facts = new Map(test.facts.map((f) => [f.id, f]));
  let before = 0;
  return [...answers].sort((a, b) => a.position - b.position).map((a) => {
    const f = facts.get(a.fact_id);
    const line = {
      number: a.position + 1,
      fact: f ? `${f.a} ${f.op} ${f.b}` : a.fact_id,
      rightAnswer: f ? String(f.answer) : null,
      response: a.response,
      skipped: a.response === "",
      correct: a.correct,
      atMs: a.at_ms,
      tookMs: a.at_ms - before,
    };
    before = a.at_ms;
    return line;
  });
}

const PACIFIC = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Vancouver",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** A stored moment as "2026-10-11 10:55", Pacific time (Savar and Cedric are in BC); "-" for none. */
export function when(iso: string | null): string {
  if (!iso) return "-";
  const part = Object.fromEntries(PACIFIC.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${part.year}-${part.month}-${part.day} ${part.hour}:${part.minute}`;
}

/** "2.5 s" below a minute, else "4 min 10 s". */
export function duration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}

const HELP_TEXT: Record<HelpAnswer, string> = { yes: "Yes", "a-little": "A little", no: "No" };

/** The child's answer to "Did anyone help?" (assessments.help, #71). */
export const helpAnswerText = (help: HelpAnswer | null) => (help ? HELP_TEXT[help] : "Not asked");

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One help flag (#71) in plain words. numbers: question id to its number in the test (answerLines). */
export function flagText(flag: Flag, numbers: ReadonlyMap<string, number>): string {
  const q = (id: string) => String(numbers.get(id) ?? id);
  switch (flag.kind) {
    case "helped":
      return `Answered "${HELP_TEXT[flag.answer]}" to "Did anyone help?"`;
    case "too-fast":
      return `${plural(flag.questionIds.length, "answer")} under ${TOO_FAST_MS / 1000} s, ${flag.right} right: ${flag.questionIds.length === 1 ? "question" : "questions"} ${flag.questionIds.map(q).join(", ")}`;
    case "pause-then-perfect":
      return `${duration(flag.pauseMs)} on question ${q(flag.questionId)}, then ${PAUSE_WINDOW} right in a row (${flag.rightBefore} of ${PAUSE_WINDOW} right before)`;
  }
}

/** The filters as a query string for links ("" when none is set), the inverse of parseFilters. */
export function filterQuery(f: AdminFilters): string {
  const q = new URLSearchParams();
  if (f.status) q.set("status", f.status);
  if (f.grade) q.set("grade", String(f.grade));
  if (f.province) q.set("province", f.province);
  if (f.help) q.set("flag", "help");
  else if (f.flagged) q.set("flag", "any");
  if (f.lowAi) q.set("ai", "low");
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** A list page number from a GET form. Invalid values always use the first page. */
export function listOffset(query: Query, size: number): number {
  const raw = typeof query.page === "string" ? query.page : "1";
  const n = Number(raw);
  return /^\d+$/.test(raw) && Number.isSafeInteger(n) && n > 0 && n <= 100_000 ? (n - 1) * size : 0;
}
