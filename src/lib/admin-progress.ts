// How far a child got in a test, for the admin's live view: the next question to answer, of how many, in which part,
// and since when. Pure: no network, database or clock (the caller passes `now`). Built only from what the server already
// stores while the child works (the answers, the serve time of each question #184, the break #185 and the quick facts
// #70), so the child's test page sends nothing more for it.
//
// The server sees answers and a few screens, not every screen: a child can go Back to an answered question, or open one
// from a check grid, and nothing is stored. So the view names the next question to answer, not the one on screen, and
// says "or on the last step" where the records cannot tell a check grid from the end.
import { FACTS_SECONDS, type Route } from "@/lib/assessment";
import type { AssessmentStatus } from "@/lib/test-api";

/** One test's records, as public.admin_test_progress() returns them (migration add_admin_test_progress). Times are ISO. */
export interface ProgressInput {
  status: AssessmentStatus;
  route: Route | null;
  /** How many questions each stored part has. */
  lengths: { stage1: number; up: number; stay: number; down: number };
  /**
   * How many questions have an answer. D-145: two finished tests also have answers to the removed extra round (#190);
   * the count is capped at the test's length, so they never show.
   */
  answered: number;
  /** The prompt of the next question to answer (the one at place `answered`); null when there is none. */
  nextPrompt: string | null;
  /** The newest question the server served (#184); null before #184 or before the first serve. */
  lastShown: { position: number; at: string } | null;
  startedAt: string;
  lastAnswerAt: string | null;
  completedAt: string | null;
  /** The test closes at this time when no answer comes (#72), unless every answer is in. */
  resumeUntil: string;
  breakStartedAt: string | null;
  breakEndedAt: string | null;
  /** When the quick facts section started (#70); null when it did not. */
  factsStartedAt: string | null;
  /** Quick facts answered, skips not counted. */
  factsAnswered: number;
  /** Quick facts with a response, skips counted, and the facts drawn: the section ends early once all are tried. */
  factsTried: number;
  factsDrawn: number;
}

/** What the child is doing now, as far as the records tell. */
export type ProgressPhase =
  | "question" // a question to answer
  | "check" // checking a part's answers on the grid (#253), or past it on the last step when the records cannot tell
  | "break" // the halfway break (D-083)
  | "facts" // the timed quick facts, or their start screen (#70)
  | "finished"
  | "closed"; // expired: no answer for 24 hours

export type ProgressPart = "Part 1" | "Part 2";

export interface TestProgress {
  phase: ProgressPhase;
  /** The phase in plain words, as the admin reads it: "Next question: 26 of 42". */
  text: string;
  /** The same, short, for a table cell: "Next: Q 26 of 42". */
  short: string;
  answered: number;
  /**
   * Every question of the test, as the child's screen counts them: part 1 and the routed part 2 (the longest stored form
   * before routing, as testStep).
   */
  total: number;
  /** Where part 2 starts (the halfway break); for the bar. */
  part1: number;
  /** The next question to answer; null when the child is not on a question (a grid, the break, the facts, the end). */
  current: { number: number; part: ProgressPart; prompt: string | null } | null;
  /** When the child reached what they are doing now, and what that moment was: "shown", "last answer". */
  since: string;
  sinceText: string;
  /** The newest moment the server saw the child do something. */
  lastActivityAt: string;
  /** Quick facts answered, and whether the timed section is over; null when it did not start. */
  facts: { answered: number; done: boolean } | null;
  /** True while the child can still go on. */
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
  const { lengths: l } = t;
  const part1 = l.stage1;
  // Before routing, the child's screen counts the longest stored form (testStep); once routed, the routed one.
  const total = part1 + (t.route ? l[t.route] : Math.max(l.up, l.stay, l.down));
  const n = Math.min(t.answered, total);
  // A test from before the stage 1 lock can have Part 2 answers and no stored route (restoreSession routes it by its
  // Part 1 answers). Its route is not known here: it counts as Part 2, without a prompt, and never as closed too early.
  const legacy = !t.route && t.answered > part1;
  // Every answer is in: the test never expires (test-attempt.ts).
  const allDone = t.route ? t.answered >= total : legacy && t.answered >= part1 + Math.min(l.up, l.stay, l.down);
  // The facts end when the time is up, or earlier when every drawn fact has a response (factsStep).
  const factsEnd = t.factsStartedAt ? ms(t.factsStartedAt) + FACTS_SECONDS * 1000 : null;
  const factsEarly = t.factsDrawn > 0 && t.factsTried >= t.factsDrawn;
  const factsDone = factsEnd !== null && (factsEarly || now >= factsEnd);
  const facts = factsEnd === null ? null : { answered: t.factsAnswered, done: factsDone };
  const lastActivityAt = newest(t.startedAt, t.lastAnswerAt, t.lastShown?.at ?? null, t.breakStartedAt, t.breakEndedAt, t.factsStartedAt, t.completedAt)!;

