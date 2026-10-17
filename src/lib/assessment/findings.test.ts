import { describe, expect, it } from "vitest";
import {
  BANKS,
  BC_SKILL_MAP,
  MISCONCEPTIONS,
  createSession,
  fillTemplate,
  finish,
  learnerProfile,
  nextQuestion,
  reportFindings,
  submitAnswer,
  type LearnerProfile,
  type MisconceptionId,
  type ProfileAi,
  type ProfileAnswer,
} from "@/lib/assessment";

// What the parent's report shows from the learner profile (#198, spec #181 stories 5, 6 and 9, D-121): strengths;
// struggles, each with one real wrong answer and the likely cause; and the workbook 1 preview. Through the
// assessment core's public interface: a profile built from answers as the report job builds it, with or without the
// AI parts (#197).

/** A grade 4 BC placement: every grade 4 question right, every grade 5 question wrong. */
function grade4Placement() {
  let session = createSession({ grade: 4, province: "BC" }, 101);
  for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
    session = submitAnswer(session, { questionId: q.id, response: q.level <= 4 ? q.answer : "no idea", timeMs: 20_000 });
  }
  return finish(session);
}
const placement = grade4Placement();

let n = 0;
/**
 * An answer to a grade 4 question drawn from the template: right; "no idea", which matches no known mistake; or the
 * question's coded wrong answer for a known mistake, which the session marks with that mistake.
 */
function answer(templateId: string, response: "right" | "no idea" | MisconceptionId): ProfileAnswer {
  const template = BANKS["3-5"].find((t) => t.id === templateId)!;
  const question = fillTemplate(template, 7, "BC", `q-${n++}`);
  const coded = question.wrong.find((w) => w.misconception === response);
  if (response !== "right" && response !== "no idea" && !coded) throw new Error(`${templateId} has no wrong answer for ${response}`);
  return {
    question, response: response === "right" ? question.answer : (coded?.value ?? response), correct: response === "right",
    misconception: coded?.misconception ?? null, timeMs: 20_000, work: { required: false, drawing: false, typed: false }, readAloud: null, away: null,
  };
}
const times = (count: number, make: () => ProfileAnswer) => Array.from({ length: count }, make);
const profileOf = (answers: ProfileAnswer[], ai?: ProfileAi): LearnerProfile => {
  const profile = learnerProfile({ placement, answers, help: null, learning: null })!;
  return ai ? { ...profile, ai } : profile;
};

// Multiplication (4.5): 6 of 6, a clear strength. Adding and subtracting (4.4): 1 of 3, needs attention; the first wrong
// answer matches no known mistake, the second matches O1. Place value (4.1): 1 of 2, developing, a wrong answer that
// matches no known mistake.
const MULTIPLY = [...times(3, () => answer("g35-4-multiply", "right")), ...times(3, () => answer("g35-4-story-multiply", "right"))];
const ADD_SUBTRACT = [answer("g35-4-add", "no idea"), answer("g35-4-subtract", "O1"), answer("g35-4-add", "right")];
const PLACE_VALUE = [answer("g35-4-digit-value", "no idea"), answer("g35-4-hundred-more", "right")];
const ANSWERS = [...MULTIPLY, ...ADD_SUBTRACT, ...PLACE_VALUE];

describe("strengths and struggles", () => {
  it("names the secure standards as strengths, and gives each struggle one of the child's own wrong answers", () => {
    const findings = reportFindings(profileOf(ANSWERS));

    expect(findings.strengths.map((s) => [s.code, s.correct, s.total, s.certainty])).toEqual([["4.5", 6, 6, "clear"]]);
    expect(findings.struggles.map((s) => [s.code, s.status, s.correct, s.total])).toEqual([
      ["4.4", "needs-attention", 1, 3],
      ["4.1", "developing", 1, 2],
    ]);
    // One wrong answer each, as the child gave it: the one that matches a known mistake when there is one.
    const [subtract, place] = [ADD_SUBTRACT[1].question, PLACE_VALUE[0].question];
    expect(findings.struggles.map((s) => s.answer)).toEqual([
      { prompt: subtract.prompt, response: ADD_SUBTRACT[1].response, rightAnswer: subtract.answer },
      { prompt: place.prompt, response: "no idea", rightAnswer: place.answer },
    ]);
  });

  it("without AI parts, gives as the likely cause the plain description of the known mistake, and none without one", () => {
    const findings = reportFindings(profileOf(ANSWERS));
    expect(findings.struggles.map((s) => s.cause)).toEqual([
      { source: "misconception", text: MISCONCEPTIONS.O1.description },
      null,
    ]);
  });

  it("with the AI's likely cause for a struggle, gives the AI's text; a struggle the AI wrote none for keeps its own", () => {
    const ai: ProfileAi = { likelyCauses: { model: "test/model", value: { "4.1": "{name} may read each digit as ones." } } };
    expect(reportFindings(profileOf(ANSWERS, ai)).struggles.map((s) => s.cause)).toEqual([
      { source: "misconception", text: MISCONCEPTIONS.O1.description },
      { source: "ai", text: "{name} may read each digit as ones." },
    ]);
  });

  it("puts the clear strengths first, then the ones taught in the latest grade", () => {
    // Grade 3 multiplication (3.5): 6 of 6, clear. Place value (4.1): 2 of 2, an early sign. Multiplication (4.5): 6 of
    // 6, clear, taught later than 3.5.
    const grade3 = times(6, () => answer("g35-3-array", "right"));
    const place = times(2, () => answer("g35-4-digit-value", "right"));
    const findings = reportFindings(profileOf([...grade3, ...place, ...MULTIPLY]));
    expect(findings.strengths.map((s) => [s.code, s.certainty])).toEqual([["4.5", "clear"], ["3.5", "clear"], ["4.1", "early-sign"]]);
  });

  it("puts the clear struggles first, as they rest on more answers; then needs attention before developing", () => {
    // Fractions (4.3): 3 of 5, developing, and clear (4 of 6 and 3 of 6 are developing too). It comes before 4.4
    // (needs attention) and 4.1 (developing), which are early signs.
    const fractions = [...times(3, () => answer("g35-4-compare-like", "right")), ...times(2, () => answer("g35-4-compare-like", "no idea"))];
    const findings = reportFindings(profileOf([...ANSWERS, ...fractions]));
    expect(findings.struggles.map((s) => [s.code, s.status, s.certainty])).toEqual([
      ["4.3", "developing", "clear"],
      ["4.4", "needs-attention", "early-sign"],
      ["4.1", "developing", "early-sign"],
    ]);
  });
});

