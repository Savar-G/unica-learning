// How far a child got in a test, for the admin's live view: the question they are on, of how many, in which part, and
// since when. Pure: no network, database or clock (the caller passes `now`). Built only from what the server already
// stores while the child works (the answers, the serve time of each question #184, the break #185, the quick facts #70
// and the extra round #190), so the child's test page sends nothing more for it.
import { FACTS_SECONDS, testLength, type Route, type StoredTest } from "@/lib/assessment";
import type { AssessmentStatus } from "@/lib/test-api";

/** One test's records, as admin-store reads them. Times are ISO. */
export interface ProgressInput {
  status: AssessmentStatus;
  stored: StoredTest;
  route: Route | null;
  /** How many questions have an answer. */
  answered: number;
  /** The newest question the server served (#184); null before #184 or before the first serve. */
  lastShown: { position: number; at: string } | null;
  startedAt: string;
  lastAnswerAt: string | null;
  completedAt: string | null;
  /** The test closes at this time when no answer comes (#72). */
  resumeUntil: string;
  breakStartedAt: string | null;
  breakEndedAt: string | null;
  /** When the quick facts section started (#70); null when it did not. */
  factsStartedAt: string | null;
  factsAnswered: number;
  extraOfferedAt: string | null;
  extraSkippedAt: string | null;
  extraStartedAt: string | null;
  extraFinishedAt: string | null;
}

/** What the child is doing now. */
export type ProgressPhase =
  | "question" // a question is on the screen
  | "check" // the child checks a part's answers on the grid (#253)
  | "break" // the halfway break (D-083)
  | "facts" // the timed quick facts, or their start screen (#70)
  | "offer" // the extra round offer (#190)
  | "finishing" // the last step: "Did anyone help?" (#71)
  | "finished"
  | "closed"; // expired: no answer for 24 hours

export type ProgressPart = "Part 1" | "Part 2" | "Extra round";

export interface TestProgress {
  phase: ProgressPhase;
  /** The phase in plain words, as the admin reads it: "On question 26 of 42". */
  text: string;
  /** The same, short, for a table cell: "Q 26 of 42". */
  short: string;
  answered: number;
  /** Every question of the test: part 1, the routed part 2 (or the grade band's length before routing), and the extra round once taken. */
  total: number;
  /** Where part 2 starts (the halfway break), and where the extra round starts; for the bar. */
  part1: number;
  main: number;
  /** The question on the screen, or the one the child stopped at; null when every question has an answer. */
  current: { number: number; part: ProgressPart; prompt: string | null } | null;
  /** When the child reached what they are doing now. */
  since: string;
  /** The newest moment the server saw the child do something. */
  lastActivityAt: string;
  /** Quick facts answered, and whether the timed section is over; null when it did not start. */
  facts: { answered: number; done: boolean } | null;
  /** True while the child can still go on: the test is open and its deadline has not passed. */
  open: boolean;
}

/** The progress of the tests on a page at one moment (the server's clock), as the page renders it and the poll answers. */
export interface ProgressSnapshot { now: string; tests: Record<string, TestProgress> }

/** Every test's progress at `now`. */
export function progressSnapshot(inputs: ReadonlyMap<string, ProgressInput>, now: Date): ProgressSnapshot {
  const tests: Record<string, TestProgress> = {};
  for (const [id, input] of inputs) tests[id] = testProgress(input, now.getTime());
  return { now: now.toISOString(), tests };
}

const ms = (iso: string | null) => (iso ? Date.parse(iso) : -Infinity);
const newest = (...times: (string | null)[]) => times.reduce<string | null>((a, b) => (b && ms(b) > ms(a) ? b : a), null);

