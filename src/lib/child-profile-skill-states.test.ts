import { afterEach, describe, expect, it, vi } from "vitest";
import { BANKS, learnerProfile, type LearnerProfile } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { rebuildChildProfile, readChildProfile, type ChildProfileStore } from "@/lib/child-profile";
import { memoryChildProfiles, type MemoryChildFamilies } from "@/lib/child-profile-memory";
import { learningEvents, type NewLearningEvent } from "@/lib/learning-events";

// The skill state history (spec #544, "Skill state history") through the rebuild that writes the child's profile, over
// the in-memory seams. A rebuild adds a row only when a standard's state changes; no row means Not started; a failure
// here never stops the profile.

const PARENT = "00000000-0000-4000-8000-0000000000a1";
const CHILD = "00000000-0000-4000-8000-0000000000c1";
const WORKBOOK = "00000000-0000-4000-8000-0000000000b1";
const TEST = "00000000-0000-4000-8000-0000000000e1";
const NEXT_TEST = "00000000-0000-4000-8000-0000000000e2";

const { asked, placement } = takeTest({ grade: 3, province: "BC" }, 7, knowsUpTo(2));
const BASE: LearnerProfile = learnerProfile({
  placement,
  answers: asked.map((q) => ({
    question: q, response: q.answer, correct: true, misconception: null,
    timeMs: 20_000, work: { required: false, drawing: false, typed: false }, readAloud: null, away: null,
  })),
  help: "no",
  learning: null,
})!;

/** A stored test profile with these tallies, by standard. */
const testProfile = (tallies: Record<string, [correct: number, total: number]>): LearnerProfile => ({
  ...BASE,
  standards: Object.entries(tallies).map(([code, [correct, total]]) => ({ ...BASE.standards[0], code, correct, total })),
});

let n = 0;
const event = (over: Partial<NewLearningEvent>): NewLearningEvent => {
  n += 1;
  return {
    key: `event:${n}`, parentId: PARENT, childId: CHILD, source: "call",
    question: { source: "workbook", workbookId: WORKBOOK, page: 1, question: n },
    skill: { standard: "3.3", skills: [] }, result: "right", stuckStep: null, mistake: null, hints: 0, timeMs: null,
    occurredAt: `2026-10-29T16:${String(n % 60).padStart(2, "0")}:00.000Z`, evidence: { kind: "call", id: "call-1" }, ...over,
  };
};

function family(over: Partial<MemoryChildFamilies> = {}) {
  const memory = memoryChildProfiles({
    children: [{ id: CHILD, parentId: PARENT, grade: 3 }],
    tests: [{ id: TEST, childId: CHILD, completedAt: "2026-10-20T18:00:00.000Z", profile: testProfile({ "3.3": [5, 5], "3.4": [0, 2], "3.5": [1, 1] }) }],
    ...over,
  });
  return { ...memory, record: learningEvents(memory.events) };
}

const changes = (f: ReturnType<typeof family>) => f.history().map(({ standard, state, reason, evidenceSource }) => ({ standard, state, reason, evidenceSource }));

afterEach(() => vi.restoreAllMocks());

