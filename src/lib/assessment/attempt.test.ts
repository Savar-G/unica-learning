import { describe, expect, it } from "vitest";
import { attemptState, decideStart, recordAnswer, startAttempt, startState, type Attempt } from "@/lib/assessment";

// Stop, resume and retake (#72). The server passes every time; these tests use fixed instants.
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 10, 18, 0); // 2026-10-10 18:00 UTC

/** An attempt started at `at` and scored `after` later. */
const completed = (id: string, at: number, after = HOUR): Attempt => ({ ...startAttempt(id, at), status: "completed", completedAt: at + after });

describe("the start screen", () => {
  it("offers a first test to a child with none", () => {
    expect(startState([], T0)).toEqual({ kind: "start", retake: false });
  });

  it("does not offer a new test until 30 days after the last completed one, and gives the date it opens", () => {
    const done = completed("a1", T0); // scored at 2026-10-10 19:00 UTC
    const opens = Date.UTC(2026, 10, 9, 19, 0); // 30 days later: 2026-11-09 19:00 UTC
    expect(startState([done], T0 + 10 * DAY)).toEqual({ kind: "wait", completedAt: T0 + HOUR, opensAt: opens });
    expect(startState([done], opens - 1)).toEqual({ kind: "wait", completedAt: T0 + HOUR, opensAt: opens });
    expect(startState([done], opens)).toEqual({ kind: "start", retake: true });
  });

  it("offers to continue an open test, and says until when", () => {
    const open = recordAnswer(startAttempt("a1", T0), T0 + 3 * HOUR);
    expect(startState([open], T0 + 10 * HOUR)).toEqual({ kind: "resume", attemptId: "a1", resumeUntil: T0 + 27 * HOUR });
  });

  it("offers to finish a test with every answer in, before or after its 24 hours, instead of a new test", () => {
    const answeredAll = { ...recordAnswer(startAttempt("a1", T0), T0 + HOUR), answeredAll: true };
    expect(startState([answeredAll], T0 + 2 * HOUR)).toEqual({ kind: "finish", attemptId: "a1" });
    expect(startState([answeredAll], T0 + 3 * DAY)).toEqual({ kind: "finish", attemptId: "a1" });
  });

  it("shows a test that ran out of time as expired, whether or not the server has marked it yet", () => {
    const open = startAttempt("a1", T0);
    expect(startState([open], T0 + 24 * HOUR + 1)).toEqual({ kind: "expired", attemptId: "a1" });
    expect(startState([{ ...open, status: "expired" }], T0 + HOUR)).toEqual({ kind: "expired", attemptId: "a1" });
  });

  it("shows a retake that ran out of time as expired once the 30 days are over", () => {
    const first = completed("a1", T0);
    const retake = startAttempt("a2", T0 + 40 * DAY);
    expect(startState([first, retake], T0 + 42 * DAY)).toEqual({ kind: "expired", attemptId: "a2" });
  });

  it("offers a new test after an expired one is followed by a completed one 30 days back", () => {
    const lost = { ...startAttempt("a1", T0), status: "expired" as const };
    const done = completed("a2", T0 + 2 * DAY);
    expect(startState([lost, done], T0 + 33 * DAY)).toEqual({ kind: "start", retake: true });
  });
});

describe("a request to start a test", () => {
  it("creates the first test", () => {
    expect(decideStart([], T0, { restart: false })).toEqual({ action: "create", expire: null });
  });

  it("returns the open test instead of a second one", () => {
    const open = startAttempt("a1", T0);
    expect(decideStart([open], T0 + HOUR, { restart: false })).toEqual({ action: "resume", attemptId: "a1" });
    expect(decideStart([open], T0 + HOUR, { restart: true })).toEqual({ action: "resume", attemptId: "a1" });
  });

  it("refuses to continue a test that ran out of time, so the family sees it expired", () => {
    const open = startAttempt("a1", T0);
    expect(decideStart([open], T0 + 25 * HOUR, { restart: false })).toEqual({ action: "refuse", error: "expired" });
  });

  it("on start again, marks the stale test expired and creates a new one", () => {
    const open = startAttempt("a1", T0);
    expect(decideStart([open], T0 + 25 * HOUR, { restart: true })).toEqual({ action: "create", expire: "a1" });
    expect(decideStart([{ ...open, status: "expired" }], T0 + 25 * HOUR, { restart: true })).toEqual({ action: "create", expire: null });
  });

  it("returns a test with every answer in, even after 24 hours, so it can be scored", () => {
    const open = { ...startAttempt("a1", T0), answeredAll: true };
    expect(decideStart([open], T0 + 3 * DAY, { restart: true })).toEqual({ action: "resume", attemptId: "a1" });
  });

  it("refuses a new test inside the 30 days, with the date it opens", () => {
    const done = completed("a1", T0);
    expect(decideStart([done], T0 + 5 * DAY, { restart: true })).toEqual({ action: "refuse", error: "retake_closed", opensAt: T0 + HOUR + 30 * DAY });
    expect(decideStart([done], T0 + HOUR + 30 * DAY, { restart: false })).toEqual({ action: "create", expire: null });
  });
});

