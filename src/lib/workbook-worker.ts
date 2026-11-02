// The workbook worker's loop (D-200): the long-running process on Savar's Mac (scripts/workbook-worker.ts,
// docs/workbook-worker.md) that makes the runs "Prepare next workbook" queued for the Mac (workbook_runs.runner 'mac').
// Each turn: write the heartbeat, then take the oldest run it may make (a queued one, or a running one with no holder
// or no progress for STALE_SECONDS: one the Mac started and stopped making, such as after a restart) and make it with
// the job (src/lib/workbook-job.ts), while the Mac is kept awake. The job's own claim and resume are atomic, so a run
// another process took is passed over ("not-claimed"). When there is nothing to do, it asks `shouldExit` (a newer
// commit on origin/main): it exits only between runs, so a run is never cut by an update, and the launcher pulls the
// new code and starts it again. The heartbeat goes on every `heartbeatMs`, also while a run is made, and names the run.
// Pure TypeScript: the queue, the job, the clock and the Mac's keep-awake are passed in.
import { STALE_SECONDS, type JobOutcome } from "@/lib/workbook-job";

/** A run the worker may make: `resume` when it is running (taken up again), else queued (claimed). */
export interface WorkerCandidate {
  id: string;
  resume: boolean;
}

export interface WorkerQueue {
  /** The Mac's runs it may make now, oldest first. */
  candidates(staleSeconds: number): Promise<WorkerCandidate[]>;
  /** The heartbeat: the worker is online, making `runId` (null: idle). */
  beat(state: { runId: string | null; started: boolean; note: string | null }): Promise<void>;
}

export interface WorkerDeps {
  queue: WorkerQueue;
  /** Makes one run (the job with the Mac's deps). */
  runJob(runId: string, resume: boolean): Promise<JobOutcome | null>;
  /** Keeps the Mac awake (caffeinate) until the returned function is called. */
  keepAwake(): () => void;
  /** True when the worker should stop between runs (a newer commit to run). */
  shouldExit?(): Promise<boolean>;
  log?(line: string): void;
}

export type TickResult = { ran: string; outcome: JobOutcome | null } | "idle" | "exit";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The worker's state: the run it makes, for the heartbeat. One worker makes one run at a time; the job writes up to
 * PAGE_CONCURRENCY pages of it at once.
 */
export function workbookWorker(deps: WorkerDeps) {
  const log = deps.log ?? (() => undefined);
  let current: string | null = null;
  let started = true;
  let note: string | null = null;
  let checkUpdate = false;

  const beat = async () => {
    try {
      await deps.queue.beat({ runId: current, started, note });
      started = false;
    } catch (e) {
      log(`heartbeat failed: ${message(e)}`);
    }
  };

  /** One turn: make the first run it can take; else, idle, ask whether to exit. */
  async function tick(): Promise<TickResult> {
    try {
      if (checkUpdate && await deps.shouldExit?.()) return "exit";
    } catch (e) {
      log(`update check failed: ${message(e)}`);
    }
    checkUpdate = false;
    let candidates: WorkerCandidate[];
    try {
      candidates = await deps.queue.candidates(STALE_SECONDS);
    } catch (e) {
      log(`could not read the queue: ${message(e)}`);
      return "idle";
    }
    for (const c of candidates) {
      current = c.id;
      note = null;
      await beat();
      const release = deps.keepAwake();
      let outcome: JobOutcome | null = null;
      try {
        log(`run ${c.id}: ${c.resume ? "taking it up again" : "starting"}`);
        outcome = await deps.runJob(c.id, c.resume);
        log(`run ${c.id}: ${outcome ?? "the job did not run"}`);
      } catch (e) {
        log(`run ${c.id}: the job threw: ${message(e)}`);
      } finally {
        release();
        current = null;
        await beat();
      }
      if (outcome !== "not-claimed") {
        checkUpdate = true;
        return { ran: c.id, outcome };
      }
    }
    try {
      if (await deps.shouldExit?.()) return "exit";
    } catch (e) {
      log(`update check failed: ${message(e)}`);
    }
    return "idle";
  }

  /**
   * Runs until `stop` aborts or an update asks it to exit: a turn, then `pollMs` of rest when idle. The heartbeat runs
   * on its own timer, every `heartbeatMs`.
   */
  async function run(o: { stop: AbortSignal; pollMs: number; heartbeatMs: number; sleep?: (ms: number, signal: AbortSignal) => Promise<void> }): Promise<"stopped" | "exit"> {
    const sleep = o.sleep ?? ((ms, signal) => new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(t);
        signal.removeEventListener("abort", done);
        resolve();
      };
      const t = setTimeout(done, ms);
      signal.addEventListener("abort", done, { once: true });
      if (signal.aborted) done();
    }));
    await beat();
    const timer = setInterval(() => { void beat(); }, o.heartbeatMs);
    try {
      while (!o.stop.aborted) {
        const r = await tick();
        if (r === "exit") return "exit";
        if (r === "idle") await sleep(o.pollMs, o.stop);
      }
      return "stopped";
    } finally {
      clearInterval(timer);
      note = "stopped";
      await beat();
    }
  }

  return { tick, run, beat, setNote: (n: string | null) => { note = n; } };
}

/** Whether the worker is online: a heartbeat in the last `withinMs` (3 heartbeats of 30 s by default). */
export const WORKER_ONLINE_MS = 90_000;
export const workerOnline = (seenAt: string | null, now: Date, withinMs = WORKER_ONLINE_MS) =>
  !!seenAt && now.getTime() - Date.parse(seenAt) <= withinMs;