describe("the rebuild's skill state history", () => {
  it("reads no state from a test the report calls unreliable, also after an earlier good test", async () => {
    const f = family({ tests: [
      { id: TEST, childId: CHILD, completedAt: "2026-10-20T18:00:00.000Z", profile: testProfile({ "3.3": [5, 5] }) },
      { id: NEXT_TEST, childId: CHILD, completedAt: "2026-11-20T18:00:00.000Z", profile: testProfile({ "3.3": [0, 4], "3.4": [0, 4], "3.5": [4, 4] }), unreliable: true },
    ] });
    await rebuildChildProfile(CHILD, f);
    expect(changes(f)).toEqual([{ standard: "3.3", state: "mastered", reason: "secure_on_test", evidenceSource: "test" }]);
  });

  it("corrects a row already written when its test is unreliable, once, and leaves the old row", async () => {
    const f = family({ tests: [{ id: TEST, childId: CHILD, completedAt: "2026-10-20T18:00:00.000Z", profile: testProfile({ "3.4": [0, 4] }) }] });
    await rebuildChildProfile(CHILD, f);
    expect(changes(f)).toEqual([{ standard: "3.4", state: "needs_review", reason: "needs_attention_on_test", evidenceSource: "test" }]);
    f.tests[0].unreliable = true;
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ skillStates: { outcome: "recorded", changes: 1 } });
    expect(changes(f)).toEqual([
      { standard: "3.4", state: "needs_review", reason: "needs_attention_on_test", evidenceSource: "test" },
      { standard: "3.4", state: "not_started", reason: "no_evidence", evidenceSource: "none" },
    ]);
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ skillStates: { outcome: "recorded", changes: 0 } });
  });

  it("writes a row for each standard that is not Not started, and none for the rest", async () => {
    const f = family();
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ built: true, skillStates: { outcome: "recorded", changes: 2 } });
    expect(changes(f)).toEqual([
      { standard: "3.3", state: "mastered", reason: "secure_on_test", evidenceSource: "test" },
      { standard: "3.4", state: "needs_review", reason: "needs_attention_on_test", evidenceSource: "test" },
    ]);
    expect(f.history().every((r) => r.childId === CHILD && r.parentId === PARENT && r.changedAt)).toBe(true);
  });

  it("writes nothing when no state changed", async () => {
    const f = family();
    await rebuildChildProfile(CHILD, f);
    const before = f.history();
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ built: true, revision: 2, skillStates: { outcome: "recorded", changes: 0 } });
    expect(f.history()).toEqual(before);
  });

  it("writes nothing when the reason changes and the state stays", async () => {
    const f = family();
    await rebuildChildProfile(CHILD, f);
    f.tests.push({ id: NEXT_TEST, childId: CHILD, completedAt: "2026-11-20T18:00:00.000Z", profile: testProfile({ "3.3": [6, 6], "3.4": [0, 3], "4.1": [1, 1] }) });
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ skillStates: { outcome: "recorded", changes: 0 } });
    expect(changes(f)).toHaveLength(2);
  });

  it("keeps old rows and adds a row for each later change", async () => {
    const f = family({ workbooks: [] });
    await rebuildChildProfile(CHILD, f);
    f.workbooks.push({ childId: CHILD, number: 1, status: "shipped", standards: ["3.3", "3.4", "3.5"] });
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ skillStates: { outcome: "recorded", changes: 2 } });
    // 3.3 stays Mastered; 3.4 and 3.5 are Working on.
    expect(changes(f).slice(2)).toEqual([
      { standard: "3.4", state: "working_on", reason: "in_workbook", evidenceSource: "workbook" },
      { standard: "3.5", state: "working_on", reason: "in_workbook", evidenceSource: "workbook" },
    ]);
    expect(changes(f).slice(0, 2).map((r) => r.state)).toEqual(["mastered", "needs_review"]);
  });

  it("writes a Not started row when the only test is deleted, though nothing is left to build from", async () => {
    const f = family();
    await rebuildChildProfile(CHILD, f);
    f.deleteTest(TEST);
    // The test's deletion removes the profile built on it (the cascade), and the child has nothing left.
    expect(await f.profiles.current(CHILD)).toBeNull();
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ built: true, revision: 1, skillStates: { outcome: "recorded", changes: 2 } });
    expect(changes(f).slice(2)).toEqual([
      { standard: "3.3", state: "not_started", reason: "no_evidence", evidenceSource: "none" },
      { standard: "3.4", state: "not_started", reason: "no_evidence", evidenceSource: "none" },
    ]);
    expect((await readChildProfile(f.profiles, CHILD))?.profile).toMatchObject({ assessment: null, standards: [] });
    // Then nothing more: the next rebuild stores the empty profile again, with no row.
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ built: true, revision: 2, skillStates: { outcome: "recorded", changes: 0 } });
    expect(changes(f)).toHaveLength(4);
  });

  it("stores nothing for a child with no input and no history", async () => {
    const f = family({ tests: [] });
    expect(await rebuildChildProfile(CHILD, f)).toEqual({ built: false, reason: "nothing_to_build" });
    expect(f.rows()).toEqual([]);
  });

  it("writes Working on for a child with only a shipped workbook", async () => {
    const f = family({ tests: [], workbooks: [{ childId: CHILD, number: 1, status: "shipped", standards: ["3.2"] }] });
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ built: true, revision: 1, skillStates: { outcome: "recorded", changes: 1 } });
    expect(changes(f)).toEqual([{ standard: "3.2", state: "working_on", reason: "in_workbook", evidenceSource: "workbook" }]);
  });

  it("keeps the rows when a newer test is deleted, and adds the change back", async () => {
    const f = family();
    f.tests.push({ id: NEXT_TEST, childId: CHILD, completedAt: "2026-11-20T18:00:00.000Z", profile: testProfile({ "3.3": [0, 1] }) });
    await rebuildChildProfile(CHILD, f);
    expect(changes(f).filter((r) => r.standard === "3.3").map((r) => r.state)).toEqual(["needs_review"]);
    f.deleteTest(NEXT_TEST);
    await rebuildChildProfile(CHILD, f);
    expect(changes(f).filter((r) => r.standard === "3.3").map((r) => r.state)).toEqual(["needs_review", "mastered"]);
  });

  it("reads each finished test, so a newer test that skips a standard does not take its state away", async () => {
    const f = family();
    await rebuildChildProfile(CHILD, f);
    f.tests.push({ id: NEXT_TEST, childId: CHILD, completedAt: "2026-11-20T18:00:00.000Z", profile: testProfile({ "4.1": [5, 5] }) });
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ skillStates: { outcome: "recorded", changes: 1 } });
    expect(changes(f).at(-1)).toMatchObject({ standard: "4.1", state: "mastered" });
  });

  it("reads the test's own tally, not the profile's tally with the events", async () => {
    const f = family({ tests: [{ id: TEST, childId: CHILD, completedAt: "2026-10-20T18:00:00.000Z", profile: testProfile({ "3.3": [1, 1] }) }] });
    for (let i = 0; i < 5; i++) await f.record.append(event({}));
    await rebuildChildProfile(CHILD, f);
    const standard = (await readChildProfile(f.profiles, CHILD))?.profile.standards.find((s) => s.code === "3.3");
    // The profile's own tally is Secure and Clear with the calls in it; the skill state still reads the test's Early sign.
    expect(standard).toMatchObject({ status: "secure", certainty: "clear" });
    expect(changes(f)).toEqual([]);
  });

  it("leaves out a rushed wrong answer, as the report does, so it neither earns nor takes away Mastered (#578)", async () => {
    // A standard the test asked at least 3 times: one answer is wrong, very fast and in a rushed run.
    const standardOf = new Map(Object.values(BANKS).flat().map((t) => [t.id, t.standard]));
    const byStandard = Map.groupBy(asked, (q) => standardOf.get(q.templateId) ?? "");
    const [code, questions] = [...byStandard].find(([c, qs]) => c && qs.length >= 3) ?? never();
    const rushed = questions[0];
    const profileWith = (leftOut: string[]) => learnerProfile({
      placement: { ...placement, pace: { veryFast: 3, answers: asked.length, leftOut, unreliable: false } },
      answers: asked.map((q) => ({
        question: q, response: q === rushed ? "wrong" : q.answer, correct: q !== rushed, misconception: null,
        timeMs: q === rushed ? 500 : 20_000, work: { required: false, drawing: false, typed: false }, readAloud: null, away: null,
      })),
      help: "no",
      learning: null,
    })!;
    const stateAfter = async (profile: LearnerProfile) => {
      const f = family({ tests: [{ id: TEST, childId: CHILD, completedAt: "2026-10-20T18:00:00.000Z", profile }] });
      await rebuildChildProfile(CHILD, f);
      return changes(f).find((r) => r.standard === code)?.state ?? "not_started";
    };
    expect(await stateAfter(profileWith([rushed.id]))).toBe("mastered");
    // The same wrong answer, counted: not every answer is right.
    expect(await stateAfter(profileWith([]))).not.toBe("mastered");
  });

  it("leaves marked pages out until marking is live", async () => {
    const f = family({ tests: [] });
    const marked = (over: Partial<NewLearningEvent>) => event({ source: "marking", evidence: { kind: "scan", id: "scan-1" }, ...over });
    for (let i = 0; i < 6; i++) await f.record.append(marked({}));
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ built: true, skillStates: { outcome: "recorded", changes: 0 } });
    expect(changes(f)).toEqual([]);
  });

  it("reads the latest shipped workbook only", async () => {
    const f = family({
      tests: [],
      workbooks: [
        { childId: CHILD, number: 1, status: "shipped", standards: ["3.1"] },
        { childId: CHILD, number: 2, status: "shipped", standards: ["3.2"] },
        { childId: CHILD, number: 3, status: "draft", standards: ["3.6"] },
      ],
    });
    await f.record.append(event({}));
    await rebuildChildProfile(CHILD, f);
    expect(changes(f)).toEqual([{ standard: "3.2", state: "working_on", reason: "in_workbook", evidenceSource: "workbook" }]);
  });

  it("writes before the AI's findings, whose save gives the row a new build token", async () => {
    const f = family();
    const called = await f.record.append(event({}));
    const id = called.ok ? called.event.id : never();
    const ai = fakeAiClient({ answer: () => ({ findings: [{ standard: "3.3", hypothesis: "The child may not yet regroup tens without help: the calls stop at the tens step.", event_ids: [id] }] }) });
    const built = await rebuildChildProfile(CHILD, { ...f, ai });
    expect(built).toMatchObject({ built: true, revision: 2, findings: { outcome: "stored" }, skillStates: { outcome: "recorded", changes: 2 } });
    expect(changes(f)).toHaveLength(2);
    // A failed AI step leaves the states as they are, too.
    const failing = fakeAiClient({ answer: () => { throw new Error("no answer"); } });
    expect(await rebuildChildProfile(CHILD, { ...f, ai: failing })).toMatchObject({ built: true, findings: { outcome: "failed" }, skillStates: { outcome: "recorded", changes: 0 } });
  });
});

