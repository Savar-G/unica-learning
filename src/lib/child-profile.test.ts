import { describe, expect, it } from "vitest";
import { learnerProfile, type LearnerProfile } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import { childProfileFacts, type ChildProfileInput } from "@/lib/child-profile";
import type { LearningEvent, LessonObservation } from "@/lib/learning-events";

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
  it("never counts a related question after a call toward a standard (#1144)", () => {
    const helped = event({ result: "right_with_help", hints: 1, stuckStep: "tens" });
    const related = [1, 2, 3, 4].map(() => event({
      question: { source: "transfer", relatedEventId: helped.id, text: "63 - 27 = ?" }, assistance: "independent",
    }));
    const facts = childProfileFacts(input({ events: [helped, ...related] }));
    expect(facts?.standards.find((s) => s.code === "3.3")).toMatchObject({ correct: 0, total: 1, evidence: { events: [helped.id] } });
    expect(facts?.secure).toEqual([]);
    expect(facts?.events).toMatchObject({ counted: 1, inAssessmentProfile: 0 });
    expect(childProfileFacts(input({ events: related }))).toBeNull();
  });

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

describe("the child's teaching evidence (#1145)", () => {
  const seen = (skill: LessonObservation["skill"], result: LessonObservation["result"], over: Partial<LessonObservation> = {}): LessonObservation =>
    ({ skill, result, assistance: "independent", board: false, ...over });
  const call = (observations: LessonObservation[], over: Partial<LearningEvent> = {}) => {
    const e = event({ result: "right_with_help", stuckStep: "ones", hints: 1, observations, ...over });
    return { ...e, evidence: over.evidence ?? { kind: "call" as const, id: `call-${e.id}` } };
  };
  /** The related question of a call: the same call, the same end time. */
  const relatedTo = (original: LearningEvent, over: Partial<LearningEvent> = {}): LearningEvent => ({
    ...event(), key: `${original.key}:transfer`, question: { source: "transfer", relatedEventId: original.id, text: "63 - 27 = ?" },
    occurredAt: original.occurredAt, evidence: original.evidence, assistance: "independent", ...over,
  });
  const marked = (over: Partial<LearningEvent> = {}): LearningEvent =>
    event({ source: "marking", result: "wrong", mistake: "O3", evidence: { kind: "scan", id: "scan-1" }, ...over });
  const teaching = (events: LearningEvent[], grade = 3) => childProfileFacts(input({ events, grade: grade as 3 }))!.teaching;
  const note = (events: LearningEvent[], kind: string, id: string) => teaching(events).notes.find((n) => n.kind === kind && n.id === id);

  it("keeps one error as unsure, two independent errors as a gap, and revises the view after a new independent tens check", () => {
    const first = call([seen("identify_tens", "incorrect")]);
    expect(note([first], "prerequisite", "identify_tens")).toEqual({
      kind: "prerequisite", id: "identify_tens", standard: "3.3", view: "unsure", uncertainty: "high", since: first.occurredAt, recheck: false,
      evidence: [{ event: first.id, source: "call", at: first.occurredAt, result: "incorrect", assistance: "independent" }],
    });
    const second = call([seen("identify_tens", "incorrect")]);
    expect(note([first, second], "prerequisite", "identify_tens")).toMatchObject({ view: "gap", uncertainty: "medium", since: second.occurredAt, recheck: false });
    expect(teaching([first, second]).reviews).toContainEqual({
      standard: "3.3", reason: "prerequisite_gap", since: second.occurredAt, events: [first.id, second.id], sources: ["call"], uncertainty: "medium", route: "workbook_plan",
    });
    // Help does not show the child knows it, and neither does a whole answer (it may come from memory or counting up).
    const shown = call([seen("identify_tens", "correct", { assistance: "demonstrated" }), seen("perform_exchange", "correct", { assistance: "demonstrated", board: true })]);
    const answered = call([seen("difference", "correct")], { result: "right", stuckStep: null, hints: 0 });
    expect(note([first, second, shown, answered], "prerequisite", "identify_tens")).toMatchObject({ view: "gap", recheck: true });
    const own = call([seen("identify_tens", "correct")]);
    expect(note([first, second, shown, answered, own], "prerequisite", "identify_tens")).toMatchObject({ view: "secure", uncertainty: "high", since: own.occurredAt });
    expect(teaching([first, second, shown, answered, own]).reviews.map((r) => r.reason)).not.toContain("prerequisite_gap");
  });

  it("builds the gap's review from the errors that set it, however much later evidence there is", () => {
    const errors = [call([seen("identify_tens", "incorrect")]), call([seen("identify_tens", "incorrect")])];
    const later = [1, 2, 3, 4, 5, 6].map(() => call([seen("identify_tens", "correct", { assistance: "hinted" })]));
    const summary = teaching([...errors, ...later]);
    const gap = summary.notes.find((n) => n.kind === "prerequisite")!;
    expect(gap).toMatchObject({ view: "gap" });
    expect(gap.evidence).toHaveLength(6);
    expect(gap.evidence.filter((p) => p.result === "incorrect").map((p) => p.event)).toEqual(errors.map((e) => e.id));
    expect(summary.reviews.find((r) => r.reason === "prerequisite_gap")).toMatchObject({ events: errors.map((e) => e.id) });
  });

  it("suspects a misconception from one call, finds it likely from two, and resolves it after the child's own right answer", () => {
    const swapped = [call([seen("reversal", "incorrect")]), call([seen("reversal", "incorrect")])];
    expect(note(swapped.slice(0, 1), "misconception", "reversal")).toMatchObject({ view: "suspected", uncertainty: "high" });
    // The call's related question repeats the mistake: still one call, so still suspected.
    const again = relatedTo(swapped[0], { result: "right_with_help", stuckStep: "ones", assistance: "hinted", observations: [seen("reversal", "incorrect", { assistance: "hinted" })] });
    expect(note([swapped[0], again], "misconception", "reversal")).toMatchObject({ view: "suspected", uncertainty: "high" });
    expect(note(swapped, "misconception", "reversal")).toMatchObject({ view: "likely", uncertainty: "medium" });
    const fixed = relatedTo(swapped[1]);
    // The related question shares its call's end time and may come first in the read; it still follows its call.
    expect(note([swapped[0], fixed, swapped[1]], "misconception", "reversal")).toMatchObject({
      view: "resolved", since: fixed.occurredAt, evidence: [{}, {}, { event: fixed.id, source: "transfer", result: "correct", assistance: "independent" }],
    });
  });

  it("reads marked pages in time order and resolves a misconception only with the child's own work", () => {
    const pages = [marked({ markedHelp: "none" }), marked({ markedHelp: "none" })];
    expect(note(pages, "misconception", "O3")).toMatchObject({ view: "likely", evidence: [{ source: "marking", assistance: "independent", result: "incorrect" }, {}] });
    for (const markedHelp of ["math-help", "unknown", undefined] as const) {
      const right = marked({ result: "right", mistake: null, markedHelp });
      expect(note([...pages, right], "misconception", "O3")?.view).toBe("likely");
    }
    expect(note([...pages, marked({ result: "right", mistake: null, markedHelp: "none" })], "misconception", "O3")?.view).toBe("resolved");
    // The marking projection lists marks after the calls; an older mark still comes before a newer own right answer.
    const ownRight = call([], { result: "right", stuckStep: null, hints: 0, observations: undefined });
    const older = { ...marked({ markedHelp: "none" }), occurredAt: "2026-10-28T10:00:00.000Z" };
    const olderToo = { ...marked({ markedHelp: "none" }), occurredAt: "2026-10-28T11:00:00.000Z" };
    expect(note([ownRight, older, olderToo], "misconception", "O3")).toMatchObject({ view: "resolved", since: ownRight.occurredAt });
  });

  it("records which board representation the child worked with, and review targets with their source, uncertainty and route", () => {
    const helped = call([seen("perform_exchange", "correct", { assistance: "demonstrated", board: true }), seen("subtract_ones", "correct", { board: true })]);
    expect(note([helped], "representation", "blocks")).toMatchObject({ view: "helped", uncertainty: "medium" });
    expect(note([helped], "representation", "words")).toBeUndefined();
    const related = relatedTo(helped, { result: "right_with_help", stuckStep: "ones", assistance: "hinted" });
    expect(teaching([helped, related]).reviews).toEqual([
      { standard: "3.3", reason: "assisted_only", since: helped.occurredAt, events: [helped.id], sources: ["call"], uncertainty: "high", route: "workbook_plan" },
      { standard: "3.3", reason: "transfer_not_independent", since: related.occurredAt, events: [related.id], sources: ["transfer"], uncertainty: "high", route: "workbook_plan" },
    ]);
    // A secure standard: help-only work is for Maya's next call; a likely misconception goes to the workbook plan.
    const secure = Array.from({ length: 10 }, () => event());
    const late = relatedTo(secure[9], { result: "blank", stuckStep: "ones" });
    expect(teaching([...secure, late]).reviews).toEqual([{ standard: "3.3", reason: "transfer_not_independent", since: late.occurredAt, events: [late.id], sources: ["transfer"], uncertainty: "high", route: "next_call" }]);
    const swapped = [call([seen("reversal", "incorrect")], { result: "blank" }), call([seen("reversal", "incorrect")], { result: "blank" })];
    expect(teaching([...secure, ...swapped]).reviews.find((r) => r.reason === "misconception")).toMatchObject({ route: "workbook_plan", uncertainty: "medium" });
    // Above the school grade nothing is a weakness for the plan (D-084): only the next call reads it.
    const above = swapped.map((e) => ({ ...e, skill: { standard: "8.5", skills: [] } }));
    expect(teaching(above).reviews.find((r) => r.reason === "misconception")).toMatchObject({ standard: "8.5", route: "next_call" });
    expect(teaching(secure)).toEqual({ notes: [], reviews: [] });
  });
});
