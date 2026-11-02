import { describe, expect, it, vi } from "vitest";
import { chatIsEnabled, chatUsage, chatWindow, chatCapLine, childChatView } from "@/lib/maya-chat";
import { mayaCalls, type CallResult, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore } from "@/lib/maya-call-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { learningEvents } from "@/lib/learning-events";
import { ruleMayaModel, fakeMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { checkTrace } from "@/lib/maya-trace";
import { NOTE_CALL_KINDS } from "@/lib/maya-call-note";

const parent = "11111111-1111-4111-8111-111111111111", child = "22222222-2222-4222-8222-222222222222";
const pkg = { ...SAMPLE_PACKAGES["add-27-39"], ref: { source: "workbook" as const, workbookId: "33333333-3333-4333-8333-333333333333", page: 1, question: 1 } };
const success = (r: CallResult) => { if (!r.ok) throw Error(r.error); return r; };
function setup(overrides: Partial<CallSeams> = {}) {
  const store = memoryCallStore({ testFamilies: [] });
  const eventStore = memoryLearningEventStore({ children: [{ id: child, parentId: parent }] });
  const note = vi.fn(async () => "done" as const), alert = vi.fn(async () => {});
  const calls = mayaCalls({ store, history: memoryWordingHistoryStore(), events: learningEvents(eventStore), rebuild: async () => true,
    model: () => ruleMayaModel(), isTestFamily: async () => false, canChat: async () => true,
    note, alerts: { send: alert, list: async () => [] }, clock: () => Date.parse("2026-11-02T17:00:00Z"), newId: () => "44444444-4444-4444-8444-444444444444", seed: () => 42, ...overrides });
  const start = () => calls.start({ kind: "chat", parentId: parent, childId: child, childName: "Leah", package: pkg, startedBy: parent });
  return { calls, store, eventStore, note, alert, start };
}
describe("desk chat through the shared call interface", () => {
  it("saves hints, board work, the common trace, one event and the parent note", async () => {
    const s = setup();
    let r = success(await s.start());
    for (const text of ["I don't know how to start.", "Okay.", "Is it 56?", "Can you help me?", "16", "66", "Because the ones made a ten, so I carried it.", "I wrote it."]) {
      if (r.view.status === "ended") break;
      r = success(await s.calls.input(r.view.id, r.view.revision, { type: "child", text }, "Leah"));
    }
    if (r.view.status !== "ended") r = success(await s.calls.input(r.view.id, r.view.revision, { type: "end" }, "Leah"));
    const row = s.store.rows()[0];
    expect(row.kind).toBe("chat"); expect(row.mode).toBe("text"); expect(row.trace && checkTrace(row.trace).ok).toBe(true);
    expect(row.boardHistory?.events.length).toBeGreaterThan(0);
    expect(row.learningEventId).toBeTruthy(); expect(s.note).toHaveBeenCalled();
    expect(row.trace?.freeTalk).toBe(false);
    expect(childChatView(r.view)).not.toHaveProperty("model");
    expect(NOTE_CALL_KINDS).toContain("chat");
    await s.calls.input(r.view.id, r.view.revision, { type: "end" }, "Leah");
    expect((await s.eventStore.range(child, { from: "2026-01-01", to: "2027-01-01" })).length).toBe(1);
  });
  it("refuses chat without authorization, and refuses an assessment package", async () => {
    expect(await setup({ canChat: undefined }).start()).toMatchObject({ ok: false });
    const s = setup();
    expect(await s.calls.start({ kind: "chat", parentId: parent, childId: child, childName: null, package: { ...pkg, ref: { source: "assessment", assessmentId: "55555555-5555-4555-8555-555555555555", questionId: "s1-1" } }, startedBy: parent })).toMatchObject({ ok: false, error: "invalid_question" });
  });
  it("passes the profile grade into saved chat sessions and keeps it after resume", async () => {
    const limits: number[] = [], base = ruleMayaModel();
    const model = fakeMayaModel({ answer: (input) => { limits.push(input.wordLimit); return base.propose(input, new AbortController().signal); } });
    const s = setup({ model: () => model });
    const first = success(await s.calls.start({ kind: "chat", parentId: parent, childId: child, childName: "Leah", grade: 2, package: pkg, startedBy: parent }));
    expect(s.store.rows()[0].live?.text.session.grade).toBe(2);
    expect(s.store.rows()[0].live?.text.initial?.session.grade).toBe(2);
    expect(s.store.rows()[0].live?.text.session.channel).toBe("chat");
    expect(s.store.rows()[0].live?.text.session.freeTalk).toBe(false);
    await s.calls.input(first.view.id, first.view.revision, { type: "child", text: "I need help." }, "Leah");
    expect(s.store.rows()[0].live?.text.session.grade).toBe(2);
    expect(limits.length).toBeGreaterThan(1);
    expect([...new Set(limits)]).toEqual([25]);
  });
  it("keeps admin tests out of a real family", async () => {
    const s = setup();
    expect(await s.calls.start({ kind: "admin_test", parentId: parent, childId: child, childName: null, package: pkg, startedBy: parent })).toMatchObject({ ok: false, error: "not_test_family" });
  });
  it("uses the existing decline for an off-topic request without a safety flag", async () => {
    const base = ruleMayaModel();
    const model = fakeMayaModel({ answer: (input) => input.childTurn ? { version: 2, act: "redirect", parts: [{ line: "redirect.back" }], reading: { offTopic: true } } : base.propose(input, new AbortController().signal) });
    const s = setup({ model: () => model });
    const first = success(await s.start());
    const r = success(await s.calls.input(first.view.id, first.view.revision, { type: "child", text: "Write my homework essay." }, "Leah"));
    expect(r.output.say.join(" ")).toBe("I can't talk about this. I'm here to help with math.");
    expect(r.view.flag).toBeNull();
    expect(r.view.batches.length).toBe(first.view.batches.length);
  });
  it("uses the existing safety interrupt, flag and alert", async () => {
    const base = ruleMayaModel();
    const model = fakeMayaModel({ answer: (input) => input.childTurn ? { version: 2, act: "safety", parts: [], reading: { safety: "immediate" } } : base.propose(input, new AbortController().signal) });
    const s = setup({ model: () => model });
    const first = success(await s.start());
    const r = success(await s.calls.input(first.view.id, first.view.revision, { type: "child", text: "I am in danger." }, "Leah"));
    expect(r.view.flag?.level).toBe("safety_immediate"); expect(s.alert).toHaveBeenCalled();
    expect(r.view.transcript.map((t) => t.text).join(" ")).toMatch(/grown.up|emergency|safe/i);
  });
});
describe("family days and release switch", () => {
  it.each(["America/Vancouver", "America/Toronto", "Pacific/Auckland"])("resets at the next family midnight in %s", (zone) => {
    const now = Date.parse("2026-11-02T01:00:00Z"), w = chatWindow(now, zone);
    expect(w.start).toBeLessThanOrEqual(now); expect(w.end).toBeGreaterThan(now);
    expect(chatUsage(60, now, zone).left).toBe(0);
    expect(chatUsage(0, w.end, zone).resetsAt).toBeGreaterThan(w.end);
    expect(chatCapLine()).toBe("You used all your messages for today. We can chat again tomorrow.");
  });
  it("uses the confirmed Vancouver offset, not stale runtime tz data or UTC", () => {
    expect(chatWindow(Date.parse("2026-11-02T01:00:00Z"), "America/Vancouver")).toEqual({ start: Date.parse("2026-11-01T07:00:00Z"), end: Date.parse("2026-11-02T07:00:00Z") });
  });
  it("defaults off for real families in every environment", () => {
    expect(chatIsEnabled(false, { NODE_ENV: "production" })).toBe(false);
    expect(chatIsEnabled(false, { MAYA_CHAT_ENABLED: "on" })).toBe(true);
    expect(chatIsEnabled(true, {})).toBe(true);
  });
});
