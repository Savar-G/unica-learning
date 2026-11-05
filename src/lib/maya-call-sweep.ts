// The sweep of abandoned Maya chats and calls (#528). A child who closes the desk tab mid-chat, or a voice worker that
// crashes, leaves a call live: no learning event, no parent note, and a voice call's whole minute grant stays counted
// for the week. The reminder job (src/app/api/reminders) runs this sweep every 15 minutes. It ends each abandoned call
// through the call module's public "end" (src/lib/maya-call.ts `input(..., { type: "end" })`), the same path as a hang-up,
// so the call stores its outcome, its learning event, the profile rebuild and the parent note, and a voice call stores
// its connected seconds, which settle its minutes (the settle trigger of migration add_maya_minutes).
//
// The idle limit: a call is abandoned SWEEP_GRACE_MS (5 minutes) after its own end time, that is its start (or, when it
// never started, when it was made) plus its time limit (10 minutes, or the shorter grant, `limitsOf` in src/lib/maya).
// Why this and not a shorter silence:
// - Every call, the desk chat too, ends at its time limit: the controller ends a session at the first input after
//   start + limit as "time_limit". So a quiet child (writing on paper, say) is never cut off by the sweep while the chat
//   can still go on, however long they are quiet inside the 10 minutes. After the limit nothing they send continues
//   that chat, so ending it cannot end a chat they will come back to.
// - The 5 minutes cover work still in flight: a desk chat request holds a 2-minute lease (docs/maya-chat.md) and a
//   voice worker may run 60 seconds past the limit (VOICE_CALL_STALE_MS), so no live request or worker remains.
// - When the child comes back, the desk shows the chat as ended with its transcript and the "Chat again" button
//   (src/components/desk-chat.tsx), the same as when their next message would have met the time limit.
// The outcome is what the controller makes of it: "time_limit" for a call past its limit, or a technical issue for a
// voice call Maya never joined (no learning event then, as for the admin's end).
//
// Exactly once: the sweep passes the revision it read. Of two writers (two sweeps at once, or a sweep and the child's
// last request) only the first stores the end; the other is refused as a conflict and changes nothing. A sweep that runs
// again finds no live call to end.
//
// Unfinished ends (review P1): the end stores the call as ended before its learning event, profile rebuild and parent
// note. When those were cut off (the function stopped, a write failed), the sweep finds the ended call once nothing has
// written it for SWEEP_GRACE_MS (so the request that ended it has finished) and sends "end" again, which finishes only what is missing:
// the event once (its key), the rebuild until it is built, the note until it is stored. It tries for RETRY_WINDOW_MS
// after the end, then leaves the call as it is.
//
// No call holds up the others (review P2): the sweep reads calls page by page, and a call it cannot end (the family's
// deletion fence, a store error) is counted as failed and tried again by a later run. A voice call whose connection
// times cannot be read is not ended (the call module refuses), so a later run settles its minutes from them.
//
// Its place between runs (#586): each kind of call keeps a place in the source (migrations maya_call_sweep_cursors and
// maya_call_sweep_cursor_until). Before it starts to end a call, the sweep stores that call as its place, and the next
// run starts after it. So calls that always fail (more than one run reads) or an end that uses the whole run cannot
// keep a later call waiting: the next run goes on from there. One pass over a list runs from the oldest call to the
// newest one there was when the pass began (`until`, stored with the place). When a run reaches the end of the list, or
// a call newer than `until`, with nothing left, the place goes back to the oldest call: the failing calls are tried
// again on the run after, though new calls keep coming (#586 review). A call older than the place that became due in
// between waits until then. Reading or storing the place never stops the sweep: each has its own short time limit
// (SWEEP_PLACE_MS), and a place that cannot be read starts at the oldest call. A dry run starts at the oldest call and
// stores nothing.
//
// Time (review P2): the sweep starts no new end after `deadline`, and stops waiting at `timeLimitMs`. An end it stopped
// waiting for goes on, or stops with the function; then a later run finishes it as above. SWEEP_TIME_LIMIT_MS leaves the
// reminder job time to answer inside the cron's 60-second request limit (migration add_reminder_cron).
//
// No paid model for the end: ending a call never asks Maya's model (the session's finish closes it without a turn), and
// the server sweep gives the call module a model that refuses to answer, no free-talk review, and code-only parent notes
// (the AI's warm sentence is optional, src/lib/maya-call-note.ts). The child profile rebuild runs as at every call end,
// and so, when OPENROUTER_API_KEY is set and the child has events, it makes the profile's paid AI call (its findings
// would otherwise be dropped, src/lib/child-profile.ts).
//
// Seams: the call module, the call source (Supabase: `sweepCallSource` in src/lib/maya-call-store.ts; memory:
// memoryCallStore) and the clock. Pure otherwise; one timer for the time limit, and one for each place read or write.
import { limitsOf } from "@/lib/maya";
import type { CallRecord, CallSeams, MayaCalls } from "@/lib/maya-call";
import { VOICE_CALL_STALE_MS } from "@/lib/maya-voice";

