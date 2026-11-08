import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const policy = vi.hoisted(() => ({ countsCalls: false }));
vi.mock("@/lib/workbook-call-policy", () => ({ get WORKBOOK_COUNTS_CALL_EVENTS() { return policy.countsCalls; } }));
import { createSession, learnerProfile, storedTest } from "@/lib/assessment";
import { allRight, knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { memoryChildProfiles } from "@/lib/child-profile-memory";
import { readChildProfile, type ChildProfileStore } from "@/lib/child-profile";
import { prepareChildProfileForWorkbook, rebuildWorkbookLearnerProfile, WORKBOOK_LEARNER_DERIVED_VERSION, type WorkbookProfileSeams } from "@/lib/child-profile-server";
import { memoryLearnerProfileStore } from "@/lib/learner-profile-memory";
import { profileAiClient } from "@/lib/learner-profile-ai";
import { memoryReportReaders, type MemoryReportTables } from "@/lib/report-loading-memory";
import { fakePrintEngine } from "@/lib/print-engine-fake";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { memoryRunStore, memoryWorkbookJobSource } from "@/lib/workbook-job-memory";
import { runWorkbookJob, startWorkbookRun, type ChildInputs, type WorkbookJobDeps } from "@/lib/workbook-job";
import { planNextWorkbook } from "@/lib/workbook-placement";
import { keySolver } from "@/lib/workbook-solve-check";
import { memoryWorkbookFiles } from "@/lib/workbook-store-memory";
import { workbookTemplate } from "@/lib/workbook-template";

const CHILD = "00000000-0000-4000-8000-0000000000c1";
const PARENT = "00000000-0000-4000-8000-0000000000f1";
const TEST = "00000000-0000-4000-8000-0000000000e1";
const COMPLETED = "2026-10-28T17:00:00.000Z";
const ADMIN = { id: "admin", email: "admin@example.com" };
const BC = curriculumFor("bc")!;

/** A finished test, learner profiles and child profiles in memory. No real names, ids or answer text. */
function setup({ test = true, ahead = false }: { test?: boolean; ahead?: boolean } = {}) {
  const right = ahead ? allRight : knowsUpTo(2);
  const { asked, placement } = takeTest({ grade: 4, province: "BC" }, 71, right);
  const tables: MemoryReportTables = {
    assessments: test ? [{
      id: TEST, parentId: PARENT, childId: CHILD, status: "completed", grade: 4, province: "BC", completedAt: COMPLETED,
      placement, help: "no", test: storedTest(createSession({ grade: 4, province: "BC" }, 71)),
    }] : [],
    answers: asked.map((q, position) => ({
      assessmentId: TEST, position, questionId: q.id, response: right(q, position) ? q.answer : "no idea", correct: right(q, position),
      misconception: null, timeMs: 20_000, workRequired: false, workPath: null, workText: null,
    })),
  };
  const readers = memoryReportReaders(tables);
  const learner = memoryLearnerProfileStore(tables);
  const family = memoryChildProfiles({ children: [{ id: CHILD, parentId: PARENT, grade: 4 }], tests: [{ id: TEST, childId: CHILD, completedAt: COMPLETED, profile: null }] });
  // Both adapters read the same in-memory learner profile rows, as the live stores do.
  const profiles: ChildProfileStore = {
    ...family.profiles,
    async inputs(childId) {
      family.tests.splice(0, family.tests.length, ...(tables.assessments ?? []).flatMap((t) => {
        const row = learner.rows().find((r) => r.assessmentId === t.id);
        return t.status === "completed" && t.completedAt ? [{ id: t.id, childId: t.childId, completedAt: t.completedAt, profile: row?.profile ?? null }] : [];
      }));
      return family.profiles.inputs(childId);
    },
  };
  const rebuilds = { learner: 0, child: 0, prepare: 0 };
  const seams: WorkbookProfileSeams = {
    async latestFinishedBc(childId) {
      const latest = (tables.assessments ?? []).filter((a) => a.childId === childId && a.status === "completed" && a.placement?.scoredAgainst === "BC")
        .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))[0];
      if (!latest) return null;
      const row = learner.rows().find((r) => r.assessmentId === latest.id);
      return { assessmentId: latest.id, completedAt: latest.completedAt, schemaVersion: row?.schemaVersion ?? null, profile: row?.profile ?? null };
    },
    async rebuildLearner(assessmentId) {
      rebuilds.learner++;
      return rebuildWorkbookLearnerProfile(assessmentId, { reader: readers.key(), store: learner.store, ai: null });
    },
    child: { profiles: { ...profiles, inputs: async (id) => { rebuilds.child++; return profiles.inputs(id); } }, events: family.events, ai: null },
  };
  const inputs: ChildInputs = { parentId: PARENT, name: "Leah", grade: 4, province: "BC", profile: null, workbooks: [] };
  const drafts = memoryDraftStore({ [CHILD]: PARENT });
  let ids = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;
  const runs = memoryRunStore({ children: { [CHILD]: PARENT }, now: () => new Date(COMPLETED), newId, drafts });
  const ai = fakeAiClient({ answer: () => { throw new Error("a plan-only call must not write pages"); } });
  const source = memoryWorkbookJobSource({ [CHILD]: inputs }, async (id) => {
    rebuilds.prepare++;
    return prepareChildProfileForWorkbook(id, seams);
  });
  const deps: WorkbookJobDeps = {
    runs, drafts, source, ai, solver: keySolver(), files: memoryWorkbookFiles(), engine: fakePrintEngine(), template: workbookTemplate(),
    fit: () => ({ fits: async () => ({ ok: true }) }), newId, now: () => 0, budgetMs: 0,
    qrToken: () => "test-token", fileKey: () => "test-key", itemPolicy: "legacy",
  };
  const start = async () => {
    const result = await startWorkbookRun(runs, CHILD, ADMIN);
    if (result.status !== "started") throw new Error(result.status);
    return result.runId;
  };
  const facts = learnerProfile({
    placement, help: "no", learning: null,
    answers: asked.map((question, i) => ({
      question, response: right(question, i) ? question.answer : "no idea", correct: right(question, i), misconception: null,
      timeMs: 20_000, work: { required: false, drawing: false, typed: false }, readAloud: null, away: null,
    })),
  })!;
  const store = (profile: unknown, schemaVersion = 1, assessmentId = TEST) => {
    learner.rows().push({ assessmentId, parentId: PARENT, childId: CHILD, schemaVersion, profile });
  };
  return { runs, drafts, deps, start, seams, profiles, events: family.events, rebuilds, learner, tables, facts, store, ai, reader: readers.key() };
}

