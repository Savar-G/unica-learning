import { describe, expect, it } from "vitest";
import { checked } from "@/lib/assessment/scripted-child";
import {
  BANKS,
  BC_SKILL_MAP,
  LATE_DROP_POINTS,
  LATE_THIRD_MIN,
  PROFILE_SCHEMA_VERSION,
  createSession,
  finish,
  learnerProfile,
  nextQuestion,
  storedProfile,
  submitAnswer,
  createFacts,
  submitFact,
  type ChildProfile,
  type FactsSession,
  type Grade,
  type HelpAnswer,
  type ProfileAi,
  type ProfileAnswer,
  type Question,
} from "@/lib/assessment";
import { MAIN_REJECTED_UNTESTED } from "./untested-wordings";

// The learner profile's facts (#196, spec #181), through the assessment core's public interface. A child takes a whole
// test through the session, and the profile is built from the stored placement and the answers, as the report job does.

type Respond = (q: Question, index: number) => string;
const knows = (level: number): Respond => (q) => (q.level <= level ? q.answer : "no idea");

/**
 * A whole test through the session: the placement, and each answer as the report job reads it back. `help`: the child's
 * answer to "Did anyone help?"; `facts`: the quick facts section, when the child had one.
 */
function taken(
  child: ChildProfile, seed: number, respond: Respond, timeFor: (index: number) => number = () => 20_000,
  { help = null, facts = null }: { help?: HelpAnswer | null; facts?: FactsSession | null } = {},
) {
  let session = createSession(child, seed);
  for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
    const i = session.answers.length;
    session = checked(submitAnswer(session, { questionId: q.id, response: respond(q, i), timeMs: timeFor(i) }));
  }
  const questions = [...session.stage1, ...session.stage2[session.route!]];
  const answers: ProfileAnswer[] = session.answers.map((a, i) => ({
    question: questions[i],
    response: a.response,
    correct: a.correct,
    misconception: a.misconception,
    timeMs: a.timeMs,
    work: { required: questions[i].showWork === true, drawing: false, typed: false },
    readAloud: null,
    away: null,
  }));
  return { placement: finish(session, facts, help), answers, questions, route: session.route! };
}

