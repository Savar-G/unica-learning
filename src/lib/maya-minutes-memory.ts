import { CALL_SECONDS, DEMO_DAILY_MINUTES, GRANT_CALL_WAIT_MS, WEEK_SECONDS, type GrantRequest, type MinutesKind, type MinutesStore } from "@/lib/maya-minutes";

// The minutes store (src/lib/maya-minutes.ts, #330) in memory, for tests. It keeps the database's rules (migration
// add_maya_minutes): a grant is atomic (no await inside, like the RPC's lock), one grant per call id, an open call
// counts its whole grant, an ended call counts its connected seconds up to the grant (the settle trigger), and a grant
// whose call was never made counts nothing after GRANT_CALL_WAIT_MS. A retry reserves an expired grant again. Call
// creation refuses an expired grant if its full seconds cannot be reserved again (migration fix_maya_minute_reservations).

interface Row {
  request: GrantRequest;
  seconds: number;
  at: number;
  used: number | null;
}

export interface MemoryMinutesStore extends MinutesStore {
  /** The call's row now exists (the call started). */
  callMade(callId: string): void;
  /** The call ended with these connected seconds (the settle trigger). */
  callEnded(callId: string, connectedSeconds: number): void;
  grants(): { callId: string; kind: MinutesKind; seconds: number; used: number | null }[];
}

export function memoryMinutesStore(options: { clock: () => number }): MemoryMinutesStore {
  const rows = new Map<string, Row>();
  const calls = new Set<string>();
  const same = (r: Row, q: { parentId: string; childId: string | null; kind: MinutesKind; periodStart: number }) =>
    r.request.parentId === q.parentId && r.request.childId === q.childId && r.request.kind === q.kind;
  const counted = (r: Row) =>
    r.used !== null ? r.used : calls.has(r.request.callId) || options.clock() - r.at < GRANT_CALL_WAIT_MS ? r.seconds : 0;
  const used = (q: { parentId: string; childId: string | null; kind: MinutesKind; periodStart: number }) =>
    [...rows.values()].filter((r) => same(r, q) && r.at >= q.periodStart).reduce((sum, r) => sum + counted(r), 0);
  const expired = (r: Row) => r.used === null && !calls.has(r.request.callId) && options.clock() - r.at >= GRANT_CALL_WAIT_MS;
  const cap = (r: GrantRequest) => Math.min(r.periodSeconds, r.kind === "child" ? WEEK_SECONDS : DEMO_DAILY_MINUTES * 60);
  function callMade(callId: string) {
    const r = rows.get(callId);
    if (r && expired(r)) {
      if (cap(r.request) - used(r.request) < r.seconds) throw new Error("maya_minute_grant_expired");
      r.at = options.clock();
    }
    calls.add(callId);
  }

  return {
    async grant(request) {
      if ((request.kind === "child") !== (request.childId !== null)) throw new Error("maya minutes: a child grant names its child, a demo none");
      const found = rows.get(request.callId);
      if (found) {
        if (!same(found, request)) throw new Error("maya minutes: maya_minute_grant_mismatch");
        if (!expired(found)) return { seconds: found.seconds, usedSeconds: used(request) - (found.at >= request.periodStart ? counted(found) : 0) };
      }
      const before = used(request) - (found && found.at >= request.periodStart ? counted(found) : 0);
      const seconds = Math.min(found?.seconds ?? CALL_SECONDS, request.callSeconds, Math.max(0, cap(request) - before));
      if (seconds < Math.max(request.minSeconds, found?.seconds ?? 0)) return { seconds: 0, usedSeconds: before };
      rows.set(request.callId, { request: { ...request }, seconds, at: options.clock(), used: null });
      return { seconds, usedSeconds: before };
    },
    async used(q) {
      return used(q);
    },
    callMade,
    callEnded(callId, connectedSeconds) {
      callMade(callId);
      const r = rows.get(callId);
      if (r) r.used = Math.min(r.seconds, Math.max(0, connectedSeconds));
    },
    grants: () => [...rows.values()].map((r) => ({ callId: r.request.callId, kind: r.request.kind, seconds: r.seconds, used: r.used })),
  };
}