describe("P2 profile at plan time", () => {
  it("builds the missing child profile for a finished Grade 4 test with an empty learning card", async () => {
    const s = setup({ ahead: true });
    s.store({ ...s.facts, workbookDerivedVersion: WORKBOOK_LEARNER_DERIVED_VERSION });
    expect(await readChildProfile(s.profiles, CHILD)).toBeNull();
    expect(s.rebuilds).toEqual({ prepare: 0, learner: 0, child: 0 });
    const id = await s.start();
    // Starting the run does not backfill either profile.
    expect(await readChildProfile(s.profiles, CHILD)).toBeNull();
    expect(await runWorkbookJob(id, s.deps)).toBe("handed-on");
    const profile = await readChildProfile(s.profiles, CHILD);
    expect(profile).toMatchObject({ revision: 1, profile: { assessment: { assessmentId: TEST }, preferences: { styles: [], interests: [] } } });
    expect(await s.runs.frame(id)).toMatchObject({ profileRevision: profile!.revision });
    expect(s.rebuilds).toEqual({ prepare: 1, learner: 0, child: 1 });
  });

  it("plans from the new profile, with a different level than a grade-only book", async () => {
    const s = setup();
    const generic = planNextWorkbook({ curriculum: BC, grade: 4, profile: null, workbooks: [], number: 1 });
    const id = await s.start();
    expect(await runWorkbookJob(id, s.deps)).toBe("handed-on");
    const profile = (await readChildProfile(s.profiles, CHILD))!;
    const expected = planNextWorkbook({ curriculum: BC, grade: 4, profile: profile.profile, workbooks: [], number: 1 });
    if (!generic.ok || !expected.ok) throw new Error("fixture plans must be valid");
    expect(expected.plan.level).not.toBe(generic.plan.level);
    expect((await s.runs.frame(id))?.plan).toEqual(expected.plan);
    expect((await s.runs.frame(id))?.profileRevision).toBe(profile.revision);
    expect(s.rebuilds).toEqual({ prepare: 1, learner: 1, child: 1 });
  });

  it("refuses a generic plan when a BC test finishes after the first latest-test read (F1)", async () => {
    const s = setup({ test: false });
    const completed = setup();
    const latest = s.seams.latestFinishedBc;
    let first = true;
    s.seams.latestFinishedBc = async (childId) => {
      const before = await latest(childId);
      if (first) {
        first = false;
        // Codex's reproduction: completion is visible to the child build, but no learner row exists yet.
        s.tables.assessments!.push(...completed.tables.assessments!);
      }
      return before;
    };
    const id = await s.start();
    expect(await runWorkbookJob(id, s.deps)).toBe("failed");
    expect(s.tables.assessments![0].status).toBe("completed");
    expect((await s.runs.run(id))?.error).toBe("We couldn't build Leah's profile from the assessment. Try again, or check the admin profile page.");
    expect(await s.runs.frame(id)).toBeNull();
    expect(await s.drafts.draft((await s.runs.run(id))!.draftKey)).toBeNull();
    expect(s.rebuilds).toEqual({ prepare: 1, learner: 0, child: 1 });
    expect(s.ai.requests).toEqual([]);
  });

  it("makes a facts-round learner current after one rebuild across two preparations (F2)", async () => {
    const s = setup();
    const facts = {
      families: ["add20" as const], correct: 1, answered: 1, medianMs: 2000,
      accuracy: "secure" as const, speed: "quick" as const, seconds: 60, skipped: 0,
    };
    s.tables.assessments![0].placement!.facts = facts;
    s.store({ ...s.facts, facts });
    expect((await prepareChildProfileForWorkbook(CHILD, s.seams)).ok).toBe(true);
    expect((await prepareChildProfileForWorkbook(CHILD, s.seams)).ok).toBe(true);
    expect(s.rebuilds.learner).toBe(1);
    expect(s.rebuilds.child).toBe(2);
    expect(s.learner.rows()[0].profile).toMatchObject({ workbookDerivedVersion: WORKBOOK_LEARNER_DERIVED_VERSION, facts });
  });

  it("refuses an older profile when another BC test finishes after the child profile read", async () => {
    const s = setup();
    s.store({ ...s.facts, workbookDerivedVersion: WORKBOOK_LEARNER_DERIVED_VERSION });
    const latest = s.seams.latestFinishedBc;
    let reads = 0;
    s.seams.latestFinishedBc = async (childId) => {
      if (++reads === 2) {
        s.tables.assessments!.push({ ...s.tables.assessments![0], id: "newer-test", completedAt: "2026-10-29T17:00:00.000Z" });
      }
      return latest(childId);
    };
    const id = await s.start();
    expect(await runWorkbookJob(id, s.deps)).toBe("failed");
    expect((await s.runs.run(id))?.error).toBe("We couldn't build Leah's profile from the assessment. Try again, or check the admin profile page.");
    expect(await s.runs.frame(id)).toBeNull();
    expect(reads).toBe(2);
  });

  it("accepts a profile built from a later completed test than the final latest-test snapshot", async () => {
    const s = setup();
    const current = { ...s.facts, workbookDerivedVersion: WORKBOOK_LEARNER_DERIVED_VERSION };
    s.store(current);
    const snapshot = await s.seams.latestFinishedBc(CHILD);
    s.seams.latestFinishedBc = async () => snapshot;
    const inputs = s.seams.child.profiles.inputs;
    s.seams.child.profiles.inputs = async (childId) => {
      s.tables.assessments!.push({ ...s.tables.assessments![0], id: "newer-test", completedAt: "2026-10-29T17:00:00.000Z" });
      s.store(current, 1, "newer-test");
      return inputs(childId);
    };
    const result = await prepareChildProfileForWorkbook(CHILD, s.seams);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("the newer test's profile must be accepted");
    expect(result.profile?.profile.assessment?.assessmentId).toBe("newer-test");
    expect(s.rebuilds.learner).toBe(0);
  });

  it.each(["missing", "row schema", "JSON schema", "derived version"])("rebuilds a stale learner profile once: %s", async (kind) => {
    const s = setup();
    if (kind === "row schema") s.store(s.facts, 99);
    if (kind === "JSON schema") s.store({ ...s.facts, schemaVersion: 99 });
    if (kind === "derived version") s.store({ ...s.facts, workbookDerivedVersion: WORKBOOK_LEARNER_DERIVED_VERSION - 1 });
    expect((await prepareChildProfileForWorkbook(CHILD, s.seams)).ok).toBe(true);
    expect((await prepareChildProfileForWorkbook(CHILD, s.seams)).ok).toBe(true);
    expect(s.rebuilds.learner).toBe(1);
    expect((await readChildProfile(s.profiles, CHILD))?.profile.assessment?.profile.level).toEqual(s.facts.level);
  });

  it("keeps a current learner profile and always rebuilds the child profile", async () => {
    const s = setup();
    const facts = { ...s.facts, workbookDerivedVersion: WORKBOOK_LEARNER_DERIVED_VERSION };
    s.store(facts);
    expect((await prepareChildProfileForWorkbook(CHILD, s.seams)).ok).toBe(true);
    expect((await prepareChildProfileForWorkbook(CHILD, s.seams)).ok).toBe(true);
    expect(s.rebuilds).toMatchObject({ learner: 0, child: 2 });
    expect((await readChildProfile(s.profiles, CHILD))?.revision).toBe(2);
  });

  it("stores the learner facts before asking the normal AI writer and keeps the checked parts", async () => {
    const s = setup();
    const normal = profileAiClient({ NODE_ENV: "development", AI_REVIEW_FAKE: "sure" })!;
    const ai = { ...normal, json: async (...args: Parameters<typeof normal.json>) => {
      expect(s.learner.rows()).toHaveLength(1);
      expect(s.learner.rows()[0].profile).toMatchObject({ level: s.facts.level });
      expect(s.learner.rows()[0].profile).not.toHaveProperty("ai");
      return normal.json(...args);
    } };
    const result = await rebuildWorkbookLearnerProfile(TEST, { reader: s.reader, store: s.learner.store, ai });
    expect(result?.ai?.workbookPlan?.model).toBe("fake");
    expect(s.learner.rows()[0].profile).toMatchObject({ ai: result!.ai });
  });

  it("keeps learner facts on an AI failure and never saves late AI over a newer build", async () => {
    const s = setup();
    await rebuildWorkbookLearnerProfile(TEST, {
      reader: s.reader, store: s.learner.store,
      ai: { model: "failed", json: async () => { throw new Error("fake provider failed"); } },
    });
    expect(s.learner.rows()[0].profile).toMatchObject({ level: s.facts.level });
    expect(s.learner.rows()[0].profile).not.toHaveProperty("ai");
    const normal = profileAiClient({ NODE_ENV: "development", AI_REVIEW_FAKE: "sure" })!;
    const ai = { ...normal, json: async (...args: Parameters<typeof normal.json>) => {
      await rebuildWorkbookLearnerProfile(TEST, { reader: s.reader, store: s.learner.store, ai: null });
      return normal.json(...args);
    } };
    const result = await rebuildWorkbookLearnerProfile(TEST, { reader: s.reader, store: s.learner.store, ai });
    expect(result).not.toHaveProperty("ai");
    expect(s.learner.rows()[0].profile).not.toHaveProperty("ai");
  });

  it.each(["learner null", "learner error", "learner stale", "child save", "profile read", "wrong test"])("fails with a plain reason and no frame or draft: %s", async (kind) => {
    const s = setup();
    if (kind === "learner null") s.seams.rebuildLearner = async () => null;
    if (kind === "learner error") s.seams.rebuildLearner = async () => { throw new Error("private SQL error"); };
    if (kind === "learner stale") s.seams.rebuildLearner = async () => s.facts;
    if (kind === "child save") s.seams.child.profiles.save = async () => ({ refused: "private constraint" });
    if (kind === "profile read") {
      const current = s.seams.child.profiles.current;
      s.seams.child.profiles.current = async (id) => {
        if (await current(id)) throw new Error("private read error");
        return null;
      };
    }
    if (kind === "wrong test") {
      s.seams.child.profiles.inputs = async () => ({
        parentId: PARENT, grade: 4, learning: null,
        assessment: { assessmentId: "another-test", completedAt: COMPLETED, buildId: null, profile: { ...s.facts, workbookDerivedVersion: WORKBOOK_LEARNER_DERIVED_VERSION } },
      });
      // A readable profile from another test cannot satisfy this test's preparation.
      s.seams.child.profiles.save = async (row, expected) => s.profiles.save({ ...row, assessmentId: null }, expected);
    }
    const id = await s.start();
    expect(await runWorkbookJob(id, s.deps)).toBe("failed");
    expect(await s.runs.run(id)).toMatchObject({
      status: "failed", attempts: 1,
      error: "We couldn't build Leah's profile from the assessment. Try again, or check the admin profile page.",
    });
    expect(await s.runs.frame(id)).toBeNull();
    expect(await s.runs.pages(id)).toEqual([]);
    expect(await s.drafts.draft((await s.runs.run(id))!.draftKey)).toBeNull();
    expect(s.ai.requests).toEqual([]);
  });

  it("resumes with the saved frame and revision without rebuilding either profile", async () => {
    const s = setup();
    const id = await s.start();
    expect(await runWorkbookJob(id, s.deps)).toBe("handed-on");
    const frame = await s.runs.frame(id);
    const profile = await readChildProfile(s.profiles, CHILD);
    s.deps.source.prepareProfile = async () => { throw new Error("resume must never prepare profiles"); };
    expect(await runWorkbookJob(id, s.deps, { resume: true })).toBe("handed-on");
    expect(await s.runs.frame(id)).toEqual(frame);
    expect(await readChildProfile(s.profiles, CHILD)).toEqual(profile);
    expect(s.rebuilds).toEqual({ prepare: 1, learner: 1, child: 1 });
  });

  it("saves report and device inputs in the real job plan and never rereads them on resume", async () => {
    const s = setup({ ahead: true });
    const metadata = {
      report: { howWeHelp: "behind" as const, minutes: 55 },
      device: { deviceClass: "desktop" as const, input: "mouse" as const, screenWidth: 1440, screenHeight: 900, browser: "chrome" as const },
    };
    s.deps.source.planningMetadata = vi.fn(async assessmentId => {
      expect(assessmentId).toBe(TEST);
      return metadata;
    });
    const id = await s.start();
    expect(await runWorkbookJob(id, s.deps)).toBe("handed-on");
    const frame = JSON.parse(JSON.stringify(await s.runs.frame(id)));
    expect(frame.plan.personal.report).toEqual({ ...metadata.report, device: metadata.device });
    expect(frame.plan.personal.why.inputs.find((r: { label: string }) => r.label === "Report recommendation")).toMatchObject({ status: "Used", value: "Catch up" });
    expect(frame.plan.personal.why.inputs.find((r: { label: string }) => r.label === "Test length and device")).toMatchObject({ status: "Not used", value: "55 minutes; desktop, mouse" });
    expect(frame.plan.personal.why.warnings.some((w: string) => w.includes("do not agree"))).toBe(true);
    expect(await runWorkbookJob(id, s.deps, { resume: true })).toBe("handed-on");
    expect(s.deps.source.planningMetadata).toHaveBeenCalledOnce();
    expect(await s.runs.frame(id)).toEqual(frame);
  });

  it("refuses a resume without a frame before any profile build", async () => {
    const s = setup();
    const id = await s.start();
    expect(await s.runs.claim(id, "interrupted")).not.toBeNull();
    expect(await s.runs.yield(id, "interrupted")).toBe(true);
    expect(await runWorkbookJob(id, s.deps, { resume: true })).toBe("failed");
    expect(s.rebuilds).toEqual({ prepare: 0, learner: 0, child: 0 });
    expect(s.learner.rows()).toEqual([]);
  });

  it("keeps the grade-only plan when the child has no finished test", async () => {
    const s = setup({ test: false });
    const id = await s.start();
    expect(await runWorkbookJob(id, s.deps)).toBe("handed-on");
    const expected = planNextWorkbook({ curriculum: BC, grade: 4, profile: null, workbooks: [], number: 1 });
    if (!expected.ok) throw new Error(expected.reason);
    expect(await s.runs.frame(id)).toMatchObject({ plan: expected.plan, profileRevision: null });
    expect(await readChildProfile(s.profiles, CHILD)).toBeNull();
    expect(s.rebuilds).toEqual({ prepare: 1, learner: 0, child: 1 });
  });
});