describe("the learner profile", () => {
  it("carries its schema version, the working level and each area's level with how sure it is", () => {
    // Every grade 4 question right and every grade 5 question wrong: routed up, works at grade 4.
    const { placement, answers } = taken({ grade: 4, province: "BC" }, 101, knows(4));
    const profile = learnerProfile({ placement, answers, help: "no", learning: null })!;

    expect(profile.schemaVersion).toBe(1);
    expect(PROFILE_SCHEMA_VERSION).toBe(1);
    expect(profile.test).toEqual({ grade: 4, province: "BC", route: "up", answered: 42 });
    expect(profile.level).toEqual({ working: 4, certainty: "clear", confidence: "normal", atCeiling: false });
    // Each area: grade 4 all right and grade 5 all wrong, so the area's own level is 4. Its status counts only the
    // questions at or below the school grade, as on the report.
    expect(profile.strands.map((s) => [s.strand, s.level, s.status, s.certainty])).toEqual([
      ["number", 4, "secure", "clear"],
      ["fractions", 4, "secure", "clear"],
      ["algebra", 4, "secure", "clear"],
      ["shapes", 4, "secure", "clear"],
    ]);
  });

  it("reads back from storage only at its own schema version: a reader never guesses at another shape", () => {
    const { placement, answers } = taken({ grade: 4, province: "BC" }, 101, knows(4));
    const profile = learnerProfile({ placement, answers, help: "no", learning: null })!;
    // Stored as JSON, as in the database.
    const json = JSON.parse(JSON.stringify(profile));
    expect(storedProfile(json)).toEqual(profile);
    expect(storedProfile({ ...json, schemaVersion: PROFILE_SCHEMA_VERSION + 1 })).toBeNull();
    expect(storedProfile({ ...json, schemaVersion: "1" })).toBeNull();
    for (const value of [null, "profile", [json], 1]) expect(storedProfile(value)).toBeNull();
  });

  it("is built for tests scored against BC only: another province is, Alberta is not", () => {
    const other = taken({ grade: 4, province: "other" }, 101, knows(4));
    expect(learnerProfile({ placement: other.placement, answers: other.answers, help: null, learning: null })?.test.province).toBe("other");
    const alberta = taken({ grade: 4, province: "AB" }, 101, knows(4));
    expect(learnerProfile({ placement: alberta.placement, answers: alberta.answers, help: null, learning: null })).toBeNull();
  });

  it("gives each BC standard tested its result, names strengths, and never makes a struggle of a standard above grade", () => {
    const { placement, answers, questions } = taken({ grade: 4, province: "BC" }, 101, knows(4));
    const profile = learnerProfile({ placement, answers, help: "no", learning: null })!;
    const standardOf = new Map(BANKS["3-5"].map((t) => [t.id, t.standard]));
    const asked = new Set(questions.map((q) => standardOf.get(q.templateId)));

    expect(new Set(profile.standards.map((s) => s.code))).toEqual(asked);
    // Every answer counts toward one standard.
    expect(profile.standards.reduce((n, s) => n + s.total, 0)).toBe(42);
    for (const s of profile.standards) {
      expect(s.text.length).toBeGreaterThan(0);
      if (s.grade <= 4) expect([s.aboveGrade, s.status, s.correct]).toEqual([false, "secure", s.total]);
      else expect([s.aboveGrade, s.status, s.correct]).toEqual([true, "needs-attention", 0]);
    }
    // Grade 5 questions were all wrong, but grade 5 is above the school grade: not a struggle (D-084).
    expect(profile.struggles).toEqual([]);
    expect(profile.strengths.map((s) => s.code).sort()).toEqual(profile.standards.filter((s) => s.grade <= 4).map((s) => s.code).sort());
  });

  it("lists each struggle with the child's real wrong answers and their misconception ids", () => {
    // The child picks a coded wrong answer on every question of one grade 4 standard, and knows everything else to grade 4.
    const first = taken({ grade: 4, province: "BC" }, 101, knows(4)).questions;
    const standardOf = new Map(BANKS["3-5"].map((t) => [t.id, t.standard]));
    const weak = standardOf.get(first.find((q) => q.level === 4 && q.wrong.length > 0)!.templateId)!;
    const inWeak = (q: Question) => standardOf.get(q.templateId) === weak;
    const { placement, answers, questions } = taken({ grade: 4, province: "BC" }, 101, (q) => (inWeak(q) ? q.wrong[0]?.value ?? "no idea" : knows(4)(q, 0)));
    const profile = learnerProfile({ placement, answers, help: "no", learning: null })!;

    const missed = questions.filter(inWeak);
    expect(missed.length).toBeGreaterThan(0);
    expect(profile.struggles.map((s) => [s.code, s.status, s.correct, s.total])).toEqual([[weak, "needs-attention", 0, missed.length]]);
    expect(profile.struggles[0].wrong).toEqual(missed.map((q) => ({
      questionId: q.id,
      templateId: q.templateId,
      prompt: q.prompt,
      response: q.wrong[0]?.value ?? "no idea",
      rightAnswer: q.answer,
      misconception: q.wrong[0]?.misconception ?? null,
    })));
    expect(profile.struggles[0].misconceptions).toEqual([...new Set(missed.flatMap((q) => (q.wrong[0] ? [q.wrong[0].misconception] : [])))]);
    expect(profile.strengths.map((s) => s.code)).not.toContain(weak);
  });

  it("leaves out of the standards and the struggles the rushed wrong answers the placement left out of the score", () => {
    // The first 3 answers are very fast and wrong: a run, so the placement leaves them out (#189).
    const { placement, answers, questions } = taken({ grade: 4, province: "BC" }, 101, (q, i) => (i < 3 ? "no idea" : knows(4)(q, i)), (i) => (i < 3 ? 1000 : 20_000));
    expect(placement.pace?.leftOut).toEqual(questions.slice(0, 3).map((q) => q.id));
    const profile = learnerProfile({ placement, answers, help: "no", learning: null })!;

    expect(profile.standards.reduce((n, s) => n + s.total, 0)).toBe(42 - 3);
    expect(profile.struggles).toEqual([]);
    expect(profile.test.answered).toBe(42);
  });
});

