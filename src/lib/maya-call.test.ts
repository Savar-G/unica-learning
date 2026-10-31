import { describe, expect, it, vi } from "vitest";
import { templateSkills } from "@/lib/assessment";
import { penHolder, replayOf } from "@/lib/board-history";
import { learningEvents, type LearningEventStore } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { mayaCalls, boardPlayback, type CallInput, type CallResult, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore } from "@/lib/maya-call-memory";
import type { MayaModel } from "@/lib/maya-model";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { checkTrace, TRACE_VERSION } from "@/lib/maya-trace";
import type { QuestionPackage } from "@/lib/question-package";

// Maya's calls (#323) through the module's public interface, on the in-memory seams: the call store, the learning
// events, a profile rebuild that counts its calls, the rule model, a passed-in clock, ids and seed.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const TEST = "33333333-3333-4333-8333-333333333333";
const REAL_PARENT = "44444444-4444-4444-8444-444444444444";
const REAL_CHILD = "55555555-5555-4555-8555-555555555555";
const T0 = Date.UTC(2026, 9, 31, 16, 0, 0);

/** 27 + 39 as an assessment question of the test family's child. */
const PKG: QuestionPackage = {
  ...SAMPLE_PACKAGES["add-27-39"],
  id: `${TEST}:s1-4`,
  ref: { source: "assessment", assessmentId: TEST, questionId: "s1-4" },
  templateId: "2-add-2-digit",
  skill: { standard: "2.4", skills: templateSkills("2-add-2-digit").map((k) => k.id) },
};

/** scripts/maya-text/no-start.txt: the easier example first, then the child's own question with hints, solved. */
const NO_START = ["I don't know how to start.", "Okay.", "Is it 56?", "Can you help me?", "16", "66", "Because the ones made a ten, so I carried it.", "I wrote it."];

function setup(options: { events?: LearningEventStore; model?: (id: string | null) => MayaModel | null } = {}) {
  let now = T0;
  let n = 0;
  const store = memoryCallStore({ testFamilies: [PARENT] });
  const eventStore = options.events ?? memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }, { id: REAL_CHILD, parentId: REAL_PARENT }], tests: [{ id: TEST, childId: CHILD }] });
  const rebuild = vi.fn(async () => true);
  const seams: CallSeams = {
    store,
    events: learningEvents(eventStore),
    rebuild,
    model: options.model ?? ((id) => (id === null || id === "fake" ? ruleMayaModel() : null)),
    isTestFamily: async (parentId) => parentId === PARENT,
    clock: () => now,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    seed: () => 42,
  };
  const calls = mayaCalls(seams);
  const events = learningEvents(eventStore);
  const readEvents = (childId = CHILD) => events.read(childId, { from: "2026-01-01T00:00:00Z", to: "2027-01-01T00:00:00Z" });
  return { calls, store, rebuild, readEvents, advance: (s: number) => (now += s * 1000) };
}

const ok = (r: CallResult) => {
  if (!r.ok) throw new Error(`refused: ${r.error}`);
  return r;
};

async function talk(s: ReturnType<typeof setup>, turns: string[]) {
  let r = ok(await s.calls.start({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: "admin-1" }));
  for (const text of turns) {
    if (r.view.status === "ended") break;
    s.advance(5);
    r = ok(await s.calls.input(r.view.id, r.view.revision, { type: "child", text }, "Leah"));
  }
  return r;
}

