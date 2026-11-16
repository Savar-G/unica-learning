import { describe, expect, it, vi } from "vitest";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { mayaCalls, type CallResult, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import type { TurnBrief } from "@/lib/maya-model";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";

// D-345: the tutor core on the family desk path (desk chat, kind "chat", and family voice, kind "family") behind the
// MAYA_TUTOR_FAMILIES switch, passed to the call module as `tutorFamilies`. Off keeps the controller; admin test calls
// are unchanged; a resumed call keeps what it started with.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const T0 = Date.UTC(2026, 10, 15, 16, 0, 0);
const WORKBOOK = "44444444-4444-4444-8444-444444444444";
const PKG = { ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook" as const, workbookId: WORKBOOK, page: 1, question: 1 } };

const answer = (brief: TurnBrief) =>
  /hi/i.test(brief.childTurn ?? "") ? reply("Hi Leah! Let's start with the ones. What do you see there?", "guide", { step: "ones" }) : reply("What is 12 minus 8?", "guide", { step: "ones" });

/** A brief from the tutor core (tutorBrief) carries mode "tutor"; the controller's brief does not. */
const isTutorBrief = (brief: unknown) => (brief as { mode?: string }).mode === "tutor";

function setup(store = memoryCallStore({ testFamilies: [PARENT] })) {
  let now = T0;
  let n = 0;
  const model = conversationalFake({ id: "fake-v3", answer });
  const review = fakeTalkReviewer();
  const reviewer = vi.fn(() => review);
  const seams = (tutorFamilies: boolean | undefined, extra: Partial<CallSeams> = {}): CallSeams => ({
    ...(tutorFamilies === undefined ? {} : { tutorFamilies }),
    store, history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }], tests: [] })),
    rebuild: vi.fn(async () => true),
    model: (id) => (id === null || id === "fake-v3" ? model : null),
    reviewer,
    mathReviewer: () => fakeMathReviewer(),
    isTestFamily: async (parentId) => parentId === PARENT,
    canChat: async () => true,
    canCallVoice: async () => true,
    connections: memoryConnectionLog(store, () => now),
    note: async () => "done" as const,
    alerts: { send: async () => {}, list: async () => [] },
    clock: () => now,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    seed: () => 42,
    ...extra,
  });
  return { store, model, review, reviewer, calls: (tutorFamilies?: boolean, extra?: Partial<CallSeams>) => mayaCalls(seams(tutorFamilies, extra)), advance: (s: number) => (now += s * 1000) };
}

const ok = (r: CallResult) => {
  if (!r.ok) throw new Error(`refused: ${r.error}`);
  return r;
};

/** The saved session of a stored call. */
const savedSession = (s: ReturnType<typeof setup>, id: string) => s.store.rows().find((x) => x.id === id)!.live!.text.session;

async function chat(s: ReturnType<typeof setup>, calls: ReturnType<typeof mayaCalls>) {
  const r = ok(await calls.start({ kind: "chat", parentId: PARENT, childId: CHILD, childName: "Leah", grade: 3, package: PKG, startedBy: PARENT }));
  s.advance(5);
  return ok(await calls.input(r.view.id, r.view.revision, { type: "child", text: "Hi, Maya" }, "Leah"));
}

async function familyVoice(s: ReturnType<typeof setup>, calls: ReturnType<typeof mayaCalls>, id?: string) {
  const callId = id ?? ok(await calls.startVoice({ kind: "family", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: PARENT })).view.id;
  const opened = await calls.openVoice(callId, { speechToText: "fake", voice: "fake" }, "Leah");
  if (!opened.ok) throw new Error(opened.error);
  await opened.call.start();
  return opened.call;
}