describe("a skill state history failure", () => {
  it("saves the facts alone when the write fails, and the next rebuild writes what it missed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = family();
    const failing: ChildProfileStore = { ...f.profiles, save: (row, expected, signal) => (row.skillChanges ? Promise.reject(new Error("history down")) : f.profiles.save(row, expected, signal)) };
    expect(await rebuildChildProfile(CHILD, { ...f, profiles: failing })).toMatchObject({ built: true, revision: 1, skillStates: { outcome: "failed", problem: "history down" } });
    expect((await readChildProfile(f.profiles, CHILD))?.revision).toBe(1);
    expect(changes(f)).toEqual([]);
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ built: true, revision: 2, skillStates: { outcome: "recorded", changes: 2 } });
  });

  it("saves the facts alone when the read fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = family();
    const failing: ChildProfileStore = { ...f.profiles, skillInputs: () => Promise.reject(new Error("read down")) };
    expect(await rebuildChildProfile(CHILD, { ...f, profiles: failing })).toMatchObject({ built: true, revision: 1, skillStates: { outcome: "failed", problem: "read down" } });
    expect(changes(f)).toEqual([]);
  });
});

// Start from Mastered. A rebuild reads a wrong test, and a newer all-right test finishes before it stores.
describe("two rebuilds at one time", () => {
  const WRONG = "00000000-0000-4000-8000-0000000000e3";
  const RETEST = "00000000-0000-4000-8000-0000000000e4";
  const wrongTest = { id: WRONG, childId: CHILD, completedAt: "2026-11-20T18:00:00.000Z", profile: testProfile({ "3.3": [0, 1] }) };
  const retest = { id: RETEST, childId: CHILD, completedAt: "2026-11-21T18:00:00.000Z", profile: testProfile({ "3.3": [3, 3] }) };
  const statesOf33 = (f: ReturnType<typeof family>) => changes(f).filter((r) => r.standard === "3.3").map((r) => r.state);

  /** A store whose first save runs `meanwhile` before it stores, as a rebuild that was slower than another. */
  function slowFirstSave(f: ReturnType<typeof family>, meanwhile: () => Promise<void>): ChildProfileStore {
    let waited = false;
    return {
      ...f.profiles,
      async save(row, expected, signal) {
        if (!waited) {
          waited = true;
          await meanwhile();
        }
        return f.profiles.save(row, expected, signal);
      },
    };
  }

  it("adds no row for a Needs review no rebuild's map showed, when the newer rebuild stores first", async () => {
    const f = family();
    await rebuildChildProfile(CHILD, f);
    f.tests.push(wrongTest);
    const slow = slowFirstSave(f, async () => {
      f.tests.push(retest);
      // It reads both tests: Mastered now, the same as the last row.
      expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ built: true, skillStates: { outcome: "recorded", changes: 0 } });
    });
    // The slower rebuild loses its build token, writes nothing, and builds again from what is stored now.
    expect(await rebuildChildProfile(CHILD, { ...f, profiles: slow })).toMatchObject({ built: true, skillStates: { outcome: "recorded", changes: 0 } });
    expect(statesOf33(f)).toEqual(["mastered"]);
  });

  it("adds each state a rebuild saw when a rebuild runs after each test", async () => {
    const f = family();
    await rebuildChildProfile(CHILD, f);
    f.tests.push(wrongTest);
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ skillStates: { outcome: "recorded", changes: 1 } });
    f.tests.push(retest);
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ skillStates: { outcome: "recorded", changes: 1 } });
    expect(statesOf33(f)).toEqual(["mastered", "needs_review", "mastered"]);
  });

  it("adds each change once when both rebuilds run truly at the same time, and on every rebuild after", async () => {
    const f = family();
    await rebuildChildProfile(CHILD, f);
    f.tests.push(wrongTest, retest);
    f.tests.pop();
    const results = await Promise.all([rebuildChildProfile(CHILD, f), rebuildChildProfile(CHILD, f), rebuildChildProfile(CHILD, f)]);
    expect(results.every((r) => r.built)).toBe(true);
    expect(statesOf33(f)).toEqual(["mastered", "needs_review"]);
    await rebuildChildProfile(CHILD, f);
    expect(statesOf33(f)).toEqual(["mastered", "needs_review"]);
  });

  it("writes neither the profile nor the rows of a build that is no longer stored", async () => {
    const f = family();
    await rebuildChildProfile(CHILD, f);
    const stale = (await f.profiles.current(CHILD))!;
    await rebuildChildProfile(CHILD, f);
    const before = f.history();
    const row = { childId: CHILD, parentId: PARENT, assessmentId: null, profile: (await readChildProfile(f.profiles, CHILD))!.profile };
    expect(await f.profiles.save({ ...row, skillChanges: { rows: [{ standard: "3.3", state: "needs_review", reason: "failed_review", evidence: "pages", evidenceAt: null }], tests: [TEST] } }, stale)).toBe("changed");
    expect(f.history()).toEqual(before);
    expect((await f.profiles.current(CHILD))?.revision).toBe(2);
  });

  it("refuses the profile and its rows for a family being deleted", async () => {
    const f = family();
    f.deleting.push(PARENT);
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ built: false, reason: "refused" });
    expect(f.history()).toEqual([]);
  });
});

