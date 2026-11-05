import { describe, expect, it, vi } from "vitest";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, TIME_LIMITS } from "@/lib/maya";
import { mayaCalls, type CallChange, type CallResult, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { abandonedAt, SWEEP_GRACE_MS, sweepAbandonedCalls, sweepSeams, type SweepResult } from "@/lib/maya-call-sweep";
import { createMinutesLedger } from "@/lib/maya-minutes";
import { memoryMinutesStore } from "@/lib/maya-minutes-memory";
import type { MayaModel } from "@/lib/maya-model";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";

// The sweep of abandoned Maya chats and calls (#528), through its public interface, the call module's public interface,
// the in-memory stores and a passed-in clock.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const T0 = Date.UTC(2026, 10, 4, 17, 0, 0);
const PKG = { ...SAMPLE_PACKAGES["add-27-39"], ref: { source: "workbook" as const, workbookId: "33333333-3333-4333-8333-333333333333", page: 1, question: 1 } };
const PROVIDERS = { speechToText: "fake-stt", voice: "fake-voice" };
/** A whole call's own end plus the grace: when a 10-minute call counts as abandoned. */
const DUE_MS = TIME_LIMITS.endAtMs + SWEEP_GRACE_MS;

const ok = (r: CallResult) => {
  if (!r.ok) throw new Error(`refused: ${r.error}`);
  return r;
};

function setup() {
  let now = T0;
  let n = 0;
  const clock = () => now;
  const minutes = memoryMinutesStore({ clock });
  const inner = memoryCallStore({ testFamilies: [PARENT] });
  // The settle trigger of migration add_maya_minutes: a call's end settles its grant at its connected seconds.
  const store: typeof inner = {
    ...inner,
    async update(id: string, revision: number, change: CallChange) {
      const written = await inner.update(id, revision, change);
      if (written && change.status === "ended") minutes.callEnded(id, change.connectedSeconds ?? 0);
      return written;
    },
  };
  const connections = memoryConnectionLog(store, clock);
  const eventStore = memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }] });
  const base = ruleMayaModel();
  let asked = 0;
  const model: MayaModel = { id: base.id, promptVersion: base.promptVersion, propose: (input, signal) => (asked++, base.propose(input, signal)) };
  // The note store keeps one note per call (its primary key): a second write for a call finds it there.
  const notes = new Map<string, number>();
  const note = vi.fn(async ({ call }: { call: { id: string } }) => {
    if (!notes.has(call.id)) notes.set(call.id, notes.size + 1);
    return "done" as const;
  });
  const rebuild = vi.fn(async () => true);
  const seams: CallSeams = {
    store, connections, history: memoryWordingHistoryStore(), events: learningEvents(eventStore), rebuild, note,
    model: (id) => (id === null || id === model.id ? model : null),
    isTestFamily: async (p) => p === PARENT,
    canChat: async () => true,
    alerts: { send: async () => {}, list: async () => [] },
    clock,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    seed: () => 42,
  };
  const calls = mayaCalls(seams);
  /** One server's sweep: its own call module on the shared store, as two function instances would have. */
  const sweep = (options: { deadline?: number; dry?: boolean } = {}) =>
    sweepAbandonedCalls({ calls: mayaCalls(sweepSeams(seams)), source: inner, clock, ...options });
  const chat = async () => ok(await calls.start({ kind: "chat", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: PARENT })).view;
  const events = () => eventStore.range(CHILD, { from: "2026-01-01", to: "2027-01-01" });
  const row = (id: string) => inner.rows().find((r) => r.id === id)!;
  return {
    calls, sweep, chat, events, row, note, notes, rebuild, minutes, inner, connections,
    asked: () => asked, now: () => now, set: (ms: number) => (now = ms), advance: (ms: number) => (now += ms),
  };
}

const total = (rs: SweepResult[], key: keyof SweepResult) => rs.reduce((sum, r) => sum + r[key], 0);

