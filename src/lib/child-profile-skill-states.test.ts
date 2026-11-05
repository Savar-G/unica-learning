import { afterEach, describe, expect, it, vi } from "vitest";
import { learnerProfile, type LearnerProfile } from "@/lib/assessment";
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

  it("writes a Not started row when the evidence goes away", async () => {
    const f = family();
    await rebuildChildProfile(CHILD, f);
    f.deleteTest(TEST);
    // The test's deletion removes the profile built on it, and the child has nothing left to build from.
    await f.profiles.save({ childId: CHILD, parentId: PARENT, assessmentId: null, profile: (await emptyProfile())! }, null);
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ built: true, skillStates: { outcome: "recorded", changes: 2 } });
    expect(changes(f).slice(2)).toEqual([
      { standard: "3.3", state: "not_started", reason: "no_evidence", evidenceSource: "none" },
      { standard: "3.4", state: "not_started", reason: "no_evidence", evidenceSource: "none" },
    ]);
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
  it("does not stop the profile when the write fails, and the next rebuild writes what it missed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = family();
    const failing: ChildProfileStore = { ...f.profiles, recordSkillStates: () => Promise.reject(new Error("history down")) };
    expect(await rebuildChildProfile(CHILD, { ...f, profiles: failing })).toMatchObject({ built: true, revision: 1, skillStates: { outcome: "failed", problem: "history down" } });
    expect((await readChildProfile(f.profiles, CHILD))?.revision).toBe(1);
    expect(changes(f)).toEqual([]);
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ built: true, revision: 2, skillStates: { outcome: "recorded", changes: 2 } });
  });

  it("does not stop the profile when the read fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = family();
    const failing: ChildProfileStore = { ...f.profiles, skillInputs: () => Promise.reject(new Error("read down")) };
    expect(await rebuildChildProfile(CHILD, { ...f, profiles: failing })).toMatchObject({ built: true, revision: 1, skillStates: { outcome: "failed", problem: "read down" } });
  });
});

describe("the history's store rules", () => {
  it("writes nothing from a build that is no longer stored: the newer build writes its own states", async () => {
    const f = family();
    await rebuildChildProfile(CHILD, f);
    const before = f.history();
    expect(await f.profiles.recordSkillStates({ childId: CHILD, parentId: PARENT, buildToken: "00000000-0000-4000-8000-000000000001", states: [{ standard: "3.3", state: "needs_review", reason: "failed_review", evidence: "pages" }] })).toBe("changed");
    expect(f.history()).toEqual(before);
  });

  it("a slower rebuild never writes over a newer one", async () => {
    const f = family();
    let raced = false;
    // After this rebuild stores its build and before it writes its states, another rebuild stores and writes.
    const racing: ChildProfileStore = {
      ...f.profiles,
      async recordSkillStates(row) {
        if (!raced) {
          raced = true;
          f.workbooks.push({ childId: CHILD, number: 1, status: "shipped", standards: ["3.5"] });
          expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ built: true, revision: 2, skillStates: { outcome: "recorded", changes: 3 } });
        }
        return f.profiles.recordSkillStates(row);
      },
    };
    expect(await rebuildChildProfile(CHILD, { ...f, profiles: racing })).toMatchObject({ built: true, revision: 1, skillStates: { outcome: "late" } });
    expect(changes(f).map((r) => r.standard)).toEqual(["3.3", "3.4", "3.5"]);
  });

  it("refuses a write for a family being deleted", async () => {
    const f = family();
    await rebuildChildProfile(CHILD, f);
    const token = (await f.profiles.current(CHILD))!.buildToken;
    f.deleting.push(PARENT);
    await expect(f.profiles.recordSkillStates({ childId: CHILD, parentId: PARENT, buildToken: token, states: [] })).rejects.toThrow("family_unavailable");
  });
});

/** A profile as an empty build stores it, for a child whose inputs are gone. */
async function emptyProfile() {
  const f = family({ tests: [] });
  await f.record.append(event({}));
  await rebuildChildProfile(CHILD, f);
  const read = await readChildProfile(f.profiles, CHILD);
  return read && { ...read.profile, standards: [], secure: [], notYetSecure: [], events: { counted: 0, inAssessmentProfile: 0, lastAt: null } };
}

function never(): never {
  throw new Error("expected a stored event");
}
