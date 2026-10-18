import { describe, expect, it } from "vitest";
import { checked } from "@/lib/assessment/scripted-child";
import { comparisonFor, createSession, finish, nextQuestion, restoreSession, storedTest, submitAnswer, type ComparisonTest, type Placement, type Submission } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "./scripted-child";

const placement = takeTest({ grade: 4, province: "BC" }, 101, knowsUpTo(4)).placement;
function test(id: string, value: Placement = placement): ComparisonTest {
  return { id, childId: id, status: "completed", completedAt: "2026-10-11T12:00:00.000Z", email: "parent@family.ca", placement: value };
}
const cohort = (n: number) => Array.from({ length: n }, (_, i) => test(`test-${i}`));

describe("comparison among children who took this test", () => {
  it("uses the same measured placement after submitted answers restore a public session", () => {
    let session = createSession({ grade: 4, province: "BC" }, 101);
    const source = storedTest(session);
    const submissions: Submission[] = [];
    for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
      const answer = { questionId: q.id, response: q.level <= 4 ? q.answer : "not known", timeMs: 20_000 };
      submissions.push(answer);
      session = checked(submitAnswer(session, answer));
    }
    const rebuilt = restoreSession(JSON.parse(JSON.stringify(source)), submissions);
    expect(finish(rebuilt)).toEqual(finish(session));
    const tests = [...cohort(399), test("restored", finish(rebuilt))];
    expect(comparisonFor({ assessmentId: "restored", tests })).toEqual({ stage: "percentile", n: 400, percentile: 50 });
  });
  it("uses measured placements at the exact stage boundaries, with all ties in the middle", () => {
    const compare = (n: number) => comparisonFor({ assessmentId: "test-0", tests: cohort(n) });
    expect(compare(99)).toEqual({ stage: "scale", n: 99 });
    expect(compare(100)).toEqual({ stage: "bands", n: 100, band: "middle" });
    expect(compare(399)).toEqual({ stage: "bands", n: 399, band: "middle" });
    expect(compare(400)).toEqual({ stage: "percentile", n: 400, percentile: 50 });
  });

  it("ranks working level before share right, and share at that level before stage 1", () => {
    const value = (workingLevel: Placement["workingLevel"], correct: number, total: number, stage1 = 0): Placement =>
      ({ ...placement, workingLevel, levels: [{ level: workingLevel, correct, total }], stage1: { correct: stage1, total: 18 } });
    const tests = [test("subject", value(4, 8, 10, 18)),
      ...Array.from({ length: 150 }, (_, i) => test(`lower-level-${i}`, value(3, 10, 10, 18))),
      ...Array.from({ length: 100 }, (_, i) => test(`lower-share-${i}`, value(4, 7, 10, 18))),
      ...Array.from({ length: 100 }, (_, i) => test(`equal-share-${i}`, value(4, 16, 20, 0))),
      ...Array.from({ length: 49 }, (_, i) => test(`higher-level-${i}`, value(5, 7, 10, 0)))];
    // 250 below, 101 tied including this child, 49 above: midpoint 75.125%, rounded to 75.
    expect(comparisonFor({ assessmentId: "subject", tests })).toEqual({ stage: "percentile", n: 400, percentile: 75 });
    expect(comparisonFor({ assessmentId: "equal-share-0", tests })).toEqual({ stage: "percentile", n: 400, percentile: 75 });
  });

  it.each(["lower", "middle", "upper"] as const)("places a child in the %s band", (band) => {
    const value = (workingLevel: Placement["workingLevel"]): Placement => ({ ...placement, workingLevel });
    const subject = test("subject", value(band === "lower" ? 3 : band === "middle" ? 4 : 5));
    expect(comparisonFor({ assessmentId: "subject", tests: [subject, ...cohort(99)] })).toEqual({ stage: "bands", n: 100, band });
  });

  it("uses the unrounded midpoint for quarter boundaries", () => {
    const value = (workingLevel: Placement["workingLevel"]): Placement => ({ ...placement, workingLevel });
    const tests = Array.from({ length: 100 }, (_, i) => test(`t-${i}`, value(i < 24 ? 3 : i < 26 ? 4 : 5)));
    expect(comparisonFor({ assessmentId: "t-24", tests })).toEqual({ stage: "bands", n: 100, band: "middle" }); // exact 25
    const upper = Array.from({ length: 100 }, (_, i) => test(`u-${i}`, value(i < 74 ? 3 : i < 76 ? 4 : 5)));
    expect(comparisonFor({ assessmentId: "u-74", tests: upper })).toEqual({ stage: "bands", n: 100, band: "upper" }); // exact 75
  });

  it("selects the latest completed test before excluding help, without restoring an older test", () => {
    const tests = cohort(100);
    tests.push({ ...test("new", { ...placement, flags: [{ kind: "helped", answer: "yes" }] }), childId: "test-1", completedAt: "2026-10-12T12:00:00Z" });
    tests.push({ ...test("unfinished"), childId: "test-2", status: "in_progress", completedAt: null, placement: null });
    expect(comparisonFor({ assessmentId: "test-0", tests })).toEqual({ stage: "scale", n: 99 });
    expect(comparisonFor({ assessmentId: "test-1", tests })).toEqual({ stage: "scale", n: 99 });
    expect(comparisonFor({ assessmentId: "new", tests })).toEqual({ stage: "scale", n: 99 });
    expect(comparisonFor({ assessmentId: "test-0", tests: [...tests].reverse() })).toEqual({ stage: "scale", n: 99 });
  });

  it("does not restore an older grade when the latest completed test is in another grade", () => {
    const tests = [...cohort(100), { ...test("new-grade", { ...placement, grade: 5 }), childId: "test-1", completedAt: "2026-10-12T12:00:00Z" }];
    expect(comparisonFor({ assessmentId: "test-0", tests })).toEqual({ stage: "scale", n: 99 });
  });

  it("uses one completed test per child, with a deterministic ID tie break for equal completion times", () => {
    const tests = cohort(100);
    tests.push({ ...test("zz-latest"), childId: "test-0" });
    expect(comparisonFor({ assessmentId: "zz-latest", tests })).toEqual({ stage: "bands", n: 100, band: "middle" });
    expect(comparisonFor({ assessmentId: "test-0", tests: [...tests].reverse() })).toEqual({ stage: "scale", n: 100 });
  });

  it("excludes domain and named test accounts, but not similar domains", () => {
    const tests = [...cohort(98),
      { ...test("lookalike"), email: "a@myexample.com" }, { ...test("real"), email: "a@resend.dev.ca" },
      { ...test("qa"), email: " QA@EXAMPLE.COM " }, { ...test("delivered"), email: "delivered@resend.dev" },
      { ...test("subdomain"), email: "a@sub.example.com" }, { ...test("named"), email: " NAMED@FAMILY.CA " }];
    expect(comparisonFor({ assessmentId: "test-0", tests, excludedEmails: ["named@family.ca"] })).toEqual({ stage: "bands", n: 100, band: "middle" });
    expect(comparisonFor({ assessmentId: "named", tests, excludedEmails: ["named@family.ca"] })).toEqual({ stage: "scale", n: 100 });
  });

  it("uses helpLikely rather than excluding all timing flags", () => {
    const tests = [...cohort(99),
      test("fast-wrong", { ...placement, flags: [{ kind: "too-fast", questionIds: ["q"], right: 0 }] }),
      test("fast-right", { ...placement, flags: [{ kind: "too-fast", questionIds: ["q", "r", "s"], right: 3 }] }),
      test("pause", { ...placement, flags: [{ kind: "pause-then-perfect", questionId: "q", pauseMs: 200_000, rightBefore: 0 }] }),
      test("little-help", { ...placement, flags: [{ kind: "helped", answer: "a-little" }] })];
    expect(comparisonFor({ assessmentId: "fast-wrong", tests })).toEqual({ stage: "bands", n: 100, band: "middle" });
  });

  it("ranks estimated levels without inventing an accuracy at an untested level", () => {
    const estimate: Placement = { ...placement, workingLevel: 3, confidence: "low", levels: [{ level: 4, correct: 0, total: 18 }] };
    const measured: Placement = { ...placement, workingLevel: 3, levels: [{ level: 3, correct: 7, total: 10 }] };
    const tests = [test("estimate", estimate), ...Array.from({ length: 99 }, (_, i) => test(`measured-${i}`, measured))];
    expect(comparisonFor({ assessmentId: "estimate", tests })).toEqual({ stage: "bands", n: 100, band: "lower" });
  });

  it("returns no comparison for an absent subject or noncompleted source", () => {
    const tests = [...cohort(400), { ...test("expired"), status: "expired" }];
    expect(comparisonFor({ assessmentId: "missing", tests })).toEqual({ stage: "scale", n: 0 });
    expect(comparisonFor({ assessmentId: "expired", tests })).toEqual({ stage: "scale", n: 400 });
  });
});