/** How long after its own end time a live call counts as abandoned, and after its end an unfinished call is retried. */
export const SWEEP_GRACE_MS = 5 * 60_000;
/** The calls one read gives. */
export const SWEEP_BATCH = 20;
/** The most reads of each kind in one sweep. */
export const SWEEP_PAGES = 10;
/** How long after its end an ended call with missing steps is still retried. */
export const RETRY_WINDOW_MS = 24 * 60 * 60_000;
/** No new end starts after this long in a run of the reminder job. */
export const SWEEP_START_MS = 25_000;
/** The sweep stops waiting after this long. With 10 seconds for the answer, it fits the cron's 60-second request limit. */
export const SWEEP_TIME_LIMIT_MS = 45_000;
/** The most one read or write of the sweep's place may take; after it the sweep goes on without it. */
export const SWEEP_PLACE_MS = 3_000;

/** A place in a list of calls: the time it is ordered by and the id. */
export interface SweepCursor {
  at: string;
  id: string;
}

/** The two kinds of call the sweep reads, each with its own place. */
export type SweepKind = "live" | "unfinished";

/**
 * Where the sweep is in one kind's list: the next run starts after `after`. `until` (ISO time): the newest time the
 * current pass covers; a call after it came since the pass began, so reaching one ends the pass.
 */
export interface SweepPlace {
  after: SweepCursor;
  until: string;
}

/** Where the sweep finds calls, and where it keeps its place. All four throw when they cannot read or write. */
export interface SweepCallSource {
  /** Live calls made at or before `createdBefore` (ISO time), oldest first after `after` (by made time, then id). */
  liveCalls(createdBefore: string, after: SweepCursor | null, limit: number): Promise<CallRecord[]>;
  /**
   * Ended calls with a step missing (they keep their saved state, have a learning event and no profile rebuild, or a
   * pending note), ended at or after `endedFrom` and last written at or before `writtenBefore`, oldest end first after
   * `after` (by end time, then id).
   */
  unfinishedCalls(endedFrom: string, writtenBefore: string, after: SweepCursor | null, limit: number): Promise<CallRecord[]>;
  /** Where the last run stopped in one kind's list: the next run starts after it. Null: at the oldest call. */
  readPlace(kind: SweepKind): Promise<SweepPlace | null>;
  /** Stores where the next run starts in one kind's list. */
  writePlace(kind: SweepKind, place: SweepPlace | null): Promise<void>;
}

/**
 * When a live call counts as abandoned (ms since 1970): its own end time plus SWEEP_GRACE_MS. A started voice call also
 * waits until no worker can still run it (VOICE_CALL_STALE_MS after its start, the call module's rule for ending one).
 */