it("leaves call events out of the workbook plan", async () => {
  const plain = setup({ test: false });
  const calls = setup({ test: false });
  for (let i = 0; i < 8; i++) {
    await calls.events.insert({ key: `call:${i}`, parentId: PARENT, childId: CHILD, source: "call",
      question: { source: "workbook", workbookId: TEST, page: 1, question: i + 1 },
      skill: { standard: "3.3", skills: [] }, result: "right", stuckStep: null, mistake: null,
      hints: 0, timeMs: 1000, occurredAt: COMPLETED, evidence: { kind: "call", id: `call:${i}` } });
  }
  const plainId = await plain.start();
  const callId = await calls.start();
  expect(await runWorkbookJob(plainId, plain.deps)).toBe("handed-on");
  expect(await runWorkbookJob(callId, calls.deps)).toBe("handed-on");
  expect((await calls.runs.frame(callId))!.plan).toEqual((await plain.runs.frame(plainId))!.plan);
  expect((await readChildProfile(calls.profiles, CHILD))!.profile.events.counted).toBe(8);
});


it.each(["marking", "assessment"] as const)("keeps %s events in the workbook plan", async (source) => {
  const plain = setup({ test: false });
  const withEvents = setup({ test: false });
  for (const fixture of [plain, withEvents]) {
    await fixture.events.insert({ key: "call:guard", parentId: PARENT, childId: CHILD, source: "call",
      question: { source: "workbook", workbookId: TEST, page: 1, question: 99 },
      skill: { standard: "3.1", skills: [] }, result: "right", stuckStep: null, mistake: null,
      hints: 0, timeMs: 1000, occurredAt: COMPLETED, evidence: null });
  }
  for (let i = 0; i < 8; i++) {
    const inserted = await withEvents.events.insert({ key: `${source}:${i}`, parentId: PARENT, childId: CHILD, source,
      question: source === "assessment" ? { source: "assessment", assessmentId: TEST, questionId: `q-${i}` } : { source: "workbook", workbookId: TEST, page: 1, question: i + 1 },
      skill: { standard: "3.3", skills: [] }, result: "right", stuckStep: null, mistake: null,
      hints: 0, timeMs: 1000, occurredAt: COMPLETED, evidence: null });
    expect(inserted).toHaveProperty("created", true);
  }
  const plainId = await plain.start();
  const eventId = await withEvents.start();
  expect(await runWorkbookJob(plainId, plain.deps)).toBe("handed-on");
  expect(await runWorkbookJob(eventId, withEvents.deps)).toBe("handed-on");
  expect((await withEvents.runs.frame(eventId))!.plan).not.toEqual((await plain.runs.frame(plainId))!.plan);
});