describe("the tutor core on family calls (MAYA_TUTOR_FAMILIES)", () => {
  it.each([undefined, false])("with the switch off (%s), a desk chat on 52 - 28 keeps the controller", async (flag) => {
    const s = setup();
    const r = await chat(s, s.calls(flag));
    expect(savedSession(s, r.view.id).tutor).toBeUndefined();
    expect(s.model.briefs.length).toBeGreaterThan(0);
    expect(s.model.briefs.some(isTutorBrief)).toBe(false);
  });

  it.each([undefined, false])("with the switch off (%s), a family voice call on 52 - 28 keeps the controller", async (flag) => {
    const s = setup();
    const call = await familyVoice(s, s.calls(flag));
    expect(call.session.tutor).toBeUndefined();
    s.advance(5);
    await call.child("Hi, Maya");
    expect(s.model.briefs.length).toBeGreaterThan(0);
    expect(s.model.briefs.some(isTutorBrief)).toBe(false);
  });

  it("with the switch on, a desk chat teaches with the tutor core, with the safety review", async () => {
    const s = setup();
    const r = await chat(s, s.calls(true));
    expect(savedSession(s, r.view.id).tutor).toBeDefined();
    expect(savedSession(s, r.view.id).channel).toBe("chat");
    expect(s.model.briefs.length).toBeGreaterThan(0);
    expect(s.model.briefs.every(isTutorBrief)).toBe(true);
    expect(r.output.say.join(" ")).toBe("Hi Leah! Let's start with the ones. What do you see there?");
    // The reviewer is present on the chat call, and it read the sentence that is not plain teaching.
    expect(s.reviewer).toHaveBeenCalledWith("fake-v3", expect.objectContaining({ kind: "chat", id: r.view.id }));
    expect(s.review.requests.length).toBeGreaterThan(0);
  });

  it("with the switch on, a family voice call teaches with the tutor core, with the safety review", async () => {
    const s = setup();
    const call = await familyVoice(s, s.calls(true));
    expect(call.session.tutor).toBeDefined();
    s.advance(5);
    await call.child("Hi, Maya");
    expect(s.model.briefs.length).toBeGreaterThan(0);
    expect(s.model.briefs.every(isTutorBrief)).toBe(true);
    expect(s.reviewer).toHaveBeenCalledWith("fake-v3", expect.objectContaining({ kind: "family", id: call.id }));
    expect(s.review.requests.length).toBeGreaterThan(0);
  });

  it.each([true, false, undefined])("an admin test call is unchanged by the switch (%s)", async (flag) => {
    const s = setup();
    const calls = s.calls(flag);
    const pkg = { ...SAMPLE_PACKAGES["subtract-52-28"], id: "33333333-3333-4333-8333-333333333333:s1-4", ref: { source: "assessment" as const, assessmentId: "33333333-3333-4333-8333-333333333333", questionId: "s1-4" } };
    const r = ok(await calls.start({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", grade: 3, package: pkg, startedBy: "admin-1" }));
    expect(savedSession(s, r.view.id).tutor).toBeDefined();
  });

  it("tutor: false keeps a family call on the controller even with the switch on", async () => {
    const s = setup();
    const off = s.calls(true, { tutor: false });
    const r = await chat(s, off);
    expect(savedSession(s, r.view.id).tutor).toBeUndefined();
  });

  it("a resumed family call keeps the flag it started with, whatever the switch is now", async () => {
    // Started with the switch on, picked up again with it off: still the tutor core.
    const on = setup();
    const first = await familyVoice(on, on.calls(true));
    expect(first.session.tutor).toBeDefined();
    const resumed = await familyVoice(on, on.calls(false), first.id);
    expect(resumed.session.tutor).toBeDefined();
    on.advance(5);
    const before = on.model.briefs.length;
    await resumed.child("Hi, Maya");
    expect(on.model.briefs.slice(before).every(isTutorBrief)).toBe(true);

    // Started with the switch off, picked up again with it on: still the controller.
    const off = setup();
    const chatOff = await chat(off, off.calls(false));
    const calls = off.calls(true);
    off.advance(5);
    const again = ok(await calls.input(chatOff.view.id, chatOff.view.revision, { type: "child", text: "What is 12 minus 8?" }, "Leah"));
    expect(savedSession(off, again.view.id).tutor).toBeUndefined();
    expect(off.model.briefs.some(isTutorBrief)).toBe(false);
  });
});