describe("the late-test drop", () => {
  // Grade 4: 36 questions on the stay route, so each third is 12. Stage 1 is 12 right of 18 (stay); questions 19 to 24
  // are right; the last third has `lastRight` right.
  const stay = (lastRight: number) => taken({ grade: 4, province: "BC" }, 101, (q, i) => (i < 12 || (i >= 18 && i < 24 + lastRight) ? q.answer : "no idea"));
  const thirds = (t: ReturnType<typeof taken>) => learnerProfile({ placement: t.placement, answers: t.answers, help: null, learning: null })!.behaviour.thirds;

  it("is a drop of 30 points or more from the first third to the last, at the school grade", () => {
    expect([LATE_DROP_POINTS, LATE_THIRD_MIN]).toEqual([30, 3]);
    const none = stay(0);
    expect(none.route).toBe("stay");
    expect(thirds(none)).toEqual({ first: { correct: 12, total: 12 }, last: { correct: 0, total: 12 }, drop: true });
    // 100% to 67%: 33 points.
    expect(thirds(stay(8))).toEqual({ first: { correct: 12, total: 12 }, last: { correct: 8, total: 12 }, drop: true });
    // 100% to 75%: 25 points.
    expect(thirds(stay(9))).toEqual({ first: { correct: 12, total: 12 }, last: { correct: 9, total: 12 }, drop: false });
  });

  it("is not judged when a third has too few questions at the school grade: a route down ends below it", () => {
    const down = taken({ grade: 4, province: "BC" }, 101, (q, i) => (i < 4 ? q.answer : "no idea"));
    expect(down.route).toBe("down");
    expect(thirds(down)).toEqual({ first: { correct: 4, total: 12 }, last: { correct: 0, total: 0 }, drop: null });
  });
});

describe("test behaviour and number facts", () => {
  it("counts the pace, rushing, the whiteboard, read aloud, time away and the help flags", () => {
    // Grade 4, knows grade 4. Answers 1-3 very fast and right; answers 6-8 very fast and wrong (a rushed run, left out).
    const fast = (i: number) => (i < 3 ? 1000 : i >= 5 && i < 8 ? 2000 : 20_000);
    const t = taken({ grade: 4, province: "BC" }, 101, (q, i) => (i >= 5 && i < 8 ? "no idea" : knows(4)(q, i)), fast, { help: "a-little" });
    const required = t.answers.filter((a) => a.work.required);
    const optional = t.answers.find((a) => !a.work.required)!;
    const answers = t.answers.map((a, i): ProfileAnswer => ({
      ...a,
      // Read aloud twice on the first question; not recorded on the last two (a screen that sent no events).
      readAloud: i >= 40 ? null : i === 0 ? 2 : 0,
      away: i === 41 ? null : i === 3 ? { count: 1, ms: 5000 } : i === 4 ? { count: 2, ms: 1500 } : { count: 0, ms: 0 },
      work: { ...a.work, drawing: a === required[0] || a === required[1], typed: a === optional },
    }));
    const b = learnerProfile({ placement: t.placement, answers, help: "a-little", learning: null })!.behaviour;

    expect(b).toMatchObject({
      medianMs: 20_000,
      veryFast: 6,
      unreliable: false,
      rushRuns: 2,
      leftOut: 3,
      whiteboard: { required: required.length, requiredWithWork: 2, optionalWithWork: 1 },
      readAloud: { recorded: 40, questions: 1, uses: 2 },
      away: { recorded: 41, questions: 2, times: 3, ms: 6500 },
      help: { answer: "a-little", likely: true },
    });
    expect(required.length).toBe(7);
    expect(b.help.flags).toContainEqual({ kind: "helped", answer: "a-little" });
    expect(b.help.flags).toContainEqual({ kind: "too-fast", questionIds: t.questions.filter((_, i) => fast(i) < 3000).map((q) => q.id), right: 3 });
  });

  it("says read aloud and time away are not recorded when no answer has them, and the facts are accuracy beside speed", () => {
    // 10 facts: 8 right, 3 seconds each in the browser.
    let facts = createFacts({ grade: 4, province: "BC" }, 5);
    facts.facts.slice(0, 10).forEach((f, i) => {
      facts = submitFact(facts, { factId: f.id, response: i < 8 ? String(f.answer) : "0", atMs: (i + 1) * 4000, browserMs: 3000 });
    });
    const t = taken({ grade: 4, province: "BC" }, 101, knows(4), undefined, { facts });
    const profile = learnerProfile({ placement: t.placement, answers: t.answers, help: "no", learning: null })!;

    expect([profile.behaviour.readAloud, profile.behaviour.away]).toEqual([null, null]);
    expect(profile.behaviour.help).toEqual({ answer: "no", flags: [], likely: false });
    expect(profile.facts).toMatchObject({ answered: 10, correct: 8, skipped: 0, medianMs: 3000, accuracy: "needs-practice", speed: "quick" });
  });
});