describe("the sweep of abandoned calls", () => {
  it("never touches a live chat before its own end plus the grace, however quiet the child is", async () => {
    // Wrong if: the sweep ends the chat, or raises its revision, at any time before start + 10 minutes + 5 minutes.
    const s = setup();
    const view = await s.chat();
    const r = ok(await s.calls.input(view.id, view.revision, { type: "child", text: "I don't know how to start." }, "Leah"));
    for (const at of [60_000, 9 * 60_000, TIME_LIMITS.endAtMs, DUE_MS - 1]) {
      s.set(T0 + at);
      expect(await s.sweep()).toMatchObject({ due: 0, ended: 0 });
      expect(s.row(view.id)).toMatchObject({ status: "live", revision: r.view.revision });
    }
    // The quiet child comes back inside the chat's 10 minutes: the chat goes on.
    s.set(T0 + 9 * 60_000);
    const back = ok(await s.calls.input(view.id, r.view.revision, { type: "child", text: "16" }, "Leah"));
    expect(back.output.say.length).toBeGreaterThan(0);
  });

  it("ends nothing the child could still use: after the time limit, the child's next message ends the chat itself", async () => {
    // Wrong if: a message sent after start + 10 minutes is answered and the chat stays live (then the limit would be
    // ending a chat the child can come back to).
    const s = setup();
    const view = await s.chat();
    s.set(T0 + TIME_LIMITS.endAtMs + 1000);
    const late = ok(await s.calls.input(view.id, view.revision, { type: "child", text: "16" }, "Leah"));
    expect(late.view).toMatchObject({ status: "ended", outcome: { reason: "time_limit" } });
  });

  it("ends an abandoned chat once, with its learning event, its parent note and its profile rebuild, and asks no model", async () => {
    // Wrong if: the chat stays live, gets no event or note, or the model is asked during the sweep; or a second sweep
    // changes the call, adds an event or writes the note again.
    const s = setup();
    const view = await s.chat();
    const r = ok(await s.calls.input(view.id, view.revision, { type: "child", text: "I don't know how to start." }, "Leah"));
    const askedBefore = s.asked();
    expect(abandonedAt(s.row(view.id))).toBe(T0 + DUE_MS);
    s.set(T0 + DUE_MS);
    expect(await s.sweep()).toEqual({ due: 1, ended: 1, conflicts: 0, failed: 0, left: 0 });
    const ended = s.row(view.id);
    expect(ended).toMatchObject({ status: "ended", live: null, notePending: null });
    expect(ended.outcome?.reason).toBe("time_limit");
    expect(ended.learningEventId).not.toBeNull();
    expect(ended.revision).toBeGreaterThan(r.view.revision);
    expect(await s.events()).toHaveLength(1);
    expect(s.note).toHaveBeenCalledTimes(1);
    expect(s.rebuild).toHaveBeenCalledTimes(1);
    expect(s.asked()).toBe(askedBefore);

    s.advance(15 * 60_000);
    expect(await s.sweep()).toEqual({ due: 0, ended: 0, conflicts: 0, failed: 0, left: 0 });
    expect(s.row(view.id).revision).toBe(ended.revision);
    expect(await s.events()).toHaveLength(1);
    expect(s.note).toHaveBeenCalledTimes(1);
    expect(s.rebuild).toHaveBeenCalledTimes(1);
  });

  it("ends each call once when two sweeps run at the same time", async () => {
    // Wrong if: the two sweeps together end a call twice (two ends, two events, two notes), or end fewer than all of them.
    const s = setup();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const v = await s.chat();
      ids.push(v.id);
      s.advance(1000);
    }
    s.set(T0 + DUE_MS + 10_000);
    const results = await Promise.all([s.sweep(), s.sweep()]);
    expect(total(results, "due")).toBe(6);
    expect(total(results, "ended")).toBe(3);
    expect(total(results, "conflicts")).toBe(3);
    expect(total(results, "failed")).toBe(0);
    for (const id of ids) expect(s.row(id)).toMatchObject({ status: "ended", live: null });
    expect(await s.events()).toHaveLength(3);
    // One stored note per call. A call's end also writes the child's earlier pending notes, so when two of the
    // child's calls end at once the note seam may be asked twice for one call; the store keeps the first.
    expect([...s.notes.keys()].sort()).toEqual([...ids].sort());
    for (const id of ids) expect(s.row(id).notePending).toBeNull();
  });

  it("ends a crashed voice call from its stored connection time, so its minutes stop counting", async () => {
    // Wrong if: the week still counts the whole 10-minute grant after the sweep, or the connected seconds include the
    // time after the worker's last lease renewal (15 seconds at most, docs/maya-voice.md).
    const s = setup();
    const ledger = createMinutesLedger({ store: s.minutes, clock: s.now });
    const who = { parentId: PARENT, childId: CHILD, timeZone: "America/Vancouver" };
    const id = "00000000-0000-4000-8000-0000000000aa";
    const grant = await ledger.grantChild({ ...who, callId: id });
    if (!grant.ok) throw new Error("no grant");
    ok(await s.calls.startVoice({ id, kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: "admin-1", limitMs: grant.limitMs }));
    s.minutes.callMade(id);
    const opened = await s.calls.openVoice(id, PROVIDERS, "Leah");
    if (!opened.ok) throw new Error(opened.error);
    const call = opened.call;
    await call.connection("agent_joined");
    await call.connection("child_joined");
    await call.start();
    for (let i = 0; i < 6; i++) {
      s.advance(5000);
      await call.connection("agent_joined");
    }
    await call.settled();
    const lastRenewal = s.now();
    // The worker crashes here: no more renewals, no end.
    expect(await ledger.usage(who)).toMatchObject({ usedSeconds: grant.seconds });

    expect(abandonedAt(s.row(id))).toBe(Date.parse(s.row(id).startedAt!) + DUE_MS);
    s.set(abandonedAt(s.row(id)) - 1);
    expect(await s.sweep()).toMatchObject({ due: 0, ended: 0 });
    s.set(abandonedAt(s.row(id)));
    expect(await s.sweep()).toMatchObject({ due: 1, ended: 1 });
    const ended = s.row(id);
    expect(ended).toMatchObject({ status: "ended", live: null });
    const started = Date.parse(ended.startedAt!);
    expect(ended.connectedSeconds).toBeGreaterThanOrEqual(Math.floor((lastRenewal - started) / 1000));
    expect(ended.connectedSeconds).toBeLessThanOrEqual(Math.ceil((lastRenewal + 15_000 - T0) / 1000));
    expect((await ledger.usage(who)).usedSeconds).toBe(ended.connectedSeconds);
    // The crashed worker's handle can no longer write.
    expect(await call.tick()).toMatchObject({ say: [], ended: false });
    expect(s.row(id).revision).toBe(ended.revision);
  });

  it("ends a voice call Maya never joined, with no learning event, after the same limit from when it was made", async () => {
    // Wrong if: the call is ended before it was made 15 minutes ago, or it gets a learning event (the child never spoke).
    const s = setup();
    const view = ok(await s.calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: "admin-1" })).view;
    s.set(T0 + DUE_MS - 1);
    expect(await s.sweep()).toMatchObject({ due: 0 });
    s.set(T0 + DUE_MS);
    expect(await s.sweep()).toMatchObject({ due: 1, ended: 1 });
    expect(s.row(view.id)).toMatchObject({ status: "ended", learningEventId: null, connectedSeconds: 0 });
    expect(s.row(view.id).outcome?.reason).toBe("technical_issue");
    expect(await s.events()).toHaveLength(0);
  });

  it("counts without ending on a dry run, and starts no end after its deadline", async () => {
    // Wrong if: a dry run or a sweep past its deadline changes a call.
    const s = setup();
    const view = await s.chat();
    s.set(T0 + DUE_MS);
    expect(await s.sweep({ dry: true })).toMatchObject({ due: 1, ended: 0 });
    expect(await s.sweep({ deadline: s.now() })).toMatchObject({ due: 1, ended: 0, left: 1 });
    expect(s.row(view.id)).toMatchObject({ status: "live", revision: view.revision });
  });

  it("gives the sweep a model that cannot answer and no free-talk review, keeping each call's model id", async () => {
    // Wrong if: the sweep's model answers (a paid call could happen), or a call's model id changes.
    const s = setup();
    const seams = sweepSeams({ ...({} as CallSeams), model: () => ruleMayaModel(), reviewer: () => ({}) as never });
    const m = seams.model("fake")!;
    expect(m.id).toBe(ruleMayaModel().id);
    await expect(m.propose({} as never, new AbortController().signal)).rejects.toThrow();
    expect(seams.reviewer?.("fake")).toBeNull();
    expect(s.asked()).toBe(0);
  });
});