// A test that arrives after a newer one (review finding): the history records what each rebuild saw, not every past moment.
describe("a delayed test", () => {
  const MIDDLE = "00000000-0000-4000-8000-0000000000e5";
  const LAST = "00000000-0000-4000-8000-0000000000e6";
  const LATE = "00000000-0000-4000-8000-0000000000e7";
  const ofStandard = (f: ReturnType<typeof family>) => f.history().filter((r) => r.standard === "3.3");

  afterEach(() => vi.useRealTimers());

  it("adds no row and no error when it changes no current state", async () => {
    const f = family();
    await rebuildChildProfile(CHILD, f);
    f.tests.push({ id: MIDDLE, childId: CHILD, completedAt: "2026-11-01T18:00:00.000Z", profile: testProfile({ "3.3": [0, 1] }) });
    await rebuildChildProfile(CHILD, f);
    f.tests.push({ id: LAST, childId: CHILD, completedAt: "2026-11-10T18:00:00.000Z", profile: testProfile({ "3.3": [3, 3] }) });
    await rebuildChildProfile(CHILD, f);
    expect(ofStandard(f).map((r) => r.state)).toEqual(["mastered", "needs_review", "mastered"]);
    // Dated before the last row: a wrong test inside the past.
    f.tests.push({ id: LATE, childId: CHILD, completedAt: "2026-10-25T18:00:00.000Z", profile: testProfile({ "3.3": [0, 2] }) });
    const rows = f.history().length;
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ built: true, skillStates: { outcome: "recorded", changes: 0 } });
    expect(f.history()).toHaveLength(rows);
  });

  it("adds one row when it changes the current state, with its evidence date and the time the rebuild recorded it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime("2026-11-02T12:00:00.000Z");
    const f = family();
    // A newer test that asks it once and is right keeps Mastered, with no row.
    f.tests.push({ id: LAST, childId: CHILD, completedAt: "2026-11-01T18:00:00.000Z", profile: testProfile({ "3.3": [1, 1] }) });
    await rebuildChildProfile(CHILD, f);
    expect(ofStandard(f).map((r) => r.state)).toEqual(["mastered"]);
    vi.setSystemTime("2026-12-03T12:00:00.000Z");
    f.tests.push({ id: LATE, childId: CHILD, completedAt: "2026-10-25T18:00:00.000Z", profile: testProfile({ "3.3": [0, 2] }) });
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ built: true, skillStates: { outcome: "recorded", changes: 1 } });
    // Its evidence is from October; the map changed in December, and that is the month it counts in.
    expect(ofStandard(f).at(-1)).toMatchObject({ state: "needs_review", reason: "failed_review", evidenceSource: "test", evidenceAt: "2026-10-25T18:00:00.000Z", changedAt: "2026-12-03T12:00:00.000Z" });
    expect(ofStandard(f)).toHaveLength(2);
  });
});

