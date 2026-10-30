import { describe, expect, it } from "vitest";
import { learnerProfile, type LearnerProfile } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import { childProfileFacts, type ChildProfileInput } from "@/lib/child-profile";
import type { LearningEvent } from "@/lib/learning-events";

// The child's profile facts (#303, spec #295) through the pure builder: the latest assessment profile plus every
// learning event, by BC standard.

const PARENT = "00000000-0000-4000-8000-0000000000a1";
const CHILD = "00000000-0000-4000-8000-0000000000c1";
const WORKBOOK = "00000000-0000-4000-8000-0000000000b1";

let next = 0;
/** One event on a workbook question of standard 3.3, from a call. */
const event = (over: Partial<LearningEvent> = {}): LearningEvent => {
  next += 1;
  return {
    id: `00000000-0000-4000-8000-${String(next).padStart(12, "0")}`,
    key: `call:${next}`,
    parentId: PARENT,
    childId: CHILD,
    source: "call",
    question: { source: "workbook", workbookId: WORKBOOK, page: 1, question: next },
    skill: { standard: "3.3", skills: [] },
    result: "right",
    stuckStep: null,
    mistake: null,
    hints: 0,
    timeMs: 30_000,
    occurredAt: `2026-10-29T16:${String(next % 60).padStart(2, "0")}:00.000Z`,
    evidence: { kind: "call", id: "call-1" },
    ...over,
  };
};

const TEST = "00000000-0000-4000-8000-0000000000e1";
/** A finished Grade 3 BC test of a child who knows everything up to Grade 2: struggles at Grade 3. */
const { asked, placement } = takeTest({ grade: 3, province: "BC" }, 7, knowsUpTo(2));
const BASE: LearnerProfile = learnerProfile({
  placement,
  answers: asked.map((q) => ({
    question: q, response: q.level <= 2 ? q.answer : "no idea", correct: q.level <= 2, misconception: null,
    timeMs: 20_000, work: { required: false, drawing: false, typed: false }, readAloud: null, away: null,
  })),
  help: "no",
  learning: null,
})!;
const assessment = { assessmentId: TEST, completedAt: "2026-10-20T18:00:00.000Z", buildId: "build-1", profile: BASE };
/** A struggle of the test, with its tally there. */
const STRUGGLE = BASE.struggles[0];

const input = (over: Partial<ChildProfileInput> = {}): ChildProfileInput => ({ grade: 3, learning: null, assessment: null, events: [], ...over });
const standard = (code: string, i: ChildProfileInput) => childProfileFacts(i)?.standards.find((s) => s.code === code);

