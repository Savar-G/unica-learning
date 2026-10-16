import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COPY_FIELDS,
  COPY_VERSION,
  PROFILE_SCHEMA_VERSION,
  anonymousTestCopy,
  copyFamilyTests,
  copyFieldNames,
  copyPreview,
  createFacts,
  createSession,
  finish,
  learnerProfile,
  nextQuestion,
  startExtraRound,
  storedTest,
  submitAnswer,
  submitFact,
  withoutRound,
  type AnonymousTestCopy,
  type FamilyCopyStore,
  type ProfileAnswer,
  type Question,
} from "@/lib/assessment";

// The copy without names (#201, spec #181): before a family is deleted, each of its tests is copied with a random id
// and no link to the family. Through the assessment core's public interface: the source is what the database function
// family_copy_sources returns for one test (supabase/migrations/20261016_test_copies_without_names.sql).

const FAMILY = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const TEST = "33333333-3333-4333-8333-333333333333";
const START = "2026-03-14T15:09:26.535Z";
const at = (ms: number) => new Date(Date.parse(START) + ms).toISOString();

/** Every identifying value the family has. None may reach the copy. */
const IDENTIFYING = [
  FAMILY, CHILD, TEST, "Maya", "Rivera", "maya.parent@example.invalid", "V4N 5B2", "V4N5B2",
  `${FAMILY}/${TEST}/s1-0-abc.png`, `${FAMILY}/${TEST}/s1-0-abc.strokes.json`, "I counted on my fingers",
  "She finds fractions hard, call me at 604-555-0199", "AI wrote this likely cause", "Mozilla/5.0 (iPad)", "123456789",
];

/** A whole grade 3 BC test through the session, with facts, as the database hands it to the copy. */
function source() {
  let session = createSession({ grade: 3, province: "BC" }, 123456789);
  for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
    const i = session.answers.length;
    // The first three answers are very fast and wrong (a rushed run); then every other answer is right. A wrong answer
    // is one the screen offers: another choice, or a number.
    const wrong = q.wrong[0]?.value ?? (q.answer === "0" ? "1" : "0");
    const response = i < 3 || i % 2 === 0 ? wrong : q.answer;
    session = submitAnswer(session, { questionId: q.id, response, timeMs: i < 3 ? 1_000 : 20_000 });
  }
  let facts = createFacts({ grade: 3, province: "BC" }, 123456789);
  for (let i = 0; i < 5; i++) {
    const f = facts.facts[i];
    facts = submitFact(facts, { factId: f.id, response: i === 2 ? "" : String(f.answer), atMs: 2_000 * (i + 1), browserMs: 1_500 });
  }
  const placement = finish(session, facts, "a-little");
  const questions: Question[] = [...session.stage1, ...session.stage2[session.route!]];
  const profileAnswers: ProfileAnswer[] = session.answers.map((a, i) => ({
    question: questions[i], response: a.response, correct: a.correct, misconception: a.misconception, timeMs: a.timeMs,
    work: { required: questions[i].showWork === true, drawing: i === 0, typed: i === 0 }, readAloud: i === 0 ? 2 : 0, away: { count: 0, ms: 0 },
  }));
  const learning = { styles: ["pictures" as const], interests: ["space" as const], feeling: "okay" as const, goal: "catch_up" as const, weeklyTime: "1_to_2h" as const };
  const profile = { ...learnerProfile({ placement, answers: profileAnswers, help: "a-little", learning })!, ai: { likelyCauses: { model: "m", value: { "3.1": "AI wrote this likely cause" } } }, note: "Maya" };
  return {
    id: TEST,
    copied: false,
    testFamily: false,
    // A database row with more than the copy may take: the copy must pick its fields, never pass a row through.
    parentId: FAMILY, childId: CHILD, firstName: "Maya", name: "Maya Rivera", email: "maya.parent@example.invalid", postal: "V4N 5B2",
    seed: 123456789,
    grade: 3, province: "BC", status: "completed", route: session.route, help: "a-little",
    startedAt: START, completedAt: at(1_800_000), lastAnswerAt: at(1_700_000),
    breakStartedAt: at(600_000), breakEndedAt: at(660_000), breakSkipped: false, breakMs: 60_000,
    device: { deviceClass: "tablet", input: "touch", screenWidth: 820, screenHeight: 1180, browser: "safari", userAgent: "Mozilla/5.0 (iPad)" },
    stored: { ...storedTest(session), childName: "Maya" },
    placement: { ...placement, parentEmail: "maya.parent@example.invalid" },
    answers: session.answers.map((a, i) => ({
      position: i, questionId: a.questionId, templateId: questions[i].templateId, values: questions[i].values,
      response: a.response, correct: a.correct, misconception: a.misconception, timeMs: a.timeMs,
      workRequired: questions[i].showWork === true, drawing: i === 0, typed: i === 0, strokes: i === 0,
      workPath: i === 0 ? `${FAMILY}/${TEST}/s1-0-abc.png` : null, workText: i === 0 ? "I counted on my fingers" : null,
      strokesPath: i === 0 ? `${FAMILY}/${TEST}/s1-0-abc.strokes.json` : null,
      shownAt: at(10_000 + 30_000 * i), answeredAt: at(10_000 + 30_000 * i + a.timeMs),
      changes: [{ value: "1", atMs: 500 }, { value: a.response, atMs: a.timeMs - 100 }],
      readAloudCount: i === 0 ? 2 : 0, readAloudAtMs: i === 0 ? [300, 900] : [], awayCount: i === 1 ? 1 : 0, awayMs: i === 1 ? 4_000 : 0,
    })),
    // The last question was served once more before the finish; an abandoned test has shown questions with no answer.
    shows: session.answers.map((a, i) => ({ position: i, questionId: a.questionId, shownAt: at(10_000 + 30_000 * i) })),
    facts: { startedAt: at(1_750_000), stored: { grade: 3, facts: facts.facts, parentId: FAMILY }, answers: facts.answers.map((f, i) => ({
      position: i, factId: f.factId, response: f.response, correct: f.correct, atMs: f.atMs, serverMs: f.serverMs, browserMs: f.browserMs,
    })) },
    profile,
    learning: { ...learning, note: "She finds fractions hard, call me at 604-555-0199" },
  };
}