describe("what we do not know", () => {
  const grade4 = BC_SKILL_MAP.standards.filter((s) => s.grade === 4).map((s) => s.code);

  it("lists the standards of the school grade the test did not ask; a clear result leaves nothing to check", () => {
    const { placement, answers } = taken({ grade: 4, province: "BC" }, 101, knows(4));
    const profile = learnerProfile({ placement, answers, help: "no", learning: null })!;
    const tested = profile.standards.filter((s) => s.grade === 4).map((s) => s.code);
    const untested = profile.unknowns.untested.map((s) => s.code);

    expect(untested.length).toBeGreaterThan(0);
    expect(untested.filter((c) => tested.includes(c))).toEqual([]);
    expect([...tested, ...untested].sort()).toEqual([...grade4].sort());
    expect(profile.unknowns.earlySigns).toEqual({ level: false, strands: [] });
    expect(profile.unknowns.checkNext).toEqual([]);
  });

  it("does not list a standard the quick facts round tested (#242): the round asks the facts standards of the grade", () => {
    // Grade 3 asks addition and subtraction facts to 20 (3.4); grade 5 also asks multiplication facts (5.8 and 5.9).
    const factsOf = (grade: Grade) => {
      let facts = createFacts({ grade, province: "BC" }, 5);
      facts.facts.slice(0, 10).forEach((f, i) => { facts = submitFact(facts, { factId: f.id, response: String(f.answer), atMs: (i + 1) * 2000, browserMs: 2000 }); });
      return facts;
    };
    const untestedOf = (t: ReturnType<typeof taken>) => learnerProfile({ placement: t.placement, answers: t.answers, help: "no", learning: null })!.unknowns.untested.map((s) => s.code);
    for (const [grade, factCodes] of [[3, ["3.4"]], [5, ["5.8", "5.9"]]] as const) {
      const questionsOnly = untestedOf(taken({ grade, province: "BC" }, 101, knows(grade)));
      const withFacts = untestedOf(taken({ grade, province: "BC" }, 101, knows(grade), undefined, { facts: factsOf(grade) }));
      // The questions alone leave a facts standard untested; the facts round tests it, and nothing else changes.
      expect(questionsOnly.filter((c) => (factCodes as readonly string[]).includes(c)).length, `grade ${grade}`).toBeGreaterThan(0);
      expect(withFacts, `grade ${grade}`).toEqual(questionsOnly.filter((c) => !(factCodes as readonly string[]).includes(c)));
    }
  });

  it("calls an estimated working level an early sign, also from a placement stored when it said clear (#242)", () => {
    // Every answer wrong: no level reaches 70%, so the working level is one under the lowest level asked, an estimate.
    const { placement, answers } = taken({ grade: 5, province: "BC" }, 101, () => "no idea");
    expect(placement.confidence).toBe("low");
    const profile = learnerProfile({ placement, answers, help: "no", learning: null })!;
    expect(profile.level.certainty).toBe("early-sign");
    expect(profile.unknowns.earlySigns.level).toBe(true);
    const stored = learnerProfile({ placement: { ...placement, levelCertainty: "clear" }, answers, help: "no", learning: null })!;
    expect(stored.level.certainty).toBe("early-sign");
  });

  it("names what to check next: struggles that one more answer could change, then untested standards in uncertain areas", () => {
    // One wrong answer on one grade 4 question: its standard is an early-sign struggle, and its area may become uncertain.
    const first = taken({ grade: 4, province: "BC" }, 101, knows(4)).questions;
    const missed = first.find((q) => q.level === 4)!;
    const { placement, answers } = taken({ grade: 4, province: "BC" }, 101, (q, i) => (q.id === missed.id ? "no idea" : knows(4)(q, i)));
    const profile = learnerProfile({ placement, answers, help: "no", learning: null })!;
    const [struggle] = profile.struggles;

    expect(profile.struggles).toHaveLength(1);
    expect(struggle.certainty).toBe("early-sign");
    expect(profile.unknowns.checkNext[0]).toEqual({ code: struggle.code, text: struggle.text, strand: struggle.strand, reason: "confirm-struggle" });
    const rest = profile.unknowns.checkNext.slice(1);
    const uncertain = profile.unknowns.earlySigns.strands;
    expect(uncertain).toEqual(profile.strands.filter((s) => s.certainty === "early-sign").map((s) => s.strand));
    expect(rest).toEqual(profile.unknowns.untested.filter((s) => uncertain.includes(s.strand)).map((s) => ({ ...s, reason: "untested-in-early-sign-area" })));
  });
});