it("counts calls when enabled and keeps the stored profile unchanged by the filtered read", async () => {
  const s = setup({ test: false });
  const plain = setup({ test: false });
  for (let i = 0; i < 8; i++) {
    await s.events.insert({ key: `call:${i}`, parentId: PARENT, childId: CHILD, source: "call",
      question: { source: "workbook", workbookId: TEST, page: 1, question: i + 1 },
      skill: { standard: "3.3", skills: [] }, result: "right", stuckStep: null, mistake: null,
      hints: 0, timeMs: 1000, occurredAt: COMPLETED, evidence: null });
  }
  const plainId = await plain.start();
  expect(await runWorkbookJob(plainId, plain.deps)).toBe("handed-on");
  policy.countsCalls = true;
  const enabledId = await s.start();
  try {
    expect(await runWorkbookJob(enabledId, s.deps)).toBe("handed-on");
  } finally {
    policy.countsCalls = false;
  }
  const enabledPlan = (await s.runs.frame(enabledId))!.plan;
  expect(enabledPlan).not.toEqual((await plain.runs.frame(plainId))!.plan);
  const full = await readChildProfile(s.profiles, CHILD);
  expect(full?.profile.events.counted).toBe(8);
  const filtered = await prepareChildProfileForWorkbook(CHILD, s.seams);
  expect(filtered.ok && filtered.profile).toBeNull();
  const stored = await readChildProfile(s.profiles, CHILD);
  expect(stored?.profile).toEqual(full?.profile);
});

it("refuses to resume a frame made with another call event policy", async () => {
  const s = setup({ test: false });
  const id = await s.start();
  expect(await runWorkbookJob(id, s.deps)).toBe("handed-on");
  const frame = (await s.runs.frame(id))!;
  expect(frame.countsCallEvents).toBe(false);
  const original = s.deps.runs.frame;
  s.deps.runs.frame = async (runId) => {
    const saved = await original(runId);
    return saved ? { ...saved, countsCallEvents: true } : saved;
  };
  expect(await runWorkbookJob(id, s.deps, { resume: true })).toBe("failed");
  expect((await s.runs.run(id))?.error).toContain("call event policy changed");
});
