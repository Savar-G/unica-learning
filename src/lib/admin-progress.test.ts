import { describe, expect, it } from "vitest";
import { checked } from "@/lib/assessment/scripted-child";
import { createSession, nextQuestion, startExtraRound, storedTest, submitAnswer, type Session } from "@/lib/assessment";
import { progressSnapshot, testProgress, type ProgressInput } from "@/lib/admin-progress";

// The admin's live view of a test: which question the child is on, of how many, in which part, and since when.
const T0 = Date.parse("2026-10-20T00:53:00Z");
const iso = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();
const NOW = T0 + 40 * 60_000;

/** A grade 7 test (21 questions in Part 1, then a routed Part 2) from seed 1. */
const grade7 = createSession({ grade: 7, province: "BC" }, 1);

/** A test with `answered` answers, the last one at minute 27, and the next question served then. */
function input(answered: number, over: Partial<ProgressInput> = {}): ProgressInput {
  return {
    status: "in_progress", stored: storedTest(grade7), route: answered > 21 ? "stay" : null, answered,
    lastShown: { position: answered, at: iso(27) }, startedAt: iso(0), lastAnswerAt: iso(27), completedAt: null,
    resumeUntil: iso(27 + 24 * 60), breakStartedAt: null, breakEndedAt: null, factsStartedAt: null, factsAnswered: 0,
    extraOfferedAt: null, extraSkippedAt: null, extraStartedAt: null, extraFinishedAt: null, ...over,
  };
}