/** A wrong answer the screen offers: another choice, or a number. */
const wrongOf = (q: Question) => q.wrong[0]?.value ?? (q.answer === "0" ? "1" : "0");

/** The extra round's times, as ms since the test started (the database stores dates and times). */
interface RoundTimes { offered?: number; skipped?: number; started?: number; finished?: number }

/**
 * #190: Asha's test (grade 4, BC, seed 1) as the database hands it to the copy. Her first answer is wrong, so one area
 * is an early sign and an 8-question extra round is due (D-116). Main question i is shown at 10 s + 30 s i. When the
 * round started, `answered` of its questions have an answer (the first wrong) and `served` were shown, 20 s apart from
 * the start. `completed`: when the test was completed (null: in progress); `counted`: the placement was scored with
 * the round (taken and finished), else without it (D-116: a stopped round does not count).
 */
function roundSource(
  times: RoundTimes,
  { answered = 0, served = answered, completed = null, counted = false }: { answered?: number; served?: number; completed?: number | null; counted?: boolean } = {},
) {
  let session = createSession({ grade: 4, province: "BC" }, 1);
  for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
    session = submitAnswer(session, { questionId: q.id, response: session.answers.length === 0 ? wrongOf(q) : q.answer, timeMs: 20_000 });
  }
  const main = session.answers.length;
  if (times.started !== undefined) session = startExtraRound(session);
  for (let i = 0; i < answered; i++) {
    const q = nextQuestion(session)!;
    session = submitAnswer(session, { questionId: q.id, response: i === 0 ? wrongOf(q) : q.answer, timeMs: 15_000 });
  }
  const questions: Question[] = [...session.stage1, ...session.stage2[session.route!], ...(session.extra ?? [])];
  const shownAt = (i: number) => (i < main ? 10_000 + 30_000 * i : times.started! + 20_000 * (i - main));
  const when = (ms: number | undefined | null) => (ms === undefined || ms === null ? null : at(ms));
  return {
    id: TEST, copied: false, testFamily: false, grade: 4, province: "BC", status: completed === null ? "in_progress" : "completed",
    route: session.route, help: completed === null ? null : "no", startedAt: START, completedAt: when(completed),
    breakStartedAt: null, breakEndedAt: null, breakSkipped: null, breakMs: null, device: null,
    stored: storedTest(session),
    placement: completed === null ? null : finish(counted ? session : withoutRound(session), null, "no"),
    extraOfferedAt: when(times.offered), extraSkippedAt: when(times.skipped), extraStartedAt: when(times.started), extraFinishedAt: when(times.finished),
    answers: session.answers.map((a, i) => ({
      position: i, questionId: a.questionId, round: i < main ? "main" : "extra", templateId: questions[i].templateId, values: questions[i].values,
      response: a.response, correct: a.correct, misconception: a.misconception, timeMs: a.timeMs,
      workRequired: questions[i].showWork === true, drawing: false, typed: false, strokes: false,
      shownAt: at(shownAt(i)), answeredAt: at(shownAt(i) + a.timeMs),
      changes: [{ value: a.response, atMs: a.timeMs - 100 }], readAloudCount: 0, readAloudAtMs: [], awayCount: 0, awayMs: 0,
    })),
    shows: questions.slice(0, main + served).map((q, i) => ({ position: i, questionId: q.id, shownAt: at(shownAt(i)) })),
    facts: null, profile: null, learning: null,
  };
}