describe("the child's profile facts", () => {
  it("counts a right answer with help as not yet secure", () => {
    const helped = [1, 2, 3, 4].map(() => event({ result: "right_with_help", hints: 2, stuckStep: "tens" }));
    const s = standard("3.3", input({ events: helped }));
    expect(s).toMatchObject({ code: "3.3", correct: 0, total: 4, status: "needs-attention" });
    expect(s?.events).toMatchObject({ right: 0, rightWithHelp: 4, hints: 8, stuckSteps: ["tens"] });

    const alone = [1, 2, 3, 4].map(() => event());
    expect(standard("3.3", input({ events: alone }))).toMatchObject({ correct: 4, total: 4, status: "secure" });
  });

  it("combines the assessment profile with events from calls and marked pages, each linked to its evidence", () => {
    const call = event({ source: "call", skill: { standard: STRUGGLE.code, skills: [] } });
    const marked = event({ source: "marking", result: "wrong", mistake: "O3", evidence: { kind: "scan", id: "scan-1" }, skill: { standard: STRUGGLE.code, skills: [] } });
    const blank = event({ source: "marking", result: "blank", evidence: { kind: "scan", id: "scan-1" }, skill: { standard: STRUGGLE.code, skills: [] } });
    const s = standard(STRUGGLE.code, input({ assessment, events: [call, marked, blank] }));
    expect(s).toMatchObject({
      correct: STRUGGLE.correct + 1,
      total: STRUGGLE.total + 3,
      assessment: { correct: STRUGGLE.correct, total: STRUGGLE.total, status: STRUGGLE.status },
      events: { right: 1, rightWithHelp: 0, wrong: 1, blank: 1, mistakes: ["O3"], sources: { call: 1, marking: 2, assessment: 0 } },
      evidence: { assessmentId: TEST, events: [call.id, marked.id, blank.id] },
    });
    // A standard the test asked and no event touched keeps the test's tally.
    const tested = BASE.standards.find((x) => x.code !== STRUGGLE.code)!;
    expect(standard(tested.code, input({ assessment, events: [call] }))).toMatchObject({
      correct: tested.correct, total: tested.total, status: tested.status, evidence: { assessmentId: TEST, events: [] },
    });
  });

  it("does not count the answers of the assessment profile's own test twice", () => {
    const OLDER = "00000000-0000-4000-8000-0000000000e0";
    const onStruggle = { skill: { standard: STRUGGLE.code, skills: [] } };
    // The base test's answers, written as events (the backfill): already in the assessment profile.
    const backfilled = [1, 2].map(() => event({ ...onStruggle, source: "assessment", result: "right", question: { source: "assessment", assessmentId: TEST, questionId: `q-${next}` }, evidence: { kind: "answer", id: `answer-${next}` } }));
    // An older test's answer: not in the profile, so it counts.
    const older = event({ ...onStruggle, source: "assessment", result: "wrong", question: { source: "assessment", assessmentId: OLDER, questionId: "q-1" }, evidence: { kind: "answer", id: "answer-old" } });
    // A call about one of the base test's questions: Maya's help is not in the profile, so it counts.
    const call = event({ ...onStruggle, source: "call", result: "right_with_help", question: { source: "assessment", assessmentId: TEST, questionId: "q-9" } });

    const profile = childProfileFacts(input({ assessment, events: [...backfilled, older, call] }))!;
    expect(profile.standards.find((s) => s.code === STRUGGLE.code)).toMatchObject({
      correct: STRUGGLE.correct,
      total: STRUGGLE.total + 2,
      events: { right: 0, rightWithHelp: 1, wrong: 1, sources: { call: 1, marking: 0, assessment: 1 } },
      evidence: { assessmentId: TEST, events: [older.id, call.id] },
    });
    expect(profile.events).toMatchObject({ counted: 2, inAssessmentProfile: 2 });

    // With no assessment profile, every event counts.
    expect(standard(STRUGGLE.code, input({ events: [...backfilled, older, call] }))).toMatchObject({ correct: 2, total: 4, evidence: { assessmentId: null } });
  });

  it("orders the standards by curriculum, and lists the secure ones and the ones not yet secure, worst first", () => {
    const on = (standard: string, result: LearningEvent["result"]) => event({ skill: { standard, skills: [] }, result });
    const events = [
      on("3.5", "right"), on("3.5", "right"), on("3.5", "right"), on("3.5", "right"), // secure
      on("3.3", "right"), on("3.3", "right_with_help"), on("3.3", "right"), on("3.3", "right"), // 3 of 4: developing
      on("3.1", "wrong"), on("3.1", "blank"), // needs attention
      on("4.1", "wrong"), // above the school grade: not a weakness
      on("2.1", "right_with_help"),
    ];
    const profile = childProfileFacts(input({ events }))!;
    expect(profile.standards.map((s) => s.code)).toEqual(["2.1", "3.1", "3.3", "3.5", "4.1"]);
    expect(profile.secure).toEqual(["3.5"]);
    expect(profile.notYetSecure).toEqual(["2.1", "3.1", "3.3"]);
    expect(profile.standards.find((s) => s.code === "4.1")).toMatchObject({ aboveGrade: true, status: "needs-attention" });
  });

  it("keeps the assessment's level and the parent's answers on the learning card; nothing to build from gives no profile", () => {
    const learning = { styles: ["pictures" as const], interests: ["space" as const], feeling: null, goal: "catch_up" as const, weeklyTime: null };
    const profile = childProfileFacts(input({ assessment, learning }))!;
    expect(profile.assessment).toMatchObject({ assessmentId: TEST, completedAt: "2026-10-20T18:00:00.000Z", buildId: "build-1" });
    expect(profile.assessment?.profile.level).toEqual(BASE.level);
    expect(profile.preferences).toEqual({ styles: ["pictures"], interests: ["space"] });
    expect(profile.parent).toEqual({ feeling: null, goal: "catch_up", weeklyTime: null });

    // A stored profile at another schema version is not read: the build has no assessment, and the test's events count.
    expect(childProfileFacts(input({ assessment: { ...assessment, profile: { schemaVersion: 99 } }, events: [event()] }))?.assessment).toBeNull();
    expect(childProfileFacts(input({ learning }))).toBeNull();
  });
});