describe("an admin test call", () => {
  it("runs a whole call, saves it, writes one learning event and rebuilds the profile", async () => {
    const s = setup();
    const first = ok(await s.calls.start({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: "admin-1" }));
    // A second call does the work; the first stays live, and nothing of it is written to the learning record.
    expect(first.view.status).toBe("live");
    expect(first.view.model).toEqual({ id: "fake", fake: true, promptVersion: expect.any(String) });
    expect(first.output.say.join(" ")).toMatch(/\bAI\b/);
    expect(first.view.transcript[0]).toMatchObject({ speaker: "maya" });

    const end = await talk(s, NO_START);
    expect(end.view.status).toBe("ended");
    expect(end.view.outcome).toMatchObject({ reason: "solved", paperStatus: "child_confirmed" });
    expect(end.view.outcome?.assistance).not.toBe("independent");
    expect(end.view.batches.length).toBeGreaterThan(0);
    expect(end.view.transcript.filter((l) => l.speaker === "child").map((l) => l.text)).toEqual(NO_START);
    expect(end.view.counts).toMatchObject({ childTurns: NO_START.length });

    // The stored record: the trace in the shared format, the board history, the versions; no saved session left.
    const row = s.store.rows().find((r) => r.id === end.view.id)!;
    expect(row.live).toBeNull();
    expect(checkTrace(row.trace).ok).toBe(true);
    expect(row.trace?.question.hash).toBe(row.packageHash);
    expect(row.versions).toMatchObject({ trace: TRACE_VERSION, proposal: expect.any(Number), session: expect.any(Number) });
    expect(row.boardHistory?.events.filter((e) => e.kind === "maya")).toHaveLength(row.trace!.board.length);
    expect(penHolder(row.boardHistory!)).toBe("maya");
    expect(replayOf(row.boardHistory!).maya.durationMs).toBeGreaterThan(0);
    // The child's name is never stored in the trace.
    expect(JSON.stringify(row.trace)).not.toContain("Leah");

    // One learning event for the target question, linked to the call; the profile rebuilt once.
    const events = await s.readEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ source: "call", result: "right_with_help", question: PKG.ref, evidence: { kind: "call", id: row.id } });
    expect(row.learningEventId).toBe(events[0].id);
    expect(s.rebuild).toHaveBeenCalledTimes(1);
    expect(s.rebuild).toHaveBeenCalledWith(CHILD);
    expect(row.profileRebuiltAt).not.toBeNull();
    expect(end.view.learningEventId).toBe(events[0].id);
  });

  it("refuses a family that is not a test family, and stores nothing", async () => {
    const s = setup();
    const r = await s.calls.start({ kind: "admin_test", parentId: REAL_PARENT, childId: REAL_CHILD, childName: "Sam", package: PKG, startedBy: "admin-1" });
    expect(r).toEqual({ ok: false, error: "not_test_family" });
    expect(s.store.rows()).toHaveLength(0);
    expect(await s.readEvents(REAL_CHILD)).toHaveLength(0);
    expect(s.rebuild).not.toHaveBeenCalled();
  });

  it("refuses a question package that does not check", async () => {
    const s = setup();
    const r = await s.calls.start({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: null, package: { ...PKG, answer: { value: { type: "number", value: 65 }, accepted: [], unit: null } }, startedBy: null });
    expect(r).toEqual({ ok: false, error: "invalid_question" });
  });

  it("refuses an input at an old revision, so two requests never both change a call", async () => {
    const s = setup();
    const first = ok(await s.calls.start({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: null, package: PKG, startedBy: null }));
    ok(await s.calls.input(first.view.id, first.view.revision, { type: "child", text: "I don't know how to start." }, null));
    expect(await s.calls.input(first.view.id, first.view.revision, { type: "child", text: "66" }, null)).toEqual({ ok: false, error: "conflict" });
    expect(await s.calls.input("00000000-0000-4000-8000-999999999999", 0, { type: "tick" }, null)).toEqual({ ok: false, error: "not_found" });
    expect(await s.calls.input(first.view.id, 2, { type: "child", text: " " }, null)).toEqual({ ok: false, error: "invalid_input" });
    expect(await s.calls.input(first.view.id, 2, { type: "child", text: "x".repeat(501) }, null)).toEqual({ ok: false, error: "invalid_input" });
    expect(await s.calls.input(first.view.id, 2, { type: "dance" } as unknown as CallInput, null)).toEqual({ ok: false, error: "invalid_input" });
  });

  it("hangs up: the call ends as child_stopped, with a blank event at the step where the child stopped", async () => {
    const s = setup();
    const r = await talk(s, ["I don't know how to start."]);
    s.advance(5);
    const end = ok(await s.calls.input(r.view.id, r.view.revision, { type: "end" }, null));
    expect(end.view.status).toBe("ended");
    expect(end.view.outcome?.reason).toBe("child_stopped");
    expect(end.view.transcript.at(-1)).toMatchObject({ speaker: "note", text: "The child hung up." });
    const row = s.store.rows().find((r) => r.id === end.view.id)!;
    expect(checkTrace(row.trace)).toMatchObject({ ok: true });
    expect(row.trace?.turns.some((t) => t.kind === "technical")).toBe(false);
    const [event] = await s.readEvents();
    expect(event).toMatchObject({ result: "blank", stuckStep: "ones" });
    // An ended call takes no more turns.
    expect(await s.calls.input(end.view.id, end.view.revision, { type: "child", text: "66" }, null)).toEqual({ ok: false, error: "conflict" });
  });

  it("keeps the call's final state when the event cannot be written, and writes it on the next try", async () => {
    const inner = memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }], tests: [{ id: TEST, childId: CHILD }] });
    let down = true;
    const flaky: LearningEventStore = { insert: (e) => (down ? Promise.reject(new Error("network")) : inner.insert(e)), range: (c, r) => inner.range(c, r) };
    const s = setup({ events: flaky });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const end = await talk(s, NO_START);
    expect(end.view.status).toBe("ended");
    expect(end.view.learningEventId).toBeNull();
    expect(s.store.rows()[0].live).not.toBeNull();
    expect(s.rebuild).not.toHaveBeenCalled();

    down = false;
    const again = ok(await s.calls.input(end.view.id, end.view.revision, { type: "end" }, null));
    expect(again.view.learningEventId).not.toBeNull();
    expect(again.view.profileRebuiltAt).not.toBeNull();
    expect(s.store.rows()[0].live).toBeNull();
    expect(await s.readEvents()).toHaveLength(1);
    expect(s.rebuild).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("ends the call when the model it started with is gone", async () => {
    let available = true;
    const s = setup({ model: (id) => (available && (id === null || id === "fake") ? ruleMayaModel() : null) });
    const first = ok(await s.calls.start({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: null, package: PKG, startedBy: null }));
    available = false;
    const end = ok(await s.calls.input(first.view.id, first.view.revision, { type: "child", text: "66" }, null));
    expect(end.view.status).toBe("ended");
    expect(end.view.outcome?.reason).toBe("technical_issue");
    expect(end.view.model.id).toBe("fake");
  });

  it("shows a saved call and a live one, and the board as the board core draws it", async () => {
    const s = setup();
    const live = await talk(s, ["I don't know how to start."]);
    const view = await s.calls.view(live.view.id);
    expect(view).toMatchObject({ status: "live", revision: live.view.revision });
    expect(view?.transcript).toEqual(live.view.transcript);
    const board = boardPlayback(view!.batches);
    expect(board.steps).toHaveLength(view!.batches.length);
    expect(board.steps.flatMap((x) => x.drawn).length).toBeGreaterThan(0);
    expect(board.viewBox.split(" ")).toHaveLength(4);
    expect(await s.calls.view("00000000-0000-4000-8000-999999999999")).toBeNull();
  });
});