// Review finding: the deleted test is not the one the profile names, so neither the test check nor the build token sees it.
describe("a test deleted after the rebuild read its evidence", () => {
  const OLDER = "00000000-0000-4000-8000-0000000000e8";
  /** An older test that earns Mastered on 3.3; the newer test skips 3.3 and supplies the profile's test. */
  const older = { id: OLDER, childId: CHILD, completedAt: "2026-10-01T18:00:00.000Z", profile: testProfile({ "3.3": [5, 5] }) };
  const newer = { id: TEST, childId: CHILD, completedAt: "2026-10-20T18:00:00.000Z", profile: testProfile({ "4.1": [1, 1] }) };

  /** Deletes the older test just before the first save that carries history rows. */
  function deleteBeforeSave(f: ReturnType<typeof family>): ChildProfileStore {
    let done = false;
    return {
      ...f.profiles,
      async save(row, expected, signal) {
        if (!done && row.skillChanges) {
          done = true;
          f.deleteTest(OLDER);
        }
        return f.profiles.save(row, expected, signal);
      },
    };
  }

  it("adds no row from the deleted test on a later save, and builds again", async () => {
    const f = family({ tests: [newer] });
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ built: true, revision: 1, skillStates: { outcome: "recorded", changes: 0 } });
    f.tests.push(older);
    // The first try saves over a valid build token and a test that still exists; only the older test is gone.
    expect(await rebuildChildProfile(CHILD, { ...f, profiles: deleteBeforeSave(f) })).toMatchObject({ built: true, revision: 2, skillStates: { outcome: "recorded", changes: 0 } });
    expect(f.history()).toEqual([]);
    expect((await readChildProfile(f.profiles, CHILD))?.profile.assessment?.assessmentId).toBe(TEST);
  });

  it("adds no row from the deleted test on a first save", async () => {
    const f = family({ tests: [older, newer] });
    expect(await rebuildChildProfile(CHILD, { ...f, profiles: deleteBeforeSave(f) })).toMatchObject({ built: true, revision: 1, skillStates: { outcome: "recorded", changes: 0 } });
    expect(f.history()).toEqual([]);
  });

  it("adds the row when the test is still there", async () => {
    const f = family({ tests: [older, newer] });
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ built: true, skillStates: { outcome: "recorded", changes: 1 } });
    expect(changes(f)).toEqual([{ standard: "3.3", state: "mastered", reason: "secure_on_test", evidenceSource: "test" }]);
  });
});

function never(): never {
  throw new Error("expected a stored event");
}
