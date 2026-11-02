// Maya's minutes ledger (#330, spec #297): how many minutes a child may still talk with Maya this week, and how long
// one call may last.
//
// - A child has WEEK_SECONDS (30 minutes) a week. The week starts on Monday at 00:00 in the family's time zone
//   (the shared family-zone rule in src/lib/family-time.ts).
// - A call may last CALL_SECONDS (10 minutes), or the minutes left this week when fewer. Under MIN_CALL_SECONDS left, no
//   call starts. The grant's seconds are the call's time limit (`limitMs`, src/lib/maya/session.ts `limitsOf`): Maya
//   closes in the last minute and the audio ends at the limit.
// - A parent's "Try Maya" calls (#336) use a separate cap of 2 minutes per parent and local day, never the child's minutes.
// - Counted on the server: the grant is made before the call, under a lock per child (or per parent for a demo), in one
//   database transaction (`grant_maya_minutes`, migration add_maya_minutes), so two starts at once cannot both spend
//   the same minutes. A retry with the same call id gets the same grant again. While the call is open, its whole grant
//   counts. When the call ends, a trigger settles the grant at the call's connected seconds (the time the child and
//   Maya were both in the room, src/lib/maya-voice.ts `connectedSeconds`, which joins every reconnect of the one call),
//   at most the grant. A grant whose call was never made counts nothing after GRANT_CALL_WAIT_MS. An expired grant
//   must reserve seconds again, against the current remainder. Call creation checks this under the same lock.
//
// Seams: the store (Supabase: src/lib/maya-minutes-store.ts; memory: src/lib/maya-minutes-memory.ts) and the clock. Pure
// otherwise: no network, database or Next.js.

import { dayOf, weekOf, type FamilyZone, type Period } from "@/lib/family-time";
export { dayOf, weekOf, type Period } from "@/lib/family-time";

export const WEEK_SECONDS = 30 * 60;
export const CALL_SECONDS = 10 * 60;
/** Fewer seconds left than this: no call starts (a call needs time for its closing). */
export const MIN_CALL_SECONDS = 60;
/** The daily cap of a parent's "Try Maya" calls, in minutes (Savar's decision, 2026-11-01). */
export const DEMO_DAILY_MINUTES = 2;
/** A grant with no call row after this long was never used (the start failed): it counts nothing. */
export const GRANT_CALL_WAIT_MS = 2 * 60_000;
export type MinutesKind = "child" | "parent_demo";

// ---------- the ledger ----------

/** What the store needs to grant a call's seconds. */
export interface GrantRequest {
  callId: string;
  parentId: string;
  /** The child for a child's call; null for a parent's demo call. */
  childId: string | null;
  kind: MinutesKind;
  period: string;
  periodSeconds: number;
  callSeconds: number;
  minSeconds: number;
}

/** The store seam. Both calls throw when the store cannot answer. */
export interface MinutesStore {
  /**
   * Grants the call min(callSeconds, periodSeconds - used) seconds, or 0 (and stores nothing) when that is under
   * minSeconds. Atomic per child (per parent for a demo): two grants at once never both spend the same seconds. A call
   * that has an active grant gets it again. An expired grant must reserve seconds again against the current remainder.
   * `usedSeconds`: the period's seconds used before this grant.
   */
  grant(request: GrantRequest): Promise<{ seconds: number; usedSeconds: number }>;
  /** The period's seconds used: settled calls at their seconds, open calls at their whole grant. */
  used(query: { parentId: string; childId: string | null; kind: MinutesKind; period: string }): Promise<number>;
}

export type Grant =
  | { ok: true; seconds: number; limitMs: number; leftSeconds: number }
  | { ok: false; reason: "none_left"; leftSeconds: number; resetsAt: number };

export interface Usage {
  usedSeconds: number;
  leftSeconds: number;
  weekSeconds: number;
  /** When the minutes come back (ms since 1970). */
  resetsAt: number;
}

export interface MinutesLedger {
  /** The seconds a child's call may last. A retry keeps an active grant; an expired grant must reserve seconds again. */
  grantChild(input: { callId: string; parentId: string; childId: string; timeZone: FamilyZone }): Promise<Grant>;
  /** The seconds a parent's "Try Maya" call may last, from today's demo cap. Never the child's minutes. */
  grantDemo(input: { callId: string; parentId: string; timeZone: FamilyZone }): Promise<Grant>;
  /** The child's minutes used and left this week. */
  usage(input: { parentId: string; childId: string; timeZone: FamilyZone }): Promise<Usage>;
}

export function createMinutesLedger(seams: { store: MinutesStore; clock: () => number }): MinutesLedger {
  const { store, clock } = seams;
  const demoCap = DEMO_DAILY_MINUTES * 60;

  async function grant(base: Omit<GrantRequest, "period" | "periodSeconds" | "callSeconds" | "minSeconds">, period: Period, periodSeconds: number): Promise<Grant> {
    const r = await store.grant({ ...base, period: period.start, periodSeconds, callSeconds: CALL_SECONDS, minSeconds: MIN_CALL_SECONDS });
    const leftBefore = Math.max(0, periodSeconds - r.usedSeconds);
    if (r.seconds <= 0) return { ok: false, reason: "none_left", leftSeconds: leftBefore, resetsAt: period.resetsAt };
    return { ok: true, seconds: r.seconds, limitMs: r.seconds * 1000, leftSeconds: Math.max(0, leftBefore - r.seconds) };
  }

  return {
    grantChild: ({ callId, parentId, childId, timeZone }) =>
      grant({ callId, parentId, childId, kind: "child" }, weekOf(clock(), timeZone), WEEK_SECONDS),
    grantDemo: ({ callId, parentId, timeZone }) =>
      grant({ callId, parentId, childId: null, kind: "parent_demo" }, dayOf(clock(), timeZone), demoCap),
    async usage({ parentId, childId, timeZone }) {
      const week = weekOf(clock(), timeZone);
      const usedSeconds = Math.min(WEEK_SECONDS, await store.used({ parentId, childId, kind: "child", period: week.start }));
      return { usedSeconds, leftSeconds: WEEK_SECONDS - usedSeconds, weekSeconds: WEEK_SECONDS, resetsAt: week.resetsAt };
    },
  };
}

/** Seconds as whole minutes for a parent: used rounds up, left rounds down, so the two never promise more than there is. */
export function usageMinutes(u: Pick<Usage, "usedSeconds" | "leftSeconds">): { used: number; left: number } {
  return { used: Math.ceil(u.usedSeconds / 60), left: Math.floor(u.leftSeconds / 60) };
}
