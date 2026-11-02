import { getEventListeners } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { workbookWorker, workerOnline, type WorkerCandidate } from "@/lib/workbook-worker";
import type { JobOutcome } from "@/lib/workbook-job";

function setup(o: { candidates?: WorkerCandidate[][]; outcomes?: Record<string, JobOutcome>; exit?: boolean }) {
  const lists = o.candidates ?? [[]];
  const beats: { runId: string | null; started: boolean; note: string | null }[] = [];
  const events: string[] = [];
  const worker = workbookWorker({
    queue: {
      candidates: async () => (lists.length > 1 ? lists.shift()! : lists[0]),
      beat: async (s) => { beats.push({ ...s }); },
    },
    runJob: async (id, resume) => {
      events.push(`run ${id} ${resume ? "resume" : "claim"}`);
      return o.outcomes?.[id] ?? "done";
    },
    keepAwake: () => { events.push("awake"); return () => events.push("asleep"); },
    shouldExit: async () => !!o.exit,
  });
  return { worker, beats, events };
}

describe("workbookWorker", () => {
  it("makes the first run it can take, kept awake, and names it in the heartbeat while it works", async () => {
    const s = setup({ candidates: [[{ id: "r1", resume: false }, { id: "r2", resume: true }]] });
    expect(await s.worker.tick()).toEqual({ ran: "r1", outcome: "done" });
    expect(s.events).toEqual(["awake", "run r1 claim", "asleep"]);
    expect(s.beats.map((b) => b.runId)).toEqual(["r1", null]);
    expect(s.beats[0].started).toBe(true);
    expect(s.beats[1].started).toBe(false);
  });

  it("passes over a run another process took, and takes up a stopped run with resume", async () => {
    const s = setup({ candidates: [[{ id: "r1", resume: false }, { id: "r2", resume: true }]], outcomes: { r1: "not-claimed" } });
    expect(await s.worker.tick()).toEqual({ ran: "r2", outcome: "done" });
    expect(s.events).toEqual(["awake", "run r1 claim", "asleep", "awake", "run r2 resume", "asleep"]);
  });

  it("when idle, exits only if an update asks it to", async () => {
    expect(await setup({}).worker.tick()).toBe("idle");
    expect(await setup({ exit: true }).worker.tick()).toBe("exit");
    // A run first: the update waits for the next idle turn.
    expect(await setup({ candidates: [[{ id: "r1", resume: false }]], exit: true }).worker.tick()).toEqual({ ran: "r1", outcome: "done" });
  });

  it("keeps going when the job throws, and releases the keep-awake", async () => {
    const events: string[] = [];
    const worker = workbookWorker({
      queue: { candidates: async () => [{ id: "r1", resume: false }], beat: async () => undefined },
      runJob: async () => { throw new Error("boom"); },
      keepAwake: () => { events.push("awake"); return () => events.push("asleep"); },
    });
    expect(await worker.tick()).toEqual({ ran: "r1", outcome: null });
    expect(events).toEqual(["awake", "asleep"]);
  });

  it("runs turns until stopped, resting between idle turns, and says it stopped in its last heartbeat", async () => {
    const s = setup({});
    const stop = new AbortController();
    let rests = 0;
    const ended = await s.worker.run({ stop: stop.signal, pollMs: 10, heartbeatMs: 60_000, sleep: async () => { if (++rests === 3) stop.abort(); } });
    expect(ended).toBe("stopped");
    expect(rests).toBe(3);
    expect(s.beats.at(-1)?.note).toBe("stopped");
  });
});

describe("workerOnline", () => {
  it("is online with a heartbeat in the last 90 seconds", () => {
    vi.useFakeTimers();
    const now = new Date("2026-11-01T12:00:00Z");
    expect(workerOnline("2026-11-01T11:59:00Z", now)).toBe(true);
    expect(workerOnline("2026-11-01T11:58:00Z", now)).toBe(false);
    expect(workerOnline(null, now)).toBe(false);
    vi.useRealTimers();
  });
});


describe("R404 worker regressions", () => {
  it("R404-5 checks for updates before taking another run from a busy queue", async () => {
    const runJob = vi.fn(async () => "done" as const);
    const candidates = vi.fn(async () => [{ id: "r1", resume: false }]);
    const shouldExit = vi.fn(async () => true);
    const worker = workbookWorker({ queue: { candidates, beat: async () => undefined }, runJob, shouldExit, keepAwake: () => () => undefined });
    expect(await worker.tick()).toEqual({ ran: "r1", outcome: "done" });
    expect(await worker.tick()).toBe("exit");
    expect(runJob).toHaveBeenCalledTimes(1);
    expect(candidates).toHaveBeenCalledTimes(1);
    expect(shouldExit).toHaveBeenCalledTimes(1);
  });

  it("R404-9 releases the idle abort listener after every normal timer completion", async () => {
    vi.useFakeTimers();
    try {
      const stop = new AbortController();
      const worker = setup({}).worker;
      const running = worker.run({ stop: stop.signal, pollMs: 10, heartbeatMs: 60_000 });
      for (let i = 0; i < 30; i++) await vi.advanceTimersByTimeAsync(10);
      expect(getEventListeners(stop.signal, "abort")).toHaveLength(1);
      stop.abort();
      expect(await running).toBe("stopped");
      expect(getEventListeners(stop.signal, "abort")).toHaveLength(0);
    } finally { vi.useRealTimers(); }
  });
});