describe("a stopped test", () => {
  it("continues until 24 hours after the last answer, then expires", () => {
    let attempt: Attempt = startAttempt("a1", T0);
    attempt = recordAnswer(attempt, T0 + 2 * HOUR);
    expect(attemptState(attempt, T0 + 25 * HOUR)).toBe("open");
    expect(attemptState(attempt, T0 + 26 * HOUR)).toBe("open");
    expect(attemptState(attempt, T0 + 26 * HOUR + 1)).toBe("expired");
  });

  it("with no answer yet expires 24 hours after it started", () => {
    const attempt = startAttempt("a1", T0);
    expect(attemptState(attempt, T0 + 24 * HOUR)).toBe("open");
    expect(attemptState(attempt, T0 + 24 * HOUR + 1)).toBe("expired");
  });

  it("records each answer's time, and only an answer moves the deadline", () => {
    const answered = recordAnswer(startAttempt("a1", T0), T0 + HOUR);
    expect(answered.lastAnswerAt).toBe(T0 + HOUR);
    expect(answered.resumeUntil).toBe(T0 + 25 * HOUR);
    // Opening the test again is not an answer: the start request hands it back unchanged.
    expect(decideStart([answered], T0 + 20 * HOUR, { restart: false })).toEqual({ action: "resume", attemptId: "a1" });
    expect(attemptState(answered, T0 + 25 * HOUR + 1)).toBe("expired");
  });

  it("cannot take an answer once it expired or was scored", () => {
    const attempt = startAttempt("a1", T0);
    expect(() => recordAnswer(attempt, T0 + 24 * HOUR + 1)).toThrow();
    expect(() => recordAnswer({ ...attempt, status: "expired" }, T0 + HOUR)).toThrow();
    expect(() => recordAnswer({ ...attempt, status: "completed", completedAt: T0 + HOUR }, T0 + HOUR)).toThrow();
  });

  it("with every answer in never expires: it only waits to be scored", () => {
    const attempt = { ...startAttempt("a1", T0), answeredAll: true };
    expect(attemptState(attempt, T0 + 30 * 24 * HOUR)).toBe("open");
  });

  it("keeps a stored status: expired stays expired, completed stays completed", () => {
    const attempt = startAttempt("a1", T0);
    expect(attemptState({ ...attempt, status: "expired" }, T0 + HOUR)).toBe("expired");
    expect(attemptState({ ...attempt, status: "completed", completedAt: T0 + HOUR }, T0 + 99 * HOUR)).toBe("completed");
  });
});

// #189 (spec #181): when more than 30% of the answers were very fast, the result may not be reliable, so the report
// offers a new test at once, without the 30-day wait.
describe("a new test after a result that may not be reliable", () => {
  it("opens at once when the last completed test may not be reliable", () => {
    const rushed = { ...completed("a1", T0), unreliable: true };
    expect(startState([rushed], T0 + 2 * HOUR)).toEqual({ kind: "start", retake: true });
    expect(decideStart([rushed], T0 + 2 * HOUR, { restart: false })).toEqual({ action: "create", expire: null });
  });

  // Orchestrator decision (D-108): the new test at once comes at most once per 30 days. An unreliable latest test opens
  // a new test at once only when no other test was completed in the 30 days before it.
  it("waits 30 days after a second unreliable test that followed the first within 30 days", () => {
    const first = { ...completed("a1", T0), unreliable: true }; // scored T0 + 1 h
    const second = { ...completed("a2", T0 + 2 * HOUR), unreliable: true }; // scored T0 + 3 h, the new test at once
    expect(startState([first, second], T0 + 4 * HOUR)).toEqual({ kind: "wait", completedAt: T0 + 3 * HOUR, opensAt: T0 + 3 * HOUR + 30 * DAY });
    expect(decideStart([first, second], T0 + 4 * HOUR, { restart: false })).toEqual({ action: "refuse", error: "retake_closed", opensAt: T0 + 3 * HOUR + 30 * DAY });
  });

  it("opens at once when the test before the unreliable one was completed 30 days or more before it, and not 1 ms less", () => {
    const rushedAt = T0 + 40 * DAY;
    const rushed = { ...completed("a2", rushedAt - HOUR), unreliable: true }; // scored at rushedAt
    const longBefore = completed("a1", rushedAt - 30 * DAY - HOUR); // scored exactly 30 days before
    const justInside = completed("a1", rushedAt - 30 * DAY - HOUR + 1); // scored 30 days less 1 ms before
    expect(startState([longBefore, rushed], rushedAt + HOUR)).toEqual({ kind: "start", retake: true });
    expect(startState([justInside, rushed], rushedAt + HOUR)).toMatchObject({ kind: "wait", opensAt: rushedAt + 30 * DAY });
  });

  it("waits 30 days after a reliable test, even when an earlier one was not", () => {
    const rushed = { ...completed("a1", T0), unreliable: true };
    const retake = completed("a2", T0 + DAY);
    expect(startState([rushed, retake], T0 + 3 * DAY)).toMatchObject({ kind: "wait", completedAt: T0 + DAY + HOUR });
  });
});