  const next = n < total && (n < part1 || t.route || legacy) ? {
    number: n + 1,
    part: (n < part1 ? "Part 1" : "Part 2") as ProgressPart,
    prompt: t.nextPrompt,
  } : null;
  const of = (number: number) => `${number} of ${total}`;
  const shownNow = t.lastShown?.position === n ? t.lastShown.at : null;
  const lastAnswer = { since: t.lastAnswerAt ?? t.startedAt, sinceText: t.lastAnswerAt ? "last answer" : "started" };
  const base = { answered: n, total, part1, facts, lastActivityAt, current: null, open: true };
  const onQuestion = (): TestProgress => ({
    ...base, phase: "question", current: next, text: `Next question: ${of(n + 1)}`, short: `Next: Q ${of(n + 1)}`,
    ...(shownNow ? { since: shownNow, sinceText: "shown" } : lastAnswer),
  });

  if (t.status === "completed") return { ...base, open: false, phase: "finished", text: `Finished: ${n} of ${total} answered`, short: "Finished", since: t.completedAt ?? lastActivityAt, sinceText: "finished" };
  if (t.status === "expired" || (now >= ms(t.resumeUntil) && !allDone)) {
    return {
      ...base, open: false, phase: "closed", current: next, since: t.resumeUntil, sinceText: "closed",
      text: next ? `Stopped before question ${of(n + 1)}` : "Stopped", short: next ? `Stopped before Q ${n + 1}` : "Stopped",
    };
  }

  // Part 1
  if (n < part1) return onQuestion();
  if (!t.route && !legacy) return { ...base, phase: "check", text: "Checking the Part 1 answers", short: "Checking Part 1", ...lastAnswer };
  // Halfway: the break, then the quick facts, then the first Part 2 question (its serve is recorded after the facts).
  if (n === part1 && !shownNow) {
    if (factsEnd !== null && !factsDone) return { ...base, phase: "facts", text: `Doing the quick facts: ${t.factsAnswered} answered`, short: "Quick facts", since: t.factsStartedAt!, sinceText: "started" };
    // After the facts the serve of the next question may be missing (a lost write), so it is named as next, not on screen.
    if (factsEnd !== null) {
      return { ...base, phase: "facts", current: next, text: `Quick facts done (${t.factsAnswered} answered). Next question: ${of(n + 1)}`, short: `Facts done, next Q ${n + 1}`, ...(now >= factsEnd ? { since: new Date(factsEnd).toISOString(), sinceText: "facts ended" } : { since: t.factsStartedAt!, sinceText: "facts started" }) };
    }
    if (t.breakStartedAt && !t.breakEndedAt) return { ...base, phase: "break", text: "On the halfway break", short: "On the break", since: t.breakStartedAt, sinceText: "break started" };
    if (t.breakEndedAt) return { ...base, phase: "facts", text: "On the quick facts start screen", short: "Quick facts next", since: t.breakEndedAt, sinceText: "break ended" };
    return { ...base, phase: "break", text: "At the halfway break", short: "Halfway", ...lastAnswer };
  }
  // Part 2. "Done checking" on Part 2 writes nothing, so the grid and the last step look the same.
  if (n < total) return onQuestion();
  return { ...base, phase: "check", text: "Checking the Part 2 answers, or on the last step", short: "Checking or finishing", ...lastAnswer };
}