/** The extra round's whole time line: offered after the last main answer (42 x 30 s), started 3 s later. */
const OFFERED = 1_262_000, STARTED = OFFERED + 3_000, DAY = 86_400_000;

/** Every key at every depth. */
const keysOf = (value: unknown): string[] => typeof value !== "object" || value === null ? []
  : Array.isArray(value) ? value.flatMap(keysOf) : Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]);

describe("the copy without names", () => {
  it("is an allowlist: no name, email, postal code, family or test id, drawing, stroke, typed working or free text", () => {
    const copy = anonymousTestCopy(source());
    expect(Object.keys(copy)).toEqual([...COPY_FIELDS.test]);
    for (const q of copy.questions) expect(Object.keys(q)).toEqual([...COPY_FIELDS.question]);
    for (const f of copy.facts!.answers) expect(Object.keys(f)).toEqual([...COPY_FIELDS.fact]);
    const text = JSON.stringify(copy);
    for (const value of IDENTIFYING) expect(text).not.toContain(value);
    for (const key of ["parentId", "childId", "firstName", "email", "postal", "seed", "workPath", "workText", "strokesPath", "userAgent", "note", "ai", "childName", "parentEmail"]) {
      expect(keysOf(copy)).not.toContain(key);
    }
    // The field names the dry run prints are the ones the copy holds.
    expect(copyFieldNames()).toEqual([
      ...COPY_FIELDS.test,
      ...COPY_FIELDS.question.map((k) => `questions.${k}`),
      ...COPY_FIELDS.extraRound.map((k) => `extraRound.${k}`),
      ...COPY_FIELDS.fact.map((k) => `facts.answers.${k}`),
    ]);
  });

  it("keeps the test month, the route and every question as shown, with each response, mark and misconception", () => {
    const s = source();
    const copy = anonymousTestCopy(s);
    expect(copy).toMatchObject({
      copyVersion: COPY_VERSION, grade: 3, province: "BC", testMonth: "2026-03", testFamily: false, status: "completed",
      route: s.route, help: "a-little", extraRound: null,
    });
    expect(copy.questions).toHaveLength(s.answers.length);
    expect(copy.questions.every((q) => q.round === "main")).toBe(true);
    const questions: Question[] = [...s.stored.stage1, ...s.stored.stage2[s.route!]];
    copy.questions.forEach((q, i) => {
      const shown = questions[i];
      expect(q).toMatchObject({
        position: i, questionId: shown.id, templateId: shown.templateId, level: shown.level, strand: shown.strand, format: shown.format,
        prompt: shown.prompt, choices: shown.choices ?? null, values: shown.values, answer: shown.answer, showWork: shown.showWork === true,
        response: s.answers[i].response, correct: s.answers[i].correct, misconception: s.answers[i].misconception,
      });
      expect(q.standard).toMatch(/^\d\.\d+$/);
      expect(["word-problem", "bare-number"]).toContain(q.wording);
    });
    // The placement keeps the rushed run left out of the score (#189).
    expect(copy.placement?.pace).toEqual(expect.objectContaining({ leftOut: s.placement.pace!.leftOut }));
    expect(copy.placement!.pace!.leftOut.length).toBeGreaterThan(0);
  });

  it("keeps all timing and signals, as milliseconds since the test started, never as a date and time", () => {
    const s = source();
    const copy = anonymousTestCopy(s);
    expect(copy.durationMs).toBe(1_800_000);
    expect(copy.break).toEqual({ startedAtMs: 600_000, endedAtMs: 660_000, skipped: false, ms: 60_000 });
    expect(copy.device).toEqual({ deviceClass: "tablet", input: "touch", screenWidth: 820, screenHeight: 1180, browser: "safari" });
    expect(copy.questions[0]).toMatchObject({
      shownAtMs: 10_000, answeredAtMs: 11_000, timeMs: 1_000,
      changes: [{ value: "1", atMs: 500 }, { value: s.answers[0].response, atMs: 900 }],
      readAloud: { count: 2, atMs: [300, 900] }, away: { count: 0, ms: 0 },
      work: { required: s.answers[0].workRequired, drawing: true, typed: true, strokes: true },
    });
    expect(copy.questions[1]).toMatchObject({ away: { count: 1, ms: 4_000 }, work: { drawing: false, typed: false, strokes: false } });
    // No date and time anywhere: an exact time could be matched to other records of the family.
    expect(JSON.stringify(copy)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("keeps the fact answers with each fact as shown and its times", () => {
    const s = source();
    const copy = anonymousTestCopy(s);
    expect(copy.facts!.startedAtMs).toBe(1_750_000);
    expect(copy.facts!.answers).toHaveLength(5);
    const first = s.facts.stored.facts[0];
    expect(copy.facts!.answers[0]).toEqual({
      position: 0, factId: first.id, family: first.family, a: first.a, op: first.op, b: first.b, answer: first.answer,
      response: String(first.answer), correct: true, atMs: 2_000, serverMs: 2_000, browserMs: 1_500,
    });
    expect(copy.facts!.answers[2]).toMatchObject({ response: "", correct: false });
  });

  it("keeps the profile facts without any AI part, and the questionnaire choices without the free text", () => {
    const s = source();
    const copy = anonymousTestCopy(s);
    const facts = Object.fromEntries(Object.entries(s.profile).filter(([k]) => k !== "ai" && k !== "note"));
    expect(copy.profile).toEqual(facts);
    expect(copy.questionnaire).toEqual({ styles: ["pictures"], interests: ["space"], feeling: "okay", goal: "catch_up", weeklyTime: "1_to_2h" });
    // A profile of a version the copy does not know is left out, never passed through unchecked.
    expect(anonymousTestCopy({ ...s, profile: { ...s.profile, schemaVersion: PROFILE_SCHEMA_VERSION + 1 } }).profile).toBeNull();
    expect(anonymousTestCopy({ ...s, profile: null, learning: null })).toMatchObject({ profile: null, questionnaire: null });
  });

  it("never keeps free text that reached a response, an answer change or a choice from a changed screen", () => {
    const s = source();
    const choice = s.answers.findIndex((a) => s.stored.stage1.concat(...Object.values(s.stored.stage2)).find((q) => q.id === a.questionId)?.format === "choice");
    const number = s.answers.findIndex((a) => s.stored.stage1.concat(...Object.values(s.stored.stage2)).find((q) => q.id === a.questionId)?.format === "number");
    expect(choice).toBeGreaterThanOrEqual(0);
    expect(number).toBeGreaterThanOrEqual(0);
    const tampered = structuredClone(s);
    tampered.answers[choice].response = "Maya Rivera";
    tampered.answers[number].response = "Maya";
    tampered.answers[number].changes = [{ value: "V4N 5B2", atMs: 10 }, { value: "12.5", atMs: 20 }, { value: "", atMs: 30 }];
    tampered.facts.answers[0].response = "Hi";
    // The profile repeats the child's wrong answers: each comes from the question's checked response, never as stored.
    const wrong = tampered.profile.struggles.flatMap((st) => st.wrong)[0];
    expect(wrong).toBeDefined();
    wrong.response = "Maya Rivera";
    const copy = anonymousTestCopy(tampered);
    const kept = copy.questions.find((q) => q.questionId === wrong.questionId)!.response;
    expect((copy.profile!.struggles as typeof tampered.profile.struggles).flatMap((st) => st.wrong).find((w) => w.questionId === wrong.questionId)!.response).toBe(kept);
    expect(copy.questions[choice].response).toBeNull();
    expect(copy.questions[number].response).toBeNull();
    expect(copy.questions[number].changes).toEqual([{ value: null, atMs: 10 }, { value: "12.5", atMs: 20 }, { value: "", atMs: 30 }]);
    expect(copy.facts!.answers[0].response).toBeNull();
    for (const value of ["Maya", "V4N 5B2", "Hi"]) expect(JSON.stringify(copy)).not.toContain(value);
  });

  it("keeps a shown question with no answer, and a test from before the timeline with nulls", () => {
    const s = source();
    const old = {
      ...s, status: "in_progress", completedAt: null, placement: null, profile: null, facts: null, device: null,
      breakStartedAt: null, breakEndedAt: null, breakSkipped: null, breakMs: null,
      answers: s.answers.slice(0, 2).map((a) => ({ ...a, shownAt: null, answeredAt: at(5_000), changes: null, readAloudCount: null, readAloudAtMs: null, awayCount: null, awayMs: null })),
      shows: s.shows.slice(0, 3),
    };
    const copy = anonymousTestCopy(old);
    expect(copy).toMatchObject({ status: "in_progress", durationMs: null, break: null, device: null, placement: null, facts: null });
    expect(copy.questions.map((q) => q.position)).toEqual([0, 1, 2]);
    expect(copy.questions[0]).toMatchObject({ shownAtMs: 10_000, answeredAtMs: 5_000, changes: null, readAloud: null, away: null });
    expect(copy.questions[2]).toMatchObject({ questionId: s.shows[2].questionId, shownAtMs: 70_000, response: null, correct: null, timeMs: null, answeredAtMs: null });
  });

  it("refuses a source it cannot read, so the deletion stops", () => {
    const s = source();
    for (const bad of [null, [], "test", { ...s, id: 7 }, { ...s, grade: 9 }, { ...s, province: "QC" }, { ...s, startedAt: "not a date" }, { ...s, answers: "none" }]) {
      expect(() => anonymousTestCopy(bad)).toThrow("Copy source unreadable");
    }
  });
});

// #190, D-116: the optional extra round. The copy keeps the round's questions as shown, marked as round questions, each
// round answer like a main answer, and the round's state as times since the test started: never a date and time.
describe("the extra round in the copy", () => {
  it("keeps the round's questions as shown, marked as round questions, with each response, mark, misconception and time", () => {
    const finished = STARTED + 8 * 20_000 + 30_000;
    const s = roundSource({ offered: OFFERED, started: STARTED, finished }, { answered: 8, completed: finished, counted: true });
    const copy = anonymousTestCopy(s);
    expect(copy.questions).toHaveLength(42 + 8);
    for (const q of copy.questions) expect(Object.keys(q)).toEqual([...COPY_FIELDS.question]);
    expect(copy.questions.slice(0, 42).every((q) => q.round === "main")).toBe(true);
    const round = copy.questions.slice(42);
    s.stored.extra!.forEach((shown, i) => {
      const a = s.answers[42 + i];
      expect(round[i]).toMatchObject({
        position: 42 + i, questionId: `x-${i}`, round: "extra", templateId: shown.templateId, level: shown.level, strand: shown.strand,
        format: shown.format, prompt: shown.prompt, choices: shown.choices ?? null, values: shown.values, answer: shown.answer, showWork: false,
        response: a.response, correct: a.correct, misconception: a.misconception, timeMs: 15_000,
        shownAtMs: STARTED + 20_000 * i, answeredAtMs: STARTED + 20_000 * i + 15_000,
      });
    });
    expect(round[0]).toMatchObject({ correct: false });
    expect(round[0].misconception).toBe(s.answers[42].misconception);
    expect(copy.extraRound).toEqual({
      takenFrom: "test", offeredAtMs: OFFERED, skippedAtMs: null, startedAtMs: STARTED, stoppedAtMs: null, finishedAtMs: finished,
      questions: 8, counted: true,
    });
    // The placement scored with the round records it.
    expect(copy.placement?.extraRound).toEqual(s.placement!.extraRound);
    expect(copy.placement!.extraRound!.questions).toBe(8);
    expect(JSON.stringify(copy)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  const COMPLETED = 1_300_000;
  it.each([
    {
      state: "offered, no choice yet", times: { offered: OFFERED }, test: {},
      round: { takenFrom: null, offeredAtMs: OFFERED, skippedAtMs: null, startedAtMs: null, stoppedAtMs: null, finishedAtMs: null, questions: 0, counted: false },
      shown: [],
    },
    {
      state: "skipped during the test", times: { offered: OFFERED, skipped: OFFERED + 2_000 }, test: { completed: COMPLETED },
      round: { takenFrom: null, offeredAtMs: OFFERED, skippedAtMs: OFFERED + 2_000, startedAtMs: null, stoppedAtMs: null, finishedAtMs: null, questions: 0, counted: false },
      shown: [],
    },
    {
      // A stop is stored as a skip after the start (D-116). Its answers stay, but the result is the main test alone.
      state: "stopped part way during the test", times: { offered: OFFERED, started: STARTED, skipped: STARTED + 70_000 },
      test: { answered: 3, served: 4, completed: STARTED + 90_000 },
      round: { takenFrom: "test", offeredAtMs: OFFERED, skippedAtMs: null, startedAtMs: STARTED, stoppedAtMs: STARTED + 70_000, finishedAtMs: null, questions: 8, counted: false },
      shown: [true, true, true, false],
    },
    {
      state: "skipped, then taken from the report two days later and finished",
      times: { offered: OFFERED, skipped: OFFERED + 2_000, started: COMPLETED + 2 * DAY, finished: COMPLETED + 2 * DAY + 200_000 },
      test: { answered: 8, completed: COMPLETED, counted: true },
      round: { takenFrom: "report", offeredAtMs: OFFERED, skippedAtMs: OFFERED + 2_000, startedAtMs: COMPLETED + 2 * DAY, stoppedAtMs: null, finishedAtMs: COMPLETED + 2 * DAY + 200_000, questions: 8, counted: true },
      shown: Array(8).fill(true),
    },
    {
      state: "stopped part way during the test, then finished from the report",
      times: { offered: OFFERED, started: STARTED, skipped: STARTED + 70_000, finished: COMPLETED + DAY },
      test: { answered: 8, completed: STARTED + 90_000, counted: true },
      round: { takenFrom: "test", offeredAtMs: OFFERED, skippedAtMs: null, startedAtMs: STARTED, stoppedAtMs: STARTED + 70_000, finishedAtMs: COMPLETED + DAY, questions: 8, counted: true },
      shown: Array(8).fill(true),
    },
  ])("keeps the round's state as times since the start: $state", ({ times, test, round, shown }) => {
    const s = roundSource(times, test);
    const copy = anonymousTestCopy(s);
    expect(Object.keys(copy.extraRound!)).toEqual([...COPY_FIELDS.extraRound]);
    expect(copy.extraRound).toEqual(round);
    expect(copy.questions.filter((q) => q.round === "extra").map((q) => q.response !== null)).toEqual(shown);
    expect(copy.placement?.extraRound ?? null).toEqual(round.counted ? { questions: 8, strands: expect.any(Array) } : null);
    expect(JSON.stringify(copy)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("has no round record for a test whose round was never offered, also from before the round existed", () => {
    expect(anonymousTestCopy(roundSource({})).extraRound).toBeNull();
    const { extraOfferedAt, extraSkippedAt, extraStartedAt, extraFinishedAt, ...before } = roundSource({});
    expect([extraOfferedAt, extraSkippedAt, extraStartedAt, extraFinishedAt]).toEqual([null, null, null, null]);
    expect(anonymousTestCopy({ ...before, answers: before.answers.map((a) => Object.fromEntries(Object.entries(a).filter(([k]) => k !== "round"))) }).extraRound).toBeNull();
  });

  it("adds no identifying field or free text: the round's record and questions are allowlists too", () => {
    const finished = STARTED + 8 * 20_000 + 30_000;
    const s = roundSource({ offered: OFFERED, started: STARTED, finished }, { answered: 8, completed: finished, counted: true });
    // A database row with more than the copy may take: a note about the round, a round name that is free text, typed
    // working and paths on round answers, and a name stored with a round question.
    const tampered = {
      ...s,
      extraNote: "Maya asked to stop, call 604-555-0199", extraBy: FAMILY,
      stored: { ...s.stored, extra: s.stored.extra!.map((q, i) => (i === 0 ? { ...q, childName: "Maya", parentId: FAMILY } : q)) },
      answers: s.answers.map((a, i) => (i < 42 ? a : {
        ...a, round: i === 42 ? "Maya Rivera" : a.round, workText: "I counted on my fingers", workPath: `${FAMILY}/${TEST}/x-0-abc.png`,
        response: i === 43 ? "Maya" : a.response,
      })),
    };
    const copy = anonymousTestCopy(tampered);
    expect(Object.keys(copy)).toEqual([...COPY_FIELDS.test]);
    expect(Object.keys(copy.extraRound!)).toEqual([...COPY_FIELDS.extraRound]);
    for (const q of copy.questions) expect(Object.keys(q)).toEqual([...COPY_FIELDS.question]);
    expect(new Set(copy.questions.map((q) => q.round))).toEqual(new Set(["main", "extra"]));
    // The round is the stored round's, whatever a row says.
    expect(copy.questions[42].round).toBe("extra");
    expect(copy.questions[43].response).toBeNull();
    const text = JSON.stringify(copy);
    for (const value of [...IDENTIFYING, "Maya", "604-555-0199"]) expect(text).not.toContain(value);
    for (const key of ["extraNote", "extraBy", "childName", "parentId", "workText", "workPath", "extraOfferedAt", "extraStartedAt"]) {
      expect(keysOf(copy)).not.toContain(key);
    }
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe("copying a family's tests before the deletion", () => {
  /** The database: each test's copy is saved once, with its link to the test, until the family is deleted. */
  function database(sources: unknown[]) {
    const saved: { test: string; copy: AnonymousTestCopy }[] = [];
    const linked = new Set<string>();
    let lose = false;
    const store: FamilyCopyStore = {
      async copySources() { return sources.map((raw) => ({ ...(raw as object), copied: linked.has((raw as { id: string }).id) })); },
      async saveCopy(test, copy) {
        if (linked.has(test)) return false;
        linked.add(test);
        saved.push({ test, copy });
        if (lose) { lose = false; throw new Error("response lost"); }
        return true;
      },
      async confirmCopies() { return sources.every((raw) => linked.has((raw as { id: string }).id)); },
    };
    return { store, saved, loseNextResponse: () => { lose = true; } };
  }

  it("saves every test's copy once, also when a retry follows a lost answer", async () => {
    const second = { ...source(), id: "44444444-4444-4444-8444-444444444444" };
    const db = database([source(), second]);
    db.loseNextResponse();
    await expect(copyFamilyTests(db.store)).rejects.toThrow("response lost");
    expect(await copyFamilyTests(db.store)).toBe(1);
    expect(await copyFamilyTests(db.store)).toBe(0);
    expect(db.saved.map((s) => s.test)).toEqual([TEST, second.id]);
  });

  it("stops when the database does not confirm a copy of every test", async () => {
    const db = database([source()]);
    db.store.confirmCopies = async () => false;
    await expect(copyFamilyTests(db.store)).rejects.toThrow("Copy incomplete");
  });

  it("the dry run's preview counts what a deletion would copy, with no value from the family", () => {
    const s = source();
    const preview = copyPreview([s, { ...s, id: "44444444-4444-4444-8444-444444444444", copied: true }, { ...s, profile: null, learning: null, facts: null }]);
    expect(preview).toEqual({ tests: 2, copied: 1, questions: 2 * s.answers.length, extraRounds: 0, facts: 5, profiles: 1, questionnaires: 1 });
    const round = roundSource({ offered: 1_000, started: 4_000, finished: 300_000 }, { answered: 8, completed: 300_000, counted: true });
    expect(copyPreview([round])).toMatchObject({ tests: 1, questions: 42 + 8, extraRounds: 1 });
    expect(() => copyPreview([{ ...s, grade: 0 }])).toThrow("Copy source unreadable");
  });
});

describe("the database's check of the copy", () => {
  const migration = () => readFileSync(new URL("../../../supabase/migrations/20261016_test_copies_without_names.sql", import.meta.url), "utf8");

  it("takes the same fields as the core's allowlist, so a copy the core builds is never refused", () => {
    // save_family_test_copy refuses any other field at the top, in the extra round's record and in a question. A change
    // to COPY_FIELDS needs a migration that replaces the function; point this test at it.
    const lists = [...migration().matchAll(/k <> all\(array\[([^\]]+)\]\)/g)].map((m) => m[1].match(/'([^']+)'/g)!.map((x) => x.slice(1, -1)));
    expect(lists).toEqual([[...COPY_FIELDS.test], [...COPY_FIELDS.extraRound], [...COPY_FIELDS.question]]);
  });

  it("family_copy_sources selects exactly the fields the copy reads: the round's included, nothing identifying", () => {
    // The sources in these tests are what the database hands the copy, plus values the database never selects (names,
    // ids, paths, typed working, notes), which prove the copy picks its fields. Without those, the keys are the same.
    const sql = migration();
    const body = sql.slice(sql.indexOf("create function public.family_copy_sources"), sql.indexOf("create function public.save_family_test_copy"));
    const selected = new Set([...body.matchAll(/'([a-zA-Z]+)', /g)].map((m) => m[1]));
    const NOT_SELECTED = ["parentId", "childId", "firstName", "name", "email", "postal", "seed", "lastAnswerAt", "workPath", "workText", "strokesPath", "note"];
    const keys = new Set<string>();
    for (const s of [source(), roundSource({ offered: 1_000, skipped: 2_000, started: 4_000, finished: 300_000 }, { answered: 8, completed: 300_000, counted: true })]) {
      for (const level of [s, s.answers[0], s.shows[0], s.facts, s.facts?.answers[0], s.learning]) {
        for (const k of Object.keys(level ?? {})) if (!NOT_SELECTED.includes(k)) keys.add(k);
      }
    }
    expect([...selected].sort()).toEqual([...keys].sort());
    for (const k of ["round", "extraOfferedAt", "extraSkippedAt", "extraStartedAt", "extraFinishedAt"]) expect(selected).toContain(k);
    for (const k of NOT_SELECTED) expect(selected).not.toContain(k);
  });
});