describe("no words-or-numbers finding (D-121)", () => {
  it("has none, also for a profile stored before D-121 with a gap", () => {
    const profile = profileOf(MULTIPLY);
    expect(reportFindings(profile)).not.toHaveProperty("wordsOrNumbers");
    const old = { ...profile, wordsOrNumbers: { finding: "gap", skills: [{ id: "4.5-multiply-1-digit", finding: "words-harder", words: { correct: 1, total: 3 }, numbers: { correct: 3, total: 3 } }] } };
    expect(reportFindings(old as LearnerProfile)).toEqual(reportFindings(profile));
  });
});

describe("the workbook 1 preview", () => {
  const topic = (code: string) => {
    const s = BC_SKILL_MAP.standards.find((x) => x.code === code)!;
    return { code, text: s.text, grade: s.grade };
  };
  const plan = (review: string[], practise: string[], stretch: string[], percents = [20, 60, 20]): ProfileAi => ({
    workbookPlan: {
      model: "test/model",
      value: { review: { percent: percents[0], standards: review }, practise: { percent: percents[1], standards: practise }, stretch: { percent: percents[2], standards: stretch } },
    },
  });

  it("is hidden without the AI's workbook plan: with no AI parts, or with other AI parts only", () => {
    expect(reportFindings(profileOf(ANSWERS)).preview).toBeNull();
    const causes: ProfileAi = { likelyCauses: { model: "test/model", value: { "4.1": "{name} may read each digit as ones." } } };
    expect(reportFindings(profileOf(ANSWERS, causes)).preview).toBeNull();
  });

  it("focuses on what the plan practises, and challenges with its stretch", () => {
    expect(reportFindings(profileOf(ANSWERS, plan(["4.5"], ["4.4", "4.1"], ["4.6"]))).preview).toEqual({
      focus: [topic("4.4"), topic("4.1")],
      challenge: [topic("4.6")],
    });
  });

  it("focuses on the review when the plan practises nothing, and names no challenge without a stretch", () => {
    expect(reportFindings(profileOf(ANSWERS, plan(["4.5"], [], ["4.6"], [30, 0, 70]))).preview).toEqual({ focus: [topic("4.5")], challenge: [topic("4.6")] });
    expect(reportFindings(profileOf(ANSWERS, plan(["4.5"], ["4.4"], [], [40, 60, 0]))).preview).toEqual({ focus: [topic("4.4")], challenge: [] });
    // A part with standards but no share of the workbook is not in it.
    expect(reportFindings(profileOf(ANSWERS, plan(["4.5"], ["4.4"], ["4.6"], [40, 60, 0]))).preview).toEqual({ focus: [topic("4.4")], challenge: [] });
    expect(reportFindings(profileOf(ANSWERS, plan([], [], [], [100, 0, 0]))).preview).toBeNull();
  });

  it("names at most 3 standards for the focus and 3 for the challenge, in the plan's order", () => {
    const preview = reportFindings(profileOf(ANSWERS, plan([], ["4.4", "4.1", "4.3", "4.2"], ["4.6", "4.7", "4.8", "4.9"]))).preview!;
    expect(preview.focus.map((t) => t.code)).toEqual(["4.4", "4.1", "4.3"]);
    expect(preview.challenge.map((t) => t.code)).toEqual(["4.6", "4.7", "4.8"]);
  });
});