describe("the parent's questionnaire", () => {
  const t = taken({ grade: 4, province: "BC" }, 101, knows(4));

  it("carries the learning preferences, the interests, the feeling about math, the goal and the time each week, never the free text", () => {
    const learning = {
      styles: ["pictures", "stories"], interests: ["space", "animals"], note: "zebra-note 604-555-0100",
      feeling: "avoids", goal: "catch_up", weeklyTime: "1_to_2h",
    } as const;
    const profile = learnerProfile({ placement: t.placement, answers: t.answers, help: "no", learning: { ...learning, styles: [...learning.styles], interests: [...learning.interests] } })!;
    expect(profile.preferences).toEqual({ styles: ["pictures", "stories"], interests: ["space", "animals"] });
    expect(profile.parent).toEqual({ feeling: "avoids", goal: "catch_up", weeklyTime: "1_to_2h" });
    expect(JSON.stringify(profile)).not.toContain("zebra-note");
    expect(JSON.stringify(profile)).not.toContain("555");
  });

  it("has empty answers when the parent gave none", () => {
    const profile = learnerProfile({ placement: t.placement, answers: t.answers, help: "no", learning: null })!;
    expect(profile.preferences).toEqual({ styles: [], interests: [] });
    expect(profile.parent).toEqual({ feeling: null, goal: null, weeklyTime: null });
  });
});