describe("testProgress", () => {
  it("names the question on screen, its part and prompt, and how long it has been there", () => {
    const p = testProgress(input(25, { breakStartedAt: iso(16), breakEndedAt: iso(20), factsStartedAt: iso(21), factsAnswered: 37 }), NOW);
    expect(p).toMatchObject({ phase: "question", text: "On question 26 of 42", short: "Q 26 of 42", answered: 25, total: 42, part1: 21, main: 42, open: true, since: iso(27) });
    expect(p.current).toEqual({ number: 26, part: "Part 2", prompt: grade7.stage2.stay[4].prompt });
    expect(p.facts).toEqual({ answered: 37, done: true });
  });

  it("counts the grade band's length before Part 1 routes the test, and the routed form's length after", () => {
    expect(testProgress(input(5), NOW)).toMatchObject({ text: "On question 6 of 42", current: { number: 6, part: "Part 1", prompt: grade7.stage1[5].prompt } });
    expect(testProgress(input(30, { route: "up" }), NOW).total).toBe(21 + grade7.stage2.up.length);
  });

  it("falls back to the last answer when the question's serve was not recorded", () => {
    expect(testProgress(input(5, { lastShown: { position: 4, at: iso(20) } }), NOW).since).toBe(iso(27));
  });

  it("shows the Part 1 check grid once every Part 1 question has an answer and the test is not routed", () => {
    expect(testProgress(input(21), NOW)).toMatchObject({ phase: "check", text: "Checking the Part 1 answers", current: null });
  });

  it("follows the halfway break and the quick facts before the first Part 2 question", () => {
    const halfway = (over: Partial<ProgressInput>) => testProgress(input(21, { route: "stay", lastShown: { position: 20, at: iso(25) }, ...over }), NOW);
    expect(halfway({})).toMatchObject({ phase: "break", text: "At the halfway break", current: null });
    expect(halfway({ breakStartedAt: iso(28) })).toMatchObject({ phase: "break", text: "On the halfway break", since: iso(28) });
    expect(halfway({ breakStartedAt: iso(28), breakEndedAt: iso(32) })).toMatchObject({ phase: "facts", text: "On the quick facts start screen" });
    expect(halfway({ breakStartedAt: iso(28), breakEndedAt: iso(32), factsStartedAt: new Date(NOW - 20_000).toISOString(), factsAnswered: 9 }))
      .toMatchObject({ phase: "facts", text: "Doing the quick facts: 9 answered", facts: { answered: 9, done: false } });
    expect(halfway({ breakEndedAt: iso(32), factsStartedAt: iso(33), factsAnswered: 30 })).toMatchObject({ phase: "facts", text: "Quick facts done: 30 answered", since: iso(34) });
    expect(halfway({ breakEndedAt: iso(32), factsStartedAt: iso(33), lastShown: { position: 21, at: iso(35) } }))
      .toMatchObject({ phase: "question", text: "On question 22 of 42", current: { part: "Part 2" }, since: iso(35) });
  });

  it("shows the Part 2 check, then the extra round offer", () => {
    expect(testProgress(input(42), NOW)).toMatchObject({ phase: "check", text: "Checking the Part 2 answers" });
    expect(testProgress(input(42, { extraOfferedAt: iso(30) }), NOW)).toMatchObject({ phase: "offer", since: iso(30) });
    expect(testProgress(input(42, { extraOfferedAt: iso(30), extraSkippedAt: iso(31) }), NOW)).toMatchObject({ phase: "finishing", total: 42 });
  });

  describe("with the extra round taken", () => {
    let full: Session = grade7;
    for (let q = nextQuestion(full); q; q = nextQuestion(full)) {
      full = checked(submitAnswer(full, { questionId: q.id, response: full.answers.length === 0 ? "no idea" : q.answer, timeMs: 20_000 }));
    }
    const route = full.route!;
    const main = 21 + full.stage2[route].length;
    const round = startExtraRound(full);
    const extra = round.extra!.length;
    const taken = (answered: number, over: Partial<ProgressInput> = {}) =>
      testProgress(input(answered, { stored: storedTest(round), route, extraOfferedAt: iso(20), extraStartedAt: iso(21), ...over }), NOW);

    it("counts the round's questions in the total and names the round's question on screen", () => {
      expect(taken(main + 1)).toMatchObject({ phase: "question", total: main + extra, current: { number: main + 2, part: "Extra round", prompt: round.extra![1].prompt } });
    });

    it("shows the round's check grid, then the last step", () => {
      expect(taken(main + extra)).toMatchObject({ phase: "check", text: "Checking the extra round answers" });
      expect(taken(main + extra, { extraFinishedAt: iso(30) })).toMatchObject({ phase: "finishing", since: iso(30) });
    });

    it("ends a round the child stopped part way at its last answer", () => {
      expect(taken(main + 1, { extraSkippedAt: iso(26) })).toMatchObject({ phase: "finishing", total: main + 1 });
    });

    it("leaves out a round taken from the report after the test was completed", () => {
      expect(taken(main, { status: "completed", completedAt: iso(15), extraStartedAt: iso(60) })).toMatchObject({ phase: "finished", total: main, open: false });
    });
  });

  it("closes a test whose deadline passed, at the question the child stopped on", () => {
    const p = testProgress(input(25), Date.parse(iso(27 + 24 * 60)));
    expect(p).toMatchObject({ phase: "closed", text: "Stopped at question 26 of 42", open: false, current: { number: 26 } });
    expect(testProgress(input(25, { status: "expired" }), NOW).phase).toBe("closed");
  });

  it("reports a finished test with its count of answers", () => {
    expect(testProgress(input(42, { status: "completed", completedAt: iso(39) }), NOW)).toMatchObject({ phase: "finished", text: "Finished: 42 of 42 answered", current: null, open: false });
  });

  it("takes the newest moment of any record as the last activity", () => {
    expect(testProgress(input(21, { route: "stay", lastShown: null, breakStartedAt: iso(29), breakEndedAt: iso(33) }), NOW).lastActivityAt).toBe(iso(33));
  });
});

describe("progressSnapshot", () => {
  it("gives each test's progress by id at the server's time", () => {
    const now = new Date(NOW);
    expect(progressSnapshot(new Map([["a", input(3)]]), now)).toEqual({ now: now.toISOString(), tests: { a: testProgress(input(3), NOW) } });
  });
});
