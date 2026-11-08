import { describe, expect, it, vi } from "vitest";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { createSession, fallbacks, heldReason, heldSentences, memoryWordingHistoryStore, NEVER_SAY, step, TALK_REVIEW_SYSTEM, TEMPLATES, type Effect, type Session } from "@/lib/maya";
import { mayaCalls, type CallResult, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { callNotes, noteSentences, noteStep } from "@/lib/maya-call-note";
import { memoryNoteStore, type MemoryCall } from "@/lib/maya-call-note-memory";
import { heldPackage } from "@/lib/maya-held-fixture";
import type { MayaModel } from "@/lib/maya-model";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { checkTrace, PRE_D304_HELD, TRACE_VERSION, type MayaTrace } from "@/lib/maya-trace";

// A question Maya cannot teach yet (#527, D-304), through the call module's public interface on the in-memory seams:
// chat, an admin test call and a voice call each give code's held turn (hello, that Maya is an AI, plainly that she
// cannot teach this question yet, and an invitation to pick another question on the page), ask the model nothing,
// write no learning event and rebuild no profile. The parent's note says the same in plain words.

const TEST_PARENT = "11111111-1111-4111-8111-111111111111";
const PARENT = "44444444-4444-4444-8444-444444444444";
const CHILD = "55555555-5555-4555-8555-555555555555";
const T0 = Date.UTC(2026, 10, 4, 16, 0, 0);
// The held lines by id and wording, in order (D-304). A hold from the start: held.hello.0, held.cannot.0,
// held.next.0. A hold found during the call does not repeat the hello (Maya said she is an AI at the opening):
// held.cannot.0 then held.next.0 only, as PR #581 did.
const text = (id: "held.hello" | "held.cannot" | "held.next" | "redirect.back", n = 0) => TEMPLATES[id][n];
const START_IDS = [["held.hello", 0], ["held.cannot", 0], ["held.next", 0]] as const;
const MID_IDS = [["held.cannot", 0], ["held.next", 0]] as const;
const HELD = START_IDS.map(([id, n]) => text(id, n)).join(" ");
const HELD_MID = MID_IDS.map(([id, n]) => text(id, n)).join(" ");
const HELLO_AND_BACK = [...TEMPLATES["held.hello"], ...TEMPLATES["redirect.back"]];
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
  const notes = callNotes({ store: notesStore, ai: null, isTestFamily: async (p) => p === TEST_PARENT, clock: () => now + 60_000, childNames: async () => ({ firstName: "Leah", formerNames: [] }) });
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
    expect(HELD).toBe("Hi, I'm Maya, an AI. Sorry, I can't teach this question yet. Want to pick another question on this page?");
    expect(heldSentences(true)).toEqual(["Hi, I'm Maya, an AI.", "Sorry, I can't teach this question yet.", "Want to pick another question on this page?"]);
    expect(heldSentences(false)).toEqual(["Sorry, I can't teach this question yet.", "Want to pick another question on this page?"]);
    for (const line of heldSentences(true)) expect(line).not.toMatch(/\u2014|fun|enjoy|happy|promise|will|soon|grown-up/i);
  });

  it("the review keeps Maya's own words from adding claims about what she can teach (code's held lines say it)", () => {
    const rule = NEVER_SAY.find((entry) => entry.id === "held_limit");
    expect(rule?.examples).toEqual(expect.arrayContaining([
      "I can't help with this kind of question yet.",
      "I can't teach this question.",
      "I'm not yet able to teach this.",
      "I don't know how to teach this question.",
    ]));
    expect(TALK_REVIEW_SYSTEM).toContain("held_limit:");
    // Safety and privacy disclosures keep their separate rules.
    expect(TALK_REVIEW_SYSTEM).toContain("I can't keep secrets");
  });
});

describe("a held question in a call (#527)", () => {
  it("chat: Maya says the held turn, asks the model nothing and the call ends with no learning event", async () => {
    const s = setup();
    const r = ok(await s.calls.start({ kind: "chat", parentId: PARENT, childId: CHILD, childName: "Leah", startedBy: PARENT, package: PKG }));
    expect(r.output.say).toEqual([HELD]);
    expect(HELD).toBe([text("held.hello", 0), text("held.cannot", 0), text("held.next", 0)].join(" "));
    expect(r.view.transcript.map((l) => [l.speaker, l.text])).toEqual([["maya", HELD]]);
    for (const line of TEMPLATES["redirect.back"]) expect(r.output.say.join(" ")).not.toContain(line);
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
      "She asked Leah to pick another question on the page.",
    ]);
    expect(note.facts.stuckOn).toBeNull();
    expect(note.warm).toBeNull();
  });

  it("an admin test call gives the same held turn", async () => {
    const s = setup();
    const r = ok(await s.calls.start({ kind: "admin_test", parentId: TEST_PARENT, childId: CHILD, childName: "Leah", startedBy: "admin-1", package: PKG }));
    expect(r.output.say).toEqual([HELD]);
    expect(r.view.status).toBe("ended");
    expect(r.view.outcome?.reason).toBe("content_issue");
    expect(s.propose).not.toHaveBeenCalled();
    expect(r.view.learningEventId).toBeNull();
    expect(await s.readEvents()).toEqual([]);
    expect(s.rebuild).not.toHaveBeenCalled();
    const record = await s.store.get(r.view.id);
    expect(checkTrace(record!.trace)).toMatchObject({ ok: true });
  });

  it("voice: Maya says the held turn when the child joins, and the call ends", async () => {
    const s = setup();
    const view = ok(await s.calls.startVoice({ kind: "admin_test", parentId: TEST_PARENT, childId: CHILD, childName: "Leah", startedBy: "admin-1", package: PKG })).view;
    const opened = await s.calls.openVoice(view.id, { speechToText: "fake", voice: "fake" }, "Leah");
    if (!opened.ok) throw new Error(opened.error);
    const turn = await opened.call.start();
    expect(turn.say).toEqual([HELD]);
    expect(turn.say.join(" ")).toBe([text("held.hello", 0), text("held.cannot", 0), text("held.next", 0)].join(" "));
    for (const line of TEMPLATES["redirect.back"]) expect(turn.say.join(" ")).not.toContain(line);
    expect(turn.ended).toBe(true);
    // The worker ends the call once the final turn is spoken (a final voice turn stays live until then).
    await opened.call.end({ reason: "child_stopped" });
    await opened.call.settled();
    expect(s.propose).not.toHaveBeenCalled();
    const after = await s.calls.view(view.id);
    expect(after?.outcome?.reason).toBe("content_issue");
    expect(after?.learningEventId).toBeNull();
    expect(await s.readEvents()).toEqual([]);
    expect(s.rebuild).not.toHaveBeenCalled();
    const record = await s.store.get(view.id);
    expect(record).toMatchObject({ mode: "voice", status: "ended" });
    expect(checkTrace(record!.trace)).toMatchObject({ ok: true });
  });
});