describe("a stored profile reads with the rules of today (#242)", () => {
  // Every answer wrong: no level reaches 70%, so the working level is an estimate. Stored when an estimate could be clear.
  const estimate = (grade: Grade) => {
    const { placement, answers } = taken({ grade, province: "BC" }, 101, () => "no idea");
    return learnerProfile({ placement, answers, help: "no", learning: null })!;
  };

  it("calls a stored estimate an early sign, also when it was stored as clear, for every reader of the profile", () => {
    const profile = estimate(5);
    expect(profile.level.confidence).toBe("low");
    const old = JSON.parse(JSON.stringify({ ...profile, level: { ...profile.level, certainty: "clear" }, unknowns: { ...profile.unknowns, earlySigns: { ...profile.unknowns.earlySigns, level: false } } }));
    const read = storedProfile(old)!;
    expect(read.level.certainty).toBe("early-sign");
    expect(read.unknowns.earlySigns.level).toBe(true);
    expect(read).toEqual(profile);
    // The stored value is not changed.
    expect(old.level.certainty).toBe("clear");
  });

  it("leaves out a stored likely cause that says something was not tested, or that states the facts timing below grade 5; keeps the admin's ways to help (#245)", () => {
    for (const grade of [3, 5] as const) {
      const profile = estimate(grade);
      const [a, b, c] = profile.struggles.map((s) => s.code);
      const speedy = "{name} took 2 seconds to answer each fact.";
      const ai: ProfileAi = {
        likelyCauses: { model: "m", value: { [a]: "The multiplication facts were not tested.", [b]: speedy, [c]: "{name} mixed up the steps." } },
        howToHelp: { model: "m", value: { [a]: "Ask the facts that were not tested.", [b]: speedy, [c]: "Practise one step at a time." } },
      };
      const read = storedProfile(JSON.parse(JSON.stringify({ ...profile, ai })))!;
      const kept = grade < 5 ? { [c]: "{name} mixed up the steps." } : { [b]: speedy, [c]: "{name} mixed up the steps." };
      expect(read.ai?.likelyCauses?.value, `grade ${grade}`).toEqual(kept);
      // How to help is admin-only (spec #181): the parent text filters do not apply.
      expect(read.ai?.howToHelp?.value, `grade ${grade}`).toEqual(ai.howToHelp?.value);
    }
    // A part with nothing left is absent.
    const profile = estimate(3);
    const ai: ProfileAi = { likelyCauses: { model: "m", value: { [profile.struggles[0].code]: "{name} answered the facts instantly." } } };
    expect(storedProfile(JSON.parse(JSON.stringify({ ...profile, ai })))).not.toHaveProperty("ai");
  });
  it("leaves out a stored likely cause with any wording main's \"not tested\" check rejected in the review probes (#245 r3)", () => {
    for (const grade of [3, 5] as const) {
      const profile = estimate(grade);
      expect(profile.struggles.length, `grade ${grade}`).toBeGreaterThan(0);
      for (const text of MAIN_REJECTED_UNTESTED) {
        const ai: ProfileAi = { likelyCauses: { model: "m", value: Object.fromEntries(profile.struggles.map((s) => [s.code, text])) } };
        expect(storedProfile(JSON.parse(JSON.stringify({ ...profile, ai }))), `grade ${grade}: ${text}`).not.toHaveProperty("ai");
      }
    }
  });
});

describe("the words-or-numbers finding is gone (D-121)", () => {
  // The test does not test reading, so the profile has no words-or-numbers finding. Each template keeps its wording flag.
  const { placement, answers } = taken({ grade: 4, province: "BC" }, 101, knows(4));
  const profile = learnerProfile({ placement, answers, help: "no", learning: null })!;

  it("is not in a new profile, and the bank keeps the wording flag on every template", () => {
    expect(profile).not.toHaveProperty("wordsOrNumbers");
    const wordings = new Set(Object.values(BANKS).flat().map((t) => t.wording));
    expect(wordings).toEqual(new Set(["word-problem", "bare-number"]));
  });

  it("is dropped when a profile stored before D-121 is read back: the rest of the profile reads as before", () => {
    const old = { ...JSON.parse(JSON.stringify(profile)), wordsOrNumbers: { finding: "gap", skills: [{ id: "4.5-multiply-1-digit", finding: "words-harder", words: { correct: 1, total: 3 }, numbers: { correct: 3, total: 3 } }] } };
    const read = storedProfile(old)!;
    expect(read).not.toHaveProperty("wordsOrNumbers");
    expect(read).toEqual(profile);
    // The stored value is not changed.
    expect(old).toHaveProperty("wordsOrNumbers");
  });
});

