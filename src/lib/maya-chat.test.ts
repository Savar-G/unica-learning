import { describe, expect, it, vi } from "vitest";
import { chatFamilyGate, chatLimitLabel, chatServesGrade, getsNoParentNotes, rehearsalRefusal, chatUsage, chatWindow, chatCapLine, childChatView } from "@/lib/maya-chat";
import { INK_AFTER_END_MS, INK_SAVE_GAP_MS, mayaCalls, type CallChange, type CallResult, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore } from "@/lib/maya-call-memory";
import { memoryWordingHistoryStore, SAFETY_GUIDANCE } from "@/lib/maya";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { learningEvents } from "@/lib/learning-events";
import { ruleMayaModel, fakeMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { checkTrace } from "@/lib/maya-trace";
import { NOTE_CALL_KINDS } from "@/lib/maya-call-note";
import { childStrokes, createHistory, drawStroke, givePen, inkLog, mayaWrites, penHolder, replayFrame, takePen, type BoardHistory, type Change, type InkEvent } from "@/lib/board-history";
import type { Batch } from "@/lib/board";
import { callReplay } from "@/lib/maya-call-review";

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
  it("#589: answers a child in danger at once, with code's close and no close call", async () => {
    const rule = ruleMayaModel();
    let armed = false;
    let asked = 0;
    const never = new Promise<never>(() => {});
    const s = setup({ model: () => ({ ...rule, propose: async (input, signal) => {
      if (!armed) return rule.propose(input, signal);
      if (++asked === 1) return { version: 2, act: "safety", parts: [], reading: { safety: "immediate" } };
      return never;
    } }) });
    const r = success(await s.start());
    armed = true;
    const answered = await Promise.race([
      s.calls.input(r.view.id, r.view.revision, { type: "child", text: "Someone is hurting me." }, "Leah"),
      new Promise<"still waiting">((resolve) => setTimeout(() => resolve("still waiting"), 500)),
    ]);
    if (answered === "still waiting") throw Error("the reply waited for the close call");
    const view = childChatView(success(answered).view);
    expect(asked).toBe(1);
    expect(view.ended).toBe(true);
    expect(view.safetyMessage).toBe(SAFETY_GUIDANCE.immediate);
    expect(view.transcript.map((t) => t.text)).toContain(SAFETY_GUIDANCE.immediate);
    const row = s.store.rows()[0];
    expect(row.trace && checkTrace(row.trace).ok).toBe(true);
    expect(row.trace!.outcome).toMatchObject({ reason: "safety" });
    expect(row.trace!.turns.flatMap((t) => t.kind === "maya" ? [t.output?.act] : [])).toEqual(["open", "safety", "close"]);
    expect(s.alert).toHaveBeenCalled();
    // Only that close may have no model attempt.
    const close = row.trace!.turns.findLast((t) => t.kind === "maya")!;
    const elsewhere = structuredClone(row.trace!);
    Object.assign(elsewhere.turns[elsewhere.turns.lastIndexOf(elsewhere.turns.findLast((t) => t.kind === "maya")!)], { state: "GUIDE" });
    expect(close).toMatchObject({ state: "SAFETY", attempts: [{ source: "fallback" }] });
    expect(checkTrace(elsewhere)).toMatchObject({ ok: false });
  });

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
  it("redirects an outside request to the workbook without a safety flag", async () => {
    const base = ruleMayaModel();
    const model = fakeMayaModel({ answer: (input) => input.childTurn ? { version: 2, act: "redirect", parts: [{ line: "redirect.back" }], reading: { offTopic: true, outsideScope: "outside_work" } } : base.propose(input, new AbortController().signal) });
    const s = setup({ model: () => model });
    const first = success(await s.start());
    const r = success(await s.calls.input(first.view.id, first.view.revision, { type: "child", text: "Write my homework essay." }, "Leah"));
    expect(r.output.say.join(" ")).toBe("I help with your Unica workbook. We can pick a question from it.");
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
  it("defaults off for real families in every environment, and opens only a listed family with the switch on (#530)", () => {
    expect(chatFamilyGate({ test: false, listed: false }, { NODE_ENV: "production" })).toBe("closed");
    expect(chatFamilyGate({ test: false, listed: false }, { MAYA_CHAT_ENABLED: "on" })).toBe("closed");
    expect(chatFamilyGate({ test: false, listed: true }, {})).toBe("closed");
    expect(chatFamilyGate({ test: false, listed: true }, { MAYA_CHAT_ENABLED: "true" })).toBe("closed");
    expect(chatFamilyGate({ test: false, listed: true }, { MAYA_CHAT_ENABLED: "on" })).toBe("plan");
    expect(chatFamilyGate({ test: true, listed: false }, {})).toBe("test");
  });
  it("opens a child with an open plan with no list row and no switch, and only an explicit off stops it", () => {
    for (const value of [undefined, "", "true", "on"]) expect(chatFamilyGate({ test: false, listed: false, planOpen: true }, { MAYA_CHAT_ENABLED: value })).toBe("open_plan");
    expect(chatFamilyGate({ test: false, listed: false, planOpen: true }, { MAYA_CHAT_ENABLED: "off" })).toBe("closed");
    expect(chatFamilyGate({ test: false, listed: true, planOpen: true }, { MAYA_CHAT_ENABLED: "off" })).toBe("closed");
    expect(chatFamilyGate({ test: false, listed: true, planOpen: false }, { MAYA_CHAT_ENABLED: "off" })).toBe("closed");
    expect(chatFamilyGate({ test: false, listed: false, planOpen: false }, { MAYA_CHAT_ENABLED: "on" })).toBe("closed");
    expect(chatFamilyGate({ test: true, listed: false, planOpen: false }, { MAYA_CHAT_ENABLED: "off" })).toBe("test");
  });
  it("labels the chat limit in the desk header: left today, Grade 3 and up for a younger child, else the daily limit", () => {
    const zone = "America/Vancouver", now = Date.parse("2026-11-05T17:00:00Z");
    expect(chatLimitLabel(chatUsage(12, now, zone), null)).toBe("48 left today");
    expect(chatLimitLabel(null, "Chat with Maya is for Grade 3 and up, because it needs typing. Calls with Maya start soon.")).toBe("Grade 3 and up");
    expect(chatLimitLabel(null, null)).toBe("60 messages a day");
  });
  it("serves Grade 3 and up only; kindergarten is grade 0", () => {
    expect([0, 1, 2, 3, 7, 8, 9].map(chatServesGrade)).toEqual([false, false, false, true, true, true, true]);
    expect(chatServesGrade(null)).toBe(false); expect(chatServesGrade(undefined)).toBe(false);
  });
  it("keeps test families from notes and recaps except the rehearsal family, which must be a listed test family", () => {
    expect(getsNoParentNotes({ test: true, rehearsal: false })).toBe(true);
    expect(getsNoParentNotes({ test: true, rehearsal: true })).toBe(false);
    expect(getsNoParentNotes({ test: false, rehearsal: false })).toBe(false);
    expect(rehearsalRefusal({ test: false, listed: true })).toBe("not_test_family");
    expect(rehearsalRefusal({ test: true, listed: false })).toBe("not_listed");
    expect(rehearsalRefusal({ test: true, listed: true })).toBeNull();
  });
});

describe("#534, #635: the child's ink is kept with the chat as a log", () => {
  const owner = { parentId: parent, childId: child };
  const accepted = (change: Change) => { if (!change.ok) throw Error(change.reason); return change.history; };
  /** The desk's board as a desk grows it: Maya's new batches (the pen goes to her), then the child's new lines. */
  function grow(h: BoardHistory, batches: readonly Batch[], lines: number, at: number) {
    const on = new Set(h.events.flatMap((e) => (e.kind === "maya" ? [e.batchId] : [])));
    const missing = batches.filter((b) => !on.has(b.transactionId));
    if (missing.length && penHolder(h) === "child") h = accepted(givePen(h, at));
    for (const b of missing) h = accepted(mayaWrites(h, b, at + 1));
    h = accepted(takePen(h, at + 100));
    for (let i = 0; i < lines; i++) {
      const t = at + 200 + i * 1000, x = 0.1 + (childStrokes(h).length) * 0.05;
      h = accepted(drawStroke(h, { erase: false, w: 5, boardWidth: 800, page: 1, pts: [[x, 0.6, t], [x + 0.04, 0.64, t + 300]] }));
    }
    return h;
  }
  /** A chat on a store and module that share a clock the test moves. */
  async function clocked() {
    let now = Date.parse("2026-11-02T17:00:00Z");
    const memory = memoryCallStore({ testFamilies: [], clock: () => now });
    const s = setup({ store: memory, clock: () => now });
    const r = success(await s.start());
    return { ...s, memory, r, advance: (ms: number) => (now += ms) };
  }

  it("keeps the log beside the chat without changing its revision, sends only what is new, and the admin replay shows it", async () => {
    const s = await clocked();
    const id = s.r.view.id;
    const one = grow(createHistory(), s.r.view.batches, 1, 1000);
    expect(await s.calls.appendInk(id, owner, 1, inkLog(one))).toEqual({ ok: true, held: inkLog(one).length });
    // The chat's next message still goes in at the revision the child's desk holds.
    expect(s.memory.rows()[0].revision).toBe(s.r.view.revision);
    const next = success(await s.calls.input(id, s.r.view.revision, { type: "child", text: "I don't know" }, "Leah"));
    const two = grow(one, next.view.batches, 1, 9000);
    const held = inkLog(one).length;
    s.advance(INK_SAVE_GAP_MS);
    expect(await s.calls.appendInk(id, owner, held + 1, inkLog(two).slice(held))).toEqual({ ok: true, held: inkLog(two).length });
    const ended = success(await s.calls.input(id, next.view.revision, { type: "end" }, "Leah"));
    expect(ended.view.status).toBe("ended");

    const view = (await s.calls.view(id))!;
    expect(view.batches.length).toBeGreaterThan(0);
    const saved = view.boardHistory;
    // Maya's batches are the call's own; the child's lines come from the log, on the call's clock.
    expect(saved.events.flatMap((e) => (e.kind === "maya" ? [e.batchId] : []))).toEqual(view.batches.map((b) => b.transactionId));
    const where = (h: BoardHistory) => childStrokes(h).map((k) => k.pts.map(([x, y]) => [x, y]));
    expect(where(saved)).toEqual(where(two));
    const frame = replayFrame(callReplay(view), Infinity);
    expect(frame.child).toHaveLength(2);
  });

  it("R635: keeps each sequence once: a repeated or late request changes nothing the chat holds", async () => {
    const s = await clocked();
    const id = s.r.view.id;
    const log = inkLog(grow(createHistory(), s.r.view.batches, 2, 1000));
    expect(await s.calls.appendInk(id, owner, 1, log)).toEqual({ ok: true, held: log.length });
    // The same request again, and a late one with other content at held sequences: nothing held changes.
    s.advance(INK_SAVE_GAP_MS);
    expect(await s.calls.appendInk(id, owner, 1, log)).toEqual({ ok: true, held: log.length });
    s.advance(INK_SAVE_GAP_MS);
    expect(await s.calls.appendInk(id, owner, 2, [{ kind: "clear", t: 99_999 }])).toEqual({ ok: true, held: log.length });
    expect(await s.memory.readInk(id)).toEqual(log);
    // A start past the next sequence is refused with what the chat holds, for the desk to send on from there.
    s.advance(INK_SAVE_GAP_MS);
    expect(await s.calls.appendInk(id, owner, log.length + 5, [{ kind: "clear", t: 99_999 }])).toEqual({ ok: false, error: "gap", held: log.length });
  });

  it("refuses events that do not read back, and an unknown call", async () => {
    const s = await clocked();
    const id = s.r.view.id;
    expect(await s.calls.appendInk(id, owner, 1, "not events")).toEqual({ ok: false, error: "invalid_input", held: 0 });
    expect(await s.calls.appendInk(id, owner, 1, [{ kind: "maya", t: 0, batchId: "b", commands: [] }])).toEqual({ ok: false, error: "invalid_input", held: 0 });
    expect(await s.calls.appendInk(id, owner, 0, [{ kind: "clear", t: 0 }])).toEqual({ ok: false, error: "invalid_input", held: 0 });
    expect(await s.calls.appendInk("99999999-9999-4999-8999-999999999999", owner, 1, [{ kind: "clear", t: 0 }])).toEqual({ ok: false, error: "not_found", held: 0 });
    expect(await s.memory.readInk(id)).toEqual([]);
  });

  it("R625-6: takes at most one append a second per chat, and none once the chat ended more than a few minutes ago", async () => {
    const c = await clocked();
    const id = c.r.view.id;
    const log = inkLog(grow(createHistory(), c.r.view.batches, 4, 1000));
    expect(await c.calls.appendInk(id, owner, 1, log.slice(0, 2))).toEqual({ ok: true, held: 2 });
    c.advance(200);
    expect(await c.calls.appendInk(id, owner, 3, log.slice(2, 4))).toEqual({ ok: false, error: "busy", held: 2 });
    c.advance(INK_SAVE_GAP_MS);
    expect(await c.calls.appendInk(id, owner, 3, log.slice(2, 4))).toEqual({ ok: true, held: 4 });
    const ended = success(await c.calls.input(id, c.memory.rows()[0].revision, { type: "end" }, "Leah"));
    expect(ended.view.status).toBe("ended");
    // A line finished just after the end still goes in; ink long after it does not.
    c.advance(INK_SAVE_GAP_MS);
    expect(await c.calls.appendInk(id, owner, 5, log.slice(4, 5))).toEqual({ ok: true, held: 5 });
    c.advance(INK_AFTER_END_MS + 1);
    expect(await c.calls.appendInk(id, owner, 6, [{ kind: "clear", t: 99_999 }])).toEqual({ ok: false, error: "closed", held: 5 });
  });

  it("R639-4: a chat from before the log keeps its old ink: read back, turned into the log before new events, and in the replay", async () => {
    const c = await clocked();
    const id = c.r.view.id;
    const old = grow(createHistory(), c.r.view.batches, 1, 1000);
    const legacy = inkLog(old);
    expect(await c.memory.update(id, c.memory.rows()[0].revision, { childInk: old } as CallChange)).toBe(true);
    // A desk with no draft reads the old ink, and a desk from another child reads nothing.
    expect(await c.calls.readInk(id, owner)).toEqual({ ok: true, events: legacy });
    expect(await c.calls.readInk(id, { parentId: parent, childId: "55555555-5555-4555-8555-555555555555" })).toEqual({ ok: false, error: "not_this_desk" });
    const next: InkEvent = { kind: "clear", t: 900_000 };
    // A new event goes after the old ink, and the old ink is kept as it was.
    expect(await c.calls.appendInk(id, owner, legacy.length + 1, [next])).toEqual({ ok: true, held: legacy.length + 1 });
    expect(await c.memory.readInk(id)).toEqual([...legacy, next]);
    expect(await c.calls.readInk(id, owner)).toEqual({ ok: true, events: [...legacy, next] });
    const view = (await c.calls.view(id))!;
    expect(view.boardHistory.events.some((e) => e.kind === "stroke")).toBe(true);
  });

  it("R639-4: the replay of a chat from before the log, with no new event, shows its old ink", async () => {
    const c = await clocked();
    const id = c.r.view.id;
    const old = grow(createHistory(), c.r.view.batches, 1, 1000);
    expect(await c.memory.update(id, c.memory.rows()[0].revision, { childInk: old } as CallChange)).toBe(true);
    expect(childStrokes((await c.calls.view(id))!.boardHistory)).toHaveLength(1);
    expect(await c.memory.readInk(id)).toEqual([]);
  });

  it("R654: another family's call answers as no call at all, so no desk learns whether it exists", async () => {
    const c = await clocked();
    const id = c.r.view.id;
    const log = inkLog(grow(createHistory(), c.r.view.batches, 1, 1000));
    const otherFamily = { parentId: "66666666-6666-4666-8666-666666666666", childId: child };
    expect(await c.calls.appendInk(id, otherFamily, 1, log)).toEqual({ ok: false, error: "not_found", held: 0 });
    expect(await c.calls.readInk(id, otherFamily)).toEqual({ ok: false, error: "not_found" });
    expect(await c.memory.readInk(id)).toEqual([]);
  });

  it("R654: a call that is not a text chat answers as no call at all, for a sibling's desk and its own", async () => {
    const c = await clocked();
    const log = inkLog(grow(createHistory(), c.r.view.batches, 1, 1000));
    const sibling = { parentId: parent, childId: "55555555-5555-4555-8555-555555555555" };
    const voice = "77777777-7777-4777-8777-777777777777";
    await c.memory.insert({ ...c.memory.rows()[0], id: voice, mode: "voice" });
    expect(await c.calls.appendInk(voice, sibling, 1, log)).toEqual({ ok: false, error: "not_found", held: 0 });
    expect(await c.calls.readInk(voice, sibling)).toEqual({ ok: false, error: "not_found" });
    expect(await c.calls.appendInk(voice, owner, 1, log)).toEqual({ ok: false, error: "not_found", held: 0 });
    expect(await c.calls.readInk(voice, owner)).toEqual({ ok: false, error: "not_found" });
  });

  it("R625b-5, #652: keeps ink only for a chat of that parent and child, and tells another desk's chat from a chat that is gone", async () => {
    const c = await clocked();
    const id = c.r.view.id;
    const log = inkLog(grow(createHistory(), c.r.view.batches, 1, 1000));
    const sibling = { parentId: parent, childId: "55555555-5555-4555-8555-555555555555" };
    // A sibling's chat: an answer about the desk, which says nothing about the ink (#652).
    expect(await c.calls.appendInk(id, sibling, 1, log)).toEqual({ ok: false, error: "not_this_desk", held: 0 });
    expect(await c.calls.readInk(id, sibling)).toEqual({ ok: false, error: "not_this_desk" });
    // No such chat at all: the one answer that says the ink can never go.
    const gone = "99999999-9999-4999-8999-999999999999";
    expect(await c.calls.appendInk(gone, owner, 1, log)).toEqual({ ok: false, error: "not_found", held: 0 });
    expect(await c.calls.readInk(gone, owner)).toEqual({ ok: false, error: "not_found" });
    expect(await c.memory.readInk(id)).toEqual([]);
    expect(await c.calls.appendInk(id, owner, 1, log)).toEqual({ ok: true, held: log.length });
    expect(await c.calls.readInk(id, owner)).toEqual({ ok: true, events: log });
  });
});
