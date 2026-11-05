import type { CallChange, CallConnection, CallRecord, CallStore, ConnectionLog } from "@/lib/maya-call";

// The call store of Maya's calls (src/lib/maya-call.ts, #323) in memory, for tests. It keeps the database's rules: an
// admin test call names a test family (the trigger of migration add_maya_calls), an update writes only at the revision
// it read and raises it by one, a live call always has its saved state, and only an ended call has a pending note. Records are JSON in the database, so the
// store keeps and gives copies.

interface MemoryCallStore extends CallStore {
  rows(): CallRecord[];
  appendConnection(event: CallConnection, revision: number, commit: () => void): boolean;
  /** Live calls made at or before `createdBefore`, oldest first (the sweep's source, src/lib/maya-call-sweep.ts). */
  liveCalls(createdBefore: string, limit: number): Promise<CallRecord[]>;
}

export function memoryCallStore(options: { testFamilies: readonly string[] }): MemoryCallStore {
  const rows = new Map<string, CallRecord>();
  const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  return {
    async insert(c) {
      if (rows.has(c.id)) throw new Error("maya call insert: duplicate id");
      if (c.kind === "admin_test" && !options.testFamilies.includes(c.parentId)) throw new Error("maya call insert: maya_call_not_test_family");
      if (c.status === "live" && !c.live) throw new Error("maya call insert: a live call needs its saved state");
      rows.set(c.id, copy(c));
    },
    async get(id) {
      const r = rows.get(id);
      return r ? copy(r) : null;
    },
    async update(id, revision, change: CallChange) {
      const r = rows.get(id);
      if (!r || r.revision !== revision) return false;
      const next = { ...r, ...copy(change), revision: revision + 1 };
      if (next.status === "live" && !next.live) throw new Error("maya call update: a live call needs its saved state");
      if (next.live && next.status === "ended" && next.learningEventId) throw new Error("maya call update: an ended call keeps its state only until its event is written");
      if (next.notePending && next.status !== "ended") throw new Error("maya call update: maya_calls_note_pending");
      rows.set(id, next);
      return true;
    },
    async pendingNotes(childId, limit) {
      return [...rows.values()]
        .filter((r) => r.childId === childId && r.status === "ended" && r.notePending !== null)
        .sort((a, b) => (a.endedAt ?? "").localeCompare(b.endedAt ?? ""))
        .slice(0, limit)
        .map(copy);
    },
    async clearNote(id) {
      const r = rows.get(id);
      if (!r || r.status !== "ended" || r.notePending === null) return false;
      rows.set(id, { ...r, notePending: null });
      return true;
    },
    appendConnection(event, revision, commit) {
      const r = rows.get(event.callId);
      if (!r || r.revision !== revision || r.mode !== "voice" || r.parentId !== event.parentId || r.childId !== event.childId) return false;
      // No await between ownership, insert and revision update: the database RPC is one transaction too.
      commit();
      rows.set(r.id, { ...r, revision: revision + 1 });
      return true;
    },
    async liveCalls(createdBefore, limit) {
      return [...rows.values()]
        .filter((r) => r.status === "live" && Date.parse(r.createdAt) <= Date.parse(createdBefore))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .slice(0, limit)
        .map(copy);
    },
    rows: () => [...rows.values()].map(copy),
  };
}

/** The connection events of voice calls in memory, append only, as public.maya_call_connections keeps them. */
export function memoryConnectionLog(store: MemoryCallStore, clock: () => number): ConnectionLog & { rows(): CallConnection[] } {
  const rows: CallConnection[] = [];
  return {
    async append(e, revision) {
      const at = Math.max(clock(), ...rows.filter((row) => row.callId === e.callId).map((row) => row.at));
      return store.appendConnection(e, revision, () => rows.push({ ...e, at })) ? at : null;
    },
    async read(callId) {
      return rows.filter((r) => r.callId === callId).map(({ kind, at }) => ({ kind, at })).sort((a, b) => a.at - b.at);
    },
    rows: () => rows.map((r) => ({ ...r })),
  };
}
