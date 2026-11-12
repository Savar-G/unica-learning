import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, TIME_LIMITS } from "@/lib/maya";
import { mayaCalls, type CallChange, type CallResult, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { abandonedAt, SWEEP_BATCH, SWEEP_GRACE_MS, SWEEP_PAGES, SWEEP_START_MS, SWEEP_TIME_LIMIT_MS, sweepAbandonedCalls, sweepSeams, type SweepResult } from "@/lib/maya-call-sweep";
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
  const inner = memoryCallStore({ testFamilies: [PARENT], clock });
  /** Calls whose writes the database refuses (the family write fence of a family whose deletion was requested). */
  const fenced = new Set<string>();
  /** Failures still to come: the learning event write, the profile rebuild, the connection read. */
  const faults = { event: 0, rebuild: 0, read: 0 };
  const store: typeof inner = {
    ...inner,
    async update(id: string, revision: number, change: CallChange) {
      if (fenced.has(id)) throw new Error("maya call update: family_write_fence");
      return inner.update(id, revision, change);
    },
  };
  const log = memoryConnectionLog(store, clock);
  const connections: typeof log = {
    ...log,
    async read(id) {
      if (faults.read > 0) {
        faults.read--;
        throw new Error("connections read: timeout");
      }
      return log.read(id);
    },
  };
  const eventStore = memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }] });
  const realEvents = learningEvents(eventStore);
  const events: typeof realEvents = {
    ...realEvents,
    async append(e) {
      if (faults.event > 0) {
        faults.event--;
        throw new Error("learning event: connection lost");
      }
      return realEvents.append(e);
    },
  };
  const base = ruleMayaModel();
  let asked = 0;
  const model: MayaModel = { id: base.id, promptVersion: base.promptVersion, propose: (input, signal) => (asked++, base.propose(input, signal)) };
  // The note store keeps one note per call (its primary key): a second write for a call finds it there.
  const notes = new Map<string, number>();
  const note = vi.fn(async ({ call }: { call: { id: string } }) => {
    if (!notes.has(call.id)) notes.set(call.id, notes.size + 1);
    return "done" as const;
  });
  const rebuild = vi.fn(async () => {
    if (faults.rebuild > 0) {
      faults.rebuild--;
      return false;
    }
    return true;
  });
  const seams: CallSeams = {
    store, connections, history: memoryWordingHistoryStore(), events, rebuild, note,
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
  const sweep = (options: { deadline?: number; dry?: boolean; timeLimitMs?: number; calls?: ReturnType<typeof mayaCalls> } = {}) =>
    sweepAbandonedCalls({ calls: mayaCalls(sweepSeams(seams)), source: inner, clock, ...options });
  const chat = async () => ok(await calls.start({ kind: "chat", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: PARENT })).view;
  const row = (id: string) => inner.rows().find((r) => r.id === id)!;
  return {
    calls, seams, sweep, chat, events: () => eventStore.range(CHILD, { from: "2026-01-01", to: "2027-01-01" }), row, note, notes, rebuild, inner, connections, fenced, faults,
    asked: () => asked, now: () => now, set: (ms: number) => (now = ms), advance: (ms: number) => (now += ms),
  };
}

