import { fakeMathReviewer } from "@/lib/maya-math-review";
import { describe, expect, it, vi } from "vitest";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { mayaCalls, type CallResult, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore } from "@/lib/maya-call-memory";
import type { TurnBrief } from "@/lib/maya-model";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import type { QuestionPackage } from "@/lib/question-package";
import { childChatView } from "@/lib/maya-chat";
import { deskVoiceCall } from "@/lib/maya-voice-desk";

// The model never sees the child's name: it writes {name}. No line Maya says, streams or shows may keep that token.
const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const TEST = "33333333-3333-4333-8333-333333333333";
const T0 = Date.UTC(2026, 10, 12, 16, 0, 0);
const PKG: QuestionPackage = { ...SAMPLE_PACKAGES["subtract-52-28"], id: `${TEST}:s1-4`, ref: { source: "assessment", assessmentId: TEST, questionId: "s1-4" } };

function tutor(brief: TurnBrief) {
  const t = brief.childTurn ?? "";
  if (/stop/i.test(t)) return reply("Okay, {name}, we can stop here. Thanks for working on it with me. Bye for now!", "close", { reading: { stop: true } });
  if (/hi/i.test(t)) return reply("Hi {name}! Let's start with the ones. What do you see there?", "guide", { step: "ones" });
  if (/again/i.test(t)) return reply("Look at the ones again, {name}. What is 12 minus 8?", "guide", { step: "ones", level: 1 });
  return reply("Okay, {name}, we can stop here. Thanks for working on it with me. Bye for now!", "close", { reading: { stop: true } });
}

function setup(name: string) {
  let now = T0;
  let n = 0;
  const store = memoryCallStore({ testFamilies: [PARENT] });
  const eventStore = memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }], tests: [{ id: TEST, childId: CHILD }] });
  const model = conversationalFake({ id: "fake-v3", answer: tutor });
  const seams: CallSeams = {
    store, history: memoryWordingHistoryStore(), events: learningEvents(eventStore), rebuild: vi.fn(async () => true),
    model: (id) => (id === null || id === "fake-v3" ? model : null),
    isTestFamily: async (parentId) => parentId === PARENT,
    canChat: async () => true, note: async () => "done" as const, reviewer: () => fakeTalkReviewer(), mathReviewer: () => fakeMathReviewer(),
    alerts: { send: async () => {}, list: async () => [] }, clock: () => now,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, seed: () => 42,
  };
  return { calls: mayaCalls(seams), advance: (s: number) => (now += s * 1000), name };
}
const ok = (r: CallResult) => { if (!r.ok) throw new Error(`refused: ${r.error}`); return r; };

describe("no Maya line keeps an unfilled {name}", () => {
  it.each([["Ava"], ["Mary Ann"], ["A.J."], ["O'Neil"]])("known name %s: every turn", async (name) => {
    const s = setup(name);
    let r = ok(await s.calls.start({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: name, grade: 3, package: PKG, startedBy: "admin-1" }));
    const said = [...r.output.say];
    for (const text of ["Hi, Maya", "Can you say it again?", "Please stop, bye."]) {
      if (r.view.status === "ended") break;
      s.advance(5);
      r = ok(await s.calls.input(r.view.id, r.view.revision, { type: "child", text }, name));
      said.push(...r.output.say);
    }
    expect(said.length).toBeGreaterThan(1);
    for (const line of said) expect(line).not.toContain("{name}");
  });
  it("absent name leaves no placeholder", async () => {
    const s = setup("");
    let r = ok(await s.calls.start({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: null, grade: 3, package: PKG, startedBy: "admin-1" }));
    const said = [...r.output.say];
    for (const text of ["Hi, Maya", "Please stop, bye."]) {
      if (r.view.status === "ended") break;
      s.advance(5);
      r = ok(await s.calls.input(r.view.id, r.view.revision, { type: "child", text }, null));
      said.push(...r.output.say);
    }
    for (const line of said) expect(line).not.toContain("{name}");
  });
});

describe("the desk's displayed transcript (the saved trace hides the name as {name})", () => {
  it.each([["Ava", "voice"], ["Mary Ann", "chat"], ["A.J.", "voice"]])("fills %s in the %s transcript, even for a resumed read", async (name, kind) => {
    const s = setup(name);
    let r = ok(await s.calls.start({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: name, grade: 3, package: PKG, startedBy: "admin-1" }));
    for (const text of ["Hi, Maya", "Can you say it again?", "Hi, I am " + name + ". Please stop, bye."]) {
      if (r.view.status === "ended") break;
      s.advance(5);
      r = ok(await s.calls.input(r.view.id, r.view.revision, { type: "child", text }, name));
    }
    // The saved trace itself keeps the placeholder (privacy), so the desk's view must fill it.
    expect(r.view.transcript.some((l) => l.text.includes("{name}"))).toBe(true);
    const shown = (kind === "chat" ? childChatView(r.view, name) : deskVoiceCall(r.view, name)).transcript;
    for (const l of shown) expect(l.text).not.toContain("{name}");
    expect(shown.find((l) => l.speaker === "maya" && l.text.includes("start with the ones"))?.text).toContain(`Hi ${name}! Let`);
    expect(shown.some((l) => l.text.includes("we can stop here"))).toBe(true);
  });
  it("an absent name leaves the words around it, with no placeholder", async () => {
    const s = setup("");
    let r = ok(await s.calls.start({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: null, grade: 3, package: PKG, startedBy: "admin-1" }));
    for (const text of ["Hi, Maya", "Please stop, bye."]) {
      if (r.view.status === "ended") break;
      s.advance(5);
      r = ok(await s.calls.input(r.view.id, r.view.revision, { type: "child", text }, null));
    }
    for (const l of childChatView(r.view, null).transcript) expect(l.text).not.toContain("{name}");
    for (const l of childChatView(r.view).transcript) expect(l.text).not.toContain("{name}");
  });
});
