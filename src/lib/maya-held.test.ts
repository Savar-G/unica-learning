import { describe, expect, it, vi } from "vitest";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { heldReason, heldSentences, memoryWordingHistoryStore } from "@/lib/maya";
import { mayaCalls, type CallResult, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { callNotes, noteSentences, noteStep } from "@/lib/maya-call-note";
import { memoryNoteStore, type MemoryCall } from "@/lib/maya-call-note-memory";
import { heldPackage } from "@/lib/maya-held-fixture";
import type { MayaModel } from "@/lib/maya-model";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { checkTrace } from "@/lib/maya-trace";

// A question Maya cannot teach yet (#527), through the call module's public interface on the in-memory seams: chat,
// an admin test call and a voice call each give code's held turn (hello, that Maya is an AI, that she cannot help with
// this kind of question yet, and to pick another question or ask a grown-up), ask the model nothing, write no learning
// event and rebuild no profile. The parent's note says the same in plain words.

const TEST_PARENT = "11111111-1111-4111-8111-111111111111";
const PARENT = "44444444-4444-4444-8444-444444444444";
const CHILD = "55555555-5555-4555-8555-555555555555";
const T0 = Date.UTC(2026, 10, 4, 16, 0, 0);
const HELD = "Hi, I'm Maya, an AI. I can't help with this kind of question yet. Pick another question, or ask a grown-up.";
const PKG = heldPackage({ source: "workbook", workbookId: "wb-1", page: 4, question: 9 });

function setup() {
  let n = 0;
  const now = T0;
  const store = memoryCallStore({ testFamilies: [TEST_PARENT] });
  const eventStore = memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }] });
  const rebuild = vi.fn(async () => true);
  const model = ruleMayaModel();
  const propose = vi.fn((input: Parameters<MayaModel["propose"]>[0], signal: AbortSignal) => model.propose(input, signal));
  const ended: MemoryCall[] = [];
  const notesStore = memoryNoteStore({ calls: () => ended, testFamilies: [TEST_PARENT] });
  const notes = callNotes({ store: notesStore, ai: null, isTestFamily: async (p) => p === TEST_PARENT, clock: () => now + 60_000, childName: async () => "Leah" });
  const seams: CallSeams = {
    store,
    connections: memoryConnectionLog(store, () => now),
    history: memoryWordingHistoryStore(),
    events: learningEvents(eventStore),
    rebuild,
    model: (id) => (id === null || id === model.id ? { id: model.id, promptVersion: model.promptVersion, propose } : null),
    isTestFamily: async (p) => p === TEST_PARENT,
    canChat: async (p, c) => p === PARENT && c === CHILD,
    note: async (input) => {
      ended.push({ id: input.call.id, kind: input.call.kind, status: "ended", parentId: input.call.parentId, childId: input.call.childId });
      return noteStep(await notes.write(input), input.call.id);
    },
    alerts: { send: async () => {}, list: async () => [] },
    clock: () => now,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    seed: () => 42,
  };
  const readEvents = () => learningEvents(eventStore).read(CHILD, { from: "2026-01-01T00:00:00Z", to: "2027-01-01T00:00:00Z" });
  return { calls: mayaCalls(seams), store, propose, rebuild, readEvents, notesStore };
}

const ok = (r: CallResult) => {
  if (!r.ok) throw new Error(`refused: ${r.error}`);
  return r;
};

describe("the pre-check (#527)", () => {
  it("holds the yes-no question and every other package Maya cannot teach, with no model call", () => {
    expect(heldReason(PKG)).toBe("Maya cannot teach items with no operation yet");
    expect(heldReason({ ...SAMPLE_PACKAGES["add-27-39"], text: "" })).not.toBeNull();
    expect(heldReason(SAMPLE_PACKAGES["add-27-39"])).toBeNull();
    expect(heldReason(null)).not.toBeNull();
  });

  it("gives the held turn in short, plain sentences, with the AI disclosure first", () => {
    expect(heldSentences(true)).toEqual(["Hi, I'm Maya, an AI.", "I can't help with this kind of question yet.", "Pick another question, or ask a grown-up."]);
    expect(heldSentences(false)).toEqual(["I can't help with this kind of question yet.", "Pick another question, or ask a grown-up."]);
    for (const line of heldSentences(true)) expect(line).not.toMatch(/—|fun|enjoy|happy|promise|will|soon/i);
  });
});

describe("a held question in a call (#527)", () => {
  it("chat: Maya says the held turn, asks the model nothing and the call ends with no learning event", async () => {
    const s = setup();
    const r = ok(await s.calls.start({ kind: "chat", parentId: PARENT, childId: CHILD, childName: "Leah", startedBy: PARENT, package: PKG }));
    expect(r.output.say).toEqual([HELD]);
    expect(r.view.transcript.map((l) => [l.speaker, l.text])).toEqual([["maya", HELD]]);
    expect(r.view.transcript.map((l) => l.text).join(" ")).not.toMatch(/had fun/i);
    expect(r.view.status).toBe("ended");
    expect(r.view.outcome).toMatchObject({ reason: "content_issue", assistance: "independent", seconds: 0 });
    expect(s.propose).not.toHaveBeenCalled();
    expect(r.view.learningEventId).toBeNull();
    expect(await s.readEvents()).toEqual([]);
    expect(s.rebuild).not.toHaveBeenCalled();
    const record = await s.store.get(r.view.id);
    expect(checkTrace(record!.trace)).toMatchObject({ ok: true });
  });

  it("chat: the parent's note says the same in plain words, and nothing about how the child did", async () => {
    const s = setup();
    ok(await s.calls.start({ kind: "chat", parentId: PARENT, childId: CHILD, childName: "Leah", startedBy: PARENT, package: PKG }));
    const [note] = s.notesStore.rows();
    expect(noteSentences(note, "Leah")).toEqual([
      "Leah called Maya about page 4, question 9.",
      "Maya cannot help with this kind of question yet, so the call ended.",
      "She asked Leah to pick another question or ask a grown-up.",
    ]);
    expect(note.facts.stuckOn).toBeNull();
    expect(note.warm).toBeNull();
  });

  it("an admin test call gives the same held turn", async () => {
    const s = setup();
    const r = ok(await s.calls.start({ kind: "admin_test", parentId: TEST_PARENT, childId: CHILD, childName: "Leah", startedBy: "admin-1", package: PKG }));
    expect(r.output.say).toEqual([HELD]);
    expect(s.propose).not.toHaveBeenCalled();
  });

  it("voice: Maya says the held turn when the child joins, and the call ends", async () => {
    const s = setup();
    const view = ok(await s.calls.startVoice({ kind: "admin_test", parentId: TEST_PARENT, childId: CHILD, childName: "Leah", startedBy: "admin-1", package: PKG })).view;
    const opened = await s.calls.openVoice(view.id, { speechToText: "fake", voice: "fake" }, "Leah");
    if (!opened.ok) throw new Error(opened.error);
    const turn = await opened.call.start();
    expect(turn.say).toEqual([HELD]);
    expect(turn.ended).toBe(true);
    await opened.call.settled();
    expect(s.propose).not.toHaveBeenCalled();
    const after = await s.calls.view(view.id);
    expect(after?.outcome?.reason).toBe("content_issue");
    expect(after?.learningEventId).toBeNull();
  });
});