describe("a hold found during the call (#527, D-304)", () => {
  const said = (effects: Effect[]) => effects.flatMap((e) => (e.kind === "say" ? [e.text] : [])).join(" ");
  const send = (session: Session, event: Parameters<typeof step>[1]) => {
    const r = step(session, event);
    expect(r.refusal).toBeNull();
    return r;
  };

  it("after the opening: exactly held.cannot.0 then held.next.0, with no held.hello and no redirect.back", () => {
    let s = createSession({ callId: "held-mid", package: SAMPLE_PACKAGES["add-27-39"] });
    s = send(s, { type: "start", at: T0 }).session;
    s = send(s, { type: "proposal", at: T0 + 100, proposal: fallbacks(s)[0], fallback: true }).session;
    expect(s.opened).toBe(true);
    s = send(s, { type: "content_problem", at: T0 + 200, detail: "the answer key and the worked steps disagree" }).session;
    const [held] = fallbacks(s);
    const parts = held.parts as { line?: string }[];
    expect(parts.map((p) => p.line)).toEqual(["held.cannot", "held.next"]);
    // The model may not add the hello again or lead back with redirect.back.
    for (const extra of ["held.hello", "redirect.back"]) {
      const r = step(s, { type: "proposal", at: T0 + 250, proposal: { ...held, parts: [{ line: extra, slots: {} }, ...held.parts] } as typeof held });
      expect(r.refusal).toMatchObject({ code: "content_hold" });
    }
    const r = send(s, { type: "proposal", at: T0 + 300, proposal: held, fallback: true });
    expect(said(r.effects)).toBe(HELD_MID);
    for (const line of HELLO_AND_BACK) expect(said(r.effects)).not.toContain(line);
    expect(r.session.outcome?.reason).toBe("content_issue");
  });

  it("before any hello: the fallback says all three, hello first", () => {
    let s = createSession({ callId: "held-early", package: SAMPLE_PACKAGES["add-27-39"] });
    s = send(s, { type: "start", at: T0 }).session;
    s = send(s, { type: "content_problem", at: T0 + 100, detail: "the answer key and the worked steps disagree" }).session;
    const [held] = fallbacks(s);
    expect(held).toMatchObject({ act: "close", parts: START_IDS.map(([line]) => ({ line })) });
    expect(said(send(s, { type: "proposal", at: T0 + 200, proposal: held, fallback: true }).effects)).toBe(HELD);
  });
});

describe("stored held traces stay readable (D-304, trace version 9)", () => {
  // A held chat's real trace, rewritten to a version and a held text: the text is in the controller turn's output.
  async function heldTrace(): Promise<MayaTrace> {
    const s = setup();
    const r = ok(await s.calls.start({ kind: "chat", parentId: PARENT, childId: CHILD, childName: "Leah", startedBy: PARENT, package: PKG }));
    return (await s.store.get(r.view.id))!.trace!;
  }
  const rewrite = (trace: MayaTrace, version: number, held: string) => {
    const json = JSON.parse(JSON.stringify(trace));
    json.version = version;
    let n = 0;
    for (const t of json.turns) if (t.kind === "maya" && t.output?.say?.[0] === HELD) { t.output.say = [held]; n++; }
    expect(n).toBe(1);
    return json;
  };

  it("writes version 9 with the D-304 held text", async () => {
    const trace = await heldTrace();
    expect(TRACE_VERSION).toBe(9);
    expect(trace.version).toBe(9);
    expect(checkTrace(trace)).toMatchObject({ ok: true });
  });

  it("reads a version 8 trace that holds the held text from before D-304", async () => {
    expect(PRE_D304_HELD).toBe("Hi, I'm Maya, an AI. Want to pick another question on this page?");
    expect(checkTrace(rewrite(await heldTrace(), 8, PRE_D304_HELD))).toMatchObject({ ok: true });
  });

  it("refuses a version 9 trace that holds the old held text, and a version 8 trace that holds the new one", async () => {
    expect(checkTrace(rewrite(await heldTrace(), 9, PRE_D304_HELD))).toMatchObject({ ok: false, reason: expect.stringContaining("exact held lines") });
    expect(checkTrace(rewrite(await heldTrace(), 8, HELD))).toMatchObject({ ok: false, reason: expect.stringContaining("exact held lines") });
  });
});