const total = (rs: SweepResult[], key: Exclude<keyof SweepResult, "cut">) => rs.reduce((sum, r) => sum + r[key], 0);

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
    expect(await s.sweep()).toEqual({ due: 1, ended: 1, retried: 0, conflicts: 0, failed: 0, left: 0, cut: false });
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
    expect(await s.sweep()).toEqual({ due: 0, ended: 0, retried: 0, conflicts: 0, failed: 0, left: 0, cut: false });
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

  it("ends a crashed voice call from its stored connection time", async () => {
    // Wrong if: the connected seconds include the time after the worker's last lease renewal (15 seconds at most,
    // docs/maya-voice.md).
    const s = setup();
    const id = "00000000-0000-4000-8000-0000000000aa";
    ok(await s.calls.startVoice({ id, kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: "admin-1" }));
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
    // The crashed worker's handle can no longer write.
    expect(await call.tick()).toMatchObject({ say: [], ended: false });
    expect(s.row(id).revision).toBe(ended.revision);
  });

  it("ends a crashed short voice call only once no worker can still run it, never counting it as failed", async () => {
    // Wrong if: the sweep tries a 2-minute call before the call module allows it (a "failed" result), or never ends it.
    const s = setup();
    const view = ok(await s.calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: "admin-1", limitMs: 2 * 60_000 })).view;
    const opened = await s.calls.openVoice(view.id, PROVIDERS, "Leah");
    if (!opened.ok) throw new Error(opened.error);
    await opened.call.start();
    await opened.call.settled();
    const started = Date.parse(s.row(view.id).startedAt!);
    for (const at of [2 * 60_000 + SWEEP_GRACE_MS, TIME_LIMITS.endAtMs + 60_000 - 1]) {
      s.set(started + at);
      expect(await s.sweep()).toEqual({ due: 0, ended: 0, retried: 0, conflicts: 0, failed: 0, left: 0, cut: false });
    }
    s.set(started + TIME_LIMITS.endAtMs + 60_000);
    expect(await s.sweep()).toEqual({ due: 1, ended: 1, retried: 0, conflicts: 0, failed: 0, left: 0, cut: false });
    expect(s.row(view.id).status).toBe("ended");
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

  it("finishes an ended call whose learning event, rebuild or note was cut off after the end was stored (review P1)", async () => {
    // Wrong if: a later sweep does not find the ended call, so it keeps no learning event, no profile rebuild and a
    // pending note; or it retries before SWEEP_GRACE_MS after the end, while the first request may still be working.
    const s = setup();
    const view = await s.chat();
    s.set(T0 + DUE_MS);
    s.faults.event = 1;
    expect(await s.sweep()).toMatchObject({ due: 1, ended: 1 });
    const cut = s.row(view.id);
    expect(cut).toMatchObject({ status: "ended", learningEventId: null });
    expect(cut.live).not.toBeNull();
    expect(await s.events()).toHaveLength(0);

    s.advance(SWEEP_GRACE_MS - 1);
    expect(await s.sweep()).toMatchObject({ due: 0, retried: 0 });
    s.advance(1);
    expect(await s.sweep()).toMatchObject({ due: 1, retried: 1, failed: 0 });
    const done = s.row(view.id);
    expect(done).toMatchObject({ status: "ended", live: null, notePending: null });
    expect(done.learningEventId).not.toBeNull();
    expect(done.profileRebuiltAt).not.toBeNull();
    expect(await s.events()).toHaveLength(1);

    // Done now: no later sweep touches it.
    s.advance(SWEEP_GRACE_MS);
    expect(await s.sweep()).toMatchObject({ due: 0, retried: 0 });
    expect(s.row(view.id).revision).toBe(done.revision);
  });

  it("retries a failed profile rebuild of an ended call, for a day after the end and no longer", async () => {
    // Wrong if: the failed rebuild is never retried, or a call whose rebuild keeps failing is retried forever.
    const s = setup();
    const first = await s.chat();
    s.set(T0 + DUE_MS);
    s.faults.rebuild = 1;
    await s.sweep();
    expect(s.row(first.id).profileRebuiltAt).toBeNull();
    s.advance(SWEEP_GRACE_MS);
    expect(await s.sweep()).toMatchObject({ retried: 1 });
    expect(s.row(first.id).profileRebuiltAt).not.toBeNull();

    const second = await s.chat();
    s.advance(DUE_MS);
    s.faults.rebuild = 1_000;
    await s.sweep();
    s.advance(24 * 60 * 60_000);
    expect(await s.sweep()).toMatchObject({ retried: 1 });
    s.advance(1);
    const before = s.rebuild.mock.calls.length;
    expect(await s.sweep()).toMatchObject({ retried: 0 });
    expect(s.rebuild.mock.calls.length).toBe(before);
    expect(s.row(second.id).profileRebuiltAt).toBeNull();
  });

  it("goes on past calls it cannot end, so the next one is still reached (review P2)", async () => {
    // Wrong if: SWEEP_BATCH calls the database refuses (a family whose deletion was requested) keep the next call live.
    const s = setup();
    const ids: string[] = [];
    for (let i = 0; i <= SWEEP_BATCH; i++) {
      ids.push((await s.chat()).id);
      s.advance(1);
    }
    for (const id of ids.slice(0, SWEEP_BATCH)) s.fenced.add(id);
    s.set(T0 + DUE_MS + 1000);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await s.sweep()).toMatchObject({ due: SWEEP_BATCH + 1, ended: 1, failed: SWEEP_BATCH });
    expect(s.row(ids[SWEEP_BATCH]).status).toBe("ended");
  });

  it("keeps its place between runs, so calls it can never end do not keep a later call live forever (#586)", async () => {
    // Wrong if: every run starts again at the oldest call, so the SWEEP_BATCH * SWEEP_PAGES calls the database always
    // refuses fill each run and the next call is never reached.
    const s = setup();
    const ids: string[] = [];
    for (let i = 0; i <= SWEEP_BATCH * SWEEP_PAGES; i++) {
      ids.push((await s.chat()).id);
      s.advance(1);
    }
    const last = ids[ids.length - 1];
    for (const id of ids.slice(0, -1)) s.fenced.add(id);
    s.set(T0 + DUE_MS + 10_000);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await s.sweep()).toMatchObject({ ended: 0, failed: SWEEP_BATCH * SWEEP_PAGES });
    s.advance(15 * 60_000);
    expect(await s.sweep()).toMatchObject({ ended: 1 });
    expect(s.row(last).status).toBe("ended");
    // The run after that starts at the oldest call again: the refused calls are still tried.
    s.advance(15 * 60_000);
    expect(await s.sweep()).toMatchObject({ ended: 0, failed: SWEEP_BATCH * SWEEP_PAGES });
  });

  it("goes past a call whose end uses the whole run, so the call after it ends on the next run (#586)", async () => {
    // Wrong if: each run spends its time on the same first call, so the second call is left on every run.
    const s = setup();
    const first = (await s.chat()).id;
    s.advance(1);
    const second = (await s.chat()).id;
    s.set(T0 + DUE_MS + 10_000);
    const real = mayaCalls(sweepSeams(s.seams));
    let slow = 0;
    // The first call's end takes the whole start budget and then fails (a database that times out).
    const calls: typeof real = {
      ...real,
      input: async (id, revision, input, name) => {
        if (id !== first) return real.input(id, revision, input, name);
        slow++;
        s.advance(SWEEP_START_MS + 1);
        throw new Error("maya call update: statement timeout");
      },
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const run = () => s.sweep({ calls, deadline: s.now() + SWEEP_START_MS });
    expect(await run()).toMatchObject({ due: 2, ended: 0, failed: 1, left: 1 });
    expect(await run()).toMatchObject({ ended: 1, failed: 0 });
    expect(s.row(second).status).toBe("ended");
    expect(slow).toBe(1);
    // The failing call is still tried on a later run.
    await run();
    expect(slow).toBe(2);
    expect(s.row(first).status).toBe("live");
  });

  it("tries an older failed call again though a new call becomes due on every run (#586 review)", async () => {
    // Wrong if: with calls left on every run, the place only walks forward past new calls and never goes back to the
    // oldest call, so a call that failed once is never tried again.
    const s = setup();
    const a = (await s.chat()).id;
    s.advance(1);
    await s.chat();
    s.advance(1);
    await s.chat();
    const real = mayaCalls(sweepSeams(s.seams));
    const tries = new Map<string, number>();
    // A fails on its first try. Every other end succeeds but uses the whole start budget of its run.
    const calls: typeof real = {
      ...real,
      input: async (id, revision, input, name) => {
        tries.set(id, (tries.get(id) ?? 0) + 1);
        if (id === a && tries.get(id) === 1) throw new Error("maya call update: connection lost");
        s.advance(SWEEP_START_MS + 1);
        return real.input(id, revision, input, name);
      },
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (let run = 0; run < 10; run++) {
      const at = T0 + DUE_MS + 10_000 + run * 15 * 60_000;
      s.set(at);
      // One new call each run, due on the next.
      await s.chat();
      await s.sweep({ calls, deadline: at + SWEEP_START_MS });
    }
    expect(tries.get(a)).toBeGreaterThanOrEqual(2);
    expect(s.row(a).status).toBe("ended");
  });

  it("goes on from the oldest call when its place cannot be read or stored in time (#586 review)", async () => {
    // Wrong if: a place read or write that never answers uses the sweep's whole time limit, so an abandoned call stays live.
    const s = setup();
    const view = await s.chat();
    s.set(T0 + DUE_MS);
    const never = () => new Promise<never>(() => {});
    const source = { ...s.inner, readPlace: never, writePlace: never };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sweepAbandonedCalls({ calls: mayaCalls(sweepSeams(s.seams)), source, clock: s.now, timeLimitMs: 2000, placeTimeoutMs: 20 });
    expect(result).toMatchObject({ due: 1, ended: 1, cut: false });
    expect(s.row(view.id).status).toBe("ended");
  });

  it("stops at its whole time limit when a place read or write is still waiting (#586 review 2)", async () => {
    // Wrong if: a place step waits out its own limit after the sweep's whole limit has passed, so the sweep runs over.
    const s = setup();
    await s.chat();
    s.set(T0 + DUE_MS);
    const never = () => new Promise<never>(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const source of [{ ...s.inner, readPlace: never }, { ...s.inner, writePlace: never }]) {
      const started = Date.now();
      const result = await sweepAbandonedCalls({ calls: mayaCalls(sweepSeams(s.seams)), source, clock: s.now, timeLimitMs: 30, placeTimeoutMs: 5000 });
      expect(Date.now() - started).toBeLessThan(1000);
      expect(result.cut).toBe(true);
    }
  });

  it("counts the final speech after a solved outcome when the sweep ends a voice call its worker could not (#586 review)", async () => {
    // Wrong if: the sweep counts connected time only to the outcome's time, not through the stored connection events
    // of the final speech, so a call the worker left to the sweep is settled short.
    const s = setup();
    const view = ok(await s.calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: "admin-1" })).view;
    const opened = await s.calls.openVoice(view.id, PROVIDERS, "Leah");
    if (!opened.ok) throw new Error(opened.error);
    const call = opened.call;
    await call.connection("agent_joined");
    await call.connection("child_joined");
    await call.start();
    for (const text of ["I got 66.", "Because the ones made a ten, so I carried it.", "I wrote it."]) {
      if (call.ended) break;
      await call.connection("agent_joined");
      s.advance(6000);
      await call.child(text);
    }
    await call.settled();
    expect(call.ended).toBe(true);
    // Maya's final speech goes on for 10 seconds after the outcome, with the lease renewed, then the child leaves.
    for (let i = 0; i < 2; i++) {
      s.advance(5000);
      await call.connection("agent_joined");
    }
    const leftAt = s.now();
    await call.connection("child_left");
    s.faults.read = 1;
    vi.spyOn(console, "error").mockImplementation(() => {});
    await call.end({ reason: "child_stopped" });
    const live = s.row(view.id);
    expect(live.status).toBe("live");

    s.set(abandonedAt(live));
    expect(await s.sweep()).toMatchObject({ ended: 1 });
    const ended = s.row(view.id);
    expect(ended.outcome?.reason).toBe("solved");
    expect(ended.connectedSeconds).toBe(Math.round((leftAt - T0) / 1000));
  });

  it("a restarted voice worker does not end its call at 0 seconds when the connection times cannot be read; the sweep ends it from them later (#586)", async () => {
    // Wrong if: the restarted worker, with no connection events of its own, ends the call when the read fails, so the
    // call is stored with 0 connected seconds and the sweep has nothing left to settle.
    const s = setup();
    const view = ok(await s.calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: "admin-1" })).view;
    const crashed = await s.calls.openVoice(view.id, PROVIDERS, "Leah");
    if (!crashed.ok) throw new Error(crashed.error);
    await crashed.call.connection("agent_joined");
    await crashed.call.connection("child_joined");
    await crashed.call.start();
    for (let i = 0; i < 6; i++) {
      s.advance(5000);
      await crashed.call.connection("agent_joined");
    }
    await crashed.call.settled();
    // The worker restarts and takes the call up again; its own list of connection events is empty.
    const restarted = await s.calls.openVoice(view.id, PROVIDERS, "Leah");
    if (!restarted.ok) throw new Error(restarted.error);
    s.faults.read = 1;
    vi.spyOn(console, "error").mockImplementation(() => {});
    await restarted.call.end({ detail: "the worker stopped" });
    const live = s.row(view.id);
    expect(live).toMatchObject({ status: "live", connectedSeconds: null });
    expect(restarted.call.lost).toBe(true);

    s.set(abandonedAt(live));
    expect(await s.sweep()).toMatchObject({ due: 1, ended: 1, failed: 0 });
    expect(s.row(view.id).connectedSeconds).toBeGreaterThan(0);
  });

  it("does not end a voice call while its connection times cannot be read, and ends it from them later (review P2)", async () => {
    // Wrong if: a failed read settles the call at 0 connected seconds; or the next sweep does not end it.
    const s = setup();
    const view = ok(await s.calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: "admin-1" })).view;
    const opened = await s.calls.openVoice(view.id, PROVIDERS, "Leah");
    if (!opened.ok) throw new Error(opened.error);
    await opened.call.connection("agent_joined");
    await opened.call.connection("child_joined");
    await opened.call.start();
    s.advance(5000);
    await opened.call.connection("agent_joined");
    await opened.call.settled();
    const live = s.row(view.id);
    s.set(abandonedAt(live));
    s.faults.read = 1;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await s.sweep()).toMatchObject({ due: 1, ended: 0, failed: 1 });
    expect(s.row(view.id)).toMatchObject({ status: "live", revision: live.revision, connectedSeconds: null });
    expect(await s.sweep()).toMatchObject({ due: 1, ended: 1, failed: 0 });
    expect(s.row(view.id).connectedSeconds).toBeGreaterThan(0);
  });

  it("answers within its time limit even when an end does not come back (review P2)", async () => {
    // Wrong if: the sweep waits for an end that hangs, past its time limit.
    const s = setup();
    await s.chat();
    s.set(T0 + DUE_MS);
    const hung = { ...s.calls, input: () => new Promise<never>(() => {}) };
    const started = Date.now();
    expect(await s.sweep({ calls: hung, timeLimitMs: 50 })).toMatchObject({ due: 1, ended: 0, cut: true });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("answers the reminder cron before its request times out", () => {
    // Wrong if: the sweep's time limit, with 10 seconds for the reminders' answer, does not fit the cron's request
    // time limit (timeout_milliseconds of the pg_cron job), or the route may run past it.
    const sql = readFileSync("supabase/migrations/20261011_add_reminder_cron.sql", "utf8");
    const cron = Number(/timeout_milliseconds := (\d+)/.exec(sql)?.[1]);
    expect(SWEEP_TIME_LIMIT_MS + 10_000).toBeLessThanOrEqual(cron);
    const route = readFileSync("src/app/api/reminders/route.ts", "utf8");
    expect(Number(/export const maxDuration = (\d+)/.exec(route)?.[1]) * 1000).toBeLessThanOrEqual(cron);
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