export function abandonedAt(record: Pick<CallRecord, "createdAt" | "startedAt" | "live" | "mode">): number {
  const base = Date.parse(record.startedAt ?? record.createdAt);
  const limit = record.live ? limitsOf(record.live.text.session).endAtMs : 0;
  const due = base + limit + SWEEP_GRACE_MS;
  return record.mode === "voice" && record.startedAt !== null ? Math.max(due, base + VOICE_CALL_STALE_MS) : due;
}

/** An ended call has a step missing: its learning event (it keeps its state), its profile rebuild, or its note. */
export function unfinished(record: Pick<CallRecord, "status" | "live" | "learningEventId" | "profileRebuiltAt" | "notePending">): boolean {
  return record.status === "ended" && (record.live !== null || record.notePending !== null || (record.learningEventId !== null && record.profileRebuiltAt === null));
}

/**
 * The call seams for the sweep: each call keeps its own model id and prompt version, but the model refuses to answer,
 * so no paid Maya model call can happen, and there is no free-talk review.
 */
export function sweepSeams(seams: CallSeams): CallSeams {
  return {
    ...seams,
    model: (id) => {
      const m = seams.model(id);
      return m && {
        id: m.id,
        promptVersion: m.promptVersion,
        propose: async () => {
          throw new Error("the sweep never asks the model");
        },
      };
    },
    reviewer: () => null,
  };
}

export interface SweepResult {
  /** Calls found that need the sweep: abandoned live calls and unfinished ended ones. */
  due: number;
  /** Live calls this sweep ended. */
  ended: number;
  /** Unfinished ended calls this sweep sent "end" again. */
  retried: number;
  /** Calls another writer changed first (another sweep, or the child's own last request): left as they are. */
  conflicts: number;
  /** Calls that could not be ended or finished (an error); the next run tries again. */
  failed: number;
  /** Calls found but left for the next run: no new end starts after the deadline. */
  left: number;
  /** The time limit stopped the sweep while it waited. */
  cut: boolean;
}

export interface SweepOptions {
  calls: MayaCalls;
  source: SweepCallSource;
  clock(): number;
  /** No new end starts after this time (ms since 1970, on `clock`). */
  deadline?: number;
  /** The sweep stops waiting after this many milliseconds (real time). */
  timeLimitMs?: number;
  /** Counts what is due and ends nothing. */
  dry?: boolean;
  /** The most one read or write of the place may take (real time); default SWEEP_PLACE_MS. */
  placeTimeoutMs?: number;
}

const LATE = Symbol("late");