export function testProgress(t: ProgressInput, now: number): TestProgress {
  const part1 = t.stored.stage1.length;
  const main = testLength(t.stored, t.route);
  // The extra round counts once the child took it during the test (a round taken from the report is not live work).
  const tookExtra = t.extraStartedAt !== null && (t.completedAt === null || ms(t.extraStartedAt) < ms(t.completedAt));
  // A round the child stopped part way (a skip after the start) ends at its last answer.
  const stopped = tookExtra && t.extraSkippedAt !== null && ms(t.extraSkippedAt) >= ms(t.extraStartedAt);
  const extra = !tookExtra ? 0 : stopped ? Math.max(0, t.answered - main) : (t.stored.extra?.length ?? 0);
  const total = main + extra;
  const n = Math.min(t.answered, total);
  const factsDone = t.factsStartedAt !== null && now >= ms(t.factsStartedAt) + FACTS_SECONDS * 1000;
  const facts = t.factsStartedAt ? { answered: t.factsAnswered, done: factsDone } : null;
  const lastActivityAt = newest(t.startedAt, t.lastAnswerAt, t.lastShown?.at ?? null, t.breakStartedAt, t.breakEndedAt, t.factsStartedAt, t.extraOfferedAt, t.extraSkippedAt, t.extraStartedAt, t.extraFinishedAt, t.completedAt)!;

  const questions = [...t.stored.stage1, ...(t.route ? t.stored.stage2[t.route] : []), ...(tookExtra ? (t.stored.extra ?? []) : [])];
  const at = (position: number) => (position < total ? {
    number: position + 1,
    part: (position < part1 ? "Part 1" : position < main ? "Part 2" : "Extra round") as ProgressPart,
    prompt: questions[position]?.prompt ?? null,
  } : null);
  const base = { answered: n, total, part1, main, facts, lastActivityAt, current: at(n) };
  const of = (number: number) => `${number} of ${total}`;
  const shownNow = t.lastShown?.position === n ? t.lastShown.at : null;
  const onQuestion = (): TestProgress => ({ ...base, phase: "question", text: `On question ${of(n + 1)}`, short: `Q ${of(n + 1)}`, since: shownNow ?? t.lastAnswerAt ?? t.startedAt, open: true });

  if (t.status === "completed") return { ...base, current: null, phase: "finished", text: `Finished: ${n} of ${total} answered`, short: "Finished", since: t.completedAt ?? lastActivityAt, open: false };
  if (t.status === "expired" || now >= ms(t.resumeUntil)) {
    return { ...base, phase: "closed", text: n < total ? `Stopped at question ${of(n + 1)}` : `Stopped after the last question`, short: n < total ? `Stopped at Q ${n + 1}` : "Stopped at the end", since: t.resumeUntil, open: false };
  }
  const open = { ...base, open: true };

  // Part 1
  if (n < part1) return onQuestion();
  if (!t.route) return { ...open, current: null, phase: "check", text: "Checking the Part 1 answers", short: "Checking Part 1", since: t.lastAnswerAt ?? lastActivityAt };
  // Halfway: the break, then the quick facts, then the first Part 2 question (its serve is recorded after the facts).
  if (n === part1 && !shownNow) {
    const halfway = { ...open, current: null };
    if (t.factsStartedAt) {
      return factsDone
        ? { ...halfway, phase: "facts", text: `Quick facts done: ${t.factsAnswered} answered`, short: "Quick facts done", since: new Date(ms(t.factsStartedAt) + FACTS_SECONDS * 1000).toISOString() }
        : { ...halfway, phase: "facts", text: `Doing the quick facts: ${t.factsAnswered} answered`, short: "Quick facts", since: t.factsStartedAt };
    }
    if (t.breakStartedAt && !t.breakEndedAt) return { ...halfway, phase: "break", text: "On the halfway break", short: "On the break", since: t.breakStartedAt };
    if (t.breakEndedAt) return { ...halfway, phase: "facts", text: "On the quick facts start screen", short: "Quick facts next", since: t.breakEndedAt };
    return { ...halfway, phase: "break", text: "At the halfway break", short: "Halfway", since: t.lastAnswerAt ?? lastActivityAt };
  }
  // Part 2
  if (n < main) return onQuestion();
  if (!t.extraOfferedAt) return { ...open, current: null, phase: "check", text: "Checking the Part 2 answers", short: "Checking Part 2", since: t.lastAnswerAt ?? lastActivityAt };
  // The extra round
  if (tookExtra && !stopped && n < total) return onQuestion();
  if (!tookExtra && !t.extraSkippedAt) return { ...open, current: null, phase: "offer", text: "Deciding on the extra round", short: "Extra round offer", since: t.extraOfferedAt };
  if (tookExtra && !t.extraFinishedAt && !t.extraSkippedAt) return { ...open, current: null, phase: "check", text: "Checking the extra round answers", short: "Checking extra round", since: t.lastAnswerAt ?? lastActivityAt };
  return { ...open, current: null, phase: "finishing", text: "On the last step: \"Did anyone help?\"", short: "Last step", since: newest(t.extraSkippedAt, t.extraFinishedAt, t.lastAnswerAt) ?? lastActivityAt };
}
