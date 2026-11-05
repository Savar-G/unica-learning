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
// No paid model: ending a call never asks Maya's model (the session's finish closes it without a turn), and the server
// sweep gives the call module a model that refuses to answer, no free-talk review, and code-only parent notes (the AI's
// warm sentence is optional, src/lib/maya-call-note.ts). The child profile rebuild runs as at every call end (its AI
// findings would otherwise be dropped, src/lib/child-profile.ts).
//
// Seams: the call module, the live-call source (Supabase: `liveCallSource` in src/lib/maya-call-store.ts; memory:
// memoryCallStore's `liveCalls`) and the clock. Pure otherwise.
import { limitsOf } from "@/lib/maya";
import type { CallRecord, CallSeams, MayaCalls } from "@/lib/maya-call";

/** How long after its own end time a live call counts as abandoned. */
export const SWEEP_GRACE_MS = 5 * 60_000;
/** The most calls one sweep reads. The oldest go first; the rest wait for the next run. */
export const SWEEP_BATCH = 20;

/** Where the sweep finds live calls. */
export interface LiveCallSource {
  /** Live calls made at or before `createdBefore` (ISO time), oldest first, at most `limit`. Throws when it cannot read. */
  liveCalls(createdBefore: string, limit: number): Promise<CallRecord[]>;
}

/** When a live call counts as abandoned (ms since 1970): its own end time plus SWEEP_GRACE_MS. */
export function abandonedAt(record: Pick<CallRecord, "createdAt" | "startedAt" | "live">): number {
  const base = Date.parse(record.startedAt ?? record.createdAt);
  const limit = record.live ? limitsOf(record.live.text.session).endAtMs : 0;
  return base + limit + SWEEP_GRACE_MS;
}

/**
 * The call seams for the sweep: each call keeps its own model id and prompt version, but the model refuses to answer,
 * so no paid model call can happen, and there is no free-talk review.
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
  /** Abandoned calls found. */
  due: number;
  /** Calls this sweep ended. */
  ended: number;
  /** Calls another writer changed first (another sweep, or the child's own last request): left as they are. */
  conflicts: number;
  /** Calls that could not be ended (an error); the next run tries again. */
  failed: number;
  /** Abandoned calls left for the next run: the time was up. */
  left: number;
}

export interface SweepOptions {
  calls: MayaCalls;
  source: LiveCallSource;
  clock(): number;
  /** Stops starting new ends after this time (ms since 1970). */
  deadline?: number;
  /** Counts what is due and ends nothing. */
  dry?: boolean;
}

/** Ends every abandoned live call, oldest first, one at a time. Never throws for one call; throws when it cannot read. */
export async function sweepAbandonedCalls(o: SweepOptions): Promise<SweepResult> {
  const now = o.clock();
  // No call can be abandoned before SWEEP_GRACE_MS after it was made, so older rows are the only candidates.
  const found = await o.source.liveCalls(new Date(now - SWEEP_GRACE_MS).toISOString(), SWEEP_BATCH);
  const due = found.filter((r) => r.status === "live" && abandonedAt(r) <= now);
  const result: SweepResult = { due: due.length, ended: 0, conflicts: 0, failed: 0, left: 0 };
  if (o.dry) return result;
  for (const record of due) {
    if (o.deadline !== undefined && o.clock() >= o.deadline) {
      result.left++;
      continue;
    }
    try {
      const r = await o.calls.input(record.id, record.revision, { type: "end" }, null);
      if (r.ok) result.ended++;
      else if (r.error === "conflict") result.conflicts++;
      else {
        result.failed++;
        console.error("[maya sweep] call not ended", record.id, r.error);
      }
    } catch (e) {
      result.failed++;
      console.error("[maya sweep] call not ended", record.id, e instanceof Error ? e.message : String(e));
    }
  }
  return result;
}