/** Ends abandoned live calls, then finishes unfinished ended ones, oldest first, one at a time. Never throws for one call. */
export async function sweepAbandonedCalls(o: SweepOptions): Promise<SweepResult> {
  const now = o.clock();
  const result: SweepResult = { due: 0, ended: 0, retried: 0, conflicts: 0, failed: 0, left: 0, cut: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeUp = o.timeLimitMs === undefined ? null : new Promise<typeof LATE>((resolve) => (timer = setTimeout(() => resolve(LATE), o.timeLimitMs)));
  const bounded = <T>(p: Promise<T>): Promise<T | typeof LATE> => (timeUp ? Promise.race([p, timeUp]) : p);

  /** Sends "end" to one call. False when the time limit stopped the wait. */
  async function end(record: CallRecord, kind: "ended" | "retried"): Promise<boolean> {
    try {
      const r = await bounded(o.calls.input(record.id, record.revision, { type: "end" }, null));
      if (r === LATE) return false;
      if (r.ok) result[kind]++;
      else if (r.error === "conflict") result.conflicts++;
      else {
        result.failed++;
        console.error("[maya sweep] call not ended", record.id, r.error);
      }
    } catch (e) {
      result.failed++;
      console.error("[maya sweep] call not ended", record.id, e instanceof Error ? e.message : String(e));
    }
    return true;
  }

  /** One read or write of the place, refused after its own time limit. */
  async function placeStep<T>(step: Promise<T>): Promise<T> {
    let wait: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => (wait = setTimeout(() => reject(new Error("no answer in time")), o.placeTimeoutMs ?? SWEEP_PLACE_MS)));
    try {
      return await Promise.race([step, late]);
    } finally {
      clearTimeout(wait);
    }
  }

  /**
   * Reads one kind of call page by page from its place and handles the due ones. `newest`: the newest time a read of
   * this kind gives now. False when the time limit stopped it.
   */
  async function pages(kind: SweepKind, newest: string, read: (after: SweepCursor | null) => Promise<CallRecord[]>, cursorOf: (r: CallRecord) => SweepCursor, isDue: (r: CallRecord) => boolean, counted: "ended" | "retried"): Promise<boolean> {
    let stored: SweepPlace | null = null;
    if (!o.dry) {
      try {
        stored = await placeStep(o.source.readPlace(kind));
      } catch (e) {
        console.error("[maya sweep] place not read", kind, e instanceof Error ? e.message : String(e));
      }
    }
    // A pass that starts at the oldest call covers the calls there are now.
    const until = stored?.until ?? newest;
    /** Stores where the next run starts (null: at the oldest call, a new pass). */
    const keep = async (after: SweepCursor | null): Promise<void> => {
      const place = after && { after, until };
      if (o.dry || (place?.after.at === stored?.after.at && place?.after.id === stored?.after.id && place?.until === stored?.until)) return;
      try {
        await placeStep(o.source.writePlace(kind, place));
        stored = place;
      } catch (e) {
        console.error("[maya sweep] place not stored", kind, e instanceof Error ? e.message : String(e));
      }
    };
    let after = stored?.after ?? null;
    let left = false;
    for (let page = 0; page < SWEEP_PAGES; page++) {
      const rows = await bounded(read(after));
      if (rows === LATE) return false;
      for (const record of rows) {
        // A call newer than the pass came since it began: the pass is over, and the next run starts a new one.
        if (!left && Date.parse(cursorOf(record).at) > Date.parse(until)) {
          await keep(null);
          return true;
        }
        if (!isDue(record)) continue;
        result.due++;
        if (o.dry) continue;
        if (o.deadline !== undefined && o.clock() >= o.deadline) {
          result.left++;
          left = true;
          continue;
        }
        // Stored before the end starts: an end that hangs or uses the whole run does not hold up the next run.
        await keep(cursorOf(record));
        if (!(await end(record, counted))) return false;
      }
      if (rows.length < SWEEP_BATCH) {
        // Calls were left for the next run: it starts after the last call this run started to end.
        if (!left) await keep(null);
        return true;
      }
      after = cursorOf(rows[rows.length - 1]);
    }
    if (!left) await keep(after);
    return true;
  }

  try {
    // No call can be abandoned before SWEEP_GRACE_MS after it was made, so older rows are the only candidates.
    const newest = new Date(now - SWEEP_GRACE_MS).toISOString();
    const live = await pages(
      "live",
      newest,
      (after) => o.source.liveCalls(newest, after, SWEEP_BATCH),
      (r) => ({ at: r.createdAt, id: r.id }),
      (r) => r.status === "live" && abandonedAt(r) <= now,
      "ended",
    );
    // Read after the live ends: a call this run ended was written just now, so it waits SWEEP_GRACE_MS like any other.
    // An unfinished call ended at or before it was last written, so its end time is at or before `newest` too.
    const finished = live && await pages(
      "unfinished",
      newest,
      (after) => o.source.unfinishedCalls(new Date(now - RETRY_WINDOW_MS).toISOString(), newest, after, SWEEP_BATCH),
      (r) => ({ at: r.endedAt ?? r.createdAt, id: r.id }),
      unfinished,
      "retried",
    );
    result.cut = !finished;
  } finally {
    clearTimeout(timer);
  }
  return result;
}
